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
assert.match(workflow, /reference_residual_checked/);
assert.match(workflow, /conformance_acceptance/);
assert.match(workflow, /"\$campaign\/memcheck\.txt" "\$campaign\/memcheck-run\.json"/);
assert.match(workflow, /"\$campaign\/racecheck\.txt" "\$campaign\/racecheck-run\.json"/);

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
