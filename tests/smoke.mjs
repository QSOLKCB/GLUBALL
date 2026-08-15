import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const core = require("../gluball-core.js");
const EPS = 1e-10;

function near(a, b, eps = EPS) {
  return Math.abs(a - b) <= eps;
}
function vecNear(a, b, eps = EPS) {
  return near(a.x, b.x, eps) && near(a.y, b.y, eps) && near(a.z, b.z, eps);
}

assert.equal(core.CONTRACT, "GLUBALL-KNOT-V1");
assert.equal(core.P, 2);
assert.equal(core.Q, 3);

for (let i = 0; i < 48; i += 1) {
  const t = core.TAU * i / 48;
  assert.ok(vecNear(core.centerline(t), core.centerline(t + core.TAU), 2e-9), "centreline must close");

  const shifted = core.centerline(t + core.TAU / 3);
  const rotated = core.rotateZ(core.centerline(t), 4 * Math.PI / 3);
  assert.ok(vecNear(shifted, rotated, 2e-9), "C3 rotational symmetry must hold");

  const derivative = core.centerlineDerivative(t);
  assert.ok(core.norm(derivative) > 1, "centreline derivative must remain nonzero");
  const basis = core.frame(t);
  assert.ok(near(core.norm(basis.normal), 1, 2e-12));
  assert.ok(near(core.norm(basis.tangent), 1, 2e-12));
  assert.ok(near(core.norm(basis.binormal), 1, 2e-12));
  assert.ok(near(core.dot(basis.tangent, basis.normal), 0, 2e-12));
  assert.ok(near(core.dot(basis.tangent, basis.binormal), 0, 2e-12));
  assert.ok(near(core.dot(basis.normal, basis.binormal), 0, 2e-12));

  for (let j = 0; j < 8; j += 1) {
    const v = core.TAU * j / 8;
    const surface = core.surfacePoint(t, v);
    const centre = core.centerline(t);
    assert.ok(near(core.norm(core.sub(surface, centre)), core.DEFAULTS.tubeRadius, 2e-12));
  }
}

const mesh = core.buildMesh();
assert.equal(mesh.vertices.length, core.DEFAULTS.uSegments);
assert.equal(mesh.vertices[0].length, core.DEFAULTS.vSegments);
assert.deepEqual(core.tickPose(12345), core.tickPose(12345), "integer-tick pose must be deterministic");
assert.deepEqual(core.canonicalSnapshot(), core.canonicalSnapshot(), "canonical snapshot must be stable");

// Semantic quarantine: the canonical geometry module must not contain any of
// the retired centre-transfer vocabulary. The public UI may mention its absence
// as provenance/humour, but the model itself must stay independent.
const source = fs.readFileSync(new URL("../gluball-core.js", import.meta.url), "utf8").toLowerCase();
for (const forbidden of ["mouth", "anus", "outer gate", "vortexmouth", "d1", "d2", "centre-transfer", "center-transfer"]) {
  assert.equal(source.includes(forbidden), false, `canonical core contains retired term: ${forbidden}`);
}

console.log("GLUBALL smoke suite passed");
