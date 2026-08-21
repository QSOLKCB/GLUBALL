// SPDX-License-Identifier: MPL-2.0
//! GLUBALL Rust execution runtime.
//!
//! The frozen `GLUBALL-KNOT-V1` geometry remains authoritative. This crate is an
//! additive execution implementation designed for bounded CPU work today and a
//! later CUDA residual adapter. It deliberately keeps exact index arithmetic in
//! integers and admits floating point only through checked, bounded values.

use std::fmt;
use std::thread;

pub const VERSION: &str = "0.1.0";
pub const RUNTIME_CONTRACT: &str = "GLUBALL-RUST-RUNTIME-V1";
pub const GEOMETRY_CONTRACT: &str = "GLUBALL-KNOT-V1";
pub const SAMPLING_CONTRACT: &str = "GLUBALL-SAMPLING-V1";
pub const TAU: f64 = std::f64::consts::TAU;
pub const P: f64 = 2.0;
pub const Q: f64 = 3.0;
pub const MAX_ABS_GEOMETRY_VALUE: f64 = 1_000_000.0;
pub const MAX_RENDERED_COUNT: u32 = 1_000_000;
pub const MAX_WORKERS: usize = 256;
pub const MAX_DEVICE_SLOTS: usize = 64;
const PHI64: u64 = 0x9e37_79b9_7f4a_7c15;
const FNV_OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
const FNV_PRIME: u64 = 0x0000_0100_0000_01b3;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeError(pub String);

impl fmt::Display for RuntimeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for RuntimeError {}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct BoundedF64(f64);

impl BoundedF64 {
    pub fn new(value: f64, label: &str) -> Result<Self, RuntimeError> {
        if !value.is_finite() {
            return Err(RuntimeError(format!("{label} must be finite")));
        }
        if value.abs() > MAX_ABS_GEOMETRY_VALUE {
            return Err(RuntimeError(format!(
                "{label} exceeds bounded runtime magnitude {MAX_ABS_GEOMETRY_VALUE}"
            )));
        }
        Ok(Self(value))
    }

    pub fn get(self) -> f64 {
        self.0
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct GeometryConfig {
    major_radius: BoundedF64,
    minor_radius: BoundedF64,
    tube_radius: BoundedF64,
}

impl GeometryConfig {
    pub fn new(major_radius: f64, minor_radius: f64, tube_radius: f64) -> Result<Self, RuntimeError> {
        let major_radius = BoundedF64::new(major_radius, "major_radius")?;
        let minor_radius = BoundedF64::new(minor_radius, "minor_radius")?;
        let tube_radius = BoundedF64::new(tube_radius, "tube_radius")?;
        if !(major_radius.get() > minor_radius.get() && minor_radius.get() > 0.0) {
            return Err(RuntimeError(
                "require major_radius > minor_radius > 0".to_string(),
            ));
        }
        if !(tube_radius.get() > 0.0 && tube_radius.get() < minor_radius.get()) {
            return Err(RuntimeError(
                "require 0 < tube_radius < minor_radius".to_string(),
            ));
        }
        Ok(Self {
            major_radius,
            minor_radius,
            tube_radius,
        })
    }

    pub fn canonical() -> Self {
        Self::new(2.10, 0.85, 0.34).expect("canonical GLUBALL parameters are valid")
    }

    pub fn major_radius(self) -> f64 {
        self.major_radius.get()
    }

    pub fn minor_radius(self) -> f64 {
        self.minor_radius.get()
    }

    pub fn tube_radius(self) -> f64 {
        self.tube_radius.get()
    }
}

impl Default for GeometryConfig {
    fn default() -> Self {
        Self::canonical()
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Vec3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}

impl Vec3 {
    pub fn add(self, other: Self) -> Self {
        Self {
            x: self.x + other.x,
            y: self.y + other.y,
            z: self.z + other.z,
        }
    }

    pub fn sub(self, other: Self) -> Self {
        Self {
            x: self.x - other.x,
            y: self.y - other.y,
            z: self.z - other.z,
        }
    }

    pub fn scale(self, scalar: f64) -> Self {
        Self {
            x: self.x * scalar,
            y: self.y * scalar,
            z: self.z * scalar,
        }
    }

    pub fn dot(self, other: Self) -> f64 {
        self.x * other.x + self.y * other.y + self.z * other.z
    }

    pub fn cross(self, other: Self) -> Self {
        Self {
            x: self.y * other.z - self.z * other.y,
            y: self.z * other.x - self.x * other.z,
            z: self.x * other.y - self.y * other.x,
        }
    }

    pub fn norm(self) -> f64 {
        (self.x * self.x + self.y * self.y + self.z * self.z).sqrt()
    }

    pub fn normalize(self) -> Result<Self, RuntimeError> {
        let norm = self.norm();
        if !(norm.is_finite() && norm > 0.0) {
            return Err(RuntimeError("cannot normalize zero/non-finite vector".to_string()));
        }
        Ok(self.scale(1.0 / norm))
    }
}

fn angle_from_index(index: u64, count: u64) -> Result<f64, RuntimeError> {
    if count == 0 || index >= count {
        return Err(RuntimeError(format!(
            "index {index} outside bounded angle domain [0,{count})"
        )));
    }
    // Integer numerator/denominator is retained until the transcendental boundary.
    // The resulting angle is always in [0, 2π), avoiding unbounded user float input.
    Ok(TAU * (index as f64) / (count as f64))
}

pub fn centerline(t: f64, config: GeometryConfig) -> Result<Vec3, RuntimeError> {
    let t = BoundedF64::new(t, "t")?.get();
    let major = P * t;
    let minor = Q * t;
    let radial = config.major_radius() + config.minor_radius() * minor.cos();
    Ok(Vec3 {
        x: radial * major.cos(),
        y: radial * major.sin(),
        z: config.minor_radius() * minor.sin(),
    })
}

pub fn centerline_derivative(t: f64, config: GeometryConfig) -> Result<Vec3, RuntimeError> {
    let t = BoundedF64::new(t, "t")?.get();
    let major = P * t;
    let minor = Q * t;
    let radial = config.major_radius() + config.minor_radius() * minor.cos();
    let radial_prime = -config.minor_radius() * Q * minor.sin();
    Ok(Vec3 {
        x: radial_prime * major.cos() - P * radial * major.sin(),
        y: radial_prime * major.sin() + P * radial * major.cos(),
        z: config.minor_radius() * Q * minor.cos(),
    })
}

pub fn torus_normal(t: f64) -> Result<Vec3, RuntimeError> {
    let t = BoundedF64::new(t, "t")?.get();
    let major = P * t;
    let minor = Q * t;
    Ok(Vec3 {
        x: minor.cos() * major.cos(),
        y: minor.cos() * major.sin(),
        z: minor.sin(),
    })
}

pub fn frame(t: f64, config: GeometryConfig) -> Result<(Vec3, Vec3, Vec3), RuntimeError> {
    let tangent = centerline_derivative(t, config)?.normalize()?;
    let normal = torus_normal(t)?;
    let binormal = tangent.cross(normal).normalize()?;
    Ok((tangent, normal, binormal))
}

pub fn surface_point(t: f64, v: f64, config: GeometryConfig) -> Result<Vec3, RuntimeError> {
    let t = BoundedF64::new(t, "t")?.get();
    let v = BoundedF64::new(v, "v")?.get();
    let centre = centerline(t, config)?;
    let (_, normal, binormal) = frame(t, config)?;
    Ok(centre
        .add(normal.scale(v.cos() * config.tube_radius()))
        .add(binormal.scale(v.sin() * config.tube_radius())))
}

pub fn surface_point_from_indices(
    u_index: u64,
    u_count: u64,
    v_index: u64,
    v_count: u64,
    config: GeometryConfig,
) -> Result<Vec3, RuntimeError> {
    let t = angle_from_index(u_index, u_count)?;
    let v = angle_from_index(v_index, v_count)?;
    surface_point(t, v, config)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SamplingPolicy {
    UniformFloor,
    PhiWeyl64,
}

impl SamplingPolicy {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::UniformFloor => "uniform-floor",
            Self::PhiWeyl64 => "phi-weyl-64",
        }
    }

    pub fn parse(value: &str) -> Result<Self, RuntimeError> {
        match value {
            "uniform-floor" => Ok(Self::UniformFloor),
            "phi-weyl-64" => Ok(Self::PhiWeyl64),
            other => Err(RuntimeError(format!("unknown sampling policy: {other}"))),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SamplingConfig {
    pub logical_count: u64,
    pub rendered_count: u32,
    pub policy: SamplingPolicy,
}

impl SamplingConfig {
    pub fn new(
        logical_count: u64,
        rendered_count: u32,
        policy: SamplingPolicy,
    ) -> Result<Self, RuntimeError> {
        if logical_count == 0 {
            return Err(RuntimeError("logical_count must be greater than zero".to_string()));
        }
        if rendered_count == 0 || rendered_count > MAX_RENDERED_COUNT {
            return Err(RuntimeError(format!(
                "rendered_count must be in [1,{MAX_RENDERED_COUNT}]"
            )));
        }
        if u64::from(rendered_count) > logical_count {
            return Err(RuntimeError(
                "rendered_count may not exceed logical_count".to_string(),
            ));
        }
        Ok(Self {
            logical_count,
            rendered_count,
            policy,
        })
    }

    pub fn logical_index(self, rendered_index: u32) -> Result<u64, RuntimeError> {
        if rendered_index >= self.rendered_count {
            return Err(RuntimeError(format!(
                "rendered index {rendered_index} outside [0,{})",
                self.rendered_count
            )));
        }
        match self.policy {
            SamplingPolicy::UniformFloor => {
                let numerator = u128::from(rendered_index) * u128::from(self.logical_count);
                Ok((numerator / u128::from(self.rendered_count)) as u64)
            }
            SamplingPolicy::PhiWeyl64 => {
                let word = u64::from(rendered_index).wrapping_mul(PHI64);
                let product = u128::from(word) * u128::from(self.logical_count);
                Ok((product >> 64) as u64)
            }
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct WorkRange {
    pub worker: usize,
    pub start: u64,
    pub end: u64,
    pub length: u64,
}

pub fn partition_ranges(item_count: u64, requested_workers: usize) -> Result<Vec<WorkRange>, RuntimeError> {
    if item_count == 0 {
        return Err(RuntimeError("item_count must be greater than zero".to_string()));
    }
    if requested_workers == 0 || requested_workers > MAX_WORKERS {
        return Err(RuntimeError(format!(
            "workers must be in [1,{MAX_WORKERS}]"
        )));
    }
    let workers = requested_workers.min(item_count as usize);
    let base = item_count / workers as u64;
    let remainder = item_count % workers as u64;
    let mut cursor = 0_u64;
    let mut output = Vec::with_capacity(workers);
    for worker in 0..workers {
        let length = base + u64::from((worker as u64) < remainder);
        let start = cursor;
        let end = start + length;
        output.push(WorkRange {
            worker,
            start,
            end,
            length,
        });
        cursor = end;
    }
    if cursor != item_count {
        return Err(RuntimeError("partition coverage invariant failed".to_string()));
    }
    Ok(output)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SimulationConfig {
    pub u_segments: u32,
    pub v_segments: u32,
    pub repeats: u32,
    pub workers: usize,
    pub device_slots: usize,
}

impl SimulationConfig {
    pub fn new(
        u_segments: u32,
        v_segments: u32,
        repeats: u32,
        workers: usize,
        device_slots: usize,
    ) -> Result<Self, RuntimeError> {
        if !(12..=1_000_000).contains(&u_segments) {
            return Err(RuntimeError("u_segments must be in [12,1000000]".to_string()));
        }
        if !(6..=65_536).contains(&v_segments) {
            return Err(RuntimeError("v_segments must be in [6,65536]".to_string()));
        }
        if repeats == 0 {
            return Err(RuntimeError("repeats must be greater than zero".to_string()));
        }
        if workers == 0 || workers > MAX_WORKERS {
            return Err(RuntimeError(format!("workers must be in [1,{MAX_WORKERS}]")));
        }
        if device_slots == 0 || device_slots > MAX_DEVICE_SLOTS {
            return Err(RuntimeError(format!(
                "device_slots must be in [1,{MAX_DEVICE_SLOTS}]"
            )));
        }
        let per_repeat = u64::from(u_segments)
            .checked_mul(u64::from(v_segments))
            .ok_or_else(|| RuntimeError("u*v point count overflow".to_string()))?;
        per_repeat
            .checked_mul(u64::from(repeats))
            .ok_or_else(|| RuntimeError("total point count overflow".to_string()))?;
        Ok(Self {
            u_segments,
            v_segments,
            repeats,
            workers,
            device_slots,
        })
    }

    pub fn total_points(self) -> u64 {
        u64::from(self.u_segments) * u64::from(self.v_segments) * u64::from(self.repeats)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct WorkerSummary {
    pub worker: usize,
    pub logical_device_slot: usize,
    pub start: u64,
    pub end: u64,
    pub points: u64,
    pub diagnostic_hash_fnv1a64: u64,
    pub max_tube_radius_error: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SimulationSummary {
    pub runtime_contract: &'static str,
    pub runtime_version: &'static str,
    pub geometry_contract: &'static str,
    pub total_points: u64,
    pub workers: usize,
    pub logical_device_slots: usize,
    pub max_tube_radius_error: f64,
    pub diagnostic_hash_fnv1a64: u64,
    pub actual_cuda_execution: bool,
    pub actual_multi_device_execution: bool,
    pub distributed_execution: bool,
    pub universal_speedup_claim: bool,
    pub geometry_receipt_authority: bool,
    pub worker_summaries: Vec<WorkerSummary>,
}

fn fnv_mix(mut state: u64, word: u64) -> u64 {
    for byte in word.to_le_bytes() {
        state ^= u64::from(byte);
        state = state.wrapping_mul(FNV_PRIME);
    }
    state
}

fn run_worker(
    range: WorkRange,
    sim: SimulationConfig,
    geometry: GeometryConfig,
) -> Result<WorkerSummary, RuntimeError> {
    let per_repeat = u64::from(sim.u_segments) * u64::from(sim.v_segments);
    let mut hash = FNV_OFFSET;
    let mut max_tube_radius_error = 0.0_f64;

    for linear in range.start..range.end {
        let point_index = linear % per_repeat;
        let u_index = point_index / u64::from(sim.v_segments);
        let v_index = point_index % u64::from(sim.v_segments);
        let t = angle_from_index(u_index, u64::from(sim.u_segments))?;
        let point = surface_point_from_indices(
            u_index,
            u64::from(sim.u_segments),
            v_index,
            u64::from(sim.v_segments),
            geometry,
        )?;
        let centre = centerline(t, geometry)?;
        let radius_error = (point.sub(centre).norm() - geometry.tube_radius()).abs();
        max_tube_radius_error = max_tube_radius_error.max(radius_error);

        hash = fnv_mix(hash, linear);
        hash = fnv_mix(hash, point.x.to_bits());
        hash = fnv_mix(hash, point.y.to_bits());
        hash = fnv_mix(hash, point.z.to_bits());
    }

    Ok(WorkerSummary {
        worker: range.worker,
        logical_device_slot: range.worker % sim.device_slots,
        start: range.start,
        end: range.end,
        points: range.length,
        diagnostic_hash_fnv1a64: hash,
        max_tube_radius_error,
    })
}

pub fn simulate(
    sim: SimulationConfig,
    geometry: GeometryConfig,
) -> Result<SimulationSummary, RuntimeError> {
    let ranges = partition_ranges(sim.total_points(), sim.workers)?;
    let worker_summaries = thread::scope(|scope| {
        let mut handles = Vec::with_capacity(ranges.len());
        for range in ranges.iter().copied() {
            handles.push(scope.spawn(move || run_worker(range, sim, geometry)));
        }
        let mut collected = Vec::with_capacity(handles.len());
        for handle in handles {
            match handle.join() {
                Ok(result) => collected.push(result?),
                Err(_) => return Err(RuntimeError("worker thread panicked".to_string())),
            }
        }
        Ok::<Vec<WorkerSummary>, RuntimeError>(collected)
    })?;

    let mut max_tube_radius_error = 0.0_f64;
    let mut diagnostic_hash = FNV_OFFSET;
    for worker in &worker_summaries {
        max_tube_radius_error = max_tube_radius_error.max(worker.max_tube_radius_error);
        diagnostic_hash = fnv_mix(diagnostic_hash, worker.worker as u64);
        diagnostic_hash = fnv_mix(diagnostic_hash, worker.start);
        diagnostic_hash = fnv_mix(diagnostic_hash, worker.end);
        diagnostic_hash = fnv_mix(diagnostic_hash, worker.diagnostic_hash_fnv1a64);
    }

    Ok(SimulationSummary {
        runtime_contract: RUNTIME_CONTRACT,
        runtime_version: VERSION,
        geometry_contract: GEOMETRY_CONTRACT,
        total_points: sim.total_points(),
        workers: worker_summaries.len(),
        logical_device_slots: sim.device_slots,
        max_tube_radius_error,
        diagnostic_hash_fnv1a64: diagnostic_hash,
        actual_cuda_execution: false,
        actual_multi_device_execution: false,
        distributed_execution: false,
        universal_speedup_claim: false,
        geometry_receipt_authority: false,
        worker_summaries,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn near(a: f64, b: f64, eps: f64) -> bool {
        (a - b).abs() <= eps
    }

    #[test]
    fn bounded_float_rejects_bad_values() {
        assert!(BoundedF64::new(f64::NAN, "x").is_err());
        assert!(BoundedF64::new(f64::INFINITY, "x").is_err());
        assert!(BoundedF64::new(MAX_ABS_GEOMETRY_VALUE + 1.0, "x").is_err());
    }

    #[test]
    fn canonical_geometry_domain_is_enforced() {
        assert!(GeometryConfig::new(2.10, 0.85, 0.34).is_ok());
        assert!(GeometryConfig::new(0.85, 2.10, 0.34).is_err());
        assert!(GeometryConfig::new(2.10, 0.85, 0.90).is_err());
    }

    #[test]
    fn sealed_uniform_sampling_vectors_match() {
        let cfg = SamplingConfig::new(1_u64 << 24, 96, SamplingPolicy::UniformFloor).unwrap();
        let expected = [
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
        for (rendered, logical) in expected {
            assert_eq!(cfg.logical_index(rendered).unwrap(), logical);
        }
    }

    #[test]
    fn sealed_phi_sampling_vectors_match() {
        let cfg = SamplingConfig::new(1_u64 << 24, 96, SamplingPolicy::PhiWeyl64).unwrap();
        let expected = [
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
        for (rendered, logical) in expected {
            assert_eq!(cfg.logical_index(rendered).unwrap(), logical);
        }
    }

    #[test]
    fn sealed_large_uniform_vector_matches() {
        let cfg = SamplingConfig::new(1_u64 << 32, 4096, SamplingPolicy::UniformFloor).unwrap();
        let expected = [
            (0, 0),
            (1, 1_048_576),
            (2047, 2_146_435_072),
            (2048, 2_147_483_648),
            (4095, 4_293_918_720),
        ];
        for (rendered, logical) in expected {
            assert_eq!(cfg.logical_index(rendered).unwrap(), logical);
        }
    }

    #[test]
    fn partition_is_complete_and_ordered() {
        let ranges = partition_ranges(4097, 16).unwrap();
        assert_eq!(ranges.first().unwrap().start, 0);
        assert_eq!(ranges.last().unwrap().end, 4097);
        assert_eq!(ranges.iter().map(|r| r.length).sum::<u64>(), 4097);
        for pair in ranges.windows(2) {
            assert_eq!(pair[0].end, pair[1].start);
        }
    }

    #[test]
    fn geometry_invariants_hold_on_index_grid() {
        let cfg = GeometryConfig::canonical();
        for i in 0..48_u64 {
            let t = angle_from_index(i, 48).unwrap();
            let c = centerline(t, cfg).unwrap();
            let c_closed = centerline(t + TAU, cfg).unwrap();
            assert!(near(c.x, c_closed.x, 2e-9));
            assert!(near(c.y, c_closed.y, 2e-9));
            assert!(near(c.z, c_closed.z, 2e-9));
            let derivative = centerline_derivative(t, cfg).unwrap();
            assert!(derivative.norm() > 1.0);
            let (tangent, normal, binormal) = frame(t, cfg).unwrap();
            assert!(near(tangent.norm(), 1.0, 2e-12));
            assert!(near(normal.norm(), 1.0, 2e-12));
            assert!(near(binormal.norm(), 1.0, 2e-12));
            assert!(near(tangent.dot(normal), 0.0, 2e-12));
        }
    }

    #[test]
    fn runtime_simulation_is_repeatable_on_same_runtime() {
        let sim = SimulationConfig::new(96, 18, 2, 8, 2).unwrap();
        let a = simulate(sim, GeometryConfig::canonical()).unwrap();
        let b = simulate(sim, GeometryConfig::canonical()).unwrap();
        assert_eq!(a.diagnostic_hash_fnv1a64, b.diagnostic_hash_fnv1a64);
        assert_eq!(a.worker_summaries, b.worker_summaries);
        assert!(!a.actual_cuda_execution);
        assert!(!a.geometry_receipt_authority);
    }
}
