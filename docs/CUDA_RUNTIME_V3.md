# GLUBALL CUDA Runtime V3

Runtime V3 is an additive, efficiency-focused throughput observer. It does not replace the V1 correctness/evidence path and it does not modify the frozen Runtime V2 source used as its A/B oracle.

## Goal

The V3 question is deliberately different from the Phase 5C scaling question:

> How much redundant work can be removed while preserving the exact compact observation produced by Runtime V2?

The initial physical research targets are older or weaker CUDA devices such as Pascal `sm_61` and Turing `sm_75`. These devices are useful as performance microscopes because arithmetic redundancy, synchronization, integer indexing, and reduction overhead are harder to hide behind extreme throughput.

## Frozen A/B baseline

V3 binds the Runtime V2 source blob:

```text
12d49ec6f78a28ed8d6afb5e8c7df80961c8bfc1
```

V2 remains unchanged. `scripts/compare_cuda_runtime_v2_v3.sh` builds both runtimes from the same repository state and requires exact equality for:

```text
total_points_per_iteration
used_device_count
aggregate_diagnostic_xor64
observed_max_tube_radius_error
observed_nonfinite_records_max
resolved_compiled_architectures
```

Both runtimes must also report clean, repeatable compact metrics.

### Homogeneous-device requirement

V2 partitions arbitrary point ranges while V3 partitions complete `u` rings. On a heterogeneous multi-GPU selection, quotient/remainder boundaries can therefore move a logical point from one architecture to another even though the aggregate logical domain is unchanged. Since the compact digest contains exact float bits, architecture-dependent transcendental results could make a correct V3 implementation disagree with V2 solely because ownership changed.

The exact V2/V3 equivalence harness and bounded tuner therefore fail closed unless all selected devices share the same:

```text
name
compute_capability
compiled_cuda_arch_code
```

This restriction applies to the exact V2/V3 observation gate. It does not claim heterogeneous Runtime V3 execution is intrinsically invalid; it means heterogeneous execution requires a different comparison design before exact V2 equivalence can be asserted.

The equivalence gate remains a performance-runtime regression guard. It is not V1 conformance acceptance and is not a geometry receipt.

## Torus signature orbit: `(2,3) <-> (3,2)`

Runtime V3 now carries the SAW-1 pair-swap pattern at the correct abstraction layer: the **ordered torus winding signature**.

The canonical GLUBALL geometry remains:

```text
T(2,3)
```

Define the coordinate-swap operator:

```text
tau(a,b) = (b,a)
```

Then the runtime signature orbit is:

```text
(2,3) --tau--> (3,2)
(3,2) --tau--> (2,3)
```

so `tau(tau(p)) = p` for the ordered pair. This imports the useful SAW-1 structural pattern without importing SAW-1 ontology.

The boundary is strict:

```text
canonical runtime geometry signature: (2,3)
swapped signature metadata:          (3,2)
swap is involutive:                  true
(2,3) == (3,2) as ordered pairs:     false
swapped embedding enabled:           false
```

Runtime V3 does **not** silently replace the GLUBALL centerline with a `(3,2)` embedding, does not collapse the two ordered signatures, and does not use torus-knot-type equivalence as acceptance evidence. The pair orbit is an explicit algebraic/runtime metadata surface only. A future swapped-embedding experiment would need its own contract and equivalence evidence.

## V3-A: deterministic geometry precomputation

Runtime V2 recomputes the same `u`-dependent frame for every `(u,v)` point and recomputes the same `v`-dependent sine/cosine pair for every `u`.

Runtime V3 instead constructs immutable setup buffers on each selected GPU:

```text
Frame[u] = centre(u), normal(u), binormal(u)
Angle[v] = cos(angle(v)), sin(angle(v))
```

The precompute kernels use the same float geometry operations as the V2 point path. The buffers are written during setup and are read-only during warmup and measured iterations.

This follows a deterministic redundancy-elimination pattern:

1. identify a pure subcomputation;
2. establish that its input key is smaller than the full work item;
3. precompute once for each key;
4. freeze the resulting lookup surface;
5. require exact output equivalence to the uncached baseline before using timing evidence.

## V3-B: warp-per-ring topology

One CUDA warp owns one complete `u` ring. Its 32 lanes stride across the `v` coordinate:

```text
warp -> one (repeat,u) ring
lane -> v = lane, lane+32, lane+64, ...
```

A warp therefore derives its `repeat` and `u` indices once and reuses the same precomputed frame for every `v` point it evaluates. The V2 per-point 64-bit quotient/remainder path used to recover `(u,v)` from a linear index is removed from the hot point loop.

Complete rings, rather than arbitrary point fragments, are partitioned across selected devices. The aggregate logical point index remains:

```text
linear = ((repeat * U) + u) * V + v
```

so the diagnostic token domain remains the same even though device shard boundaries change.

## V3-C: warp shuffle compact reductions

V2 stores one digest/radius/nonfinite value per thread in shared memory and performs a full block-wide reduction with a barrier at every tree level.

V3 reduces each warp with `__shfl_down_sync`, stores only one triple per warp, synchronizes once, and lets warp zero reduce the warp leaders.

The block leader then performs:

```text
one digest atomic XOR
one radius atomic max
zero or one nonfinite atomic add
```

The nonfinite atomic is skipped completely when the block-local count is zero. Therefore a clean measured iteration performs zero global nonfinite atomics.

## CUDA Graph compatibility

V3 reuses the already physically validated capture-aware event-record compatibility shim used by Runtime V2. The precomputed geometry buffers are built before graph capture and remain stable during graph replay.

## Bounded optimization search

`scripts/tune_cuda_runtime_v3.sh` treats the first tuning problem as a small finite combinatorial search rather than pretending it is a smooth continuous objective.

Default candidates are:

```text
block size: 32, 64, 128, 256, 512, 1024
CUDA Graphs: off, on
trials per candidate: 3
measured iterations: at least 2
```

The script rejects `ITERATIONS=1` because `repeatable_compact_metrics=true` would otherwise be vacuous: there would be no second measured observation to compare.

The script:

1. builds V2 and V3 once;
2. records repeated V2 baseline observations;
3. requires a homogeneous selected-device signature for exact V2/V3 comparison;
4. enumerates every declared V3 candidate in deterministic order;
5. rejects the run if any candidate violates exact V2 compact-observation equivalence;
6. computes the median of each candidate's per-process wall-time medians;
7. selects the lowest observed value with deterministic tie-breaking;
8. writes `TUNING_RESULT.json`.

The selection is only the **best observed candidate within the declared finite set**. Runtime V3 makes no rigorous global-optimum claim over all possible kernel implementations or launch configurations. Wall-clock GPU timing is a noisy black-box observation and the runtime does not provide the regional bounds required for a rigorous deterministic-global-optimization theorem.

For the initial discrete tuning problem, gradient, Hessian, Newton, SQP, quasi-Newton, SPSA, and quantum-optimization methods add complexity without a justified objective model. A future heterogeneous-device scheduler may become a flow/LP-style optimization problem once device-specific service rates, transfer costs, and assignment constraints are measured. That is outside this V3 implementation.

## SAW-1 symmetry-orbit donor pattern

SAW-1 contributes a methodological pattern, not geometry ontology.

`SAW1/PairSwap.lean` distinguishes:

```text
same symmetry orbit
```

from:

```text
object equality
```

and proves the coordinate swap is an involution before using the relation.

Runtime V3 uses that pattern in two deliberately different ways:

1. the `(2,3) <-> (3,2)` ordered torus signature orbit is explicit runtime metadata;
2. tube-coordinate sample compression remains a **candidate only** and is not enabled in the CUDA kernel.

No GLUBALL sample point may be skipped and reconstructed from a tube-coordinate orbit partner until all of the following exist:

1. a GLUBALL-specific index transform;
2. proof of domain closure;
3. proof of involution or other exact orbit structure;
4. a reconstruction rule for the floating output;
5. exact V2 compact-observation equivalence on physical CUDA hardware.

This prevents the invalid inference that two distinct ordered sample points may be collapsed merely because they lie in the same symmetry orbit.

## Sanitizer failure archival

The weak-GPU physical workflow runs Runtime V3 memcheck and racecheck independently even when one fails. Both transcripts and both process exit statuses are archived before the step fails. This keeps a paid weak-GPU failure diagnostically complete instead of aborting after the first sanitizer tool.

## Claim boundary

Runtime V3 always remains:

```text
performance_observation_only: true
reference_residual_checked: false
conformance_acceptance: false
complete_output_readback: false
geometry_receipt_authority: false
universal_speedup_claim: false
raw_device_uuid_published: false
```

Faster execution does not expand the geometry claim surface.