import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

const repo = new URL('../', import.meta.url);
const path = 'docs/physical-evidence/CUDA_RUNTIME_V31_GTX1650_RUN_39230458215.json';
const record = JSON.parse(await readFile(new URL(path, repo)));
const root = new URL(`${record.artifact.durable_receipt_directory}/`, repo);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(record.schema, 'gluball-cuda-runtime-v31-accepted-artifact/1');
assert.equal(record.profile, 'gtx-1650');
assert.equal(record.contract, 'GLUBALL-CUDA-RUNTIME-V3.1-ARCHITECTURE-LADDER');
assert.equal(record.source_commit, 'daff00294fe64ccf2d950e98c5bd652b274dfc5d');
assert.equal(record.physical_run_id, 39230458215);
assert.equal(record.run_attempt, 1);
assert.equal(record.job_id, 117986896315);
assert.equal(record.artifact.id, 12175229905);
assert.equal(record.artifact.zip_size_bytes, 867304);
assert.equal(record.artifact.zip_sha256, 'b532089cba263c401b001bbf124e2547a2c7d4401af569daae26520eac6ca9a7');
const manifest = await readFile(new URL('BUNDLE_SHA256SUMS.txt', root));
assert.equal(hash(manifest), record.artifact.bundle_sha256s_manifest_sha256);
const manifestMap = new Map();
for (const line of manifest.toString().trimEnd().split('\n')) {
  const match = /^([a-f0-9]{64})  \.\/(.+)$/.exec(line);
  assert.ok(match);
  assert.ok(!manifestMap.has(match[2]));
  manifestMap.set(match[2], match[1]);
}
assert.equal(manifestMap.size, 179);
assert.equal(manifestMap.size, record.artifact.bundle_manifest_entry_count);
const bytes = Buffer.concat(await Promise.all(record.artifact.durable_receipt_bundle_parts.map(p => readFile(new URL(p, root)))));
assert.equal(hash(bytes), record.artifact.durable_receipt_bundle_sha256);
const bundle = JSON.parse(gunzipSync(bytes));
assert.equal(bundle.schema, record.artifact.durable_receipt_bundle_schema);
assert.equal(bundle.source_run_id, record.physical_run_id);
assert.equal(bundle.source_artifact_id, record.artifact.id);
assert.deepEqual(bundle.entries.map(e => e.path), record.artifact.durable_receipt_original_paths);
assert.deepEqual(bundle.entries.map(e => e.path).sort(), [...manifestMap.keys()].sort());
const receipts = new Map();
for (const entry of bundle.entries) {
  assert.ok(!entry.path.startsWith('/') && !entry.path.split('/').includes('..') && !entry.path.includes('\\'));
  assert.ok(!receipts.has(entry.path));
  const content = Buffer.from(entry.content_base64, 'base64');
  assert.equal(hash(content), entry.sha256, entry.path);
  assert.equal(hash(content), manifestMap.get(entry.path), entry.path);
  receipts.set(entry.path, content);
}
const json = p => JSON.parse(receipts.get(p));
const architecture = json('ARCHITECTURE_RESULT.json');
assert.equal(receipts.get('SOURCE_COMMIT.txt').toString().trim(), record.source_commit);
assert.equal(architecture.source_commit, record.source_commit);
assert.equal(architecture.status, 'PASS');
assert.equal(record.status, architecture.status);
for (const key of ['gpu', 'canonical_workload', 'bounded_tuning', 'required_stages', 'claim_boundary', 'comparison_boundary']) {
  assert.deepEqual(record[key], architecture[key], key);
}
assert.equal(Object.keys(record.required_stages).length, 10);
assert.ok(Object.values(record.required_stages).every(v => v === true));
assert.deepEqual(record.v1_validation, json('v1-acceptance/V1_VALIDATION.json'));
assert.equal(record.v1_validation.status, 'PASS');
assert.equal(record.v1_validation.acceptance_record_count, 3);
for (let i = 1; i <= 3; i++) {
  assert.equal(hash(receipts.get(`v1-acceptance/cuda-output-${i}.f32le`)), record.v1_validation.output_sha256[i - 1]);
}
assert.deepEqual(record.physical_preflight, json('PHYSICAL_PREFLIGHT_VALIDATION.json'));
assert.equal(record.physical_preflight.status, 'PASS');
assert.equal(record.physical_preflight.canonical_workload_match, true);
assert.equal(record.physical_preflight.mig_enabled, false);
assert.equal(record.physical_preflight.mig_partition_observed, false);
assert.deepEqual(record.frozen_measured_build_inputs, json('FROZEN_MEASURED_BUILD_INPUT_VALIDATION.json'));
for (const [file, blob] of Object.entries(record.frozen_measured_build_inputs.observed_git_blob_ids)) {
  const content = await readFile(new URL(file, repo));
  const actual = createHash('sha1').update(`blob ${content.length}\0`).update(content).digest('hex');
  assert.equal(actual, blob, file);
}
for (const [key, directory] of [['atomic_equivalence', 'ab-atomic'], ['two_stage_equivalence', 'ab-two-stage']]) {
  for (const [k, v] of Object.entries(architecture[key])) assert.deepEqual(record[key][k], v);
  for (const [version, field] of [['V2', 'v2'], ['V3', 'v3'], ['V31', 'v31']]) {
    assert.equal(record[key][`${field}_wall_milliseconds_median`], json(`${directory}/${version}.json`).iteration_wall_milliseconds_median);
  }
  assert.equal(record[key].status, 'PASS');
  assert.deepEqual(record[key].diagnostic_digests, {v2: '1e15cffd50e6f653', v3: '1e206a0f3b649b9a', v31: '1e206a0f3b649b9a'});
}
assert.equal(receipts.get('v31-sanitizer/SANITIZER_EXIT_STATUS.txt').toString(), 'memcheck_atomic=0\nracecheck_atomic=0\nmemcheck_two_stage=0\nracecheck_two_stage=0\n');
assert.deepEqual(json('tuning/TUNING_RESULT.json').best_observed_candidate_within_declared_set, record.bounded_tuning.best_observed_candidate_within_declared_set);
const auditBytes = await readFile(new URL(record.independent_offline_audit.path, repo));
assert.equal(hash(auditBytes), record.independent_offline_audit.sha256);
const audit = JSON.parse(auditBytes);
assert.equal(audit.status, 'PASS');
assert.equal(audit.producing_source_commit, record.source_commit);
assert.equal(audit.input_integrity.bundle_manifest_sha256, hash(manifest));
assert.equal(audit.input_integrity.bundle_manifest_entry_count, manifestMap.size);
assert.deepEqual(audit.performance_observation.best_candidate, record.bounded_tuning.best_observed_candidate_within_declared_set);
for (const pointRun of audit.independent_numeric_audit.acceptance) {
  assert.equal(pointRun.status, 'PASS');
  assert.equal(pointRun.exact_receipt_metric_match, true);
  assert.equal(pointRun.artifact_sha256, record.v1_validation.output_sha256[pointRun.run - 1]);
  for (const [key, value] of Object.entries(record.v1_validation.stable_acceptance_fields)) {
    if (key === 'evidence_artifact_fnv1a64') assert.equal(pointRun.artifact_fnv1a64, value);
    else assert.equal(pointRun.recomputed[key], value);
  }
}
// The new specimen supplements rather than replaces either historical fixture.
const old = JSON.parse(await readFile(new URL('docs/physical-evidence/CUDA_RUNTIME_V31_GTX1650_RUN_33630241971.json', repo)));
assert.notEqual(old.source_commit, record.source_commit);
assert.deepEqual(old.canonical_workload, record.canonical_workload);
assert.deepEqual(old.frozen_measured_build_inputs.observed_git_blob_ids, record.frozen_measured_build_inputs.observed_git_blob_ids);
assert.equal(JSON.parse(await readFile(new URL('docs/physical-evidence/CUDA_RUNTIME_V31_GT730_NEGATIVE_RUN_35863047782.json', repo))).physical_run_id, 35863047782);
console.log('GTX 1650 rerun complete durable evidence archive: PASS (179 original files)');
