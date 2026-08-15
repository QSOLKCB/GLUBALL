# GLUBALL agent contract

This repository is intentionally structured so AI coding/research agents can distinguish canonical geometry, deterministic evidence, presentation, historical reference material, and the future RSH handoff.

## Read order

1. `docs/AI_AGENT_CONTRACT.json` — normative machine-readable project contract.
2. `docs/GLUBALL_KNOT.md` — canonical `GLUBALL-KNOT-V1` geometry.
3. `docs/PROVENANCE_BOUNDARY.md` — migration/provenance boundary.
4. `ROADMAP.md` — implementation sequence and RSH entry gates.
5. `gluball-core.js` — current executable reference geometry.
6. `tests/` — executable invariants and semantic quarantine.

If prose and `docs/AI_AGENT_CONTRACT.json` disagree, stop and request human review rather than guessing.

## Hard rules

- `GLUBALL-KNOT-V1` is independently specified. Do not reconstruct or reintroduce the retired VORTEX/VORTEX2 centre-transfer geometry.
- Historical VORTEX/VORTEX2/NEXUS/DOI archives are reference material only. They may inform an engineering-technique inventory, provenance notes, and regression boundaries; do not copy their retired geometry into canonical GLUBALL code.
- Retired terms may appear in provenance documentation and explicitly non-authoritative UI satire, but not as canonical geometry primitives, equations, state variables, or topology claims.
- Ternary/triality features, if added, are metadata/execution/sonification layers only unless a separate mathematical theorem explicitly establishes more.
- Renderer/camera state is presentation state. It must not silently redefine the geometry contract.
- Receipts prove deterministic identity under a declared encoding/runtime contract; they do not prove physical truth.
- Accelerators are residual sidecars. CPU/WASM/GPU speed or agreement never promotes an accelerator to geometry authority.

## Phase 2 requirements

New deterministic/evidence work should introduce separately versioned contracts rather than mutate `GLUBALL-KNOT-V1` implicitly:

- `GLUBALL-SAMPLING-V1` for logical/rendered index policies;
- `GLUBALL-EVIDENCE-V1` for canonical snapshots and receipts.

Each new contract requires deterministic tests and explicit failure behavior. Prefer exact integer arithmetic for logical index mappings.

## Future RSH handoff

Do not open or implement the RSH integration until every Phase 3 entry gate in `ROADMAP.md` and `docs/AI_AGENT_CONTRACT.json` is satisfied.

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
node tests/agent-contract.mjs
```

A change that modifies a canonical contract must update its documentation, machine-readable contract, tests, and release/version metadata together.
