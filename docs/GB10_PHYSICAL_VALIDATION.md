# GB10 physical validation workflow

This document covers the dedicated `GLUBALL GB10 physical validation` GitHub Actions workflow.

The workflow exists to turn the first NVIDIA GB10 portability experiment into a reproducible, artifact-backed run after Phase 5B graduation and the introduction of `GLUBALL-CUDA-RUNTIME-V2`.

It is post-v1.0.0 runtime research only. It does not modify the frozen GLUBALL geometry or sampling contracts, does not grant GPU output geometry authority, and does not establish a universal speedup claim.

## Why GB10

GB10 is intentionally a different portability specimen from the accepted RTX 4080 SUPER Phase 5B host:

- host ISA: `aarch64` rather than x86-64;
- GPU: NVIDIA GB10;
- physical compute capability: `12.1`;
- native Runtime V2 target: `sm_121`;
- CUDA driver/runtime used in the first physical experiment: `13.2`.

The initial Vast image exposed a useful toolchain boundary: its preinstalled CUDA 12.8 compiler listed `compute_120` / `sm_120` but not `compute_121`, so CMake `native` correctly resolved the GB10 as `compute_121` and CUDA 12.8 rejected the build. Installing the CUDA 13.2 toolkit, without replacing the working NVIDIA driver, provided native `compute_121` / `sm_121` support.

A bounded manual V1 campaign subsequently passed independent Rust full-readback acceptance. Runtime V2 graphs-OFF also completed successfully. The first graphs-ON attempt exposed a physical CUDA Graph event-timing bug, which was fixed in PR #12 and then verified manually on the same GB10.

The workflow below archives the clean reproducible state after those discoveries.

## Runner boundary

The workflow is manual-dispatch only and requires:

```text
[self-hosted, linux, ARM64, gluball-vast-gb10]
```

Use an ephemeral self-hosted runner. In the repository, open:

```text
Settings -> Actions -> Runners -> New self-hosted runner
```

Choose Linux and ARM64 and use GitHub's current runner download, checksum, and extraction commands.

Configure with the one-time token GitHub provides and the dedicated label:

```bash
export RUNNER_ALLOW_RUNASROOT=1

./config.sh \
  --url https://github.com/QSOLKCB/GLUBALL \
  --token <ONE-TIME-TOKEN-FROM-GITHUB> \
  --name vast-gb10-phase5c \
  --labels gluball-vast-gb10 \
  --ephemeral \
  --unattended
```

Do not commit, paste into public logs, or archive the one-time registration token.

Start the runner with:

```bash
export RUNNER_ALLOW_RUNASROOT=1
./run.sh
```

## Host prerequisites

The workflow intentionally does not install or replace GPU drivers or CUDA toolkits. The rented host must already provide:

```text
aarch64 host
NVIDIA GB10 as CUDA device 0
compute capability 12.1
/usr/local/cuda-13.2/bin/nvcc
native compute_121 / sm_121 compiler support
Rust stable toolchain in $HOME/.cargo/bin
CMake
Compute Sanitizer
```

The workflow verifies these conditions before physical execution and fails closed if they are not satisfied.

Raw CUDA UUIDs are not queried or published.

## Default validation profile

### V1 correctness rung

```text
U=512
V=32
REPEATS=1
accepted runs=3
device=0
CUDA architecture policy=native
```

Each run contains 16,384 points and must pass the existing full-readback Rust residual acceptance path. With three accepted repeats, the workflow checks 49,152 point-results through the independent Rust reference.

The V1 campaign also runs Compute Sanitizer memcheck and racecheck through the existing campaign script. The workflow requires archived clean summaries and verifies the V1 campaign `SHA256SUMS.txt` before continuing.

### Runtime V2 portability pair

```text
U=16384
V=128
REPEATS=1
block size=256
warmups=20
measured iterations=1000
device=0
CUDA architecture policy=native
```

The workflow runs the same Runtime V2 workload twice:

1. CUDA Graphs OFF;
2. CUDA Graphs ON.

Both observations must resolve the executing binary to `sm_121`, report one GB10 with device-side `__CUDA_ARCH__ = 1210`, retain clean and repeatable compact metrics, report zero non-finite records, stay within the compact tube-radius observation gate, and preserve the same aggregate diagnostic XOR and maximum tube-radius observation across graph policy.

The workflow records the observed graphs-OFF / graphs-ON wall-time ratio, but that ratio remains a same-run performance observation only. It is not a universal speedup claim.

## Runtime V2 sanitizer rung

After the timing pair, the workflow runs bounded Runtime V2 graphs-OFF executions under Compute Sanitizer memcheck and racecheck. Sanitizer timings are not performance evidence.

The run fails if Compute Sanitizer reports an error or if the clean summary cannot be found in the archived transcript.

## Returned artifact

The workflow uploads:

```text
gluball-physical-gb10-<run-id>-<attempt>
```

with a structure shaped as:

```text
physical-evidence/
  BUNDLE_SHA256SUMS.txt
  gb10/
    SOURCE_COMMIT.txt
    HOST_UNAME.txt
    HOST_ARCH.txt
    OS_RELEASE.txt
    NVIDIA_DEVICES.txt
    NVIDIA_INVENTORY.csv
    SELECTED_GPU_MODEL.txt
    SELECTED_DEVICES.txt
    NVCC_13_2.txt
    NVCC_GPU_ARCHS.txt
    NVCC_GPU_CODE.txt
    CUDA_12_8_TOOLCHAIN_OBSERVATION.txt
    RUSTC.txt
    CARGO.txt
    CMAKE.txt
    COMPUTE_SANITIZER.txt
    V1_VALIDATION.json
    V1_SANITIZER_STATUS.txt
    RUNTIME_V2_COMPARISON.json
    V2_SANITIZER_STATUS.txt
    VALIDATION_STATUS.json
    SHA256SUMS.txt
    v1-acceptance/
      ...
      SHA256SUMS.txt
    runtime-v2/
      graphs-off.json
      graphs-on.json
    runtime-v2-sanitizer/
      memcheck.txt
      racecheck.txt
```

The final GB10 `SHA256SUMS.txt` binds all available GB10 evidence, and the outer `BUNDLE_SHA256SUMS.txt` binds the full uploaded bundle.

## Promotion rule

Creating or merging this workflow does not itself complete GB10 physical validation.

`docs/CURRENT_STATE.json` must keep Runtime V2 physical validation pending until all of the following exist from an actual workflow run:

1. workflow conclusion `success`;
2. three V1 acceptance records with `status: PASS`;
3. clean V1 sanitizer evidence;
4. successful Runtime V2 graphs-OFF JSON;
5. successful Runtime V2 graphs-ON JSON;
6. resolved native architecture `sm_121`;
7. clean Runtime V2 sanitizer evidence;
8. `VALIDATION_STATUS.json` reports `PASS`;
9. downloaded inner and outer manifests verify independently.

Only after those gates are checked should a later archival/state PR set `physical_validation_pending` to false.
