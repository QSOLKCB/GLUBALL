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
OpenGL vendor:      Mesa
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
Mesa OpenGL                             usable
nvcc                                    present
compute_21 advertised by nvcc           false
sm_21 advertised by nvcc                false
nvidia-smi                              unusable
/dev/nvidia*                            absent
```

The presence of `libcuda`, `libcudart`, or `nvcc` is recorded diagnostically but is not treated as evidence that CUDA execution is usable.

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
