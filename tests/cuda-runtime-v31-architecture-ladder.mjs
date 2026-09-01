import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(new URL("../.github/workflows/physical-cuda-v31-architecture-ladder.yml", import.meta.url), "utf8");
const runner = await readFile(new URL("../scripts/run_cuda_runtime_v31_architecture_profile.sh", import.meta.url), "utf8");
const verifier = await readFile(new URL("../scripts/verify_cuda_v1_campaign.py", import.meta.url), "utf8");
const finalizer = await readFile(new URL("../scripts/finalize_cuda_runtime_v31_architecture.py", import.meta.url), "utf8");
const comparator = await readFile(new URL("../scripts/compare_cuda_runtime_v31_architecture_results.py", import.meta.url), "utf8");
const docs = await readFile(new URL("../docs/CUDA_RUNTIME_V31_ARCHITECTURE_LADDER.md", import.meta.url), "utf8");
const contract = JSON.parse(await readFile(new URL("../docs/CUDA_RUNTIME_V31_ARCHITECTURE_LADDER.json", import.meta.url), "utf8"));

assert.match(workflow, /^name: GLUBALL Runtime V3\.1 architecture ladder/m);
assert.match(workflow, /workflow_dispatch:/);
assert.doesNotMatch(workflow, /^\s+push:/m);
assert.doesNotMatch(workflow, /^\s+pull_request:/m);
assert.match(workflow, /target_profile:/);
assert.match(workflow, /- titan-xp/);
assert.match(workflow, /- h200/);
assert.match(workflow, /gluball-vast-v31-architecture/);
assert.match(workflow, /MODEL_FRAGMENT=TITAN Xp/);
assert.match(workflow, /MODEL_FRAGMENT=H200/);
assert.match(workflow, /continue-on-error: true/);
assert.match(workflow, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/);
assert.match(workflow, /Require final PASS/);

assert.match(runner, /--query-gpu=index,name,driver_version,compute_cap,memory\.total/);
assert.doesNotMatch(runner, /nvidia-smi\s+-L/);
assert.doesNotMatch(runner, /--query-gpu=[^\n]*uuid/i);
assert.match(runner, /fragment\.casefold\(\) not in model\.casefold\(\)/);
assert.match(runner, /nvcc --list-gpu-arch/);
assert.match(runner, /nvcc --list-gpu-code/);
assert.match(runner, /--ptxas-options=-v/);
assert.match(runner, /graduation_gate.*False/s);
assert.match(runner, /scripts\/run_vast_campaign\.sh/);
assert.match(runner, /scripts\/verify_cuda_v1_campaign\.py/);
assert.match(runner, /REDUCTION=atomic/);
assert.match(runner, /REDUCTION=two-stage/);
assert.match(runner, /scripts\/tune_cuda_runtime_v31\.sh/);
assert.match(runner, /--tool memcheck[\s\S]*--reduction atomic/);
assert.match(runner, /--tool racecheck[\s\S]*--reduction atomic/);
assert.match(runner, /--tool memcheck[\s\S]*--reduction two-stage/);
assert.match(runner, /--tool racecheck[\s\S]*--reduction two-stage/);
assert.match(runner, /ERROR SUMMARY: 0 errors/);
assert.match(runner, /RACECHECK SUMMARY: 0 hazards displayed/);
assert.match(runner, /V31_SANITIZER\.ok/);

assert.match(verifier, /cuda-acceptance-\*\.json/);
assert.match(verifier, /cuda-output-\*\.f32le/);
assert.match(verifier, /cuda-run-\*\.json/);
assert.match(verifier, /memcheck-run\.json/);
assert.match(verifier, /racecheck-run\.json/);
assert.match(verifier, /output_repeatable_byte_identical/);
assert.match(verifier, /geometry_receipt_authority/);
assert.match(verifier, /universal_speedup_claim/);

assert.match(finalizer, /gluball-cuda-runtime-v31-architecture-result\/1/);
assert.match(finalizer, /cross_device_digest_equality_required.*False/s);
assert.match(finalizer, /within_device_v3_v31_digest_equality_required.*True/s);
assert.match(finalizer, /raw_float_bit_digest_is_geometry_authority.*False/s);
assert.match(finalizer, /universal_speedup_claim.*False/s);
assert.match(finalizer, /raw_device_uuid_published.*False/s);
assert.match(finalizer, /cross_device_portability_claim.*False/s);
assert.match(finalizer, /compiler_resource_telemetry_is_graduation_gate.*False/s);

assert.match(comparator, /same source commit/);
assert.match(comparator, /same canonical workload/);
assert.match(comparator, /cross_device_digest_equality_required.*False/s);
assert.match(comparator, /cross_hardware_timing_ratio_is_diagnostic_only.*True/s);
assert.match(comparator, /geometry_receipt_authority.*False/s);
assert.match(comparator, /universal_speedup_claim.*False/s);

assert.equal(contract.contract, "GLUBALL-CUDA-RUNTIME-V3.1-ARCHITECTURE-LADDER");
assert.equal(contract.runner_label, "gluball-vast-v31-architecture");
assert.equal(contract.canonical_workload.fixed_across_profiles, true);
assert.equal(contract.completed_baseline.physical_run_id, 33453555600);
assert.equal(contract.completed_baseline.artifact_id, 9780653297);
assert.equal(contract.completed_baseline.best_observed_candidate.block_size, 512);
assert.equal(contract.completed_baseline.best_observed_candidate.cuda_graphs, "off");
assert.equal(contract.completed_baseline.best_observed_candidate.reduction_mode, "two-stage");
assert.deepEqual(contract.next_profiles.map((entry) => entry.profile), ["titan-xp", "h200"]);
assert.equal(contract.compiler_resource_telemetry.graduation_gate, false);
assert.equal(contract.comparison_boundary.cross_device_digest_equality_required, false);
assert.equal(contract.comparison_boundary.within_device_v3_v31_digest_equality_required, true);
assert.equal(contract.claim_boundary.geometry_receipt_authority, false);
assert.equal(contract.claim_boundary.universal_speedup_claim, false);
assert.equal(contract.claim_boundary.raw_device_uuid_published, false);

assert.match(docs, /Marketplace instance IDs, prices and availability are external rental logistics/);
assert.match(docs, /cross_device_digest_equality_required:\s+false/);
assert.match(docs, /within_device_v3_v31_digest_equality:\s+required/);

console.log("GLUBALL Runtime V3.1 architecture ladder: PASS");
