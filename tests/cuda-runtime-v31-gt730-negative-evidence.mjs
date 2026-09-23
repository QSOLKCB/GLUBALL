import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";

const repo = new URL("../", import.meta.url);
const evidenceRoot = new URL("docs/physical-evidence/gt-730-gf108-35863047782/", repo);
const record = JSON.parse(await readFile(
  new URL("docs/physical-evidence/CUDA_RUNTIME_V31_GT730_NEGATIVE_RUN_35863047782.json", repo),
  "utf8",
));
const profiles = JSON.parse(await readFile(
  new URL("docs/CUDA_RUNTIME_V31_LEGACY_NEGATIVE_PROFILES.json", repo),
  "utf8",
));
const docs = await readFile(
  new URL("docs/CUDA_RUNTIME_V31_LEGACY_NEGATIVE_CONTROL.md", repo),
  "utf8",
);

assert.equal(record.schema, "gluball-cuda-runtime-v31-accepted-legacy-negative-artifact/1");
assert.equal(record.contract, "GLUBALL-CUDA-RUNTIME-V3.1-LEGACY-NEGATIVE-CONTROL");
assert.equal(record.status, "PASS");
assert.equal(record.profile, "gt-730-gf108");
assert.equal(record.physical_run_id, 35863047782);
assert.equal(record.actions_run_url, `https://github.com/QSOLKCB/GLUBALL/actions/runs/${record.physical_run_id}`);
assert.equal(record.job_id, 107187738646);
assert.equal(record.source_commit, "69256247e6125d726f06c9735f21635d5e56bbe2");
assert.equal(record.artifact.id, 10750992566);
assert.equal(record.artifact.name, "gluball-v31-legacy-negative-gt-730-gf108-35863047782-1");
assert.equal(record.artifact.zip_size_bytes, 3543);
assert.equal(record.artifact.zip_sha256, "1e8393154f59d11303a237d6a01ac57460714ece591612d094c2da254529d5ee");
assert.equal(record.artifact.bundle_sha256s_manifest_sha256, "841c0d025b4f28c520efe2aaec9d46a3883167be10d3de20be63b90f8b595a76");
assert.equal(record.artifact.bundle_manifest_entry_count, 5);
assert.equal(record.artifact.independently_verified_after_download, true);
assert.equal(record.artifact.actions_artifact_is_transient, true);
assert.equal(record.artifact.durable_core_independent_of_actions_retention, true);
assert.equal(record.artifact.durable_receipt_directory, "docs/physical-evidence/gt-730-gf108-35863047782");

const manifest = await readFile(new URL("BUNDLE_SHA256SUMS.txt", evidenceRoot));
assert.equal(
  createHash("sha256").update(manifest).digest("hex"),
  record.artifact.bundle_sha256s_manifest_sha256,
);
const lines = manifest.toString("utf8").trimEnd().split("\n");
assert.equal(lines.length, record.artifact.bundle_manifest_entry_count);
const manifestMap = new Map(lines.map((line) => {
  const match = /^([0-9a-f]{64})  \.\/(.+)$/.exec(line);
  assert.ok(match, `invalid manifest line: ${line}`);
  return [match[2], match[1]];
}));
assert.deepEqual(
  Object.fromEntries(manifestMap),
  record.artifact.receipt_sha256,
);

const durableFiles = (await readdir(evidenceRoot)).sort();
const expectedDurableFiles = [...record.artifact.durable_supporting_receipts].sort();
assert.deepEqual(
  durableFiles,
  expectedDurableFiles,
  "durable evidence directory contains files not declared by the accepted record",
);
assert.deepEqual(
  [...manifestMap.keys()].sort(),
  expectedDurableFiles.filter((name) => name !== "BUNDLE_SHA256SUMS.txt").sort(),
  "bundle manifest entries must cover every durable file except the manifest itself",
);

for (const [relative, expected] of manifestMap) {
  const bytes = await readFile(new URL(relative, evidenceRoot));
  assert.equal(
    createHash("sha256").update(bytes).digest("hex"),
    expected,
    `archived receipt digest mismatch: ${relative}`,
  );
}

assert.equal(
  await readFile(new URL("SOURCE_COMMIT.txt", evidenceRoot), "utf8"),
  record.source_commit + "\n",
);
assert.equal(
  await readFile(new URL("ARCHITECTURE_PREFLIGHT_EXIT_STATUS.txt", evidenceRoot), "utf8"),
  "1\n",
);
assert.equal(
  (await readFile(new URL("HOST_UNAME.txt", evidenceRoot), "utf8")).trim(),
  record.host.uname,
);

const negative = JSON.parse(await readFile(new URL("LEGACY_NEGATIVE_CONTROL.json", evidenceRoot), "utf8"));
assert.equal(negative.schema, "gluball-cuda-runtime-v31-legacy-negative-control/1");
assert.equal(negative.status, "PASS");
assert.equal(negative.profile, record.profile);
assert.ok(Object.values(negative.checks).every((value) => value === true));
assert.equal(negative.pci.expected_device_id, "10de:0f02");
assert.equal(negative.pci.kernel_driver_in_use, "nouveau");
assert.match(negative.pci.selected_lspci_line, /GF108 \[GeForce GT 730\] \[10de:0f02\]/);
assert.equal(negative.graphics.vendor, "Mesa");
assert.equal(negative.graphics.renderer, "NVC1");
assert.equal(negative.graphics.version, record.hardware.opengl_version);
assert.equal(negative.cuda_toolkit.expected_release, "12.8");
assert.equal(negative.cuda_toolkit.observed_release, "12.8");
assert.equal(negative.cuda_toolkit.advertised_compute_targets.includes("compute_21"), false);
assert.equal(negative.cuda_toolkit.advertised_sm_targets.includes("sm_21"), false);
assert.equal(negative.nvidia_runtime.nvidia_smi_exit_code, 9);
assert.deepEqual(negative.nvidia_runtime.device_nodes, []);
assert.ok(negative.nvidia_runtime.libcuda_or_libcudart_entries.length > 0);
assert.equal(negative.interpretation.nvidia_pci_hardware_present, true);
assert.equal(negative.interpretation.graphics_stack_usable, true);
assert.equal(negative.interpretation.cuda_toolkit_userspace_present, true);
assert.equal(negative.interpretation.proprietary_nvidia_runtime_usable, false);
assert.equal(negative.interpretation.modern_cuda_execution_expected, false);

const preflight = JSON.parse(await readFile(
  new URL("ARCHITECTURE_PREFLIGHT_REJECTION.json", evidenceRoot),
  "utf8",
));
assert.equal(preflight.schema, "gluball-cuda-runtime-v31-physical-preflight/1");
assert.equal(preflight.status, "FAIL");
assert.equal(preflight.profile, record.profile);
assert.equal(preflight.canonical_workload_match, true);
assert.equal(preflight.identity_query_exit_code, 9);
assert.equal(preflight.nvidia_smi_visible_gpu_count, 0);
assert.equal(preflight.single_visible_gpu_verified, false);
assert.equal(preflight.cuda_ordinal_zero_mapping_unambiguous, false);
assert.equal(preflight.safe_gpu_inventory, null);
assert.equal(preflight.raw_device_uuid_queried, false);
assert.equal(preflight.raw_device_uuid_published, false);
assert.equal(preflight.geometry_receipt_authority, false);
assert.equal(preflight.universal_speedup_claim, false);

const profile = profiles.profiles["gt-730-gf108"];
assert.equal(profile.expected_pci_device_id, record.hardware.pci_device_id);
assert.equal(profile.expected_compute_capability, record.hardware.expected_compute_capability);
assert.equal(profile.expected_sm, record.hardware.expected_sm);
assert.equal(profile.expected_kernel_driver, record.hardware.kernel_driver);
assert.equal(profile.expected_nvcc_release, record.cuda_toolkit.observed_release);
assert.equal(profile.expected_architecture_preflight_status, "FAIL");

assert.equal(record.negative_control.status, negative.status);
assert.equal(record.negative_control.architecture_preflight_status, preflight.status);
assert.equal(
  record.negative_control.architecture_preflight_exit_status,
  Number((await readFile(new URL("ARCHITECTURE_PREFLIGHT_EXIT_STATUS.txt", evidenceRoot), "utf8")).trim()),
);
assert.equal(record.negative_control.nvidia_smi_exit_code, negative.nvidia_runtime.nvidia_smi_exit_code);
assert.equal(record.negative_control.nvidia_smi_exit_code, preflight.identity_query_exit_code);
assert.equal(record.negative_control.nvidia_smi_visible_gpu_count, preflight.nvidia_smi_visible_gpu_count);
assert.equal(record.negative_control.single_visible_gpu_verified, preflight.single_visible_gpu_verified);
assert.deepEqual(record.negative_control.safe_gpu_inventory, preflight.safe_gpu_inventory);
assert.deepEqual(record.negative_control.nvidia_device_nodes, negative.nvidia_runtime.device_nodes);
assert.equal(
  record.negative_control.proprietary_nvidia_runtime_usable,
  negative.interpretation.proprietary_nvidia_runtime_usable,
);
assert.equal(
  record.negative_control.modern_cuda_execution_expected,
  negative.interpretation.modern_cuda_execution_expected,
);
assert.equal(record.claim_boundary.performance_ladder_member, false);
assert.equal(record.claim_boundary.geometry_receipt_authority, false);
assert.equal(record.claim_boundary.universal_speedup_claim, false);
assert.equal(record.claim_boundary.cross_device_portability_claim, false);

assert.match(docs, /35863047782/);
assert.match(docs, /10750992566/);
assert.match(docs, /1e8393154f59d11303a237d6a01ac57460714ece591612d094c2da254529d5ee/);
assert.match(docs, /69256247e6125d726f06c9735f21635d5e56bbe2/);
assert.match(docs, /known-hostile runtime-availability fixture/);

console.log("GT 730 GF108 accepted legacy negative-control archive: PASS");
