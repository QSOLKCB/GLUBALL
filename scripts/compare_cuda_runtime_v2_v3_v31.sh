#!/bin/sh
# SPDX-License-Identifier: MPL-2.0
# Build V2, V3, and V3.1 once and require exact compact-observation agreement.
set -eu

U=${U:-16384}
V=${V:-128}
REPEATS=${REPEATS:-1}
DEVICES=${DEVICES:-0}
BLOCK_SIZE=${BLOCK_SIZE:-256}
WARMUP=${WARMUP:-20}
ITERATIONS=${ITERATIONS:-1000}
CUDA_GRAPHS=${CUDA_GRAPHS:-off}
REDUCTION=${REDUCTION:-atomic}
ARCH=${GLUBALL_CUDA_ARCHITECTURES:-native}
BUILD_DIR=${BUILD_DIR:-build/cuda-v31-ab}
OUTPUT_DIR=${OUTPUT_DIR:-runtime-v31-ab}

case "$CUDA_GRAPHS" in on|off) ;; *) echo 'CUDA_GRAPHS must be on or off' >&2; exit 2 ;; esac
case "$REDUCTION" in atomic|two-stage) ;; *) echo 'REDUCTION must be atomic or two-stage' >&2; exit 2 ;; esac
python3 - "$ITERATIONS" <<'PY'
import sys
raw = sys.argv[1]
if not raw.isdecimal() or not 2 <= int(raw) <= 10000:
    raise SystemExit('ITERATIONS must be an integer in [2,10000] so repeatability is non-vacuous')
PY

mkdir -p "$OUTPUT_DIR"
cmake -S native/cuda -B "$BUILD_DIR" \
  -DCMAKE_BUILD_TYPE=Release \
  -DGLUBALL_CUDA_ARCHITECTURES="$ARCH"
cmake --build "$BUILD_DIR" --target \
  gluball-cuda-runtime-v2 gluball-cuda-runtime-v3 gluball-cuda-runtime-v31 --parallel

run_common() {
  binary=$1
  output=$2
  shift 2
  "$binary" \
    --mode throughput \
    --u "$U" --v "$V" --repeats "$REPEATS" --devices "$DEVICES" \
    --block-size "$BLOCK_SIZE" --warmup "$WARMUP" --iterations "$ITERATIONS" \
    --cuda-graphs "$CUDA_GRAPHS" --repeat-run 0 "$@" > "$output.tmp"
  python3 -m json.tool "$output.tmp" >/dev/null
  mv "$output.tmp" "$output"
}

run_common "$BUILD_DIR/gluball-cuda-runtime-v2" "$OUTPUT_DIR/V2.json"
run_common "$BUILD_DIR/gluball-cuda-runtime-v3" "$OUTPUT_DIR/V3.json"
run_common "$BUILD_DIR/gluball-cuda-runtime-v31" "$OUTPUT_DIR/V31.json" --reduction "$REDUCTION"

python3 - "$OUTPUT_DIR/V2.json" "$OUTPUT_DIR/V3.json" "$OUTPUT_DIR/V31.json" "$OUTPUT_DIR/EQUIVALENCE.json" <<'PY'
import json, math, sys
from pathlib import Path
v2p, v3p, v31p, outp = map(Path, sys.argv[1:])
v2, v3, v31 = [json.loads(p.read_text()) for p in (v2p, v3p, v31p)]
if v2.get('contract') != 'GLUBALL-CUDA-RUNTIME-V2': raise SystemExit('unexpected V2 contract')
if v3.get('contract') != 'GLUBALL-CUDA-RUNTIME-V3': raise SystemExit('unexpected V3 contract')
if v31.get('contract') != 'GLUBALL-CUDA-RUNTIME-V3.1': raise SystemExit('unexpected V3.1 contract')
if v31.get('v3_reference_contract') != 'GLUBALL-CUDA-RUNTIME-V3': raise SystemExit('V3.1 V3 binding missing')
if v31.get('v2_reference_contract') != 'GLUBALL-CUDA-RUNTIME-V2': raise SystemExit('V3.1 V2 binding missing')

required_false = ('reference_residual_checked','conformance_acceptance','geometry_receipt_authority','universal_speedup_claim','complete_output_readback','raw_device_uuid_published')
for label, payload in (('V2',v2),('V3',v3),('V3.1',v31)):
    if payload.get('measured_iterations', 0) < 2: raise SystemExit(f'{label} measured_iterations must be >= 2')
    if payload.get('performance_observation_only') is not True: raise SystemExit(f'{label} performance boundary changed')
    for key in required_false:
        if payload.get(key) is not False: raise SystemExit(f'{label} claim boundary changed: {key}')
    if payload.get('repeatable_compact_metrics') is not True or payload.get('compact_metrics_clean') is not True:
        raise SystemExit(f'{label} compact metrics not clean/repeatable')

def signature(payload, label):
    devices = payload.get('devices', [])
    if not devices: raise SystemExit(f'{label} has no device records')
    sigs = {(d.get('name'), d.get('compute_capability'), d.get('compiled_cuda_arch_code')) for d in devices}
    if len(sigs) != 1: raise SystemExit(f'{label} exact comparison requires homogeneous selected devices: {sorted(sigs)!r}')
    return next(iter(sigs))

s2, s3, s31 = signature(v2,'V2'), signature(v3,'V3'), signature(v31,'V3.1')
if not (s2 == s3 == s31): raise SystemExit('V2/V3/V3.1 homogeneous device signature mismatch')

keys = ('total_points_per_iteration','used_device_count','aggregate_diagnostic_xor64','observed_max_tube_radius_error','observed_nonfinite_records_max')
for key in keys:
    if not (v2.get(key) == v3.get(key) == v31.get(key)):
        raise SystemExit(f'exact observation mismatch for {key}: {v2.get(key)!r}, {v3.get(key)!r}, {v31.get(key)!r}')
if not (v2.get('resolved_compiled_architectures') == v3.get('resolved_compiled_architectures') == v31.get('resolved_compiled_architectures')):
    raise SystemExit('compiled architecture mismatch')
for key, expected in {
    'packed_compact_metric_record': True,
    'precomputed_radius_weighted_v_angles': True,
    'frame_trig_factored_by_canonical_signature': True,
    'full_point_cache_enabled': False,
    'cached_final_digest_enabled': False,
    'cached_complete_observation_enabled': False,
}.items():
    if v31.get(key) is not expected: raise SystemExit(f'V3.1 optimization/cache boundary changed: {key}')
if v31.get('compact_metric_logical_bytes_per_device') != 20 or v31.get('compact_metric_resident_bytes_per_device') != 24:
    raise SystemExit('V3.1 compact metric layout changed')
if v31.get('metric_reset_operations_per_iteration_per_device') != 1 or v31.get('metric_readback_operations_per_iteration_per_device') != 1:
    raise SystemExit('V3.1 packed metric operation count changed')

w2, w3, w31 = [float(p['iteration_wall_milliseconds_median']) for p in (v2,v3,v31)]
s2ms, s3ms, s31ms = [float(p['runtime_setup_milliseconds']) for p in (v2,v3,v31)]
gain = w3 - w31
setup_delta = s31ms - s3ms
if gain > 0:
    break_even = 0 if setup_delta <= 0 else int(math.ceil(setup_delta / gain))
else:
    break_even = None
result = {
    'schema':'gluball-cuda-runtime-v2-v3-v31-equivalence/1',
    'status':'PASS',
    'exact_observation_equivalence':True,
    'equivalence_fields':list(keys),
    'minimum_measured_iterations':2,
    'repeatability_nonvacuous':True,
    'homogeneous_selected_device_signature':{'name':s2[0],'compute_capability':s2[1],'compiled_cuda_arch_code':s2[2]},
    'v2_wall_milliseconds_median':w2,
    'v3_wall_milliseconds_median':w3,
    'v31_wall_milliseconds_median':w31,
    'observed_v2_over_v31_wall_ratio':(w2/w31) if w31>0 else None,
    'observed_v3_over_v31_wall_ratio':(w3/w31) if w31>0 else None,
    'v2_setup_milliseconds':s2ms,
    'v3_setup_milliseconds':s3ms,
    'v31_setup_milliseconds':s31ms,
    'v31_minus_v3_setup_milliseconds':setup_delta,
    'v3_minus_v31_wall_milliseconds_per_iteration':gain,
    'observed_v31_break_even_iterations_vs_v3':break_even,
    'break_even_is_observed_timing_metric':True,
    'reduction_mode':v31.get('reduction_mode'),
    'performance_observation_only':True,
    'reference_residual_checked':False,
    'conformance_acceptance':False,
    'geometry_receipt_authority':False,
    'universal_speedup_claim':False,
}
outp.write_text(json.dumps(result, indent=2, sort_keys=True)+'\n')
print(json.dumps(result, indent=2, sort_keys=True))
PY
