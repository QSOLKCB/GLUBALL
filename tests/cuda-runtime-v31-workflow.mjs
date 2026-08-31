import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(
  new URL("../.github/workflows/physical-cuda-v31-efficiency.yml", import.meta.url),
  "utf8"
);

const triggerMatch = workflow.match(/\non:\n([\s\S]*?)\npermissions:/);
assert.ok(triggerMatch, "V3.1 physical workflow must expose an explicit trigger block");
const triggers = triggerMatch[1];
assert.match(triggers, /^\s{2}workflow_dispatch:/m);
for (const forbidden of ["push", "pull_request", "pull_request_target", "schedule", "workflow_run"]) {
  assert.doesNotMatch(triggers, new RegExp(`^\\s{2}${forbidden}:`, "m"), `V3.1 physical workflow must not enable ${forbidden}`);
}

assert.match(workflow, /runs-on:\s*\[self-hosted, linux, x64, gluball-vast-v31-efficiency\]/);
assert.match(workflow, /permissions:\n\s{2}contents:\s*read/);
assert.doesNotMatch(workflow, /\bmatrix\s*:/);
assert.doesNotMatch(workflow, /nvidia-smi\s+-L/);
assert.doesNotMatch(workflow, /query-gpu=[^\n]*uuid/i);
assert.match(workflow, /expected_model_fragment/);
assert.match(workflow, /nvcc --list-gpu-arch/);
assert.match(workflow, /nvcc --list-gpu-code/);
assert.match(workflow, /expected_compute="compute_\$\{arch_digits\}"/);
assert.match(workflow, /expected_sm="sm_\$\{arch_digits\}"/);

assert.match(workflow, /- name: V1 bounded correctness anchor/);
assert.match(workflow, /RUNS:\s*"3"/);
assert.match(workflow, /DEVICES:\s*"0"/);
assert.match(workflow, /- name: Verify V1 correctness, repeatability, and sanitizer archive/);
assert.match(workflow, /cuda-acceptance-\*\.json/);
assert.match(workflow, /cuda-output-\*\.f32le/);
assert.match(workflow, /cuda-run-\*\.json/);
assert.doesNotMatch(workflow, /acceptance-run-\*\.json/);
assert.match(workflow, /expected_ordinals = set\(range\(1, expected_runs \+ 1\)\)/);
assert.match(workflow, /actual_ordinals = set\(found\)/);
assert.match(workflow, /actual_ordinals != expected_ordinals/);
assert.match(workflow, /acceptance_record_ordinals/);
assert.match(workflow, /cuda_sidecar_ordinals/);
assert.match(workflow, /output_ordinals/);
assert.match(workflow, /discovered_output = outputs\.get\(ordinal\)/);
assert.match(workflow, /discovered_sidecar = sidecars\.get\(ordinal\)/);
assert.match(workflow, /Path\(evidence_output_path\)\.name == discovered_output\.name/);
assert.match(workflow, /Path\(cuda_sidecar_path\)\.name == discovered_sidecar\.name/);
assert.match(workflow, /complete_output_readback/);
assert.match(workflow, /reference_residual_checked/);
assert.match(workflow, /conformance_acceptance/);
assert.match(workflow, /checked_points_equal_total/);
assert.match(workflow, /nonfinite_records_zero/);
assert.match(workflow, /stable_field_validators/);
assert.match(workflow, /missing required stable field/);
assert.match(workflow, /invalid type\/value for stable field/);
assert.match(workflow, /is_positive_int/);
assert.match(workflow, /is_nonnegative_number/);
assert.match(workflow, /is_fnv1a64/);
assert.match(workflow, /output_repeatable_byte_identical/);
assert.match(workflow, /hashlib\.sha256\(outputs\[ordinal\]\.read_bytes\(\)\)\.hexdigest\(\)/);
assert.match(workflow, /output_sha256_by_run/);
assert.match(workflow, /stable_acceptance_fields/);
assert.match(workflow, /evidence_artifact_fnv1a64/);
assert.match(workflow, /\[root \/ "memcheck\.txt", root \/ "memcheck-run\.json"\]/);
assert.match(workflow, /\[root \/ "racecheck\.txt", root \/ "racecheck-run\.json"\]/);
assert.match(workflow, /dual_location_sanitizer_archive_observed/);
assert.match(workflow, /V1_VALIDATION\.json/);
assert.match(workflow, /sha256sum -c SHA256SUMS\.txt/);

assert.match(workflow, /- name: V2 V3 V3\.1 exact comparison atomic/);
assert.match(workflow, /REDUCTION:\s*"atomic"/);
assert.match(workflow, /- name: V2 V3 V3\.1 exact comparison two-stage/);
assert.match(workflow, /REDUCTION:\s*"two-stage"/);
assert.match(workflow, /compare_cuda_runtime_v2_v3_v31\.sh/);

assert.match(workflow, /- name: Runtime V3\.1 bounded exhaustive tuner/);
assert.match(workflow, /tune_cuda_runtime_v31\.sh/);
assert.match(workflow, /BLOCK_SIZES:\s*"32,64,128,256,512,1024"/);
assert.match(workflow, /GRAPH_MODES:\s*"off,on"/);
assert.match(workflow, /REDUCTION_MODES:\s*"atomic,two-stage"/);

assert.match(workflow, /- name: Compute Sanitizer Runtime V3\.1 both reduction modes/);
assert.match(workflow, /--tool memcheck --error-exitcode 86[\s\S]*--reduction atomic/);
assert.match(workflow, /--tool racecheck --error-exitcode 87[\s\S]*--reduction atomic/);
assert.match(workflow, /--tool memcheck --error-exitcode 86[\s\S]*--reduction two-stage/);
assert.match(workflow, /--tool racecheck --error-exitcode 87[\s\S]*--reduction two-stage/);
assert.match(workflow, /memcheck_atomic_status=\$\?/);
assert.match(workflow, /racecheck_atomic_status=\$\?/);
assert.match(workflow, /memcheck_two_stage_status=\$\?/);
assert.match(workflow, /racecheck_two_stage_status=\$\?/);
assert.match(workflow, /ERROR SUMMARY: 0 errors/);
assert.match(workflow, /RACECHECK SUMMARY: 0 hazards displayed \(0 errors, 0 warnings\)/);

assert.match(workflow, /VALIDATION_STATUS\.json/);
assert.match(workflow, /completed_required_stages/);
assert.match(workflow, /first_incomplete_required_stage/);
assert.match(workflow, /excluded_finalizer_files/);
assert.match(workflow, /root\.rglob\("\*"\)/);
assert.match(workflow, /evidence_retained = bool\(retained_evidence_files\)/);
assert.match(workflow, /"evidence_retained": evidence_retained/);
assert.match(workflow, /"partial_evidence_retained": status != "PASS" and evidence_retained/);
assert.match(workflow, /retained_evidence_file_count/);
assert.match(workflow, /v1_validation_summary_present/);
assert.match(workflow, /v1_output_repeatable_byte_identical/);
assert.match(workflow, /v1_acceptance_record_count/);
assert.match(workflow, /BUNDLE_SHA256SUMS\.txt/);
assert.match(workflow, /if:\s*always\(\)/);
assert.match(workflow, /gluball-runtime-v31-efficiency-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
assert.match(workflow, /performance_observation_only/);
assert.match(workflow, /geometry_receipt_authority/);
assert.match(workflow, /universal_speedup_claim/);
assert.match(workflow, /raw_device_uuid_published/);
assert.match(workflow, /full_point_cache_enabled/);
assert.match(workflow, /cached_complete_observation_enabled/);

console.log("GLUBALL CUDA Runtime V3.1 physical workflow boundary: PASS");
