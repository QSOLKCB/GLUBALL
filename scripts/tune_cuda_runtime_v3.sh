#!/bin/sh
# SPDX-License-Identifier: MPL-2.0
# Deterministically enumerate a declared finite V3 candidate set and select the best observed timing.
# This is not a rigorous global-optimum claim for the black-box hardware/runtime objective.
set -eu

U=${U:-16384}
V=${V:-128}
REPEATS=${REPEATS:-1}
DEVICES=${DEVICES:-0}
WARMUP=${WARMUP:-20}
ITERATIONS=${ITERATIONS:-1000}
TRIALS=${TRIALS:-3}
BLOCK_SIZES=${BLOCK_SIZES:-32,64,128,256,512,1024}
GRAPH_MODES=${GRAPH_MODES:-off,on}
ARCH=${GLUBALL_CUDA_ARCHITECTURES:-native}
BUILD_DIR=${BUILD_DIR:-build/cuda-v3-tune}
OUTPUT_DIR=${OUTPUT_DIR:-runtime-v3-tune}

python3 - "$TRIALS" "$BLOCK_SIZES" "$GRAPH_MODES" "$ITERATIONS" <<'PY'
import sys
trials = sys.argv[1]
blocks = sys.argv[2]
graphs = sys.argv[3]
iterations = sys.argv[4]
if not trials.isdecimal() or not 1 <= int(trials) <= 20:
    raise SystemExit("TRIALS must be an integer in [1,20]")
if not iterations.isdecimal() or not 2 <= int(iterations) <= 10000:
    raise SystemExit("ITERATIONS must be an integer in [2,10000] so compact repeatability is non-vacuous")
block_values = blocks.split(",")
if any(not value.isdecimal() for value in block_values):
    raise SystemExit("BLOCK_SIZES must be comma-separated decimal integers")
block_values = [int(value) for value in block_values]
if len(block_values) != len(set(block_values)):
    raise SystemExit("BLOCK_SIZES must not contain duplicates")
for value in block_values:
    if value < 32 or value > 1024 or value & (value - 1):
        raise SystemExit("every BLOCK_SIZES entry must be a power of two in [32,1024]")
graph_values = graphs.split(",")
if not graph_values or len(graph_values) != len(set(graph_values)):
    raise SystemExit("GRAPH_MODES must contain unique values")
if any(value not in {"off", "on"} for value in graph_values):
    raise SystemExit("GRAPH_MODES entries must be off or on")
PY

mkdir -p "$OUTPUT_DIR/candidates" "$OUTPUT_DIR/baseline"
cmake -S native/cuda -B "$BUILD_DIR" \
  -DCMAKE_BUILD_TYPE=Release \
  -DGLUBALL_CUDA_ARCHITECTURES="$ARCH"
cmake --build "$BUILD_DIR" --target gluball-cuda-runtime-v2 gluball-cuda-runtime-v3 --parallel

run_binary() {
  binary=$1
  block_size=$2
  graphs=$3
  trial=$4
  output=$5
  "$binary" \
    --mode throughput \
    --u "$U" \
    --v "$V" \
    --repeats "$REPEATS" \
    --devices "$DEVICES" \
    --block-size "$block_size" \
    --warmup "$WARMUP" \
    --iterations "$ITERATIONS" \
    --cuda-graphs "$graphs" \
    --repeat-run "$trial" > "$output.tmp"
  python3 -m json.tool "$output.tmp" >/dev/null
  mv "$output.tmp" "$output"
}

trial=1
while [ "$trial" -le "$TRIALS" ]; do
  run_binary "$BUILD_DIR/gluball-cuda-runtime-v2" 256 off "$trial" "$OUTPUT_DIR/baseline/v2-trial-$trial.json"
  trial=$((trial + 1))
done

old_ifs=$IFS
IFS=,
for block_size in $BLOCK_SIZES; do
  for graphs in $GRAPH_MODES; do
    trial=1
    while [ "$trial" -le "$TRIALS" ]; do
      run_binary \
        "$BUILD_DIR/gluball-cuda-runtime-v3" \
        "$block_size" \
        "$graphs" \
        "$trial" \
        "$OUTPUT_DIR/candidates/block-$block_size-graphs-$graphs-trial-$trial.json"
      trial=$((trial + 1))
    done
  done
done
IFS=$old_ifs

python3 - "$OUTPUT_DIR" "$BLOCK_SIZES" "$GRAPH_MODES" "$TRIALS" <<'PY'
import json
import statistics
import sys
from pathlib import Path

root = Path(sys.argv[1])
blocks = [int(value) for value in sys.argv[2].split(",")]
graphs = sys.argv[3].split(",")
trials = int(sys.argv[4])

baseline_runs = [json.loads((root / "baseline" / f"v2-trial-{trial}.json").read_text()) for trial in range(1, trials + 1)]
reference = baseline_runs[0]
if reference.get("contract") != "GLUBALL-CUDA-RUNTIME-V2":
    raise SystemExit("unexpected V2 baseline contract")

claim_false = (
    "reference_residual_checked",
    "conformance_acceptance",
    "geometry_receipt_authority",
    "universal_speedup_claim",
    "complete_output_readback",
    "raw_device_uuid_published",
)
exact_keys = (
    "total_points_per_iteration",
    "used_device_count",
    "aggregate_diagnostic_xor64",
    "observed_max_tube_radius_error",
    "observed_nonfinite_records_max",
)

def homogeneous_device_signature(payload, label):
    devices = payload.get("devices", [])
    if not devices:
        raise SystemExit(f"{label} contains no selected device records")
    signatures = {
        (device.get("name"), device.get("compute_capability"), device.get("compiled_cuda_arch_code"))
        for device in devices
    }
    if len(signatures) != 1:
        raise SystemExit(
            f"{label} exact V2/V3 equivalence requires homogeneous selected devices; "
            f"observed signatures: {sorted(signatures)!r}"
        )
    return next(iter(signatures))

reference_device_signature = homogeneous_device_signature(reference, "V2 baseline")

for payload in baseline_runs:
    if payload.get("measured_iterations", 0) < 2:
        raise SystemExit("V2 baseline measured_iterations must be >= 2 for non-vacuous repeatability")
    if payload.get("performance_observation_only") is not True:
        raise SystemExit("V2 baseline is not performance-observation-only")
    for key in claim_false:
        if payload.get(key) is not False:
            raise SystemExit(f"V2 baseline claim boundary changed: {key}")
    if payload.get("repeatable_compact_metrics") is not True or payload.get("compact_metrics_clean") is not True:
        raise SystemExit("V2 baseline compact metrics are not clean and repeatable")
    if homogeneous_device_signature(payload, "V2 baseline trial") != reference_device_signature:
        raise SystemExit("V2 baseline selected-device signature changed across trials")
    for key in exact_keys:
        if payload.get(key) != reference.get(key):
            raise SystemExit(f"V2 baseline trial mismatch for {key}")

baseline_wall = statistics.median(float(payload["iteration_wall_milliseconds_median"]) for payload in baseline_runs)
candidates = []
for block in blocks:
    for graph in graphs:
        runs = []
        for trial in range(1, trials + 1):
            path = root / "candidates" / f"block-{block}-graphs-{graph}-trial-{trial}.json"
            payload = json.loads(path.read_text())
            if payload.get("contract") != "GLUBALL-CUDA-RUNTIME-V3":
                raise SystemExit(f"unexpected V3 contract in {path}")
            if payload.get("v2_reference_contract") != "GLUBALL-CUDA-RUNTIME-V2":
                raise SystemExit(f"V3 reference binding missing in {path}")
            if payload.get("measured_iterations", 0) < 2:
                raise SystemExit(f"V3 measured_iterations must be >= 2 for non-vacuous repeatability in {path}")
            if payload.get("performance_observation_only") is not True:
                raise SystemExit(f"V3 claim boundary changed in {path}")
            for key in claim_false:
                if payload.get(key) is not False:
                    raise SystemExit(f"V3 claim boundary changed for {key} in {path}")
            if payload.get("repeatable_compact_metrics") is not True or payload.get("compact_metrics_clean") is not True:
                raise SystemExit(f"V3 compact metrics are not clean and repeatable in {path}")
            if homogeneous_device_signature(payload, f"V3 candidate {path}") != reference_device_signature:
                raise SystemExit(f"V2/V3 homogeneous selected-device signature mismatch in {path}")
            for key in exact_keys:
                if payload.get(key) != reference.get(key):
                    raise SystemExit(f"V2/V3 exact observation mismatch for {key} in {path}")
            if payload.get("resolved_compiled_architectures") != reference.get("resolved_compiled_architectures"):
                raise SystemExit(f"V2/V3 compiled architecture mismatch in {path}")
            runs.append(payload)
        wall_values = [float(payload["iteration_wall_milliseconds_median"]) for payload in runs]
        kernel_values = []
        for payload in runs:
            per_device = [float(device["kernel_milliseconds_median"]) for device in payload.get("devices", [])]
            kernel_values.append(max(per_device) if per_device else 0.0)
        wall_median = statistics.median(wall_values)
        kernel_median = statistics.median(kernel_values)
        candidates.append({
            "block_size": block,
            "cuda_graphs": graph,
            "trial_count": trials,
            "trial_wall_milliseconds_median_values": wall_values,
            "observed_wall_milliseconds_median_of_trials": wall_median,
            "observed_max_device_kernel_milliseconds_median_of_trials": kernel_median,
            "observed_v2_over_v3_wall_ratio": (baseline_wall / wall_median) if wall_median > 0 else None,
            "exact_v2_compact_observation_equivalence": True,
        })

if not candidates:
    raise SystemExit("declared candidate set is empty")

# Deterministic tie-break after measured objective: lower wall time, then smaller block, then graphs off before on.
best = min(candidates, key=lambda item: (
    item["observed_wall_milliseconds_median_of_trials"],
    item["block_size"],
    0 if item["cuda_graphs"] == "off" else 1,
))

result = {
    "schema": "gluball-cuda-runtime-v3-bounded-tuning/1",
    "status": "PASS",
    "search_class": "bounded-exhaustive-combinatorial-performance-observation",
    "candidate_enumeration_deterministic": True,
    "declared_candidate_set_complete": True,
    "candidate_count": len(candidates),
    "trial_count_per_candidate": trials,
    "measured_iterations_per_process": reference.get("measured_iterations"),
    "repeatability_nonvacuous": True,
    "v2_equivalence_requires_homogeneous_selected_devices": True,
    "homogeneous_selected_device_signature": {
        "name": reference_device_signature[0],
        "compute_capability": reference_device_signature[1],
        "compiled_cuda_arch_code": reference_device_signature[2],
    },
    "objective": "minimize median of per-process iteration_wall_milliseconds_median observations",
    "constraints": [
        "exact V2 aggregate_diagnostic_xor64",
        "exact V2 observed_max_tube_radius_error",
        "exact V2 observed_nonfinite_records_max",
        "same total_points_per_iteration",
        "same used_device_count",
        "same resolved_compiled_architectures",
        "homogeneous selected-device signature",
        "measured_iterations >= 2",
        "clean repeatable compact metrics",
    ],
    "v2_baseline_wall_milliseconds_median_of_trials": baseline_wall,
    "candidates": candidates,
    "best_observed_candidate_within_declared_set": best,
    "rigorous_global_optimum_claim": False,
    "unbounded_configuration_space_global_optimum_claim": False,
    "performance_observation_only": True,
    "reference_residual_checked": False,
    "conformance_acceptance": False,
    "geometry_receipt_authority": False,
    "universal_speedup_claim": False,
}
(root / "TUNING_RESULT.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\n")
print(json.dumps(result, indent=2, sort_keys=True))
PY