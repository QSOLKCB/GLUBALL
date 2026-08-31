# Vast.ai 8-GPU physical evidence completion

This document covers the dedicated `GLUBALL physical CUDA 8-GPU completion` workflow.

It exists to finish the final device-count rung of the Phase 5B physical CUDA evidence ladder without modifying or rerunning the already archived 1 -> 2 -> 4 workflow.

The prior ladder is recorded in `docs/CURRENT_STATE.json`: GitHub Actions run `33378934659`, source commit `d73ad661464eb040e2966e5e9f036941543b4524`, artifact `9753091493`, ZIP SHA-256 `6ba740acf06617d0cf93d2d3548b6e0783994b88b9ed40ee342349f9f9d23747`. The downloaded root bundle and the 1-GPU, 2-GPU, and 4-GPU campaign manifests were independently verified before those roadmap rungs were checked.

## Evidence profile

The default RTX 4080 SUPER completion profile is intentionally identical to the accepted 1/2/4 ladder profile:

```text
U segments:          16384
V segments:          128
mesh repeats:        1
accepted runs:       3
CUDA architecture:  89
```

The workflow selects exactly:

```text
DEVICES=0,1,2,3,4,5,6,7
LOGICAL_DEVICE_SLOTS=8
```

Each of the three physical runs must complete the existing evidence path: full ordered CUDA readback, independent Rust full-domain residual acceptance, and Compute Sanitizer where available.

A successful run is correctness evidence only. It does not grant geometry authority and does not establish a universal speedup claim.

## Fail-closed host boundary

Before physical execution, the workflow requires:

- all dispatch inputs to be decimal positive integers within explicit workflow bounds;
- `u_segments <= 1000000`;
- `v_segments <= 65536`;
- `repeats <= 1024`;
- `accepted_runs <= 100`;
- at least eight visible NVIDIA GPUs;
- GPUs 0 through 7 to report one identical model name;
- the existing CUDA preflight to report READY.

Raw GPU UUIDs are not queried or published.

## Sanitizer archival boundary

After the campaign attempt, an `if: always()` step writes `8gpu/SANITIZER_STATUS.txt` and re-finalizes the inner `8gpu/SHA256SUMS.txt` so that status record is covered by the campaign manifest.

If `compute-sanitizer` is unavailable, the status file records explicit unavailability. If it is available, a green completion requires non-empty `memcheck.txt` and `racecheck.txt`; otherwise the status records `available-but-results-not-archived` and the workflow fails. The root bundle manifest is finalized afterward, binding the same status and campaign files again at the bundle level.

## Ephemeral runner registration

The runner used for the earlier 1 -> 2 -> 4 Actions job was registered with `--ephemeral`. An ephemeral runner accepts one job and then deregisters, so the same Vast host must be registered again before dispatching the 8-GPU completion workflow.

In the repository, open:

```text
Settings -> Actions -> Runners -> New self-hosted runner
```

Choose Linux and x64, then use GitHub's current download, checksum, and extraction commands.

Configure with the one-time token GitHub provides and the same dedicated label:

```bash
export RUNNER_ALLOW_RUNASROOT=1

./config.sh \
  --url https://github.com/QSOLKCB/GLUBALL \
  --token <ONE-TIME-TOKEN-FROM-GITHUB> \
  --name vast-8x4080s-8gpu-completion \
  --labels gluball-vast-8gpu \
  --ephemeral \
  --unattended
```

Do not commit, paste into public logs, or archive the one-time registration token.

Start the runner:

```bash
export RUNNER_ALLOW_RUNASROOT=1
./run.sh
```

Leave it listening for the single completion job.

## Dispatch

After the workflow is merged to `main`:

1. Open **Actions**.
2. Select **GLUBALL physical CUDA 8-GPU completion**.
3. Choose **Run workflow** on `main`.
4. Keep the default evidence profile above.
5. Dispatch the job while the ephemeral Vast runner is listening.

## Returned evidence

The workflow uploads an artifact named:

```text
gluball-physical-cuda-8gpu-<run-id>-<attempt>
```

with a structure shaped as:

```text
physical-evidence/
  SOURCE_COMMIT.txt
  HOST_UNAME.txt
  NVIDIA_DEVICES.txt
  NVIDIA_INVENTORY.csv
  SELECTED_GPU_MODEL.txt
  SELECTED_DEVICES.txt
  PREFLIGHT.txt
  BUNDLE_SHA256SUMS.txt
  8gpu/
    SANITIZER_STATUS.txt
    SHA256SUMS.txt
    cuda-run-1.json
    cuda-output-1.f32le
    cuda-acceptance-1.json
    cuda-run-2.json
    cuda-output-2.f32le
    cuda-acceptance-2.json
    cuda-run-3.json
    cuda-output-3.f32le
    cuda-acceptance-3.json
    memcheck.txt
    racecheck.txt
    ...
```

When Compute Sanitizer is unavailable, `SANITIZER_STATUS.txt` is retained while `memcheck.txt` and `racecheck.txt` are absent by design.

`BUNDLE_SHA256SUMS.txt` is finalized under `if: always()` and binds the source/provenance files to all available campaign evidence. The campaign's own `SHA256SUMS.txt` remains the inner evidence manifest.

The Phase 5B 8-GPU checkbox must remain unchecked until the physical workflow has actually completed, the three acceptance records are PASS, sanitizer evidence is archived or explicitly unavailable, and the downloaded bundle manifests verify.
