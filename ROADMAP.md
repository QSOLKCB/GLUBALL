# GLUBALL roadmap

## Phase 1 — clean canonical geometry

- define `GLUBALL-KNOT-V1` independently;
- ship the deterministic moving Pages laboratory;
- keep the implementation free of the retired centre-transfer model;
- test closure, symmetry, frame orthogonality, tube radius, mesh wrapping, and integer-tick determinism.

## Phase 2 — deterministic/evidence optimization

Adapt useful engineering patterns from the historical VORTEX/NEXUS work to the new GLUBALL geometry without restoring the removed subsystem:

- bounded logical-to-rendered sampling with exact integer index mapping;
- optional Fibonacci/phi sampling;
- deterministic ordered batch APIs and worker partitioning;
- ternary/triality metadata as an execution/sonification layer, not a topology claim;
- canonical SHA-256 receipts and provenance-sealed snapshots;
- deterministic sonification events;
- PNG/WebM/JSON capture and reproducible visual presets;
- CPU/WASM/GPU residual comparison where it adds real value;
- stress profiles derived from the former large logical-field experiments.

## Phase 3 — RSH integration

After the GLUBALL contract is stable:

- add GLUBALL as an additional geometry family in RSH rather than replacing the Robitaille–Slade helix;
- add `RSH-GLUBALL-FORMAL-V1`;
- formalize closure, symmetry, regularity, frame identities, tube-radius invariance, and deterministic sampling properties in Lean 4;
- treat tube embeddedness/non-self-intersection as a separate theorem target rather than assuming it;
- extend the RSH theorem audit and release metadata only after the new proofs are green.
