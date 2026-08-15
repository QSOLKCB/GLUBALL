# Phase 2 portable reference boundary

`phase2-core.js` is the portable JavaScript reference for Phase 2 deterministic/evidence behavior.

It owns these non-geometric contracts:

- `GLUBALL-SAMPLING-V1`;
- `GLUBALL-EVIDENCE-V1`;
- `GLUBALL-SONIFICATION-V1`;
- `GLUBALL-CAPTURE-PROFILES-V1`.

`gluball-core.js` remains the executable reference for `GLUBALL-KNOT-V1`. Phase 2 code consumes a geometry snapshot; it does not redefine the centreline, frame, or surface.

## Accelerator boundary

Future WASM/GPU implementations must reproduce the sealed integer/string vectors before they are treated as conforming. Accelerator comparisons are residual sidecars only. A faster implementation never becomes geometry authority because it is faster.

## Stress profiles

The portable reference exposes bounded profiles:

- `baseline`: `2^24` logical / `96` rendered;
- `dense`: `2^24` logical / `1024` rendered;
- `large`: `2^32` logical / `4096` rendered;
- `phiDense`: `2^24` logical / `1024` rendered under the separate phi policy.

Only the rendered set is materialized. Logical cardinality is metadata and exact-index arithmetic, so stress profiles do not allocate arrays proportional to the logical field.
