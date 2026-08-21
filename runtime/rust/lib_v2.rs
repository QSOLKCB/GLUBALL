// SPDX-License-Identifier: MPL-2.0
//! GLUBALL bounded deterministic Rust execution runtime.
//!
//! Discrete state stays integer. Canonical radii stay fixed-point integer.
//! Floating point appears only at the trigonometric geometry boundary and is
//! checked for finiteness/range before use.

use std::fmt;
use std::thread;

pub const VERSION: &str = "0.1.0";
pub const RUNTIME_CONTRACT: &str = "GLUBALL-RUST-RUNTIME-V1";
pub const GEOMETRY_CONTRACT: &str = "GLUBALL-KNOT-V1";
pub const SAMPLING_CONTRACT: &str = "GLUBALL-SAMPLING-V1";
pub const MAX_RENDERED_COUNT: u32 = 1_000_000;
pub const MAX_WORKERS: usize = 256;
pub const MAX_DEVICE_SLOTS: usize = 64;

const SCALE: i64 = 1_000_000;
const TAU: f64 = std::f64::consts::TAU;
const P: f64 = 2.0;
const Q: f64 = 3.0;
const MAX_ANGLE_ABS: f64 = TAU * 4.0;
const PHI64: u64 = 0x9e37_79b9_7f4a_7c15;
const FNV_OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
const FNV_PRIME: u64 = 0x0000_0100_0000_01b3;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RuntimeError(pub String);
impl fmt::Display for RuntimeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result { f.write_str(&self.0) }
}
impl std::error::Error for RuntimeError {}

/// Fixed-point decimal with six fractional digits.
/// Canonical GLUBALL parameters therefore enter the runtime without binary
/// floating-point representation drift.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Fixed6(i64);
impl Fixed6 {
    pub const fn from_micros(raw: i64) -> Self { Self(raw) }
    pub fn to_f64(self) -> f64 { self.0 as f64 / SCALE as f64 }
    pub fn raw(self) -> i64 { self.0 }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GeometryConfig {
    pub major_radius: Fixed6,
    pub minor_radius: Fixed6,
    pub tube_radius: Fixed6,
}
impl GeometryConfig {
    pub fn new(major_radius: Fixed6, minor_radius: Fixed6, tube_radius: Fixed6) -> Result<Self, RuntimeError> {
        if !(major_radius.raw() > minor_radius.raw() && minor_radius.raw() > 0) {
            return Err(RuntimeError("require major_radius > minor_radius > 0".into()));
        }
        if !(tube_radius.raw() > 0 && tube_radius.raw() < minor_radius.raw()) {
            return Err(RuntimeError("require 0 < tube_radius < minor_radius".into()));
        }
        Ok(Self { major_radius, minor_radius, tube_radius })
    }
    pub const fn canonical() -> Self {
        Self {
            major_radius: Fixed6::from_micros(2_100_000),
            minor_radius: Fixed6::from_micros(850_000),
            tube_radius: Fixed6::from_micros(340_000),
        }
    }
}
impl Default for GeometryConfig { fn default() -> Self { Self::canonical() } }

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Vec3 { pub x: f64, pub y: f64, pub z: f64 }
impl Vec3 {
    fn add(self, b: Self) -> Self { Self { x: self.x+b.x, y: self.y+b.y, z: self.z+b.z } }
    fn sub(self, b: Self) -> Self { Self { x: self.x-b.x, y: self.y-b.y, z: self.z-b.z } }
    fn scale(self, s: f64) -> Self { Self { x: self.x*s, y: self.y*s, z: self.z*s } }
    fn cross(self, b: Self) -> Self {
        Self { x: self.y*b.z-self.z*b.y, y: self.z*b.x-self.x*b.z, z: self.x*b.y-self.y*b.x }
    }
    fn norm(self) -> f64 { (self.x*self.x + self.y*self.y + self.z*self.z).sqrt() }
    fn normalize(self) -> Result<Self, RuntimeError> {
        let n = self.norm();
        if !n.is_finite() || n <= 0.0 { return Err(RuntimeError("cannot normalize vector".into())); }
        Ok(self.scale(1.0/n))
    }
}

fn checked_angle(value: f64) -> Result<f64, RuntimeError> {
    if !value.is_finite() || value.abs() > MAX_ANGLE_ABS {
        return Err(RuntimeError("angle outside bounded finite runtime domain".into()));
    }
    Ok(value)
}
fn angle_from_index(index: u32, count: u32) -> Result<f64, RuntimeError> {
    if count == 0 || index >= count { return Err(RuntimeError("mesh index outside domain".into())); }
    Ok(TAU * f64::from(index) / f64::from(count))
}

pub fn centerline(t: f64, c: GeometryConfig) -> Result<Vec3, RuntimeError> {
    let t = checked_angle(t)?;
    let r_major = c.major_radius.to_f64();
    let r_minor = c.minor_radius.to_f64();
    let a = P*t;
    let b = Q*t;
    let radial = r_major + r_minor*b.cos();
    Ok(Vec3 { x: radial*a.cos(), y: radial*a.sin(), z: r_minor*b.sin() })
}
pub fn centerline_derivative(t: f64, c: GeometryConfig) -> Result<Vec3, RuntimeError> {
    let t = checked_angle(t)?;
    let r_major = c.major_radius.to_f64();
    let r_minor = c.minor_radius.to_f64();
    let a = P*t;
    let b = Q*t;
    let radial = r_major + r_minor*b.cos();
    let radial_prime = -r_minor*Q*b.sin();
    Ok(Vec3 {
        x: radial_prime*a.cos() - P*radial*a.sin(),
        y: radial_prime*a.sin() + P*radial*a.cos(),
        z: r_minor*Q*b.cos(),
    })
}
fn torus_normal(t: f64) -> Result<Vec3, RuntimeError> {
    let t = checked_angle(t)?;
    let a=P*t; let b=Q*t;
    Ok(Vec3 { x: b.cos()*a.cos(), y: b.cos()*a.sin(), z: b.sin() })
}
fn frame(t: f64, c: GeometryConfig) -> Result<(Vec3,Vec3,Vec3),RuntimeError> {
    let tangent=centerline_derivative(t,c)?.normalize()?;
    let normal=torus_normal(t)?;
    let binormal=tangent.cross(normal).normalize()?;
    Ok((tangent,normal,binormal))
}
pub fn surface_point_indices(u:u32,u_count:u32,v:u32,v_count:u32,c:GeometryConfig)->Result<Vec3,RuntimeError>{
    let t=angle_from_index(u,u_count)?;
    let a=angle_from_index(v,v_count)?;
    let centre=centerline(t,c)?;
    let (_,n,b)=frame(t,c)?;
    let rho=c.tube_radius.to_f64();
    Ok(centre.add(n.scale(a.cos()*rho)).add(b.scale(a.sin()*rho)))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SamplingPolicy { UniformFloor, PhiWeyl64 }
impl SamplingPolicy {
    pub fn as_str(self)->&'static str { match self { Self::UniformFloor=>"uniform-floor", Self::PhiWeyl64=>"phi-weyl-64" } }
    pub fn parse(s:&str)->Result<Self,RuntimeError>{ match s { "uniform-floor"=>Ok(Self::UniformFloor), "phi-weyl-64"=>Ok(Self::PhiWeyl64), _=>Err(RuntimeError(format!("unknown sampling policy: {s}"))) } }
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SamplingConfig { pub logical_count:u64, pub rendered_count:u32, pub policy:SamplingPolicy }
impl SamplingConfig {
    pub fn new(logical_count:u64,rendered_count:u32,policy:SamplingPolicy)->Result<Self,RuntimeError>{
        if logical_count==0 { return Err(RuntimeError("logical_count must be > 0".into())); }
        if rendered_count==0 || rendered_count>MAX_RENDERED_COUNT { return Err(RuntimeError("rendered_count outside runtime bound".into())); }
        if u64::from(rendered_count)>logical_count { return Err(RuntimeError("rendered_count may not exceed logical_count".into())); }
        Ok(Self{logical_count,rendered_count,policy})
    }
    pub fn logical_index(self,i:u32)->Result<u64,RuntimeError>{
        if i>=self.rendered_count { return Err(RuntimeError("rendered index outside domain".into())); }
        match self.policy {
            SamplingPolicy::UniformFloor => Ok(((u128::from(i)*u128::from(self.logical_count))/u128::from(self.rendered_count)) as u64),
            SamplingPolicy::PhiWeyl64 => {
                let word=u64::from(i).wrapping_mul(PHI64);
                Ok(((u128::from(word)*u128::from(self.logical_count))>>64) as u64)
            }
        }
    }
}

#[derive(Debug,Clone,Copy,PartialEq,Eq)]
pub struct WorkRange { pub worker:usize,pub start:u64,pub end:u64,pub length:u64 }
pub fn partition_ranges(items:u64,requested:usize)->Result<Vec<WorkRange>,RuntimeError>{
    if items==0 { return Err(RuntimeError("item count must be > 0".into())); }
    if requested==0 || requested>MAX_WORKERS { return Err(RuntimeError("worker count outside runtime bound".into())); }
    let workers=requested.min(usize::try_from(items).unwrap_or(usize::MAX));
    let base=items/workers as u64;
    let rem=items%workers as u64;
    let mut cursor=0u64;
    let mut out=Vec::with_capacity(workers);
    for worker in 0..workers {
        let extra=if (worker as u64)<rem {1} else {0};
        let length=base+extra;
        let start=cursor; let end=start+length; cursor=end;
        out.push(WorkRange{worker,start,end,length});
    }
    if cursor!=items { return Err(RuntimeError("partition coverage invariant failed".into())); }
    Ok(out)
}

#[derive(Debug,Clone,Copy,PartialEq,Eq)]
pub struct SimulationConfig { pub u_segments:u32,pub v_segments:u32,pub repeats:u32,pub workers:usize,pub device_slots:usize }
impl SimulationConfig {
    pub fn new(u:u32,v:u32,repeats:u32,workers:usize,device_slots:usize)->Result<Self,RuntimeError>{
        if !(12..=1_000_000).contains(&u) { return Err(RuntimeError("u_segments outside [12,1000000]".into())); }
        if !(6..=65_536).contains(&v) { return Err(RuntimeError("v_segments outside [6,65536]".into())); }
        if repeats==0 { return Err(RuntimeError("repeats must be > 0".into())); }
        if workers==0 || workers>MAX_WORKERS { return Err(RuntimeError("workers outside runtime bound".into())); }
        if device_slots==0 || device_slots>MAX_DEVICE_SLOTS { return Err(RuntimeError("device slots outside runtime bound".into())); }
        u64::from(u).checked_mul(u64::from(v)).and_then(|x|x.checked_mul(u64::from(repeats))).ok_or_else(||RuntimeError("total point count overflow".into()))?;
        Ok(Self{u_segments:u,v_segments:v,repeats,workers,device_slots})
    }
    pub fn total_points(self)->u64 { u64::from(self.u_segments)*u64::from(self.v_segments)*u64::from(self.repeats) }
}
#[derive(Debug,Clone,PartialEq)]
pub struct WorkerSummary { pub worker:usize,pub logical_device_slot:usize,pub start:u64,pub end:u64,pub points:u64,pub diagnostic_hash_fnv1a64:u64,pub max_tube_radius_error:f64 }
#[derive(Debug,Clone,PartialEq)]
pub struct SimulationSummary {
    pub runtime_contract:&'static str,pub runtime_version:&'static str,pub geometry_contract:&'static str,
    pub total_points:u64,pub workers:usize,pub logical_device_slots:usize,pub max_tube_radius_error:f64,pub diagnostic_hash_fnv1a64:u64,
    pub actual_cuda_execution:bool,pub actual_multi_device_execution:bool,pub distributed_execution:bool,pub universal_speedup_claim:bool,pub geometry_receipt_authority:bool,
    pub worker_summaries:Vec<WorkerSummary>,
}
fn fnv(mut state:u64,word:u64)->u64 { for byte in word.to_le_bytes(){ state^=u64::from(byte); state=state.wrapping_mul(FNV_PRIME); } state }
fn run_worker(range:WorkRange,sim:SimulationConfig,c:GeometryConfig)->Result<WorkerSummary,RuntimeError>{
    let per_repeat=u64::from(sim.u_segments)*u64::from(sim.v_segments);
    let mut hash=FNV_OFFSET; let mut max_err=0.0f64;
    for linear in range.start..range.end {
        let point_index=linear%per_repeat;
        let u=(point_index/u64::from(sim.v_segments)) as u32;
        let v=(point_index%u64::from(sim.v_segments)) as u32;
        let t=angle_from_index(u,sim.u_segments)?;
        let point=surface_point_indices(u,sim.u_segments,v,sim.v_segments,c)?;
        let centre=centerline(t,c)?;
        max_err=max_err.max((point.sub(centre).norm()-c.tube_radius.to_f64()).abs());
        hash=fnv(hash,linear); hash=fnv(hash,point.x.to_bits()); hash=fnv(hash,point.y.to_bits()); hash=fnv(hash,point.z.to_bits());
    }
    Ok(WorkerSummary{worker:range.worker,logical_device_slot:range.worker%sim.device_slots,start:range.start,end:range.end,points:range.length,diagnostic_hash_fnv1a64:hash,max_tube_radius_error:max_err})
}
pub fn simulate(sim:SimulationConfig,c:GeometryConfig)->Result<SimulationSummary,RuntimeError>{
    let ranges=partition_ranges(sim.total_points(),sim.workers)?;
    let summaries=thread::scope(|scope|{
        let handles:Vec<_>=ranges.iter().copied().map(|r|scope.spawn(move||run_worker(r,sim,c))).collect();
        let mut out=Vec::with_capacity(handles.len());
        for h in handles { out.push(h.join().map_err(|_|RuntimeError("worker thread panicked".into()))??); }
        Ok::<_,RuntimeError>(out)
    })?;
    let mut max_err=0.0f64; let mut hash=FNV_OFFSET;
    for w in &summaries { max_err=max_err.max(w.max_tube_radius_error); hash=fnv(hash,w.worker as u64); hash=fnv(hash,w.start); hash=fnv(hash,w.end); hash=fnv(hash,w.diagnostic_hash_fnv1a64); }
    Ok(SimulationSummary{runtime_contract:RUNTIME_CONTRACT,runtime_version:VERSION,geometry_contract:GEOMETRY_CONTRACT,total_points:sim.total_points(),workers:summaries.len(),logical_device_slots:sim.device_slots,max_tube_radius_error:max_err,diagnostic_hash_fnv1a64:hash,actual_cuda_execution:false,actual_multi_device_execution:false,distributed_execution:false,universal_speedup_claim:false,geometry_receipt_authority:false,worker_summaries:summaries})
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn fixed_parameters_are_exact(){ let c=GeometryConfig::canonical(); assert_eq!(c.major_radius.raw(),2_100_000); assert_eq!(c.minor_radius.raw(),850_000); assert_eq!(c.tube_radius.raw(),340_000); }
    #[test] fn uniform_vectors(){ let c=SamplingConfig::new(1<<24,96,SamplingPolicy::UniformFloor).unwrap(); for (i,e) in [(0,0),(1,174762),(2,349525),(31,5417642),(32,5592405),(47,8213845),(48,8388608),(63,11010048),(94,16427690),(95,16602453)] { assert_eq!(c.logical_index(i).unwrap(),e); } }
    #[test] fn phi_vectors(){ let c=SamplingConfig::new(1<<24,96,SamplingPolicy::PhiWeyl64).unwrap(); for (i,e) in [(0,0),(1,10368889),(2,3960563),(31,2668477),(32,13037367),(47,798553),(48,11167442),(63,15705844),(94,1597106),(95,11965995)] { assert_eq!(c.logical_index(i).unwrap(),e); } }
    #[test] fn large_vector(){ let c=SamplingConfig::new(1u64<<32,4096,SamplingPolicy::UniformFloor).unwrap(); for (i,e) in [(0,0),(1,1048576),(2047,2146435072),(2048,2147483648),(4095,4293918720)] { assert_eq!(c.logical_index(i).unwrap(),e); } }
    #[test] fn partitions_cover(){ let r=partition_ranges(4097,16).unwrap(); assert_eq!(r.first().unwrap().start,0); assert_eq!(r.last().unwrap().end,4097); assert_eq!(r.iter().map(|x|x.length).sum::<u64>(),4097); for p in r.windows(2){assert_eq!(p[0].end,p[1].start);} }
    #[test] fn repeatable(){ let sim=SimulationConfig::new(96,18,2,8,2).unwrap(); let a=simulate(sim,GeometryConfig::canonical()).unwrap(); let b=simulate(sim,GeometryConfig::canonical()).unwrap(); assert_eq!(a.diagnostic_hash_fnv1a64,b.diagnostic_hash_fnv1a64); assert_eq!(a.worker_summaries,b.worker_summaries); assert!(!a.actual_cuda_execution); }
}
