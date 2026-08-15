# GLUBALL agent contract

This repository is intentionally structured so AI coding/research agents can distinguish canonical geometry, deterministic evidence, presentation, historical reference material, and the future RSH handoff.

## Read order

1. `docs/AI_AGENT_CONTRACT.json` — normative machine-readable project contract.
2. `docs/GLUBALL_KNOT.md` — canonical `GLUBALL-KNOT-V1` geometry.
3. `docs/PROVENANCE_BOUNDARY.md` — migration/provenance boundary.
4. `docs/SAMPLING.md` — `GLUBALL-SAMPLING-V1` exact index contract.
5. `docs/EVIDENCE.md` — `GLUBALL-EVIDENCE-V1` receipt contract.
6. `docs/PORTABLE_REFERENCE.md` — Phase 2 runtime/conformance boundary.
7. `ROADMAP.md` — implementation sequence and RSH entry gates.
8. `gluball-core.js` — executable reference geometry.
9. `phase2-core.js` — portable deterministic/evidence reference layer.
10. `test-vectors/` and `tests/` — sealed vectors, executable invariants, and semantic quarantine.

If prose and `docs/AI_AGENT_CONTRACT.json` disagree, stop and request human review rather than guessing.

## Hard rules

- `GLUBALL-KNOT-V1` is independently specified. Do not reconstruct or reintroduce the retired VORTEX/VORTEX2 centre-transfer geometry.
- Historical VORTEX/VORTEX2/NEXUS/DOI archives are **reference material only**. They may inform engineering-technique inventories, provenance notes, and regression boundaries; do not copy retired geometry into canonical GLUBALL code.
- Retired terms may appear in provenance documentation and explicitly non-authoritative UI satire, but not as canonical geometry primitives, equations, state variables, or topology claims.
- `gluball-core.js` owns geometry. `phase2-core.js` must not redefine the centreline, frame, surface, or topology.
- Ternary/triality features are metadata/execution/sonification layers only unless a separate mathematical theorem explicitly establishes more.
- Renderer/camera state is presentation state. It must not silently redefine the geometry contract.
- Receipts prove deterministic identity under a declared encoding/runtime contract; they do not prove physical truth.
- PNG/WebM encoder bytes are not cross-runtime canonical merely because capture settings are deterministic.
- Accelerators are residual sidecars. CPU/WASM/GPU speed or agreement never promotes an accelerator to geometry authority.

## Implemented Phase 2 contracts

### `GLUBALL-SAMPLING-V1`

The canonical uniform policy is exact integer floor mapping:

```text
logical(i) = floor(i * L / R)
```

Use `BigInt` for the multiply/divide path. Do not replace it with floating-point arithmetic. The optional `phi-weyl-64` policy is separately named and may not silently replace `uniform-floor`.

### `GLUBALL-EVIDENCE-V1`

Canonicalize JSON before hashing, prepend the exact domain `GLUBALL-EVIDENCE-V1\0`, and hash with SHA-256. Bind geometry contract, parameters, sampling contract/policy/counts, tick, implementation identity, and runtime identity. Changing any bound field must change the receipt.

### Metadata / sonification / capture

`GLUBALL-SONIFICATION-V1` emits deterministic integer event data. `GLUBALL-CAPTURE-PROFILES-V1` distinguishes canonical JSON from presentation sidecars. Triality/ternary data is explicitly non-topological.

## Contract vectors

`test-vectors/phase2-v1.json` is sealed. A change that modifies a sealed mapping or receipt requires either:

1. a bug fix proving the old vector violated the written contract, with human review; or
2. a new versioned contract and new vector file.

Do not casually regenerate golden hashes after a failing test.

## Future RSH handoff

Do not open or implement the RSH integration until **every release-level Phase 3 entry gate** in `ROADMAP.md` and `docs/AI_AGENT_CONTRACT.json` is satisfied. Phase 2 implementation on a branch is not the same thing as a frozen tagged GLUBALL release.

The RSH integration is additive:

- keep the Robitaille–Slade helix and its existing contract intact;
- add a separate GLUBALL geometry family;
- add a separate theorem surface named `RSH-GLUBALL-FORMAL-V1`;
- extend, never weaken, the existing RSH Lean proof-hole and axiom audit gates.

The initial GLUBALL theorem targets are closure, regularity, threefold symmetry, frame identities, surface periodicity, tube-radius invariance, and deterministic sampling/index properties. Global tube embeddedness/non-self-intersection is deferred until it has its own explicit proof and thickness/reach or minimum-distance hypothesis.

## Validation

At minimum run:

```bash
node tests/smoke.mjs
node tests/phase2.mjs
node tests/agent-contract.mjs
```

A change that modifies a canonical contract must update its documentation, machine-readable contract, tests, and release/version metadata together.
