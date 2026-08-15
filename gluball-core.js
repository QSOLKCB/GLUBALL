// SPDX-License-Identifier: MPL-2.0
(function (global, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.GluballCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = "1.0.0";
  const CONTRACT = "GLUBALL-KNOT-V1";
  const TAU = Math.PI * 2;
  const P = 2;
  const Q = 3;
  const DEFAULTS = Object.freeze({
    majorRadius: 2.10,
    minorRadius: 0.85,
    tubeRadius: 0.34,
    uSegments: 96,
    vSegments: 18
  });

  function finite(value, label) {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new TypeError(`${label} must be finite`);
    return number;
  }

  function normalizeConfig(input) {
    const source = input || DEFAULTS;
    const majorRadius = finite(source.majorRadius ?? DEFAULTS.majorRadius, "majorRadius");
    const minorRadius = finite(source.minorRadius ?? DEFAULTS.minorRadius, "minorRadius");
    const tubeRadius = finite(source.tubeRadius ?? DEFAULTS.tubeRadius, "tubeRadius");
    const uSegments = Math.trunc(finite(source.uSegments ?? DEFAULTS.uSegments, "uSegments"));
    const vSegments = Math.trunc(finite(source.vSegments ?? DEFAULTS.vSegments, "vSegments"));

    if (!(majorRadius > minorRadius && minorRadius > 0)) {
      throw new RangeError("require majorRadius > minorRadius > 0");
    }
    if (!(tubeRadius > 0 && tubeRadius < minorRadius)) {
      throw new RangeError("require 0 < tubeRadius < minorRadius");
    }
    if (uSegments < 12 || uSegments > 512 || vSegments < 6 || vSegments > 128) {
      throw new RangeError("mesh segment counts are outside the supported range");
    }

    return Object.freeze({ majorRadius, minorRadius, tubeRadius, uSegments, vSegments });
  }

  function vec(x, y, z) { return { x, y, z }; }
  function add(a, b) { return vec(a.x + b.x, a.y + b.y, a.z + b.z); }
  function sub(a, b) { return vec(a.x - b.x, a.y - b.y, a.z - b.z); }
  function scale(a, s) { return vec(a.x * s, a.y * s, a.z * s); }
  function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function cross(a, b) {
    return vec(
      a.y * b.z - a.z * b.y,
      a.z * b.x - a.x * b.z,
      a.x * b.y - a.y * b.x
    );
  }
  function norm(a) { return Math.hypot(a.x, a.y, a.z); }
  function normalize(a) {
    const length = norm(a);
    if (!(length > 0)) throw new RangeError("cannot normalize a zero vector");
    return scale(a, 1 / length);
  }

  function centerline(tInput, configInput) {
    const t = finite(tInput, "t");
    const config = normalizeConfig(configInput);
    const major = P * t;
    const minor = Q * t;
    const radial = config.majorRadius + config.minorRadius * Math.cos(minor);
    return vec(
      radial * Math.cos(major),
      radial * Math.sin(major),
      config.minorRadius * Math.sin(minor)
    );
  }

  function centerlineDerivative(tInput, configInput) {
    const t = finite(tInput, "t");
    const config = normalizeConfig(configInput);
    const major = P * t;
    const minor = Q * t;
    const radial = config.majorRadius + config.minorRadius * Math.cos(minor);
    const radialPrime = -config.minorRadius * Q * Math.sin(minor);
    return vec(
      radialPrime * Math.cos(major) - P * radial * Math.sin(major),
      radialPrime * Math.sin(major) + P * radial * Math.cos(major),
      config.minorRadius * Q * Math.cos(minor)
    );
  }

  // Unit normal of the host torus at the (2,3) knot centreline. This avoids
  // relying on a Frenet normal, so the rendering frame does not depend on a
  // curvature-nonzero assumption.
  function torusNormal(tInput) {
    const t = finite(tInput, "t");
    const major = P * t;
    const minor = Q * t;
    return vec(
      Math.cos(minor) * Math.cos(major),
      Math.cos(minor) * Math.sin(major),
      Math.sin(minor)
    );
  }

  function frame(tInput, configInput) {
    const tangent = normalize(centerlineDerivative(tInput, configInput));
    const normal = torusNormal(tInput);
    const binormal = normalize(cross(tangent, normal));
    return Object.freeze({ tangent, normal, binormal });
  }

  function surfacePoint(tInput, vInput, configInput) {
    const t = finite(tInput, "t");
    const v = finite(vInput, "v");
    const config = normalizeConfig(configInput);
    const centre = centerline(t, config);
    const basis = frame(t, config);
    const offset = add(
      scale(basis.normal, Math.cos(v) * config.tubeRadius),
      scale(basis.binormal, Math.sin(v) * config.tubeRadius)
    );
    return add(centre, offset);
  }

  function buildMesh(configInput) {
    const config = normalizeConfig(configInput);
    const vertices = new Array(config.uSegments);
    for (let i = 0; i < config.uSegments; i += 1) {
      const t = TAU * i / config.uSegments;
      const ring = new Array(config.vSegments);
      for (let j = 0; j < config.vSegments; j += 1) {
        ring[j] = Object.freeze({
          point: surfacePoint(t, TAU * j / config.vSegments, config),
          u: i / config.uSegments,
          v: j / config.vSegments
        });
      }
      vertices[i] = Object.freeze(ring);
    }
    return Object.freeze({ config, vertices: Object.freeze(vertices) });
  }

  function rotateZ(point, angleInput) {
    const angle = finite(angleInput, "angle");
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return vec(c * point.x - s * point.y, s * point.x + c * point.y, point.z);
  }

  function tickPose(tickInput) {
    const tick = Math.trunc(finite(tickInput, "tick"));
    return Object.freeze({
      yaw: tick * TAU / 900,
      pitch: 0.74 + 0.12 * Math.sin(tick * TAU / 720),
      roll: -0.18 + tick * TAU / 2160
    });
  }

  function canonicalSnapshot(configInput) {
    const config = normalizeConfig(configInput);
    return Object.freeze({
      contract: CONTRACT,
      implementationVersion: VERSION,
      topology: Object.freeze({ p: P, q: Q, kind: "torus-knot-tube" }),
      parameters: config,
      animation: Object.freeze({ fixedStepHz: 60, pose: "integer-tick" })
    });
  }

  return Object.freeze({
    VERSION,
    CONTRACT,
    TAU,
    P,
    Q,
    DEFAULTS,
    normalizeConfig,
    add,
    sub,
    scale,
    dot,
    cross,
    norm,
    normalize,
    centerline,
    centerlineDerivative,
    torusNormal,
    frame,
    surfacePoint,
    buildMesh,
    rotateZ,
    tickPose,
    canonicalSnapshot
  });
});
