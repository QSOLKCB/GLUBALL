# Vast.ai ephemeral GitHub Actions runner

This document describes the optional self-hosted runner used for the post-v1.0.0 physical CUDA evidence ladder.

The runner is **execution infrastructure only**. It does not become geometry authority, receipt authority, or empirical validation merely because GitHub Actions orchestrates it.

## Why one ephemeral runner

The `GLUBALL physical CUDA 1-2-4 ladder` workflow runs the 1-GPU, 2-GPU, and 4-GPU evidence campaigns **sequentially on one rented host**.

That preserves the intended comparison boundary:

```text
same source commit
same host
same driver
same CUDA toolkit
same CPU / motherboard
same GPU model
same workload
only selected device count changes: 1 -> 2 -> 4
```

The workflow is not a matrix because concurrent jobs on one 8-GPU host would create resource contention and weaken the interpretation of the timing observations.

Before executing the ladder, the workflow fails closed unless:

- all dispatch count/architecture inputs are positive integers;
- at least four GPUs are visible;
- GPUs 0 through 3 all report the same model name.

These checks prevent a zero-run green workflow and prevent heterogeneous devices from being treated as a controlled same-model comparison.

## Security boundary

GLUBALL is a public repository. A persistent public-repository self-hosted runner is therefore intentionally avoided.

The physical workflow:

- is `workflow_dispatch` only;
- has no `pull_request`, `pull_request_target`, `push`, or scheduled trigger;
- requires the custom runner label `gluball-vast-8gpu`;
- uses `contents: read` permissions;
- runs the complete 1/2/4 ladder as one job;
- is intended for an **ephemeral** runner that accepts one job and then deregisters.

Do not register a long-lived Vast host that is eligible for arbitrary repository workflows.

## Register the current Vast host

1. Open the GitHub repository.
2. Go to **Settings -> Actions -> Runners -> New self-hosted runner**.
3. Choose **Linux** and **x64**.
4. In the Vast SSH/tmux terminal, use the download and extraction commands GitHub displays. These include the current runner version and checksum.
5. When running the generated `config.sh` command, add the following options:

```text
--labels gluball-vast-8gpu --ephemeral --unattended
```

Use a descriptive runner name, for example:

```text
vast-8x4080s-20260831
```

A representative configuration shape is:

```bash
./config.sh \
  --url https://github.com/QSOLKCB/GLUBALL \
  --token <ONE-TIME-TOKEN-FROM-GITHUB> \
  --name vast-8x4080s-20260831 \
  --labels gluball-vast-8gpu \
  --ephemeral \
  --unattended
```

Do not commit or archive the one-time registration token.

Then start the runner in the existing tmux session:

```bash
./run.sh
```

Leave that process waiting for one job.

## Dispatch the ladder

After the workflow is present on `main`:

1. Open **Actions**.
2. Select **GLUBALL physical CUDA 1-2-4 ladder**.
3. Choose **Run workflow** on `main`.
4. For the first RTX 4080 SUPER ladder, keep the defaults:

```text
U segments:          16384
V segments:          128
mesh repeats:        1
accepted runs:       3
CUDA architecture:  89
```

The workflow selects:

```text
1 GPU:  DEVICES=0
2 GPU:  DEVICES=0,1
4 GPU:  DEVICES=0,1,2,3
```

Each stage calls `scripts/run_vast_campaign.sh` in evidence mode, including complete CUDA readback, independent Rust residual acceptance, and Compute Sanitizer where available.

## Evidence returned to GitHub

The workflow uploads one Actions artifact containing:

```text
physical-evidence/
  SOURCE_COMMIT.txt
  HOST_UNAME.txt
  NVIDIA_DEVICES.txt
  NVIDIA_INVENTORY.csv
  SELECTED_GPU_MODEL.txt
  PREFLIGHT.txt
  BUNDLE_SHA256SUMS.txt
  1gpu/
  2gpu/
  4gpu/
```

Each completed device-count directory retains its normal campaign outputs, including `SHA256SUMS.txt`, CUDA sidecars, full-readback artifacts, Rust acceptance records, and sanitizer evidence.

`BUNDLE_SHA256SUMS.txt` is finalized under `if: always()` after the ladder attempt and hashes every available file in `physical-evidence/` except itself. This binds the exact source commit and redacted host/GPU provenance to the returned bundle, including partial evidence when a later stage rejects.

The upload step also uses `if: always()`. Therefore an accepted 1-GPU campaign is still returned if a later 2-GPU or 4-GPU stage rejects and stops the job.

GitHub's uploaded Actions artifact is a transport/archive convenience. The campaign manifests plus the root bundle manifest and separately recorded archive hashes form the evidence-integrity surface.

## Interpretation

A green workflow means the requested physical ladder completed its declared acceptance checks on the registered runner.

It does **not** mean:

```text
GitHub-hosted runners executed CUDA
GPU output became GLUBALL geometry authority
accepted residuals prove a physical model
1/2/4 timing proves universal scaling
an Actions artifact replaces the frozen GLUBALL-EVIDENCE-V1 contract
```

Performance analysis belongs to Phase 5C and must remain separate from correctness acceptance.
