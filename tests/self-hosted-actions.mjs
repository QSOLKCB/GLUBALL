import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(
  new URL("../.github/workflows/physical-cuda-ladder.yml", import.meta.url),
  "utf8"
);

const triggerMatch = workflow.match(/\non:\n([\s\S]*?)\npermissions:/);
assert.ok(triggerMatch, "physical CUDA workflow must have an explicit trigger block");
const triggers = triggerMatch[1];

assert.match(triggers, /^\s{2}workflow_dispatch:/m);
for (const forbidden of ["push", "pull_request", "pull_request_target", "schedule", "workflow_run"]) {
  assert.doesNotMatch(
    triggers,
    new RegExp(`^\\s{2}${forbidden}:`, "m"),
    `self-hosted physical CUDA workflow must not enable ${forbidden}`
  );
}

assert.match(
  workflow,
  /runs-on:\s*\[self-hosted, linux, x64, gluball-vast-8gpu\]/,
  "physical workflow must require the dedicated Vast runner label"
);
assert.doesNotMatch(workflow, /\bmatrix\s*:/, "1/2/4 campaigns must remain sequential on one host");
assert.match(workflow, /permissions:\n\s{2}contents:\s*read/);
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

assert.match(workflow, /- name: Validate dispatch inputs/);
assert.match(workflow, /positive_integer accepted_runs "\$ACCEPTED_RUNS_INPUT"/);
assert.match(workflow, /if \[ "\$value" -le 0 \]; then/);
assert.match(workflow, /query-gpu=name --format=csv,noheader/);
assert.match(workflow, /distinct_models/);
assert.match(workflow, /requires GPUs 0-3 to have one identical model/);
assert.match(workflow, /SELECTED_GPU_MODEL\.txt/);
assert.match(workflow, /- name: Finalize bundle integrity manifest/);
assert.match(workflow, /BUNDLE_SHA256SUMS\.txt/);
assert.match(workflow, /find \. -type f ! -name BUNDLE_SHA256SUMS\.txt/);

assert.doesNotMatch(workflow, /nvidia-smi\s+-L/, "workflow logs must not publish raw CUDA UUIDs");
assert.doesNotMatch(workflow, /query-gpu=[^\n]*uuid/i, "workflow inventory must not query raw CUDA UUIDs");
assert.match(workflow, /uses: actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/);
assert.match(workflow, /if:\s*always\(\)/);
assert.match(workflow, /geometry authority/i);

console.log("GLUBALL self-hosted Actions boundary: PASS");
