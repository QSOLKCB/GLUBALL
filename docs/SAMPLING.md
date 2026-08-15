# GLUBALL-SAMPLING-V1

`GLUBALL-SAMPLING-V1` defines deterministic, bounded mappings from a potentially large logical sample field to a finite rendered/reference set. It is an execution contract layered over `GLUBALL-KNOT-V1`; it does not change the knot geometry.

## Canonical uniform-floor policy

For logical cardinality `L > 0`, rendered count `1 <= R <= L`, and rendered index `i` with `0 <= i < R`:

```text
logical(i) = floor(i * L / R)
```

The implementation performs this operation with JavaScript `BigInt`, so the multiply/divide step is exact integer arithmetic and does not pass through binary64.

Consequences for the declared domain:

- `logical(0) = 0`;
- every mapped index lies in `[0, L)`;
- because `R <= L`, the mapping is strictly increasing and therefore collision-free;
- the complete vector is deterministic and independent of worker count;
- no allocation proportional to `L` is required.

## Deterministic partitioning

`partitionRanges(R, W)` partitions rendered indices into contiguous half-open ranges `[start,end)`. The effective worker count is `min(R,W)`. Quotient/remainder allocation gives the first `R mod W` workers one extra item.

The plan must satisfy:

```text
first.start = 0
last.end = R
range[k].end = range[k+1].start
sum(range.length) = R
```

This guarantees complete ordered coverage with no overlap or gaps.

## Optional phi policy

`phi-weyl-64` is a separate, explicit policy. It uses the 64-bit golden-ratio Weyl increment

```text
PHI64 = 0x9e3779b97f4a7c15
word(i) = (i * PHI64) mod 2^64
logical(i) = floor(word(i) * L / 2^64)
```

This is an integerized phi-distribution policy. It deliberately avoids runtime `Math.sqrt(5)` / irrational floating-point sequencing so its logical indices are exact and portable. It is not the canonical uniform ordering and must never be silently substituted for it.

## Ternary/triality metadata

Rendered index `i` has metadata lane `i mod 3`. Logical indices may also be serialized as fixed-width base-3 strings. These fields are execution/sonification metadata only. They do not define topology or alter `GLUBALL-KNOT-V1`.

## Sealed vectors

`test-vectors/phase2-v1.json` is the machine-readable vector set for this contract. It includes:

- uniform `2^24 -> 96` samples;
- phi-Weyl `2^24 -> 96` samples;
- uniform `2^32 -> 4096` stress samples.

Any future change that intentionally changes these vectors requires a new sampling-contract version.
