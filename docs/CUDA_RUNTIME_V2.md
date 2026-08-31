# GLUBALL CUDA Runtime V2

`GLUBALL-CUDA-RUNTIME-V2` is an additive post-v1.0.0 throughput runtime for Phase 5C performance and portability observations.

It does **not** replace `GLUBALL-MULTI-DEVICE-CUDA-V1`, `GLUBALL-CUDA-ACCEPTANCE-V1`, or the independent Rust full-readback residual acceptance path used to graduate Phase 5B.

## Boundary

Runtime V2 is deliberately throughput-only.

It always reports:

```text
performance_observation_only: true
reference_residual_checked: false
conformance_acceptance: false
complete_output_readback: false
geometry_receipt_authority: false
universal_speedup_claim: false
```

Use `gluball-cuda-evidence` plus the Rust `gluball-cuda-accept` binary whenever correctness evidence is required.

## Why V2 exists

The Phase 5B runtime computes one exact diagnostic token per point and the V1 throughput adapter folds every token into a single device digest with one global `atomicXor` per evaluated point. That is acceptable for bounded correctness work but can turn a large GPU into an atomic-contention benchmark.

V2 keeps the exact XOR algebra while changing the reduction shape:

```text
thread token
   -> block-local shared-memory XOR reduction
   -> one global atomic XOR per CUDA block
   -> one compact digest per device
   -> host XOR across device digests
```

For the default block size of 256, the asymptotic global digest-atomic count is reduced by approximately 256x before final partial-block effects.

The sidecar records both the legacy point-atomic count and the V2 block-atomic count so the reduction is explicit rather than inferred.

## Compact resident metrics

Runtime V2 allocates three small persistent metric buffers per selected GPU:

- one 64-bit diagnostic XOR;
- one 32-bit non-negative float bit-pattern containing the maximum tube-radius error;
- one 64-bit non-finite counter.

That is 20 bytes of logical metric payload per device. No full `float4` output buffer is allocated.

The compact metrics are reset on-device before every warmup or measured iteration and read back only after the measured kernel work has completed.

Compact metric repeatability is useful runtime regression evidence, but it is **not** conformance acceptance because no complete ordered point field is returned to the Rust reference.

## Persistent contexts and repeated in-process timing

Streams, CUDA events, metric buffers, and optional CUDA Graph objects are created once and reused across all warmup and measured iterations in one process.

The runtime reports:

- setup time;
- median/min/max same-host iteration wall time;
- median compact-readback time;
- median per-device CUDA event time;
- median model points/s.

Warmups are excluded from the measured sample set.

The intended Phase 5C comparison uses identical `U`, `V`, `REPEATS`, block size, warmup policy, measured-iteration count, and graph policy at 1, 2, 4, and 8 GPUs on one host.

## Optional CUDA Graph replay

`--cuda-graphs on` captures one fixed workload graph per selected device containing:

1. compact-metric resets;
2. the Runtime V2 geometry/evaluation kernel.

Measured iterations launch the pre-instantiated graphs on their persistent non-blocking streams.

Graph and ordinary-launch observations must be labeled separately. A graph result is not silently substituted for an ordinary-launch result.

## Build and run

On an existing CUDA host:

```bash
GLUBALL_CUDA_ARCHITECTURES=native \
DEVICES=0 \
ITERATIONS=10 \
WARMUP=2 \
CUDA_GRAPHS=off \
OUTPUT=runtime-v2-1gpu.json \
sh scripts/run_cuda_runtime_v2.sh
```

For a controlled 8-GPU observation:

```bash
GLUBALL_CUDA_ARCHITECTURES=89 \
DEVICES=0,1,2,3,4,5,6,7 \
ITERATIONS=10 \
WARMUP=2 \
CUDA_GRAPHS=off \
OUTPUT=runtime-v2-8gpu.json \
sh scripts/run_cuda_runtime_v2.sh
```

Do not copy an architecture number from a different GPU family. For a first portability specimen such as GB10, start with `GLUBALL_CUDA_ARCHITECTURES=native`, record the compiler-selected result and device-reported compute capability, and only pin a numeric architecture after it is actually observed and reproduced.

## Phase 5C interpretation

Strong-scaling observations use:

```text
speedup(n) = T1 / Tn
parallel_efficiency(n) = (T1 / Tn) / n
```

where `Tn` is the chosen same-policy statistic, normally the median measured iteration wall time from Runtime V2.

Sanitizer runs are correctness diagnostics, not performance samples. Performance observations must not be promoted into geometry authority, a physical-law claim, or a universal hardware speedup claim.

## Portability sequence

After source/CI review of Runtime V2:

1. first run a bounded single-device V2 observation and ordinary V1 evidence acceptance on the new architecture;
2. compare compact Runtime V2 metrics against its own measured repeats;
3. keep the existing Phase 5B correctness artifacts as the established 4080 SUPER baseline;
4. only then treat the new device as a portability/performance specimen.

GB10 is therefore a portability specimen, not a replacement correctness authority.
