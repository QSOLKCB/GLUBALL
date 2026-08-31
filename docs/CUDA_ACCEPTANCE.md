# GLUBALL physical CUDA acceptance

`GLUBALL-CUDA-ACCEPTANCE-V1` is the post-v1.0.0 bridge between a CUDA observation and an accepted accelerator residual result.

It does **not** change `GLUBALL-KNOT-V1`, `GLUBALL-SAMPLING-V1`, or `GLUBALL-EVIDENCE-V1`. The tagged `v1.0.0` release remains a JavaScript-reference contract freeze with GPU execution outside that release surface.

## Why there are two evidence programs

The CUDA producer is not allowed to grade its own numerical agreement with the Rust reference.

Evidence mode therefore has two separate executables:

```text
gluball-cuda-evidence
        |
        | physical CUDA launch + complete readback
        v
GLUBALL-CUDA-F32LE-XYZR-V1 artifact
        |
        | independent host process
        v
gluball-cuda-accept
        |
        | recompute every point through GLUBALL-RUST-RUNTIME-V1
        v
GLUBALL-CUDA-ACCEPTANCE-V1 record
```

The CUDA sidecar may establish that kernels launched, devices synchronized, output was read back, and CUDA-local invariant gates passed. It must continue to emit:

```text
reference_residual_checked: false
conformance_acceptance: false
```

Only the Rust acceptance record may set those fields to true.

## Evidence artifact

The physical CUDA producer writes one deterministic binary record for every global linear point in contiguous global order.

Contract: `GLUBALL-CUDA-F32LE-XYZR-V1`

Each 16-byte record is:

```text
x : IEEE-754 binary32 little-endian
y : IEEE-754 binary32 little-endian
z : IEEE-754 binary32 little-endian
r : CUDA-reported tube-radius error, binary32 little-endian
```

Device sharding is invisible in the serialized order. A 1-GPU and 8-GPU evidence run over the same requested domain therefore expose the same logical record positions to the Rust acceptance harness.

## Independent Rust gates

`gluball-cuda-accept` validates the artifact length before reading it, binds the exact CUDA sidecar domain, then recomputes every reference point with `GLUBALL-RUST-RUNTIME-V1` using canonical fixed-point parameters and Rust `f64` transcendental evaluation.

Profile: `gluball-rust-vs-cuda-f32-full-v1`

The initial bounded gates are:

```text
max absolute component residual <= 5.0e-5
max Euclidean position residual <= 8.660254037844386e-5
max CUDA-reported tube-radius error <= 5.0e-5
non-finite records == 0
checked points == requested total points
```

These are accelerator residual tolerances, not a claim of cross-runtime bit identity. Any future tolerance change requires a new named residual profile rather than silently weakening this one.

## Campaign runner

On a rented host:

```bash
sh scripts/cuda_preflight.sh
DEVICES=0 MODE=evidence RUNS=3 sh scripts/run_vast_campaign.sh
DEVICES=0,1 MODE=evidence RUNS=3 sh scripts/run_vast_campaign.sh
DEVICES=0,1,2,3 MODE=evidence RUNS=3 sh scripts/run_vast_campaign.sh
DEVICES=0,1,2,3,4,5,6,7 MODE=evidence RUNS=3 sh scripts/run_vast_campaign.sh
```

For each accepted evidence run the campaign directory contains at least:

```text
cuda-run-N.json
cuda-output-N.f32le
cuda-acceptance-N.json
SHA256SUMS.txt
```

The runner also keeps the Rust self-test/reference output, CUDA preflight information, selected-device list, and Compute Sanitizer evidence where available.

The SHA-256 manifest is finalized on shell exit. A rejected completed run therefore remains an auditable rejected campaign rather than disappearing.

## Strong-scaling and throughput observations

After evidence acceptance is established on a host, the useful same-host scaling ladder is:

```text
1 GPU -> 2 GPU -> 4 GPU -> 8 GPU
```

Keep `U`, `V`, and `REPEATS` fixed for a strong-scaling observation. Timing is performance evidence only.

For very large workloads, use:

```bash
MODE=throughput DEVICES=0,1,2,3,4,5,6,7 sh scripts/run_vast_campaign.sh
```

Throughput mode deliberately does not create an acceptance record and cannot be promoted to conformance evidence later.

## Claim boundary

An accepted record establishes only that, under the recorded host/device/toolchain/domain and named residual profile:

1. the physical CUDA sidecar reported a complete locally valid execution;
2. every serialized CUDA output point was independently compared against the Rust reference;
3. all declared residual gates passed.

It does not establish a new geometry authority, universal GPU speedup, QCD/glueball physics, empirical truth, or cross-platform bit identity.
