import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const contract = JSON.parse(await readFile(new URL("../docs/AI_AGENT_CONTRACT.json", import.meta.url), "utf8"));
const roadmap = await readFile(new URL("../ROADMAP.md", import.meta.url), "utf8");
const agents = await readFile(new URL("../AGENTS.md", import.meta.url), "utf8");

assert.equal(contract.schema, "gluball-agent-contract/1");
assert.equal(contract.project.name, "GLUBALL");
assert.equal(contract.project.canonical_geometry_contract, "GLUBALL-KNOT-V1");

assert.deepEqual(contract.canonical_geometry.parameters, {
  p: 2,
  q: 3,
  R: 2.1,
  r: 0.85,
  rho: 0.34,
  mesh_u: 96,
  mesh_v: 18,
});

assert.equal(contract.provenance_boundary.retired_geometry_status, "forbidden-in-canonical-implementation");
assert.equal(contract.provenance_boundary.historical_source_policy, "reference-only");
assert.equal(contract.phase_2.planned_contracts.includes("GLUBALL-SAMPLING-V1"), true);
assert.equal(contract.phase_2.planned_contracts.includes("GLUBALL-EVIDENCE-V1"), true);

assert.equal(contract.rsh_handoff.target_repository, "QSOLKCB/RSH");
assert.equal(contract.rsh_handoff.integration_mode, "additive-geometry-family");
assert.equal(contract.rsh_handoff.existing_formal_surface, "RSH-FORMAL-V1");
assert.equal(contract.rsh_handoff.new_formal_surface, "RSH-GLUBALL-FORMAL-V1");
assert.equal(contract.rsh_handoff.must_not_replace, "Robitaille-Slade helix");
assert.ok(contract.rsh_handoff.entry_gates.length >= 8);
assert.ok(contract.rsh_handoff.initial_theorem_targets.includes("centreline_2pi_periodicity"));
assert.ok(contract.rsh_handoff.initial_theorem_targets.includes("tube_radius_invariance"));
assert.ok(contract.rsh_handoff.deferred_targets.includes("global_tube_embeddedness_non_self_intersection"));
assert.match(contract.rsh_handoff.embeddedness_policy, /separate theorem/i);

for (const required of [
  "GLUBALL-SAMPLING-V1",
  "GLUBALL-EVIDENCE-V1",
  "RSH-GLUBALL-FORMAL-V1",
  "global tube embeddedness / non-self-intersection",
]) {
  assert.ok(roadmap.includes(required), `ROADMAP.md must mention ${required}`);
}

for (const required of [
  "docs/AI_AGENT_CONTRACT.json",
  "reference material only",
  "RSH-GLUBALL-FORMAL-V1",
  "node tests/agent-contract.mjs",
]) {
  assert.ok(agents.includes(required), `AGENTS.md must mention ${required}`);
}

assert.deepEqual(contract.validation.commands, [
  "node tests/smoke.mjs",
  "node tests/agent-contract.mjs",
]);

console.log("GLUBALL AI agent contract: PASS");
