import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const state = JSON.parse(await readFile(new URL("../docs/CURRENT_STATE.json", import.meta.url), "utf8"));
const acceptance = JSON.parse(await readFile(new URL("../docs/CUDA_ACCEPTANCE_CONTRACT.json", import.meta.url), "utf8"));
const historical = JSON.parse(await readFile(new URL("../docs/AI_AGENT_CONTRACT.json", import.meta.url), "utf8"));

assert.equal(state.schema, "gluball-current-state/1");
assert.equal(state.released_contract_freeze.version, "1.0.0");
assert.equal(state.released_contract_freeze.tag, "v1.0.0");
assert.match(state.released_contract_freeze.verified_tag_target, /^[0-9a-f]{40}$/);
assert.equal(state.released_contract_freeze.verified_tag_target, "80941183d14531093117e122da0fc32c13d2464b");
assert.equal(state.released_contract_freeze.gpu_in_release_surface, false);
assert.equal(state.released_contract_freeze.cpu_wasm_in_release_surface, false);
assert.equal(state.released_contract_freeze.historical_release_candidate_metadata_remains_reference_material, true);
assert.equal(historical.release_candidate.excluded_runtime_surfaces.includes("gpu"), true);

assert.equal(state.post_release_runtime.rust_runtime_contract, "GLUBALL-RUST-RUNTIME-V1");
assert.equal(state.post_release_runtime.cuda_runtime_contract, "GLUBALL-MULTI-DEVICE-CUDA-V1");
assert.equal(state.post_release_runtime.cuda_acceptance_contract, "GLUBALL-CUDA-ACCEPTANCE-V1");
assert.equal(state.post_release_runtime.geometry_authority_changed, false);

assert.equal(acceptance.contract, state.post_release_runtime.cuda_acceptance_contract);
assert.equal(acceptance.geometry_contract, state.released_contract_freeze.geometry_contract);
assert.equal(acceptance.host_reference, state.post_release_runtime.rust_runtime_contract);
assert.equal(acceptance.cuda_contract, state.post_release_runtime.cuda_runtime_contract);
assert.equal(acceptance.evidence_output.complete_readback_required, true);
assert.equal(acceptance.evidence_output.partial_artifacts_accepted, false);
assert.equal(acceptance.acceptance_semantics.geometry_receipt_authority, false);
assert.equal(acceptance.acceptance_semantics.universal_speedup_claim, false);
assert.deepEqual(acceptance.campaign_policy.device_count_ladder, [1, 2, 4, 8]);

const physical = state.physical_campaign_state;
const ladder = physical.accepted_ladder_1_2_4;
assert.equal(physical.physical_cuda_evidence_archived, true);
assert.equal(physical.physical_multi_gpu_evidence_archived, true);
assert.deepEqual(physical.accepted_device_counts, [1, 2, 4]);
assert.deepEqual(physical.pending_device_counts, [8]);
assert.equal(ladder.workflow_run_id, 33378934659);
assert.equal(ladder.workflow_run_url, "https://github.com/QSOLKCB/GLUBALL/actions/runs/33378934659");
assert.equal(ladder.source_commit, "d73ad661464eb040e2966e5e9f036941543b4524");
assert.equal(ladder.artifact_id, 9753091493);
assert.equal(ladder.artifact_name, "gluball-physical-cuda-1-2-4-33378934659-1");
assert.equal(ladder.artifact_size_bytes, 219884389);
assert.match(ladder.artifact_zip_sha256, /^[0-9a-f]{64}$/);
assert.equal(ladder.artifact_zip_sha256, "6ba740acf06617d0cf93d2d3548b6e0783994b88b9ed40ee342349f9f9d23747");
assert.equal(ladder.gpu_model, "NVIDIA GeForce RTX 4080 SUPER");
assert.equal(ladder.cuda_architecture, 89);
assert.equal(ladder.accepted_runs_per_device_count, 3);
assert.equal(ladder.points_checked_per_run, 2097152);
assert.equal(ladder.all_acceptance_records_passed, true);
assert.equal(ladder.complete_output_readback, true);
assert.equal(ladder.nonfinite_records, 0);
assert.equal(ladder.compute_sanitizer_archived, true);
assert.equal(ladder.bundle_manifest_verified_after_download, true);
assert.equal(ladder.campaign_manifests_verified_after_download, true);
assert.equal(ladder.geometry_authority_changed, false);
assert.equal(ladder.universal_speedup_claim, false);

console.log("GLUBALL current post-v1 state: PASS");
