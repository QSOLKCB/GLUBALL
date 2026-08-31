#!/bin/sh
# SPDX-License-Identifier: MPL-2.0
# Build V2 and V3 once, run the same workload, and fail closed unless compact observations match exactly.
set -eu

U=${U:-16384}
V=${V:-128}
REPEATS=${REPEATS:-1}
DEVICES=${DEVICES:-0}
BLOCK_SIZE=${BLOCK_SIZE:-256}
WARMUP=${WARMUP:-20}
ITERATIONS=${ITERATIONS:-1000}
CUDA_GRAPHS=${CUDA_GRAPHS:-off}
ARCH=${GLUBALL_CUDA_ARCHITECTURES:-native}
BUILD_DIR=${BUILD_DIR:-build/cuda-v3-ab}
OUTPUT_DIR=${OUTPUT_DIR:-runtime-v3-ab}

case "$CUDA_GRAPHS" in
  on|off) ;;
  *) printf 'CUDA_GRAPHS must be on or off\n' >&2; exit 2 ;;
esac

mkdir -p "$OUTPUT_DIR"
cmake -S native/cuda -B "$BUILD_DIR" \
  -DCMAKE_BUILD_TYPE=Release \
  -DGLUBALL_CUDA_ARCHITECTURES="$ARCH"
cmake --build "$BUILD_DIR" --target gluball-cuda-runtime-v2 gluball-cuda-runtime-v3 --parallel

run_one() {
  binary=$1
  output=$2
  "$binary" \
    --mode throughput \
    --u "$U" \
    --v "$V" \
    --repeats "$REPEATS" \
    --devices "$DEVICES" \
    --block-size "$BLOCK_SIZE" \
    --warmup "$WARMUP" \
    --iterations "$ITERATIONS" \
    --cuda-graphs "$CUDA_GRAPHS" \
    --repeat-run 0 > "$output.tmp"
  python3 -m json.tool "$output.tmp" >/dev/null
  mv "$output.tmp" "$output"
}

run_one "$BUILD_DIR/gluball-cuda-runtime-v2" "$OUTPUT_DIR/V2.json"
run_one "$BUILD_DIR/gluball-cuda-runtime-v3" "$OUTPUT_DIR/V3.json"

python3 - "$OUTPUT_DIR/V2.json" "$OUTPUT_DIR/V3.json" "$OUTPUT_DIR/EQUIVALENCE.json" <<'PY'
import json
import sys
from pathlib import Path

v2_path, v3_path, output_path = map(Path, sys.argv[1:])
v2 = json.loads(v2_path.read_text())
v3 = json.loads(v3_path.read_text())

if v2.get("contract") != "GLUBALL-CUDA-RUNTIME-V2":
    raise SystemExit("unexpected V2 contract")
if v3.get("contract") != "GLUBALL-CUDA-RUNTIME-V3":
    raise SystemExit("unexpected V3 contract")
if v3.get("v2_reference_contract") != "GLUBALL-CUDA-RUNTIME-V2":
    raise SystemExit("V3 does not bind the V2 reference contract")

for label, payload in (("V2", v2), ("V3", v3)):
    required_false = (
        "reference_residual_checked",
        "conformance_acceptance",
        "geometry_receipt_authority",
        "universal_speedup_claim",
        "complete_output_readback",
        "raw_device_uuid_published",
    )
    if payload.get("performance_observation_only") is not True:
        raise SystemExit(f"{label} must remain performance-observation-only")
    for key in required_false:
        if payload.get(key) is not False:
            raise SystemExit(f"{label} claim boundary changed: {key}")
    if payload.get("repeatable_compact_metrics") is not True:
        raise SystemExit(f"{label} compact metrics are not repeatable")
    if payload.get("compact_metrics_clean") is not True:
        raise SystemExit(f"{label} compact metrics are not clean")

exact_keys = (
    "total_points_per_iteration",
    "used_device_count",
    "aggregate_diagnostic_xor64",
    "observed_max_tube_radius_error",
    "observed_nonfinite_records_max",
)
for key in exact_keys:
    if v2.get(key) != v3.get(key):
        raise SystemExit(f"V2/V3 exact observation mismatch for {key}: {v2.get(key)!r} != {v3.get(key)!r}")

if v2.get("resolved_compiled_architectures") != v3.get("resolved_compiled_architectures"):
    raise SystemExit("V2/V3 compiled architecture mismatch")

v2_devices = [(d.get("cuda_index"), d.get("name"), d.get("compute_capability")) for d in v2.get("devices", [])]
v3_devices = [(d.get("cuda_index"), d.get("name"), d.get("compute_capability")) for d in v3.get("devices", [])]
if v2_devices != v3_devices:
    raise SystemExit("V2/V3 selected device identity mismatch")

v2_wall = float(v2["iteration_wall_milliseconds_median"])
v3_wall = float(v3["iteration_wall_milliseconds_median"])
result = {
    "schema": "gluball-cuda-runtime-v2-v3-equivalence/1",
    "status": "PASS",
    "v2_contract": v2["contract"],
    "v3_contract": v3["contract"],
    "v2_reference_source_blob_sha": v3["v2_reference_source_blob_sha"],
    "exact_observation_equivalence": True,
    "equivalence_fields": list(exact_keys),
    "v2_wall_milliseconds_median": v2_wall,
    "v3_wall_milliseconds_median": v3_wall,
    "observed_v2_over_v3_wall_ratio": (v2_wall / v3_wall) if v3_wall > 0 else None,
    "performance_observation_only": True,
    "reference_residual_checked": False,
    "conformance_acceptance": False,
    "geometry_receipt_authority": False,
    "universal_speedup_claim": False,
}
Path(output_path).write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
print(json.dumps(result, indent=2, sort_keys=True))
PY
