import assert from "node:assert/strict";
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const verifierUrl = new URL("../scripts/verify_cuda_runtime_v31_physical_preflight.py", import.meta.url);
const comparatorUrl = new URL("../scripts/compare_cuda_runtime_v31_architecture_results.py", import.meta.url);
const workflow = await readFile(new URL("../.github/workflows/physical-cuda-v31-architecture-ladder.yml", import.meta.url), "utf8");
const profiles = JSON.parse(await readFile(new URL("../docs/CUDA_RUNTIME_V31_ARCHITECTURE_PROFILES.json", import.meta.url), "utf8"));
const contract = JSON.parse(await readFile(new URL("../docs/CUDA_RUNTIME_V31_ARCHITECTURE_LADDER.json", import.meta.url), "utf8"));

const pythonProbe = spawnSync("python3", ["-c", "import sys; print(sys.executable)"], { encoding: "utf8" });
assert.equal(pythonProbe.status, 0, pythonProbe.stderr);
const python3 = pythonProbe.stdout.trim();
assert.ok(python3.length > 0);

for (const definition of Object.values(profiles.profiles)) {
  assert.equal(definition.requires_full_gpu, true);
  assert.match(definition.expected_compute_capability, /^[0-9]+\.[0-9]+$/);
  assert.equal(typeof definition.mig_capable, "boolean");
}
assert.equal(profiles.measurement_boundary.full_gpu_profiles_reject_mig_enabled_or_partitioned_devices, true);
assert.equal(profiles.measurement_boundary.mig_partition_profiles_supported, false);
assert.equal(profiles.measurement_boundary.mig_capability_must_match_profile_definition, true);
assert.equal(contract.measurement_source_policy.physical_preflight_receipt_required, true);
assert.equal(contract.measurement_source_policy.canonical_workload_exact_match_required_for_graduation, true);
assert.equal(contract.measurement_source_policy.full_gpu_profiles_reject_mig_enabled_or_partitioned_devices, true);
assert.equal(contract.comparison_boundary.exact_declared_canonical_workload_required, true);
assert.equal(contract.comparison_boundary.physical_preflight_validation_required_for_cross_profile_summary, true);
assert.equal(contract.comparison_boundary.frozen_measured_build_input_validation_required_for_cross_profile_summary, true);

// Free-form dispatch strings must reach the shell only through environment
// variables. Direct expression interpolation would allow shell metacharacters
// in an input to execute before the Python validator sees the value.
assert.match(workflow, /Verify full-GPU and canonical-workload preflight[\s\S]*?env:[\s\S]*?U: \$\{\{ inputs\.u_segments \}\}/);
assert.match(workflow, /V: \$\{\{ inputs\.v_segments \}\}/);
assert.match(workflow, /WARMUP: \$\{\{ inputs\.warmup_iterations \}\}/);
assert.match(workflow, /ITERATIONS: \$\{\{ inputs\.measured_iterations \}\}/);
assert.match(workflow, /TRIALS: \$\{\{ inputs\.trials \}\}/);
assert.match(workflow, /--u "\$U"/);
assert.match(workflow, /--v "\$V"/);
assert.match(workflow, /--warmup "\$WARMUP"/);
assert.match(workflow, /--iterations "\$ITERATIONS"/);
assert.match(workflow, /--trials "\$TRIALS"/);
assert.doesNotMatch(workflow, /--u\s+['"]?\$\{\{ inputs\.u_segments \}\}/);
assert.doesNotMatch(workflow, /--v\s+['"]?\$\{\{ inputs\.v_segments \}\}/);
assert.doesNotMatch(workflow, /--warmup\s+['"]?\$\{\{ inputs\.warmup_iterations \}\}/);
assert.doesNotMatch(workflow, /--iterations\s+['"]?\$\{\{ inputs\.measured_iterations \}\}/);
assert.doesNotMatch(workflow, /--trials\s+['"]?\$\{\{ inputs\.trials \}\}/);

const canonicalWorkload = {
  u_segments: 16384,
  v_segments: 128,
  repeats: 1,
  warmup_iterations: 20,
  measured_iterations: 1000,
  trials_per_candidate: 3,
  fixed_across_profiles: true,
};

const makePreflight = (profile, model, cc, index = 0) => {
  const migCapable = profiles.profiles[profile]?.mig_capable === true;
  return {
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
    mig_capable_profile: migCapable,
    mig_query_supported: migCapable,
    mig_query_exit_code: 0,
    mig_query_error: null,
    identity_query_exit_code: 0,
    identity_query_error: null,
    mig_mode_current: migCapable ? "Disabled" : "not-applicable-query-unavailable",
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
  };
};

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

const temp = await mkdtemp(join(tmpdir(), "gluball-v31-preflight-"));
try {
  const bin = join(temp, "bin");
  await mkdir(bin, { recursive: true });
  const nvidiaSmi = join(bin, "nvidia-smi");
  const baseEnv = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` };

  const writeFakeSmi = async (text) => {
    const escaped = text.replaceAll("'", "'\\''");
    await writeFile(nvidiaSmi, `#!/bin/sh\nprintf '%s\\n' '${escaped}'\n`);
    await chmod(nvidiaSmi, 0o755);
  };

  const writeFakeSmiSplit = async ({ fullQuery, identityQuery }) => {
    await writeFile(nvidiaSmi, `#!/bin/sh
case "$*" in
  *mig.mode.current*) ${fullQuery} ;;
  *) ${identityQuery} ;;
esac
`);
    await chmod(nvidiaSmi, 0o755);
  };

  const runPreflight = (suffix, extra = [], env = baseEnv) => {
    const output = join(temp, `preflight-${suffix}.json`);
    const args = [
      verifierUrl.pathname,
      "--profile", "a100",
      "--u", "16384",
      "--v", "128",
      "--warmup", "20",
      "--iterations", "1000",
      "--trials", "3",
      "--output", output,
      ...extra,
    ];
    const result = spawnSync(python3, args, { encoding: "utf8", env });
    return { result, output };
  };

  const runPreflightProfile = (suffix, profile, env = baseEnv, extra = []) => {
    const output = join(temp, `preflight-${suffix}.json`);
    const result = spawnSync(python3, [
      verifierUrl.pathname,
      "--profile", profile,
      "--u", "16384",
      "--v", "128",
      "--warmup", "20",
      "--iterations", "1000",
      "--trials", "3",
      "--output", output,
      ...extra,
    ], { encoding: "utf8", env });
    return { result, output };
  };

  await writeFakeSmi("7, NVIDIA A100-SXM4-40GB, 8.0, 40960, Disabled");
  const remappedEnv = { ...baseEnv, CUDA_VISIBLE_DEVICES: "7" };
  const fullGpu = runPreflight("full", [], remappedEnv);
  assert.equal(fullGpu.result.status, 0, fullGpu.result.stderr);
  const fullReceipt = JSON.parse(await readFile(fullGpu.output, "utf8"));
  assert.equal(fullReceipt.status, "PASS");
  assert.equal(fullReceipt.nvidia_smi_visible_gpu_count, 1);
  assert.equal(fullReceipt.single_visible_gpu_verified, true);
  assert.equal(fullReceipt.cuda_device_ordinal, 0);
  assert.equal(fullReceipt.cuda_ordinal_zero_mapping_unambiguous, true);
  assert.equal(fullReceipt.selected_nvidia_smi_index, 7);
  assert.equal(fullReceipt.cuda_visible_devices_set, true);
  assert.equal(fullReceipt.cuda_visible_devices_value_published, false);
  assert.equal(fullReceipt.mig_enabled, false);
  assert.equal(fullReceipt.mig_partition_observed, false);
  assert.equal(fullReceipt.canonical_workload_match, true);

  await writeFakeSmi([
    "0, NVIDIA Tesla T4, 7.5, 16384, N/A",
    "1, NVIDIA A100-SXM4-40GB, 8.0, 40960, Disabled",
  ].join("\n"));
  const ambiguous = runPreflight("ambiguous", [], { ...baseEnv, CUDA_VISIBLE_DEVICES: "1" });
  assert.notEqual(ambiguous.result.status, 0);
  const ambiguousReceipt = JSON.parse(await readFile(ambiguous.output, "utf8"));
  assert.equal(ambiguousReceipt.nvidia_smi_visible_gpu_count, 2);
  assert.equal(ambiguousReceipt.single_visible_gpu_verified, false);
  assert.equal(ambiguousReceipt.cuda_ordinal_zero_mapping_unambiguous, false);

  await writeFakeSmi("0, NVIDIA A100-SXM4-40GB, 8.0, 40960, Enabled");
  const mig = runPreflight("mig");
  assert.notEqual(mig.result.status, 0);
  const migReceipt = JSON.parse(await readFile(mig.output, "utf8"));
  assert.equal(migReceipt.status, "FAIL");
  assert.equal(migReceipt.mig_enabled, true);
  assert.equal(migReceipt.mig_mode_acceptable, false);

  await writeFakeSmi("0, NVIDIA A100-SXM4-40GB MIG 1g.5gb, 8.0, 5120, Disabled");
  const partition = runPreflight("partition");
  assert.notEqual(partition.result.status, 0);
  const partitionReceipt = JSON.parse(await readFile(partition.output, "utf8"));
  assert.equal(partitionReceipt.mig_partition_observed, true);

  await writeFakeSmi("0, NVIDIA A100-SXM4-40GB, 8.0, 40960, Disabled");
  const noncanonicalOutput = join(temp, "preflight-noncanonical.json");
  const noncanonical = spawnSync(python3, [
    verifierUrl.pathname,
    "--profile", "a100",
    "--u", "8192",
    "--v", "128",
    "--warmup", "20",
    "--iterations", "1000",
    "--trials", "3",
    "--output", noncanonicalOutput,
  ], { encoding: "utf8", env: baseEnv });
  assert.notEqual(noncanonical.status, 0);
  const noncanonicalReceipt = JSON.parse(await readFile(noncanonicalOutput, "utf8"));
  assert.equal(noncanonicalReceipt.status, "FAIL");
  assert.equal(noncanonicalReceipt.canonical_workload_match, false);

  // MIG-capable profile + unsupported MIG query must fail closed while the
  // 4-field identity fallback still resolves the single GPU correctly.
  await writeFakeSmiSplit({
    fullQuery: `echo 'Field "mig.mode.current" is not a valid field to query.' >&2; exit 6`,
    identityQuery: `printf '%s\\n' '0, NVIDIA A100-SXM4-40GB, 8.0, 40960'`,
  });
  const migQueryUnsupported = runPreflight("mig-query-unsupported");
  assert.notEqual(migQueryUnsupported.result.status, 0);
  const migQueryUnsupportedReceipt = JSON.parse(await readFile(migQueryUnsupported.output, "utf8"));
  assert.equal(migQueryUnsupportedReceipt.status, "FAIL");
  assert.equal(migQueryUnsupportedReceipt.mig_capable_profile, true);
  assert.equal(migQueryUnsupportedReceipt.mig_query_supported, false);
  assert.equal(migQueryUnsupportedReceipt.mig_mode_acceptable, false);
  assert.equal(migQueryUnsupportedReceipt.single_visible_gpu_verified, true);
  assert.equal(migQueryUnsupportedReceipt.mig_query_exit_code, 6);

  // The same fallback is acceptable for non-MIG profiles, and known N/A
  // spellings from devices without MIG support must remain accepted.
  await writeFakeSmiSplit({
    fullQuery: `echo 'Field "mig.mode.current" is not a valid field to query.' >&2; exit 6`,
    identityQuery: `printf '%s\\n' '0, Tesla V100-PCIE-16GB, 7.0, 16384'`,
  });
  const preAmpereFallback = runPreflightProfile("preampere-fallback", "v100");
  assert.equal(preAmpereFallback.result.status, 0, preAmpereFallback.result.stderr);
  const preAmpereFallbackReceipt = JSON.parse(await readFile(preAmpereFallback.output, "utf8"));
  assert.equal(preAmpereFallbackReceipt.status, "PASS");
  assert.equal(preAmpereFallbackReceipt.mig_capable_profile, false);
  assert.equal(preAmpereFallbackReceipt.mig_query_supported, false);
  assert.equal(preAmpereFallbackReceipt.mig_mode_current, "not-applicable-query-unavailable");
  assert.equal(preAmpereFallbackReceipt.mig_mode_acceptable, true);

  for (const [suffix, spelling] of [["na-bracket", "[N/A]"], ["na-plain", "N/A"], ["na-notsupported", "Not Supported"]]) {
    await writeFakeSmi(`0, Tesla V100-PCIE-16GB, 7.0, 16384, ${spelling}`);
    const naRun = runPreflightProfile(`preampere-${suffix}`, "v100");
    assert.equal(naRun.result.status, 0, `non-MIG spelling ${spelling}: ${naRun.result.stderr}`);
    const naReceipt = JSON.parse(await readFile(naRun.output, "utf8"));
    assert.equal(naReceipt.status, "PASS");
    assert.equal(naReceipt.mig_enabled, false);
    assert.equal(naReceipt.mig_mode_acceptable, true);
  }

  await writeFakeSmi("0, NVIDIA A100-SXM4-40GB, 8.0, 40960, [N/A]");
  const ampereNa = runPreflight("ampere-na");
  assert.notEqual(ampereNa.result.status, 0);
  const ampereNaReceipt = JSON.parse(await readFile(ampereNa.output, "utf8"));
  assert.equal(ampereNaReceipt.mig_mode_acceptable, false);

  // Missing or non-executable nvidia-smi must fail closed with a receipt,
  // preserving diagnostics rather than crashing with a traceback.
  const emptyBin = join(temp, "empty-bin");
  await mkdir(emptyBin, { recursive: true });
  const noSmiEnv = { ...process.env, PATH: emptyBin };
  const noSmiOutput = join(temp, "preflight-no-smi.json");
  const noSmi = spawnSync(python3, [
    verifierUrl.pathname,
    "--profile", "a100",
    "--u", "16384",
    "--v", "128",
    "--warmup", "20",
    "--iterations", "1000",
    "--trials", "3",
    "--output", noSmiOutput,
  ], { encoding: "utf8", env: noSmiEnv });
  assert.notEqual(noSmi.status, 0, "missing nvidia-smi must never PASS");
  assert.doesNotMatch(noSmi.stderr, /Traceback/);
  const noSmiReceipt = JSON.parse(await readFile(noSmiOutput, "utf8"));
  assert.equal(noSmiReceipt.status, "FAIL");
  assert.equal(noSmiReceipt.nvidia_smi_visible_gpu_count, 0);
  assert.equal(noSmiReceipt.single_visible_gpu_verified, false);
  assert.equal(noSmiReceipt.cuda_ordinal_zero_mapping_unambiguous, false);
  assert.equal(noSmiReceipt.mig_query_exit_code, 127);
  assert.equal(noSmiReceipt.identity_query_exit_code, 127);
  assert.match(noSmiReceipt.identity_query_error ?? "", /nvidia-smi unavailable/);
  assert.equal(noSmiReceipt.safe_gpu_inventory, null);
  assert.equal(noSmiReceipt.raw_device_uuid_queried, false);

  const noExecBin = join(temp, "noexec-bin");
  await mkdir(noExecBin, { recursive: true });
  const noExecSmi = join(noExecBin, "nvidia-smi");
  await writeFile(noExecSmi, "#!/bin/sh\nexit 0\n");
  await chmod(noExecSmi, 0o644);
  const noExecOutput = join(temp, "preflight-noexec-smi.json");
  const noExec = spawnSync(python3, [
    verifierUrl.pathname,
    "--profile", "a100",
    "--u", "16384", "--v", "128", "--warmup", "20",
    "--iterations", "1000", "--trials", "3",
    "--output", noExecOutput,
  ], { encoding: "utf8", env: { ...process.env, PATH: noExecBin } });
  assert.notEqual(noExec.status, 0);
  assert.doesNotMatch(noExec.stderr, /Traceback/);
  const noExecReceipt = JSON.parse(await readFile(noExecOutput, "utf8"));
  assert.equal(noExecReceipt.status, "FAIL");
  assert.equal(noExecReceipt.identity_query_exit_code, 127);

  // Non-zero queries and malformed CSV must fail closed and preserve the
  // observable failure details in the receipt.
  await writeFile(nvidiaSmi, "#!/bin/sh\necho 'NVIDIA-SMI has failed' >&2\nexit 9\n");
  await chmod(nvidiaSmi, 0o755);
  const smiFailure = runPreflight("smi-failure");
  assert.notEqual(smiFailure.result.status, 0);
  const smiFailureReceipt = JSON.parse(await readFile(smiFailure.output, "utf8"));
  assert.equal(smiFailureReceipt.status, "FAIL");
  assert.equal(smiFailureReceipt.nvidia_smi_visible_gpu_count, 0);
  assert.equal(smiFailureReceipt.single_visible_gpu_verified, false);
  assert.equal(smiFailureReceipt.mig_query_exit_code, 9);
  assert.equal(smiFailureReceipt.identity_query_exit_code, 9);
  assert.match(smiFailureReceipt.identity_query_error ?? "", /NVIDIA-SMI has failed/);

  await writeFakeSmiSplit({
    fullQuery: `printf '%s\\n' '0, NVIDIA A100-SXM4-40GB, 8.0'`,
    identityQuery: `printf '%s\\n' '0, NVIDIA A100-SXM4-40GB, 8.0'`,
  });
  const malformed = runPreflight("malformed-csv");
  assert.notEqual(malformed.result.status, 0);
  const malformedReceipt = JSON.parse(await readFile(malformed.output, "utf8"));
  assert.equal(malformedReceipt.status, "FAIL");
  assert.equal(malformedReceipt.nvidia_smi_visible_gpu_count, 0);
  assert.equal(malformedReceipt.single_visible_gpu_verified, false);

  await writeFakeSmi("x, NVIDIA A100-SXM4-40GB, 8.0, 40960, Disabled");
  const badIndex = runPreflight("bad-index");
  assert.notEqual(badIndex.result.status, 0);
  const badIndexReceipt = JSON.parse(await readFile(badIndex.output, "utf8"));
  assert.equal(badIndexReceipt.status, "FAIL");
  assert.equal(badIndexReceipt.selected_nvidia_smi_index, null);
  assert.equal(badIndexReceipt.single_visible_gpu_verified, true);

  // Malformed registry compute capability must fail before device probing.
  const doctoredRegistryPath = join(temp, "doctored-profiles.json");
  {
    const doctoredRegistry = structuredClone(profiles);
    doctoredRegistry.profiles.a100.expected_compute_capability = "eight.0";
    await writeFile(doctoredRegistryPath, JSON.stringify(doctoredRegistry));
  }
  await writeFakeSmiSplit({
    fullQuery: `echo 'Field "mig.mode.current" is not a valid field to query.' >&2; exit 6`,
    identityQuery: `printf '%s\\n' '0, NVIDIA A100-SXM4-40GB, eight.0, 40960'`,
  });
  const doctoredOutput = join(temp, "preflight-doctored-cc.json");
  const doctored = spawnSync(python3, [
    verifierUrl.pathname,
    "--profile", "a100",
    "--u", "16384",
    "--v", "128",
    "--warmup", "20",
    "--iterations", "1000",
    "--trials", "3",
    "--profile-registry", doctoredRegistryPath,
    "--output", doctoredOutput,
  ], { encoding: "utf8", env: baseEnv });
  assert.notEqual(doctored.status, 0, "malformed registry CC must never PASS");
  assert.match(doctored.stderr, /malformed compute capability/);
  const doctoredReceiptWritten = await access(doctoredOutput).then(() => true, () => false);
  assert.equal(doctoredReceiptWritten, false);

  // Explicit MIG capability drives the strict gate independent of profile name.
  {
    const promotedRegistry = structuredClone(profiles);
    promotedRegistry.profiles.t4.expected_compute_capability = "8.0";
    promotedRegistry.profiles.t4.expected_sm = "sm_80";
    promotedRegistry.profiles.t4.mig_capable = true;
    const promotedPath = join(temp, "promoted-t4-profiles.json");
    await writeFile(promotedPath, JSON.stringify(promotedRegistry));
    await writeFakeSmiSplit({
      fullQuery: `echo 'not supported' >&2; exit 6`,
      identityQuery: `printf '%s\\n' '0, NVIDIA Tesla T4, 8.0, 16384'`,
    });
    const promotedOutput = join(temp, "preflight-promoted-t4.json");
    const promoted = spawnSync(python3, [
      verifierUrl.pathname,
      "--profile", "t4",
      "--u", "16384", "--v", "128", "--warmup", "20",
      "--iterations", "1000", "--trials", "3",
      "--profile-registry", promotedPath,
      "--output", promotedOutput,
    ], { encoding: "utf8", env: baseEnv });
    assert.notEqual(promoted.status, 0);
    const promotedReceipt = JSON.parse(await readFile(promotedOutput, "utf8"));
    assert.equal(promotedReceipt.mig_capable_profile, true);
    assert.equal(promotedReceipt.mig_mode_acceptable, false);
  }

  // Restore canonical fake hardware before the comparator integration tests.
  await writeFakeSmi("0, NVIDIA A100-SXM4-40GB, 8.0, 40960, Disabled");

  const makeResult = (profile, model, cc, sm) => ({
    schema: "gluball-cuda-runtime-v31-architecture-result/1",
    status: "PASS",
    profile,
    profile_definition: profiles.profiles[profile],
    source_commit: "a".repeat(40),
    gpu: { model, compute_capability: cc, expected_sm: sm },
    canonical_workload: { ...canonicalWorkload },
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
      diagnostic_digests: { v31: "0123456789abcdef" },
    },
  });
  const left = makeResult("v100", "NVIDIA Tesla V100-PCIE-16GB", "7.0", "sm_70");
  const right = makeResult("a100", "NVIDIA A100-SXM4-40GB", "8.0", "sm_80");
  right.atomic_equivalence.diagnostic_digests.v31 = "fedcba9876543210";
  const leftPath = join(temp, "left.json");
  const rightPath = join(temp, "right.json");
  await writeFile(leftPath, JSON.stringify(left));
  await writeFile(rightPath, JSON.stringify(right));
  const canonicalCompare = spawnSync(python3, [comparatorUrl.pathname, leftPath, rightPath], { encoding: "utf8" });
  assert.equal(canonicalCompare.status, 0, canonicalCompare.stderr);

  const noPreflight = JSON.parse(JSON.stringify(left));
  delete noPreflight.physical_preflight_validation;
  await writeFile(leftPath, JSON.stringify(noPreflight));
  assert.notEqual(spawnSync(python3, [comparatorUrl.pathname, leftPath, rightPath], { encoding: "utf8" }).status, 0);

  const noBuildReceipt = JSON.parse(JSON.stringify(left));
  delete noBuildReceipt.frozen_measured_build_input_validation;
  await writeFile(leftPath, JSON.stringify(noBuildReceipt));
  assert.notEqual(spawnSync(python3, [comparatorUrl.pathname, leftPath, rightPath], { encoding: "utf8" }).status, 0);

  left.canonical_workload.u_segments = 8192;
  right.canonical_workload.u_segments = 8192;
  await writeFile(leftPath, JSON.stringify(left));
  await writeFile(rightPath, JSON.stringify(right));
  const noncanonicalCompare = spawnSync(python3, [comparatorUrl.pathname, leftPath, rightPath], { encoding: "utf8" });
  assert.notEqual(noncanonicalCompare.status, 0);
} finally {
  await rm(temp, { recursive: true, force: true });
}

console.log("GLUBALL Runtime V3.1 physical preflight hardening: PASS");
