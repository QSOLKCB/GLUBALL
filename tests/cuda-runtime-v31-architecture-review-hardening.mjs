import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = new URL("../", import.meta.url).pathname;
const comparator = new URL("../scripts/compare_cuda_runtime_v31_architecture_results.py", import.meta.url).pathname;
const verifier = new URL("../scripts/verify_cuda_runtime_v31_frozen_build_inputs.py", import.meta.url).pathname;
const binder = new URL("../scripts/bind_cuda_runtime_v31_frozen_build_inputs.py", import.meta.url).pathname;
const workflow = await readFile(new URL("../.github/workflows/physical-cuda-v31-architecture-ladder.yml", import.meta.url), "utf8");
const contract = JSON.parse(await readFile(new URL("../docs/CUDA_RUNTIME_V31_ARCHITECTURE_LADDER.json", import.meta.url), "utf8"));
const profiles = JSON.parse(await readFile(new URL("../docs/CUDA_RUNTIME_V31_ARCHITECTURE_PROFILES.json", import.meta.url), "utf8"));

for (const [profile, definition] of Object.entries(profiles.profiles)) {
  assert.equal(typeof definition.status, "string", `${profile} status type`);
  assert.notEqual(definition.status.length, 0, `${profile} status non-empty`);
}

assert.deepEqual(contract.frozen_measured_build_inputs, {
  "native/cuda/CMakeLists.txt": "c752caed1c972a680c3cf404657c8e9f9562663e",
  "native/cuda/gluball_runtime_v2.cu": "12d49ec6f78a28ed8d6afb5e8c7df80961c8bfc1",
  "native/cuda/gluball_runtime_v2_event_compat.cuh": "2be5d30b9d55552214f977b5057bcaf364b59192",
  "native/cuda/gluball_runtime_v3.cu": "dc8e9b209abee3794e5e56d0b92fa6d40dd03fd0",
  "native/cuda/gluball_runtime_v31.cu": "045fbf37725beb5d65b2332309626ccfa727f874",
});
assert.equal(contract.measurement_source_policy.workflow_verifies_complete_measured_build_input_map_before_campaign, true);
assert.equal(contract.measurement_source_policy.measured_build_input_receipt_bound_into_uploaded_bundle, true);
assert.equal(contract.measurement_source_policy.measured_build_input_validation_is_workflow_graduation_gate, true);
assert.equal(contract.comparison_boundary.profile_lifecycle_status_schema_validation_required, true);
assert.equal(contract.comparison_boundary.profile_lifecycle_status_is_identity, false);

assert.match(workflow, /Verify frozen measured Runtime build inputs/);
assert.match(workflow, /verify_cuda_runtime_v31_frozen_build_inputs\.py/);
assert.match(workflow, /Bind frozen measured build-input receipt/);
assert.match(workflow, /bind_cuda_runtime_v31_frozen_build_inputs\.py/);
assert.match(workflow, /FROZEN_MEASURED_BUILD_INPUT_VALIDATION\.json/);
assert.match(workflow, /frozen_measured_build_inputs/);
assert.ok(
  workflow.indexOf("Verify frozen measured Runtime build inputs") < workflow.indexOf("Run Runtime V3.1 architecture profile"),
  "build-input verification must precede the physical campaign",
);
assert.ok(
  workflow.indexOf("Bind frozen measured build-input receipt") < workflow.indexOf("Upload architecture evidence bundle"),
  "build-input receipt must be bound before artifact upload",
);

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

const temp = await mkdtemp(join(tmpdir(), "gluball-v31-review-hardening-"));
try {
  const common = {
    schema: "gluball-cuda-runtime-v31-architecture-result/1",
    status: "PASS",
    source_commit: "a".repeat(40),
    canonical_workload: { ...canonicalWorkload },
    required_stages: { physical_preflight: true },
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
  const left = {
    ...structuredClone(common),
    profile: "v100",
    profile_definition: structuredClone(profiles.profiles.v100),
    gpu: { model: "NVIDIA Tesla V100-PCIE-16GB", compute_capability: "7.0", expected_sm: "sm_70" },
    physical_preflight_validation: makePreflight("v100", "NVIDIA Tesla V100-PCIE-16GB", "7.0"),
  };
  const right = {
    ...structuredClone(common),
    profile: "h200",
    profile_definition: structuredClone(profiles.profiles.h200),
    gpu: { model: "NVIDIA H200 NVL", compute_capability: "9.0", expected_sm: "sm_90" },
    physical_preflight_validation: makePreflight("h200", "NVIDIA H200 NVL", "9.0"),
  };
  right.atomic_equivalence.diagnostic_digests.v31 = "fedcba9876543210";

  const runComparator = async (leftPayload, rightPayload) => {
    const leftPath = join(temp, "left.json");
    const rightPath = join(temp, "right.json");
    await writeFile(leftPath, JSON.stringify(leftPayload));
    await writeFile(rightPath, JSON.stringify(rightPayload));
    return spawnSync("python3", [comparator, leftPath, rightPath], { encoding: "utf8" });
  };

  assert.equal((await runComparator(left, right)).status, 0);

  const missingPreflight = structuredClone(left);
  delete missingPreflight.physical_preflight_validation;
  assert.notEqual((await runComparator(missingPreflight, right)).status, 0);

  const invalidPreflight = structuredClone(left);
  invalidPreflight.physical_preflight_validation.cuda_ordinal_zero_mapping_unambiguous = false;
  assert.notEqual((await runComparator(invalidPreflight, right)).status, 0);

  const changedLifecycle = structuredClone(left);
  changedLifecycle.profile_definition.status = "completed-physical-run";
  assert.equal(
    (await runComparator(changedLifecycle, right)).status,
    0,
    "valid lifecycle status changes must not alter immutable profile identity",
  );

  const missingLifecycle = structuredClone(left);
  delete missingLifecycle.profile_definition.status;
  assert.notEqual((await runComparator(missingLifecycle, right)).status, 0);

  const invalidLifecycle = structuredClone(left);
  invalidLifecycle.profile_definition.status = 42;
  assert.notEqual((await runComparator(invalidLifecycle, right)).status, 0);

  const copiedRoot = join(temp, "copied-repo");
  const buildInputs = Object.keys(contract.frozen_measured_build_inputs);
  for (const relative of [...buildInputs, "docs/CUDA_RUNTIME_V31_ARCHITECTURE_LADDER.json"]) {
    const destination = join(copiedRoot, relative);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(join(repoRoot, relative), destination);
  }

  const goodReceipt = join(temp, "good-build-input-receipt.json");
  const goodVerify = spawnSync(
    "python3",
    [verifier, "--repo-root", copiedRoot, "--output", goodReceipt],
    { encoding: "utf8" },
  );
  assert.equal(goodVerify.status, 0, goodVerify.stderr);
  const goodPayload = JSON.parse(await readFile(goodReceipt, "utf8"));
  assert.equal(goodPayload.status, "PASS");
  assert.equal(goodPayload.includes_event_timing_compat_header, true);
  assert.equal(goodPayload.includes_cuda_cmake_target_definition, true);

  await writeFile(
    join(copiedRoot, "native/cuda/gluball_runtime_v2_event_compat.cuh"),
    "// deliberately tampered regression fixture\n",
  );
  const badReceipt = join(temp, "bad-build-input-receipt.json");
  const badVerify = spawnSync(
    "python3",
    [verifier, "--repo-root", copiedRoot, "--output", badReceipt],
    { encoding: "utf8" },
  );
  assert.notEqual(badVerify.status, 0);
  const badPayload = JSON.parse(await readFile(badReceipt, "utf8"));
  assert.equal(badPayload.status, "FAIL");
  assert.equal(
    badPayload.build_input_matches_expected["native/cuda/gluball_runtime_v2_event_compat.cuh"],
    false,
  );

  const evidenceRoot = join(temp, "evidence");
  await mkdir(evidenceRoot, { recursive: true });
  await writeFile(join(evidenceRoot, "VALIDATION_STATUS.json"), JSON.stringify({
    schema: "gluball-runtime-v31-architecture-status/1",
    status: "PASS",
    required_markers: {},
    completed_required_stages: [],
    first_incomplete_required_stage: null,
  }));
  await writeFile(join(evidenceRoot, "ARCHITECTURE_RESULT.json"), JSON.stringify({
    schema: "gluball-cuda-runtime-v31-architecture-result/1",
    status: "PASS",
    required_stages: {},
    completed_required_stages: [],
    first_incomplete_required_stage: null,
  }));
  const bound = spawnSync("python3", [binder, evidenceRoot, goodReceipt], { encoding: "utf8" });
  assert.equal(bound.status, 0, bound.stderr);
  const boundStatus = JSON.parse(await readFile(join(evidenceRoot, "VALIDATION_STATUS.json"), "utf8"));
  assert.equal(boundStatus.status, "PASS");
  assert.equal(boundStatus.required_markers.frozen_measured_build_inputs, true);
  assert.equal(boundStatus.frozen_measured_build_input_validation_valid, true);
  assert.equal(
    JSON.parse(await readFile(join(evidenceRoot, "ARCHITECTURE_RESULT.json"), "utf8")).required_stages.frozen_measured_build_inputs,
    true,
  );
  assert.ok((await readFile(join(evidenceRoot, "BUNDLE_SHA256SUMS.txt"), "utf8")).includes("FROZEN_MEASURED_BUILD_INPUT_VALIDATION.json"));
} finally {
  await rm(temp, { recursive: true, force: true });
}

console.log("GLUBALL Runtime V3.1 architecture review hardening: PASS");
