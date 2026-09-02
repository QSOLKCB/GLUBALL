import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const repo = new URL("../", import.meta.url);
const profiles = JSON.parse(await readFile(new URL("docs/CUDA_RUNTIME_V31_ARCHITECTURE_PROFILES.json", repo), "utf8"));
const ladder = JSON.parse(await readFile(new URL("docs/CUDA_RUNTIME_V31_ARCHITECTURE_LADDER.json", repo), "utf8"));
const evidenceRoot = new URL("docs/physical-evidence/gtx-1650-33630241971/", repo);
const verifierUrl = new URL("scripts/verify_cuda_runtime_v31_physical_preflight.py", repo);

assert.equal(profiles.profiles["rtx-3050"].expected_compute_capability, "8.6");
assert.equal(profiles.profiles["rtx-3050"].expected_sm, "sm_86");
assert.equal(profiles.profiles["rtx-3050"].mig_capable, false);
assert.equal(profiles.profiles.a100.mig_capable, true);
assert.equal(profiles.profiles["rtx-3050"].measurement_role, "supplemental-consumer-ampere-observation");
assert.doesNotMatch(profiles.profiles["rtx-3050"].measurement_role, /same-host/i);
assert.equal(ladder.supplemental_profile_policy["rtx-3050"].same_host_claim_enforced, false);
assert.equal(ladder.supplemental_profile_policy["rtx-3050"].host_identity_bound_by_workflow, false);

const manifestParts = [];
for (let i = 1; i <= 5; i += 1) {
  manifestParts.push(await readFile(new URL(`BUNDLE_SHA256SUMS.part${String(i).padStart(2, "0")}.txt`, evidenceRoot), "utf8"));
}
const manifest = manifestParts.join("");
assert.equal(createHash("sha256").update(manifest).digest("hex"), "fdb45a763a62edb2804bb4f070781dd8ba1bbed6846d7a9acdc845a15582401b");
const manifestLines = manifest.trimEnd().split("\n");
assert.equal(manifestLines.length, 179);
const manifestMap = new Map(manifestLines.map((line) => {
  const match = /^([0-9a-f]{64})  \.\/(.+)$/.exec(line);
  assert.ok(match, `invalid manifest line: ${line}`);
  return [match[2], match[1]];
}));

for (const relative of [
  "ARCHITECTURE_RESULT.json",
  "VALIDATION_STATUS.json",
  "PHYSICAL_PREFLIGHT_VALIDATION.json",
  "FROZEN_MEASURED_BUILD_INPUT_VALIDATION.json",
  "v1-acceptance/V1_VALIDATION.json",
  "v31-sanitizer/SANITIZER_EXIT_STATUS.txt",
]) {
  const bytes = await readFile(new URL(relative, evidenceRoot));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), manifestMap.get(relative), `durable receipt hash mismatch: ${relative}`);
}

const pythonProbe = spawnSync("python3", ["-c", "import sys; print(sys.executable)"], { encoding: "utf8" });
assert.equal(pythonProbe.status, 0, pythonProbe.stderr);
const python3 = pythonProbe.stdout.trim();
const temp = await mkdtemp(join(tmpdir(), "gluball-rtx3050-preflight-"));
try {
  const fakeSmi = join(temp, "nvidia-smi");
  const baseEnv = { ...process.env, PATH: `${temp}:${process.env.PATH ?? ""}` };
  const run = (suffix) => {
    const output = join(temp, `${suffix}.json`);
    const result = spawnSync(python3, [
      verifierUrl.pathname,
      "--profile", "rtx-3050",
      "--u", "16384",
      "--v", "128",
      "--warmup", "20",
      "--iterations", "1000",
      "--trials", "3",
      "--output", output,
    ], { encoding: "utf8", env: baseEnv });
    return { result, output };
  };

  await writeFile(fakeSmi, "#!/bin/sh\nprintf '%s\\n' '0, NVIDIA GeForce RTX 3050, 8.6, 8192, [N/A]'\n");
  await chmod(fakeSmi, 0o755);
  const na = run("na");
  assert.equal(na.result.status, 0, na.result.stderr);
  const naReceipt = JSON.parse(await readFile(na.output, "utf8"));
  assert.equal(naReceipt.status, "PASS");
  assert.equal(naReceipt.mig_capable_profile, false);
  assert.equal(naReceipt.mig_mode_acceptable, true);

  await writeFile(fakeSmi, `#!/bin/sh
case "$*" in
  *mig.mode.current*) echo 'Field "mig.mode.current" is not a valid field to query.' >&2; exit 6 ;;
  *) printf '%s\\n' '0, NVIDIA GeForce RTX 3050, 8.6, 8192' ;;
esac
`);
  await chmod(fakeSmi, 0o755);
  const unsupported = run("unsupported");
  assert.equal(unsupported.result.status, 0, unsupported.result.stderr);
  const unsupportedReceipt = JSON.parse(await readFile(unsupported.output, "utf8"));
  assert.equal(unsupportedReceipt.status, "PASS");
  assert.equal(unsupportedReceipt.mig_capable_profile, false);
  assert.equal(unsupportedReceipt.mig_query_supported, false);
  assert.equal(unsupportedReceipt.mig_mode_current, "not-applicable-query-unavailable");
  assert.equal(unsupportedReceipt.mig_mode_acceptable, true);
} finally {
  await rm(temp, { recursive: true, force: true });
}

console.log("PR23 durable evidence + RTX 3050 preflight hardening: PASS");
