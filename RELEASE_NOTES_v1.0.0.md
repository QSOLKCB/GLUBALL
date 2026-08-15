# GLUBALL v1.0.0 — Contract Freeze

GLUBALL v1.0.0 freezes the first stable public contract set for the independently specified deterministic `(2,3)` torus-knot laboratory.

## What is frozen

- `GLUBALL-KNOT-V1` — canonical geometry and proof-friendly parameterization.
- `GLUBALL-SAMPLING-V1` — exact logical-to-rendered sampling and deterministic partitioning.
- `GLUBALL-EVIDENCE-V1` — canonical JSON and domain-separated SHA-256 receipts.
- `GLUBALL-SONIFICATION-V1` — deterministic integer event streams.
- `GLUBALL-CAPTURE-PROFILES-V1` — canonical JSON versus presentation-sidecar capture boundaries.

The release preserves the sealed sampling and receipt vectors in `test-vectors/phase2-v1.json` and records the release contract set in `release/manifest-v1.0.0.json`.

## Geometry

The canonical centreline remains:

```text
C(t) = (
  (R + r cos(3t)) cos(2t),
  (R + r cos(3t)) sin(2t),
  r sin(3t)
)
```

with `R = 2.10`, `r = 0.85`, tube radius `rho = 0.34`, and `(p,q) = (2,3)`.

This freeze does not introduce a new geometry equation or restore any retired VORTEX/VORTEX2 geometry. Historical VORTEX/VORTEX2/NEXUS/DOI material remains reference-only.

## Deterministic evidence

The canonical sampling policy is exact integer arithmetic:

```text
logical(i) = floor(i * L / R)
```

Receipts use compact canonical UTF-8 JSON and SHA-256 with the exact domain separator `GLUBALL-EVIDENCE-V1` followed by a NUL byte. Receipts establish deterministic payload identity under the declared contract; they do not establish physical or empirical truth.

## Deliberately outside v1.0.0

- CPU/WASM conformance is not part of the v1.0.0 release surface.
- GPU execution is not part of the v1.0.0 release surface.
- Global tube embeddedness/non-self-intersection is not claimed.
- PNG/WebM encoded-byte identity across runtimes is not claimed.
- No physical, biological, consciousness, or empirical interpretation is introduced.

## RSH handoff

After this freeze PR is merged, tag its exact merge commit as `v1.0.0`. Only after that tag is verified may the separate RSH repository import the frozen GLUBALL contract set.

The planned RSH theorem surface is additive:

```text
RSH-GLUBALL-FORMAL-V1
```

It does not replace the Robitaille–Slade helix or alter the already frozen `RSH-FORMAL-V1` surface.

## Validation

```bash
node tests/smoke.mjs
node tests/phase2.mjs
node tests/agent-contract.mjs
node tests/release-preflight.mjs
```

A release candidate is valid only while all four checks are green.
