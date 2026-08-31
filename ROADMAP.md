# GLUBALL roadmap

## Phase 1 — clean canonical geometry

- [x] Define `GLUBALL-KNOT-V1` independently.
- [x] Ship the deterministic moving Pages laboratory.
- [x] Keep the canonical implementation free of the retired centre-transfer geometry.
- [x] Test closure, symmetry, frame orthogonality, tube radius, mesh wrapping, and integer-tick determinism.
- [x] Merge the bootstrap PR and freeze its first public baseline in Git history.

## Phase 2 — deterministic/evidence optimization

Useful deterministic/evidence engineering patterns are reimplemented around GLUBALL without restoring the removed subsystem. `gluball-core.js` remains the geometry authority; `phase2-core.js` is a separate execution/evidence layer.

### 2A — exact logical sampling

- [x] Define `GLUBALL-SAMPLING-V1`.
- [x] Add bounded logical-to-rendered sampling with exact `BigInt` integer index mapping.
- [x] Add deterministic worker/batch partitioning with complete ordered coverage.
- [x] Add optional `phi-weyl-64` sampling as an explicitly separate sampling policy.
- [x] Seal golden logical-index vectors and reject overflow-domain violations, overlap, gaps, and order drift.

See `docs/SAMPLING.md` and `test-vectors/phase2-v1.json`.

### 2B — evidence and receipts

- [x] Define `GLUBALL-EVIDENCE-V1`.
- [x] Canonicalize snapshots and metadata before hashing.
- [x] Add domain-separated SHA-256 receipts.
- [x] Bind receipts to geometry contract, sampling contract, parameter set, logical count, rendered count, animation tick, and implementation/runtime identity.
- [x] Seal a canonical receipt vector.
- [x] Keep receipts as deterministic identity evidence only; never promote them to physical truth.

See `docs/EVIDENCE.md`.

### 2C — metadata, sonification, and capture

- [x] Add ternary/triality lanes only as metadata/execution/sonification channels, never as a topology claim.
- [x] Define `GLUBALL-SONIFICATION-V1` deterministic integer event streams.
- [x] Define `GLUBALL-CAPTURE-PROFILES-V1` for JSON/PNG/WebM capture metadata.
- [x] Keep presentation state separate from canonical geometry state.
- [x] Explicitly refuse to claim cross-runtime canonical PNG/WebM encoded bytes.

### 2D — cross-runtime conformance

- [x] Add a portable JavaScript reference boundary before accelerator work.
- [ ] Add CPU/WASM conformance in a later release where it materially improves portability.
- [x] Add a stable native Rust CPU/reference runtime before physical GPU acceptance.
- [x] Add GPU residual comparison only after that stable native CPU/reference surface exists.
- [x] Treat accelerator output as a residual sidecar, never geometry authority.
- [x] Add bounded stress profiles derived from the useful large-logical-field engineering pattern without importing retired geometry.

CPU/WASM and GPU surfaces were deliberately **not selected for GLUBALL v1.0.0**. The later Rust/CUDA work is additive post-release runtime research and does not retroactively change the v1.0.0 release surface.

See `docs/PORTABLE_REFERENCE.md`, `docs/RUST_RUNTIME.md`, and `docs/CUDA_ACCEPTANCE.md`.

### 2E — GLUBALL v1.0.0 contract freeze

- [x] Prepare `release/manifest-v1.0.0.json` as the machine-readable release candidate manifest.
- [x] Set `gluball-core.js` implementation version to `1.0.0` without changing geometry equations.
- [x] Set `phase2-core.js` implementation version to `1.0.0` without changing Phase 2 contract semantics.
- [x] Preserve the sealed sampling vectors and canonical receipt vector unchanged.
- [x] Add `CHANGELOG.md` and `RELEASE_NOTES_v1.0.0.md`.
- [x] Add `tests/release-preflight.mjs` and run it in CI.
- [x] Record that CPU/WASM and GPU are outside the v1.0.0 release surface.
- [x] Merge the v1.0.0 freeze PR with all four validation suites green.
- [x] Tag the exact freeze merge commit as `v1.0.0`.
- [x] Publish the GitHub release using `RELEASE_NOTES_v1.0.0.md`.

The current verified `v1.0.0` tag target is recorded in `docs/CURRENT_STATE.json`. Historical release-candidate metadata remains reference material for the state that existed before tagging.

## Phase 3 — RSH integration

GLUBALL enters RSH only after the GLUBALL contracts are **released and frozen**, not merely implemented or merged without a tag. RSH integration is additive: the Robitaille–Slade helix remains intact and authoritative for its existing contract.

### RSH entry gates

All of the following must be true before opening the RSH integration PR:

- [x] `GLUBALL-KNOT-V1` is frozen in tagged release `v1.0.0`.
- [x] `GLUBALL-SAMPLING-V1` is frozen in `v1.0.0`, with sealed index/golden vectors.
- [x] `GLUBALL-EVIDENCE-V1` is frozen in `v1.0.0`, with canonical receipt vectors.
- [x] Reference geometry and deterministic sampling tests are green on the release candidate branch.
- [x] CPU/WASM is not part of the v1.0.0 release surface, so no CPU/WASM conformance claim is being imported into RSH.
- [x] The provenance/semantic quarantine test is green on the release candidate branch.
- [x] Historical VORTEX/VORTEX2/NEXUS archives remain reference-only and are not copied into the canonical GLUBALL implementation.
- [x] Ternary/triality metadata remains explicitly non-topological.
- [x] No physical, empirical, biological, or consciousness claim has been introduced by the geometry/evidence layers.

Immediately before RSH integration, an agent must resolve tag `v1.0.0`, record its exact commit SHA, confirm that commit contains `release/manifest-v1.0.0.json`, and confirm the release-preflight suite was green. If any check fails, refuse the RSH integration.

### RSH software integration contract

- [ ] Add GLUBALL as a separately versioned geometry family; do not replace the RSH helix or silently revise the existing geometry contract.
- [ ] Import the stable GLUBALL mathematical contract and sealed reference vectors, not the browser renderer as scientific authority.
- [ ] Preserve GLUBALL provenance identifiers and the exact `v1.0.0` source commit used by RSH.
- [ ] Keep renderer/capture behavior outside the theorem-facing geometry core.
- [ ] Extend RSH release metadata only after runtime and formal checks are green.

### `RSH-GLUBALL-FORMAL-V1`

Create a new theorem surface alongside the existing `RSH-FORMAL-V1` surface. Proposed Lean modules:

```text
formal/lean/RSH/Gluball/Parameters.lean
formal/lean/RSH/Gluball/Centerline.lean
formal/lean/RSH/Gluball/Frame.lean
formal/lean/RSH/Gluball/Surface.lean
formal/lean/RSH/Gluball/Symmetry.lean
formal/lean/RSH/Gluball/Sampling.lean
formal/lean/RSH/Gluball/Main.lean
```

Initial theorem targets:

- [ ] canonical parameter-domain validity (`R > r > 0`, `rho > 0`, integer `p = 2`, `q = 3`);
- [ ] centreline closure / `2π` periodicity;
- [ ] centreline regularity (`||C'(t)|| > 0`);
- [ ] exact threefold rotational symmetry;
- [ ] host-torus normal unit norm;
- [ ] tangent/normal orthogonality;
- [ ] binormal normalization and frame orthogonality;
- [ ] surface periodicity in both parameters;
- [ ] exact tube-radius invariance `||G(t,v) - C(t)|| = rho`;
- [ ] deterministic mesh/index wrap properties;
- [ ] exact logical-to-rendered floor-index properties from `GLUBALL-SAMPLING-V1`.

RSH integration must also:

- [ ] import the GLUBALL theorem surface from `formal/lean/RSH/Main.lean` without weakening `RSH-FORMAL-V1`;
- [ ] extend the RSH axiom audit so every advertised GLUBALL release theorem is printed;
- [ ] keep the RSH proof-hole gate rejecting `sorry`, `admit`, and project-defined `axiom`/`constant` declarations;
- [ ] pin any new proof dependency before release.

### Explicitly deferred theorem/claim targets

These are not bootstrap assumptions:

- global tube embeddedness / non-self-intersection;
- formal equivalence to IEEE-754 JavaScript, Rust, WASM, GPU, or renderer execution;
- camera-dependent cavity visibility or occlusion claims;
- a physical interpretation of GLUBALL;
- any claim that receipts or symmetry prove empirical truth.

If global embeddedness is later claimed, it requires its own theorem and an explicit thickness/reach or minimum-distance bound rather than a visual assertion.

## Phase 4 — archival release and publication

- [x] Publish GLUBALL `v1.0.0` after the freeze PR was merged and the release candidate checks were green.
- [x] Record contract identifiers, test-vector path, canonical receipt hash, selected runtime surface, and provenance boundary in `release/manifest-v1.0.0.json`.
- [x] Record the currently verified tag target in `docs/CURRENT_STATE.json` after `v1.0.0` was created.
- [ ] Record archival/Zenodo metadata for the exact `v1.0.0` tag target if/when a separate archive record is published.
- [ ] After RSH integration is merged and machine-checked, cite exact GLUBALL `v1.0.0` and its commit from the RSH release/Zenodo metadata.
- [x] Keep GLUBALL and RSH as separately versioned projects with explicit provenance links rather than collapsing their histories.

## Phase 5 — physical CUDA acceptance and scaling

This phase is post-v1.0.0 runtime research. Faster hardware cannot revise the frozen geometry or sampling contracts.

### 5A — acceptance software

- [x] Define `GLUBALL-RUST-RUNTIME-V1` as the bounded native CPU/reference surface.
- [x] Define `GLUBALL-MULTI-DEVICE-CUDA-V1` as the optional physical accelerator sidecar.
- [x] Define `GLUBALL-CUDA-ACCEPTANCE-V1` as the independent Rust residual acceptance surface.
- [x] Add evidence-only CUDA execution with complete ordered readback.
- [x] Serialize `GLUBALL-CUDA-F32LE-XYZR-V1` records independently of device shard boundaries.
- [x] Recompute every CUDA evidence point through the Rust `f64` reference.
- [x] Fail closed on count, sidecar-domain, non-finite, component, Euclidean, and tube-radius gates.
- [x] Keep `reference_residual_checked` and `conformance_acceptance` false in the CUDA producer itself.
- [x] Retain rejected completed campaign artifacts and finalize `SHA256SUMS.txt` on runner exit.
- [x] Keep geometry-receipt authority, physical-model validation, and universal-speedup claims false.

### 5B — first physical evidence ladder

No item below may be checked merely because matching hardware was detected or rented. It requires archived campaign artifacts from actual execution.

The accepted 1/2/4 evidence is GitHub Actions run `33378934659` on source commit `d73ad661464eb040e2966e5e9f036941543b4524`, artifact `9753091493` (`gluball-physical-cuda-1-2-4-33378934659-1`), ZIP SHA-256 `6ba740acf06617d0cf93d2d3548b6e0783994b88b9ed40ee342349f9f9d23747`. The downloaded root bundle and all three campaign manifests were independently verified.

The accepted 8-GPU completion evidence is GitHub Actions run `33388107831` on source commit `0505b6e20e4f79514671fd63bb1e1f6d997a4493`, artifact `9756414599` (`gluball-physical-cuda-8gpu-33388107831-1`), ZIP SHA-256 `fd75447d5dbd88909a69339627c3e0114627aca5b7bfb66a0c9705b7fd03944d`. All three 8-GPU acceptance records passed, the downloaded inner and outer manifests verified, and archived Compute Sanitizer memcheck/racecheck summaries were clean.

- [x] Run 1-GPU evidence mode for three accepted repeats.
- [x] Run 2-GPU evidence mode for three accepted repeats.
- [x] Run 4-GPU evidence mode for three accepted repeats.
- [x] Run 8-GPU evidence mode for three accepted repeats.
- [x] Confirm complete coverage and independent Rust residual acceptance at every device count.
- [x] Run Compute Sanitizer memcheck/racecheck where supported and archive the result or explicit unavailability.
- [x] Record exact host, driver, runtime, compile architecture, selected-device, and redacted-device provenance.

**Phase 5B graduation:** complete. Physical accelerator evidence remains non-authoritative for geometry and does not establish a universal speedup claim.

### 5C — "go brrrr" scaling campaign

Only after 5B has an accepted baseline:

- [ ] Run same-host strong scaling with identical `U`, `V`, and `REPEATS` at 1/2/4/8 GPUs.
- [ ] Compute observed speedup `T1/Tn` and parallel efficiency `(T1/Tn)/n` outside the correctness claim surface.
- [ ] Run a weak-scaling observation with workload proportional to device count.
- [ ] Identify whether kernel work, PCIe readback, synchronization, digest contention, CPU orchestration, or storage becomes the first practical bottleneck.
- [ ] Repeat an accepted profile on a second NVIDIA architecture before making portability claims.
- [ ] Treat any RTX 5090 campaign as a maximum-throughput follow-up, not as the first correctness baseline.

See `docs/CUDA_ACCEPTANCE.md`, `docs/CUDA_ACCEPTANCE_CONTRACT.json`, and `research/multi-device-cuda/SPEC.md`.
