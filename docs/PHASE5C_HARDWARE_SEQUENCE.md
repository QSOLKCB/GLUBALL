# Phase 5C hardware campaign sequence

This document records the preferred hardware order for GLUBALL's post-acceptance scaling and portability work.

It is an **operational research plan**, not a frozen geometry contract, hardware availability guarantee, or speedup claim. Vast.ai offers may disappear or change, so equivalent hosts may be substituted while preserving the experimental role and evidence boundary described here.

## Entry gate

Do not begin this sequence until the current 8× RTX 4080 SUPER Phase 5B completion rung has produced at least three accepted physical evidence runs, sanitizer evidence or explicit unavailability has been archived, and the downloaded campaign/bundle manifests verify.

## Ordered campaign plan

1. **Finish the current 8× RTX 4080 SUPER evidence rung so Phase 5B closes cleanly.**
   - Use the dedicated 8-GPU completion workflow.
   - Require at least three accepted full-readback Rust residual checks.
   - Archive sanitizer status and verify both inner and root manifests.
   - Do not promote the 8-GPU roadmap rung until those artifacts verify.

2. **Use the same 8× RTX 4080 SUPER host for the first controlled 1/2/4/8 strong-scaling campaign.**
   - This host already has correctness provenance from the physical acceptance ladder.
   - Hold source commit, workload, driver/toolkit, host, and GPU model fixed.
   - Change only selected device count: `1 -> 2 -> 4 -> 8`.
   - Compute speedup and parallel efficiency outside the correctness claim surface.

3. **Rent a 9× RTX 4090 host as the second same-host scaling baseline and architecture/profile comparison.**
   - Use eight selected devices for a directly comparable `1/2/4/8` campaign; the ninth device is not required for the primary scaling series.
   - Repeat an accepted evidence profile before interpreting throughput observations.
   - Treat differences from the 4080 SUPER host as architecture/platform observations, not universal performance claims.

4. **Try an NVIDIA GB10 host as the strange portability specimen.**
   - Treat GB10 as a distinct NVIDIA platform/toolchain/CPU-memory profile rather than a multi-GPU scaling target.
   - Run bounded acceptance first.
   - Use it to probe whether the CUDA adapter and evidence path remain portable across a materially different NVIDIA system configuration.
   - Do not infer multi-GPU scaling from this single-device portability experiment.

5. **Only then unleash the RTX 5090 hydra and identify where GLUBALL stops scaling and another bottleneck takes over.**
   - Treat RTX 5090 campaigns as maximum-throughput follow-ups.
   - Prefer a same-host multi-GPU system capable of a controlled `1/2/4/8` series before attempting larger device counts.
   - Measure where kernel work, PCIe/fabric transfer, synchronization, CPU orchestration, digest work, memory traffic, or storage becomes limiting.
   - A larger/faster GPU count must not revise GLUBALL geometry authority, correctness gates, or the frozen v1.0.0 contract surface.

## Interpretation boundary

The campaign sequence is intentionally ordered:

```text
8×4080 SUPER Phase 5B completion
        ↓
8×4080 SUPER controlled 1/2/4/8 scaling
        ↓
9×4090 second-host scaling/profile comparison
        ↓
GB10 portability specimen
        ↓
RTX 5090 maximum-throughput / bottleneck campaign
```

The sequence separates four questions that must not be collapsed into one claim:

- **correctness:** did the physical output pass independent residual acceptance?
- **scaling:** how does elapsed time change as same-host device count changes?
- **portability:** does the accepted CUDA path survive a materially different NVIDIA platform?
- **maximum throughput:** how far can the implementation be pushed before a non-kernel bottleneck dominates?

Faster hardware is observation infrastructure. It is not geometry authority and does not create a universal speedup claim.
