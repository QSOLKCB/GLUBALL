import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const core = await readFile(
  new URL("../.github/workflows/physical-cuda-multigpu-core.yml", import.meta.url),
  "utf8"
);
const nine = await readFile(
  new URL("../.github/workflows/physical-cuda-9x4090.yml", import.meta.url),
  "utf8"
);
const sixteen = await readFile(
  new URL("../.github/workflows/physical-cuda-16x5090.yml", import.meta.url),
  "utf8"
);
const scalingScript = await readFile(
  new URL("../scripts/run_phase5c_multigpu_scaling.sh", import.meta.url),
  "utf8"
);

function triggerBlock(text, label) {
  const match = text.match(/\non:\n([\s\S]*?)\npermissions:/);
  assert.ok(match, `${label} must have an explicit trigger block`);
  return match[1];
}

function assertManualWrapper(text, label) {
  const triggers = triggerBlock(text, label);
  assert.match(triggers, /^\s{2}workflow_dispatch:/m);
  for (const forbidden of ["push", "pull_request", "pull_request_target", "schedule", "workflow_run", "workflow_call"]) {
    assert.doesNotMatch(triggers, new RegExp(`^\\s{2}${forbidden}:`, "m"), `${label} must not enable ${forbidden}`);
  }
  assert.match(text, /permissions:\n\s{2}contents:\s*read/);
  assert.match(text, /uses:\s*\.\/\.github\/workflows\/physical-cuda-multigpu-core\.yml/);
  assert.match(text, /fromJSON\(inputs\.v1_u_segments\)/);
  assert.match(text, /fromJSON\(inputs\.measured_iterations\)/);
  assert.doesNotMatch(text, /\bmatrix\s*:/);
}

const coreTriggers = triggerBlock(core, "multi-GPU reusable core");
assert.match(coreTriggers, /^\s{2}workflow_call:/m);
for (const forbidden of ["push", "pull_request", "pull_request_target", "schedule", "workflow_run", "workflow_dispatch"]) {
  assert.doesNotMatch(coreTriggers, new RegExp(`^\\s{2}${forbidden}:`, "m"));
}
assert.match(core, /runs-on:\s*\[self-hosted, linux, x64, "\$\{\{ inputs\.runner_label \}\}"\]/);
assert.match(core, /integer\("REQUIRED_DEVICES", 8, 16\)/);
assert.match(core, /for baseline in \(1, 2, 4, 8\):/);
assert.match(core, /SCALING_COUNTS must start at 1 and end at REQUIRED_DEVICES/);
assert.match(core, /WEAK_U_PER_DEVICE \* REQUIRED_DEVICES exceeds Runtime V2 U limit/);
assert.match(core, /V1 full-readback workload exceeds 16,777,216 points/);
assert.match(core, /DEVICES:\s*"0,1,2,3,4,5,6,7"/);
assert.match(core, /LOGICAL_DEVICE_SLOTS:\s*"8"/);
assert.match(core, /V1 eight-device bounded correctness acceptance/);
assert.match(core, /GLUBALL_CUDA_ARCHITECTURES:\s*native/);
assert.match(core, /expected_sm="sm_\$\{arch_digits\}"/);
assert.match(core, /grep -Fxq "\$expected_sm" "\$root\/NVCC_GPU_CODE\.txt"/);
assert.doesNotMatch(core, /nvidia-smi\s+-L/);
assert.doesNotMatch(core, /query-gpu=[^\n]*uuid/i);
assert.match(core, /find_clean_summary\(\)/);
assert.match(core, /"\$campaign\/memcheck\.txt" "\$campaign\/memcheck-run\.json"/);
assert.match(core, /"\$campaign\/racecheck\.txt" "\$campaign\/racecheck-run\.json"/);
assert.match(core, /RACECHECK SUMMARY: 0 hazards displayed \(0 errors, 0 warnings\)/);
assert.match(core, /Runtime V2 strong weak and full-host graph campaign/);
assert.match(core, /--error-exitcode 86/);
assert.match(core, /--error-exitcode 87/);
assert.match(core, /VALIDATION_STATUS\.json/);
assert.match(core, /SHA256SUMS\.txt/);
assert.match(core, /BUNDLE_SHA256SUMS\.txt/);
assert.match(core, /uses: actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/);
assert.match(core, /performance_observation_only/);
assert.match(core, /geometry_receipt_authority/);
assert.match(core, /universal_speedup_claim/);

assertManualWrapper(nine, "9x4090 wrapper");
assert.match(nine, /runner_label:\s*gluball-vast-9x4090/);
assert.match(nine, /expected_model_fragment:\s*RTX 4090/);
assert.match(nine, /required_devices:\s*9/);
assert.match(nine, /scaling_counts:\s*1,2,4,8,9/);
assert.match(nine, /artifact_slug:\s*9x4090/);
assert.match(nine, /default:\s*"524288"/);
assert.match(nine, /default:\s*"1000"/);

assertManualWrapper(sixteen, "16x5090 wrapper");
assert.match(sixteen, /runner_label:\s*gluball-vast-16x5090/);
assert.match(sixteen, /expected_model_fragment:\s*RTX 5090/);
assert.match(sixteen, /required_devices:\s*16/);
assert.match(sixteen, /scaling_counts:\s*1,2,4,8,16/);
assert.match(sixteen, /artifact_slug:\s*16x5090/);
assert.match(sixteen, /default:\s*"524288"/);
assert.match(sixteen, /default:\s*"1000"/);

assert.match(scalingScript, /^set -eu$/m);
assert.equal((scalingScript.match(/cmake -S native\/cuda/g) ?? []).length, 1, "Runtime V2 must be configured once per rental campaign");
assert.equal((scalingScript.match(/cmake --build/g) ?? []).length, 1, "Runtime V2 must be built once per rental campaign");
assert.doesNotMatch(scalingScript, /run_cuda_runtime_v2\.sh/);
assert.match(scalingScript, /Runtime V2 fixed-work strong scaling/);
assert.match(scalingScript, /Runtime V2 weak scaling/);
assert.match(scalingScript, /Runtime V2 full-host CUDA Graph comparison/);
assert.match(scalingScript, /strong-scaling compact diagnostics changed with device count/);
assert.match(scalingScript, /observed_speedup_vs_1gpu/);
assert.match(scalingScript, /observed_parallel_efficiency/);
assert.match(scalingScript, /observed_time_ratio_vs_1gpu/);
assert.match(scalingScript, /full-host graphs OFF\/ON diagnostic digests differ/);
assert.match(scalingScript, /performance_observation_only/);
assert.match(scalingScript, /universal_speedup_claim/);
assert.match(scalingScript, /geometry_receipt_authority/);

console.log("GLUBALL Phase 5C multi-GPU Actions boundary: PASS");
