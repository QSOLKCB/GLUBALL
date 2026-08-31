import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(
  new URL("../.github/workflows/physical-cuda-ladder.yml", import.meta.url),
  "utf8"
);
const eightWorkflow = await readFile(
  new URL("../.github/workflows/physical-cuda-8gpu.yml", import.meta.url),
  "utf8"
);

function assertManualSelfHostedBoundary(text, label) {
  const triggerMatch = text.match(/\non:\n([\s\S]*?)\npermissions:/);
  assert.ok(triggerMatch, `${label} must have an explicit trigger block`);
  const triggers = triggerMatch[1];

  assert.match(triggers, /^\s{2}workflow_dispatch:/m);
  for (const forbidden of ["push", "pull_request", "pull_request_target", "schedule", "workflow_run"]) {
    assert.doesNotMatch(
      triggers,
      new RegExp(`^\\s{2}${forbidden}:`, "m"),
      `${label} must not enable ${forbidden}`
    );
  }

  assert.match(
    text,
    /runs-on:\s*\[self-hosted, linux, x64, gluball-vast-8gpu\]/,
    `${label} must require the dedicated Vast runner label`
  );
  assert.doesNotMatch(text, /\bmatrix\s*:/, `${label} must not use matrix execution on the rented host`);
  assert.match(text, /permissions:\n\s{2}contents:\s*read/);
  assert.match(text, /- name: Validate dispatch inputs/);
  assert.match(text, /(?:positive_integer|bounded_positive_integer) accepted_runs "\$ACCEPTED_RUNS_INPUT"/);
  assert.doesNotMatch(text, /nvidia-smi\s+-L/, `${label} logs must not publish raw CUDA UUIDs`);
  assert.doesNotMatch(text, /query-gpu=[^\n]*uuid/i, `${label} inventory must not query raw CUDA UUIDs`);
  assert.match(text, /- name: Finalize bundle integrity manifest/);
  assert.match(text, /BUNDLE_SHA256SUMS\.txt/);
  assert.match(text, /find \. -type f ! -name BUNDLE_SHA256SUMS\.txt/);
  assert.match(text, /uses: actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/);
  assert.match(text, /if:\s*always\(\)/);
  assert.match(text, /geometry authority/i);
}

assertManualSelfHostedBoundary(workflow, "1/2/4 physical CUDA workflow");
assert.match(workflow, /DEVICES:\s*"0"/);
assert.match(workflow, /DEVICES:\s*"0,1"/);
assert.match(workflow, /DEVICES:\s*"0,1,2,3"/);
const oneStep = workflow.indexOf("- name: 1 GPU evidence - three accepted runs");
const twoStep = workflow.indexOf("- name: 2 GPU evidence - three accepted runs");
const fourStep = workflow.indexOf("- name: 4 GPU evidence - three accepted runs");
assert.ok(
  oneStep >= 0 && twoStep > oneStep && fourStep > twoStep,
  "device ladder must stay ordered 1 -> 2 -> 4"
);
assert.match(workflow, /query-gpu=name --format=csv,noheader/);
assert.match(workflow, /distinct_models/);
assert.match(workflow, /requires GPUs 0-3 to have one identical model/);
assert.match(workflow, /SELECTED_GPU_MODEL\.txt/);

assertManualSelfHostedBoundary(eightWorkflow, "8-GPU physical CUDA workflow");
assert.match(eightWorkflow, /bounded_positive_integer accepted_runs "\$ACCEPTED_RUNS_INPUT" 100/);
assert.match(eightWorkflow, /accepted_runs_normalized=/);
assert.match(eightWorkflow, /if \[ "\$accepted_runs_normalized" -lt 3 \]; then/);
assert.match(eightWorkflow, /accepted_runs must be at least 3 for Phase 5B completion/);
assert.match(eightWorkflow, /bounded_positive_integer u_segments "\$U_INPUT" 1000000/);
assert.match(eightWorkflow, /bounded_positive_integer v_segments "\$V_INPUT" 65536/);
assert.match(eightWorkflow, /bounded_positive_integer repeats "\$REPEATS_INPUT" 1024/);
assert.match(eightWorkflow, /gpu_count.*nvidia-smi/);
assert.match(eightWorkflow, /if \[ "\$gpu_count" -lt 8 \]; then/);
assert.match(eightWorkflow, /first_eight_models/);
assert.match(eightWorkflow, /distinct_models/);
assert.match(eightWorkflow, /requires GPUs 0-7 to have one identical model/);
assert.match(eightWorkflow, /SELECTED_GPU_MODEL\.txt/);
assert.match(eightWorkflow, /SELECTED_DEVICES\.txt/);
assert.match(eightWorkflow, /DEVICES:\s*"0,1,2,3,4,5,6,7"/);
assert.match(eightWorkflow, /LOGICAL_DEVICE_SLOTS:\s*"8"/);
assert.match(eightWorkflow, /ARTIFACT_DIR:.*physical-evidence\/8gpu/);
assert.match(eightWorkflow, /- name: Verify sanitizer archival boundary/);
assert.match(eightWorkflow, /SANITIZER_STATUS\.txt/);
assert.match(eightWorkflow, /find_clean_summary\(\)/);
assert.match(eightWorkflow, /ERROR SUMMARY: 0 errors/);
assert.match(eightWorkflow, /RACECHECK SUMMARY: 0 hazards displayed \(0 errors, 0 warnings\)/);
assert.match(eightWorkflow, /memcheck\.txt/);
assert.match(eightWorkflow, /memcheck-run\.json/);
assert.match(eightWorkflow, /racecheck\.txt/);
assert.match(eightWorkflow, /racecheck-run\.json/);
assert.match(eightWorkflow, /available: clean memcheck archived in/);
assert.match(eightWorkflow, /available-but-clean-results-not-verified/);
assert.match(eightWorkflow, /unavailable: compute-sanitizer not found on PATH/);
assert.match(eightWorkflow, /find \. -maxdepth 1 -type f ! -name SHA256SUMS\.txt/);
assert.match(eightWorkflow, /> SHA256SUMS\.txt/);
assert.match(eightWorkflow, /gluball-physical-cuda-8gpu-/);

console.log("GLUBALL self-hosted Actions boundary: PASS");
