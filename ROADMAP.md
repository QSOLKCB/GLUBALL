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
- [ ] Add CPU/WASM conformance where it improves portability.
- [ ] Add GPU residual comparison only after a stable CPU/WASM reference exists.
- [ ] Treat accelerator output as a residual sidecar, never geometry authority.
- [x] Add bounded stress profiles derived from the useful large-logical-field engineering pattern without importing retired geometry.

See `docs/PORTABLE_REFERENCE.md`.

## Phase 3 — RSH integration

GLUBALL enters RSH only after the GLUBALL contracts are **released and frozen**, not merely implemented on a development branch. RSH integration is additive: the Robitaille–Slade helix remains intact and authoritative for its existing contract.

### RSH entry gates

All of the following must be true before opening the RSH integration PR:

- [ ] `GLUBALL-KNOT-V1` is frozen in a tagged GLUBALL release.
- [ ] `GLUBALL-SAMPLING-V1` is frozen in that release, with sealed index/golden vectors.
- [ ] `GLUBALL-EVIDENCE-V1` is frozen in that release, with canonical receipt vectors.
- [x] Reference geometry and deterministic sampling tests are green on the Phase 2 branch.
- [ ] Any CPU/WASM conformance surface used by the release is green.
- [x] The provenance/semantic quarantine test is green on the Phase 2 branch.
- [x] Historical VORTEX/VORTEX2/NEXUS archives remain reference-only and are not copied into the canonical GLUBALL implementation.
- [x] Ternary/triality metadata remains explicitly non-topological.
- [x] No physical, empirical, biological, or consciousness claim has been introduced by the geometry/evidence layers.

Implementation-complete checkboxes above do **not** satisfy the release-freeze gates. Until tagged contracts exist, agents must refuse RSH integration.

### RSH software integration contract

- [ ] Add GLUBALL as a separately versioned geometry family; do not replace the RSH helix or silently revise the existing geometry contract.
- [ ] Import the stable GLUBALL mathematical contract and sealed reference vectors, not the browser renderer as scientific authority.
- [ ] Preserve GLUBALL provenance identifiers and the exact source release/commit used by RSH.
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

- [ ] Publish a stable GLUBALL release only after Phase 2 contracts and conformance gates selected for that release are sealed.
- [ ] Record immutable source commit, contract identifiers, test vectors, and receipts in release metadata.
- [ ] After RSH integration is merged and machine-checked, cite the exact GLUBALL release from the RSH release/Zenodo metadata.
- [ ] Keep GLUBALL and RSH as separately versioned projects with explicit provenance links rather than collapsing their histories.
