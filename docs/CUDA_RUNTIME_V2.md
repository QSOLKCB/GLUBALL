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

The Phase 5B runtime computes exact compact diagnostics alongside the geometry work. A large throughput run must not collapse into contention on a handful of device-global metric words.

V2 therefore reduces all three compact metrics within each CUDA block before touching global memory:

```text
per-thread point result
   -> block-local shared-memory reduction
      digest: XOR
      radius: maximum
      nonfinite: sum
   -> block leader issues one global update per metric
   -> compact metrics per device
   -> host combines selected-device metrics
```

For the default block size of 256, the global digest and radius update counts are reduced from point scale to approximately one update per 256 evaluated points before final partial-block effects. The non-finite counter is also block-reduced, so even a pathological observation cannot turn the counter itself into a per-point global-atomic bottleneck.

The sidecar records the legacy point digest-atomic count and the V2 block-atomic counts so the reduction is explicit rather than inferred.

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
- median per-device evaluation-kernel CUDA event time;
- median model points/s.

The timing surfaces are intentionally distinct:

- `iteration_wall_*` includes compact metric resets, evaluation-kernel execution, and stream synchronization, but excludes the later compact host readback;
- `kernel_milliseconds_median` is bracketed by CUDA events **after** metric resets and around only the evaluation kernel;
- `compact_readback_milliseconds_median` measures the subsequent compact device-to-host metric transfer.

The same event bracketing is captured inside CUDA Graph mode, so graph-replay kernel timing excludes the reset nodes as well.

Warmups are excluded from the measured sample set.

The intended Phase 5C comparison uses identical `U`, `V`, `REPEATS`, block size, warmup policy, measured-iteration count, and graph policy at 1, 2, 4, and 8 GPUs on one host.

## Optional CUDA Graph replay

`--cuda-graphs on` captures one fixed workload graph per selected device containing:

1. compact-metric resets;
2. a kernel-start CUDA event;
3. the Runtime V2 geometry/evaluation kernel;
4. a kernel-stop CUDA event.

Measured iterations launch the pre-instantiated graphs on their persistent non-blocking streams. The event interval therefore measures the evaluation kernel, not reset-plus-kernel time.

Graph and ordinary-launch observations must be labeled separately. A graph result is not silently substituted for an ordinary-launch result.

## Grid and launch bounds

Runtime V2 validates each shard against the selected device that will execute it. In addition to the block-size and shared-memory checks, the computed x-grid must not exceed that device's reported `maxGridSize[0]`. Oversized accepted input values therefore fail before launch instead of relying on a generic host integer bound and later producing an invalid CUDA configuration.

## Compile-architecture provenance

The CMake architecture input is a **policy**, not proof of the code-generation target actually selected at runtime. Runtime V2 records both surfaces separately:

- `compiled_architecture_policy`, for example `native` or `89`;
- `resolved_compiled_architectures`, populated by a setup probe kernel that records its device-side `__CUDA_ARCH__` value;
- each device record also contains `compiled_cuda_arch_code` and `resolved_compiled_architecture`, for example `890` and `sm_89`.

This distinction matters for the first GB10 run: `native` is retained as the requested policy while the executing binary records the actual resolved architecture observed on silicon.

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

Do not copy an architecture number from a different GPU family. For a first portability specimen such as GB10, start with `GLUBALL_CUDA_ARCHITECTURES=native`, preserve that requested policy in the sidecar, record the Runtime V2 resolved `__CUDA_ARCH__` target and device-reported compute capability, and only pin a numeric architecture after it is actually observed and reproduced.

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
