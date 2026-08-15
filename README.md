# GLUBALL

**Independent deterministic `(2,3)` torus-knot geometry, moving browser laboratory, exact logical sampling, provenance-sealed evidence, and proof-friendly contract surfaces.**

GLUBALL is an independently specified successor implementation. The retired VORTEX mouth/centre subsystem is not part of the GLUBALL geometry contract or implementation.

**Live visual:** <https://qsolkcb.github.io/GLUBALL/>

## v1.0.0 release candidate

GLUBALL is now in a **v1.0.0 contract-freeze candidate**. The machine-readable release inventory is [`release/manifest-v1.0.0.json`](release/manifest-v1.0.0.json), both executable reference modules report implementation version `1.0.0`, and CI includes a release preflight that cross-checks versions, contract identifiers, sealed vectors, release metadata, and the RSH handoff gate.

The candidate becomes the immutable release only after this freeze PR is merged and the exact merge commit is tagged `v1.0.0`.

The v1.0.0 contract set is:

- `GLUBALL-KNOT-V1`;
- `GLUBALL-SAMPLING-V1`;
- `GLUBALL-EVIDENCE-V1`;
- `GLUBALL-SONIFICATION-V1`;
- `GLUBALL-CAPTURE-PROFILES-V1`.

CPU/WASM and GPU execution are deliberately outside the v1.0.0 release surface. They remain future residual-sidecar conformance work, not release blockers and not geometry authority.

## GLUBALL-KNOT-V1

The canonical centreline is

```text
C(t) = (
  (R + r cos(3t)) cos(2t),
  (R + r cos(3t)) sin(2t),
  r sin(3t)
)
```

with `R = 2.10`, `r = 0.85`, and a deterministic tube of radius `ρ = 0.34`. The surface uses the host-torus normal plus an orthogonal binormal, avoiding a renderer dependency on a Frenet-normal singularity assumption.

The Pages laboratory renders the same canonical surface as a moving depth-sorted mesh. Animation state is an integer tick, with pause/step/reset controls and canonical evidence JSON export.

## Phase 2 deterministic/evidence layer

`phase2-core.js` adds separately versioned execution/evidence contracts without modifying the geometry equations:

- **`GLUBALL-SAMPLING-V1`** — exact `BigInt` logical→rendered floor sampling, deterministic contiguous batch partitions, and a separately named integer `phi-weyl-64` policy;
- **`GLUBALL-EVIDENCE-V1`** — recursively canonicalized JSON and domain-separated SHA-256 receipts bound to geometry, parameters, sampling, tick, implementation, and runtime identity;
- **`GLUBALL-SONIFICATION-V1`** — deterministic integer event streams derived from sample metadata;
- **`GLUBALL-CAPTURE-PROFILES-V1`** — explicit canonical-JSON versus presentation-sidecar profiles for JSON/PNG/WebM workflows;
- sealed regression vectors in [`test-vectors/phase2-v1.json`](test-vectors/phase2-v1.json);
- bounded stress profiles up to a `2^32` logical field without allocation proportional to logical cardinality.

The canonical sampling rule is

```text
logical(i) = floor(i * L / R)
```

and the multiply/divide path is exact integer arithmetic. See [GLUBALL-SAMPLING-V1](docs/SAMPLING.md), [GLUBALL-EVIDENCE-V1](docs/EVIDENCE.md), and the [portable reference boundary](docs/PORTABLE_REFERENCE.md).

Ternary/triality fields are metadata/execution/sonification channels only. They are **not topology claims**.

## What this repository deliberately does not contain

The previous `gate → exact centre → mouth` rule, D1/D2 receiver geometry, mouth/anus anchors, centre-transfer semantics, and related topology/presentation rules are not GLUBALL dependencies. See [the provenance boundary](docs/PROVENANCE_BOUNDARY.md).

The page does, however, reserve the right to display:

```text
MOUTH / ANUS SUBSYSTEM: NOT FOUND
```

because software archaeology should occasionally be funny.

## Deterministic contract checks

```bash
node tests/smoke.mjs
node tests/phase2.mjs
node tests/agent-contract.mjs
node tests/release-preflight.mjs
```

The suites check the geometry invariants, exact logical sampling/golden vectors, worker-range coverage, phi-policy determinism, ternary/triality metadata boundaries, sonification event determinism, canonical JSON, sealed SHA-256 receipts, capture-profile claim boundaries, stress profiles, machine-readable agent rules, release-manifest alignment, and semantic quarantine.

## Formalization direction

The frozen contract is intentionally proof-friendly. After the `v1.0.0` tag is verified, the RSH integration can target:

- `C(t + 2π) = C(t)`;
- `C(t + 2π/3) = Rz(4π/3) C(t)`;
- `||C'(t)|| > 0`;
- `||N(t)|| = 1` and `C'(t) · N(t) = 0`;
- `||G(t,v) - C(t)|| = ρ`;
- periodic surface coordinates;
- exact properties of `logical(i) = floor(iL/R)` and deterministic partitioning.

Global embeddedness of the thick tube is not claimed yet; it is a later theorem target.

## Sequence

1. **GLUBALL Phase 1 — complete:** clean canonical geometry + deterministic Pages visual.
2. **GLUBALL Phase 2 — complete:** deterministic sampling/evidence/metadata/sonification/capture contracts and sealed vectors.
3. **GLUBALL v1.0.0 freeze — current:** merge this release candidate with all four validation suites green, then tag the exact merge commit `v1.0.0`.
4. **RSH integration:** after tag verification, add GLUBALL as a separately versioned geometry family and formalize the stable contract under `RSH-GLUBALL-FORMAL-V1`.

The tagged release gate in [ROADMAP.md](ROADMAP.md) must be satisfied before any RSH integration begins.

See [`CHANGELOG.md`](CHANGELOG.md) and [`RELEASE_NOTES_v1.0.0.md`](RELEASE_NOTES_v1.0.0.md) for the release record. For AI/coding agents, start with [`AGENTS.md`](AGENTS.md) and [`docs/AI_AGENT_CONTRACT.json`](docs/AI_AGENT_CONTRACT.json).

## Licence

Mozilla Public License 2.0.
