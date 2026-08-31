// SPDX-License-Identifier: MPL-2.0
//! Independent full-readback acceptance harness for GLUBALL CUDA evidence.
//!
//! This binary never launches CUDA. It consumes a bounded CUDA evidence
//! artifact, independently recomputes GLUBALL-KNOT-V1 points through the Rust
//! runtime, and emits a separate acceptance record.

use gluball_runtime::{
    surface_point_indices, GeometryConfig, SimulationConfig, GEOMETRY_CONTRACT,
    RUNTIME_CONTRACT,
};
use std::env;
use std::fs::{self, File};
use std::io::{BufReader, Read};
use std::process::ExitCode;

const ACCEPTANCE_SCHEMA: &str = "GLUBALL-CUDA-ACCEPTANCE-V1";
const CUDA_SIDECAR_SCHEMA: &str = "GLUBALL-MULTI-DEVICE-CUDA-EVIDENCE-SIDECAR-V1";
const CUDA_CONTRACT: &str = "GLUBALL-MULTI-DEVICE-CUDA-V1";
const CUDA_ADAPTER_PROFILE: &str = "gluball-cuda-f32-v1";
const RESIDUAL_PROFILE: &str = "gluball-rust-vs-cuda-f32-full-v1";
const OUTPUT_FORMAT: &str = "GLUBALL-CUDA-F32LE-XYZR-V1";
const RECORD_BYTES: u64 = 16;
const COMPONENT_GATE: f64 = 5.0e-5;
const EUCLIDEAN_GATE: f64 = 8.660_254_037_844_386e-5;
const CUDA_RADIUS_GATE: f64 = 5.0e-5;
const FNV_OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
const FNV_PRIME: u64 = 0x0000_0100_0000_01b3;

#[derive(Debug)]
struct Options {
    input: String,
    cuda_sidecar: String,
    u: u32,
    v: u32,
    repeats: u32,
    repeat_run: u32,
}

#[derive(Debug)]
struct AcceptanceSummary {
    total_points: u64,
    checked_points: u64,
    nonfinite_records: u64,
    max_component_residual: f64,
    max_euclidean_residual: f64,
    max_reported_tube_radius_error: f64,
    worst_linear_index: u64,
    artifact_fnv1a64: u64,
    sidecar_fnv1a64: u64,
    conformance_acceptance: bool,
}

fn value_after<'a>(args: &'a [String], flag: &str) -> Option<&'a str> {
    args.windows(2)
        .find(|pair| pair[0] == flag)
        .map(|pair| pair[1].as_str())
}

fn parse_u32(args: &[String], flag: &str, default: Option<u32>) -> Result<u32, String> {
    match value_after(args, flag) {
        Some(value) => value
            .parse::<u32>()
            .map_err(|_| format!("{flag} must be an unsigned 32-bit integer")),
        None => default.ok_or_else(|| format!("missing required {flag}")),
    }
}

fn parse_options() -> Result<Options, String> {
    let args: Vec<String> = env::args().collect();
    if args.iter().any(|arg| arg == "--help" || arg == "-h") {
        println!(
            "gluball-cuda-accept\n\n\
             --input PATH          ordered CUDA f32le XYZR evidence artifact\n\
             --cuda-sidecar PATH   exact CUDA sidecar produced with the artifact\n\
             --u N                 u segments\n\
             --v N                 v segments\n\
             --repeats N           full mesh repeats\n\
             --repeat-run N        campaign run ordinal"
        );
        std::process::exit(0);
    }
    let input = value_after(&args, "--input")
        .ok_or_else(|| "missing required --input".to_string())?
        .to_string();
    let cuda_sidecar = value_after(&args, "--cuda-sidecar")
        .ok_or_else(|| "missing required --cuda-sidecar".to_string())?
        .to_string();
    let u = parse_u32(&args, "--u", None)?;
    let v = parse_u32(&args, "--v", None)?;
    let repeats = parse_u32(&args, "--repeats", None)?;
    let repeat_run = parse_u32(&args, "--repeat-run", Some(0))?;
    SimulationConfig::new(u, v, repeats, 1, 1).map_err(|error| error.to_string())?;
    Ok(Options {
        input,
        cuda_sidecar,
        u,
        v,
        repeats,
        repeat_run,
    })
}

fn fnv_update(mut state: u64, bytes: &[u8]) -> u64 {
    for byte in bytes {
        state ^= u64::from(*byte);
        state = state.wrapping_mul(FNV_PRIME);
    }
    state
}

fn require_sidecar_claims(sidecar: &str, options: &Options, total_points: u64) -> Result<(), String> {
    let required = [
        format!("\"schema\": \"{CUDA_SIDECAR_SCHEMA}\""),
        format!("\"contract\": \"{CUDA_CONTRACT}\""),
        format!("\"geometry_contract\": \"{GEOMETRY_CONTRACT}\""),
        format!("\"host_runtime_contract\": \"{RUNTIME_CONTRACT}\""),
        format!("\"floating_point_adapter_profile\": \"{CUDA_ADAPTER_PROFILE}\""),
        format!("\"evidence_output_format\": \"{OUTPUT_FORMAT}\""),
        "\"actual_cuda_execution\": true".to_string(),
        "\"complete_output_readback\": true".to_string(),
        "\"local_invariant_acceptance\": true".to_string(),
        format!("\"u_segments\": {}", options.u),
        format!("\"v_segments\": {}", options.v),
        format!("\"repeats\": {}", options.repeats),
        format!("\"total_points\": {total_points}"),
        format!("\"repeat_run\": {}", options.repeat_run),
    ];
    for fragment in required {
        if !sidecar.contains(&fragment) {
            return Err(format!("CUDA sidecar is missing required bound claim: {fragment}"));
        }
    }
    Ok(())
}

fn decode_f32_le(bytes: &[u8]) -> f64 {
    f32::from_bits(u32::from_le_bytes(bytes.try_into().expect("four-byte slice"))) as f64
}

fn accept_artifact(options: &Options) -> Result<AcceptanceSummary, String> {
    let sim = SimulationConfig::new(options.u, options.v, options.repeats, 1, 1)
        .map_err(|error| error.to_string())?;
    let total_points = sim.total_points().map_err(|error| error.to_string())?;
    let expected_bytes = total_points
        .checked_mul(RECORD_BYTES)
        .ok_or_else(|| "evidence artifact byte count overflow".to_string())?;
    let metadata = fs::metadata(&options.input)
        .map_err(|error| format!("cannot stat CUDA evidence artifact: {error}"))?;
    if metadata.len() != expected_bytes {
        return Err(format!(
            "CUDA evidence artifact length mismatch: expected {expected_bytes} bytes, observed {}",
            metadata.len()
        ));
    }

    let sidecar = fs::read_to_string(&options.cuda_sidecar)
        .map_err(|error| format!("cannot read CUDA sidecar: {error}"))?;
    require_sidecar_claims(&sidecar, options, total_points)?;
    let sidecar_fnv1a64 = fnv_update(FNV_OFFSET, sidecar.as_bytes());

    let file = File::open(&options.input)
        .map_err(|error| format!("cannot open CUDA evidence artifact: {error}"))?;
    let mut reader = BufReader::new(file);
    let mut record = [0_u8; RECORD_BYTES as usize];
    let mut artifact_fnv1a64 = FNV_OFFSET;
    let mut checked_points = 0_u64;
    let mut nonfinite_records = 0_u64;
    let mut max_component_residual = 0.0_f64;
    let mut max_euclidean_residual = 0.0_f64;
    let mut max_reported_tube_radius_error = 0.0_f64;
    let mut worst_linear_index = 0_u64;
    let per_repeat = u64::from(options.u) * u64::from(options.v);
    let geometry = GeometryConfig::canonical();

    for linear in 0..total_points {
        reader
            .read_exact(&mut record)
            .map_err(|error| format!("short CUDA evidence artifact at record {linear}: {error}"))?;
        artifact_fnv1a64 = fnv_update(artifact_fnv1a64, &record);
        let x = decode_f32_le(&record[0..4]);
        let y = decode_f32_le(&record[4..8]);
        let z = decode_f32_le(&record[8..12]);
        let reported_radius_error = decode_f32_le(&record[12..16]);
        if !x.is_finite()
            || !y.is_finite()
            || !z.is_finite()
            || !reported_radius_error.is_finite()
        {
            nonfinite_records += 1;
            checked_points += 1;
            continue;
        }

        let point_index = linear % per_repeat;
        let u = (point_index / u64::from(options.v)) as u32;
        let v = (point_index % u64::from(options.v)) as u32;
        let reference = surface_point_indices(u, options.u, v, options.v, geometry)
            .map_err(|error| format!("Rust reference failed at record {linear}: {error}"))?;
        let dx = (x - reference.x).abs();
        let dy = (y - reference.y).abs();
        let dz = (z - reference.z).abs();
        let component = dx.max(dy).max(dz);
        let euclidean = (dx * dx + dy * dy + dz * dz).sqrt();
        if euclidean > max_euclidean_residual {
            max_euclidean_residual = euclidean;
            worst_linear_index = linear;
        }
        max_component_residual = max_component_residual.max(component);
        max_reported_tube_radius_error =
            max_reported_tube_radius_error.max(reported_radius_error.abs());
        checked_points += 1;
    }

    let conformance_acceptance = checked_points == total_points
        && nonfinite_records == 0
        && max_component_residual <= COMPONENT_GATE
        && max_euclidean_residual <= EUCLIDEAN_GATE
        && max_reported_tube_radius_error <= CUDA_RADIUS_GATE;

    Ok(AcceptanceSummary {
        total_points,
        checked_points,
        nonfinite_records,
        max_component_residual,
        max_euclidean_residual,
        max_reported_tube_radius_error,
        worst_linear_index,
        artifact_fnv1a64,
        sidecar_fnv1a64,
        conformance_acceptance,
    })
}

fn json_escape(input: &str) -> String {
    let mut output = String::with_capacity(input.len());
    for character in input.chars() {
        match character {
            '"' => output.push_str("\\\""),
            '\\' => output.push_str("\\\\"),
            '\n' => output.push_str("\\n"),
            '\r' => output.push_str("\\r"),
            '\t' => output.push_str("\\t"),
            value if value.is_control() => output.push('?'),
            value => output.push(value),
        }
    }
    output
}

fn emit(options: &Options, summary: &AcceptanceSummary) {
    println!("{{");
    println!("  \"schema\": \"{ACCEPTANCE_SCHEMA}\",");
    println!("  \"contract\": \"{CUDA_CONTRACT}\",");
    println!("  \"geometry_contract\": \"{GEOMETRY_CONTRACT}\",");
    println!("  \"reference_runtime_contract\": \"{RUNTIME_CONTRACT}\",");
    println!("  \"floating_point_adapter_profile\": \"{CUDA_ADAPTER_PROFILE}\",");
    println!("  \"residual_profile\": \"{RESIDUAL_PROFILE}\",");
    println!("  \"evidence_output_format\": \"{OUTPUT_FORMAT}\",");
    println!("  \"cuda_sidecar_path\": \"{}\",", json_escape(&options.cuda_sidecar));
    println!("  \"evidence_output_path\": \"{}\",", json_escape(&options.input));
    println!("  \"repeat_run\": {},", options.repeat_run);
    println!("  \"u_segments\": {},", options.u);
    println!("  \"v_segments\": {},", options.v);
    println!("  \"repeats\": {},", options.repeats);
    println!("  \"total_points\": {},", summary.total_points);
    println!("  \"checked_points\": {},", summary.checked_points);
    println!("  \"complete_output_readback\": true,");
    println!("  \"sidecar_claims_checked\": true,");
    println!("  \"reference_residual_checked\": true,");
    println!("  \"nonfinite_records\": {},", summary.nonfinite_records);
    println!("  \"max_component_residual\": {:.17e},", summary.max_component_residual);
    println!("  \"component_residual_gate\": {:.17e},", COMPONENT_GATE);
    println!("  \"max_euclidean_residual\": {:.17e},", summary.max_euclidean_residual);
    println!("  \"euclidean_residual_gate\": {:.17e},", EUCLIDEAN_GATE);
    println!("  \"max_reported_tube_radius_error\": {:.17e},", summary.max_reported_tube_radius_error);
    println!("  \"reported_tube_radius_gate\": {:.17e},", CUDA_RADIUS_GATE);
    println!("  \"worst_linear_index\": {},", summary.worst_linear_index);
    println!("  \"evidence_artifact_fnv1a64\": \"{:016x}\",", summary.artifact_fnv1a64);
    println!("  \"cuda_sidecar_fnv1a64\": \"{:016x}\",", summary.sidecar_fnv1a64);
    println!(
        "  \"conformance_acceptance\": {},",
        if summary.conformance_acceptance { "true" } else { "false" }
    );
    println!("  \"geometry_receipt_authority\": false,");
    println!("  \"universal_speedup_claim\": false,");
    println!(
        "  \"status\": \"{}\"",
        if summary.conformance_acceptance { "PASS" } else { "FAIL" }
    );
    println!("}}");
}

fn main() -> ExitCode {
    let options = match parse_options() {
        Ok(options) => options,
        Err(error) => {
            eprintln!("gluball-cuda-accept: {error}");
            return ExitCode::from(2);
        }
    };
    match accept_artifact(&options) {
        Ok(summary) => {
            emit(&options, &summary);
            if summary.conformance_acceptance {
                ExitCode::SUCCESS
            } else {
                ExitCode::from(3)
            }
        }
        Err(error) => {
            eprintln!("gluball-cuda-accept: {error}");
            ExitCode::from(2)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_path(label: &str) -> String {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        env::temp_dir()
            .join(format!("gluball-{label}-{}-{nonce}", std::process::id()))
            .to_string_lossy()
            .into_owned()
    }

    #[test]
    fn accepts_full_rust_generated_f32_reference() {
        let u = 12_u32;
        let v = 6_u32;
        let repeats = 1_u32;
        let total_points = u64::from(u) * u64::from(v);
        let artifact = temp_path("cuda-evidence.f32le");
        let sidecar = temp_path("cuda-sidecar.json");
        let mut output = File::create(&artifact).unwrap();
        let geometry = GeometryConfig::canonical();
        for linear in 0..total_points {
            let point_index = linear % total_points;
            let ui = (point_index / u64::from(v)) as u32;
            let vi = (point_index % u64::from(v)) as u32;
            let point = surface_point_indices(ui, u, vi, v, geometry).unwrap();
            for value in [point.x as f32, point.y as f32, point.z as f32, 0.0_f32] {
                output.write_all(&value.to_bits().to_le_bytes()).unwrap();
            }
        }
        drop(output);
        fs::write(
            &sidecar,
            format!(
                "{{\n  \"schema\": \"{CUDA_SIDECAR_SCHEMA}\",\n  \"contract\": \"{CUDA_CONTRACT}\",\n  \"geometry_contract\": \"{GEOMETRY_CONTRACT}\",\n  \"host_runtime_contract\": \"{RUNTIME_CONTRACT}\",\n  \"floating_point_adapter_profile\": \"{CUDA_ADAPTER_PROFILE}\",\n  \"evidence_output_format\": \"{OUTPUT_FORMAT}\",\n  \"actual_cuda_execution\": true,\n  \"complete_output_readback\": true,\n  \"local_invariant_acceptance\": true,\n  \"u_segments\": {u},\n  \"v_segments\": {v},\n  \"repeats\": {repeats},\n  \"total_points\": {total_points},\n  \"repeat_run\": 1\n}}\n"
            ),
        )
        .unwrap();
        let options = Options {
            input: artifact.clone(),
            cuda_sidecar: sidecar.clone(),
            u,
            v,
            repeats,
            repeat_run: 1,
        };
        let summary = accept_artifact(&options).unwrap();
        assert_eq!(summary.checked_points, total_points);
        assert_eq!(summary.nonfinite_records, 0);
        assert!(summary.conformance_acceptance);
        let _ = fs::remove_file(artifact);
        let _ = fs::remove_file(sidecar);
    }
}
