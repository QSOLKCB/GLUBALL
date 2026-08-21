# Future RSH runtime handoff

GLUBALL's native runtime is being designed so it can later be attached to `QSOLKCB/RSH` as an additive geometry/runtime family, following the same separation-of-authority pattern already used by RSH's native, WASM and CUDA surfaces.

## Non-negotiable boundary

The later integration must preserve both projects' existing authorities:

```text
RSH-FORMAL-V1 / existing Robitaille–Slade helix
        remains intact

GLUBALL-KNOT-V1 / GLUBALL-SAMPLING-V1
        remain GLUBALL authorities

GLUBALL-RUST-RUNTIME-V1
        is an execution implementation

GLUBALL CUDA evidence
        is an accelerator residual sidecar
```

No successful GPU run is allowed to silently become a theorem, geometry definition, or QCD claim.

## Proposed additive RSH surface

A future RSH integration may define a separately versioned surface such as:

```text
RSH-GLUBALL-RUNTIME-V1
```

Its job would be to bind exact source provenance and expose GLUBALL execution through RSH without replacing either `RSH-FORMAL-V1` or the already planned `RSH-GLUBALL-FORMAL-V1` theorem surface.

The runtime handoff should record:

- exact GLUBALL release/tag and source commit;
- exact Rust runtime contract/version and source commit;
- frozen GLUBALL sampling vectors used for conformance;
- accepted CPU reference profile;
- accepted CUDA sidecar profile(s), if any;
- hardware evidence campaign IDs and hashes;
- explicit claim boundaries;
- rejected runs where relevant to audit history.

## What we can reuse from RSH

The useful reusable engineering already present in RSH includes:

- Rust as a trusted native host/oracle surface;
- C/CUDA as optional adapters rather than semantic authorities;
- deterministic contiguous shard composition;
- explicit one-stream-per-device execution policy where appropriate;
- unique selected-device validation;
- complete readback for evidence profiles;
- physical-run repeatability checks;
- residual gates against an independent reference;
- Compute Sanitizer memcheck/racecheck evidence;
- raw CUDA UUID suppression with redacted correlation tokens;
- separate portable and protected-hardware workflows;
- explicit `actual_cuda_execution` and `actual_multi_device_execution` claims;
- permanent false values for `distributed_execution`, `universal_speedup_claim`, and `geometry_receipt_authority` unless an independently versioned future contract establishes otherwise.

The implementations should be adapted to GLUBALL's own data model rather than copying RSH's Frenet path equations.

## Suggested integration sequence

1. Merge and stabilize `GLUBALL-RUST-RUNTIME-V1` in GLUBALL.
2. Produce a CPU reference evidence profile and sealed runtime vectors.
3. Add the GLUBALL CUDA adapter.
4. Run single-GPU and multi-GPU hardware evidence campaigns.
5. Seal accepted campaign metadata and archive rejected completed runs.
6. Add or complete `RSH-GLUBALL-FORMAL-V1` without depending on GPU execution.
7. Only then open the additive RSH runtime handoff PR.
8. Pin the exact GLUBALL commit/release used by RSH.
9. Extend RSH's existing proof-hole, axiom and release audits rather than weakening them.

## Why this shape matters

It gives us the fun part, namely absurdly large rented-GPU experiments, while keeping the boring part wonderfully strict. The GPUs get to be engines. They do not get to become philosophers, geometers, or particle physicists merely because their fans are louder. 😄
