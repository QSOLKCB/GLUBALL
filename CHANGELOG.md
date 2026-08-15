# Changelog

All notable GLUBALL release-level changes are recorded here.

## 1.0.0 — release candidate

### Frozen contracts

- `GLUBALL-KNOT-V1`
- `GLUBALL-SAMPLING-V1`
- `GLUBALL-EVIDENCE-V1`
- `GLUBALL-SONIFICATION-V1`
- `GLUBALL-CAPTURE-PROFILES-V1`

### Geometry

- Freezes the independently specified thickened `(2,3)` torus-knot geometry introduced in PR #1.
- Keeps the canonical parameters `R = 2.10`, `r = 0.85`, `rho = 0.34`, `p = 2`, `q = 3`, and mesh `96 x 18`.
- Makes no new geometry-equation change in the release-freeze PR.

### Deterministic execution and evidence

- Freezes exact `BigInt` uniform-floor logical sampling and the separately named `phi-weyl-64` policy.
- Freezes deterministic contiguous partitioning, ternary/triality metadata boundaries, deterministic sonification events, and capture profiles.
- Freezes canonical JSON behavior and domain-separated SHA-256 evidence receipts.
- Preserves the sealed Phase 2 sampling vectors and receipt vector.

### Release boundary

- Adds `release/manifest-v1.0.0.json` as the machine-readable release candidate manifest.
- Adds `tests/release-preflight.mjs` and CI enforcement for version/contract/vector/release metadata alignment.
- Declares CPU/WASM and GPU conformance outside the v1.0.0 release surface; future accelerator work remains residual-sidecar-only.
- Keeps global tube embeddedness, physical interpretation, and browser PNG/WebM cross-runtime binary identity explicitly unclaimed.

### RSH handoff

After merge, tag the exact freeze merge commit as `v1.0.0`. RSH integration may begin only after that tag is verified. The future additive theorem surface remains `RSH-GLUBALL-FORMAL-V1`; the existing Robitaille–Slade helix and `RSH-FORMAL-V1` remain untouched.
