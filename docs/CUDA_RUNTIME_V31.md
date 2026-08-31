# GLUBALL CUDA Runtime V3.1

Runtime V3.1 is an additive pre-rental efficiency refinement layered beside the merged Runtime V3 implementation. It does not replace V1 correctness evidence and it does not modify Runtime V2 or Runtime V3 source.

## Research question

Runtime V3 asked whether redundant geometry work could be removed while preserving the frozen Runtime V2 compact observation.

Runtime V3.1 asks a narrower question:

> Can the remaining setup, metric-transport, and compact-reduction overhead be reduced before weak-GPU measurement without turning the benchmark into cached-answer replay?

## Frozen references

Runtime V3.1 binds both earlier performance surfaces:

```text
Runtime V2 source blob
12d49ec6f78a28ed8d6afb5e8c7df80961c8bfc1

Runtime V3 source blob
dc8e9b209abee3794e5e56d0b92fa6d40dd03fd0
```

The physical comparison must establish exact V2/V3/V3.1 compact-observation equality before any V3.1 timing is interpreted.

## V3.1-A: packed compact metric transport

Runtime V3 keeps the three compact metric receivers in separate allocations:

```text
digest u64
radius bits u32
nonfinite u64
```

Runtime V3.1 stores the same logical 20 bytes in one aligned 24-byte resident record:

```text
CompactMetrics
  digest          u64
  max_radius_bits u32
  reserved        u32
  nonfinite       u64
```

This changes the per-device iteration envelope from three metric resets plus three host readbacks to:

```text
one 24-byte reset
one 24-byte readback
```

The padding has no logical meaning.

## V3.1-B: radius-weighted angle lookup

Runtime V3 precomputes:

```text
Angle[v] = cos(angle), sin(angle)
```

and multiplies each component by the tube radius in every point evaluation.

Runtime V3.1 precomputes instead:

```text
WeightedAngle[v] = cos(angle)*tube_radius, sin(angle)*tube_radius
```

The same binary32 multiplication is moved into immutable setup. Two hot-point multiplications are therefore removed from every `(u,v)` evaluation.

## V3.1-C: canonical `(2,3)` frame trig factoring

The merged Runtime V3 deliberately exposes the ordered torus signature `(2,3)` and its `(3,2)` swap orbit without enabling the swapped embedding.

Runtime V3.1 uses the canonical signature to factor frame setup. For one `u` value it evaluates exactly:

```text
cos(2t)
sin(2t)
cos(3t)
sin(3t)
```

once, then constructs centre, derivative, normal, and binormal from those four values.

The equivalent V3 helper expansion contains sixteen `cosf`/`sinf` calls per `u` frame. This optimization affects setup only; physical exact-observation comparison remains mandatory.

## V3.1-D: compact reduction topology tuner

Two receiver topologies are declared.

### `atomic`

This retains the V3 policy after the block-local warp reduction:

```text
atomicXor(digest)
atomicMax(radius)
conditional atomicAdd(nonfinite)
```

### `two-stage`

Each evaluation block writes one 24-byte `CompactMetrics` summary. One second kernel per selected device reduces those summaries using only:

```text
u64 XOR
u32 MAX
u64 SUM
```

No final-metric global atomics are used in this mode. The second reduction kernel is included inside the CUDA event timing interval.

Because the three receiver operations are associative integer operations, their reduction topology may change without changing the mathematical receiver value. Physical exactness still has to prove that the complete runtime observation remains identical.

## Cache boundary

Runtime V3.1 deliberately adopts a measurement boundary inspired by the serving/cache invariants used in QSOL-GEO-REASON.

Allowed precomputation is sublinear in the complete point field:

```text
O(U) frame lookup
O(V) weighted-angle lookup
O(blocks) compact receiver summaries
```

The throughput contract forbids:

```text
O(U*V) complete point cache
cached radius-error field
cached final digest
cached complete observation
```

The goal is to optimize the evaluator, not replace evaluation with memoized answers.

## Setup amortization

Moving work into setup can make steady-state iteration timing look better while increasing one-shot cost. The V2/V3/V3.1 comparison therefore records an observed V3.1 break-even estimate against V3:

```text
setup_delta = v31_setup - v3_setup
iteration_gain = v3_wall - v31_wall

break_even = ceil(setup_delta / iteration_gain)
```

when the per-iteration gain is positive. This is an observed timing diagnostic, not a universal claim.

## Bounded tuner

Default candidate set:

```text
block size: 32, 64, 128, 256, 512, 1024
CUDA Graphs: off, on
reduction: atomic, two-stage
trials: 3
```

This yields 24 declared candidates. Every candidate must preserve exact V2 compact observation and homogeneous-device identity before timing is considered.

The selected result remains only the best observed candidate in that finite set.

## Deferred until after weak-GPU evidence

The following are intentionally not included before the first Pascal/Turing measurement:

```text
u32 index specialization
block-shared angle staging
manual v-loop unrolling
other memory-layout experiments
```

The weak GPU should still be able to reveal whether indexing, cache access, occupancy, launch overhead, or another cost dominates after V3.1.

## Claim boundary

Runtime V3.1 always reports:

```text
performance_observation_only: true
reference_residual_checked: false
conformance_acceptance: false
complete_output_readback: false
geometry_receipt_authority: false
universal_speedup_claim: false
raw_device_uuid_published: false
```

A faster V3.1 execution does not expand the geometry claim surface.
