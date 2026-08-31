# CUDA Runtime V3.1 Pascal Run 1 diagnostic

Status: **partial physical evidence; not a Runtime V3.1 graduation record**

Workflow run:

```text
https://github.com/QSOLKCB/GLUBALL/actions/runs/33443149115
```

Source commit:

```text
c75032d61521496f6261c37a93b61d144783e4ca
```

Artifact:

```text
ID:     9777018993
name:   gluball-runtime-v31-efficiency-33443149115-1
SHA256: 6ae64355ebe590e916068bf70804e3a4384315096c205b4e6f9451a171d07353
```

## Why this record exists

The first physical weak-GPU workflow attempt stopped after the V1 correctness anchor because the workflow verifier searched for the stale filename pattern:

```text
acceptance-run-*.json
```

while `scripts/run_vast_campaign.sh` actually emitted:

```text
cuda-acceptance-1.json
cuda-acceptance-2.json
cuda-acceptance-3.json
```

The failure therefore occurred in workflow evidence discovery after the underlying V1 physical work had completed successfully. Runtime V2/V3/V3.1 comparison, tuning and V3.1 sanitizer stages did not execute.

This document preserves the physical observations that were actually obtained without promoting the failed workflow to a V3.1 graduation result.

## Physical host observation

The workflow recorded:

```text
host architecture:       x86_64
GPU:                     NVIDIA GeForce GTX 1080 Ti
compute capability:      6.1
VRAM:                    11264 MiB
driver:                  570.172.08
CUDA toolkit / nvcc:     12.8 / 12.8.93
Rust:                    1.98.0
Cargo:                   1.98.0
CMake:                   3.28.3
Compute Sanitizer:       2025.1.0.0 build 35583870
```

The native CUDA 12.8 toolchain advertised both `compute_61` and `sm_61`, and the V1 CUDA targets compiled successfully for the physical Pascal device.

No raw CUDA UUID is published in this record.

## V1 physical correctness observations

Three bounded V1 runs completed and each independent Rust acceptance record reported `PASS`.

Each run checked:

```text
16,384 points
complete output readback: true
reference residual checked: true
conformance acceptance: true
nonfinite records: 0
geometry receipt authority: false
universal speedup claim: false
```

All three repeats observed the same residual profile:

```text
max component residual:          2.58321081059165181e-6
max Euclidean residual:          3.12377845889494076e-6
max reported tube-radius error:  1.78813934326171875e-7
worst linear index:              15742
evidence artifact FNV-1a64:      0fd0b3ab807341fe
```

The three complete CUDA output fields were byte-identical:

```text
SHA256
4ac6d9175955222d77eaf02133613c3d3edd0715b0838e4affb3a3f44b2daeeb
```

The CUDA sidecar files are not expected to be byte-identical because run-specific metadata changes between repeats.

## Sanitizer observation

V1 Compute Sanitizer completed cleanly.

The physical Pascal host reproduced the previously observed dual-location archival behavior:

```text
memcheck.txt       empty
memcheck-run.json  contains: ERROR SUMMARY: 0 errors

racecheck.txt      empty
racecheck-run.json contains: RACECHECK SUMMARY: 0 hazards displayed (0 errors, 0 warnings)
```

This independently reinforces the existing policy that clean V1 sanitizer evidence must be accepted from either the text transcript or the run-JSON transcript, while still requiring the exact clean summary.

## Workflow failure boundary

The physical work reached:

```text
host validation                 PASS
V1 bounded correctness anchor   PASS
V1 memcheck/racecheck execution PASS
```

The next verifier failed before it could create `V1_VALIDATION.ok` because it found zero files under the stale `acceptance-run-*.json` glob.

Therefore these stages were not executed:

```text
V2/V3/V3.1 atomic equivalence
V2/V3/V3.1 two-stage equivalence
24-candidate Runtime V3.1 tuner
matched Runtime V3 baselines
Runtime V3.1 atomic sanitizers
Runtime V3.1 two-stage sanitizers
```

No Runtime V3.1 speedup, equivalence, tuning winner or sanitizer conclusion may be inferred from run `33443149115`.

## Hardening derived from this run

The follow-up workflow hardening:

1. discovers the actual `cuda-acceptance-N.json`, `cuda-output-N.f32le`, and `cuda-run-N.json` artifact families;
2. requires three correctly numbered acceptance records, sidecars and complete output fields;
3. requires each acceptance record to preserve the V1 correctness and authority boundaries;
4. checks repeat stability for the residual tuple, worst index and evidence-output FNV;
5. hashes all complete output fields and requires byte-identical repetition;
6. retains the proven dual-location sanitizer summary search;
7. emits `V1_VALIDATION.json` as a machine-readable physical V1 summary;
8. enriches final failure bundles with completed-stage and first-incomplete-stage metadata so partial evidence remains auditable.

## Evidence boundary

This diagnostic establishes only what the physical artifact and run logs contain.

It does **not** establish:

```text
Runtime V3.1 exact equivalence
Runtime V3.1 performance improvement
best V3.1 tuner candidate
universal speedup
geometry receipt authority
```

The GTX 1080 Ti must be re-registered as a fresh ephemeral runner and a new workflow dispatch must complete the remaining Runtime V3.1 physical gates.
