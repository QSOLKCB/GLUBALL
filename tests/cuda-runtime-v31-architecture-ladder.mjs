import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const workflow = await readFile(new URL("../.github/workflows/physical-cuda-v31-architecture-ladder.yml", import.meta.url), "utf8");
const runner = await readFile(new URL("../scripts/run_cuda_runtime_v31_architecture_profile.sh", import.meta.url), "utf8");
const verifier = await readFile(new URL("../scripts/verify_cuda_v1_campaign.py", import.meta.url), "utf8");
const finalizer = await readFile(new URL("../scripts/finalize_cuda_runtime_v31_architecture.py", import.meta.url), "utf8");
const comparatorUrl = new URL("../scripts/compare_cuda_runtime_v31_architecture_results.py", import.meta.url);
const comparator = await readFile(comparatorUrl, "utf8");
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
assert.match(workflow, /inputs\.target_profile.*github\.run_id.*github\.run_attempt/s);
assert.match(workflow, /CAMPAIGN_OUTCOME: \$\{\{ steps\.campaign\.outcome \}\}/);
assert.match(workflow, /CAMPAIGN_OUTCOME.*success/s);
assert.match(workflow, /sha256sum -c BUNDLE_SHA256SUMS\.txt/);
assert.match(workflow, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/);
assert.match(workflow, /Require final PASS/);

assert.match(runner, /--query-gpu=index,name,driver_version,compute_cap,memory\.total/);
assert.doesNotMatch(runner, /nvidia-smi\s+-L/);
assert.doesNotMatch(runner, /--query-gpu=[^\n]*uuid/i);
assert.match(runner, /fragment\.casefold\(\) not in model\.casefold\(\)/);
assert.match(runner, /EVIDENCE_ROOT must be empty before a new physical campaign/);
assert.match(runner, /find "\$root" -mindepth 1 -print -quit/);
assert.match(runner, /nvcc --list-gpu-arch/);
assert.match(runner, /nvcc --list-gpu-code/);
assert.match(runner, /ptxas_probe_status/);
assert.match(runner, /PTXAS_VERSION_EXIT_STATUS\.txt/);
assert.match(runner, /--ptxas-options=-v/);
assert.match(runner, /graduation_gate.*False/s);
assert.match(runner, /BUNDLE_SHA256SUMS\.txt\.tmp/);
assert.match(runner, /bundle_manifest_error/);
assert.match(runner, /hashlib\.sha256/);
assert.doesNotMatch(runner, /xargs -0 sha256sum/);
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
assert.match(comparator, /source_commit must be a 40-hex commit identifier/);
assert.match(comparator, /same canonical workload/);
assert.match(comparator, /canonical_workload must be a complete object/);
assert.match(comparator, /incomplete\/invalid canonical_workload fields/);
assert.match(comparator, /V3\.1 diagnostic digest must be 16 hex characters/);
assert.match(comparator, /cross_device_digest_observation_available.*True/s);
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

const temp = await mkdtemp(join(tmpdir(), "gluball-v31-arch-"));
try {
  const base = {
    schema: "gluball-cuda-runtime-v31-architecture-result/1",
    status: "PASS",
    profile: "titan-xp",
    source_commit: "a".repeat(40),
    gpu: { model: "NVIDIA TITAN Xp", compute_capability: "6.1", expected_sm: "sm_61" },
    canonical_workload: {
      u_segments: 16384,
      v_segments: 128,
      repeats: 1,
      warmup_iterations: 20,
      measured_iterations: 1000,
      trials_per_candidate: 3,
      fixed_across_profiles: true,
    },
    bounded_tuning: {
      status: "PASS",
      best_observed_candidate_within_declared_set: {
        observed_wall_milliseconds_median_of_trials: 0.12,
      },
    },
    atomic_equivalence: {
      status: "PASS",
      shared_observation_equivalence: true,
      v3_v31_exact_digest_equivalence: true,
      diagnostic_digests: { v31: "0123456789abcdef" },
    },
  };
  const right = JSON.parse(JSON.stringify(base));
  right.profile = "h200";
  right.gpu = { model: "NVIDIA H200", compute_capability: "9.0", expected_sm: "sm_90" };
  right.atomic_equivalence.diagnostic_digests.v31 = "fedcba9876543210";
  right.bounded_tuning.best_observed_candidate_within_declared_set.observed_wall_milliseconds_median_of_trials = 0.01;

  const runComparator = async (leftPayload, rightPayload) => {
    const leftPath = join(temp, "left.json");
    const rightPath = join(temp, "right.json");
    await writeFile(leftPath, JSON.stringify(leftPayload));
    await writeFile(rightPath, JSON.stringify(rightPayload));
    return spawnSync("python3", [comparatorUrl.pathname, leftPath, rightPath], { encoding: "utf8" });
  };

  const good = await runComparator(base, right);
  assert.equal(good.status, 0, good.stderr);
  const compared = JSON.parse(good.stdout);
  assert.equal(compared.cross_device_digest_match_observed, false);
  assert.equal(compared.cross_device_digest_observation_available, true);

  const missingCommit = JSON.parse(JSON.stringify(base));
  delete missingCommit.source_commit;
  assert.notEqual((await runComparator(missingCommit, right)).status, 0);

  const missingWorkload = JSON.parse(JSON.stringify(base));
  delete missingWorkload.canonical_workload.measured_iterations;
  assert.notEqual((await runComparator(missingWorkload, right)).status, 0);

  const missingDigest = JSON.parse(JSON.stringify(base));
  delete missingDigest.atomic_equivalence.diagnostic_digests.v31;
  assert.notEqual((await runComparator(missingDigest, right)).status, 0);
} finally {
  await rm(temp, { recursive: true, force: true });
}

console.log("GLUBALL Runtime V3.1 architecture ladder: PASS");
