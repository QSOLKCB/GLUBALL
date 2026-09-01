# GLUBALL CUDA Runtime V3.1 Architecture Ladder

This campaign extends the accepted Runtime V3.1 physical program from the GTX 1080 Ti baseline to two deliberately distant hardware classes:

```text
Titan Xp  -> low-cost Pascal follow-up
H200      -> high-end Hopper datacenter follow-up
```

The purpose is not to turn two rental results into a universal GPU ranking. The purpose is to observe how the same Runtime V2/V3/V3.1 workload, reduction topology, launch shape and compiler resource footprint behave across a much wider hardware envelope.

## Frozen starting point

The architecture ladder begins after the accepted GTX 1080 Ti Runtime V3.1 campaign:

```text
run:       33453555600
source:    32f2e74f83e8ea1d3abe6338486effe4895006f0
artifact:  9780653297
sha256:    5d02e119e3fb4e32957a0c4c7492dcb839ccc782dcdcb851cb4a44fdb7e7a5be
```

That run established the V3.1 physical baseline, including V1 correctness acceptance, atomic/two-stage equivalence, the full 24-candidate tuner, and clean Runtime V3.1 memcheck/racecheck in both reduction modes.

## One workflow, two profiles

The manual workflow is:

```text
GLUBALL Runtime V3.1 architecture ladder
```

with the profile choice:

```text
titan-xp
h200
```

Both use the same self-hosted runner label:

```text
gluball-vast-v31-architecture
```

The runner is expected to be ephemeral. Register the rented machine, run one profile, preserve the uploaded artifact, then destroy the rental only after the artifact has been independently verified.

The workflow validates the actual GPU model before doing expensive work. The model match is case-insensitive and intentionally narrow:

```text
titan-xp -> TITAN Xp
h200     -> H200
```

Compute capability is discovered from the physical device at runtime. The workflow then requires the installed CUDA toolkit to advertise both the matching `compute_XX` and native `sm_XX` targets before continuing.

## Canonical cross-generation workload

The default comparison surface remains fixed across profiles:

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

The fixed workload is deliberate. Changing the workload per architecture would make the resulting timing ladder harder to interpret.

## Per-profile physical stages

Every profile must complete:

1. safe host and CUDA provenance;
2. bounded V1 full-readback correctness acceptance with three repeat runs;
3. exact shared V2/V3/V3.1 observations plus exact same-device V3/V3.1 digest equivalence in atomic mode;
4. the same comparison in two-stage mode;
5. all 24 Runtime V3.1 tuner candidates with 12 matched Runtime V3 baselines;
6. direct Runtime V3.1 memcheck and racecheck for both reduction modes;
7. machine-readable finalization and SHA-256 bundle manifest.

The V1 evidence path remains the correctness authority. Runtime V2/V3/V3.1 throughput observations remain non-authoritative for geometry.

## Compiler resource telemetry

The architecture workflow additionally performs a best-effort CUDA build with:

```text
--ptxas-options=-v
```

for Runtime V2, Runtime V3 and Runtime V3.1.

The build transcript and a small `RESOURCE_CAPTURE_STATUS.json` are archived. This is intended to expose architecture-dependent register counts, spills, shared-memory use and other PTXAS diagnostics now that the first weak-GPU measurement has been completed.

Compiler resource telemetry is **not** a graduation gate. Toolkit output formatting can change, and a telemetry-capture problem must not be confused with a CUDA correctness or equivalence failure.

## Architecture result

Each successful profile emits:

```text
ARCHITECTURE_RESULT.json
```

which binds:

- source commit;
- profile and safe GPU identity fields;
- discovered compute capability / native SM;
- canonical workload;
- V1 repeatability summary;
- atomic and two-stage equivalence summaries;
- tuner winner and candidate counts;
- compiler resource telemetry status;
- unchanged claim boundaries.

Raw GPU UUIDs are never queried or published.

## Cross-generation comparison

After both physical artifacts have been downloaded and verified, compare their `ARCHITECTURE_RESULT.json` files with:

```bash
python3 scripts/compare_cuda_runtime_v31_architecture_results.py \
  titan-xp/ARCHITECTURE_RESULT.json \
  h200/ARCHITECTURE_RESULT.json \
  --output TITAN_XP_VS_H200.json
```

The comparator requires:

```text
same source commit
same canonical workload
both individual profile results PASS
```

It does **not** require cross-device raw-float digest equality. A digest is an execution diagnostic, not geometry authority, and different GPU architectures/toolchains may produce different binary32 representations while satisfying the accepted observation boundary.

The comparator may report an observed wall-time ratio between the two physical runs, but that value is explicitly diagnostic for this workload and these specimens only.

## Claim boundary

The architecture ladder never promotes performance evidence into a geometry receipt or universal hardware claim:

```text
performance_observation_only:              true
geometry_receipt_authority:                false
universal_speedup_claim:                   false
raw_device_uuid_published:                 false
cross_device_portability_claim:            false
cross_device_digest_equality_required:     false
within_device_v3_v31_digest_equality:      required
```

Marketplace instance IDs, prices and availability are external rental logistics, not part of the scientific contract. Preserve them separately if useful for cost accounting, but do not bind the runtime result to a transient marketplace listing.
