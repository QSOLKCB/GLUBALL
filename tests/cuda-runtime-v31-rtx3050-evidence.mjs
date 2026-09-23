import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";

const repo = new URL("../", import.meta.url);
const evidenceRoot = new URL("docs/physical-evidence/rtx-3050-35847244344/", repo);
const record = JSON.parse(await readFile(new URL("docs/physical-evidence/CUDA_RUNTIME_V31_RTX3050_RUN_35847244344.json", repo), "utf8"));
const profiles = JSON.parse(await readFile(new URL("docs/CUDA_RUNTIME_V31_ARCHITECTURE_PROFILES.json", repo), "utf8"));
const ladder = JSON.parse(await readFile(new URL("docs/CUDA_RUNTIME_V31_ARCHITECTURE_LADDER.json", repo), "utf8"));

assert.equal(record.schema, "gluball-cuda-runtime-v31-accepted-artifact/1");
assert.equal(record.status, "PASS");
assert.equal(record.profile, "rtx-3050");
assert.equal(record.physical_run_id, 35847244344);
assert.equal(record.source_commit, "4d327e0151b83a61c3357e0d3f72253e4a05dbb9");
assert.equal(record.artifact.id, 10743669801);
assert.equal(record.artifact.zip_sha256, "f504a890bb4575c0169daaaa86bf5213a2993c14b26cb41c85b9972058be35c3");
assert.equal(record.gpu.model, "NVIDIA GeForce RTX 3050");
assert.equal(record.gpu.compute_capability, "8.6");
assert.equal(record.gpu.expected_sm, "sm_86");
assert.equal(record.physical_preflight.safe_gpu_inventory.memory_total_mib, "6144");
assert.equal(record.physical_preflight.mig_capable_profile, false);
assert.equal(record.physical_preflight.mig_mode_current, "[N/A]");
assert.equal(record.physical_preflight.mig_mode_acceptable, true);
assert.equal(record.physical_preflight.mig_enabled, false);
assert.equal(record.physical_preflight.mig_partition_observed, false);
assert.equal(record.v1_validation.status, "PASS");
assert.equal(record.v1_validation.acceptance_record_count, 3);
assert.equal(record.v1_validation.output_repeatable_byte_identical, true);
assert.equal(new Set(record.v1_validation.output_sha256).size, 1);
assert.equal(record.atomic_equivalence.v2_wall_milliseconds_median, 0.463456);
assert.equal(record.atomic_equivalence.v3_wall_milliseconds_median, 0.111186);
assert.equal(record.atomic_equivalence.v31_wall_milliseconds_median, 0.111946);
assert.equal(record.two_stage_equivalence.v2_wall_milliseconds_median, 0.458956);
assert.equal(record.two_stage_equivalence.v3_wall_milliseconds_median, 0.111539);
assert.equal(record.two_stage_equivalence.v31_wall_milliseconds_median, 0.109211);
assert.equal(record.atomic_equivalence.v3_v31_exact_digest_equivalence, true);
assert.equal(record.two_stage_equivalence.v3_v31_exact_digest_equivalence, true);
assert.deepEqual(record.atomic_equivalence.diagnostic_digests, {
  v2: "1e15cffd50e6f653", v3: "1e206a0f3b649b9a", v31: "1e206a0f3b649b9a",
});
assert.deepEqual(record.two_stage_equivalence.diagnostic_digests, record.atomic_equivalence.diagnostic_digests);
const winner = record.bounded_tuning.best_observed_candidate_within_declared_set;
assert.equal(record.bounded_tuning.status, "PASS");
assert.equal(record.bounded_tuning.candidate_count, 24);
assert.equal(record.bounded_tuning.matched_v3_baseline_configuration_count, 12);
assert.equal(winner.block_size, 128);
assert.equal(winner.cuda_graphs, "on");
assert.equal(winner.reduction_mode, "atomic");
assert.equal(winner.observed_wall_milliseconds_median_of_trials, 0.108044);
assert.deepEqual(winner.trial_wall_milliseconds_median_values, [0.107378, 0.108044, 0.109165]);
assert.equal(winner.exact_matched_v3_v31_digest_equivalence, true);

const manifestParts = [];
for (const relative of record.artifact.durable_bundle_manifest_parts) manifestParts.push(await readFile(new URL(relative, evidenceRoot)));
const manifest = Buffer.concat(manifestParts);
assert.equal(createHash("sha256").update(manifest).digest("hex"), record.artifact.bundle_sha256s_manifest_sha256);
const manifestLines = manifest.toString("utf8").trimEnd().split("\n");
assert.equal(manifestLines.length, 179);
const manifestMap = new Map(manifestLines.map((line) => {
  const match = /^([0-9a-f]{64})  \.\/(.+)$/.exec(line);
  assert.ok(match, `invalid manifest line: ${line}`);
  return [match[2], match[1]];
}));

const durableBundleParts = [];
for (const relative of record.artifact.durable_receipt_bundle_parts) durableBundleParts.push(await readFile(new URL(relative, evidenceRoot)));
const bundleBytes = Buffer.concat(durableBundleParts);
assert.equal(createHash("sha256").update(bundleBytes).digest("hex"), record.artifact.durable_receipt_bundle_sha256);
const bundle = JSON.parse(gunzipSync(bundleBytes).toString("utf8"));
assert.equal(bundle.schema, record.artifact.durable_receipt_bundle_schema);
assert.equal(bundle.source_run_id, record.physical_run_id);
assert.equal(bundle.source_artifact_id, record.artifact.id);
assert.equal(bundle.entries.length, record.artifact.durable_receipt_original_paths.length);
assert.deepEqual(bundle.entries.map((entry) => entry.path), record.artifact.durable_receipt_original_paths);
const receipts = new Map();
for (const entry of bundle.entries) {
  const bytes = Buffer.from(entry.content_base64, "base64");
  const digest = createHash("sha256").update(bytes).digest("hex");
  assert.equal(digest, entry.sha256, `bundle receipt digest mismatch: ${entry.path}`);
  assert.equal(digest, manifestMap.get(entry.path), `original manifest mismatch: ${entry.path}`);
  receipts.set(entry.path, bytes);
}

for (const [section, directory] of [["atomic_equivalence", "ab-atomic"], ["two_stage_equivalence", "ab-two-stage"]]) {
  for (const [version, field] of [["V2", "v2_wall_milliseconds_median"], ["V3", "v3_wall_milliseconds_median"], ["V31", "v31_wall_milliseconds_median"]]) {
    const receipt = JSON.parse(receipts.get(`${directory}/${version}.json`).toString("utf8"));
    assert.equal(receipt.iteration_wall_milliseconds_median, record[section][field]);
  }
}
const sanitizer = receipts.get("v31-sanitizer/SANITIZER_EXIT_STATUS.txt").toString("utf8");
assert.equal(sanitizer, "memcheck_atomic=0\nracecheck_atomic=0\nmemcheck_two_stage=0\nracecheck_two_stage=0\n");
const tuning = JSON.parse(receipts.get("tuning/TUNING_RESULT.json").toString("utf8"));
assert.equal(tuning.status, "PASS");
assert.deepEqual(tuning.best_observed_candidate_within_declared_set, winner);
const archivedArchitecture = JSON.parse(receipts.get("ARCHITECTURE_RESULT.json").toString("utf8"));
assert.equal(archivedArchitecture.source_commit, record.source_commit);
assert.equal(archivedArchitecture.status, "PASS");
const archivedPreflight = JSON.parse(receipts.get("PHYSICAL_PREFLIGHT_VALIDATION.json").toString("utf8"));
assert.equal(archivedPreflight.mig_mode_current, "[N/A]");
assert.equal(archivedPreflight.mig_capable_profile, false);

assert.equal(profiles.profiles["rtx-3050"].status, "completed-physical-run-35847244344");
assert.equal(profiles.profiles["rtx-3050"].mig_capable, false);
const completed = ladder.completed_supplemental_ampere_specimen;
assert.equal(completed.profile, "rtx-3050");
assert.equal(completed.status, "PASS");
assert.equal(completed.physical_run_id, 35847244344);
assert.equal(completed.artifact_id, 10743669801);
assert.equal(completed.artifact_sha256, record.artifact.zip_sha256);
assert.equal(completed.accepted_artifact_record, "docs/physical-evidence/CUDA_RUNTIME_V31_RTX3050_RUN_35847244344.json");
assert.equal(completed.durable_receipt_directory, record.artifact.durable_receipt_directory);
assert.equal(completed.best_observed_candidate.observed_wall_milliseconds_median_of_trials, 0.108044);
assert.equal(completed.geometry_receipt_authority, false);
assert.equal(completed.universal_speedup_claim, false);
assert.equal(ladder.supplemental_profile_policy["rtx-3050"].replaces_a100_rung, false);
assert.equal(ladder.supplemental_profile_policy["rtx-3050"].is_a100_evidence, false);
console.log("RTX 3050 accepted physical evidence archive: PASS");
