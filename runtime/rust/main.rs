// SPDX-License-Identifier: MPL-2.0

use gluball_runtime::{
    partition_ranges, simulate, GeometryConfig, SamplingConfig, SamplingPolicy, SimulationConfig,
    GEOMETRY_CONTRACT, RUNTIME_CONTRACT, SAMPLING_CONTRACT, VERSION,
};
use std::env;
use std::process::ExitCode;

fn usage() {
    eprintln!(
        "gluball-runtime {VERSION}\n\
         \n\
         Commands:\n\
           self-test\n\
           sample --logical N --rendered N --index N [--policy uniform-floor|phi-weyl-64]\n\
           plan --points N [--workers N] [--device-slots N]\n\
           simulate [--u N] [--v N] [--repeats N] [--workers N] [--device-slots N]\n\
         \n\
         Notes:\n\
           * integer counts and indices are exact;\n\
           * geometry floats are finite and bounded before use;\n\
           * device-slots are logical scheduling slots only in v0.1.0;\n\
           * this runtime does not claim CUDA execution or geometry receipt authority."
    );
}

fn value_after<'a>(args: &'a [String], flag: &str) -> Option<&'a str> {
    args.windows(2)
        .find(|pair| pair[0] == flag)
        .map(|pair| pair[1].as_str())
}

fn parse_u64(args: &[String], flag: &str, default: Option<u64>) -> Result<u64, String> {
    match value_after(args, flag) {
        Some(value) => value
            .parse::<u64>()
            .map_err(|_| format!("{flag} must be an unsigned integer")),
        None => default.ok_or_else(|| format!("missing required {flag}")),
    }
}

fn parse_u32(args: &[String], flag: &str, default: Option<u32>) -> Result<u32, String> {
    let value = parse_u64(args, flag, default.map(u64::from))?;
    u32::try_from(value).map_err(|_| format!("{flag} is outside u32 range"))
}

fn parse_usize(args: &[String], flag: &str, default: Option<usize>) -> Result<usize, String> {
    let value = parse_u64(args, flag, default.map(|v| v as u64))?;
    usize::try_from(value).map_err(|_| format!("{flag} is outside usize range"))
}

fn default_workers() -> usize {
    std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1)
        .min(32)
}

fn self_test() -> Result<(), String> {
    let uniform = SamplingConfig::new(1_u64 << 24, 96, SamplingPolicy::UniformFloor)
        .map_err(|e| e.to_string())?;
    let uniform_expected = [
        (0, 0),
        (1, 174_762),
        (2, 349_525),
        (31, 5_417_642),
        (32, 5_592_405),
        (47, 8_213_845),
        (48, 8_388_608),
        (63, 11_010_048),
        (94, 16_427_690),
        (95, 16_602_453),
    ];
    for (rendered, expected) in uniform_expected {
        let observed = uniform.logical_index(rendered).map_err(|e| e.to_string())?;
        if observed != expected {
            return Err(format!(
                "uniform vector mismatch at {rendered}: expected {expected}, observed {observed}"
            ));
        }
    }

    let phi = SamplingConfig::new(1_u64 << 24, 96, SamplingPolicy::PhiWeyl64)
        .map_err(|e| e.to_string())?;
    let phi_expected = [
        (0, 0),
        (1, 10_368_889),
        (2, 3_960_563),
        (31, 2_668_477),
        (32, 13_037_367),
        (47, 798_553),
        (48, 11_167_442),
        (63, 15_705_844),
        (94, 1_597_106),
        (95, 11_965_995),
    ];
    for (rendered, expected) in phi_expected {
        let observed = phi.logical_index(rendered).map_err(|e| e.to_string())?;
        if observed != expected {
            return Err(format!(
                "phi vector mismatch at {rendered}: expected {expected}, observed {observed}"
            ));
        }
    }

    GeometryConfig::canonical();
    println!(
        "{{\"status\":\"PASS\",\"runtimeContract\":\"{RUNTIME_CONTRACT}\",\"geometryContract\":\"{GEOMETRY_CONTRACT}\",\"samplingContract\":\"{SAMPLING_CONTRACT}\",\"runtimeVersion\":\"{VERSION}\"}}"
    );
    Ok(())
}

fn sample(args: &[String]) -> Result<(), String> {
    let logical = parse_u64(args, "--logical", None)?;
    let rendered = parse_u32(args, "--rendered", None)?;
    let index = parse_u32(args, "--index", None)?;
    let policy = SamplingPolicy::parse(value_after(args, "--policy").unwrap_or("uniform-floor"))
        .map_err(|e| e.to_string())?;
    let config = SamplingConfig::new(logical, rendered, policy).map_err(|e| e.to_string())?;
    let logical_index = config.logical_index(index).map_err(|e| e.to_string())?;
    println!(
        "{{\"samplingContract\":\"{SAMPLING_CONTRACT}\",\"policy\":\"{}\",\"logicalCount\":\"{}\",\"renderedCount\":{},\"renderedIndex\":{},\"logicalIndex\":\"{}\"}}",
        policy.as_str(), logical, rendered, index, logical_index
    );
    Ok(())
}

fn plan(args: &[String]) -> Result<(), String> {
    let points = parse_u64(args, "--points", None)?;
    let workers = parse_usize(args, "--workers", Some(default_workers()))?;
    let device_slots = parse_usize(args, "--device-slots", Some(1))?;
    if device_slots == 0 || device_slots > gluball_runtime::MAX_DEVICE_SLOTS {
        return Err(format!(
            "--device-slots must be in [1,{}]",
            gluball_runtime::MAX_DEVICE_SLOTS
        ));
    }
    let ranges = partition_ranges(points, workers).map_err(|e| e.to_string())?;
    print!(
        "{{\"runtimeContract\":\"{RUNTIME_CONTRACT}\",\"points\":{},\"workers\":{},\"logicalDeviceSlots\":{},\"actualCudaExecution\":false,\"ranges\":[",
        points,
        ranges.len(),
        device_slots
    );
    for (idx, range) in ranges.iter().enumerate() {
        if idx > 0 {
            print!(",");
        }
        print!(
            "{{\"worker\":{},\"deviceSlot\":{},\"start\":{},\"end\":{},\"length\":{}}}",
            range.worker,
            range.worker % device_slots,
            range.start,
            range.end,
            range.length
        );
    }
    println!("]}}");
    Ok(())
}

fn simulate_command(args: &[String]) -> Result<(), String> {
    let u = parse_u32(args, "--u", Some(4096))?;
    let v = parse_u32(args, "--v", Some(64))?;
    let repeats = parse_u32(args, "--repeats", Some(1))?;
    let workers = parse_usize(args, "--workers", Some(default_workers()))?;
    let device_slots = parse_usize(args, "--device-slots", Some(1))?;
    let sim = SimulationConfig::new(u, v, repeats, workers, device_slots)
        .map_err(|e| e.to_string())?;
    let summary = simulate(sim, GeometryConfig::canonical()).map_err(|e| e.to_string())?;

    print!(
        "{{\"runtimeContract\":\"{}\",\"runtimeVersion\":\"{}\",\"geometryContract\":\"{}\",\"totalPoints\":{},\"workers\":{},\"logicalDeviceSlots\":{},\"maxTubeRadiusError\":{:.17e},\"diagnosticHashFNV1a64\":\"{:016x}\",\"actualCudaExecution\":{},\"actualMultiDeviceExecution\":{},\"distributedExecution\":{},\"universalSpeedupClaim\":{},\"geometryReceiptAuthority\":{},\"workerSummaries\":[",
        summary.runtime_contract,
        summary.runtime_version,
        summary.geometry_contract,
        summary.total_points,
        summary.workers,
        summary.logical_device_slots,
        summary.max_tube_radius_error,
        summary.diagnostic_hash_fnv1a64,
        summary.actual_cuda_execution,
        summary.actual_multi_device_execution,
        summary.distributed_execution,
        summary.universal_speedup_claim,
        summary.geometry_receipt_authority
    );
    for (idx, worker) in summary.worker_summaries.iter().enumerate() {
        if idx > 0 {
            print!(",");
        }
        print!(
            "{{\"worker\":{},\"deviceSlot\":{},\"start\":{},\"end\":{},\"points\":{},\"maxTubeRadiusError\":{:.17e},\"diagnosticHashFNV1a64\":\"{:016x}\"}}",
            worker.worker,
            worker.logical_device_slot,
            worker.start,
            worker.end,
            worker.points,
            worker.max_tube_radius_error,
            worker.diagnostic_hash_fnv1a64
        );
    }
    println!("]}}");
    Ok(())
}

fn run() -> Result<(), String> {
    let args: Vec<String> = env::args().collect();
    let Some(command) = args.get(1).map(String::as_str) else {
        usage();
        return Ok(());
    };
    match command {
        "self-test" => self_test(),
        "sample" => sample(&args[2..]),
        "plan" => plan(&args[2..]),
        "simulate" => simulate_command(&args[2..]),
        "help" | "--help" | "-h" => {
            usage();
            Ok(())
        }
        other => Err(format!("unknown command: {other}")),
    }
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("gluball-runtime: {error}");
            ExitCode::from(2)
        }
    }
}
