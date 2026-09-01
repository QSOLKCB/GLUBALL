// SPDX-License-Identifier: MPL-2.0
// Regression coverage for late PR #20 receipt-boundary review findings.

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = new URL("../", import.meta.url);
const preflightBinder = new URL("../scripts/bind_cuda_runtime_v31_physical_preflight.py", import.meta.url).pathname;
const buildBinder = new URL("../scripts/bind_cuda_runtime_v31_frozen_build_inputs.py", import.meta.url).pathname;
const comparator = new URL("../scripts/compare_cuda_runtime_v31_architecture_results.py", import.meta.url).pathname;
const finalizer = new URL("../scripts/finalize_cuda_runtime_v31_architecture.py", import.meta.url).pathname;
const runner = await readFile(new URL("../scripts/run_cuda_runtime_v31_architecture_profile.sh", import.meta.url), "utf8");
const contract = JSON.parse(await readFile(new URL("../docs/CUDA_RUNTIME_V31_ARCHITECTURE_LADDER.json", import.meta.url), "utf8"));
const profiles = JSON.parse(await readFile(new URL("../docs/CUDA_RUNTIME_V31_ARCHITECTURE_PROFILES.json", import.meta.url), "utf8"));

const canonical = {
  u_segments: 16384,
  v_segments: 128,
  repeats: 1,
  warmup_iterations: 20,
  measured_iterations: 1000,
  trials_per_candidate: 3,
  fixed_across_profiles: true,
};

const clone = (value) => structuredClone(value);

const makePreflight = (profile, model, cc) => ({
  schema: "gluball-cuda-runtime-v31-physical-preflight/1",
  status: "PASS",
  profile,
  canonical_workload_expected: clone(canonical),
  canonical_workload_observed: clone(canonical),
  canonical_workload_match: true,
  full_gpu_required: true,
  required_nvidia_smi_visible_gpu_count: 1,
  nvidia_smi_visible_gpu_count: 1,
  single_visible_gpu_verified: true,
  cuda_device_ordinal: 0,
  cuda_ordinal_zero_mapping_unambiguous: true,
  selected_nvidia_smi_index: 0,
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
    index: 0,
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
  expected_git_blob_ids: clone(contract.frozen_measured_build_inputs),
  observed_git_blob_ids: clone(contract.frozen_measured_build_inputs),
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

const makeFrozenSourceReceipt = () => ({
  schema: "gluball-cuda-runtime-v31-frozen-source-validation/1",
  status: "PASS",
  contract_path: "docs/CUDA_RUNTIME_V31_ARCHITECTURE_LADDER.json",
  contract_matches_frozen_expected_map: true,
  expected_git_blob_ids: clone(contract.frozen_runtime_source_blobs),
  observed_git_blob_ids: clone(contract.frozen_runtime_source_blobs),
  source_matches_expected: Object.fromEntries(
    Object.keys(contract.frozen_runtime_source_blobs).map((key) => [key, true]),
  ),
  runtime_source_frozen_during_measurement: true,
  performance_observation_only: true,
  geometry_receipt_authority: false,
  universal_speedup_claim: false,
});

const makeArchitectureResult = (profile, model, cc, sm, digest) => ({
  schema: "gluball-cuda-runtime-v31-architecture-result/1",
  status: "PASS",
  profile,
  profile_definition: clone(profiles.profiles[profile]),
  source_commit: "a".repeat(40),
  gpu: { model, compute_capability: cc, expected_sm: sm },
  canonical_workload: clone(canonical),
  required_stages: { physical_preflight: true, frozen_measured_build_inputs: true },
  physical_preflight_validation: makePreflight(profile, model, cc),
  frozen_measured_build_input_validation: makeBuildReceipt(),
  bounded_tuning: {
    status: "PASS",
    best_observed_candidate_within_declared_set: {
      observed_wall_milliseconds_median_of_trials: 0.1,
    },
  },
  atomic_equivalence: {
    status: "PASS",
    shared_observation_equivalence: true,
    v3_v31_exact_digest_equivalence: true,
    diagnostic_digests: { v31: digest },
  },
});

const makeBinderRoot = async (base, name) => {
  const root = join(base, name);
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "VALIDATION_STATUS.json"), JSON.stringify({
    schema: "gluball-runtime-v31-architecture-status/1",
    status: "PASS",
    profile: "v100",
    required_markers: {},
    completed_required_stages: [],
    first_incomplete_required_stage: null,
  }));
  await writeFile(join(root, "ARCHITECTURE_RESULT.json"), JSON.stringify({
    schema: "gluball-cuda-runtime-v31-architecture-result/1",
    status: "PASS",
    profile: "v100",
    required_stages: {},
    completed_required_stages: [],
    first_incomplete_required_stage: null,
  }));
  return root;
};

const runBinder = async (binder, root, receipt) => {
  const receiptPath = join(root, "receipt.json");
  await writeFile(receiptPath, JSON.stringify(receipt));
  return spawnSync("python3", [binder, root, receiptPath], { encoding: "utf8" });
};

const populateFinalizerRoot = async (root, definition, frozenReceipt) => {
  await mkdir(join(root, "ab-atomic"), { recursive: true });
  await mkdir(join(root, "ab-two-stage"), { recursive: true });
  await mkdir(join(root, "tuning"), { recursive: true });
  for (const name of ["FROZEN_RUNTIME_SOURCES.ok", "HOST_VALIDATION.ok", "V1_VALIDATION.ok", "V31_SANITIZER.ok"]) {
    await writeFile(join(root, name), "ok\n");
  }
  await writeFile(join(root, "PROFILE_DEFINITION.json"), JSON.stringify({
    schema: "gluball-cuda-runtime-v31-architecture-profile-definition/1",
    profile: "v100",
    definition,
  }));
  await writeFile(join(root, "FROZEN_RUNTIME_SOURCE_VALIDATION.json"), JSON.stringify(frozenReceipt));
  await writeFile(join(root, "ab-atomic", "EQUIVALENCE.json"), "{}\n");
  await writeFile(join(root, "ab-two-stage", "EQUIVALENCE.json"), "{}\n");
  await writeFile(join(root, "tuning", "TUNING_RESULT.json"), "{}\n");
};

const runFinalizer = (root) => spawnSync("python3", [
  finalizer,
  root,
  "--profile", "v100",
  "--u", "16384",
  "--v", "128",
  "--warmup", "20",
  "--iterations", "1000",
  "--trials", "3",
], { encoding: "utf8" });

const temp = await mkdtemp(join(tmpdir(), "gluball-v31-receipt-boundary-"));
try {
  // Preflight binder must require the performance-only boundary exactly.
  const goodPreflight = makePreflight("v100", "NVIDIA Tesla V100-PCIE-16GB", "7.0");
  {
    const root = await makeBinderRoot(temp, "preflight-good");
    assert.equal((await runBinder(preflightBinder, root, goodPreflight)).status, 0);
  }
  for (const [name, mutate] of [
    ["missing", (r) => { delete r.performance_observation_only; }],
    ["false", (r) => { r.performance_observation_only = false; }],
  ]) {
    const root = await makeBinderRoot(temp, `preflight-${name}`);
    const receipt = clone(goodPreflight);
    mutate(receipt);
    const result = await runBinder(preflightBinder, root, receipt);
    assert.notEqual(result.status, 0, `preflight binder must reject ${name} performance_observation_only`);
    const status = JSON.parse(await readFile(join(root, "VALIDATION_STATUS.json"), "utf8"));
    assert.equal(status.status, "FAIL");
    assert.equal(status.required_markers.physical_preflight, false);
  }

  // Build-input binder must enforce the same observation boundary.
  const goodBuild = makeBuildReceipt();
  {
    const root = await makeBinderRoot(temp, "build-good");
    assert.equal((await runBinder(buildBinder, root, goodBuild)).status, 0);
  }
  for (const [name, mutate] of [
    ["missing", (r) => { delete r.performance_observation_only; }],
    ["false", (r) => { r.performance_observation_only = false; }],
  ]) {
    const root = await makeBinderRoot(temp, `build-${name}`);
    const receipt = clone(goodBuild);
    mutate(receipt);
    const result = await runBinder(buildBinder, root, receipt);
    assert.notEqual(result.status, 0, `build binder must reject ${name} performance_observation_only`);
    const status = JSON.parse(await readFile(join(root, "VALIDATION_STATUS.json"), "utf8"));
    assert.equal(status.status, "FAIL");
    assert.equal(status.required_markers.frozen_measured_build_inputs, false);
  }

  // Comparator must reject a falsified or absent performance-only preflight receipt.
  const left = makeArchitectureResult("v100", "NVIDIA Tesla V100-PCIE-16GB", "7.0", "sm_70", "0123456789abcdef");
  const right = makeArchitectureResult("a100", "NVIDIA A100-SXM4-40GB", "8.0", "sm_80", "fedcba9876543210");
  const leftPath = join(temp, "left.json");
  const rightPath = join(temp, "right.json");
  await writeFile(leftPath, JSON.stringify(left));
  await writeFile(rightPath, JSON.stringify(right));
  assert.equal(spawnSync("python3", [comparator, leftPath, rightPath], { encoding: "utf8" }).status, 0);
  for (const [name, mutate] of [
    ["missing", (r) => { delete r.physical_preflight_validation.performance_observation_only; }],
    ["false", (r) => { r.physical_preflight_validation.performance_observation_only = false; }],
  ]) {
    const bad = clone(left);
    mutate(bad);
    await writeFile(leftPath, JSON.stringify(bad));
    assert.notEqual(
      spawnSync("python3", [comparator, leftPath, rightPath], { encoding: "utf8" }).status,
      0,
      `comparator must reject ${name} preflight performance_observation_only`,
    );
  }

  // Finalizer must require the full-GPU profile declaration and frozen-source performance boundary.
  const goodFinalizerRoot = join(temp, "finalizer-good");
  await populateFinalizerRoot(goodFinalizerRoot, clone(profiles.profiles.v100), makeFrozenSourceReceipt());
  assert.equal(runFinalizer(goodFinalizerRoot).status, 0, "valid finalizer evidence root must PASS");

  for (const [name, mutateDefinition] of [
    ["missing-full-gpu", (d) => { delete d.requires_full_gpu; }],
    ["false-full-gpu", (d) => { d.requires_full_gpu = false; }],
  ]) {
    const root = join(temp, `finalizer-${name}`);
    const definition = clone(profiles.profiles.v100);
    mutateDefinition(definition);
    await populateFinalizerRoot(root, definition, makeFrozenSourceReceipt());
    assert.notEqual(runFinalizer(root).status, 0, `finalizer must reject ${name}`);
    const status = JSON.parse(await readFile(join(root, "VALIDATION_STATUS.json"), "utf8"));
    assert.equal(status.profile_definition_valid, false);
  }

  for (const [name, mutateReceipt] of [
    ["missing-performance-boundary", (r) => { delete r.performance_observation_only; }],
    ["false-performance-boundary", (r) => { r.performance_observation_only = false; }],
  ]) {
    const root = join(temp, `finalizer-${name}`);
    const receipt = makeFrozenSourceReceipt();
    mutateReceipt(receipt);
    await populateFinalizerRoot(root, clone(profiles.profiles.v100), receipt);
    assert.notEqual(runFinalizer(root).status, 0, `finalizer must reject ${name}`);
    const status = JSON.parse(await readFile(join(root, "VALIDATION_STATUS.json"), "utf8"));
    assert.equal(status.frozen_runtime_source_validation_valid, false);
  }

  // Runner must emit the boundary the stricter finalizer now requires.
  assert.match(
    runner,
    /runtime_source_frozen_during_measurement\"\s*:\s*True,[\s\S]*?performance_observation_only\"\s*:\s*True,[\s\S]*?geometry_receipt_authority\"\s*:\s*False/,
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}

console.log("GLUBALL Runtime V3.1 receipt boundary hardening: PASS");
