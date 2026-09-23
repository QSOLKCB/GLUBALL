// SPDX-License-Identifier: MPL-2.0
(() => {
  "use strict";
  const core = window.GluballCore, phase2 = window.GluballPhase2, rendererAPI = window.GluballRenderer;
  const $ = id => document.getElementById(id);
  let canvas = $("gluball-canvas");
  const playButton = $("play"), exportButton = $("export"), wireToggle = $("wire");
  const mesh = core.buildMesh();
  const samplingConfig = Object.freeze({ logicalCount: "16777216", renderedCount: mesh.config.uSegments, policy: phase2.UNIFORM_FLOOR });
  const data = rendererAPI.prepareMesh(mesh), guide = rendererAPI.guides(core);
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const view = { mode: "sculpture", wire: false, host: false, projection: "perspective", zoom: 1, yaw: 0, pitch: 0 };
  const fixedStepMs = 1000 / 60;
  let tick = 0, running = !motion.matches, available = true, pending = 0, dirty = true;
  let accumulator = 0, lastTime = performance.now(), fpsWindowStart = lastTime, fpsFrames = 0, frameCost = 0;
  let renderer;
  function contextLost() {
    available = false; cancelAnimationFrame(pending); pending = 0;
    $("renderer").textContent = "Context lost"; $("status").textContent = "Graphics paused · waiting for recovery"; $("fps").textContent = "0";
  }
  function contextRestored() {
    available = true; $("renderer").textContent = renderer.name;
    resetClock(); syncPlay(); invalidate();
  }
  try { renderer = rendererAPI.createWebGL(canvas, data, guide, contextLost, contextRestored); }
  catch (error) {
    // A canvas cannot change context type after WebGL initialization failure.
    const replacement = canvas.cloneNode(true); canvas.replaceWith(replacement); canvas = replacement;
    try { renderer = rendererAPI.createCanvas(canvas, data, guide); }
    catch (fallbackError) {
      $("status").textContent = "Rendering unavailable. Try a browser with Canvas or WebGL enabled.";
      for (const control of document.querySelectorAll("button, input, select")) control.disabled = true;
      console.error(fallbackError); return;
    }
  }
  $("renderer").textContent = renderer.name;

  function resetClock() {
    accumulator = 0; lastTime = performance.now(); fpsWindowStart = lastTime; fpsFrames = 0;
    $("fps").textContent = "0";
  }
  function syncPlay() {
    playButton.textContent = running ? "Pause" : "Play";
    playButton.setAttribute("aria-pressed", String(running));
    $("status").textContent = available ? (running ? "Live · 60 Hz tick clock" : "Paused · inspect the geometry") : "Graphics paused · waiting for recovery";
  }
  function schedule() { if (!pending && available && !document.hidden && (running || dirty)) pending = requestAnimationFrame(frame); }
  function invalidate() { dirty = true; schedule(); }
  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    // Bound fill cost on high-DPI screens without changing mesh/sample counts.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75, Math.sqrt(2400000 / Math.max(1, rect.width * rect.height)));
    const width = Math.max(1, Math.round(rect.width * dpr)), height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  }
  function render() {
    const start = performance.now();
    resizeCanvas();
    const pose = core.tickPose(tick);
    renderer.draw({ yaw: pose.yaw + view.yaw, pitch: pose.pitch + view.pitch, roll: pose.roll }, view);
    frameCost = performance.now() - start;
    $("tick").textContent = String(tick);
    dirty = false;
  }
  function frame(now) {
    pending = 0;
    if (document.hidden || !available) return;
    const delta = Math.min(250, Math.max(0, now - lastTime)); lastTime = now;
    if (running) {
      accumulator += delta;
      const steps = Math.floor(accumulator / fixedStepMs);
      if (steps > 0) { tick += steps; accumulator -= steps * fixedStepMs; dirty = true; }
    }
    if (dirty) { render(); fpsFrames++; }
    if (now - fpsWindowStart >= 1000) {
      $("fps").textContent = running ? String(Math.round(fpsFrames * 1000 / (now - fpsWindowStart))) : "0";
      $("frame-cost").textContent = frameCost.toFixed(2) + " ms";
      fpsFrames = 0; fpsWindowStart = now;
    }
    schedule();
  }
  function pause() { running = false; resetClock(); syncPlay(); }
  playButton.addEventListener("click", () => { running = !running; resetClock(); syncPlay(); invalidate(); });
  for (const [id, count] of [["step", 1], ["step60", 60]]) $(id).addEventListener("click", () => { pause(); tick += count; invalidate(); });
  $("reset").addEventListener("click", () => { pause(); tick = 0; invalidate(); });
  $("home").addEventListener("click", () => { view.yaw = 0; view.pitch = 0; view.zoom = 1; $("zoom").value = "1"; invalidate(); });
  wireToggle.addEventListener("change", () => { view.wire = wireToggle.checked; invalidate(); });
  $("host").addEventListener("change", () => { view.host = $("host").checked; invalidate(); });
  $("projection").addEventListener("change", () => { view.projection = $("projection").value; invalidate(); });
  $("zoom").addEventListener("input", () => { view.zoom = Number($("zoom").value); invalidate(); });
  for (const button of document.querySelectorAll("[data-mode]")) button.addEventListener("click", () => {
    view.mode = button.dataset.mode;
    for (const item of document.querySelectorAll("[data-mode]")) item.setAttribute("aria-pressed", String(item === button));
    $("view-name").textContent = view.mode === "atlas" ? "02 / KNOT ATLAS" : "01 / SURFACE STUDY";
    invalidate();
  });
  let drag = null;
  canvas.addEventListener("pointerdown", event => {
    if (!event.isPrimary || event.button !== 0) return;
    pause(); drag = { id: event.pointerId, x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", event => {
    if (!drag || drag.id !== event.pointerId) return;
    view.yaw += (event.clientX - drag.x) * .008; view.pitch += (event.clientY - drag.y) * .008;
    drag.x = event.clientX; drag.y = event.clientY; invalidate();
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) canvas.addEventListener(event, () => { drag = null; });
  canvas.addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", " "].includes(event.key)) return;
    event.preventDefault();
    if (event.key === " ") { playButton.click(); return; }
    pause();
    if (event.key === "ArrowLeft") view.yaw -= .1;
    if (event.key === "ArrowRight") view.yaw += .1;
    if (event.key === "ArrowUp") view.pitch -= .1;
    if (event.key === "ArrowDown") view.pitch += .1;
    if (["+", "=", "-"].includes(event.key)) view.zoom = Math.min(1.4, Math.max(.6, view.zoom + (event.key === "-" ? -.05 : .05)));
    $("zoom").value = String(view.zoom); invalidate();
  });
  motion.addEventListener("change", event => { if (event.matches) { pause(); invalidate(); } });
  document.addEventListener("visibilitychange", () => {
    cancelAnimationFrame(pending); pending = 0; resetClock();
    if (!document.hidden) invalidate();
  });
  window.addEventListener("resize", invalidate);
  const observer = new ResizeObserver(invalidate); observer.observe(canvas);
  function presentation() {
    return { renderer: renderer.name, rendererVersion: rendererAPI.VERSION, canvasWidth: canvas.width, canvasHeight: canvas.height,
      mode: view.mode, wireframe: view.wire, hostTorus: view.host, projection: view.projection,
      camera: { yawOffset: view.yaw, pitchOffset: view.pitch, zoom: view.zoom } };
  }
  exportButton.addEventListener("click", async () => {
    const previousLabel = exportButton.textContent;
    const exportTick = tick;
    const exportPresentation = presentation();
    exportButton.disabled = true;
    exportButton.textContent = "Sealing…";
    try {
      const geometrySnapshot = core.canonicalSnapshot();
      const envelope = phase2.makeEvidenceEnvelope({
        geometrySnapshot,
        sampling: samplingConfig,
        tick: exportTick,
        implementation: { name: "gluball-browser", version: rendererAPI.VERSION },
        runtime: {
          name: "browser-webcrypto",
          version: navigator.userAgent,
          platform: navigator.platform || "unknown"
        }
      });
      const receipt = await phase2.evidenceReceipt(envelope);
      const capture = phase2.captureManifest({
        profile: "json-canonical-v1",
        tick: exportTick,
        presentation: exportPresentation
      });
      const previewIndices = [0, 1, Math.floor(mesh.config.uSegments / 2), mesh.config.uSegments - 1];
      const payload = {
        geometry: geometrySnapshot,
        tick: exportTick,
        pose: core.tickPose(exportTick),
        sampling: phase2.serializableSamplingConfig(samplingConfig),
        samplePreview: phase2.sampleVector(samplingConfig, previewIndices),
        sonificationPreview: phase2.sonificationStream(samplingConfig, { count: 6, startTick: exportTick, ticksPerEvent: 120 }),
        capture,
        evidence: { envelope, receipt }
      };
      const canonicalPayload = phase2.canonicalJSONStringify(payload);
      const blob = new Blob([canonicalPayload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `gluball-evidence-v1-tick-${exportTick}.json`;
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

  syncPlay(); render(); schedule();
})();
