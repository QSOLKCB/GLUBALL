# CUDA Runtime V3.1 legacy negative control

This workflow is deliberately separate from the Runtime V3.1 performance architecture ladder. It exists to prove that GLUBALL does not confuse NVIDIA hardware presence, a working graphics stack, or an installed CUDA toolkit with a usable proprietary NVIDIA CUDA runtime.

## Exact first profile

The first profile is:

```text
gt-730-gf108
PCI ID:             10de:0f02
GPU:                NVIDIA GF108 / GeForce GT 730
architecture:       Fermi
compute capability: 2.1
native target:      sm_21
expected driver:    nouveau
OpenGL vendor:      Mesa or nouveau
OpenGL renderer:    NVC1
```

This is intentionally the GF108/Fermi GT 730 variant, not every product sold as "GT 730". NVIDIA's legacy CUDA table lists the DDR3 128-bit GT 730 under compute capability 2.1. CUDA 9 removed Fermi / compute capability 2.x support, so the current Runtime V3.1 CUDA ladder cannot execute this specimen with a modern toolkit.

Primary references:

- NVIDIA legacy compute-capability table: https://developer.nvidia.com/cuda/gpus/legacy
- CUDA 9 programming-guide change record: https://docs.nvidia.com/cuda/archive/9.0/cuda-c-programming-guide/

## Expected physical state

The negative control requires all of the following at once:

```text
NVIDIA PCI hardware present            true
exact PCI identity 10de:0f02           true
kernel display driver                  nouveau
Mesa/nouveau OpenGL                     usable
nvcc release                            12.8
compute_21 advertised by nvcc           false
sm_21 advertised by nvcc                false
nvidia-smi                              unusable
/dev/nvidia*                            absent
```

The verifier accepts the Mesa/Nouveau Gallium stack reporting either `Mesa` or `nouveau` as the OpenGL vendor, but still requires renderer `NVC1`. It also binds this first specimen to CUDA toolkit release `12.8`; another toolkit release is a profile mismatch even if it likewise omits Fermi targets. The presence of `libcuda`, `libcudart`, or `nvcc` is recorded diagnostically but is not treated as evidence that CUDA execution is usable.

## Fail-closed assertion

The workflow then invokes the existing Runtime V3.1 physical architecture preflight against the exact negative-control profile. The expected result is:

```text
physical preflight receipt status: FAIL
NVIDIA-SMI-visible GPU count:       0
safe CUDA GPU inventory:            null
workflow negative-control result:   PASS
```

A passing negative-control workflow therefore means the host matched the declared legacy configuration and the normal architecture-ladder gate correctly refused to graduate it. It does **not** mean a CUDA workload ran successfully.

The workflow uses the existing self-hosted label:

```text
gluball-vast-v31-architecture
```

and is manually dispatched as:

```text
GLUBALL Runtime V3.1 legacy negative control
profile: gt-730-gf108
```

## Completed physical GF108 negative-control specimen

The first physical legacy negative-control specimen completed successfully:

```text
run:       35863047782
job:       107187738646
source:    69256247e6125d726f06c9735f21635d5e56bbe2
artifact:  10750992566
sha256:    1e8393154f59d11303a237d6a01ac57460714ece591612d094c2da254529d5ee
profile:   gt-730-gf108
result:    negative-control PASS / normal architecture preflight FAIL as expected
```

The downloaded artifact was independently verified. The archived receipt manifest binds the exact negative-control receipt, the fail-closed architecture-preflight receipt, its exit status, host uname, and source commit. Durable exact-byte receipts are retained under:

```text
docs/physical-evidence/gt-730-gf108-35863047782/
```

The compact accepted record is:

```text
docs/physical-evidence/CUDA_RUNTIME_V31_GT730_NEGATIVE_RUN_35863047782.json
```

This specimen is now a durable known-hostile runtime-availability fixture: NVIDIA PCI hardware, Mesa/nouveau graphics, CUDA 12.8 userspace, and CUDA libraries are present, while the proprietary NVIDIA runtime is unusable, no NVIDIA device nodes are present, and the normal architecture-ladder preflight correctly refuses graduation. It remains outside the performance ladder and establishes no CUDA performance or portability claim.

## Claim boundary

This experiment is a runtime-availability boundary test only.

```text
performance_observation_only:          true
geometry_receipt_authority:            false
universal_speedup_claim:               false
cross_device_portability_claim:        false
raw_device_uuid_queried:               false
raw_device_uuid_published:             false
```

No timing result from this negative control belongs in the cross-generation performance ladder.
