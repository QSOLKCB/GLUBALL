# GLUBALL

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.22921029.svg)](https://doi.org/10.5281/zenodo.22921029)
[![Release](https://img.shields.io/github/v/release/QSOLKCB/GLUBALL)](https://github.com/QSOLKCB/GLUBALL/releases/tag/v1.1.0)
[![License: MPL-2.0](https://img.shields.io/badge/License-MPL--2.0-blue.svg)](LICENSE)

**Independent deterministic `(2,3)` torus-knot geometry, browser laboratory, exact logical sampling, provenance-sealed evidence, native Rust execution, and physically validated CUDA research surfaces.**

**Live laboratory:** https://qsolkcb.github.io/GLUBALL/

**Formal release record:** https://doi.org/10.5281/zenodo.22921029

---

## Current release — v1.1.0

**GLUBALL v1.1.0 — Native Runtime, Physical CUDA Evidence & Browser Laboratory Upgrade**

Release:

https://github.com/QSOLKCB/GLUBALL/releases/tag/v1.1.0

Tagged source commit:

```text
4a36736c91f69f299cb4be19beb87b15f0f5f0b3
```

Formal Zenodo record:

> Slade, T. (2026). *GLUBALL v1.1.0: Formal Release Record, Deterministic Torus-Knot Laboratory, Native Runtime, Physical CUDA Evidence, and Browser Visualization* (Version v1.1.0) [Computer software]. Zenodo.
> [https://doi.org/10.5281/zenodo.22921029](https://doi.org/10.5281/zenodo.22921029)

`v1.1.0` is the first major post-`v1.0.0` expansion of GLUBALL.

The original `v1.0.0` release froze the canonical geometry, deterministic sampling, evidence, sonification, and capture contracts. Version `v1.1.0` does **not** redefine those frozen meanings. It builds an execution, physical-validation, accelerator-research, durable-evidence, and browser-presentation laboratory around them.

The frozen `v1.0.0` release inventory remains machine-readable at [`release/manifest-v1.0.0.json`](release/manifest-v1.0.0.json). After verification of the immutable `v1.0.0` tag, the formal RSH handoff target remains `RSH-GLUBALL-FORMAL-V1`.

---

## Frozen canonical contract set

The following contracts remain frozen from `v1.0.0`:

```text
GLUBALL-KNOT-V1
GLUBALL-SAMPLING-V1
GLUBALL-EVIDENCE-V1
GLUBALL-SONIFICATION-V1
GLUBALL-CAPTURE-PROFILES-V1
```

Previous release:

[https://github.com/QSOLKCB/GLUBALL/releases/tag/v1.0.0](https://github.com/QSOLKCB/GLUBALL/releases/tag/v1.0.0)

`v1.0.0` tag commit:

```text
80941183d14531093117e122da0fc32c13d2464b
```

The post-release Rust and CUDA systems are additive execution layers. They do not replace the frozen geometry or evidence authorities.

---

## GLUBALL-KNOT-V1

The canonical centreline is

```text
C(t) = (
  (R + r cos(3t)) cos(2t),
  (R + r cos(3t)) sin(2t),
  r sin(3t)
)
```

with

```text
p   = 2
q   = 3
R   = 2.10
r   = 0.85
rho = 0.34
```

and deterministic mesh dimensions:

```text
U = 96
V = 18
```

The thickened surface is

```text
G(t,v) = C(t) + rho * (N(t) cos(v) + B(t) sin(v))
```

where the rendering frame uses the host-torus normal plus an orthogonal binormal.

This avoids making the renderer dependent on a Frenet-normal singularity assumption.

The canonical geometry authority remains:

```text
GLUBALL-KNOT-V1
```

No GPU, browser renderer, benchmark, or physical accelerator observation may redefine it.

---

## Browser laboratory

The live browser implementation now uses a buffered WebGL presentation with a cached Canvas 2D fallback.

[https://qsolkcb.github.io/GLUBALL/](https://qsolkcb.github.io/GLUBALL/)

### Views

The laboratory includes:

* shaded **Sculpture** view;
* wireframe **Knot Atlas**;
* canonical centreline;
* optional host-torus guide;
* surface mesh overlay;
* perspective projection;
* orthographic projection;
* orbit controls;
* zoom;
* keyboard navigation;
* reduced-motion handling.

The WebGL renderer uploads the canonical `96 × 18` mesh into reusable buffers rather than rebuilding and depth-sorting thousands of projected cells every frame.

See:

[`docs/BROWSER_RENDERER.md`](docs/BROWSER_RENDERER.md)

### Deterministic presentation state

Animation remains based on an integer tick.

Evidence export snapshots the tick and presentation state **before** asynchronous SHA-256 sealing, preventing the visible state from changing underneath an export.

Renderer state remains presentation metadata. It is not part of the canonical geometry authority.

---

## Deterministic sampling and evidence

`phase2-core.js` implements the frozen deterministic execution/evidence layer.

### GLUBALL-SAMPLING-V1

The canonical logical-to-rendered mapping is:

```text
logical(i) = floor(i * L / R)
```

using exact integer arithmetic.

Supported deterministic policies include:

```text
uniform-floor
phi-weyl-64
```

The contract includes bounded allocation, deterministic contiguous worker partitions, exact logical indices, and sealed regression vectors.

See:

[`docs/SAMPLING.md`](docs/SAMPLING.md)

### GLUBALL-EVIDENCE-V1

Evidence receipts use:

* recursively canonicalized JSON;
* UTF-8 encoding;
* SHA-256;
* the exact domain separator `GLUBALL-EVIDENCE-V1` followed by NUL.

Receipts establish deterministic payload identity under the declared contract.

They do **not** establish physical truth.

See:

[`docs/EVIDENCE.md`](docs/EVIDENCE.md)

### Sonification and capture

The frozen Phase 2 set also contains:

```text
GLUBALL-SONIFICATION-V1
GLUBALL-CAPTURE-PROFILES-V1
```

Ternary/triality values are metadata, execution, and sonification channels only.

They are **not topology claims**.

---

# Native runtime

## GLUBALL-RUST-RUNTIME-V1

GLUBALL now includes a bounded native Rust execution layer for deterministic workloads beyond the comfortable browser/JavaScript envelope.

The Rust runtime provides:

* deterministic contiguous CPU shards;
* exact integer worker ranges;
* `u128` sampling intermediates;
* exact `phi-weyl-64` arithmetic;
* bounded fixed-point canonical parameters;
* bounded `f64` at the trigonometric boundary;
* deterministic partition planning;
* same-runtime repeatability diagnostics;
* native CLI tools.

Build:

```bash
cargo build --release
```

Run the sealed sampling self-test:

```bash
cargo run --release -- self-test
```

Example simulation:

```bash
cargo run --release -- simulate \
  --u 16384 \
  --v 128 \
  --repeats 8 \
  --workers 64 \
  --device-slots 8
```

See:

[`docs/RUST_RUNTIME.md`](docs/RUST_RUNTIME.md)
[`docs/RUST_RUNTIME_CONTRACT.json`](docs/RUST_RUNTIME_CONTRACT.json)

The Rust diagnostic hash is intentionally **not** treated as a cross-runtime `GLUBALL-EVIDENCE-V1` receipt.

---

# Physical CUDA acceptance

## GLUBALL-CUDA-ACCEPTANCE-V1

Physical CUDA correctness is deliberately split between a CUDA producer and an independent Rust verifier.

```text
physical CUDA execution
        |
        v
complete ordered CUDA readback
        |
        v
GLUBALL-CUDA-F32LE-XYZR-V1
        |
        v
independent Rust recomputation
        |
        v
GLUBALL-CUDA-ACCEPTANCE-V1
```

The CUDA producer is not allowed to grade itself against the reference.

The independent Rust acceptance process checks:

* complete requested-domain coverage;
* exact artifact length;
* finite output values;
* component residual limits;
* Euclidean residual limits;
* CUDA-reported tube-radius residual;
* sidecar/domain agreement;
* complete ordered readback.

Only the independent acceptance record may assert:

```text
reference_residual_checked: true
conformance_acceptance: true
```

CUDA output remains:

```text
geometry_receipt_authority: false
```

See:

[`docs/CUDA_ACCEPTANCE.md`](docs/CUDA_ACCEPTANCE.md)
[`docs/CUDA_ACCEPTANCE_CONTRACT.json`](docs/CUDA_ACCEPTANCE_CONTRACT.json)

---

# Phase 5B physical CUDA evidence

GLUBALL completed a physical same-host CUDA correctness ladder on RTX 4080 SUPER hardware:

```text
1 GPU  PASS ×3
2 GPU  PASS ×3
4 GPU  PASS ×3
8 GPU  PASS ×3
```

That campaign represents:

```text
12 accepted physical CUDA evidence runs
25,165,824 independently Rust-checked point-results
```

Accepted device-count ladder:

```text
1 → 2 → 4 → 8
```

The evidence includes complete output readback, independent residual acceptance, sanitizer archival, provenance, and SHA-256 integrity manifests.

See:

[`docs/PHASE5B_GRADUATION.md`](docs/PHASE5B_GRADUATION.md)

### Accepted 1 / 2 / 4-GPU artifact

```text
run:      33378934659
source:   d73ad661464eb040e2966e5e9f036941543b4524
artifact: 9753091493
SHA-256:  6ba740acf06617d0cf93d2d3548b6e0783994b88b9ed40ee342349f9f9d23747
GPU:      NVIDIA GeForce RTX 4080 SUPER
CC:       8.9
CUDA:     12.8.93
```

### Accepted 8-GPU artifact

```text
run:      33388107831
source:   0505b6e20e4f79514671fd63bb1e1f6d997a4493
artifact: 9756414599
SHA-256:  fd75447d5dbd88909a69339627c3e0114627aca5b7bfb66a0c9705b7fd03944d
GPU:      NVIDIA GeForce RTX 4080 SUPER
CC:       8.9
CUDA:     12.8.93
```

Phase 5B establishes accelerator correctness evidence.

It does **not** establish a universal speedup claim.

---

# CUDA Runtime V2

```text
GLUBALL-CUDA-RUNTIME-V2
```

Runtime V2 is a throughput-observation engine rather than a full-readback correctness path.

Major changes include:

* hierarchical block reductions;
* compact resident metrics;
* persistent streams and events;
* persistent device contexts;
* compact host readback;
* repeated timing observations;
* optional CUDA Graph replay.

Instead of retaining the complete point field, Runtime V2 retains compact metrics such as:

```text
diagnostic XOR
maximum tube-radius error
non-finite count
```

Runtime V2 always remains:

```text
performance_observation_only: true
complete_output_readback: false
reference_residual_checked: false
conformance_acceptance: false
geometry_receipt_authority: false
universal_speedup_claim: false
```

See:

[`docs/CUDA_RUNTIME_V2.md`](docs/CUDA_RUNTIME_V2.md)
[`docs/CUDA_RUNTIME_V2_CONTRACT.json`](docs/CUDA_RUNTIME_V2_CONTRACT.json)

---

# CUDA Runtime V3

```text
GLUBALL-CUDA-RUNTIME-V3
```

Runtime V3 is an additive efficiency-research layer.

It introduces:

* deterministic geometry precomputation;
* warp-per-complete-ring execution;
* warp-shuffle compact reductions;
* reduced hot-path index recovery;
* CUDA Graph compatibility;
* bounded configuration tuning.

The default finite tuning surface includes:

```text
block sizes:
32 64 128 256 512 1024

CUDA Graphs:
off on

trials:
3
```

A tuner result is the **best observed candidate within the declared finite set**.

It is not a proof of a global optimum.

See:

[`docs/CUDA_RUNTIME_V3.md`](docs/CUDA_RUNTIME_V3.md)
[`docs/CUDA_RUNTIME_V3_CONTRACT.json`](docs/CUDA_RUNTIME_V3_CONTRACT.json)

---

# CUDA Runtime V3.1

```text
GLUBALL-CUDA-RUNTIME-V3.1
```

Runtime V3.1 adds further bounded efficiency refinements:

* packed compact metrics;
* radius-weighted angle lookup tables;
* canonical `(2,3)` frame trig factoring;
* atomic reduction mode;
* two-stage reduction mode;
* matched Runtime V3 baselines;
* stream-reduce-discard memory discipline.

The V3.1 tuner evaluates:

```text
6 block sizes
× 2 CUDA Graph modes
× 2 reduction modes
= 24 candidates
```

with 12 matched Runtime V3 baseline configurations.

Persistent memory is explicitly bounded by:

```text
O(U)
O(V)
O(block summaries)
O(1) final metrics/device
```

A complete `O(U*V)` cached answer is forbidden for throughput claims.

See:

[`docs/CUDA_RUNTIME_V31.md`](docs/CUDA_RUNTIME_V31.md)
[`docs/CUDA_RUNTIME_V31_CONTRACT.json`](docs/CUDA_RUNTIME_V31_CONTRACT.json)

---

# Runtime diagnostic boundary

Physical Pascal testing demonstrated that Runtime V2 and Runtime V3 need not produce identical raw binary32 diagnostic digests even when the accepted shared observations remain equivalent.

The observed relation was:

```text
V2    1e15cffd50e6f653
V3    1e206a0f3b649b9a
V3.1  1e206a0f3b649b9a
```

Therefore:

```text
V2 ↔ V3 raw-float digest equality:
not required

V3 ↔ V3.1 same-device digest equality:
required
```

Raw float-bit digests are execution diagnostics.

They are not geometry receipts.

---

# Runtime V3.1 architecture ladder

GLUBALL includes a fail-closed physical architecture campaign for cross-generation observations.

Registered profiles include:

| Profile  | Architecture | Compute capability | Native target | Role                  |
| -------- | ------------ | -----------------: | ------------- | --------------------- |
| Titan Xp | Pascal       |                6.1 | `sm_61`       | historical follow-up  |
| V100     | Volta        |                7.0 | `sm_70`       | selected ladder       |
| T4       | Turing       |                7.5 | `sm_75`       | optional reference    |
| GTX 1650 | Turing       |                7.5 | `sm_75`       | selected ladder       |
| RTX 3050 | Ampere       |                8.6 | `sm_86`       | supplemental consumer |
| A100     | Ampere       |                8.0 | `sm_80`       | selected ladder       |
| H200     | Hopper       |                9.0 | `sm_90`       | selected ladder       |
| B200     | Blackwell    |               10.0 | `sm_100`      | selected ladder       |

The selected strict campaign is:

```text
V100 → GTX 1650 → A100 → H200 → B200
```

A qualifying physical result must bind:

* exact GPU model identity;
* compute capability;
* native SM;
* canonical workload;
* full-GPU allocation;
* appropriate MIG state;
* exact source commit;
* frozen Runtime V2/V3/V3.1 sources;
* frozen measured build inputs;
* physical preflight;
* claim boundaries.

See:

[`docs/CUDA_RUNTIME_V31_ARCHITECTURE_LADDER.md`](docs/CUDA_RUNTIME_V31_ARCHITECTURE_LADDER.md)
[`docs/CUDA_RUNTIME_V31_ARCHITECTURE_LADDER.json`](docs/CUDA_RUNTIME_V31_ARCHITECTURE_LADDER.json)
[`docs/CUDA_RUNTIME_V31_ARCHITECTURE_PROFILES.json`](docs/CUDA_RUNTIME_V31_ARCHITECTURE_PROFILES.json)

---

# Accepted architecture specimens

## GTX 1650 — Turing

```text
run:       33630241971
source:    73a32f28c6472d3f2bc3a73e30e4f47af5633490
artifact:  9846555505
SHA-256:   ef8cbbe2622638df1629d626e0b8b7c568e53ad711aaa9050fe09f29bfcee16a
GPU:       NVIDIA GeForce GTX 1650
CC / SM:   7.5 / sm_75
```

V1:

```text
3 / 3 PASS
byte-identical output fields
```

Observed medians:

```text
atomic:
V2    0.690525 ms
V3    0.142753 ms
V3.1  0.139444 ms

two-stage:
V2    0.691054 ms
V3    0.141176 ms
V3.1  0.141916 ms
```

Best bounded V3.1 candidate:

```text
block size:  128
graphs:      off
reduction:   atomic
wall median: 0.137519 ms
```

Accepted record:

[`docs/physical-evidence/CUDA_RUNTIME_V31_GTX1650_RUN_33630241971.json`](docs/physical-evidence/CUDA_RUNTIME_V31_GTX1650_RUN_33630241971.json)

---

## RTX 3050 — supplemental consumer Ampere

```text
run:       35847244344
source:    4d327e0151b83a61c3357e0d3f72253e4a05dbb9
artifact:  10743669801
SHA-256:   f504a890bb4575c0169daaaa86bf5213a2993c14b26cb41c85b9972058be35c3
GPU:       NVIDIA GeForce RTX 3050
CC / SM:   8.6 / sm_86
```

V1:

```text
3 / 3 PASS
byte-identical output fields
```

Observed medians:

```text
atomic:
V2    0.463456 ms
V3    0.111186 ms
V3.1  0.111946 ms

two-stage:
V2    0.458956 ms
V3    0.111539 ms
V3.1  0.109211 ms
```

Best bounded V3.1 candidate:

```text
block size:  128
graphs:      on
reduction:   atomic
wall median: 0.108044 ms
```

All four direct Runtime V3.1 sanitizer checks exited successfully.

Accepted record:

[`docs/physical-evidence/CUDA_RUNTIME_V31_RTX3050_RUN_35847244344.json`](docs/physical-evidence/CUDA_RUNTIME_V31_RTX3050_RUN_35847244344.json)

The RTX 3050 is supplemental Ampere evidence.

It is **not** an A100 substitute.

---

# Legacy CUDA negative control

## GT 730 / GF108

GLUBALL includes an adversarial CUDA-runtime availability fixture:

```text
profile:             gt-730-gf108
PCI ID:              10de:0f02
GPU:                 NVIDIA GF108 / GeForce GT 730
architecture:        Fermi
compute capability:  2.1
native target:       sm_21
kernel driver:       nouveau
OpenGL:              Mesa / NVC1
CUDA toolkit:        12.8
nvidia-smi:          unusable
/dev/nvidia*:        absent
```

This physically demonstrates:

```text
NVIDIA PCI hardware present
        ≠
NVIDIA proprietary runtime usable
        ≠
CUDA workload executable
```

The machine has NVIDIA hardware, accelerated graphics, CUDA toolkit userspace, and CUDA libraries, while the proprietary NVIDIA runtime remains unusable.

The normal Runtime V3.1 architecture preflight correctly rejects the machine.

Accepted negative-control specimen:

```text
run:       35863047782
job:       107187738646
source:    69256247e6125d726f06c9735f21635d5e56bbe2
artifact:  10750992566
SHA-256:   1e8393154f59d11303a237d6a01ac57460714ece591612d094c2da254529d5ee
```

Observed:

```text
negative-control verifier:              PASS
normal architecture preflight:          FAIL
NVIDIA-SMI-visible GPU count:           0
safe CUDA inventory:                    null
```

Accepted record:

[`docs/physical-evidence/CUDA_RUNTIME_V31_GT730_NEGATIVE_RUN_35863047782.json`](docs/physical-evidence/CUDA_RUNTIME_V31_GT730_NEGATIVE_RUN_35863047782.json)

See:

[`docs/CUDA_RUNTIME_V31_LEGACY_NEGATIVE_CONTROL.md`](docs/CUDA_RUNTIME_V31_LEGACY_NEGATIVE_CONTROL.md)

This specimen is **not** part of the performance ladder.

---

# Evidence integrity

GLUBALL's physical evidence system uses fail-closed validation including:

* exact source-commit binding;
* frozen CUDA-source Git blob identities;
* frozen measured build inputs;
* exact hardware profile identity;
* canonical workload binding;
* complete artifact manifests;
* nested SHA-256 verification;
* physical preflight receipts;
* profile-definition receipts;
* receipt-to-summary consistency checks;
* complete durable-file inventories;
* rejection of unmanifested evidence;
* explicit claim-boundary validation;
* no raw GPU UUID publication.

Durable accepted evidence is retained under:

```text
docs/physical-evidence/
```

so key acceptance records remain inspectable after transient GitHub Actions artifacts expire.

---

# Claim boundary

GLUBALL makes a deliberate distinction between:

```text
canonical geometry
deterministic identity evidence
accelerator correctness evidence
performance observations
presentation
```

These are not interchangeable.

The project does **not** infer from the current evidence that:

* CUDA output is geometry authority;
* faster hardware changes the canonical GLUBALL object;
* one GPU architecture is universally faster than another;
* diagnostic raw-float hashes are geometry receipts;
* browser rendering is physical truth;
* `(2,3)` GLUBALL geometry is established as a QCD glueball;
* successful accelerator execution validates a physical theory.

Core boundaries include:

```text
geometry_receipt_authority:      false
universal_speedup_claim:         false
cross_device_portability_claim:  false
raw_device_uuid_published:       false
```

Performance measurements are observations of explicitly identified hardware, software, workload, and toolchain configurations.

---

# Formal release record

The complete GLUBALL v1.1.0 scholarly software record is archived independently on Zenodo:

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.22921029.svg)](https://doi.org/10.5281/zenodo.22921029)

Citation:

```text
Slade, T. (2026). GLUBALL v1.1.0: Formal Release Record,
Deterministic Torus-Knot Laboratory, Native Runtime,
Physical CUDA Evidence, and Browser Visualization
(Version v1.1.0) [Computer software]. Zenodo.
https://doi.org/10.5281/zenodo.22921029
```

The Zenodo deposit contains:

* formal release PDF;
* structured data tables;
* editable/source manuscript;
* machine-readable metadata;
* source/provenance references;
* citation metadata;
* SHA-256 integrity information.

The GLUBALL Zenodo record is self-contained.

It does not depend on the separate RSH / Lean 4 formalization record.

---

# Validation

Core deterministic checks:

```bash
node tests/smoke.mjs
node tests/phase2.mjs
node tests/agent-contract.mjs
node tests/release-preflight.mjs
```

Browser checks:

```bash
node tests/renderer.mjs
node tests/browser-controls.mjs
```

Rust runtime:

```bash
cargo test --all-targets
cargo run --release -- self-test
```

Additional repository CI covers:

* CUDA source boundaries;
* Runtime V2;
* Runtime V3;
* Runtime V3.1;
* physical workflow definitions;
* architecture profiles;
* physical preflight;
* frozen measured build inputs;
* receipt binders;
* durable GTX 1650 evidence;
* durable RTX 3050 evidence;
* GT 730 negative-control evidence;
* self-hosted runner safety boundaries.

---

# What this repository deliberately does not contain

The retired VORTEX mouth/centre subsystem is not part of GLUBALL.

The previous:

```text
gate → exact centre → mouth
```

rule, D1/D2 receiver geometry, mouth/anus anchors, centre-transfer semantics, and related retired geometry are not GLUBALL dependencies.

See:

[`docs/PROVENANCE_BOUNDARY.md`](docs/PROVENANCE_BOUNDARY.md)

The browser is, however, still permitted to display:

```text
MOUTH / ANUS SUBSYSTEM: NOT FOUND
```

because software archaeology should occasionally be funny.

---

# Future work

The larger research program remains intentionally incomplete.

Future work includes:

* same-source completion of the selected cross-generation ladder;
* V100 physical specimen;
* same-source GTX 1650 rerun where required;
* A100 physical specimen;
* H200 physical specimen;
* B200 physical specimen;
* optional T4 datacenter reference;
* further Phase 5C scaling experiments;
* optional CPU/WASM conformance;
* machine-checked global thick-tube embeddedness;
* further formal treatment of the frozen geometry contract.

Strict cross-profile comparisons require specimens collected from one common merged source commit.

---

# Project layers

```text
GLUBALL-KNOT-V1
Frozen canonical geometry
        |
        v
GLUBALL-SAMPLING-V1 / GLUBALL-EVIDENCE-V1
Deterministic execution and identity
        |
        v
GLUBALL-RUST-RUNTIME-V1
Native reference execution
        |
        v
GLUBALL-CUDA-ACCEPTANCE-V1
Independent physical CUDA residual acceptance
        |
        v
CUDA Runtime V2 / V3 / V3.1
Performance research
        |
        v
Physical architecture campaigns
        |
        v
Durable evidence archives
```

`v1.0.0` froze the object.

`v1.1.0` built the laboratory around it.

---

## Repository

Source:

[https://github.com/QSOLKCB/GLUBALL](https://github.com/QSOLKCB/GLUBALL)

Latest release:

[https://github.com/QSOLKCB/GLUBALL/releases/tag/v1.1.0](https://github.com/QSOLKCB/GLUBALL/releases/tag/v1.1.0)

Live laboratory:

[https://qsolkcb.github.io/GLUBALL/](https://qsolkcb.github.io/GLUBALL/)

Formal record:

[https://doi.org/10.5281/zenodo.22921029](https://doi.org/10.5281/zenodo.22921029)

For coding/AI agents, begin with:

[`AGENTS.md`](AGENTS.md)

and:

[`docs/AI_AGENT_CONTRACT.json`](docs/AI_AGENT_CONTRACT.json)

---

## Licence

Mozilla Public License 2.0.

See [`LICENSE`](LICENSE).
