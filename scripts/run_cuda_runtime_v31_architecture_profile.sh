#!/bin/sh
# SPDX-License-Identifier: MPL-2.0
# Run one physical Runtime V3.1 architecture-ladder profile.
set -eu

PROFILE=${PROFILE:?PROFILE is required}
PROFILE_REGISTRY=${PROFILE_REGISTRY:-docs/CUDA_RUNTIME_V31_ARCHITECTURE_PROFILES.json}
EVIDENCE_ROOT=${EVIDENCE_ROOT:?EVIDENCE_ROOT is required}
U=${U:-16384}
V=${V:-128}
WARMUP=${WARMUP:-20}
ITERATIONS=${ITERATIONS:-1000}
TRIALS=${TRIALS:-3}

profile_field() {
  python3 - "$PROFILE_REGISTRY" "$PROFILE" "$1" <<'PY'
import json
import sys
from pathlib import Path

registry_path = Path(sys.argv[1])
profile = sys.argv[2]
field = sys.argv[3]
payload = json.loads(registry_path.read_text())
if payload.get("schema") != "gluball-cuda-runtime-v31-architecture-profiles/1":
    raise SystemExit("unexpected architecture profile registry schema")
profiles = payload.get("profiles")
if not isinstance(profiles, dict) or profile not in profiles:
    raise SystemExit(f"unsupported architecture profile: {profile}")
value = profiles[profile].get(field)
if not isinstance(value, str) or not value:
    raise SystemExit(f"profile {profile} missing required field: {field}")
print(value)
PY
}

MODEL_REGEX=$(profile_field expected_model_regex_case_insensitive)
EXPECTED_PROFILE_CC=$(profile_field expected_compute_capability)
EXPECTED_PROFILE_SM=$(profile_field expected_sm)
ARCHITECTURE_FAMILY=$(profile_field architecture_family)

python3 - "$U" "$V" "$WARMUP" "$ITERATIONS" "$TRIALS" <<'PY'
import sys
names = ("U", "V", "WARMUP", "ITERATIONS", "TRIALS")
limits = ((12, 1_000_000), (6, 65_536), (0, 1_000), (2, 10_000), (1, 20))
for name, raw, (lo, hi) in zip(names, sys.argv[1:], limits):
    if not raw.isdecimal() or not lo <= int(raw) <= hi:
        raise SystemExit(f"{name} must be a decimal integer in [{lo},{hi}]")
PY

root=$EVIDENCE_ROOT
if [ -e "$root" ] && [ ! -d "$root" ]; then
  printf 'EVIDENCE_ROOT exists and is not a directory: %s\n' "$root" >&2
  exit 3
fi
if [ -d "$root" ] && find "$root" -mindepth 1 -print -quit | grep -q .; then
  printf 'EVIDENCE_ROOT must be empty before a new physical campaign: %s\n' "$root" >&2
  exit 3
fi
mkdir -p "$root"

python3 - "$PROFILE_REGISTRY" "$PROFILE" "$root/PROFILE_DEFINITION.json" <<'PY'
import json
import re
import sys
from pathlib import Path
registry_path, profile, output_path = sys.argv[1:]
payload = json.loads(Path(registry_path).read_text())
if payload.get("schema") != "gluball-cuda-runtime-v31-architecture-profiles/1":
    raise SystemExit("unexpected architecture profile registry schema")
definition = payload.get("profiles", {}).get(profile)
if not isinstance(definition, dict):
    raise SystemExit(f"unsupported architecture profile: {profile}")
pattern = definition.get("expected_model_regex_case_insensitive")
if not isinstance(pattern, str) or not pattern:
    raise SystemExit(f"profile {profile} missing model regex")
try:
    re.compile(pattern, flags=re.IGNORECASE)
except re.error as exc:
    raise SystemExit(f"profile {profile} has invalid model regex: {exc}") from exc
Path(output_path).write_text(json.dumps({
    "schema": "gluball-cuda-runtime-v31-architecture-profile-definition/1",
    "profile": profile,
    "definition": definition,
}, indent=2, sort_keys=True) + "\n")
PY

mark_manifest_failure() {
  python3 - "$root" <<'PY'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
for name, marker_key in (
    ("VALIDATION_STATUS.json", "required_markers"),
    ("ARCHITECTURE_RESULT.json", "required_stages"),
):
    path = root / name
    if not path.exists():
        continue
    try:
        payload = json.loads(path.read_text())
    except Exception:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}
    payload["status"] = "FAIL"
    payload["bundle_manifest_generated"] = False
    payload["bundle_manifest_error"] = "BUNDLE_SHA256SUMS.txt generation failed"
    markers = payload.get(marker_key)
    if isinstance(markers, dict):
        markers["bundle_manifest"] = False
    completed = payload.get("completed_required_stages")
    if isinstance(completed, list):
        payload["completed_required_stages"] = [x for x in completed if x != "bundle_manifest"]
    if payload.get("first_incomplete_required_stage") is None:
        payload["first_incomplete_required_stage"] = "bundle_manifest"
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
PY
}

finalize() {
  original_status=$?
  trap - EXIT
  set +e
  python3 scripts/finalize_cuda_runtime_v31_architecture.py \
    "$root" --profile "$PROFILE" --u "$U" --v "$V" \
    --warmup "$WARMUP" --iterations "$ITERATIONS" --trials "$TRIALS"
  finalizer_status=$?

  manifest_status=1
  if [ -d "$root" ]; then
    python3 - "$root" <<'PY'
import hashlib
import sys
from pathlib import Path

root = Path(sys.argv[1])
output = root / "BUNDLE_SHA256SUMS.txt"
temporary = root / "BUNDLE_SHA256SUMS.txt.tmp"
excluded = {output.name, temporary.name}
lines = []
for path in sorted(
    (p for p in root.rglob("*") if p.is_file() and p.name not in excluded),
    key=lambda p: p.relative_to(root).as_posix(),
):
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    rel = path.relative_to(root).as_posix()
    lines.append(f"{digest.hexdigest()}  ./{rel}\n")
temporary.write_text("".join(lines))
temporary.replace(output)
PY
    manifest_status=$?
  fi

  if [ "$manifest_status" -ne 0 ]; then
    rm -f "$root/BUNDLE_SHA256SUMS.txt" "$root/BUNDLE_SHA256SUMS.txt.tmp" 2>/dev/null
    mark_manifest_failure
  fi

  if [ "$original_status" -ne 0 ]; then
    exit "$original_status"
  fi
  if [ "$finalizer_status" -ne 0 ]; then
    exit "$finalizer_status"
  fi
  exit "$manifest_status"
}
trap finalize EXIT

# Recompute frozen runtime source identities before any physical measurement.
python3 - "$root/FROZEN_RUNTIME_SOURCE_VALIDATION.json" <<'PY'
import json
import subprocess
import sys
from pathlib import Path

output = Path(sys.argv[1])
expected = {
    "runtime_v2": "12d49ec6f78a28ed8d6afb5e8c7df80961c8bfc1",
    "runtime_v3": "dc8e9b209abee3794e5e56d0b92fa6d40dd03fd0",
    "runtime_v31": "045fbf37725beb5d65b2332309626ccfa727f874",
}
paths = {
    "runtime_v2": "native/cuda/gluball_runtime_v2.cu",
    "runtime_v3": "native/cuda/gluball_runtime_v3.cu",
    "runtime_v31": "native/cuda/gluball_runtime_v31.cu",
}
contract_path = Path("docs/CUDA_RUNTIME_V31_ARCHITECTURE_LADDER.json")
contract = json.loads(contract_path.read_text())
contract_frozen = contract.get("frozen_runtime_source_blobs")
contract_matches_expected = contract_frozen == expected
observed = {}
for key, path in paths.items():
    observed[key] = subprocess.check_output(
        ["git", "hash-object", path], text=True
    ).strip()
source_matches = {key: observed[key] == expected[key] for key in expected}
status = "PASS" if contract_matches_expected and all(source_matches.values()) else "FAIL"
payload = {
    "schema": "gluball-cuda-runtime-v31-frozen-source-validation/1",
    "status": status,
    "contract_path": str(contract_path),
    "contract_matches_frozen_expected_map": contract_matches_expected,
    "expected_git_blob_ids": expected,
    "observed_git_blob_ids": observed,
    "source_matches_expected": source_matches,
    "runtime_source_frozen_during_measurement": True,
    "performance_observation_only": True,
    "geometry_receipt_authority": False,
    "universal_speedup_claim": False,
}
output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
if status != "PASS":
    raise SystemExit("Runtime V2/V3/V3.1 frozen source blob validation failed")
PY
touch "$root/FROZEN_RUNTIME_SOURCES.ok"

# Safe host provenance. Do not query or publish raw device UUIDs.
git rev-parse HEAD | tee "$root/SOURCE_COMMIT.txt"
uname -a | tee "$root/HOST_UNAME.txt"
uname -m | tee "$root/HOST_ARCH.txt"
cat /etc/os-release > "$root/OS_RELEASE.txt"
test "$(uname -m)" = x86_64
nvidia-smi --query-gpu=index,name,driver_version,compute_cap,memory.total --format=csv | tee "$root/NVIDIA_INVENTORY.csv"
model=$(nvidia-smi --query-gpu=name --format=csv,noheader | sed -n '1p')
capability=$(nvidia-smi --query-gpu=compute_cap --format=csv,noheader | sed -n '1p')
python3 - "$model" "$MODEL_REGEX" "$capability" "$EXPECTED_PROFILE_CC" <<'PY'
import re
import sys
model, pattern, capability, expected_capability = sys.argv[1:]
try:
    model_matches = re.fullmatch(pattern, model, flags=re.IGNORECASE) is not None
except re.error as exc:
    raise SystemExit(f"invalid profile model regex: {exc}") from exc
if not model_matches:
    raise SystemExit(f"unexpected GPU model: {model!r}; expected regex {pattern!r}")
if capability != expected_capability:
    raise SystemExit(
        f"unexpected compute capability for {model!r}: {capability!r}; expected {expected_capability!r}"
    )
PY
arch_digits=$(printf '%s' "$capability" | tr -d '.')
expected_compute="compute_${arch_digits}"
expected_sm="sm_${arch_digits}"
if [ "$expected_sm" != "$EXPECTED_PROFILE_SM" ]; then
  printf 'profile native SM mismatch: discovered %s, registry expects %s\n' "$expected_sm" "$EXPECTED_PROFILE_SM" >&2
  exit 4
fi
printf '%s\n' "$model" > "$root/SELECTED_GPU_MODEL.txt"
printf '%s\n' "$capability" > "$root/EXPECTED_COMPUTE_CAPABILITY.txt"
printf '%s\n' "$expected_sm" > "$root/EXPECTED_SM.txt"
printf '%s\n' "$EXPECTED_PROFILE_CC" > "$root/PROFILE_EXPECTED_COMPUTE_CAPABILITY.txt"
printf '%s\n' "$EXPECTED_PROFILE_SM" > "$root/PROFILE_EXPECTED_SM.txt"
printf '%s\n' "$ARCHITECTURE_FAMILY" > "$root/ARCHITECTURE_FAMILY.txt"
printf '0\n' > "$root/SELECTED_DEVICES.txt"
printf '%s\n' "$PROFILE" > "$root/PROFILE.txt"
nvcc --version | tee "$root/NVCC.txt"
nvcc --list-gpu-arch | tee "$root/NVCC_GPU_ARCHS.txt"
nvcc --list-gpu-code | tee "$root/NVCC_GPU_CODE.txt"
grep -Fxq "$expected_compute" "$root/NVCC_GPU_ARCHS.txt"
grep -Fxq "$expected_sm" "$root/NVCC_GPU_CODE.txt"
ptxas_probe_status=127
if command -v ptxas >/dev/null 2>&1; then
  set +e
  ptxas --version > "$root/PTXAS_VERSION.txt" 2>&1
  ptxas_probe_status=$?
  set -e
else
  printf '%s\n' 'ptxas not found on PATH' > "$root/PTXAS_VERSION.txt"
fi
printf '%s\n' "$ptxas_probe_status" > "$root/PTXAS_VERSION_EXIT_STATUS.txt"
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
python3 - "$resource_root/RESOURCE_CAPTURE_STATUS.json" "$resource_configure_status" "$resource_build_status" "$ptxas_info_seen" "$ptxas_probe_status" <<'PY'
import json, sys
from pathlib import Path
out, configure, build, seen, probe = sys.argv[1:]
payload = {
    "schema": "gluball-cuda-runtime-v31-compiler-resource-capture/1",
    "capture_attempted": True,
    "graduation_gate": False,
    "ptxas_version_probe_exit_code": int(probe),
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
