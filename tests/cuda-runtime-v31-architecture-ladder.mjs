import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const workflow = await readFile(new URL("../.github/workflows/physical-cuda-v31-architecture-ladder.yml", import.meta.url), "utf8");
const runner = await readFile(new URL("../scripts/run_cuda_runtime_v31_architecture_profile.sh", import.meta.url), "utf8");
const verifier = await readFile(new URL("../scripts/verify_cuda_v1_campaign.py", import.meta.url), "utf8");
const finalizerUrl = new URL("../scripts/finalize_cuda_runtime_v31_architecture.py", import.meta.url);
const finalizer = await readFile(finalizerUrl, "utf8");
const comparatorUrl = new URL("../scripts/compare_cuda_runtime_v31_architecture_results.py", import.meta.url);
const comparator = await readFile(comparatorUrl, "utf8");
const docs = await readFile(new URL("../docs/CUDA_RUNTIME_V31_ARCHITECTURE_LADDER.md", import.meta.url), "utf8");
const contract = JSON.parse(await readFile(new URL("../docs/CUDA_RUNTIME_V31_ARCHITECTURE_LADDER.json", import.meta.url), "utf8"));
const profiles = JSON.parse(await readFile(new URL("../docs/CUDA_RUNTIME_V31_ARCHITECTURE_PROFILES.json", import.meta.url), "utf8"));
const runtimeV2 = await readFile(new URL("../native/cuda/gluball_runtime_v2.cu", import.meta.url));
const runtimeV3 = await readFile(new URL("../native/cuda/gluball_runtime_v3.cu", import.meta.url));
const runtimeV31 = await readFile(new URL("../native/cuda/gluball_runtime_v31.cu", import.meta.url));

const gitBlobSha = (content) => {
  const header = Buffer.from(`blob ${content.length}\0`);
  return createHash("sha1").update(Buffer.concat([header, content])).digest("hex");
};

const fullProfileOrder = ["titan-xp", "v100", "t4", "a100", "h200", "b200"];
const postPr20Profiles = ["v100", "t4", "a100", "h200", "b200"];
const expectedDefinitions = {
  "titan-xp": ["^(?:NVIDIA )?TITAN Xp$", "6.1", "sm_61", "Pascal"],
  v100: ["^(?:NVIDIA )?(?:Tesla )?V100(?:[- ].*)?$", "7.0", "sm_70", "Volta"],
  t4: ["^(?:NVIDIA )?(?:Tesla )?T4(?:[- ].*)?$", "7.5", "sm_75", "Turing"],
  a100: ["^(?:NVIDIA )?(?:Tesla )?A100(?:[- ].*)?$", "8.0", "sm_80", "Ampere"],
  h200: ["^(?:NVIDIA )?(?:Tesla )?H200(?:[- ].*)?$", "9.0", "sm_90", "Hopper"],
  b200: ["^(?:NVIDIA )?(?:Tesla )?B200(?:[- ].*)?$", "10.0", "sm_100", "Blackwell"],
};

assert.match(workflow, /^name: GLUBALL Runtime V3\.1 architecture ladder/m);
assert.match(workflow, /workflow_dispatch:/);
assert.doesNotMatch(workflow, /^\s+push:/m);
assert.doesNotMatch(workflow, /^\s+pull_request:/m);
assert.match(workflow, /target_profile:/);
for (const profile of fullProfileOrder) assert.match(workflow, new RegExp(`- ${profile.replace("-", "\\-")}`));
assert.match(workflow, /default: "v100"/);
assert.match(workflow, /PROFILE_REGISTRY: docs\/CUDA_RUNTIME_V31_ARCHITECTURE_PROFILES\.json/);
assert.match(workflow, /Validate architecture profile registry/);
assert.match(workflow, /expected_model_regex_case_insensitive/);
assert.match(workflow, /re\.compile/);
assert.match(workflow, /gluball-vast-v31-architecture/);
assert.doesNotMatch(workflow, /MODEL_FRAGMENT=/);
assert.match(workflow, /continue-on-error: true/);
assert.match(workflow, /inputs\.target_profile.*github\.run_id.*github\.run_attempt/s);
assert.match(workflow, /CAMPAIGN_OUTCOME: \$\{\{ steps\.campaign\.outcome \}\}/);
assert.match(workflow, /CAMPAIGN_OUTCOME.*success/s);
assert.match(workflow, /sha256sum -c BUNDLE_SHA256SUMS\.txt/);
assert.match(workflow, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/);
assert.match(workflow, /Require final PASS/);

assert.match(runner, /PROFILE_REGISTRY=.*CUDA_RUNTIME_V31_ARCHITECTURE_PROFILES\.json/);
assert.match(runner, /profile_field\(\)/);
assert.match(runner, /expected_model_regex_case_insensitive/);
assert.match(runner, /re\.fullmatch\(pattern, model, flags=re\.IGNORECASE\)/);
assert.match(runner, /expected_compute_capability/);
assert.match(runner, /expected_sm/);
assert.match(runner, /ARCHITECTURE_FAMILY/);
assert.match(runner, /PROFILE_DEFINITION\.json/);
assert.match(runner, /FROZEN_RUNTIME_SOURCE_VALIDATION\.json/);
assert.match(runner, /FROZEN_RUNTIME_SOURCES\.ok/);
assert.match(runner, /git", "hash-object"/);
assert.match(runner, /12d49ec6f78a28ed8d6afb5e8c7df80961c8bfc1/);
assert.match(runner, /dc8e9b209abee3794e5e56d0b92fa6d40dd03fd0/);
assert.match(runner, /045fbf37725beb5d65b2332309626ccfa727f874/);
assert.match(runner, /unexpected compute capability/);
assert.match(runner, /profile native SM mismatch/);
assert.match(runner, /--query-gpu=index,name,driver_version,compute_cap,memory\.total/);
assert.doesNotMatch(runner, /nvidia-smi\s+-L/);
assert.doesNotMatch(runner, /--query-gpu=[^\n]*uuid/i);
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

assert.match(finalizer, /validated_profile_definition/);
assert.match(finalizer, /profile_definition.*profile_definition is not None/s);
assert.match(finalizer, /profile_definition_valid/);
assert.match(finalizer, /frozen_runtime_sources/);
assert.match(finalizer, /FROZEN_RUNTIME_SOURCE_VALIDATION\.json/);
assert.match(finalizer, /gluball-cuda-runtime-v31-architecture-result\/1/);
assert.match(finalizer, /cross_device_digest_equality_required.*False/s);
assert.match(finalizer, /within_device_v3_v31_digest_equality_required.*True/s);
assert.match(finalizer, /raw_float_bit_digest_is_geometry_authority.*False/s);
assert.match(finalizer, /universal_speedup_claim.*False/s);
assert.match(finalizer, /raw_device_uuid_published.*False/s);
assert.match(finalizer, /cross_device_portability_claim.*False/s);
assert.match(finalizer, /compiler_resource_telemetry_is_graduation_gate.*False/s);

assert.match(comparator, /CUDA_RUNTIME_V31_ARCHITECTURE_PROFILES\.json/);
assert.match(comparator, /re\.fullmatch\(model_pattern, model, flags=re\.IGNORECASE\)/);
assert.match(comparator, /GPU model does not match profile registry/);
assert.match(comparator, /embedded profile definition does not match profile registry/);
assert.match(comparator, /compute capability does not match profile registry/);
assert.match(comparator, /native SM does not match profile registry/);
assert.match(comparator, /physical preflight graduation stage missing/);
assert.match(comparator, /physical preflight receipt missing/);
assert.match(comparator, /frozen measured build-input graduation stage missing/);
assert.match(comparator, /frozen measured build-input receipt missing/);
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

assert.equal(profiles.schema, "gluball-cuda-runtime-v31-architecture-profiles/1");
assert.deepEqual(profiles.profile_order, fullProfileOrder);
assert.deepEqual(Object.keys(profiles.profiles), fullProfileOrder);
for (const [profile, [pattern, cc, sm, family]] of Object.entries(expectedDefinitions)) {
  const definition = profiles.profiles[profile];
  assert.equal(definition.expected_model_regex_case_insensitive, pattern);
  assert.equal(definition.expected_compute_capability, cc);
  assert.equal(definition.expected_sm, sm);
  assert.equal(definition.architecture_family, family);
  assert.doesNotThrow(() => new RegExp(pattern, "i"));
}
assert.equal(new RegExp(profiles.profiles.v100.expected_model_regex_case_insensitive, "i").test("NVIDIA Tesla V100-PCIE-16GB"), true);
assert.equal(new RegExp(profiles.profiles.v100.expected_model_regex_case_insensitive, "i").test("NVIDIA Quadro GV100"), false);
assert.equal(profiles.measurement_boundary.runtime_source_frozen_during_post_pr20_measurement, true);
assert.equal(profiles.measurement_boundary.same_merged_source_commit_required_for_post_pr20_comparison, true);
assert.equal(profiles.measurement_boundary.model_regex_must_match_profile_definition, true);
assert.equal(profiles.measurement_boundary.cross_device_digest_equality_required, false);
assert.equal(profiles.measurement_boundary.within_device_v3_v31_digest_equality_required, true);
assert.equal(profiles.measurement_boundary.raw_device_uuid_published, false);

assert.equal(contract.contract, "GLUBALL-CUDA-RUNTIME-V3.1-ARCHITECTURE-LADDER");
assert.equal(contract.profile_registry, "docs/CUDA_RUNTIME_V31_ARCHITECTURE_PROFILES.json");
assert.equal(contract.runner_label, "gluball-vast-v31-architecture");
assert.equal(contract.canonical_workload.fixed_across_profiles, true);
assert.equal(contract.completed_baseline.physical_run_id, 33453555600);
assert.equal(contract.completed_baseline.artifact_id, 9780653297);
assert.equal(contract.completed_pascal_followup.physical_run_id, 33462064226);
assert.equal(contract.completed_pascal_followup.artifact_id, 9783551996);
assert.equal(contract.completed_pascal_followup.best_observed_candidate.block_size, 256);
assert.equal(contract.completed_pascal_followup.best_observed_candidate.cuda_graphs, "off");
assert.equal(contract.completed_pascal_followup.best_observed_candidate.reduction_mode, "atomic");
assert.deepEqual(contract.post_pr20_measurement_profiles, postPr20Profiles);
assert.deepEqual(contract.post_pr20_expected_sm_ladder, ["sm_70", "sm_75", "sm_80", "sm_90", "sm_100"]);
assert.equal(contract.measurement_source_policy.run_all_post_pr20_profiles_from_same_merged_main_commit, true);
assert.equal(contract.measurement_source_policy.modify_runtime_source_between_profiles, false);
assert.equal(contract.measurement_source_policy.physical_runner_recomputes_frozen_git_blob_ids, true);
assert.equal(contract.measurement_source_policy.physical_runner_requires_contract_frozen_map_match, true);
assert.equal(contract.measurement_source_policy.frozen_source_validation_is_graduation_gate, true);
assert.equal(contract.compiler_resource_telemetry.graduation_gate, false);
assert.equal(contract.comparison_boundary.profile_registry_identity_validation_required, true);
assert.equal(contract.comparison_boundary.cross_device_digest_equality_required, false);
assert.equal(contract.comparison_boundary.within_device_v3_v31_digest_equality_required, true);
assert.equal(contract.claim_boundary.geometry_receipt_authority, false);
assert.equal(contract.claim_boundary.universal_speedup_claim, false);
assert.equal(contract.claim_boundary.raw_device_uuid_published, false);

assert.equal(gitBlobSha(runtimeV2), contract.frozen_runtime_source_blobs.runtime_v2);
assert.equal(gitBlobSha(runtimeV3), contract.frozen_runtime_source_blobs.runtime_v3);
assert.equal(gitBlobSha(runtimeV31), contract.frozen_runtime_source_blobs.runtime_v31);

assert.match(docs, /sm_70\s+V100/);
assert.match(docs, /sm_75\s+T4/);
assert.match(docs, /sm_80\s+A100/);
assert.match(docs, /sm_90\s+H200/);
assert.match(docs, /sm_100\s+B200/);
assert.match(docs, /v100 -> t4 -> a100 -> h200 -> b200/);
assert.match(docs, /Marketplace instance IDs, prices and availability are external rental logistics/);
assert.match(docs, /cross_device_digest_equality_required:\s+false/);
assert.match(docs, /within_device_v3_v31_digest_equality:\s+required/);

const canonicalWorkload = {
  u_segments: 16384,
  v_segments: 128,
  repeats: 1,
  warmup_iterations: 20,
  measured_iterations: 1000,
  trials_per_candidate: 3,
  fixed_across_profiles: true,
};

const makePreflight = (profile, model, cc, index = 0) => ({
  schema: "gluball-cuda-runtime-v31-physical-preflight/1",
  status: "PASS",
  profile,
  canonical_workload_expected: { ...canonicalWorkload },
  canonical_workload_observed: { ...canonicalWorkload },
  canonical_workload_match: true,
  full_gpu_required: true,
  required_nvidia_smi_visible_gpu_count: 1,
  nvidia_smi_visible_gpu_count: 1,
  single_visible_gpu_verified: true,
  cuda_device_ordinal: 0,
  cuda_ordinal_zero_mapping_unambiguous: true,
  selected_nvidia_smi_index: index,
  cuda_visible_devices_set: false,
  cuda_visible_devices_value_published: false,
  mig_capable_profile: Number(cc.split(".")[0]) >= 8,
  mig_query_supported: Number(cc.split(".")[0]) >= 8,
  mig_query_exit_code: 0,
  mig_query_error: null,
  identity_query_exit_code: 0,
  identity_query_error: null,
  mig_mode_current: Number(cc.split(".")[0]) >= 8 ? "Disabled" : "not-applicable-query-unavailable",
  mig_mode_acceptable: true,
  mig_enabled: false,
  mig_partition_observed: false,
  safe_gpu_inventory: {
    index,
    name: model,
    compute_capability: cc,
    memory_total_mib: "16384",
  },
  profile_model_match: true,
  profile_compute_capability_match: true,
  performance_observation_only: true,
  geometry_receipt_authority: false,
  universal_speedup_claim: false,
  raw_device_uuid_queried: false,
  raw_device_uuid_published: false,
});

const makeBuildReceipt = () => ({
  schema: "gluball-cuda-runtime-v31-frozen-build-input-validation/1",
  status: "PASS",
  contract_path: "docs/CUDA_RUNTIME_V31_ARCHITECTURE_LADDER.json",
  contract_matches_frozen_expected_map: true,
  expected_git_blob_ids: structuredClone(contract.frozen_measured_build_inputs),
  observed_git_blob_ids: structuredClone(contract.frozen_measured_build_inputs),
  build_input_matches_expected: Object.fromEntries(
    Object.keys(contract.frozen_measured_build_inputs).map((key) => [key, true]),
  ),
  includes_cuda_cmake_target_definition: true,
  includes_event_timing_compat_header: true,
  measured_build_inputs_frozen_during_measurement: true,
  performance_observation_only: true,
  geometry_receipt_authority: false,
  universal_speedup_claim: false,
});

const temp = await mkdtemp(join(tmpdir(), "gluball-v31-arch-"));
try {
  const base = {
    schema: "gluball-cuda-runtime-v31-architecture-result/1",
    status: "PASS",
    profile: "v100",
    profile_definition: profiles.profiles.v100,
    source_commit: "a".repeat(40),
    gpu: { model: "NVIDIA Tesla V100-PCIE-16GB", compute_capability: "7.0", expected_sm: "sm_70" },
    canonical_workload: { ...canonicalWorkload },
    required_stages: { physical_preflight: true, frozen_measured_build_inputs: true },
    physical_preflight_validation: makePreflight("v100", "NVIDIA Tesla V100-PCIE-16GB", "7.0"),
    frozen_measured_build_input_validation: makeBuildReceipt(),
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
  right.profile_definition = profiles.profiles.h200;
  right.gpu = { model: "NVIDIA H200 NVL", compute_capability: "9.0", expected_sm: "sm_90" };
  right.physical_preflight_validation = makePreflight("h200", "NVIDIA H200 NVL", "9.0");
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
  assert.equal(compared.physical_preflight_required, true);
  assert.equal(compared.frozen_measured_build_inputs_required, true);

  const missingPreflight = JSON.parse(JSON.stringify(base));
  delete missingPreflight.physical_preflight_validation;
  assert.notEqual((await runComparator(missingPreflight, right)).status, 0);

  const missingPreflightStage = JSON.parse(JSON.stringify(base));
  delete missingPreflightStage.required_stages.physical_preflight;
  assert.notEqual((await runComparator(missingPreflightStage, right)).status, 0);

  const missingBuildReceipt = JSON.parse(JSON.stringify(base));
  delete missingBuildReceipt.frozen_measured_build_input_validation;
  assert.notEqual((await runComparator(missingBuildReceipt, right)).status, 0);

  const missingBuildStage = JSON.parse(JSON.stringify(base));
  delete missingBuildStage.required_stages.frozen_measured_build_inputs;
  assert.notEqual((await runComparator(missingBuildStage, right)).status, 0);

  const mismatchedBuildReceipt = JSON.parse(JSON.stringify(base));
  mismatchedBuildReceipt.frozen_measured_build_input_validation.observed_git_blob_ids[
    "native/cuda/gluball_runtime_v2_event_compat.cuh"
  ] = "0".repeat(40);
  assert.notEqual((await runComparator(mismatchedBuildReceipt, right)).status, 0);

  const mismatchedPreflightModel = JSON.parse(JSON.stringify(base));
  mismatchedPreflightModel.physical_preflight_validation.safe_gpu_inventory.name = "NVIDIA Tesla T4";
  assert.notEqual((await runComparator(mismatchedPreflightModel, right)).status, 0);

  const gv100 = JSON.parse(JSON.stringify(base));
  gv100.gpu.model = "NVIDIA Quadro GV100";
  assert.notEqual((await runComparator(gv100, right)).status, 0);

  const missingCommit = JSON.parse(JSON.stringify(base));
  delete missingCommit.source_commit;
  assert.notEqual((await runComparator(missingCommit, right)).status, 0);

  const missingWorkload = JSON.parse(JSON.stringify(base));
  delete missingWorkload.canonical_workload.measured_iterations;
  assert.notEqual((await runComparator(missingWorkload, right)).status, 0);

  const missingDigest = JSON.parse(JSON.stringify(base));
  delete missingDigest.atomic_equivalence.diagnostic_digests.v31;
  assert.notEqual((await runComparator(missingDigest, right)).status, 0);

  const wrongCapability = JSON.parse(JSON.stringify(base));
  wrongCapability.gpu.compute_capability = "7.5";
  assert.notEqual((await runComparator(wrongCapability, right)).status, 0);

  const wrongSm = JSON.parse(JSON.stringify(base));
  wrongSm.gpu.expected_sm = "sm_75";
  assert.notEqual((await runComparator(wrongSm, right)).status, 0);

  const wrongDefinition = JSON.parse(JSON.stringify(base));
  wrongDefinition.profile_definition.expected_sm = "sm_75";
  assert.notEqual((await runComparator(wrongDefinition, right)).status, 0);

  const finalizerRoot = join(temp, "finalizer-invalid-profile");
  await mkdir(join(finalizerRoot, "ab-atomic"), { recursive: true });
  await mkdir(join(finalizerRoot, "ab-two-stage"), { recursive: true });
  await mkdir(join(finalizerRoot, "tuning"), { recursive: true });
  for (const file of ["FROZEN_RUNTIME_SOURCES.ok", "HOST_VALIDATION.ok", "V1_VALIDATION.ok", "V31_SANITIZER.ok"]) {
    await writeFile(join(finalizerRoot, file), "ok\n");
  }
  await writeFile(join(finalizerRoot, "ab-atomic", "EQUIVALENCE.json"), "{}\n");
  await writeFile(join(finalizerRoot, "ab-two-stage", "EQUIVALENCE.json"), "{}\n");
  await writeFile(join(finalizerRoot, "tuning", "TUNING_RESULT.json"), "{}\n");
  await writeFile(join(finalizerRoot, "PROFILE_DEFINITION.json"), JSON.stringify({
    schema: "gluball-cuda-runtime-v31-architecture-profile-definition/1",
    profile: "v100",
    definition: { expected_compute_capability: "7.0" },
  }));
  const finalized = spawnSync("python3", [
    finalizerUrl.pathname,
    finalizerRoot,
    "--profile", "v100",
    "--u", "16384",
    "--v", "128",
    "--warmup", "20",
    "--iterations", "1000",
    "--trials", "3",
  ], { encoding: "utf8" });
  assert.notEqual(finalized.status, 0);
  const invalidStatus = JSON.parse(await readFile(join(finalizerRoot, "VALIDATION_STATUS.json"), "utf8"));
  assert.equal(invalidStatus.status, "FAIL");
  assert.equal(invalidStatus.profile_definition_valid, false);
  assert.equal(invalidStatus.required_markers.profile_definition, false);
} finally {
  await rm(temp, { recursive: true, force: true });
}

console.log("GLUBALL Runtime V3.1 architecture ladder: PASS");