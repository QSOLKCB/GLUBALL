#!/usr/bin/env python3
"""Independent binary64 residual and receipt checks; no CUDA or Rust process."""
from pathlib import Path
import hashlib,json,math,re,struct,sys
if len(sys.argv) != 4: raise SystemExit('usage: check_numeric_and_runtime.py SOURCE_SNAPSHOT BUNDLE OUTPUT_DIR')
REPO, ROOT, OUT = (Path(p).resolve() for p in sys.argv[1:])
# Verify every consumed source/configuration file before executing source code.
receipt = json.loads((Path(__file__).parent / 'INDEPENDENT_AUDIT.json').read_text())
expected = 'daff00294fe64ccf2d950e98c5bd652b274dfc5d'
if receipt['producing_source_commit'] != expected:
    raise SystemExit('Unexpected audit source commit')
for relative, digest in receipt['source_binding']['reproduction_required_file_sha256'].items():
    source = REPO / relative
    if source.is_symlink() or hashlib.sha256(source.read_bytes()).hexdigest() != digest:
        raise SystemExit(f'Pinned source mismatch: {relative}')
OUT.mkdir(parents=True, exist_ok=True)
load=lambda p:json.loads(p.read_text())
def fnv(data):
    s=0xcbf29ce484222325
    for b in data:s=((s^b)*0x100000001b3)&0xffffffffffffffff
    return f'{s:016x}'
def normalize(v):
    x,y,z=v
    n=math.sqrt(x*x+y*y+z*z)
    return tuple(c*(1.0/n) for c in v)
def cross(a,b):
    x,y,z=a;u,v,w=b
    return (y*w-z*v,z*u-x*w,x*v-y*u)
def reference(u,uc,v,vc):
    t=math.tau*u/uc;angle=math.tau*v/vc
    a=2.0*t;b=3.0*t
    major=2100000/1000000;minor=850000/1000000;rho=340000/1000000
    radial=major+minor*math.cos(b)
    center=(radial*math.cos(a),radial*math.sin(a),minor*math.sin(b))
    rp=-minor*3.0*math.sin(b)
    tangent=normalize((rp*math.cos(a)-2.0*radial*math.sin(a),rp*math.sin(a)+2.0*radial*math.cos(a),minor*3.0*math.cos(b)))
    normal=(math.cos(b)*math.cos(a),math.cos(b)*math.sin(a),math.sin(b))
    binormal=normalize(cross(tangent,normal))
    return tuple((c+n*(math.cos(angle)*rho))+bb*(math.sin(angle)*rho) for c,n,bb in zip(center,normal,binormal))
results={'method':'Independent Python binary64 transcription of pinned runtime/rust/lib_v2.rs geometry and runtime/rust/cuda_accept.rs gates. This is not an execution of the Rust binary.','acceptance':[]}
for n in (1,2,3):
    p=ROOT/f'v1-acceptance/cuda-output-{n}.f32le';data=p.read_bytes()
    sidep=ROOT/f'v1-acceptance/cuda-run-{n}.json';side=load(sidep)
    accepted=load(ROOT/f'v1-acceptance/cuda-acceptance-{n}.json')
    assert len(data)==262144==16384*16==side['evidence_output_bytes']
    for k,val in {'schema':'GLUBALL-MULTI-DEVICE-CUDA-EVIDENCE-SIDECAR-V1','contract':'GLUBALL-MULTI-DEVICE-CUDA-V1','geometry_contract':'GLUBALL-KNOT-V1','host_runtime_contract':'GLUBALL-RUST-RUNTIME-V1','floating_point_adapter_profile':'gluball-cuda-f32-v1','evidence_output_format':'GLUBALL-CUDA-F32LE-XYZR-V1','actual_cuda_execution':True,'complete_output_readback':True,'local_invariant_acceptance':True,'u_segments':512,'v_segments':32,'repeats':1,'total_points':16384,'repeat_run':n,'reference_residual_checked':False,'conformance_acceptance':False,'geometry_receipt_authority':False,'raw_device_uuid_published':False}.items():
        assert side[k]==val,(sidep,k)
    assert Path(side['evidence_output_path']).name==p.name
    assert Path(accepted['evidence_output_path']).name==p.name
    assert Path(accepted['cuda_sidecar_path']).name==sidep.name
    assert accepted['evidence_artifact_fnv1a64']==fnv(data)
    assert accepted['cuda_sidecar_fnv1a64']==fnv(sidep.read_bytes())
    component=euclidean=radius=0.0;worst=nonfinite=0
    for i,(x,y,z,r) in enumerate(struct.iter_unpack('<ffff',data)):
        if not all(map(math.isfinite,(x,y,z,r))):nonfinite+=1;continue
        ref=reference(i//32,512,i%32,32)
        dx,dy,dz=[abs(c-v) for c,v in zip((x,y,z),ref)]
        component=max(component,dx,dy,dz)
        e=math.sqrt(dx*dx+dy*dy+dz*dz)
        if e>euclidean:euclidean=e;worst=i
        radius=max(radius,abs(r))
    assert nonfinite==0
    gates={'component_residual_gate':5e-5,'euclidean_residual_gate':8.660254037844386e-5,'reported_tube_radius_gate':5e-5}
    for k,v in gates.items():assert accepted[k]==v
    assert component<=gates['component_residual_gate'] and euclidean<=gates['euclidean_residual_gate'] and radius<=gates['reported_tube_radius_gate']
    values={'checked_points':16384,'total_points':16384,'nonfinite_records':nonfinite,'max_component_residual':component,'max_euclidean_residual':euclidean,'max_reported_tube_radius_error':radius,'worst_linear_index':worst}
    differences={k:{'recomputed':v,'recorded':accepted[k]} for k,v in values.items() if accepted[k]!=v}
    # Exact agreement is observed, not a required cross-runtime contract.
    results['acceptance'].append({'run':n,'status':'PASS','artifact_sha256':hashlib.sha256(data).hexdigest(),'artifact_fnv1a64':fnv(data),'sidecar_fnv1a64':fnv(sidep.read_bytes()),'gates':gates,'recomputed':values,'exact_receipt_metric_match':not differences,'differences':differences})
paths=sorted([*(ROOT/'ab-atomic').glob('V*.json'),*(ROOT/'ab-two-stage').glob('V*.json'),*(ROOT/'tuning/baseline-v2').glob('*.json'),*(ROOT/'tuning/baseline-v3-matched').glob('*.json'),*(ROOT/'tuning/candidates').glob('*.json')])
assert len(paths)==117
for p in paths:
    v=load(p)
    for k,x in {'u_segments':16384,'v_segments':128,'repeats':1,'warmup_iterations':20,'measured_iterations':1000,'total_points_per_iteration':2097152,'used_device_count':1,'detected_device_count':1,'actual_cuda_execution':True,'mode':'throughput','performance_observation_only':True,'reference_residual_checked':False,'conformance_acceptance':False,'complete_output_readback':False,'geometry_receipt_authority':False,'universal_speedup_claim':False,'raw_device_uuid_published':False,'repeatable_compact_metrics':True,'compact_metrics_clean':True,'observed_nonfinite_records_max':0,'resolved_compiled_architectures':['sm_75']}.items():assert v[k]==x,(p,k,v[k])
    assert 0<=v['observed_max_tube_radius_error']<=v['tube_radius_observation_gate']
    for d in v['devices']:
        assert d['name']=='NVIDIA GeForce GTX 1650' and d['compute_capability']=='7.5' and d['compiled_cuda_arch_code']==750 and d['resolved_compiled_architecture']=='sm_75'
        assert d['start']==0 and d['end']==2097152 and d['points']==2097152
    assert v['iteration_wall_milliseconds_min']<=v['iteration_wall_milliseconds_median']<=v['iteration_wall_milliseconds_max']
    assert all(math.isfinite(v[k]) and v[k]>0 for k in ('iteration_wall_milliseconds_min','iteration_wall_milliseconds_median','iteration_wall_milliseconds_max','runtime_setup_milliseconds'))
results['117_runtime_observation_records_domain_and_boundaries']='PASS'
results['sanitizers']=[]
for f in (ROOT/'v31-sanitizer').glob('*check-*.txt'):
    raw=f.read_text();a=raw.index('{');p,end=json.JSONDecoder().raw_decode(raw[a:]);tail=raw[a+end:]
    summary='ERROR SUMMARY: 0 errors' if f.name.startswith('memcheck') else 'RACECHECK SUMMARY: 0 hazards displayed (0 errors, 0 warnings)'
    assert summary in tail
    reduction='two-stage' if 'two-stage' in f.name else 'atomic'
    for k,v in {'u_segments':512,'v_segments':32,'repeats':1,'warmup_iterations':1,'measured_iterations':2,'block_size':256,'cuda_graphs_enabled':False,'reduction_mode':reduction,'used_device_count':1,'observed_nonfinite_records_max':0,'compact_metrics_clean':True,'repeatable_compact_metrics':True}.items():assert p[k]==v,(f,k)
    results['sanitizers'].append({'file':f.name,'summary':summary,'points_per_iteration':p['total_points_per_iteration'],'warmup':1,'iterations':2,'block_size':256,'graphs':'off','reduction':reduction})
exits=dict(x.split('=',1) for x in (ROOT/'v31-sanitizer/SANITIZER_EXIT_STATUS.txt').read_text().splitlines())
assert exits==dict.fromkeys(('memcheck_atomic','racecheck_atomic','memcheck_two_stage','racecheck_two_stage'),'0')
results['sanitizer_exit_statuses']=exits
profile=load(ROOT/'PROFILE_DEFINITION.json')['definition']
registry=load(REPO/'docs/CUDA_RUNTIME_V31_ARCHITECTURE_PROFILES.json')['profiles']['gtx-1650']
assert profile==registry
preflight=load(ROOT/'PHYSICAL_PREFLIGHT_VALIDATION.json')
assert re.fullmatch(profile['expected_model_regex_case_insensitive'],preflight['safe_gpu_inventory']['name'],re.IGNORECASE)
assert preflight['safe_gpu_inventory']['compute_capability']==profile['expected_compute_capability']=='7.5'
assert preflight['canonical_workload_observed']==load(REPO/'docs/CUDA_RUNTIME_V31_ARCHITECTURE_LADDER.json')['canonical_workload']
results['profile_and_preflight_source_contract_match']=True
results['status']='PASS'
(OUT/'NUMERIC_RUNTIME_AUDIT_RESULT.json').write_text(json.dumps(results,indent=2,sort_keys=True)+'\n')
print(json.dumps(results,indent=2,sort_keys=True))
