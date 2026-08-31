# Phase 5C multi-GPU rental runbook

This runbook covers the prepared physical workflows for the expensive same-host Phase 5C campaigns:

- `GLUBALL Phase 5C 9x RTX 4090`
- `GLUBALL Phase 5C 16x RTX 5090`

The goal is to move setup, validation logic, scaling loops, sanitizer policy, and artifact packaging into reviewed repository code **before** renting the host. The rental should spend its paid lifetime executing the campaign, not waiting for workflow design.

These workflows are post-v1.0.0 runtime research. They do not revise frozen geometry or sampling contracts, do not grant GPU output geometry authority, and do not establish a universal speedup claim.

## Prepared campaign shapes

### 9x RTX 4090

```text
V1 correctness: first 8 GPUs, 3 accepted bounded repeats
Runtime V2 strong scaling: 1 / 2 / 4 / 8 / 9 GPUs
Runtime V2 weak scaling:   1 / 2 / 4 / 8 / 9 GPUs
Full-host graph pair:      9 GPUs, graphs OFF vs ON
Runtime V2 sanitizer:      bounded 1-GPU diagnostic run
```

### 16x RTX 5090

```text
V1 correctness: first 8 GPUs, 3 accepted bounded repeats
Runtime V2 strong scaling: 1 / 2 / 4 / 8 / 16 GPUs
Runtime V2 weak scaling:   1 / 2 / 4 / 8 / 16 GPUs
Full-host graph pair:      16 GPUs, graphs OFF vs ON
Runtime V2 sanitizer:      bounded 1-GPU diagnostic run
```

V1 stops at eight selected devices because `GLUBALL-MULTI-DEVICE-CUDA-V1` intentionally has an eight-device maximum. Runtime V2 is the separate throughput-only surface that supports up to sixteen selected devices. The larger host count therefore extends the scaling observation, not the V1 correctness contract.

## Default workload policy

The wrappers default to:

```text
V1 U=512
V1 V=32
V1 accepted runs=3

strong-scaling U=524288
V=128
weak-scaling U per device=32768
warmups=20
measured iterations=1000
block size=256
CUDA Graphs=OFF for the scaling ladders
```

The final full-host observation repeats the fixed strong-scaling workload with CUDA Graphs ON and compares it with the already-recorded full-host graphs-OFF result.

The Runtime V2 binary is configured and built once per workflow run. The scaling script then reuses that binary for every device count so rental time is not spent repeating CMake configuration and compilation.

## Runner labels

The dedicated ephemeral labels are:

```text
9x RTX 4090:  gluball-vast-9x4090
16x RTX 5090: gluball-vast-16x5090
```

Both workflows require Linux x86-64 self-hosted runners.

After renting a host, use:

```text
Settings -> Actions -> Runners -> New self-hosted runner
```

Choose Linux / x64 and use GitHub's current runner download, checksum, and extraction commands. Do not reuse old runner download URLs or registration tokens from prior rentals.

Configure the runner with the matching dedicated label and ephemeral mode. Example shape:

```bash
export RUNNER_ALLOW_RUNASROOT=1
./config.sh \
  --url https://github.com/QSOLKCB/GLUBALL \
  --token <ONE-TIME-TOKEN-FROM-GITHUB> \
  --name vast-phase5c \
  --labels <DEDICATED-LABEL> \
  --ephemeral \
  --unattended

./run.sh
```

Never paste or archive the one-time runner token.

## Paid-host prerequisites

Before runner registration, verify these commands exist so a bad rental can be terminated before more paid time is consumed:

```bash
uname -m
nvidia-smi --query-gpu=index,name,compute_cap --format=csv,noheader
nvcc --version
nvcc --list-gpu-arch
nvcc --list-gpu-code
rustc --version
cargo --version
cmake --version
compute-sanitizer --version
```

Expected host ISA:

```text
x86_64
```

The workflow does **not** hard-code a guessed compute capability for either GPU family. It records the selected host's actual compute capability, derives `compute_XX` / `sm_XX`, requires the installed compiler to support those targets, compiles with `native`, and then requires Runtime V2 to report the same resolved architecture.

That makes an unsuitable toolkit fail near the top of the workflow instead of after the expensive scaling campaign has started.

Raw CUDA UUIDs are never queried or published.

## Workflow execution order

The reusable core performs:

1. dispatch-input validation;
2. x86-64 host, GPU-count, homogeneous-model, compute-capability, and compiler-target validation;
3. exact source and toolchain provenance capture;
4. bounded V1 correctness acceptance on GPUs `0..7`;
5. V1 memcheck/racecheck verification using the proven dual-output archival policy;
6. one Runtime V2 build;
7. fixed-work strong-scaling ladder;
8. weak-scaling ladder with constant points per selected device;
9. full-host CUDA Graphs ON observation compared with the full-host graphs-OFF result;
10. bounded Runtime V2 memcheck/racecheck;
11. machine-readable strong/weak/graph summaries;
12. inner and outer SHA-256 manifests;
13. always-uploaded GitHub Actions artifact.

The strong-scaling verifier requires the aggregate diagnostic XOR and maximum tube-radius observation to remain identical across device counts for the fixed workload. The graph comparison requires the full-host graphs-OFF and graphs-ON diagnostics to match as well.

Weak scaling intentionally changes the domain size with device count, so its diagnostic digest is not compared across counts.

## Artifact and vaporization rule

Artifacts are named:

```text
gluball-phase5c-9x4090-<run-id>-<attempt>
gluball-phase5c-16x5090-<run-id>-<attempt>
```

Do **not** destroy the paid instance merely because the main job turns green.

The destruction gate is:

1. workflow conclusion is `success`;
2. all required physical steps are green;
3. the artifact exists in GitHub storage;
4. GitHub reports an artifact SHA-256;
5. the artifact is downloaded independently;
6. the downloaded ZIP SHA-256 matches GitHub's digest;
7. the inner `SHA256SUMS.txt` verifies;
8. the outer `BUNDLE_SHA256SUMS.txt` verifies.

Only after all eight checks pass is the rented instance safe to vaporize.

## Interpretation boundary

The workflows produce three different kinds of information that must remain separate:

```text
V1 full-readback + Rust acceptance -> correctness evidence
Runtime V2 strong/weak scaling      -> performance observation
full-host graph comparison          -> performance observation
```

Observed `T1/Tn`, parallel efficiency, weak-scaling time ratios, or graph ratios are properties of the exact host/toolchain/workload/run. They are not universal speedup claims.

Faster GPUs remain observation infrastructure, not geometry authority.
