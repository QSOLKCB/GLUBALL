import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const core = require("../gluball-core.js");
const phase2 = require("../phase2-core.js");

const manifest = JSON.parse(await readFile(new URL("../release/manifest-v1.0.0.json", import.meta.url), "utf8"));
const agent = JSON.parse(await readFile(new URL("../docs/AI_AGENT_CONTRACT.json", import.meta.url), "utf8"));
const vectors = JSON.parse(await readFile(new URL("../test-vectors/phase2-v1.json", import.meta.url), "utf8"));
const roadmap = await readFile(new URL("../ROADMAP.md", import.meta.url), "utf8");
const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
const changelog = await readFile(new URL("../CHANGELOG.md", import.meta.url), "utf8");
const releaseNotes = await readFile(new URL("../RELEASE_NOTES_v1.0.0.md", import.meta.url), "utf8");

assert.equal(manifest.schema, "gluball-release-manifest/1");
assert.equal(manifest.release.version, "1.0.0");
assert.equal(manifest.release.tag, "v1.0.0");
assert.equal(manifest.release.status, "release-candidate");
assert.equal(manifest.release.freeze_base_commit, "3326feaa3040ac2e6e19cc8de524c97a56b7f010");
assert.match(manifest.release.tag_target_rule, /merge commit/i);

assert.equal(core.VERSION, "1.0.0");
assert.equal(phase2.VERSION, "1.0.0");
assert.equal(manifest.implementation_versions["gluball-core.js"], core.VERSION);
assert.equal(manifest.implementation_versions["phase2-core.js"], phase2.VERSION);

assert.deepEqual(manifest.contracts, {
  geometry: "GLUBALL-KNOT-V1",
  sampling: "GLUBALL-SAMPLING-V1",
  evidence: "GLUBALL-EVIDENCE-V1",
  sonification: "GLUBALL-SONIFICATION-V1",
  capture: "GLUBALL-CAPTURE-PROFILES-V1"
});
assert.equal(core.CONTRACT, manifest.contracts.geometry);
assert.equal(phase2.SAMPLING_CONTRACT, manifest.contracts.sampling);
assert.equal(phase2.EVIDENCE_CONTRACT, manifest.contracts.evidence);
assert.equal(phase2.SONIFICATION_CONTRACT, manifest.contracts.sonification);
assert.equal(phase2.CAPTURE_CONTRACT, manifest.contracts.capture);

for (const name of manifest.sealed_vectors.sampling_vector_names) {
  assert.ok(vectors.sampling_vectors[name], `missing sealed sampling vector: ${name}`);
}
assert.equal(vectors.receipt_vector.sha256, manifest.sealed_vectors.receipt_sha256);
assert.equal(manifest.conformance.javascript_reference, "included-and-tested");
assert.equal(manifest.conformance.cpu_wasm, "not-in-v1.0.0");
assert.equal(manifest.conformance.gpu, "not-in-v1.0.0");
assert.equal(manifest.provenance.retired_geometry_imported, false);
assert.equal(manifest.claim_boundaries.global_tube_embeddedness, "not-claimed");
assert.equal(manifest.rsh_handoff.target_formal_surface, "RSH-GLUBALL-FORMAL-V1");
assert.equal(manifest.rsh_handoff.required_tag, "v1.0.0");
assert.equal(manifest.rsh_handoff.verify_tag_before_import, true);

assert.equal(agent.project.status, "v1.0.0-release-candidate");
assert.equal(agent.release_candidate.version, "1.0.0");
assert.equal(agent.release_candidate.tag, "v1.0.0");
assert.equal(agent.release_candidate.manifest, "release/manifest-v1.0.0.json");
assert.equal(agent.rsh_handoff.current_gate_status.rsh_integration_allowed, "conditional-on-v1.0.0-tag-verification");

for (const document of [roadmap, readme, changelog, releaseNotes]) {
  assert.ok(document.includes("v1.0.0"), "release documentation must name v1.0.0");
  assert.ok(document.includes("RSH-GLUBALL-FORMAL-V1"), "release documentation must preserve the RSH handoff identifier");
}
assert.ok(readme.includes("release/manifest-v1.0.0.json"));
assert.ok(roadmap.includes("tests/release-preflight.mjs"));

console.log("GLUBALL v1.0.0 release preflight: PASS");
