// SPDX-License-Identifier: MPL-2.0
(() => {
  "use strict";

  const core = window.GluballCore;
  const phase2 = window.GluballPhase2;
  if (!core) throw new Error("GluballCore failed to load");
  if (!phase2) throw new Error("GluballPhase2 failed to load");

  const canvas = document.getElementById("gluball-canvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const playButton = document.getElementById("play");
  const stepButton = document.getElementById("step");
  const minuteButton = document.getElementById("step60");
  const resetButton = document.getElementById("reset");
  const exportButton = document.getElementById("export");
  const wireToggle = document.getElementById("wire");
  const tickReadout = document.getElementById("tick");
  const fpsReadout = document.getElementById("fps");

  const mesh = core.buildMesh();
  const samplingConfig = Object.freeze({
    logicalCount: "16777216",
    renderedCount: mesh.config.uSegments,
    policy: phase2.UNIFORM_FLOOR
  });
  const fixedStepMs = 1000 / 60;
  let running = true;
  let tick = 0;
  let accumulator = 0;
  let lastTime = performance.now();
  let fpsWindowStart = lastTime;
  let fpsFrames = 0;

  function rotate(point, pose) {
    const cy = Math.cos(pose.yaw), sy = Math.sin(pose.yaw);
    const cp = Math.cos(pose.pitch), sp = Math.sin(pose.pitch);
    const cr = Math.cos(pose.roll), sr = Math.sin(pose.roll);

    const x1 = cy * point.x - sy * point.z;
    const z1 = sy * point.x + cy * point.z;
    const y1 = point.y;

    const y2 = cp * y1 - sp * z1;
    const z2 = sp * y1 + cp * z1;
    const x2 = x1;

    return {
      x: cr * x2 - sr * y2,
      y: sr * x2 + cr * y2,
      z: z2
    };
  }

  function project(point, width, height) {
    const camera = 8.2;
    const focal = Math.min(width, height) * 1.12;
    const depth = Math.max(1.4, camera - point.z);
    const factor = focal / depth;
    return {
      x: width / 2 + point.x * factor,
      y: height / 2 - point.y * factor,
      z: point.z,
      factor
    };
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    return { width, height, dpr };
  }

  function render() {
    const { width, height, dpr } = resizeCanvas();
    const pose = core.tickPose(tick);
    const projected = mesh.vertices.map((ring) => ring.map((vertex) => {
      const rotated = rotate(vertex.point, pose);
      return { ...project(rotated, width, height), u: vertex.u, v: vertex.v };
    }));

    ctx.fillStyle = "#f3f5f4";
    ctx.fillRect(0, 0, width, height);

    const quads = [];
    const uCount = mesh.config.uSegments;
    const vCount = mesh.config.vSegments;
    for (let i = 0; i < uCount; i += 1) {
      const ni = (i + 1) % uCount;
      for (let j = 0; j < vCount; j += 1) {
        const nj = (j + 1) % vCount;
        const a = projected[i][j];
        const b = projected[ni][j];
        const c = projected[ni][nj];
        const d = projected[i][nj];
        quads.push({
          points: [a, b, c, d],
          z: (a.z + b.z + c.z + d.z) / 4,
          // Periodic cell midpoint avoids the wrapped-seam colour discontinuity.
          u: (i + 0.5) / uCount
        });
      }
    }
    quads.sort((a, b) => a.z - b.z);

    ctx.lineJoin = "round";
    for (const quad of quads) {
      const depth = Math.max(0, Math.min(1, (quad.z + 3.3) / 6.6));
      const hue = 194 + 25 * Math.sin(core.TAU * quad.u + 0.55);
      const light = 40 + depth * 22;
      ctx.beginPath();
      ctx.moveTo(quad.points[0].x, quad.points[0].y);
      for (let k = 1; k < quad.points.length; k += 1) {
        ctx.lineTo(quad.points[k].x, quad.points[k].y);
      }
      ctx.closePath();
      ctx.fillStyle = `hsl(${hue.toFixed(1)} 82% ${light.toFixed(1)}%)`;
      ctx.fill();
      if (wireToggle.checked) {
        ctx.strokeStyle = "rgba(5, 17, 26, 0.86)";
        ctx.lineWidth = Math.max(0.65, dpr * 0.46);
        ctx.stroke();
      }
    }

    tickReadout.textContent = String(tick);
  }

  function frame(now) {
    const delta = Math.min(250, Math.max(0, now - lastTime));
    lastTime = now;
    let advanced = false;

    if (running) {
      accumulator += delta;
      while (accumulator >= fixedStepMs) {
        tick += 1;
        accumulator -= fixedStepMs;
        advanced = true;
      }
    }

    // No redraw while paused, and no duplicate redraw on >60 Hz displays.
    if (advanced) {
      render();
      fpsFrames += 1;
    }

    if (now - fpsWindowStart >= 1000) {
      fpsReadout.textContent = running
        ? String(Math.round(fpsFrames * 1000 / (now - fpsWindowStart)))
        : "0";
      fpsFrames = 0;
      fpsWindowStart = now;
    }
    requestAnimationFrame(frame);
  }

  playButton.addEventListener("click", () => {
    running = !running;
    playButton.textContent = running ? "Pause" : "Play";
    accumulator = 0;
    fpsFrames = 0;
    fpsWindowStart = performance.now();
    if (!running) fpsReadout.textContent = "0";
  });
  stepButton.addEventListener("click", () => {
    running = false;
    playButton.textContent = "Play";
    tick += 1;
    fpsReadout.textContent = "0";
    render();
  });
  minuteButton.addEventListener("click", () => {
    running = false;
    playButton.textContent = "Play";
    tick += 60;
    fpsReadout.textContent = "0";
    render();
  });
  resetButton.addEventListener("click", () => {
    running = false;
    playButton.textContent = "Play";
    tick = 0;
    accumulator = 0;
    fpsReadout.textContent = "0";
    render();
  });
  wireToggle.addEventListener("change", render);

  exportButton.addEventListener("click", async () => {
    const previousLabel = exportButton.textContent;
    exportButton.disabled = true;
    exportButton.textContent = "Sealing…";
    try {
      const geometrySnapshot = core.canonicalSnapshot();
      const envelope = phase2.makeEvidenceEnvelope({
        geometrySnapshot,
        sampling: samplingConfig,
        tick,
        implementation: { name: "gluball-browser", version: phase2.VERSION },
        runtime: {
          name: "browser-webcrypto",
          userAgent: navigator.userAgent,
          platform: navigator.platform || "unknown"
        }
      });
      const receipt = await phase2.evidenceReceipt(envelope);
      const capture = phase2.captureManifest({
        profile: "json-canonical-v1",
        tick,
        presentation: {
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          wireframe: wireToggle.checked
        }
      });
      const previewIndices = [0, 1, Math.floor(mesh.config.uSegments / 2), mesh.config.uSegments - 1];
      const payload = {
        geometry: geometrySnapshot,
        tick,
        pose: core.tickPose(tick),
        sampling: phase2.serializableSamplingConfig(samplingConfig),
        samplePreview: phase2.sampleVector(samplingConfig, previewIndices),
        sonificationPreview: phase2.sonificationStream(samplingConfig, { count: 6, startTick: tick, ticksPerEvent: 120 }),
        capture,
        evidence: { envelope, receipt }
      };
      const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `gluball-evidence-v1-tick-${tick}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      window.alert(`GLUBALL evidence export failed: ${error.message}`);
    } finally {
      exportButton.disabled = false;
      exportButton.textContent = previousLabel;
    }
  });

  window.addEventListener("resize", render);
  render();
  requestAnimationFrame(frame);
})();
