import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const workflow = await readFile(
  new URL("../.github/workflows/physical-cuda-v31-legacy-negative-control.yml", import.meta.url),
  "utf8",
);
const verifierUrl = new URL("../scripts/verify_cuda_runtime_v31_legacy_negative_control.py", import.meta.url);
const verifier = await readFile(verifierUrl, "utf8");
const docs = await readFile(new URL("../docs/CUDA_RUNTIME_V31_LEGACY_NEGATIVE_CONTROL.md", import.meta.url), "utf8");
const registryPath = new URL("../docs/CUDA_RUNTIME_V31_LEGACY_NEGATIVE_PROFILES.json", import.meta.url);
const registry = JSON.parse(await readFile(registryPath, "utf8"));

assert.equal(registry.schema, "gluball-cuda-runtime-v31-architecture-profiles/1");
assert.deepEqual(registry.profile_order, ["gt-730-gf108"]);
const profile = registry.profiles["gt-730-gf108"];
assert.equal(profile.expected_pci_device_id, "10de:0f02");
assert.equal(profile.expected_compute_capability, "2.1");
assert.equal(profile.expected_sm, "sm_21");
assert.equal(profile.architecture_family, "Fermi");
assert.equal(profile.expected_kernel_driver, "nouveau");
assert.equal(profile.expected_opengl_vendor_regex_case_insensitive, "^(?:Mesa|nouveau)$");
assert.equal(profile.expected_opengl_renderer, "NVC1");
assert.equal(profile.expected_nvidia_smi_usable, false);
assert.equal(profile.expected_nvidia_device_nodes_present, false);
assert.equal(profile.expected_nvcc_release, "12.8");
assert.equal(profile.expected_nvcc_compute_target, "compute_21");
assert.equal(profile.expected_nvcc_sm_target, "sm_21");
assert.equal(profile.expected_architecture_preflight_status, "FAIL");
assert.equal(profile.negative_control, true);

assert.match(workflow, /^name: GLUBALL Runtime V3\.1 legacy negative control/m);
assert.match(workflow, /- gt-730-gf108/);
assert.match(workflow, /gluball-vast-v31-architecture/);
assert.match(workflow, /verify_cuda_runtime_v31_legacy_negative_control\.py/);
assert.match(workflow, /verify_cuda_runtime_v31_physical_preflight\.py/);
assert.match(workflow, /expected architecture preflight to reject the legacy runtime with exit 1/);
assert.match(workflow, /preflight\.get\("status"\) != "FAIL"/);
assert.doesNotMatch(workflow, /run_cuda_runtime_v31_architecture_profile\.sh/);
assert.doesNotMatch(workflow, /query-gpu=[^\n]*uuid/i);
assert.doesNotMatch(workflow, /nvidia-smi\s+-L/);

assert.match(verifier, /_PCI_ADDRESS_PATTERN/);
assert.match(verifier, /[0-9a-fA-F]\{4\}/);
assert.match(verifier, /expected_opengl_vendor_regex_case_insensitive/);
assert.match(verifier, /_NVCC_RELEASE_PATTERN/);
assert.match(verifier, /expected_nvcc_release_match/);
assert.match(verifier, /nvcc", "--list-gpu-arch"/);
assert.match(verifier, /nvcc", "--list-gpu-code"/);
assert.match(verifier, /glob\("nvidia\*"/);
assert.match(verifier, /raw_device_uuid_queried.*False/s);
assert.match(verifier, /raw_device_uuid_published.*False/s);

assert.match(docs, /10de:0f02/);
assert.match(docs, /compute capability 2\.1/);
assert.match(docs, /sm_21/);
assert.match(docs, /nouveau/);
assert.match(docs, /CUDA 12\.8/);
assert.match(docs, /does not confuse NVIDIA hardware presence/);
assert.match(docs, /not every product sold as "GT 730"/);

const python = spawnSync("python3", ["-c", "import sys; print(sys.executable)"], { encoding: "utf8" });
assert.equal(python.status, 0);
const python3 = python.stdout.trim();

const temp = await mkdtemp(join(tmpdir(), "gluball-gt730-negative-"));
try {
  const bin = join(temp, "bin");
  const dev = join(temp, "dev");
  await mkdir(bin, { recursive: true });
  await mkdir(dev, { recursive: true });

  const writeExecutable = async (name, body) => {
    const path = join(bin, name);
    await writeFile(path, body);
    await chmod(path, 0o755);
  };

  const writeGlxinfo = async (vendor) => writeExecutable(
    "glxinfo",
    `#!/bin/sh
cat <<'EOF'
OpenGL vendor string: ${vendor}
OpenGL renderer string: NVC1
OpenGL version string: 4.3 (Compatibility Profile) Mesa test
EOF
`,
  );

  const writeNvcc = async (release) => writeExecutable(
    "nvcc",
    `#!/bin/sh
case "$1" in
  --version)
    echo 'Cuda compilation tools, release ${release}, V${release}.93'
    ;;
  --list-gpu-arch)
    printf '%s\\n' compute_50 compute_52 compute_60 compute_61 compute_70 compute_75 compute_80 compute_86
    ;;
  --list-gpu-code)
    printf '%s\\n' sm_50 sm_52 sm_60 sm_61 sm_70 sm_75 sm_80 sm_86
    ;;
  *)
    exit 2
    ;;
esac
`,
  );

  const runVerifier = (name) => {
    const output = join(temp, `${name}.json`);
    const result = spawnSync(
      python3,
      [
        verifierUrl.pathname,
        "--profile",
        "gt-730-gf108",
        "--profile-registry",
        registryPath.pathname,
        "--dev-root",
        dev,
        "--output",
        output,
      ],
      { encoding: "utf8", env: { ...process.env, PATH: `${bin}:/usr/bin:/bin` } },
    );
    return { result, output };
  };

  await writeExecutable(
    "lspci",
    `#!/bin/sh
cat <<'EOF'
02:00.0 VGA compatible controller [0300]: NVIDIA Corporation GF108 [GeForce GT 730] [10de:0f02] (rev a1)
	Subsystem: NVIDIA Corporation GF108 [GeForce GT 730] [10de:098f]
	Kernel driver in use: nouveau
	Kernel modules: nvidiafb, nouveau, nvidia_drm, nvidia
02:00.1 Audio device [0403]: NVIDIA Corporation GF108 High Definition Audio Controller [10de:0bea] (rev a1)
EOF
`,
  );
  await writeGlxinfo("Mesa");
  await writeNvcc("12.8");
  await writeExecutable(
    "nvidia-smi",
    `#!/bin/sh
echo "NVIDIA-SMI has failed because it couldn't communicate with the NVIDIA driver." >&2
exit 9
`,
  );
  await writeExecutable(
    "ldconfig",
    `#!/bin/sh
cat <<'EOF'
	libcudart.so.12 (libc6,x86-64) => /usr/local/cuda/lib64/libcudart.so.12
	libcuda.so.1 (libc6,x86-64) => /lib/x86_64-linux-gnu/libcuda.so.1
EOF
`,
  );

  const baseline = runVerifier("baseline");
  assert.equal(baseline.result.status, 0, baseline.result.stderr);
  let receipt = JSON.parse(await readFile(baseline.output, "utf8"));
  assert.equal(receipt.status, "PASS");
  assert.equal(receipt.graphics.vendor, "Mesa");
  assert.equal(receipt.cuda_toolkit.observed_release, "12.8");
  assert.equal(receipt.checks.expected_nvcc_release_match, true);

  // Mesa's Nouveau stack may report either "Mesa" or "nouveau" as the GL vendor.
  await writeGlxinfo("nouveau");
  const nouveauVendor = runVerifier("nouveau-vendor");
  assert.equal(nouveauVendor.result.status, 0, nouveauVendor.result.stderr);
  receipt = JSON.parse(await readFile(nouveauVendor.output, "utf8"));
  assert.equal(receipt.status, "PASS");
  assert.equal(receipt.graphics.vendor, "nouveau");
  assert.equal(receipt.checks.expected_opengl_vendor_match, true);

  // lspci can emit domain-qualified addresses on multi-domain hosts.
  await writeExecutable(
    "lspci",
    `#!/bin/sh
cat <<'EOF'
0000:00:00.0 Host bridge [0600]: Example Host Bridge [1234:5678]
	Kernel driver in use: example
0001:02:00.0 VGA compatible controller [0300]: NVIDIA Corporation GF108 [GeForce GT 730] [10de:0f02] (rev a1)
	Subsystem: NVIDIA Corporation GF108 [GeForce GT 730] [10de:098f]
	Kernel driver in use: nouveau
	Kernel modules: nvidiafb, nouveau, nvidia_drm, nvidia
0001:02:00.1 Audio device [0403]: NVIDIA Corporation GF108 High Definition Audio Controller [10de:0bea] (rev a1)
EOF
`,
  );
  const domainQualified = runVerifier("domain-qualified");
  assert.equal(domainQualified.result.status, 0, domainQualified.result.stderr);
  receipt = JSON.parse(await readFile(domainQualified.output, "utf8"));
  assert.equal(receipt.status, "PASS");
  assert.match(receipt.pci.selected_lspci_line, /^0001:02:00\.0 /);
  assert.equal(receipt.checks.expected_lspci_model_match, true);

  // A different CUDA release must not masquerade as the declared CUDA 12.8 specimen.
  await writeNvcc("11.8");
  const wrongCuda = runVerifier("wrong-cuda-release");
  assert.equal(wrongCuda.result.status, 1);
  receipt = JSON.parse(await readFile(wrongCuda.output, "utf8"));
  assert.equal(receipt.status, "FAIL");
  assert.equal(receipt.cuda_toolkit.expected_release, "12.8");
  assert.equal(receipt.cuda_toolkit.observed_release, "11.8");
  assert.equal(receipt.checks.expected_nvcc_release_match, false);

  await writeNvcc("12.8");
  await writeFile(join(dev, "nvidia0"), "");
  const deviceNodePresent = runVerifier("device-node-present");
  assert.equal(deviceNodePresent.result.status, 1);
  receipt = JSON.parse(await readFile(deviceNodePresent.output, "utf8"));
  assert.equal(receipt.status, "FAIL");
  assert.equal(receipt.checks.expected_nvcc_release_match, true);
  assert.equal(receipt.checks.nvidia_device_nodes_absent_as_expected, false);
} finally {
  await rm(temp, { recursive: true, force: true });
}
