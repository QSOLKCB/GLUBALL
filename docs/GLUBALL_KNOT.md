# GLUBALL-KNOT-V1

`GLUBALL-KNOT-V1` is the canonical geometry contract for the first GLUBALL release. It is an independently specified thickened `(2,3)` torus knot with a deterministic sampling and animation policy.

## Centreline

Let `p = 2`, `q = 3`, `R = 2.10`, and `r = 0.85`. For `t ∈ [0, 2π)`:

```text
A(t) = R + r cos(q t)
C(t) = (A(t) cos(p t), A(t) sin(p t), r sin(q t))
```

Because `gcd(2,3) = 1` and `R > r > 0`, `C` traces one closed `(2,3)` torus-knot centreline on the host torus.

Its derivative is

```text
A'(t) = -r q sin(q t)
C'(t) = (
  A'(t) cos(p t) - p A(t) sin(p t),
  A'(t) sin(p t) + p A(t) cos(p t),
  r q cos(q t)
)
```

and the speed satisfies

```text
||C'(t)||² = p² A(t)² + q² r² > 0.
```

The centreline is therefore regular for the declared parameter domain.

## Tube frame

GLUBALL does not depend on a Frenet normal. It uses the host-torus unit normal

```text
N(t) = (cos(qt) cos(pt), cos(qt) sin(pt), sin(qt)).
```

Set

```text
T(t) = C'(t) / ||C'(t)||
B(t) = normalize(T(t) × N(t)).
```

`N` is orthogonal to the two tangent directions of the host torus and therefore to `C'`; `T`, `N`, and `B` form the rendering frame used by the tube parameterization.

## Surface

With tube radius `ρ = 0.34` and `v ∈ [0,2π)`:

```text
G(t,v) = C(t) + ρ (N(t) cos(v) + B(t) sin(v)).
```

The renderer samples `96 × 18` parameter cells. Both indices wrap periodically, so no seam is special.

## Proof-friendly invariants

The initial contract is deliberately chosen to expose useful theorem surfaces for a later RSH/Lean integration:

- closure: `C(t + 2π) = C(t)`;
- threefold rotational symmetry: `C(t + 2π/3) = Rz(4π/3) C(t)`;
- regularity: `||C'(t)|| > 0`;
- host-torus normal: `||N(t)|| = 1` and `C'(t) · N(t) = 0`;
- tube radius: `||G(t,v) - C(t)|| = ρ`;
- periodic surface coordinates in `t` and `v`.

The first GLUBALL release does **not** claim a machine-checked global embeddedness theorem for the thick tube. That is a later formalization target.

## Deterministic animation

Animation state is an integer tick. `tickPose(n)` maps the integer tick to yaw, pitch, and roll. Live playback advances the integer state at a fixed nominal `60 Hz`; pause and step controls expose the exact state directly. A rendered frame is therefore a deterministic function of the geometry contract, canvas dimensions, and integer tick, while real-time frame delivery remains browser-dependent.

## Interpretation boundary

GLUBALL is geometry and software. The shape, projection, symmetry, sampling, and animation policies do not by themselves establish a physical theory or empirical phenomenon.
