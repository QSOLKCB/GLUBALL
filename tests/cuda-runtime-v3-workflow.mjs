import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(
  new URL("../.github/workflows/physical-cuda-v3-efficiency.yml", import.meta.url),
  "utf8"
);

const triggerMatch = workflow.match(/\non:\n([\s\S]*?)\npermissions:/);
assert.ok(triggerMatch, "V3 physical workflow must expose an explicit trigger block");
const triggers = triggerMatch[1];
assert.match(triggers, /^\s{2}workflow_dispatch:/m);
for (const forbidden of ["push", "pull_request", "pull_request_target", "schedule", "workflow_run"]) {
  assert.doesNotMatch(triggers, new RegExp(`^\\s{2}${forbidden}:`, "m"), `V3 physical workflow must not enable ${forbidden}`);
}

assert.match(workflow, /runs-on:\s*\[self-hosted, linux, x64, gluball-vast-v3-efficiency\]/);
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
assert.match(workflow, /RACECHECK SUMMARY: 0 hazards displayed \(0 errors, 0 warnings\)/);

assert.match(workflow, /- name: Runtime V2 V3 exact observation comparison/);
assert.match(workflow, /compare_cuda_runtime_v2_v3\.sh/);
assert.match(workflow, /- name: Runtime V3 bounded exhaustive tuner/);
assert.match(workflow, /tune_cuda_runtime_v3\.sh/);
assert.match(workflow, /BLOCK_SIZES:\s*"32,64,128,256,512,1024"/);
assert.match(workflow, /GRAPH_MODES:\s*"off,on"/);

assert.match(workflow, /- name: Compute Sanitizer Runtime V3 bounded kernel/);
assert.match(workflow, /set \+e/);
assert.match(workflow, /--tool memcheck --error-exitcode 86/);
assert.match(workflow, /memcheck_status=\$\?/);
assert.match(workflow, /--tool racecheck --error-exitcode 87/);
assert.match(workflow, /racecheck_status=\$\?/);
assert.match(workflow, /set -e/);
assert.match(workflow, /> "\$root\/memcheck\.txt" 2>&1/);
assert.match(workflow, /> "\$root\/racecheck\.txt" 2>&1/);
assert.match(workflow, /SANITIZER_EXIT_STATUS\.txt/);
assert.match(workflow, /memcheck_exit_status=/);
assert.match(workflow, /racecheck_exit_status=/);
assert.match(workflow, /ERROR SUMMARY: 0 errors/);
assert.match(workflow, /RACECHECK SUMMARY: 0 hazards displayed \(0 errors, 0 warnings\)/);
assert.match(workflow, /if \[ "\$memcheck_status" -ne 0 \] \|\| \[ "\$racecheck_status" -ne 0 \]/);
assert.doesNotMatch(workflow, /grep -Fq '0 hazards'/);

const memcheckIndex = workflow.indexOf("--tool memcheck --error-exitcode 86");
const racecheckIndex = workflow.indexOf("--tool racecheck --error-exitcode 87");
const sanitizerFailureIndex = workflow.indexOf("Runtime V3 sanitizer failure:");
assert.ok(memcheckIndex >= 0 && racecheckIndex > memcheckIndex, "racecheck must execute after memcheck");
assert.ok(sanitizerFailureIndex > racecheckIndex, "sanitizer failure must be evaluated only after both tools ran");

assert.match(workflow, /VALIDATION_STATUS\.json/);
assert.match(workflow, /BUNDLE_SHA256SUMS\.txt/);
assert.match(workflow, /if:\s*always\(\)/);
assert.match(workflow, /gluball-runtime-v3-efficiency-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
assert.match(workflow, /performance_observation_only/);
assert.match(workflow, /geometry_receipt_authority/);
assert.match(workflow, /universal_speedup_claim/);
assert.match(workflow, /raw_device_uuid_published/);

console.log("GLUBALL CUDA Runtime V3 physical workflow boundary: PASS");
