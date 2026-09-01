# GLUBALL CUDA Runtime V3.1 Architecture Ladder

This campaign measures the same frozen Runtime V2/V3/V3.1 workload across a deliberately broad NVIDIA architecture ladder.

The physical sequence is:

```text
sm_61   GTX 1080 Ti   Pascal     completed baseline
sm_61   Titan Xp      Pascal     completed follow-up
sm_70   V100          Volta      next measurement
sm_75   T4            Turing     next measurement
sm_80   A100          Ampere     next measurement
sm_90   H200          Hopper     next measurement
sm_100  B200          Blackwell  next measurement
```

The purpose is not to turn rented GPU timings into a universal ranking. The purpose is to observe how one fixed Runtime V3.1 experiment behaves as execution hardware evolves from Pascal through Blackwell.

## Frozen runtime target

Runtime implementation source is frozen while the post-PR20 ladder is measured:

```text
Runtime V2 blob    12d49ec6f78a28ed8d6afb5e8c7df80961c8bfc1
Runtime V3 blob    dc8e9b209abee3794e5e56d0b92fa6d40dd03fd0
Runtime V3.1 blob  045fbf37725beb5d65b2332309626ccfa727f874
```

No Runtime V1, V2, V3 or V3.1 CUDA implementation change belongs inside the V100/T4/A100/H200/B200 measurement sequence.

The five post-PR20 measurements should be dispatched from the same merged `main` commit. That preserves both the exact-source comparator gate and the fixed-workload interpretation.

Same-commit comparison is not the only source-integrity gate. Before any physical measurement begins, the runner recomputes the Git blob identity of the checked-out Runtime V2, V3 and V3.1 source files and requires the exact frozen values above. It also requires the machine-readable ladder contract to contain that same frozen map. The result is archived as:

```text
FROZEN_RUNTIME_SOURCE_VALIDATION.json
```

and successful validation creates:

```text
FROZEN_RUNTIME_SOURCES.ok
```

Frozen-source validation is a graduation gate for every post-PR20 physical run.

## Completed physical anchors

The original GTX 1080 Ti Runtime V3.1 graduation remains the baseline:

```text
run:       33453555600
source:    32f2e74f83e8ea1d3abe6338486effe4895006f0
artifact:  9780653297
sha256:    5d02e119e3fb4e32957a0c4c7492dcb839ccc782dcdcb851cb4a44fdb7e7a5be
winner:    block 512 / graphs off / two-stage
```

The independent Titan Xp Pascal follow-up also completed successfully:

```text
run:       33462064226
source:    93f8eaab5485725ef18d7bb2b21e75121b27fdab
artifact:  9783551996
sha256:    4461c245997982a576707e1e33f36d530798173758f5bbb42aa0a67cd18de4ea
winner:    block 256 / graphs off / atomic
```

Both Pascal specimens observed the same diagnostic relationship:

```text
V2    1e15cffd50e6f653
V3    1e206a0f3b649b9a
V3.1  1e206a0f3b649b9a
```

V2/V3 raw-float digest equality is not required. Exact same-device V3/V3.1 digest equality remains required.

## Machine-readable profile registry

The canonical profile definitions live in:

```text
docs/CUDA_RUNTIME_V31_ARCHITECTURE_PROFILES.json
```

The workflow, physical runner, tests and cross-profile comparator use this registry instead of maintaining independent model/SM tables.

Each profile contains an anchored, case-insensitive model regular expression plus its exact compute capability and native SM. In particular, the V100 rule is anchored to the V100 product name and therefore does **not** accept a Quadro GV100 simply because both devices are `sm_70`.

Conceptually the registry binds:

```text
titan-xp  -> TITAN Xp product identity -> 6.1  -> sm_61   Pascal
v100      -> V100 product identity     -> 7.0  -> sm_70   Volta
t4        -> T4 product identity       -> 7.5  -> sm_75   Turing
a100      -> A100 product identity     -> 8.0  -> sm_80   Ampere
h200      -> H200 product identity     -> 9.0  -> sm_90   Hopper
b200      -> B200 product identity     -> 10.0 -> sm_100  Blackwell
```

A physical campaign must satisfy all identity checks before expensive work begins:

1. the actual GPU model fully matches the profile's anchored case-insensitive model regex;
2. the physical compute capability equals the registry capability;
3. the discovered native `sm_XX` equals the registry SM;
4. the installed CUDA toolkit advertises both the corresponding `compute_XX` and native `sm_XX` targets.

The exact profile definition used by a run is archived as `PROFILE_DEFINITION.json`. Finalization parses and semantically validates that record, including schema, matching profile name, model regex, compute capability, native SM consistency and required metadata. Mere file existence is not sufficient for PASS.

## One workflow, reusable rental loop

The manual workflow is:

```text
GLUBALL Runtime V3.1 architecture ladder
```

Available profiles:

```text
titan-xp
v100
t4
a100
h200
b200
```

All profiles use the same ephemeral self-hosted runner label:

```text
gluball-vast-v31-architecture
```

The intended rental loop is deliberately boring:

```text
rent one GPU
register ephemeral runner
choose profile
run canonical campaign
download and independently verify artifact
destroy rental
repeat
```

After PR20 merges, the preferred order is:

```text
v100 -> t4 -> a100 -> h200 -> b200
```

Do not modify Runtime V2/V3/V3.1 source between those five runs.

## Canonical cross-generation workload

The comparison surface remains fixed:

```text
U                         16384
V                         128
repeats                   1
warmup iterations         20
measured iterations       1000
trials/candidate          3
block-size candidates     32,64,128,256,512,1024
CUDA Graph modes          off,on
reduction modes           atomic,two-stage
```

The fixed workload is intentional. Architecture-specific saturation experiments can be added later, but they are a different experiment and must not replace this canonical ladder.

## Per-profile physical stages

Every post-PR20 profile must complete:

1. semantic profile-definition binding;
2. exact frozen Runtime V2/V3/V3.1 Git-blob validation;
3. safe host/CUDA provenance and exact GPU identity validation;
4. bounded V1 full-readback correctness acceptance with three repeat runs;
5. shared V2/V3/V3.1 observations plus exact same-device V3/V3.1 digest equivalence in atomic mode;
6. the same comparison in two-stage mode;
7. all 24 Runtime V3.1 tuner candidates with 12 matched Runtime V3 baselines;
8. direct Runtime V3.1 memcheck and racecheck for both reduction modes;
9. compiler-resource telemetry capture where available;
10. machine-readable finalization and SHA-256 bundle manifest.

The V1 evidence path remains the correctness authority. Runtime V2/V3/V3.1 throughput observations remain non-authoritative for geometry.

## Compiler resource telemetry

Each architecture run attempts a CUDA build with:

```text
--ptxas-options=-v
```

for Runtime V2, Runtime V3 and Runtime V3.1.

The transcript and `RESOURCE_CAPTURE_STATUS.json` expose architecture-dependent register counts, spills, shared-memory use and related PTXAS diagnostics.

Compiler telemetry is not a graduation gate because toolkit output behavior may vary. A telemetry failure must not be confused with a CUDA correctness or equivalence failure.

## Architecture result

Each successful profile emits:

```text
ARCHITECTURE_RESULT.json
```

which binds:

- source commit;
- validated frozen Runtime V2/V3/V3.1 source identities;
- profile name and semantically validated archived profile definition;
- safe GPU model, compute capability and native SM;
- canonical workload;
- V1 repeatability summary;
- atomic and two-stage equivalence summaries;
- tuner winner and candidate counts;
- compiler resource telemetry status;
- unchanged claim boundaries.

Raw GPU UUIDs are never queried or published by the workflow provenance path.

## Cross-generation comparison

After two artifacts from the post-PR20 measurement set have been downloaded and independently verified, compare their architecture results with:

```bash
python3 scripts/compare_cuda_runtime_v31_architecture_results.py \
  left/ARCHITECTURE_RESULT.json \
  right/ARCHITECTURE_RESULT.json \
  --output LEFT_VS_RIGHT.json
```

The comparator requires:

```text
both individual profile results PASS
both identities valid against the checked-in profile registry
both embedded profile definitions equal their checked-in registry definitions
same source commit
same canonical workload
valid within-device V3/V3.1 diagnostic equivalence
```

It does not require cross-device raw-float digest equality. A diagnostic digest is not geometry authority, and different architectures/toolchains may produce different binary32 representations while satisfying the accepted observation boundary.

Any wall-time ratio is diagnostic for these specimens and this workload only.

## Claim boundary

The architecture ladder never promotes accelerator evidence into a geometry receipt or universal hardware claim:

```text
performance_observation_only:              true
geometry_receipt_authority:                false
universal_speedup_claim:                   false
raw_device_uuid_published:                 false
cross_device_portability_claim:            false
cross_device_digest_equality_required:     false
within_device_v3_v31_digest_equality:      required
```

Marketplace instance IDs, prices and availability are external rental logistics, not part of the scientific contract. Preserve them separately if useful for cost accounting, but do not bind a runtime result to a transient marketplace listing.
