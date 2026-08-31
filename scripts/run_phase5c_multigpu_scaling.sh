#!/bin/sh
# SPDX-License-Identifier: MPL-2.0
# Runtime V2-only Phase 5C scaling runner for an already-validated rented host.
# Correctness evidence remains the separate V1 full-readback/Rust acceptance rung.
set -eu

ROOT=${ROOT:-physical-evidence/multigpu}
EXPECTED_MODEL_FRAGMENT=${EXPECTED_MODEL_FRAGMENT:?EXPECTED_MODEL_FRAGMENT is required}
REQUIRED_DEVICES=${REQUIRED_DEVICES:?REQUIRED_DEVICES is required}
SCALING_COUNTS=${SCALING_COUNTS:?SCALING_COUNTS is required}
STRONG_U=${STRONG_U:?STRONG_U is required}
STRONG_V=${STRONG_V:?STRONG_V is required}
WEAK_U_PER_DEVICE=${WEAK_U_PER_DEVICE:?WEAK_U_PER_DEVICE is required}
WARMUP=${WARMUP:?WARMUP is required}
ITERATIONS=${ITERATIONS:?ITERATIONS is required}
BLOCK_SIZE=${BLOCK_SIZE:?BLOCK_SIZE is required}
BUILD_DIR=${BUILD_DIR:-build/cuda-v2-phase5c}

mkdir -p "$ROOT/runtime-v2/strong" "$ROOT/runtime-v2/weak"

expected_sm=$(cat "$ROOT/EXPECTED_SM.txt")
expected_cc=$(cat "$ROOT/EXPECTED_COMPUTE_CAPABILITY.txt")

printf '%s\n' '== Runtime V2 Phase 5C build =='
rm -rf "$BUILD_DIR"
cmake -S native/cuda -B "$BUILD_DIR" \
  -DCMAKE_BUILD_TYPE=Release \
  -DGLUBALL_CUDA_ARCHITECTURES=native
cmake --build "$BUILD_DIR" --target gluball-cuda-runtime-v2 --parallel
binary="$BUILD_DIR/gluball-cuda-runtime-v2"
test -x "$binary"

make_devices() {
  python3 - "$1" <<'PY'
import sys
count = int(sys.argv[1])
print(",".join(str(index) for index in range(count)))
PY
}

run_json() {
  count=$1
  u=$2
  v=$3
  graphs=$4
  repeat_run=$5
  output=$6
  devices=$(make_devices "$count")
  temporary="$output.tmp"
  rm -f "$temporary"
  "$binary" \
    --mode throughput \
    --u "$u" \
    --v "$v" \
    --repeats 1 \
    --devices "$devices" \
    --block-size "$BLOCK_SIZE" \
    --warmup "$WARMUP" \
    --iterations "$ITERATIONS" \
    --cuda-graphs "$graphs" \
    --repeat-run "$repeat_run" \
    > "$temporary"
  python3 -m json.tool "$temporary" >/dev/null
  mv "$temporary" "$output"
}

old_ifs=$IFS
IFS=,
set -- $SCALING_COUNTS
IFS=$old_ifs

printf '%s\n' '== Runtime V2 fixed-work strong scaling =='
for count in "$@"; do
  printf 'strong scaling: %s device(s)\n' "$count"
  run_json "$count" "$STRONG_U" "$STRONG_V" off "$((100 + count))" \
    "$ROOT/runtime-v2/strong/${count}-gpu.json"
done

printf '%s\n' '== Runtime V2 weak scaling =='
for count in "$@"; do
  weak_u=$((WEAK_U_PER_DEVICE * count))
  printf 'weak scaling: %s device(s), U=%s\n' "$count" "$weak_u"
  run_json "$count" "$weak_u" "$STRONG_V" off "$((200 + count))" \
    "$ROOT/runtime-v2/weak/${count}-gpu.json"
done

printf '%s\n' '== Runtime V2 full-host CUDA Graph comparison =='
run_json "$REQUIRED_DEVICES" "$STRONG_U" "$STRONG_V" on "$((300 + REQUIRED_DEVICES))" \
  "$ROOT/runtime-v2/full-host-graphs-on.json"

EXPECTED_SM=$expected_sm EXPECTED_CC=$expected_cc python3 - <<'PY'
import json
import os
from pathlib import Path

root = Path(os.environ.get("ROOT", "physical-evidence/multigpu"))
model_fragment = os.environ["EXPECTED_MODEL_FRAGMENT"]
required_devices = int(os.environ["REQUIRED_DEVICES"])
counts = [int(value) for value in os.environ["SCALING_COUNTS"].split(",")]
strong_u = int(os.environ["STRONG_U"])
strong_v = int(os.environ["STRONG_V"])
weak_u_per_device = int(os.environ["WEAK_U_PER_DEVICE"])
warmup = int(os.environ["WARMUP"])
iterations = int(os.environ["ITERATIONS"])
block_size = int(os.environ["BLOCK_SIZE"])
expected_sm = os.environ["EXPECTED_SM"]
expected_cc = os.environ["EXPECTED_CC"]


def load(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def validate(record, *, label, count, u, graphs):
    expected_points = u * strong_v
    required = {
        "contract": "GLUBALL-CUDA-RUNTIME-V2",
        "status": "OBSERVED",
        "mode": "throughput",
        "actual_cuda_execution": True,
        "actual_multi_device_execution": count >= 2,
        "single_host_execution": True,
        "distributed_execution": False,
        "performance_observation_only": True,
        "reference_residual_checked": False,
        "conformance_acceptance": False,
        "geometry_receipt_authority": False,
        "universal_speedup_claim": False,
        "raw_device_uuid_published": False,
        "complete_output_readback": False,
        "cuda_graphs_enabled": graphs,
        "kernel_timing_excludes_metric_resets": True,
        "repeatable_compact_metrics": True,
        "compact_metrics_clean": True,
        "u_segments": u,
        "v_segments": strong_v,
        "repeats": 1,
        "total_points_per_iteration": expected_points,
        "warmup_iterations": warmup,
        "measured_iterations": iterations,
        "block_size": block_size,
        "used_device_count": count,
        "observed_nonfinite_records_max": 0,
        "compiled_architecture_policy": "native",
        "resolved_compiled_architectures": [expected_sm],
    }
    for key, expected in required.items():
        if record.get(key) != expected:
            raise SystemExit(f"{label}: {key}={record.get(key)!r}, expected {expected!r}")
    if record["observed_max_tube_radius_error"] > record["tube_radius_observation_gate"]:
        raise SystemExit(f"{label}: tube-radius observation exceeds gate")
    if record["iteration_wall_milliseconds_median"] <= 0:
        raise SystemExit(f"{label}: non-positive wall timing")
    if record["model_points_per_second_median"] <= 0:
        raise SystemExit(f"{label}: non-positive throughput")
    devices = record.get("devices") or []
    if len(devices) != count:
        raise SystemExit(f"{label}: expected {count} device records, found {len(devices)}")
    if [device.get("cuda_index") for device in devices] != list(range(count)):
        raise SystemExit(f"{label}: selected CUDA indices are not contiguous from zero")
    for device in devices:
        if model_fragment not in device.get("name", ""):
            raise SystemExit(f"{label}: unexpected GPU model {device.get('name')!r}")
        if device.get("compute_capability") != expected_cc:
            raise SystemExit(f"{label}: unexpected compute capability {device.get('compute_capability')!r}")
        if device.get("resolved_compiled_architecture") != expected_sm:
            raise SystemExit(f"{label}: expected resolved architecture {expected_sm}")
    return record

strong_records = []
reference_digest = None
reference_radius = None
for count in counts:
    record = validate(
        load(root / "runtime-v2" / "strong" / f"{count}-gpu.json"),
        label=f"strong-{count}", count=count, u=strong_u, graphs=False,
    )
    digest = record["aggregate_diagnostic_xor64"]
    radius = record["observed_max_tube_radius_error"]
    if reference_digest is None:
        reference_digest = digest
        reference_radius = radius
    elif digest != reference_digest or radius != reference_radius:
        raise SystemExit("strong-scaling compact diagnostics changed with device count")
    strong_records.append(record)

baseline_ms = strong_records[0]["iteration_wall_milliseconds_median"]
strong_summary = {
    "schema": "gluball-phase5c-strong-scaling/1",
    "performance_observation_only": True,
    "universal_speedup_claim": False,
    "geometry_receipt_authority": False,
    "workload": {
        "u_segments": strong_u,
        "v_segments": strong_v,
        "repeats": 1,
        "points_per_iteration": strong_u * strong_v,
        "block_size": block_size,
        "warmup_iterations": warmup,
        "measured_iterations": iterations,
        "cuda_graphs": False,
    },
    "resolved_compiled_architecture": expected_sm,
    "aggregate_diagnostic_xor64": reference_digest,
    "observed_max_tube_radius_error": reference_radius,
    "measurements": [],
}
for count, record in zip(counts, strong_records):
    wall_ms = record["iteration_wall_milliseconds_median"]
    speedup = baseline_ms / wall_ms
    strong_summary["measurements"].append({
        "device_count": count,
        "iteration_wall_milliseconds_median": wall_ms,
        "model_points_per_second_median": record["model_points_per_second_median"],
        "observed_speedup_vs_1gpu": speedup,
        "observed_parallel_efficiency": speedup / count,
    })

weak_records = []
for count in counts:
    u = weak_u_per_device * count
    record = validate(
        load(root / "runtime-v2" / "weak" / f"{count}-gpu.json"),
        label=f"weak-{count}", count=count, u=u, graphs=False,
    )
    expected_per_device = weak_u_per_device * strong_v
    if any(device["points"] != expected_per_device for device in record["devices"]):
        raise SystemExit(f"weak-{count}: per-device point allocation is not constant")
    weak_records.append(record)

weak_baseline_ms = weak_records[0]["iteration_wall_milliseconds_median"]
weak_summary = {
    "schema": "gluball-phase5c-weak-scaling/1",
    "performance_observation_only": True,
    "universal_speedup_claim": False,
    "geometry_receipt_authority": False,
    "per_device_workload": {
        "u_segments_equivalent": weak_u_per_device,
        "v_segments": strong_v,
        "points_per_device_per_iteration": weak_u_per_device * strong_v,
        "block_size": block_size,
        "warmup_iterations": warmup,
        "measured_iterations": iterations,
        "cuda_graphs": False,
    },
    "resolved_compiled_architecture": expected_sm,
    "measurements": [],
}
for count, record in zip(counts, weak_records):
    wall_ms = record["iteration_wall_milliseconds_median"]
    weak_summary["measurements"].append({
        "device_count": count,
        "total_points_per_iteration": record["total_points_per_iteration"],
        "iteration_wall_milliseconds_median": wall_ms,
        "model_points_per_second_median": record["model_points_per_second_median"],
        "observed_time_ratio_vs_1gpu": wall_ms / weak_baseline_ms,
    })

full_off = strong_records[-1]
if counts[-1] != required_devices:
    raise SystemExit("last strong-scaling count must equal REQUIRED_DEVICES")
full_on = validate(
    load(root / "runtime-v2" / "full-host-graphs-on.json"),
    label="full-host-graphs-on", count=required_devices, u=strong_u, graphs=True,
)
if full_on["aggregate_diagnostic_xor64"] != full_off["aggregate_diagnostic_xor64"]:
    raise SystemExit("full-host graphs OFF/ON diagnostic digests differ")
if full_on["observed_max_tube_radius_error"] != full_off["observed_max_tube_radius_error"]:
    raise SystemExit("full-host graphs OFF/ON tube-radius observations differ")

graph_summary = {
    "schema": "gluball-phase5c-full-host-graph-comparison/1",
    "device_count": required_devices,
    "resolved_compiled_architecture": expected_sm,
    "aggregate_diagnostic_xor64": full_off["aggregate_diagnostic_xor64"],
    "observed_max_tube_radius_error": full_off["observed_max_tube_radius_error"],
    "graphs_off_wall_milliseconds_median": full_off["iteration_wall_milliseconds_median"],
    "graphs_on_wall_milliseconds_median": full_on["iteration_wall_milliseconds_median"],
    "observed_graph_wall_speedup": full_off["iteration_wall_milliseconds_median"] / full_on["iteration_wall_milliseconds_median"],
    "performance_observation_only": True,
    "universal_speedup_claim": False,
    "geometry_receipt_authority": False,
}

for name, payload in (
    ("STRONG_SCALING.json", strong_summary),
    ("WEAK_SCALING.json", weak_summary),
    ("FULL_HOST_GRAPH_COMPARISON.json", graph_summary),
):
    with (root / name).open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True)
        handle.write("\n")
PY

printf '%s\n' 'Runtime V2 Phase 5C scaling validation: PASS'
