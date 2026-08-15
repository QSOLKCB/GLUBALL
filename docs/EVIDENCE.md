# GLUBALL-EVIDENCE-V1

`GLUBALL-EVIDENCE-V1` defines deterministic identity receipts for declared GLUBALL state. A receipt is evidence that the same canonical payload was hashed under the same contract. It is not evidence of physical truth, empirical validity, or hardware correctness.

## Envelope

The canonical envelope binds:

- `GLUBALL-KNOT-V1` geometry snapshot and parameter set;
- `GLUBALL-SAMPLING-V1` policy, logical count, and rendered count;
- animation tick;
- implementation identity;
- runtime identity;
- the explicit claim boundary `deterministic-identity-evidence-only`.

Presentation state is not silently inserted into the theorem-facing geometry state.

## Canonical JSON

Before hashing, objects are recursively key-sorted. Arrays retain order. `BigInt` values are decimal strings. Non-finite numbers, cycles, `undefined`, functions, and symbols are rejected. Negative zero is normalized to JSON zero.

The resulting compact JSON is UTF-8 encoded with no extra whitespace.

## Domain-separated SHA-256

The receipt input is:

```text
UTF8("GLUBALL-EVIDENCE-V1\\0") || UTF8(canonical_json)
```

The digest is SHA-256 via WebCrypto `SubtleCrypto`. WebCrypto is an execution dependency, not geometry authority.

The sealed receipt vector in `test-vectors/phase2-v1.json` uses tick `12345` and a fixed test runtime identity. Its digest is part of the contract regression surface.

## Capture profiles

`GLUBALL-CAPTURE-PROFILES-V1` distinguishes canonical data from presentation sidecars:

- `json-canonical-v1` — canonical JSON payload; binary bytes are contract-controlled.
- `png-canvas-v1` — deterministic capture settings may be recorded, but encoded PNG bytes are not claimed cross-runtime canonical.
- `webm-mediarecorder-v1` — deterministic capture settings may be recorded, but encoded WebM bytes are not claimed cross-runtime canonical.

This prevents browser codec/encoder behavior from being mistaken for mathematical authority.
