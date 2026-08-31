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

assert.equal(state.physical_campaign_state.physical_cuda_evidence_archived, false);
assert.equal(state.physical_campaign_state.physical_multi_gpu_evidence_archived, false);

console.log("GLUBALL current post-v1 state: PASS");
