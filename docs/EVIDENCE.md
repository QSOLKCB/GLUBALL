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

`evidenceReceipt()` validates those mandatory fields before issuing a V1 receipt. An incomplete object carrying only the contract label is not a conforming envelope and is rejected.

Presentation state is not silently inserted into the theorem-facing geometry state.

## Canonical JSON

Canonical serialization emits object keys directly in lexicographic order; it does not rely on JavaScript object enumeration order. Arrays retain order. `BigInt` values are decimal strings. All own JSON keys, including `__proto__`, are preserved as data. Non-finite numbers, cycles through either objects or arrays, `undefined`, functions, and symbols are rejected. Negative zero is normalized to JSON zero.

The resulting compact JSON is UTF-8 encoded with no extra whitespace.

## Domain-separated SHA-256

The receipt input is:

```text
UTF8("GLUBALL-EVIDENCE-V1<NUL>") || UTF8(canonical_json)
```

`<NUL>` means one byte with value `0x00`, not the two characters backslash and `0`. The machine-readable agent contract encodes that separator as the JSON Unicode escape `\u0000` so parsing yields the actual NUL character.

The digest is SHA-256 via WebCrypto `SubtleCrypto`. WebCrypto is an execution dependency, not geometry authority.

The sealed receipt vector in `test-vectors/phase2-v1.json` uses tick `12345` and a fixed test runtime identity. Its digest is part of the contract regression surface.

## Capture profiles

`GLUBALL-CAPTURE-PROFILES-V1` distinguishes canonical data from presentation sidecars:

- `json-canonical-v1` — a canonically serialized evidence bundle; binary bytes are contract-controlled. Its embedded receipt covers the embedded `GLUBALL-EVIDENCE-V1` envelope, not the outer bundle bytes.
- `png-canvas-v1` — deterministic capture settings may be recorded, but encoded PNG bytes are not claimed cross-runtime canonical.
- `webm-mediarecorder-v1` — deterministic capture settings may be recorded, but encoded WebM bytes are not claimed cross-runtime canonical.

This prevents browser codec/encoder behavior from being mistaken for mathematical authority.
