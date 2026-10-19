# GTX 1650: separate successful specimen, run 39230458215

[Physical job](https://github.com/QSOLKCB/GLUBALL/actions/runs/39230458215/job/117986896315), attempt 1, completed successfully with all 16 job steps successful. The producing checkout is `daff00294fe64ccf2d950e98c5bd652b274dfc5d`. The [accepted-artifact record](../CUDA_RUNTIME_V31_GTX1650_RUN_39230458215.json) is a derived index; original receipt bytes remain in the durable bundle.

## Custody and durable reconstruction

Downloaded artifact `12175229905`, `gluball-v31-architecture-gtx-1650-39230458215-1`, is 867,304 bytes. Its computed ZIP SHA-256 matches the GitHub artifact digest:

`b532089cba263c401b001bbf124e2547a2c7d4401af569daae26520eac6ca9a7`.

Before extraction, the ZIP passed CRC validation and checks rejecting absolute/traversal paths, backslashes, duplicate member names and symlinks. It contains 180 regular files (1,475,972 uncompressed bytes). All 179 files named by the original `BUNDLE_SHA256SUMS.txt` verified, including all 17 entries of the nested V1 manifest.

This archive follows the existing durable gzip/JSON receipt-bundle format, retaining **all 179 manifested files byte-for-byte**, including the three raw V1 outputs, all tuning trials, sanitizer logs and environment receipts. The original manifest is retained separately. Historical GTX 1650, RTX 3050 and GT 730 fixtures are unchanged. The ZIP container itself is not retained; the artifact digest records original-download custody, while the manifest and durable-bundle digest independently authenticate the retained contents. GitHub Actions retention is not required to reconstruct these files.

To verify the archive without a GPU:

```sh
node tests/cuda-runtime-v31-gtx1650-rerun-evidence.mjs
```

For manual reconstruction, read `durable_receipt_bundle_parts` from the accepted-artifact record in its listed order, concatenate the binary parts, check `durable_receipt_bundle_sha256`, gzip-decompress, parse the JSON and base64-decode each entry. Check each decoded SHA-256 against both its entry and `BUNDLE_SHA256SUMS.txt`. Entry paths are relative to the original artifact root. Do not normalize, reserialize or otherwise replace the original receipt bytes. The compressed bundle schema is `gluball-cuda-runtime-v31-durable-receipt-bundle/1`.

## What passed, and at what scope

The producing architecture result reports all ten required stages PASS: profile definition, frozen runtime sources, host validation, V1 validation, atomic equivalence, two-stage equivalence, bounded tuning, V3.1 sanitizer, frozen measured build inputs and physical preflight. Compiler resource capture succeeded but is explicitly non-gating.

- V1 correctness anchor: three full-readback runs, each **16,384 points**, byte-identical output SHA-256 `4ac6d9175955222d77eaf02133613c3d3edd0715b0838e4affb3a3f44b2daeeb`; maximum component residual `2.583210810591652e-06` and maximum Euclidean residual `3.1237784588949408e-06`.
- Runtime performance workload: **16,384 × 128 = 2,097,152 points per iteration**, 20 warmups, 1,000 measured iterations, repeats 1; tuning uses three trials per candidate. This larger performance workload does not itself gain full-readback V1 conformance status.
- Within this run, V2 shared observations agree with V3/V3.1; V3 and V3.1 exact diagnostic digests match. V2 digest `1e15cffd50e6f653` is intentionally distinct from V3/V3.1 `1e206a0f3b649b9a`.
- Atomic A/B medians (V2 / V3 / V3.1): **0.690031 / 0.142348 / 0.137537 ms**. Two-stage: **0.695849 / 0.144072 / 0.142591 ms**.
- Bounded tuning: 24 candidates, 12 matched V3 configurations. Best observed candidate is block 128, graphs off, atomic reduction, V3.1 median-of-trials **0.136408 ms**. The separate tuning V2 baseline median is **0.6946 ms**. These are distinct measurements, not interchangeable medians.
- All four V3.1 sanitizer exit codes are zero, with clean memcheck/racecheck summaries. V1 sanitizer summaries are in `memcheck-run.json` and `racecheck-run.json`; their companion `.txt` files are empty. Preserve this original placement rather than rewriting receipts.

V3.1 sanitizer scope is block 256, graphs off, 512 × 32 points, one warmup and two measured iterations, both reductions. The preflight also records desktop graphics processes on the GPU; an isolated benchmark host is not established.

Offline verification rechecks recorded data; it is not a new CUDA execution and does not independently establish physical hardware truth. See `INDEPENDENT_AUDIT.json` for executed replay checks and their limits.

## Observed environment and repair boundary

The new receipts record Ubuntu **24.04.5 LTS**, Linux **7.0.0-38-generic**, x86_64, NVIDIA driver **580.178.04**, CUDA toolkit **12.8 / nvcc 12.8.93**, Compute Sanitizer **2025.1.0.0**, Rust **1.98.0** and CMake **3.28.3**. Preflight identifies one full NVIDIA GeForce GTX 1650, 4,096 MiB, compute capability 7.5 / `sm_75`, with MIG disabled/unpartitioned and unambiguous CUDA ordinal zero mapping.

This is evidence of a working environment for the successful run. The retained run does **not** document the repair procedure or preceding failure: no conclusion about DKMS, Secure Boot, firmware, reboot history, hardware replacement, or repair-caused performance change follows from it.

## Comparison with historical run 33630241971

The historical specimen remains [separately archived](../CUDA_RUNTIME_V31_GTX1650_RUN_33630241971.json). It was produced at `73a32f28c6472d3f2bc3a73e30e4f47af5633490`, not the new producing commit. The five frozen measured build-input Git blob IDs, canonical performance workload, V1 output hashes/residuals, and V2/V3/V3.1 diagnostic digest values match across these two records. Matching digests are observations, not a general cross-commit or cross-device equivalence guarantee.

Historical versus new atomic V3.1 A/B median: **0.139444 → 0.137537 ms**; two-stage: **0.141916 → 0.142591 ms**; best bounded candidate: **0.137519 → 0.136408 ms**. The selected tuning configuration remains block 128 / graphs off / atomic. These are separate-run observations, not a controlled speedup experiment, a global optimum, or a universal performance claim.

Original manifest hashes show that `HOST_UNAME.txt`, `OS_RELEASE.txt` and `NVIDIA_INVENTORY.csv` changed. The historical checked-in archive retains their hashes but not their contents, so exact prior kernel/OS/driver versions are not inferred. `NVCC.txt`, `PTXAS_VERSION.txt`, `COMPUTE_SANITIZER.txt`, `RUSTC.txt`, `CARGO.txt` and `CMAKE.txt` match byte-for-byte by their original manifests. Other source changes include validation/negative-control and browser/documentation work; equal frozen measured blobs do not make the complete producing source or environment identical.

The historical profile status remains intact. This repeat specimen does not add a new architecture rung, replace the GT 730 negative control, or promote accelerator observations to geometry authority.

## Reproduce the offline audit

After reconstructing the bundle to `$BUNDLE`, export the exact producing source into a fresh `$SOURCE_SNAPSHOT`, and choose a separate fresh `$AUDIT_OUTPUT` directory. Neither source nor input bundle is modified. The scripts refuse to overwrite an existing replay bundle. Run with ordinary Python (not `-O`, because assertions are audit gates):

```sh
git archive daff00294fe64ccf2d950e98c5bd652b274dfc5d | tar -xf - -C "$SOURCE_SNAPSHOT"
python3 docs/physical-evidence/gtx-1650-39230458215/replay_validators.py "$SOURCE_SNAPSHOT" "$BUNDLE" "$AUDIT_OUTPUT"
python3 docs/physical-evidence/gtx-1650-39230458215/check_numeric_and_runtime.py "$SOURCE_SNAPSHOT" "$BUNDLE" "$AUDIT_OUTPUT"
```

The first script executes only pinned validation/data-processing Python, never the CUDA shell producers. The second independently rechecks all 49,152 archived V1 point records with Python binary64 equations transcribed from the pinned Rust implementation. Rust acceptance and GPU/sanitizer execution are not rerun. Exact observed agreement is not a general cross-runtime equivalence claim.
