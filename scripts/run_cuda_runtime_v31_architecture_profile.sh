#!/bin/sh
# SPDX-License-Identifier: MPL-2.0
# Run one physical Runtime V3.1 architecture-ladder profile.
set -eu

PROFILE=${PROFILE:?PROFILE is required}
MODEL_FRAGMENT=${MODEL_FRAGMENT:?MODEL_FRAGMENT is required}
EVIDENCE_ROOT=${EVIDENCE_ROOT:?EVIDENCE_ROOT is required}
U=${U:-16384}
V=${V:-128}
WARMUP=${WARMUP:-20}
ITERATIONS=${ITERATIONS:-1000}
TRIALS=${TRIALS:-3}

case "$PROFILE" in
  titan-xp|h200) ;;
  *) echo "PROFILE must be titan-xp or h200" >&2; exit 2 ;;
esac

python3 - "$U" "$V" "$WARMUP" "$ITERATIONS" "$TRIALS" <<'PY'
import sys
names = ("U", "V", "WARMUP", "ITERATIONS", "TRIALS")
limits = ((12, 1_000_000), (6, 65_536), (0, 1_000), (2, 10_000), (1, 20))
for name, raw, (lo, hi) in zip(names, sys.argv[1:], limits):
    if not raw.isdecimal() or not lo <= int(raw) <= hi:
        raise SystemExit(f"{name} must be a decimal integer in [{lo},{hi}]")
PY

root=$EVIDENCE_ROOT
mkdir -p "$root"

finalize() {
  original_status=$?
  trap - EXIT
  set +e
  python3 scripts/finalize_cuda_runtime_v31_architecture.py \
    "$root" --profile "$PROFILE" --u "$U" --v "$V" \
    --warmup "$WARMUP" --iterations "$ITERATIONS" --trials "$TRIALS"
  finalizer_status=$?
  if [ -d "$root" ]; then
    (cd "$root" && find . -type f ! -name BUNDLE_SHA256SUMS.txt -print0 | LC_ALL=C sort -z | xargs -0 sha256sum > BUNDLE_SHA256SUMS.txt)
  fi
  if [ "$original_status" -ne 0 ]; then
    exit "$original_status"
  fi
  exit "$finalizer_status"
}
trap finalize EXIT

# Safe host provenance. Do not query or publish raw device UUIDs.
git rev-parse HEAD | tee "$root/SOURCE_COMMIT.txt"
uname -a | tee "$root/HOST_UNAME.txt"
uname -m | tee "$root/HOST_ARCH.txt"
cat /etc/os-release > "$root/OS_RELEASE.txt"
test "$(uname -m)" = x86_64
nvidia-smi --query-gpu=index,name,driver_version,compute_cap,memory.total --format=csv | tee "$root/NVIDIA_INVENTORY.csv"
model=$(nvidia-smi --query-gpu=name --format=csv,noheader | sed -n '1p')
capability=$(nvidia-smi --query-gpu=compute_cap --format=csv,noheader | sed -n '1p')
python3 - "$model" "$MODEL_FRAGMENT" <<'PY'
import sys
model, fragment = sys.argv[1:]
if fragment.casefold() not in model.casefold():
    raise SystemExit(f"unexpected GPU model: {model!r}; expected fragment {fragment!r}")
PY
arch_digits=$(printf '%s' "$capability" | tr -d '.')
expected_compute="compute_${arch_digits}"
expected_sm="sm_${arch_digits}"
printf '%s\n' "$model" > "$root/SELECTED_GPU_MODEL.txt"
printf '%s\n' "$capability" > "$root/EXPECTED_COMPUTE_CAPABILITY.txt"
printf '%s\n' "$expected_sm" > "$root/EXPECTED_SM.txt"
printf '0\n' > "$root/SELECTED_DEVICES.txt"
printf '%s\n' "$PROFILE" > "$root/PROFILE.txt"
nvcc --version | tee "$root/NVCC.txt"
nvcc --list-gpu-arch | tee "$root/NVCC_GPU_ARCHS.txt"
nvcc --list-gpu-code | tee "$root/NVCC_GPU_CODE.txt"
grep -Fxq "$expected_compute" "$root/NVCC_GPU_ARCHS.txt"
grep -Fxq "$expected_sm" "$root/NVCC_GPU_CODE.txt"
if command -v ptxas >/dev/null 2>&1; then ptxas --version > "$root/PTXAS_VERSION.txt" 2>&1; fi
rustc --version | tee "$root/RUSTC.txt"
cargo --version | tee "$root/CARGO.txt"
cmake --version | tee "$root/CMAKE.txt"
compute-sanitizer --version | tee "$root/COMPUTE_SANITIZER.txt"
touch "$root/HOST_VALIDATION.ok"

# Best-effort compiler resource telemetry. This is diagnostic only and is not a graduation gate.
resource_root="$root/compiler-resources"
resource_build="build/cuda-v31-resource-${PROFILE}"
mkdir -p "$resource_root"
set +e
cmake -S native/cuda -B "$resource_build" \
  -DCMAKE_BUILD_TYPE=Release \
  -DGLUBALL_CUDA_ARCHITECTURES=native \
  -DCMAKE_CUDA_FLAGS="--ptxas-options=-v" \
  > "$resource_root/configure.txt" 2>&1
resource_configure_status=$?
resource_build_status=99
if [ "$resource_configure_status" -eq 0 ]; then
  cmake --build "$resource_build" --target \
    gluball-cuda-runtime-v2 gluball-cuda-runtime-v3 gluball-cuda-runtime-v31 --parallel \
    > "$resource_root/build.txt" 2>&1
  resource_build_status=$?
else
  : > "$resource_root/build.txt"
fi
set -e
ptxas_info_seen=false
if grep -Fq 'ptxas info' "$resource_root/build.txt"; then ptxas_info_seen=true; fi
python3 - "$resource_root/RESOURCE_CAPTURE_STATUS.json" "$resource_configure_status" "$resource_build_status" "$ptxas_info_seen" <<'PY'
import json, sys
from pathlib import Path
out, configure, build, seen = sys.argv[1:]
payload = {
    "schema": "gluball-cuda-runtime-v31-compiler-resource-capture/1",
    "capture_attempted": True,
    "graduation_gate": False,
    "configure_exit_code": int(configure),
    "build_exit_code": int(build),
    "ptxas_info_seen": seen == "true",
    "performance_observation_only": True,
    "geometry_receipt_authority": False,
    "universal_speedup_claim": False,
}
Path(out).write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
PY

# V1 bounded correctness anchor and full-readback Rust acceptance.
MODE=evidence \
U=512 V=32 REPEATS=1 RUNS=3 DEVICES=0 RUST_WORKERS=8 LOGICAL_DEVICE_SLOTS=1 \
GLUBALL_CUDA_ARCHITECTURES=native \
CAMPAIGN_ID="arch-${PROFILE}-v1" \
ARTIFACT_DIR="$PWD/$root/v1-acceptance" \
sh scripts/run_vast_campaign.sh
python3 scripts/verify_cuda_v1_campaign.py "$root/v1-acceptance" --expected-runs 3
(cd "$root/v1-acceptance" && sha256sum -c SHA256SUMS.txt)
touch "$root/V1_VALIDATION.ok"

# Same-device V2/V3/V3.1 observation boundaries, atomic and two-stage.
U="$U" V="$V" REPEATS=1 DEVICES=0 BLOCK_SIZE=256 WARMUP="$WARMUP" ITERATIONS="$ITERATIONS" \
CUDA_GRAPHS=off REDUCTION=atomic GLUBALL_CUDA_ARCHITECTURES=native \
BUILD_DIR="$PWD/build/cuda-v31-arch-ab-${PROFILE}" OUTPUT_DIR="$PWD/$root/ab-atomic" \
sh scripts/compare_cuda_runtime_v2_v3_v31.sh

U="$U" V="$V" REPEATS=1 DEVICES=0 BLOCK_SIZE=256 WARMUP="$WARMUP" ITERATIONS="$ITERATIONS" \
CUDA_GRAPHS=off REDUCTION=two-stage GLUBALL_CUDA_ARCHITECTURES=native \
BUILD_DIR="$PWD/build/cuda-v31-arch-ab-${PROFILE}" OUTPUT_DIR="$PWD/$root/ab-two-stage" \
sh scripts/compare_cuda_runtime_v2_v3_v31.sh

# Full bounded tuner with matched Runtime V3 baselines.
U="$U" V="$V" REPEATS=1 DEVICES=0 WARMUP="$WARMUP" ITERATIONS="$ITERATIONS" TRIALS="$TRIALS" \
BLOCK_SIZES="32,64,128,256,512,1024" GRAPH_MODES="off,on" REDUCTION_MODES="atomic,two-stage" \
GLUBALL_CUDA_ARCHITECTURES=native BUILD_DIR="$PWD/build/cuda-v31-arch-tune-${PROFILE}" \
OUTPUT_DIR="$PWD/$root/tuning" sh scripts/tune_cuda_runtime_v31.sh

# Direct Compute Sanitizer checks for both V3.1 reduction modes.
sanitizer_root="$root/v31-sanitizer"
mkdir -p "$sanitizer_root"
binary="$PWD/build/cuda-v31-arch-tune-${PROFILE}/gluball-cuda-runtime-v31"
test -x "$binary"
set +e
compute-sanitizer --tool memcheck --error-exitcode 86 \
  "$binary" --mode throughput --u 512 --v 32 --repeats 1 --devices 0 \
  --block-size 256 --warmup 1 --iterations 2 --cuda-graphs off --reduction atomic --repeat-run 0 \
  > "$sanitizer_root/memcheck-atomic.txt" 2>&1
memcheck_atomic_status=$?
compute-sanitizer --tool racecheck --error-exitcode 87 \
  "$binary" --mode throughput --u 512 --v 32 --repeats 1 --devices 0 \
  --block-size 256 --warmup 1 --iterations 2 --cuda-graphs off --reduction atomic --repeat-run 0 \
  > "$sanitizer_root/racecheck-atomic.txt" 2>&1
racecheck_atomic_status=$?
compute-sanitizer --tool memcheck --error-exitcode 86 \
  "$binary" --mode throughput --u 512 --v 32 --repeats 1 --devices 0 \
  --block-size 256 --warmup 1 --iterations 2 --cuda-graphs off --reduction two-stage --repeat-run 0 \
  > "$sanitizer_root/memcheck-two-stage.txt" 2>&1
memcheck_two_stage_status=$?
compute-sanitizer --tool racecheck --error-exitcode 87 \
  "$binary" --mode throughput --u 512 --v 32 --repeats 1 --devices 0 \
  --block-size 256 --warmup 1 --iterations 2 --cuda-graphs off --reduction two-stage --repeat-run 0 \
  > "$sanitizer_root/racecheck-two-stage.txt" 2>&1
racecheck_two_stage_status=$?
set -e
printf '%s\n' \
  "memcheck_atomic=$memcheck_atomic_status" \
  "racecheck_atomic=$racecheck_atomic_status" \
  "memcheck_two_stage=$memcheck_two_stage_status" \
  "racecheck_two_stage=$racecheck_two_stage_status" \
  > "$sanitizer_root/SANITIZER_EXIT_STATUS.txt"
failed=0
for status in "$memcheck_atomic_status" "$racecheck_atomic_status" "$memcheck_two_stage_status" "$racecheck_two_stage_status"; do
  [ "$status" -eq 0 ] || failed=1
done
grep -Fq 'ERROR SUMMARY: 0 errors' "$sanitizer_root/memcheck-atomic.txt" || failed=1
grep -Fq 'RACECHECK SUMMARY: 0 hazards displayed (0 errors, 0 warnings)' "$sanitizer_root/racecheck-atomic.txt" || failed=1
grep -Fq 'ERROR SUMMARY: 0 errors' "$sanitizer_root/memcheck-two-stage.txt" || failed=1
grep -Fq 'RACECHECK SUMMARY: 0 hazards displayed (0 errors, 0 warnings)' "$sanitizer_root/racecheck-two-stage.txt" || failed=1
if [ "$failed" -ne 0 ]; then
  cat "$sanitizer_root/SANITIZER_EXIT_STATUS.txt" >&2
  exit 88
fi
touch "$root/V31_SANITIZER.ok"
