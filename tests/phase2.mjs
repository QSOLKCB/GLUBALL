import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const phase2 = require("../phase2-core.js");
const vectors = JSON.parse(fs.readFileSync(new URL("../test-vectors/phase2-v1.json", import.meta.url), "utf8"));

assert.equal(phase2.SAMPLING_CONTRACT, "GLUBALL-SAMPLING-V1");
assert.equal(phase2.EVIDENCE_CONTRACT, "GLUBALL-EVIDENCE-V1");
assert.equal(phase2.SONIFICATION_CONTRACT, "GLUBALL-SONIFICATION-V1");
assert.equal(phase2.CAPTURE_CONTRACT, "GLUBALL-CAPTURE-PROFILES-V1");
assert.equal(phase2.RECEIPT_DOMAIN, "GLUBALL-EVIDENCE-V1\0");
assert.equal(phase2.RECEIPT_DOMAIN.charCodeAt(phase2.RECEIPT_DOMAIN.length - 1), 0);

for (const fixture of Object.values(vectors.sampling_vectors)) {
  const indices = fixture.samples.map((sample) => sample.renderedIndex);
  assert.deepEqual(phase2.sampleVector(fixture.config, indices), fixture.samples);
}

const uniform = phase2.normalizeSamplingConfig(vectors.sampling_vectors.uniform_2p24_to_96.config);
const fullUniform = phase2.sampleVector(uniform);
assert.equal(fullUniform.length, 96);
assert.equal(fullUniform[0].logicalIndex, "0");
for (let index = 1; index < fullUniform.length; index += 1) {
  assert.ok(BigInt(fullUniform[index - 1].logicalIndex) < BigInt(fullUniform[index].logicalIndex), "uniform mapping must be strictly ordered");
}
assert.ok(BigInt(fullUniform.at(-1).logicalIndex) < uniform.logicalCount);

const partitions = phase2.partitionRanges(96, 7);
assert.equal(partitions[0].start, 0);
assert.equal(partitions.at(-1).end, 96);
assert.equal(partitions.reduce((sum, range) => sum + range.length, 0), 96);
for (let index = 1; index < partitions.length; index += 1) {
  assert.equal(partitions[index - 1].end, partitions[index].start, "partitions must be gapless and non-overlapping");
}
assert.deepEqual(phase2.batchPlan(uniform, 7).map(({ start, end }) => [start, end]), partitions.map(({ start, end }) => [start, end]));

assert.throws(() => phase2.normalizeSamplingConfig({ logicalCount: 4, renderedCount: 5 }), /may not exceed/);
assert.throws(() => phase2.logicalIndexForRendered(uniform, 96), /outside/);
assert.throws(() => phase2.partitionRanges(96, 0), /workers/);
assert.throws(() => phase2.normalizeSamplingConfig({ logicalCount: 10, renderedCount: 4, policy: "surprise-me" }), /unknown sampling policy/);

const phi = phase2.normalizeSamplingConfig(vectors.sampling_vectors.phi_2p24_to_96.config);
const fullPhi = phase2.sampleVector(phi);
assert.equal(new Set(fullPhi.map((sample) => sample.logicalIndex)).size, fullPhi.length, "sealed phi vector must not collide");
for (const sample of fullPhi) assert.ok(BigInt(sample.logicalIndex) < phi.logicalCount);

assert.equal(phase2.trialityLane(0), 0);
assert.equal(phase2.trialityLane(1), 1);
assert.equal(phase2.trialityLane(2), 2);
assert.equal(phase2.trialityLane(3), 0);
const metadata = phase2.sampleMetadata(uniform, 48);
assert.equal(metadata.logicalIndex, "8388608");
assert.equal(metadata.ternaryIsTopology, false);
assert.equal(BigInt(parseInt(metadata.ternaryAddress, 3)), BigInt(metadata.logicalIndex));

const events = phase2.sonificationStream(uniform, { count: 5, startTick: 0, ticksPerEvent: 120 });
assert.deepEqual(events.map((event) => event.tick), [0, 120, 240, 360, 480]);
assert.deepEqual(events.map((event) => event.midiNote), [48, 52, 67, 72, 76]);
assert.ok(events.every((event) => event.metadataOnly === true));

const canonicalA = phase2.canonicalJSONStringify({ z: 1, a: { y: 2, x: 3 } });
const canonicalB = phase2.canonicalJSONStringify({ a: { x: 3, y: 2 }, z: 1 });
assert.equal(canonicalA, canonicalB, "canonical JSON must ignore object insertion order");
assert.equal(
  phase2.canonicalJSONStringify(JSON.parse('{"2":"two","10":"ten"}')),
  '{"10":"ten","2":"two"}',
  "integer-like keys must still use lexicographic order"
);
const protoPayload = JSON.parse('{"__proto__":{"kept":true},"a":1}');
assert.equal(
  phase2.canonicalJSONStringify(protoPayload),
  '{"__proto__":{"kept":true},"a":1}',
  "__proto__ must remain an own canonical JSON data key"
);
assert.ok(Object.prototype.hasOwnProperty.call(phase2.canonicalize(protoPayload), "__proto__"));
assert.throws(() => phase2.canonicalJSONStringify({ nope: Number.NaN }), /non-finite/);
const arrayCycle = [];
arrayCycle.push(arrayCycle);
assert.throws(() => phase2.canonicalJSONStringify(arrayCycle), /contains a cycle/);
assert.throws(() => phase2.canonicalize(arrayCycle), /contains a cycle/);

const geometrySnapshot = {
  contract: "GLUBALL-KNOT-V1",
  implementationVersion: "1.0.0-alpha.1",
  topology: { p: 2, q: 3, kind: "torus-knot-tube" },
  parameters: { majorRadius: 2.1, minorRadius: 0.85, tubeRadius: 0.34, uSegments: 96, vSegments: 18 },
  animation: { fixedStepHz: 60, pose: "integer-tick" }
};
const envelope = phase2.makeEvidenceEnvelope({
  geometrySnapshot,
  sampling: uniform,
  tick: vectors.receipt_vector.tick,
  implementation: vectors.receipt_vector.implementation,
  runtime: vectors.receipt_vector.runtime
});
assert.equal(envelope.geometry.contract, "GLUBALL-KNOT-V1");
assert.equal(envelope.sampling.contract, "GLUBALL-SAMPLING-V1");
assert.equal(envelope.claimBoundary, "deterministic-identity-evidence-only");
assert.deepEqual(phase2.validateEvidenceEnvelope(envelope), phase2.canonicalize(envelope));
const receipt = await phase2.evidenceReceipt(envelope);
assert.equal(receipt.sha256, vectors.receipt_vector.sha256);
assert.equal(receipt.payloadBytes, vectors.receipt_vector.payloadBytes);
assert.equal(receipt.hashedBytes, vectors.receipt_vector.hashedBytes);
await assert.rejects(
  phase2.evidenceReceipt({ evidenceContract: "GLUBALL-EVIDENCE-V1" }),
  /geometry is required/,
  "receipt boundary must reject incomplete V1 envelopes"
);

const changedTick = phase2.makeEvidenceEnvelope({
  geometrySnapshot,
  sampling: uniform,
  tick: vectors.receipt_vector.tick + 1,
  implementation: vectors.receipt_vector.implementation,
  runtime: vectors.receipt_vector.runtime
});
assert.notEqual((await phase2.evidenceReceipt(changedTick)).sha256, receipt.sha256, "tick must be receipt-bound");

const png = phase2.captureManifest({ profile: "png-canvas-v1", tick: 5, presentation: { width: 1920, height: 1080 } });
assert.equal(png.profile.authority, "presentation-sidecar");
assert.equal(png.profile.binaryCrossRuntimeCanonical, false);
const json = phase2.captureManifest({ profile: "json-canonical-v1", tick: 5 });
assert.equal(json.profile.binaryCrossRuntimeCanonical, true);
assert.equal(json.profile.authority, "canonical-evidence-bundle");
assert.equal(json.profile.receiptScope, "embedded-evidence-envelope");

for (const profile of Object.values(phase2.STRESS_PROFILES)) {
  const config = phase2.normalizeSamplingConfig(profile);
  const plan = phase2.batchPlan(config, 8);
  assert.equal(plan[0].start, 0);
  assert.equal(plan.at(-1).end, config.renderedCount);
}

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const appSource = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
assert.ok(html.indexOf('src="gluball-core.js"') < html.indexOf('src="phase2-core.js"'));
assert.ok(html.indexOf('src="phase2-core.js"') < html.indexOf('src="app.js"'));
assert.match(appSource, /u: \(i \+ 0\.5\) \/ uCount/, "wrapped seam midpoint fix must remain present");
assert.match(appSource, /if \(advanced\) \{\s*render\(\)/, "paused/high-refresh redraw guard must remain present");
assert.match(appSource, /const exportTick = tick/);
assert.match(appSource, /tick: exportTick/);
assert.match(appSource, /canonicalJSONStringify\(payload\)/);
assert.match(appSource, /gluball-evidence-v1-tick-\$\{exportTick\}/);
assert.match(appSource, /makeEvidenceEnvelope/);
assert.match(appSource, /evidenceReceipt/);

const source = fs.readFileSync(new URL("../phase2-core.js", import.meta.url), "utf8").toLowerCase();
for (const forbidden of ["outer gate", "vortexmouth", "centre-transfer", "center-transfer"]) {
  assert.equal(source.includes(forbidden), false, `phase2 core contains retired canonical term: ${forbidden}`);
}

console.log("GLUBALL Phase 2 deterministic/evidence suite passed");
