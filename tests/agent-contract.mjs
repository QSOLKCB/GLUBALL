import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const contract = JSON.parse(await readFile(new URL("../docs/AI_AGENT_CONTRACT.json", import.meta.url), "utf8"));
const manifest = JSON.parse(await readFile(new URL("../release/manifest-v1.0.0.json", import.meta.url), "utf8"));
const roadmap = await readFile(new URL("../ROADMAP.md", import.meta.url), "utf8");
const agents = await readFile(new URL("../AGENTS.md", import.meta.url), "utf8");
const vectors = JSON.parse(await readFile(new URL("../test-vectors/phase2-v1.json", import.meta.url), "utf8"));

assert.equal(contract.schema, "gluball-agent-contract/1");
assert.equal(contract.project.name, "GLUBALL");
assert.equal(contract.project.canonical_geometry_contract, "GLUBALL-KNOT-V1");
assert.equal(contract.project.status, "v1.0.0-release-candidate");

assert.equal(contract.release_candidate.version, "1.0.0");
assert.equal(contract.release_candidate.tag, "v1.0.0");
assert.equal(contract.release_candidate.manifest, "release/manifest-v1.0.0.json");
assert.equal(contract.release_candidate.implementation_versions["gluball-core.js"], "1.0.0");
assert.equal(contract.release_candidate.implementation_versions["phase2-core.js"], "1.0.0");
assert.ok(contract.release_candidate.excluded_runtime_surfaces.includes("cpu-wasm"));
assert.ok(contract.release_candidate.excluded_runtime_surfaces.includes("gpu"));
assert.equal(manifest.release.version, contract.release_candidate.version);
assert.equal(manifest.release.tag, contract.release_candidate.tag);

assert.deepEqual(contract.canonical_geometry.parameters, {
  p: 2,
  q: 3,
  R: 2.1,
  r: 0.85,
  rho: 0.34,
  mesh_u: 96,
  mesh_v: 18
});

assert.equal(contract.provenance_boundary.retired_geometry_status, "forbidden-in-canonical-implementation");
assert.equal(contract.provenance_boundary.historical_source_policy, "reference-only");
assert.ok(contract.phase_2.implemented_contracts.includes("GLUBALL-SAMPLING-V1"));
assert.ok(contract.phase_2.implemented_contracts.includes("GLUBALL-EVIDENCE-V1"));
assert.ok(contract.phase_2.implemented_contracts.includes("GLUBALL-SONIFICATION-V1"));
assert.ok(contract.phase_2.implemented_contracts.includes("GLUBALL-CAPTURE-PROFILES-V1"));
assert.equal(contract.phase_2.sampling.canonical_policy, "uniform-floor");
assert.equal(contract.phase_2.sampling.integer_arithmetic, "JavaScript-BigInt");
assert.equal(contract.phase_2.sampling.optional_policy.name, "phi-weyl-64");
assert.equal(contract.phase_2.sampling.optional_policy.may_replace_canonical_silently, false);
assert.equal(contract.phase_2.evidence.hash, "SHA-256");
assert.equal(contract.phase_2.evidence.domain, "GLUBALL-EVIDENCE-V1\0");
assert.equal(contract.phase_2.evidence.domain.charCodeAt(contract.phase_2.evidence.domain.length - 1), 0);
assert.match(contract.phase_2.evidence.schema_validation, /rejects envelopes missing/i);
assert.equal(contract.phase_2.evidence.claim_boundary, "deterministic-identity-evidence-only");
assert.equal(contract.phase_2.metadata.topology_status, "non-topological-metadata-only");
assert.equal(contract.phase_2.capture.json_profile_authority, "canonical-evidence-bundle");
assert.equal(contract.phase_2.capture.json_receipt_scope, "embedded-evidence-envelope");
assert.equal(contract.phase_2.capture.png_binary_cross_runtime_canonical, false);
assert.equal(contract.phase_2.capture.webm_binary_cross_runtime_canonical, false);
assert.equal(contract.phase_2.portable_reference.accelerator_authority, "residual-sidecar-only");
assert.equal(contract.phase_2.portable_reference.wasm_status, "deferred-not-in-v1.0.0");
assert.equal(contract.phase_2.portable_reference.gpu_status, "deferred-not-in-v1.0.0");

assert.equal(vectors.contracts.geometry, "GLUBALL-KNOT-V1");
assert.equal(vectors.contracts.sampling, "GLUBALL-SAMPLING-V1");
assert.equal(vectors.contracts.evidence, "GLUBALL-EVIDENCE-V1");
assert.match(vectors.receipt_vector.sha256, /^[0-9a-f]{64}$/);
assert.equal(vectors.receipt_vector.sha256, manifest.sealed_vectors.receipt_sha256);

assert.equal(contract.rsh_handoff.target_repository, "QSOLKCB/RSH");
assert.equal(contract.rsh_handoff.integration_mode, "additive-geometry-family");
assert.equal(contract.rsh_handoff.existing_formal_surface, "RSH-FORMAL-V1");
assert.equal(contract.rsh_handoff.new_formal_surface, "RSH-GLUBALL-FORMAL-V1");
assert.equal(contract.rsh_handoff.must_not_replace, "Robitaille-Slade helix");
assert.equal(contract.rsh_handoff.current_gate_status.rsh_integration_allowed, "conditional-on-v1.0.0-tag-verification");
assert.match(contract.rsh_handoff.current_gate_status.tagged_contract_freeze, /v1\.0\.0-tag/);
assert.ok(contract.rsh_handoff.entry_gates.length >= 8);
assert.ok(contract.rsh_handoff.initial_theorem_targets.includes("centreline_2pi_periodicity"));
assert.ok(contract.rsh_handoff.initial_theorem_targets.includes("tube_radius_invariance"));
assert.ok(contract.rsh_handoff.initial_theorem_targets.includes("exact_logical_to_rendered_uniform_floor_properties"));
assert.ok(contract.rsh_handoff.deferred_targets.includes("global_tube_embeddedness_non_self_intersection"));
assert.match(contract.rsh_handoff.embeddedness_policy, /separate theorem/i);

for (const required of [
  "GLUBALL-SAMPLING-V1",
  "GLUBALL-EVIDENCE-V1",
  "GLUBALL-SONIFICATION-V1",
  "GLUBALL-CAPTURE-PROFILES-V1",
  "RSH-GLUBALL-FORMAL-V1",
  "global tube embeddedness / non-self-intersection",
  "release/manifest-v1.0.0.json",
  "tests/release-preflight.mjs"
]) {
  assert.ok(roadmap.includes(required), `ROADMAP.md must mention ${required}`);
}

for (const required of [
  "docs/AI_AGENT_CONTRACT.json",
  "release/manifest-v1.0.0.json",
  "reference material only",
  "phase2-core.js",
  "RSH-GLUBALL-FORMAL-V1",
  "node tests/phase2.mjs",
  "node tests/agent-contract.mjs",
  "node tests/release-preflight.mjs"
]) {
  assert.ok(agents.includes(required), `AGENTS.md must mention ${required}`);
}

assert.deepEqual(contract.validation.commands, [
  "node tests/smoke.mjs",
  "node tests/phase2.mjs",
  "node tests/agent-contract.mjs",
  "node tests/release-preflight.mjs"
]);

console.log("GLUBALL AI agent contract: PASS");
