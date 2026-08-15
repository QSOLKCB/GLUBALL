# GLUBALL

**Independent deterministic `(2,3)` torus-knot geometry, moving browser laboratory, and proof-friendly contract surface.**

GLUBALL is an independently specified successor implementation. The retired VORTEX mouth/centre subsystem is not part of the GLUBALL geometry contract or implementation.

**Live visual:** <https://qsolkcb.github.io/GLUBALL/>

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

The Pages laboratory renders the same canonical surface as a moving depth-sorted mesh. Animation state is an integer tick, with pause/step/reset controls and JSON export.

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
```

The smoke suite checks closure, exact threefold rotational symmetry to floating tolerance, centreline regularity, frame orthogonality, fixed tube radius, mesh dimensions, deterministic integer-tick poses, and a semantic quarantine on the canonical geometry module.

## Formalization direction

The contract is intentionally proof-friendly. A later RSH integration can target:

- `C(t + 2π) = C(t)`;
- `C(t + 2π/3) = Rz(4π/3) C(t)`;
- `||C'(t)|| > 0`;
- `||N(t)|| = 1` and `C'(t) · N(t) = 0`;
- `||G(t,v) - C(t)|| = ρ`;
- periodic surface coordinates;
- deterministic sampling/index properties added in the optimization phase.

Global embeddedness of the thick tube is not claimed yet; it is a later theorem target.

## Sequence

1. **GLUBALL Phase 1:** clean canonical geometry + deterministic Pages visual.
2. **GLUBALL Phase 2:** adapt the useful deterministic/evidence machinery from the historical VORTEX/NEXUS work to GLUBALL's geometry.
3. **RSH integration:** add GLUBALL as a separately versioned geometry family and formalize the stable contract in Lean 4.

See [ROADMAP.md](ROADMAP.md) and [GLUBALL-KNOT-V1](docs/GLUBALL_KNOT.md).

## Licence

Mozilla Public License 2.0.
