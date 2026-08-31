# Phase 5C hardware campaign sequence

This document records the preferred hardware order for GLUBALL's post-acceptance scaling and portability work.

It is an **operational research plan**, not a frozen geometry contract, hardware availability guarantee, or speedup claim. Vast.ai offers may disappear or change, so equivalent hosts may be substituted while preserving the experimental role and evidence boundary described here.

## Entry gate

Phase 5B is complete. The accepted `1 / 2 / 4 / 8` physical CUDA ladder, sanitizer evidence, redacted provenance, and downloaded integrity manifests are recorded in `docs/PHASE5B_GRADUATION.md` and `docs/CURRENT_STATE.json`.

Phase 5C must not treat source-level Runtime V2 implementation as physical validation. Before scaling or portability claims are made:

1. `GLUBALL-CUDA-RUNTIME-V2` source/contract CI must be green;
2. the target NVIDIA host must successfully build Runtime V2;
3. a bounded V1 evidence run on that new architecture must still pass independent Rust full-readback acceptance;
4. Runtime V2 compact metrics must be repeatable for the measured run;
5. Runtime V2 remains throughput-only and cannot replace the V1 acceptance artifact.

## Runtime V2 pre-hardware gate

`GLUBALL-CUDA-RUNTIME-V2` is the preferred Phase 5C measurement runtime. It adds:

- block-local XOR reduction with one global digest atomic per block;
- persistent per-device CUDA contexts and compact metric buffers;
- repeated in-process warmup/measured iterations;
- explicit setup, kernel/wall, and compact-readback timing;
- optional CUDA Graph replay;
- no full-output allocation and no conformance claim.

See `docs/CUDA_RUNTIME_V2.md` and `docs/CUDA_RUNTIME_V2_CONTRACT.json`.

## Ordered campaign plan

1. **Land and review CUDA Runtime V2 before renting the next performance specimen.**
   - Keep the Phase 5B V1 evidence/acceptance path unchanged.
   - Require source-contract CI and current-state validation to remain green.
   - Do not mark Runtime V2 physically validated merely because it compiles in source review.

2. **Use an NVIDIA GB10 host as the first Runtime V2 portability specimen.**
   - Treat GB10 as a distinct NVIDIA platform/toolchain/CPU-memory profile rather than a multi-GPU scaling target.
   - Start with `GLUBALL_CUDA_ARCHITECTURES=native`; do not guess a numeric compute architecture in advance.
   - Run CUDA preflight and a bounded V1 evidence/independent Rust acceptance check first.
   - Build and run Runtime V2 with ordinary launches before enabling CUDA Graph replay.
   - Record compiler, driver/runtime, device-reported compute capability, timing decomposition, compact metric repeatability, and the selected architecture.
   - Do not infer multi-GPU scaling from this single-device portability experiment.

3. **Rent a same-host multi-GPU NVIDIA system for controlled Runtime V2 strong scaling.**
   - Prefer a host capable of a directly comparable `1 -> 2 -> 4 -> 8` series, such as an 8+ RTX 4090 offer when available.
   - Hold source commit, workload, block size, warmup count, measured iterations, graph policy, driver/toolkit, host, and GPU model fixed.
   - Change only selected device count.
   - Compute speedup and parallel efficiency outside the correctness claim surface.
   - Repeat a bounded V1 evidence profile on the new architecture before interpreting Runtime V2 throughput.

4. **Run a weak-scaling observation after the controlled strong-scaling baseline exists.**
   - Increase workload proportional to selected device count.
   - Keep measurement policy fixed.
   - Separate kernel/wall time from compact-readback and setup costs.

5. **Only then unleash the RTX 5090 hydra and identify where GLUBALL stops scaling and another bottleneck takes over.**
   - Treat RTX 5090 campaigns as maximum-throughput follow-ups.
   - Prefer a same-host multi-GPU system capable of a controlled `1/2/4/8` series before attempting larger device counts.
   - Runtime V2 supports up to sixteen selected devices for later maximum-throughput experiments, but the primary scaling comparison remains `1/2/4/8`.
   - Measure whether kernel work, PCIe/fabric transfer, synchronization, CPU orchestration, residual digest work, memory traffic, or storage becomes limiting.
   - A larger/faster GPU count must not revise GLUBALL geometry authority, correctness gates, or the frozen v1.0.0 contract surface.

## Interpretation boundary

The updated sequence is:

```text
Phase 5B accepted 1/2/4/8 correctness ladder
        ↓
CUDA Runtime V2 source/CI review
        ↓
GB10 V1 bounded acceptance + V2 portability observation
        ↓
same-host 1/2/4/8 Runtime V2 strong scaling
        ↓
weak scaling
        ↓
RTX 5090 maximum-throughput / bottleneck campaign
```

The sequence separates four questions that must not be collapsed into one claim:

- **correctness:** did physical output pass independent V1 full-readback residual acceptance?
- **scaling:** how does Runtime V2 elapsed time change as same-host device count changes?
- **portability:** does the accepted V1 CUDA path and observational V2 runtime survive a materially different NVIDIA platform?
- **maximum throughput:** how far can the implementation be pushed before a non-kernel bottleneck dominates?

Faster hardware is observation infrastructure. It is not geometry authority and does not create a universal speedup claim.
