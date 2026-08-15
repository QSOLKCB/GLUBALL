// SPDX-License-Identifier: MPL-2.0
(function (global, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.GluballPhase2 = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "1.0.0";
  const SAMPLING_CONTRACT = "GLUBALL-SAMPLING-V1";
  const EVIDENCE_CONTRACT = "GLUBALL-EVIDENCE-V1";
  const SONIFICATION_CONTRACT = "GLUBALL-SONIFICATION-V1";
  const CAPTURE_CONTRACT = "GLUBALL-CAPTURE-PROFILES-V1";
  const UNIFORM_FLOOR = "uniform-floor";
  const PHI_WEYL_64 = "phi-weyl-64";
  const PHI64 = 0x9e3779b97f4a7c15n;
  const UINT64 = 1n << 64n;
  const MAX_RENDERED = 1_000_000;
  const RECEIPT_DOMAIN = `${EVIDENCE_CONTRACT}\0`;

  const CAPTURE_PROFILES = Object.freeze({
    "json-canonical-v1": Object.freeze({
      contract: CAPTURE_CONTRACT,
      mediaType: "application/json",
      deterministicPayload: true,
      binaryCrossRuntimeCanonical: true,
      authority: "canonical-evidence-bundle",
      receiptScope: "embedded-evidence-envelope"
    }),
    "png-canvas-v1": Object.freeze({
      contract: CAPTURE_CONTRACT,
      mediaType: "image/png",
      deterministicPayload: false,
      binaryCrossRuntimeCanonical: false,
      authority: "presentation-sidecar"
    }),
    "webm-mediarecorder-v1": Object.freeze({
      contract: CAPTURE_CONTRACT,
      mediaType: "video/webm",
      deterministicPayload: false,
      binaryCrossRuntimeCanonical: false,
      authority: "presentation-sidecar"
    })
  });

  function exactPositiveInteger(value, label) {
    if (typeof value === "bigint") {
      if (value <= 0n) throw new RangeError(`${label} must be greater than zero`);
      return value;
    }
    if (typeof value === "string" && /^\d+$/.test(value)) {
      const result = BigInt(value);
      if (result <= 0n) throw new RangeError(`${label} must be greater than zero`);
      return result;
    }
    if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
      return BigInt(value);
    }
    throw new TypeError(`${label} must be a positive exact integer`);
  }

  function renderedInteger(value, label = "renderedCount") {
    const numeric = Number(value);
    if (!Number.isSafeInteger(numeric) || numeric <= 0 || numeric > MAX_RENDERED) {
      throw new RangeError(`${label} must be an integer in [1, ${MAX_RENDERED}]`);
    }
    return numeric;
  }

  function normalizeSamplingConfig(input) {
    const source = input || {};
    const logicalCount = exactPositiveInteger(source.logicalCount ?? (1n << 24n), "logicalCount");
    const renderedCount = renderedInteger(source.renderedCount ?? 96);
    if (BigInt(renderedCount) > logicalCount) {
      throw new RangeError("renderedCount may not exceed logicalCount");
    }
    const policy = source.policy ?? UNIFORM_FLOOR;
    if (policy !== UNIFORM_FLOOR && policy !== PHI_WEYL_64) {
      throw new RangeError(`unknown sampling policy: ${policy}`);
    }
    return Object.freeze({ logicalCount, renderedCount, policy });
  }

  function renderedIndex(value, renderedCount) {
    const index = Number(value);
    if (!Number.isSafeInteger(index) || index < 0 || index >= renderedCount) {
      throw new RangeError(`rendered index ${value} outside [0, ${renderedCount})`);
    }
    return index;
  }

  function uniformFloorIndex(index, renderedCount, logicalCount) {
    return (BigInt(index) * logicalCount) / BigInt(renderedCount);
  }

  function phiWeyl64Index(index, logicalCount) {
    const word = (BigInt(index) * PHI64) & (UINT64 - 1n);
    return (word * logicalCount) >> 64n;
  }

  function logicalIndexForRendered(configInput, renderedIndexInput) {
    const config = normalizeSamplingConfig(configInput);
    const index = renderedIndex(renderedIndexInput, config.renderedCount);
    return config.policy === UNIFORM_FLOOR
      ? uniformFloorIndex(index, config.renderedCount, config.logicalCount)
      : phiWeyl64Index(index, config.logicalCount);
  }

  function serializableSamplingConfig(configInput) {
    const config = normalizeSamplingConfig(configInput);
    return Object.freeze({
      contract: SAMPLING_CONTRACT,
      policy: config.policy,
      logicalCount: config.logicalCount.toString(),
      renderedCount: config.renderedCount
    });
  }

  function sampleVector(configInput, indicesInput) {
    const config = normalizeSamplingConfig(configInput);
    const indices = indicesInput == null
      ? Array.from({ length: config.renderedCount }, (_, index) => index)
      : Array.from(indicesInput, (value) => renderedIndex(value, config.renderedCount));
    return Object.freeze(indices.map((index) => Object.freeze({
      renderedIndex: index,
      logicalIndex: logicalIndexForRendered(config, index).toString()
    })));
  }

  function partitionRanges(itemCountInput, workersInput) {
    const itemCount = renderedInteger(itemCountInput, "itemCount");
    const requestedWorkers = renderedInteger(workersInput, "workers");
    const workers = Math.min(itemCount, requestedWorkers);
    const base = Math.floor(itemCount / workers);
    const remainder = itemCount % workers;
    let cursor = 0;
    const ranges = [];
    for (let worker = 0; worker < workers; worker += 1) {
      const length = base + (worker < remainder ? 1 : 0);
      const start = cursor;
      const end = start + length;
      ranges.push(Object.freeze({ worker, start, end, length }));
      cursor = end;
    }
    if (cursor !== itemCount) throw new Error("partition coverage invariant failed");
    return Object.freeze(ranges);
  }

  function batchPlan(configInput, workersInput) {
    const config = normalizeSamplingConfig(configInput);
    return Object.freeze(partitionRanges(config.renderedCount, workersInput).map((range) => {
      const first = logicalIndexForRendered(config, range.start);
      const last = logicalIndexForRendered(config, range.end - 1);
      return Object.freeze({
        ...range,
        firstLogicalIndex: first.toString(),
        lastLogicalIndex: last.toString()
      });
    }));
  }

  function trialityLane(renderedIndexInput) {
    const index = Number(renderedIndexInput);
    if (!Number.isSafeInteger(index) || index < 0) throw new RangeError("renderedIndex must be a non-negative integer");
    return index % 3;
  }

  function tritWidthForLogicalCount(logicalCountInput) {
    let value = exactPositiveInteger(logicalCountInput, "logicalCount") - 1n;
    let width = 1;
    while (value >= 3n) {
      value /= 3n;
      width += 1;
    }
    return width;
  }

  function toTritString(valueInput, widthInput) {
    let value;
    if (typeof valueInput === "bigint") value = valueInput;
    else if (typeof valueInput === "string" && /^\d+$/.test(valueInput)) value = BigInt(valueInput);
    else if (typeof valueInput === "number" && Number.isSafeInteger(valueInput) && valueInput >= 0) value = BigInt(valueInput);
    else throw new TypeError("value must be a non-negative exact integer");
    if (value < 0n) throw new RangeError("value must be non-negative");
    let digits = value.toString(3);
    if (widthInput != null) {
      const width = Number(widthInput);
      if (!Number.isSafeInteger(width) || width <= 0) throw new RangeError("width must be positive integer");
      if (digits.length > width) throw new RangeError("value does not fit requested trit width");
      digits = digits.padStart(width, "0");
    }
    return digits;
  }

  function sampleMetadata(configInput, renderedIndexInput) {
    const config = normalizeSamplingConfig(configInput);
    const index = renderedIndex(renderedIndexInput, config.renderedCount);
    const logicalIndex = logicalIndexForRendered(config, index);
    const tritWidth = tritWidthForLogicalCount(config.logicalCount);
    return Object.freeze({
      samplingContract: SAMPLING_CONTRACT,
      renderedIndex: index,
      logicalIndex: logicalIndex.toString(),
      trialityLane: trialityLane(index),
      ternaryAddress: toTritString(logicalIndex, tritWidth),
      ternaryIsTopology: false
    });
  }

  function sonificationEvent(configInput, renderedIndexInput, optionsInput) {
    const options = optionsInput || {};
    const metadata = sampleMetadata(configInput, renderedIndexInput);
    const laneOffsets = [0, 4, 7];
    const finalTrit = Number(metadata.ternaryAddress.at(-1));
    const tick = Number(options.tick ?? 0);
    const durationTicks = Number(options.durationTicks ?? 120);
    if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError("tick must be a non-negative integer");
    if (!Number.isSafeInteger(durationTicks) || durationTicks <= 0) throw new RangeError("durationTicks must be positive integer");
    const midiNote = 60 + laneOffsets[metadata.trialityLane] + (finalTrit - 1) * 12;
    const velocity = 72 + Number(BigInt(metadata.logicalIndex) % 32n);
    const panPermille = [-750, 0, 750][metadata.trialityLane];
    return Object.freeze({
      contract: SONIFICATION_CONTRACT,
      tick,
      durationTicks,
      renderedIndex: metadata.renderedIndex,
      logicalIndex: metadata.logicalIndex,
      trialityLane: metadata.trialityLane,
      ternaryDigit: finalTrit,
      midiNote,
      velocity,
      panPermille,
      metadataOnly: true
    });
  }

  function sonificationStream(configInput, optionsInput) {
    const config = normalizeSamplingConfig(configInput);
    const options = optionsInput || {};
    const count = Math.min(renderedInteger(options.count ?? config.renderedCount, "count"), config.renderedCount);
    const startTick = Number(options.startTick ?? 0);
    const ticksPerEvent = Number(options.ticksPerEvent ?? 120);
    if (!Number.isSafeInteger(startTick) || startTick < 0) throw new RangeError("startTick must be non-negative integer");
    if (!Number.isSafeInteger(ticksPerEvent) || ticksPerEvent <= 0) throw new RangeError("ticksPerEvent must be positive integer");
    return Object.freeze(Array.from({ length: count }, (_, index) =>
      sonificationEvent(config, index, { tick: startTick + index * ticksPerEvent, durationTicks: ticksPerEvent })
    ));
  }

  function unsupportedCanonicalValue(value) {
    return value === undefined || typeof value === "function" || typeof value === "symbol";
  }

  function canonicalize(value, path = "$", seen = new Set()) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "number") {
      if (!Number.isFinite(value)) throw new TypeError(`${path} contains a non-finite number`);
      return Object.is(value, -0) ? 0 : value;
    }
    if (typeof value === "object") {
      if (seen.has(value)) throw new TypeError(`${path} contains a cycle`);
      seen.add(value);
      try {
        if (Array.isArray(value)) {
          return value.map((item, index) => canonicalize(item, `${path}[${index}]`, seen));
        }
        const output = Object.create(null);
        for (const key of Object.keys(value).sort()) {
          const item = value[key];
          if (unsupportedCanonicalValue(item)) {
            throw new TypeError(`${path}.${key} is not canonical-JSON compatible`);
          }
          Object.defineProperty(output, key, {
            value: canonicalize(item, `${path}.${key}`, seen),
            enumerable: true,
            writable: true,
            configurable: true
          });
        }
        return output;
      } finally {
        seen.delete(value);
      }
    }
    throw new TypeError(`${path} is not canonical-JSON compatible`);
  }

  function canonicalJSONStringify(value) {
    const seen = new Set();

    function encode(current, path) {
      if (current === null) return "null";
      if (typeof current === "string" || typeof current === "boolean") return JSON.stringify(current);
      if (typeof current === "bigint") return JSON.stringify(current.toString());
      if (typeof current === "number") {
        if (!Number.isFinite(current)) throw new TypeError(`${path} contains a non-finite number`);
        return JSON.stringify(Object.is(current, -0) ? 0 : current);
      }
      if (typeof current === "object") {
        if (seen.has(current)) throw new TypeError(`${path} contains a cycle`);
        seen.add(current);
        try {
          if (Array.isArray(current)) {
            const items = current.map((item, index) => encode(item, `${path}[${index}]`));
            return `[${items.join(",")}]`;
          }
          const pairs = [];
          for (const key of Object.keys(current).sort()) {
            const item = current[key];
            if (unsupportedCanonicalValue(item)) {
              throw new TypeError(`${path}.${key} is not canonical-JSON compatible`);
            }
            pairs.push(`${JSON.stringify(key)}:${encode(item, `${path}.${key}`)}`);
          }
          return `{${pairs.join(",")}}`;
        } finally {
          seen.delete(current);
        }
      }
      throw new TypeError(`${path} is not canonical-JSON compatible`);
    }

    return encode(value, "$");
  }

  function utf8Bytes(text) {
    return new TextEncoder().encode(text);
  }

  function hex(bytes) {
    return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
  }

  async function sha256Hex(bytes) {
    if (!globalThis.crypto || !globalThis.crypto.subtle) {
      throw new Error("WebCrypto SubtleCrypto is required for GLUBALL-EVIDENCE-V1 receipts");
    }
    return hex(await globalThis.crypto.subtle.digest("SHA-256", bytes));
  }

  function makeEvidenceEnvelope(input) {
    const source = input || {};
    const geometrySnapshot = canonicalize(source.geometrySnapshot ?? {});
    if (geometrySnapshot.contract !== "GLUBALL-KNOT-V1") {
      throw new RangeError("geometrySnapshot.contract must be GLUBALL-KNOT-V1");
    }
    const sampling = serializableSamplingConfig(source.sampling);
    const tick = Number(source.tick ?? 0);
    if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError("tick must be a non-negative integer");
    const implementation = canonicalize(source.implementation ?? { name: "gluball-js", version: VERSION });
    const runtime = canonicalize(source.runtime ?? { name: "unspecified", version: "unspecified" });
    return Object.freeze({
      evidenceContract: EVIDENCE_CONTRACT,
      geometry: geometrySnapshot,
      implementation,
      runtime,
      sampling,
      tick,
      claimBoundary: "deterministic-identity-evidence-only"
    });
  }

  function requireRecord(value, label) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new TypeError(`${label} must be an object`);
    }
    return value;
  }

  function requireOwn(record, key, label) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      throw new TypeError(`${label}.${key} is required`);
    }
    return record[key];
  }

  function requireNonEmptyString(value, label) {
    if (typeof value !== "string" || value.length === 0) {
      throw new TypeError(`${label} must be a non-empty string`);
    }
    return value;
  }

  function validateEvidenceEnvelope(envelopeInput) {
    const envelope = canonicalize(envelopeInput);
    requireRecord(envelope, "evidence envelope");
    if (requireOwn(envelope, "evidenceContract", "evidence envelope") !== EVIDENCE_CONTRACT) {
      throw new RangeError(`evidenceContract must be ${EVIDENCE_CONTRACT}`);
    }

    const geometry = requireRecord(requireOwn(envelope, "geometry", "evidence envelope"), "geometry");
    if (requireOwn(geometry, "contract", "geometry") !== "GLUBALL-KNOT-V1") {
      throw new RangeError("geometry.contract must be GLUBALL-KNOT-V1");
    }
    const parameters = requireRecord(requireOwn(geometry, "parameters", "geometry"), "geometry.parameters");
    for (const key of ["majorRadius", "minorRadius", "tubeRadius", "uSegments", "vSegments"]) {
      const value = requireOwn(parameters, key, "geometry.parameters");
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new TypeError(`geometry.parameters.${key} must be finite numeric data`);
      }
    }
    for (const key of ["uSegments", "vSegments"]) {
      if (!Number.isSafeInteger(parameters[key]) || parameters[key] <= 0) {
        throw new RangeError(`geometry.parameters.${key} must be a positive integer`);
      }
    }

    const sampling = requireRecord(requireOwn(envelope, "sampling", "evidence envelope"), "sampling");
    if (requireOwn(sampling, "contract", "sampling") !== SAMPLING_CONTRACT) {
      throw new RangeError(`sampling.contract must be ${SAMPLING_CONTRACT}`);
    }
    const samplingPolicy = requireOwn(sampling, "policy", "sampling");
    const logicalCount = requireOwn(sampling, "logicalCount", "sampling");
    const renderedCount = requireOwn(sampling, "renderedCount", "sampling");
    const normalizedSampling = serializableSamplingConfig({
      policy: samplingPolicy,
      logicalCount,
      renderedCount
    });
    if (sampling.policy !== normalizedSampling.policy ||
        sampling.logicalCount !== normalizedSampling.logicalCount ||
        sampling.renderedCount !== normalizedSampling.renderedCount) {
      throw new RangeError("sampling fields are not in canonical GLUBALL-SAMPLING-V1 form");
    }

    const tick = requireOwn(envelope, "tick", "evidence envelope");
    if (!Number.isSafeInteger(tick) || tick < 0) {
      throw new RangeError("tick must be a non-negative integer");
    }

    const implementation = requireRecord(requireOwn(envelope, "implementation", "evidence envelope"), "implementation");
    requireNonEmptyString(requireOwn(implementation, "name", "implementation"), "implementation.name");
    requireNonEmptyString(requireOwn(implementation, "version", "implementation"), "implementation.version");

    const runtime = requireRecord(requireOwn(envelope, "runtime", "evidence envelope"), "runtime");
    requireNonEmptyString(requireOwn(runtime, "name", "runtime"), "runtime.name");
    requireNonEmptyString(requireOwn(runtime, "version", "runtime"), "runtime.version");

    if (requireOwn(envelope, "claimBoundary", "evidence envelope") !== "deterministic-identity-evidence-only") {
      throw new RangeError("claimBoundary must be deterministic-identity-evidence-only");
    }

    return envelope;
  }

  async function evidenceReceipt(envelopeInput) {
    const envelope = validateEvidenceEnvelope(envelopeInput);
    const canonicalJSON = canonicalJSONStringify(envelope);
    const domainBytes = utf8Bytes(RECEIPT_DOMAIN);
    const payloadBytes = utf8Bytes(canonicalJSON);
    const bytes = new Uint8Array(domainBytes.length + payloadBytes.length);
    bytes.set(domainBytes, 0);
    bytes.set(payloadBytes, domainBytes.length);
    return Object.freeze({
      contract: EVIDENCE_CONTRACT,
      algorithm: "SHA-256",
      domain: RECEIPT_DOMAIN,
      payloadBytes: payloadBytes.length,
      hashedBytes: bytes.length,
      sha256: await sha256Hex(bytes)
    });
  }

  function captureManifest(input) {
    const source = input || {};
    const profileName = source.profile ?? "json-canonical-v1";
    const profile = CAPTURE_PROFILES[profileName];
    if (!profile) throw new RangeError(`unknown capture profile: ${profileName}`);
    const tick = Number(source.tick ?? 0);
    if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError("tick must be a non-negative integer");
    return Object.freeze({
      contract: CAPTURE_CONTRACT,
      profileName,
      profile,
      tick,
      presentation: canonicalize(source.presentation ?? {}),
      canonicalGeometryStateIncluded: false,
      note: profile.binaryCrossRuntimeCanonical
        ? "canonical payload; any embedded evidence receipt covers the evidence envelope named by receiptScope"
        : "presentation settings are reproducible; encoded binary bytes are runtime-dependent"
    });
  }

  const STRESS_PROFILES = Object.freeze({
    baseline: Object.freeze({ logicalCount: "16777216", renderedCount: 96, policy: UNIFORM_FLOOR }),
    dense: Object.freeze({ logicalCount: "16777216", renderedCount: 1024, policy: UNIFORM_FLOOR }),
    large: Object.freeze({ logicalCount: "4294967296", renderedCount: 4096, policy: UNIFORM_FLOOR }),
    phiDense: Object.freeze({ logicalCount: "16777216", renderedCount: 1024, policy: PHI_WEYL_64 })
  });

  return Object.freeze({
    VERSION,
    SAMPLING_CONTRACT,
    EVIDENCE_CONTRACT,
    SONIFICATION_CONTRACT,
    CAPTURE_CONTRACT,
    UNIFORM_FLOOR,
    PHI_WEYL_64,
    PHI64,
    MAX_RENDERED,
    RECEIPT_DOMAIN,
    CAPTURE_PROFILES,
    STRESS_PROFILES,
    normalizeSamplingConfig,
    serializableSamplingConfig,
    logicalIndexForRendered,
    sampleVector,
    partitionRanges,
    batchPlan,
    trialityLane,
    tritWidthForLogicalCount,
    toTritString,
    sampleMetadata,
    sonificationEvent,
    sonificationStream,
    canonicalize,
    canonicalJSONStringify,
    sha256Hex,
    makeEvidenceEnvelope,
    validateEvidenceEnvelope,
    evidenceReceipt,
    captureManifest
  });
});