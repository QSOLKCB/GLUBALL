#!/bin/sh
# SPDX-License-Identifier: MPL-2.0
# Exhaustively enumerate a declared finite V3.1 candidate set.
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
REDUCTION_MODES=${REDUCTION_MODES:-atomic,two-stage}
ARCH=${GLUBALL_CUDA_ARCHITECTURES:-native}
BUILD_DIR=${BUILD_DIR:-build/cuda-v31-tune}
OUTPUT_DIR=${OUTPUT_DIR:-runtime-v31-tune}

python3 - "$TRIALS" "$BLOCK_SIZES" "$GRAPH_MODES" "$REDUCTION_MODES" "$ITERATIONS" <<'PY'
import sys
trials, blocks, graphs, reductions, iterations = sys.argv[1:]
if not trials.isdecimal() or not 1 <= int(trials) <= 20: raise SystemExit('TRIALS must be in [1,20]')
if not iterations.isdecimal() or not 2 <= int(iterations) <= 10000: raise SystemExit('ITERATIONS must be in [2,10000]')
b=[int(x) for x in blocks.split(',') if x]
if not b or len(b)!=len(set(b)) or any(x<32 or x>1024 or x&(x-1) for x in b): raise SystemExit('BLOCK_SIZES must be unique powers of two in [32,1024]')
g=graphs.split(',')
if not g or len(g)!=len(set(g)) or any(x not in {'off','on'} for x in g): raise SystemExit('GRAPH_MODES must contain unique off/on values')
r=reductions.split(',')
if not r or len(r)!=len(set(r)) or any(x not in {'atomic','two-stage'} for x in r): raise SystemExit('REDUCTION_MODES must contain unique atomic/two-stage values')
PY

mkdir -p "$OUTPUT_DIR/baseline-v2" "$OUTPUT_DIR/baseline-v3" "$OUTPUT_DIR/candidates"
cmake -S native/cuda -B "$BUILD_DIR" -DCMAKE_BUILD_TYPE=Release -DGLUBALL_CUDA_ARCHITECTURES="$ARCH"
cmake --build "$BUILD_DIR" --target gluball-cuda-runtime-v2 gluball-cuda-runtime-v3 gluball-cuda-runtime-v31 --parallel

run_binary() {
  binary=$1; block=$2; graphs=$3; trial=$4; output=$5; shift 5
  "$binary" --mode throughput --u "$U" --v "$V" --repeats "$REPEATS" --devices "$DEVICES" \
    --block-size "$block" --warmup "$WARMUP" --iterations "$ITERATIONS" --cuda-graphs "$graphs" \
    --repeat-run "$trial" "$@" > "$output.tmp"
  python3 -m json.tool "$output.tmp" >/dev/null
  mv "$output.tmp" "$output"
}

trial=1
while [ "$trial" -le "$TRIALS" ]; do
  run_binary "$BUILD_DIR/gluball-cuda-runtime-v2" 256 off "$trial" "$OUTPUT_DIR/baseline-v2/trial-$trial.json"
  run_binary "$BUILD_DIR/gluball-cuda-runtime-v3" 256 off "$trial" "$OUTPUT_DIR/baseline-v3/trial-$trial.json"
  trial=$((trial+1))
done

old_ifs=$IFS
IFS=,
for block in $BLOCK_SIZES; do
  for graphs in $GRAPH_MODES; do
    for reduction in $REDUCTION_MODES; do
      trial=1
      while [ "$trial" -le "$TRIALS" ]; do
        run_binary "$BUILD_DIR/gluball-cuda-runtime-v31" "$block" "$graphs" "$trial" \
          "$OUTPUT_DIR/candidates/block-$block-graphs-$graphs-reduction-$reduction-trial-$trial.json" \
          --reduction "$reduction"
        trial=$((trial+1))
      done
    done
  done
done
IFS=$old_ifs

python3 - "$OUTPUT_DIR" "$BLOCK_SIZES" "$GRAPH_MODES" "$REDUCTION_MODES" "$TRIALS" <<'PY'
import json, math, statistics, sys
from pathlib import Path
root=Path(sys.argv[1]); blocks=[int(x) for x in sys.argv[2].split(',')]; graphs=sys.argv[3].split(','); reductions=sys.argv[4].split(','); trials=int(sys.argv[5])
load=lambda p: json.loads(p.read_text())
v2runs=[load(root/'baseline-v2'/f'trial-{i}.json') for i in range(1,trials+1)]
v3runs=[load(root/'baseline-v3'/f'trial-{i}.json') for i in range(1,trials+1)]
ref=v2runs[0]
keys=('total_points_per_iteration','used_device_count','aggregate_diagnostic_xor64','observed_max_tube_radius_error','observed_nonfinite_records_max')
false_keys=('reference_residual_checked','conformance_acceptance','geometry_receipt_authority','universal_speedup_claim','complete_output_readback','raw_device_uuid_published')
def check_common(payload,label,contract):
    if payload.get('contract')!=contract: raise SystemExit(f'{label} contract mismatch')
    if payload.get('measured_iterations',0)<2: raise SystemExit(f'{label} measured_iterations < 2')
    if payload.get('performance_observation_only') is not True: raise SystemExit(f'{label} performance boundary changed')
    for k in false_keys:
        if payload.get(k) is not False: raise SystemExit(f'{label} claim boundary changed: {k}')
    if payload.get('repeatable_compact_metrics') is not True or payload.get('compact_metrics_clean') is not True: raise SystemExit(f'{label} compact metrics not clean/repeatable')
def sig(payload,label):
    ds=payload.get('devices',[]); ss={(d.get('name'),d.get('compute_capability'),d.get('compiled_cuda_arch_code')) for d in ds}
    if len(ss)!=1: raise SystemExit(f'{label} exact comparison requires homogeneous devices: {sorted(ss)!r}')
    return next(iter(ss))
for i,p in enumerate(v2runs,1): check_common(p,f'V2 trial {i}','GLUBALL-CUDA-RUNTIME-V2')
for i,p in enumerate(v3runs,1): check_common(p,f'V3 trial {i}','GLUBALL-CUDA-RUNTIME-V3')
reference_sig=sig(ref,'V2 reference')
for p in v2runs+v3runs:
    if sig(p,p['contract'])!=reference_sig: raise SystemExit('baseline device signature mismatch')
    for k in keys:
        if p.get(k)!=ref.get(k): raise SystemExit(f'baseline mismatch for {k}')
    if p.get('resolved_compiled_architectures')!=ref.get('resolved_compiled_architectures'): raise SystemExit('baseline compiled architecture mismatch')
v2wall=statistics.median(float(p['iteration_wall_milliseconds_median']) for p in v2runs)
v3wall=statistics.median(float(p['iteration_wall_milliseconds_median']) for p in v3runs)
v3setup=statistics.median(float(p['runtime_setup_milliseconds']) for p in v3runs)
candidates=[]
for block in blocks:
  for graph in graphs:
    for reduction in reductions:
      runs=[]
      for trial in range(1,trials+1):
        p=load(root/'candidates'/f'block-{block}-graphs-{graph}-reduction-{reduction}-trial-{trial}.json')
        check_common(p,f'V3.1 {block}/{graph}/{reduction}/{trial}','GLUBALL-CUDA-RUNTIME-V3.1')
        if sig(p,'V3.1')!=reference_sig: raise SystemExit('V3.1 device signature mismatch')
        for k in keys:
          if p.get(k)!=ref.get(k): raise SystemExit(f'V3.1 exact observation mismatch for {k}')
        if p.get('resolved_compiled_architectures')!=ref.get('resolved_compiled_architectures'): raise SystemExit('V3.1 compiled architecture mismatch')
        if p.get('reduction_mode')!=reduction: raise SystemExit('V3.1 reduction mode mismatch')
        if p.get('packed_compact_metric_record') is not True: raise SystemExit('packed metric invariant missing')
        if p.get('full_point_cache_enabled') is not False or p.get('cached_complete_observation_enabled') is not False: raise SystemExit('forbidden cache enabled')
        runs.append(p)
      walls=[float(p['iteration_wall_milliseconds_median']) for p in runs]
      setups=[float(p['runtime_setup_milliseconds']) for p in runs]
      kernels=[max(float(d['kernel_milliseconds_median']) for d in p.get('devices',[])) for p in runs]
      wall=statistics.median(walls); setup=statistics.median(setups); kernel=statistics.median(kernels)
      gain=v3wall-wall; setup_delta=setup-v3setup
      break_even=(0 if setup_delta<=0 else int(math.ceil(setup_delta/gain))) if gain>0 else None
      candidates.append({
        'block_size':block,'cuda_graphs':graph,'reduction_mode':reduction,'trial_count':trials,
        'trial_wall_milliseconds_median_values':walls,
        'observed_wall_milliseconds_median_of_trials':wall,
        'observed_max_device_kernel_milliseconds_median_of_trials':kernel,
        'observed_setup_milliseconds_median_of_trials':setup,
        'observed_v2_over_v31_wall_ratio':(v2wall/wall) if wall>0 else None,
        'observed_v3_over_v31_wall_ratio':(v3wall/wall) if wall>0 else None,
        'observed_v31_break_even_iterations_vs_v3':break_even,
        'exact_v2_compact_observation_equivalence':True,
      })
if not candidates: raise SystemExit('candidate set empty')
best=min(candidates,key=lambda x:(x['observed_wall_milliseconds_median_of_trials'],x['block_size'],0 if x['cuda_graphs']=='off' else 1,0 if x['reduction_mode']=='atomic' else 1))
result={
 'schema':'gluball-cuda-runtime-v31-bounded-tuning/1','status':'PASS',
 'search_class':'bounded-exhaustive-combinatorial-performance-observation',
 'candidate_enumeration_deterministic':True,'declared_candidate_set_complete':True,
 'candidate_count':len(candidates),'trial_count_per_candidate':trials,
 'dimensions':{'block_sizes':blocks,'cuda_graph_modes':graphs,'reduction_modes':reductions},
 'objective':'minimize median of per-process iteration_wall_milliseconds_median observations',
 'v2_baseline_wall_milliseconds_median_of_trials':v2wall,
 'v3_baseline_wall_milliseconds_median_of_trials':v3wall,
 'v3_baseline_setup_milliseconds_median_of_trials':v3setup,
 'candidates':candidates,'best_observed_candidate_within_declared_set':best,
 'break_even_is_observed_timing_metric':True,
 'rigorous_global_optimum_claim':False,'unbounded_configuration_space_global_optimum_claim':False,
 'performance_observation_only':True,'reference_residual_checked':False,'conformance_acceptance':False,
 'geometry_receipt_authority':False,'universal_speedup_claim':False,
}
(root/'TUNING_RESULT.json').write_text(json.dumps(result,indent=2,sort_keys=True)+'\n')
print(json.dumps(result,indent=2,sort_keys=True))
PY
