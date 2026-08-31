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
const gb10Workflow = await readFile(
  new URL("../.github/workflows/physical-cuda-gb10.yml", import.meta.url),
  "utf8"
);
const vastCampaign = await readFile(
  new URL("../scripts/run_vast_campaign.sh", import.meta.url),
  "utf8"
);

function explicitTriggers(text, label) {
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
  return triggers;
}

function assertManualSelfHostedBoundary(text, label) {
  explicitTriggers(text, label);
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

explicitTriggers(gb10Workflow, "GB10 physical validation workflow");
assert.match(
  gb10Workflow,
  /runs-on:\s*\[self-hosted, linux, ARM64, gluball-vast-gb10\]/,
  "GB10 validation must require the dedicated ARM64 Vast runner label"
);
assert.doesNotMatch(gb10Workflow, /\bmatrix\s*:/);
assert.match(gb10Workflow, /permissions:\n\s{2}contents:\s*read/);
assert.match(gb10Workflow, /- name: Validate dispatch inputs/);
assert.match(gb10Workflow, /V1_RUNS.*3, 100/);
assert.match(gb10Workflow, /integer\("V2_ITERATIONS", 2, 10_000\)/);
assert.match(gb10Workflow, /v1_points = v1_u \* v1_v/);
assert.match(gb10Workflow, /v1_full_readback_cap = 16_777_216/);
assert.match(gb10Workflow, /V1_U \* V1_V = \{v1_points\} exceeds the V1 full-readback cap/);
assert.match(gb10Workflow, /\/usr\/local\/cuda-13\.2\/bin/);
assert.match(gb10Workflow, /test "\$\(uname -m\)" = aarch64/);
assert.match(gb10Workflow, /test "\$model" = 'NVIDIA GB10'/);
assert.match(gb10Workflow, /test "\$capability" = '12\.1'/);
assert.match(gb10Workflow, /compute_121/);
assert.match(gb10Workflow, /sm_121/);
assert.doesNotMatch(gb10Workflow, /nvidia-smi\s+-L/);
assert.doesNotMatch(gb10Workflow, /query-gpu=[^\n]*uuid/i);
assert.match(gb10Workflow, /- name: GB10 bounded V1 full-readback acceptance/);
assert.match(gb10Workflow, /MODE:\s*evidence/);
assert.match(gb10Workflow, /GLUBALL_CUDA_ARCHITECTURES:\s*native/);
assert.match(gb10Workflow, /ARTIFACT_DIR:.*physical-evidence\/gb10\/v1-acceptance/);
assert.match(gb10Workflow, /reference_residual_checked/);
assert.match(gb10Workflow, /conformance_acceptance/);
assert.match(gb10Workflow, /V1_SANITIZER_STATUS\.txt/);
assert.match(gb10Workflow, /ERROR SUMMARY: 0 errors/);
const cleanRacecheck = /RACECHECK SUMMARY: 0 hazards displayed \(0 errors, 0 warnings\)/g;
assert.ok(
  (gb10Workflow.match(cleanRacecheck) ?? []).length >= 2,
  "GB10 workflow must require the complete clean racecheck summary for both V1 and V2 sanitizer gates"
);
assert.doesNotMatch(
  gb10Workflow,
  /grep -Fq '0 hazards'/,
  "GB10 sanitizer verification must not accept suffix substrings from nonzero racecheck counts"
);
assert.match(gb10Workflow, /"\$campaign\/memcheck\.txt" "\$campaign\/memcheck-run\.json"/);
assert.match(gb10Workflow, /"\$campaign\/racecheck\.txt" "\$campaign\/racecheck-run\.json"/);
const offStep = gb10Workflow.indexOf("- name: Runtime V2 graphs OFF");
const onStep = gb10Workflow.indexOf("- name: Runtime V2 graphs ON");
assert.ok(offStep >= 0 && onStep > offStep, "GB10 V2 workflow must run graphs OFF before graphs ON");
assert.match(gb10Workflow, /CUDA_GRAPHS:\s*off/);
assert.match(gb10Workflow, /CUDA_GRAPHS:\s*on/);
assert.match(gb10Workflow, /repeatable_compact_metrics/);
assert.match(gb10Workflow, /compact_metrics_clean/);
assert.match(gb10Workflow, /compiled_cuda_arch_code.*1210/);
assert.match(gb10Workflow, /aggregate_diagnostic_xor64/);
assert.match(gb10Workflow, /observed_graph_wall_speedup/);
assert.match(gb10Workflow, /- name: Compute Sanitizer Runtime V2 compact kernel/);
assert.match(gb10Workflow, /--error-exitcode 86/);
assert.match(gb10Workflow, /--error-exitcode 87/);
assert.match(gb10Workflow, /- name: Finalize GB10 validation manifests/);
assert.match(gb10Workflow, /VALIDATION_STATUS\.json/);
assert.match(gb10Workflow, /SHA256SUMS\.txt/);
assert.match(gb10Workflow, /BUNDLE_SHA256SUMS\.txt/);
assert.match(gb10Workflow, /gluball-physical-gb10-/);
assert.match(gb10Workflow, /uses: actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/);
assert.match(gb10Workflow, /V1 is correctness evidence/);
assert.match(gb10Workflow, /Runtime V2 is performance observation only/);
assert.match(gb10Workflow, /GPU output is not geometry authority/);

assert.match(vastCampaign, /compute-sanitizer --tool memcheck --error-exitcode 86/);
assert.match(vastCampaign, /compute-sanitizer --tool racecheck --error-exitcode 87/);
assert.match(vastCampaign, /> "\$ARTIFACT_DIR\/memcheck-run\.json"/);
assert.match(vastCampaign, /2> "\$ARTIFACT_DIR\/memcheck\.txt"/);
assert.match(vastCampaign, /> "\$ARTIFACT_DIR\/racecheck-run\.json"/);
assert.match(vastCampaign, /2> "\$ARTIFACT_DIR\/racecheck\.txt"/);

console.log("GLUBALL self-hosted Actions boundary: PASS");
