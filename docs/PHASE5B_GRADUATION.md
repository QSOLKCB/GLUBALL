# Phase 5B graduation record

Phase 5B, the first physical CUDA evidence ladder, is complete.

This record is post-v1.0.0 runtime evidence only. It does not modify `GLUBALL-KNOT-V1`, `GLUBALL-SAMPLING-V1`, or `GLUBALL-EVIDENCE-V1`; it does not grant GPU output geometry authority; and it does not establish a universal speedup claim.

## Accepted 1 / 2 / 4 GPU ladder

- GitHub Actions run: `33378934659`
- Source commit: `d73ad661464eb040e2966e5e9f036941543b4524`
- Artifact ID: `9753091493`
- Artifact name: `gluball-physical-cuda-1-2-4-33378934659-1`
- Artifact ZIP SHA-256: `6ba740acf06617d0cf93d2d3548b6e0783994b88b9ed40ee342349f9f9d23747`
- Device-count stages: `1`, `2`, `4`
- Accepted runs per stage: `3`
- Checked points per run: `2,097,152`
- Acceptance records: all `PASS`
- Complete ordered CUDA readback: yes
- Independent Rust residual acceptance: yes
- Non-finite records: `0`
- Compute Sanitizer evidence: archived and clean
- Downloaded root bundle manifest: verified
- Downloaded 1/2/4 campaign manifests: verified

## Accepted 8 GPU completion rung

- GitHub Actions run: `33388107831`
- Source commit: `0505b6e20e4f79514671fd63bb1e1f6d997a4493`
- Artifact ID: `9756414599`
- Artifact name: `gluball-physical-cuda-8gpu-33388107831-1`
- Artifact size: `73,299,290` bytes
- Artifact ZIP SHA-256: `fd75447d5dbd88909a69339627c3e0114627aca5b7bfb66a0c9705b7fd03944d`
- GPU model: NVIDIA GeForce RTX 4080 SUPER
- Driver: `580.126.09`
- CUDA compiler: `12.8.93`
- Compute capability: `8.9`
- Compile architecture: `89`
- Workload: `U=16384`, `V=128`, `REPEATS=1`
- Accepted runs: `3`
- Checked points per run: `2,097,152`
- Total checked points: `6,291,456`
- Acceptance records: all `PASS`
- Complete ordered CUDA readback: yes
- Independent Rust residual acceptance: yes
- Non-finite records: `0`
- Maximum component residual: `3.1109830103126512e-6`
- Maximum Euclidean residual: `3.7212802066233174e-6`
- Maximum reported tube-radius error: `1.7881393432617188e-7`
- Ordered evidence FNV-1a64: `00df5fa1f21cfa24` on all three accepted runs
- Compute Sanitizer memcheck: `0` errors
- Compute Sanitizer racecheck: `0` hazards, `0` errors, `0` warnings
- Downloaded inner `SHA256SUMS.txt`: verified
- Downloaded outer `BUNDLE_SHA256SUMS.txt`: verified

## Graduation statement

The complete first physical ladder therefore contains twelve accepted CUDA evidence runs across device counts `1 / 2 / 4 / 8`, totaling `25,165,824` independently Rust-checked point-results.

The Phase 5B gates for complete coverage, independent Rust residual acceptance, sanitizer archival, and exact redacted host/device provenance are satisfied.

Phase 5C performance work may now proceed as a separate observational surface. Runtime optimization and scaling results must remain distinct from correctness acceptance and from the frozen geometry contract.
