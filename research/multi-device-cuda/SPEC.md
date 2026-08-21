# GLUBALL multi-device CUDA experiment specification

Status: **planned physical accelerator experiment**.

This specification deliberately borrows the evidence-first engineering pattern already proven useful in `QSOLKCB/RSH`, while keeping the GLUBALL geometry contract independent.

## Contract split

The following claims are separate and must never be collapsed:

1. CUDA source exists.
2. CUDA source compiled for a declared architecture.
3. A selected CUDA device actually executed a kernel.
4. At least two selected CUDA devices actually executed assigned shards.
5. Complete required output was read back.
6. Residual and invariant gates passed.
7. Repeated physical runs agreed under the declared campaign policy.
8. A timing observation was recorded.

Only claims 3 through 7 can support a physical CUDA evidence record. Claim 8 is performance evidence only and never promotes the accelerator to geometry authority.

## Host authority

`GLUBALL-RUST-RUNTIME-V1` is the native host/orchestration surface.

The frozen authority order remains:

```text
GLUBALL-KNOT-V1
GLUBALL-SAMPLING-V1
GLUBALL-RUST-RUNTIME-V1 CPU/reference execution
optional CUDA residual sidecar
```

The CUDA adapter may accelerate point evaluation and large sweeps. It may not redefine geometry, sampling, topology, or scientific interpretation.

## Numeric contract

Host-side discrete quantities use integers:

- point counts;
- mesh indices;
- shard ranges;
- device slots;
- repeat ordinals;
- transfer sizes.

Canonical radii use fixed-point integers with six decimal places in the Rust runtime.

CUDA geometry may use `f32` or `f64` only behind an explicitly named adapter profile. The adapter must record which floating-point profile was used and compare against the Rust reference under declared residual gates.

A CUDA implementation is not required to be bit-identical to Rust transcendental output. It is required to be finite, bounded, complete, and within the declared residual profile.

## Deterministic sharding

For total item count `N` and selected device count `D`, assign contiguous half-open ranges with quotient/remainder partitioning:

```text
base = floor(N / D)
remainder = N mod D
length(d) = base + 1 for d < remainder, else base
```

Required properties:

- first shard starts at zero;
- final shard ends at `N`;
- adjacent shards touch exactly;
- no overlap;
- no gaps;
- total lengths sum to `N`;
- device-slot order is deterministic;
- selected CUDA indices are unique and explicitly recorded.

The first physical implementation may use one contiguous shard per selected device. Later versions may subdivide into more shards, but the mapping policy must be named and machine-readable.

## Two execution modes

### Evidence mode

Evidence mode is bounded so complete readback remains practical.

Required:

- full output readback;
- exact row/record count;
- finite-value validation;
- tube-radius residual validation;
- frame norm/orthogonality validation where the adapter emits frame data;
- comparison with an independently generated Rust reference;
- repeated physical runs;
- stable non-timing sidecar fields;
- Compute Sanitizer memcheck and racecheck where supported;
- deterministic evidence manifest and external archive hash.

### Throughput mode

Throughput mode may run vastly larger workloads and return bounded aggregate diagnostics rather than every point.

Throughput mode must say explicitly:

```text
complete_output_readback: false
physical_cuda_execution: true|false
conformance_acceptance: false
performance_observation_only: true
```

Throughput numbers cannot be upgraded into conformance evidence later unless the underlying run also satisfied the evidence-mode requirements.

## Multi-GPU evidence requirements

`actual_multi_device_execution: true` requires all of the following:

- at least two unique selected CUDA devices;
- each selected device receives a non-empty assigned range;
- one stream or declared equivalent execution context is created per selected device;
- every selected device launches its assigned work;
- every selected device synchronizes successfully;
- required output/digests are read back;
- aggregate coverage equals the complete requested domain;
- all numerical gates pass.

Simply detecting eight cards is not an eight-GPU execution claim.

## Device privacy

Follow the RSH pattern:

- device name, selected index, compute capability, memory and toolkit versions may be recorded;
- raw CUDA UUIDs must not be published;
- a contract-domain-separated redacted correlation token may be derived locally;
- the redacted token is not hardware identity authority and not a geometry receipt.

## Initial candidate hardware

See `runtime/vast/market-2026-08-21.json` for the user-supplied marketplace snapshot.

The most useful first campaign shapes are:

```text
2x RTX 4090       correctness + two-device composition baseline
2x RTX 5090       newer architecture comparison
8x RTX 4090       scaling and scheduler stress
8x RTX 3060       many-device / lower-per-device-throughput contrast
```

Marketplace price and TFLOPS values are not benchmark results.

## Suggested campaign ladder

1. Rust CPU self-test and sealed sampling replay.
2. Rust CPU medium geometry run.
3. Single-GPU evidence mode.
4. Two-GPU evidence mode, three repeats.
5. Same-host 2-device vs 4-device vs 8-device throughput mode if hardware allows.
6. Multi-GPU evidence mode at the largest bounded complete-readback profile that remains operationally reasonable.
7. Archive accepted evidence separately from rejected evidence.

A failed completed run should produce a rejected audit rather than disappear.

## RSH handoff

This work is intentionally shaped so it can later enter RSH as an **additive GLUBALL runtime/geometry family**, reusing the already successful RSH CUDA evidence discipline without weakening the existing Robitaille–Slade helix contracts.

The later RSH integration should import stable GLUBALL contracts, sealed vectors and accepted runtime evidence. It should not import a marketplace listing or benchmark screenshot as authority.

## Mandatory false claims before physical acceptance

Until a real hardware campaign passes, portable and planning artifacts must retain:

```text
actual_cuda_execution: false
actual_multi_device_execution: false
distributed_execution: false
universal_speedup_claim: false
geometry_receipt_authority: false
```
