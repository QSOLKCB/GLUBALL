# GLUBALL Rust runtime

`GLUBALL-RUST-RUNTIME-V1` is an additive execution layer for the frozen `GLUBALL-KNOT-V1` geometry contract. It exists to move large deterministic simulations out of the browser/JavaScript performance envelope while preserving the geometry and sampling contracts as the authority boundary.

Repository release metadata still labels `v1.0.0` as a **release candidate**. This PR does not promote that state or treat an unverified release candidate as an immutable dependency. The Rust runtime does not silently revise `GLUBALL-KNOT-V1`, `GLUBALL-SAMPLING-V1`, or the v1.0.0 release manifest; release/handoff consumers must continue to follow the tag-target and release-preflight verification rules in `AGENTS.md` and `docs/AI_AGENT_CONTRACT.json`.

## Numeric policy

The runtime intentionally uses a split numeric model.

### Exact integers first

Use integers for quantities that are logically discrete:

- logical sample counts;
- rendered sample counts;
- sample indices;
- worker/shard boundaries;
- logical device-slot assignment;
- repeat counts;
- mesh indices.

`GLUBALL-SAMPLING-V1` uniform mapping is reproduced with a `u128` multiply/divide intermediate:

```text
logical(i) = floor(i * L / R)
```

The optional `phi-weyl-64` policy uses wrapping `u64` Weyl arithmetic and a `u128` product before the exact right shift.

The Rust V1 runtime accepts logical counts through `u64::MAX`. This is a declared execution bound, not a change to the more general JavaScript `BigInt` contract.

### Bounded floats only at the geometry boundary

Geometry needs transcendental functions, so floating point cannot be eliminated entirely. Instead the runtime:

- rejects NaN and infinities;
- rejects geometry magnitudes above the declared runtime bound;
- enforces `major_radius > minor_radius > 0`;
- enforces `0 < tube_radius < minor_radius`;
- derives simulation angles from integer index/count pairs;
- keeps generated angles in `[0, 2π)` before `sin`/`cos` evaluation;
- never accepts an unbounded simulation-time float as the primary work coordinate.

This gives us the useful performance of native `f64` while keeping the input domain small, explicit and auditable.

## CPU runtime

Build:

```bash
cargo build --release
```

Run the sealed sampling self-test:

```bash
cargo run --release -- self-test
```

Query an exact sampling index:

```bash
cargo run --release -- sample \
  --logical 4294967296 \
  --rendered 4096 \
  --index 2048 \
  --policy uniform-floor
```

Plan a large logical workload without evaluating geometry:

```bash
cargo run --release -- plan \
  --points 1000000000 \
  --workers 64 \
  --device-slots 8
```

Execute a native CPU geometry campaign:

```bash
cargo run --release -- simulate \
  --u 16384 \
  --v 128 \
  --repeats 8 \
  --workers 64 \
  --device-slots 8
```

The simulation partitions the complete linear point domain into deterministic contiguous ranges. Worker results are joined in worker order, so the runtime does not rely on nondeterministic floating-point reduction order. `SimulationConfig` fields are private and can only be created through the validated constructor, preventing library callers from bypassing count and overflow bounds.

## Diagnostic hash boundary

The CPU runtime emits a same-runtime diagnostic formed by XOR-folding position-bound FNV-1a-64 hashes of each output record. Each record hash binds the linear point index and the exact IEEE-754 bits of `x`, `y`, and `z`.

Because the global fold contains output records rather than worker IDs or shard boundaries, changing only `--workers` or logical device-slot scheduling does not change the aggregate diagnostic. The fold is deliberately a lightweight repeatability diagnostic, not a cryptographic receipt.

It is deliberately **not** called a `GLUBALL-EVIDENCE-V1` receipt because transcendental-library and architecture differences can change low floating-point bits across runtimes. A future cross-runtime residual layer must compare the Rust output against the frozen reference under an explicit tolerance contract rather than pretending bitwise `sin`/`cos` identity is universal.

## Vast.ai planning snapshot

`runtime/vast/market-2026-08-21.json` records the supplied marketplace observations for candidate 2-GPU and 8-GPU hosts. The file is planning input only. Prices, availability and marketplace performance figures are not GLUBALL evidence.

For an 8-GPU candidate, a pre-rental schedule can be inspected with:

```bash
cargo run --release -- plan \
  --points 1000000000 \
  --workers 128 \
  --device-slots 8
```

For a 2-GPU candidate:

```bash
cargo run --release -- plan \
  --points 1000000000 \
  --workers 64 \
  --device-slots 2
```

In runtime v0.1.0, `device-slots` are logical schedule labels only. The output therefore hard-codes:

```text
actual_cuda_execution: false
actual_multi_device_execution: false
distributed_execution: false
universal_speedup_claim: false
geometry_receipt_authority: false
```

## CUDA direction

The next accelerator step should keep **Rust as the host runtime/orchestrator** and add CUDA as an optional residual adapter rather than replacing the geometry authority.

Recommended shape:

```text
Rust bounded/exact runtime
        |
        +-- CPU f64 execution/reference
        |
        +-- deterministic shard/device plan
        |
        +-- CUDA adapter via explicit FFI / compiled kernel
                |
                +-- complete device readback
                +-- residual comparison against Rust CPU
                +-- repeated-run output checks
                +-- device/toolchain provenance sidecar
                +-- sanitizer evidence where available
```

For multi-GPU hosts, shard assignment should be deterministic and complete before any kernel is launched. CUDA timing must be kept separate from correctness evidence, and GPU output remains a residual sidecar rather than geometry authority.

This follows the useful RSH lesson: **source exists**, **source compiled**, and **hardware actually executed and passed residual gates** are three different claims.

## Validation

```bash
cargo test --all-targets
cargo run --release -- self-test
node tests/smoke.mjs
node tests/phase2.mjs
node tests/agent-contract.mjs
node tests/release-preflight.mjs
```

The Rust tests reproduce all three sealed sampling-vector families, validate bounded numeric inputs, check deterministic partitions, exercise geometry invariants, confirm same-runtime simulation repeatability, and verify that the aggregate output diagnostic is independent of worker sharding.
