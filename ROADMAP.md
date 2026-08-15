# GLUBALL roadmap

## Phase 1 — clean canonical geometry

- [x] Define `GLUBALL-KNOT-V1` independently.
- [x] Ship the deterministic moving Pages laboratory.
- [x] Keep the canonical implementation free of the retired centre-transfer geometry.
- [x] Test closure, symmetry, frame orthogonality, tube radius, mesh wrapping, and integer-tick determinism.
- [ ] Merge the bootstrap PR and freeze its first public baseline.

## Phase 2 — deterministic/evidence optimization

Adapt useful engineering patterns from the historical VORTEX/NEXUS work to the new GLUBALL geometry without restoring the removed subsystem.

### 2A — exact logical sampling

- [ ] Define `GLUBALL-SAMPLING-V1`.
- [ ] Add bounded logical-to-rendered sampling with exact integer index mapping.
- [ ] Add deterministic worker/batch partitioning with complete ordered coverage.
- [ ] Add optional Fibonacci/phi sampling as an explicitly separate sampling policy.
- [ ] Seal golden logical-index vectors and reject overflow, overlap, gaps, and order drift.

### 2B — evidence and receipts

- [ ] Define `GLUBALL-EVIDENCE-V1`.
- [ ] Canonicalize snapshots and metadata before hashing.
- [ ] Add domain-separated SHA-256 receipts.
- [ ] Bind receipts to geometry contract, sampling contract, parameter set, logical count, rendered count, animation tick, and implementation/runtime identity.
- [ ] Keep receipts as deterministic identity evidence only; never promote them to physical truth.

### 2C — metadata, sonification, and capture

- [ ] Add ternary/triality lanes only as metadata/execution/sonification channels, never as a topology claim.
- [ ] Add deterministic sonification event streams.
- [ ] Add reproducible JSON/PNG/WebM capture profiles.
- [ ] Keep presentation state separate from canonical geometry state.

### 2D — cross-runtime conformance

- [ ] Add a portable reference implementation boundary before accelerator work.
- [ ] Add CPU/WASM conformance where it improves portability.
- [ ] Add GPU residual comparison only after a stable CPU/WASM reference exists.
- [ ] Treat accelerator output as a residual sidecar, never geometry authority.
- [ ] Add stress profiles derived from former large logical-field experiments without importing the retired geometry.

## Phase 3 — RSH integration

GLUBALL enters RSH only after the GLUBALL contracts are stable. RSH integration is additive: the Robitaille–Slade helix remains intact and authoritative for its existing contract.

### RSH entry gates

All of the following must be true before opening the RSH integration PR:

- [ ] `GLUBALL-KNOT-V1` is frozen in a tagged GLUBALL release.
- [ ] `GLUBALL-SAMPLING-V1` is frozen, with sealed index/golden vectors.
- [ ] `GLUBALL-EVIDENCE-V1` is frozen, with canonical receipt vectors.
- [ ] Reference geometry and deterministic sampling tests are green.
- [ ] Any CPU/WASM conformance surface used by the release is green.
- [ ] The provenance/semantic quarantine test is green.
- [ ] Historical VORTEX/VORTEX2/NEXUS archives remain reference-only and are not copied into the canonical GLUBALL implementation.
- [ ] Ternary/triality metadata remains explicitly non-topological.
- [ ] No physical, empirical, biological, or consciousness claim has been introduced by the geometry/evidence layers.

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
- [ ] exact logical-to-rendered index properties from `GLUBALL-SAMPLING-V1` once that contract is frozen.

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

- [ ] Publish a stable GLUBALL release only after Phase 2 contracts and conformance gates are sealed.
- [ ] Record immutable source commit, contract identifiers, test vectors, and receipts in release metadata.
- [ ] After RSH integration is merged and machine-checked, cite the exact GLUBALL release from the RSH release/Zenodo metadata.
- [ ] Keep GLUBALL and RSH as separately versioned projects with explicit provenance links rather than collapsing their histories.
