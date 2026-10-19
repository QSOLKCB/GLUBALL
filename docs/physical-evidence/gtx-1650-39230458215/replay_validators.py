#!/usr/bin/env python3
"""Offline replay, preserving source repo and input artifact byte-for-byte."""
from pathlib import Path
import contextlib, hashlib, io, json, re, runpy, shutil, subprocess, sys
if len(sys.argv) != 4: raise SystemExit('usage: replay_validators.py SOURCE_SNAPSHOT BUNDLE NEW_OUTPUT_DIR')
REPO, ORIG, OUT = (Path(p).resolve() for p in sys.argv[1:])
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
COPY=OUT/'replay-bundle'
if COPY.exists(): raise SystemExit('Refusing overwrite existing replay bundle')
shutil.copytree(ORIG,COPY)
results={}
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def save(name,value): (OUT/name).write_text(json.dumps(value,indent=2,sort_keys=True)+'\n')
def manifest(root,name):
    entries=[]
    for line in (root/name).read_text().splitlines():
        digest,relative=line.split('  ',1)
        p=root/relative
        assert p.resolve().is_relative_to(root.resolve()) and p.is_file() and not p.is_symlink()
        assert sha(p)==digest,relative
        entries.append(relative.removeprefix('./'))
    assert len(entries)==len(set(entries))
    actual={str(p.relative_to(root)) for p in root.rglob('*') if p.is_file()}
    return {'count':len(entries),'unmanifested':sorted(actual-set(entries)-{name}),'status':'PASS'}
results['bundle_manifest']=manifest(ORIG,'BUNDLE_SHA256SUMS.txt')
results['v1_manifest']=manifest(ORIG/'v1-acceptance','SHA256SUMS.txt')
results['original_manifest_sha256']=sha(ORIG/'BUNDLE_SHA256SUMS.txt')
results['file_count']=len(list(ORIG.rglob('*')))-len([p for p in ORIG.rglob('*') if p.is_dir()])
expected='daff00294fe64ccf2d950e98c5bd652b274dfc5d'
head=expected
assert head==expected==(ORIG/'SOURCE_COMMIT.txt').read_text().strip()
results['source_commit']=head
results['audit_source']='git archive of the pinned producing commit; isolated from concurrent archival edits'
subprocess.run([sys.executable,str(REPO/'scripts/verify_cuda_runtime_v31_frozen_build_inputs.py'),'--repo-root',str(REPO),'--output',str(OUT/'RECOMPUTED_BUILD_INPUTS.json')],check=True)
assert json.loads((OUT/'RECOMPUTED_BUILD_INPUTS.json').read_text())==json.loads((ORIG/'FROZEN_MEASURED_BUILD_INPUT_VALIDATION.json').read_text())
results['build_inputs_recomputed_identical']=True
v1=runpy.run_path(str(REPO/'scripts/verify_cuda_v1_campaign.py'))['verify'](ORIG/'v1-acceptance',3)
save('RECOMPUTED_V1_VALIDATION.json',v1)
assert v1==json.loads((ORIG/'v1-acceptance/V1_VALIDATION.json').read_text())
results['v1_campaign_recomputed_identical']=v1['status']=='PASS'
for name,func,args in [
('frozen_source_receipt','validated_frozen_source_receipt',[json.loads((ORIG/'FROZEN_RUNTIME_SOURCE_VALIDATION.json').read_text())]),
('profile_receipt','validated_profile_definition',[json.loads((ORIG/'PROFILE_DEFINITION.json').read_text()),'gtx-1650'])]:
    value=runpy.run_path(str(REPO/'scripts/finalize_cuda_runtime_v31_architecture.py'))[func](*args)
    assert value is not None
    results[name]=True
for script,filename,args in [
('bind_cuda_runtime_v31_frozen_build_inputs.py','FROZEN_MEASURED_BUILD_INPUT_VALIDATION.json',[]),
('bind_cuda_runtime_v31_physical_preflight.py','PHYSICAL_PREFLIGHT_VALIDATION.json',['gtx-1650'])]:
    value=runpy.run_path(str(REPO/'scripts'/script))['valid_receipt'](json.loads((ORIG/filename).read_text()),*args)
    assert value
    results[filename+'_semantic_validation']=True
# Extract only known data-processing Python heredocs. Never execute shell producers.
def extract(script,start):
    text=(REPO/'scripts'/script).read_text()
    lines=text.splitlines(True)
    index=next(i for i,line in enumerate(lines) if line.startswith(start))
    stop=next(i for i in range(index+1,len(lines)) if lines[i].strip()=='PY')
    body=''.join(lines[index+1:stop])
    destination=OUT/(script+'.offline.py')
    destination.write_text(body)
    return destination
compare=extract('compare_cuda_runtime_v2_v3_v31.sh','python3 - "$OUTPUT_DIR/V2.json"')
for mode in ('atomic','two-stage'):
    folder=COPY/f'ab-{mode}'
    with (OUT/f'replay-equivalence-{mode}.log').open('w') as log:
        subprocess.run([sys.executable,str(compare),*[str(folder/f'{v}.json') for v in ('V2','V3','V31','EQUIVALENCE')]],check=True,stdout=log)
    assert (folder/'EQUIVALENCE.json').read_bytes()==(ORIG/f'ab-{mode}/EQUIVALENCE.json').read_bytes()
    results[f'{mode}_equivalence_byte_identical']=True
tuner=extract('tune_cuda_runtime_v31.sh','python3 - "$OUTPUT_DIR" "$BLOCK_SIZES"')
with (OUT/'replay-tuning.log').open('w') as log:
    subprocess.run([sys.executable,str(tuner),str(COPY/'tuning'),'32,64,128,256,512,1024','off,on','atomic,two-stage','3'],check=True,stdout=log)
assert (COPY/'tuning/TUNING_RESULT.json').read_bytes()==(ORIG/'tuning/TUNING_RESULT.json').read_bytes()
results['tuning_byte_identical']=True
# Reproduce the finalizer's original stage-time count by withholding the two
# independently bound receipts until after its stage, exactly as the workflow does.
for name in ('FROZEN_MEASURED_BUILD_INPUT_VALIDATION.json','PHYSICAL_PREFLIGHT_VALIDATION.json'):
    (COPY/name).unlink()
subprocess.run([sys.executable,str(REPO/'scripts/finalize_cuda_runtime_v31_architecture.py'),str(COPY),'--profile','gtx-1650','--u','16384','--v','128','--warmup','20','--iterations','1000','--trials','3'],check=True)
for script,name in [
('bind_cuda_runtime_v31_frozen_build_inputs.py','FROZEN_MEASURED_BUILD_INPUT_VALIDATION.json'),
('bind_cuda_runtime_v31_physical_preflight.py','PHYSICAL_PREFLIGHT_VALIDATION.json')]:
    subprocess.run([sys.executable,str(REPO/'scripts'/script),str(COPY),str(ORIG/name)],check=True)
for name in ('ARCHITECTURE_RESULT.json','VALIDATION_STATUS.json','BUNDLE_SHA256SUMS.txt'):
    assert (COPY/name).read_bytes()==(ORIG/name).read_bytes(),name
    results[name+'_replayed_byte_identical']=True
assert {str(p.relative_to(COPY)):sha(p) for p in COPY.rglob('*') if p.is_file()}=={str(p.relative_to(ORIG)):sha(p) for p in ORIG.rglob('*') if p.is_file()}
results['entire_replay_bundle_byte_identical']=True
save('VALIDATOR_REPLAY_RESULT.json',results)
print(json.dumps(results,indent=2,sort_keys=True))
