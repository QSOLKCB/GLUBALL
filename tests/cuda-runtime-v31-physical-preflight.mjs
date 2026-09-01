import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const verifierUrl = new URL("../scripts/verify_cuda_runtime_v31_physical_preflight.py", import.meta.url);
const comparatorUrl = new URL("../scripts/compare_cuda_runtime_v31_architecture_results.py", import.meta.url);
const profiles = JSON.parse(await readFile(new URL("../docs/CUDA_RUNTIME_V31_ARCHITECTURE_PROFILES.json", import.meta.url), "utf8"));
const contract = JSON.parse(await readFile(new URL("../docs/CUDA_RUNTIME_V31_ARCHITECTURE_LADDER.json", import.meta.url), "utf8"));

for (const definition of Object.values(profiles.profiles)) {
  assert.equal(definition.requires_full_gpu, true);
}
assert.equal(profiles.measurement_boundary.full_gpu_profiles_reject_mig_enabled_or_partitioned_devices, true);
assert.equal(profiles.measurement_boundary.mig_partition_profiles_supported, false);
assert.equal(contract.measurement_source_policy.physical_preflight_receipt_required, true);
assert.equal(contract.measurement_source_policy.canonical_workload_exact_match_required_for_graduation, true);
assert.equal(contract.measurement_source_policy.full_gpu_profiles_reject_mig_enabled_or_partitioned_devices, true);
assert.equal(contract.comparison_boundary.exact_declared_canonical_workload_required, true);

const temp = await mkdtemp(join(tmpdir(), "gluball-v31-preflight-"));
try {
  const bin = join(temp, "bin");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(bin, { recursive: true });
  const nvidiaSmi = join(bin, "nvidia-smi");
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` };

  const writeFakeSmi = async (line) => {
    await writeFile(nvidiaSmi, `#!/bin/sh\nprintf '%s\\n' '${line}'\n`);
    await chmod(nvidiaSmi, 0o755);
  };

  const runPreflight = (suffix, extra = []) => {
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
    const result = spawnSync("python3", args, { encoding: "utf8", env });
    return { result, output };
  };

  await writeFakeSmi("0, NVIDIA A100-SXM4-40GB, 8.0, 40960, Disabled");
  const fullGpu = runPreflight("full");
  assert.equal(fullGpu.result.status, 0, fullGpu.result.stderr);
  const fullReceipt = JSON.parse(await readFile(fullGpu.output, "utf8"));
  assert.equal(fullReceipt.status, "PASS");
  assert.equal(fullReceipt.mig_enabled, false);
  assert.equal(fullReceipt.mig_partition_observed, false);
  assert.equal(fullReceipt.canonical_workload_match, true);

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
  const noncanonical = spawnSync("python3", [
    verifierUrl.pathname,
    "--profile", "a100",
    "--u", "8192",
    "--v", "128",
    "--warmup", "20",
    "--iterations", "1000",
    "--trials", "3",
    "--output", noncanonicalOutput,
  ], { encoding: "utf8", env });
  assert.notEqual(noncanonical.status, 0);
  const noncanonicalReceipt = JSON.parse(await readFile(noncanonicalOutput, "utf8"));
  assert.equal(noncanonicalReceipt.status, "FAIL");
  assert.equal(noncanonicalReceipt.canonical_workload_match, false);

  const makeResult = (profile, model, cc, sm) => ({
    schema: "gluball-cuda-runtime-v31-architecture-result/1",
    status: "PASS",
    profile,
    profile_definition: profiles.profiles[profile],
    source_commit: "a".repeat(40),
    gpu: { model, compute_capability: cc, expected_sm: sm },
    canonical_workload: { ...contract.canonical_workload },
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
  const canonicalCompare = spawnSync("python3", [comparatorUrl.pathname, leftPath, rightPath], { encoding: "utf8" });
  assert.equal(canonicalCompare.status, 0, canonicalCompare.stderr);

  left.canonical_workload.u_segments = 8192;
  right.canonical_workload.u_segments = 8192;
  await writeFile(leftPath, JSON.stringify(left));
  await writeFile(rightPath, JSON.stringify(right));
  const noncanonicalCompare = spawnSync("python3", [comparatorUrl.pathname, leftPath, rightPath], { encoding: "utf8" });
  assert.notEqual(noncanonicalCompare.status, 0);
} finally {
  await rm(temp, { recursive: true, force: true });
}

console.log("GLUBALL Runtime V3.1 physical preflight hardening: PASS");
