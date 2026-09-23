// SPDX-License-Identifier: MPL-2.0
// Presentation only. All knot positions come from GluballCore.buildMesh().
(function (global, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.GluballRenderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const VERSION = "1.1.0";

  function prepareMesh(mesh) {
    const { uSegments: u, vSegments: v } = mesh.config;
    const positions = new Float32Array(u * v * 3);
    const normals = new Float32Array(positions.length);
    const triangles = new Uint16Array(u * v * 6);
    const lines = new Uint16Array(u * v * 4);
    if (u * v > 65536) throw new RangeError("presentation mesh exceeds 16-bit indices");
    for (let i = 0; i < u; i++) for (let j = 0; j < v; j++) {
      const n = i * v + j, point = mesh.vertices[i][j].point;
      positions.set([point.x, point.y, point.z], n * 3);
      const a = n, b = ((i + 1) % u) * v + j;
      const c = ((i + 1) % u) * v + (j + 1) % v, d = i * v + (j + 1) % v;
      // Outward winding for the canonical N/B frame.
      triangles.set([a, d, b, b, d, c], n * 6);
      lines.set([a, b, a, d], n * 4);
    }
    for (let k = 0; k < triangles.length; k += 3) {
      const a = triangles[k] * 3, b = triangles[k + 1] * 3, c = triangles[k + 2] * 3;
      const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
      const vx = positions[c] - positions[a], vy = positions[c + 1] - positions[a + 1], vz = positions[c + 2] - positions[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const n of [a, b, c]) { normals[n] += nx; normals[n + 1] += ny; normals[n + 2] += nz; }
    }
    for (let k = 0; k < normals.length; k += 3) {
      const length = Math.hypot(normals[k], normals[k + 1], normals[k + 2]);
      for (let j = 0; j < 3; j++) normals[k + j] /= length;
    }
    return { positions, normals, triangles, lines };
  }

  // Column-major Ry -> Rx -> Rz, matching the original projection exactly.
  function rotation(pose, out = new Float32Array(9)) {
    const cy = Math.cos(pose.yaw), sy = Math.sin(pose.yaw);
    const cp = Math.cos(pose.pitch), sp = Math.sin(pose.pitch);
    const cr = Math.cos(pose.roll), sr = Math.sin(pose.roll);
    out.set([cr * cy + sr * sp * sy, sr * cy - cr * sp * sy, cp * sy,
      -sr * cp, cr * cp, sp,
      -cr * sy + sr * sp * cy, -sr * sy - cr * sp * cy, cp * cy]);
    return out;
  }

  function guides(core) {
    const host = [], centre = [];
    const { majorRadius: R, minorRadius: r } = core.DEFAULTS;
    function hostPoint(a, b) { return [(R + r * Math.cos(b)) * Math.cos(a), (R + r * Math.cos(b)) * Math.sin(a), r * Math.sin(b)]; }
    for (let j = 0; j < 12; j++) for (let i = 0; i < 96; i++) {
      host.push(...hostPoint(i * core.TAU / 96, j * core.TAU / 12), ...hostPoint((i + 1) * core.TAU / 96, j * core.TAU / 12));
    }
    for (let j = 0; j < 24; j++) for (let i = 0; i < 48; i++) {
      host.push(...hostPoint(j * core.TAU / 24, i * core.TAU / 48), ...hostPoint(j * core.TAU / 24, (i + 1) * core.TAU / 48));
    }
    for (let i = 0; i < 384; i++) for (const t of [i, i + 1]) {
      const p = core.centerline(t * core.TAU / 384);
      centre.push(p.x, p.y, p.z);
    }
    return { host: new Float32Array(host), centre: new Float32Array(centre) };
  }

  function createWebGL(canvas, data, guide, onLost, onRestored) {
    const gl = canvas.getContext("webgl", { alpha: false, antialias: true, depth: true, powerPreference: "low-power" });
    if (!gl) throw new Error("WebGL unavailable");
    const vertexSource = `attribute vec3 position; attribute vec3 normal;
      uniform mat3 rotation; uniform vec2 scale; uniform float perspective;
      varying mediump vec3 n; varying mediump vec3 p;
      void main() { p = rotation * position; n = rotation * normal;
        float w = mix(8.2, 8.2 - p.z, perspective);
        gl_Position = vec4(p.xy * scale, (8.2 - p.z - 8.0) * 0.3, w); }`;
    const fragmentSource = `precision mediump float;
      varying mediump vec3 n; varying mediump vec3 p; uniform vec4 color; uniform float lit;
      void main() { vec3 N = normalize(n); vec3 V = normalize(vec3(0.,0.,8.2)-p);
        vec3 L = normalize(vec3(-.5,.8,1.));
        float diffuse = max(dot(N,L),0.);
        float specular = pow(max(dot(N,normalize(L+V)),0.),48.);
        float rim = pow(1.-max(dot(N,V),0.),3.);
        vec3 shaded = color.rgb * (.22 + .78 * diffuse) + vec3(.65,.78,1.) * specular * .7 + vec3(.16,.32,.6) * rim;
        gl_FragColor = vec4(mix(color.rgb,shaded,lit),color.a); }`;
    let program, loc, buffers, lost = false;
    function shader(type, source) {
      const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const error = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error(error); }
      return s;
    }
    function buffer(target, values) {
      const b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, values, gl.STATIC_DRAW); return b;
    }
    function init() {
      const vs = shader(gl.VERTEX_SHADER, vertexSource), fs = shader(gl.FRAGMENT_SHADER, fragmentSource);
      program = gl.createProgram(); gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
      gl.deleteShader(vs); gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
      loc = {};
      for (const name of ["rotation", "scale", "perspective", "color", "lit"]) loc[name] = gl.getUniformLocation(program, name);
      loc.position = gl.getAttribLocation(program, "position"); loc.normal = gl.getAttribLocation(program, "normal");
      buffers = { positions: buffer(gl.ARRAY_BUFFER, data.positions), normals: buffer(gl.ARRAY_BUFFER, data.normals),
        triangles: buffer(gl.ELEMENT_ARRAY_BUFFER, data.triangles), lines: buffer(gl.ELEMENT_ARRAY_BUFFER, data.lines),
        host: buffer(gl.ARRAY_BUFFER, guide.host), centre: buffer(gl.ARRAY_BUFFER, guide.centre) };
      gl.clearColor(.025, .035, .055, 1); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    }
    init();
    canvas.addEventListener("webglcontextlost", event => { event.preventDefault(); lost = true; onLost(); });
    canvas.addEventListener("webglcontextrestored", () => {
      try { init(); lost = false; onRestored(); } catch (error) { onLost(error); }
    });
    function attribute(name, b) { gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.enableVertexAttribArray(loc[name]); gl.vertexAttribPointer(loc[name], 3, gl.FLOAT, false, 0, 0); }
    function lineLayer(b, count, color) {
      attribute("position", b); gl.disableVertexAttribArray(loc.normal); gl.vertexAttrib3f(loc.normal, 0, 0, 1);
      gl.uniform4fv(loc.color, color); gl.uniform1f(loc.lit, 0); gl.drawArrays(gl.LINES, 0, count / 3);
    }
    const matrix = new Float32Array(9);
    return { name: "WebGL", draw(pose, view) {
      if (lost) return;
      const { width: w, height: h } = canvas;
      gl.viewport(0, 0, w, h); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.useProgram(program);
      gl.uniformMatrix3fv(loc.rotation, false, rotation(pose, matrix));
      gl.uniform2f(loc.scale, 2.24 * Math.min(w, h) / w * view.zoom, 2.24 * Math.min(w, h) / h * view.zoom);
      gl.uniform1f(loc.perspective, view.projection === "perspective" ? 1 : 0);
      attribute("position", buffers.positions); attribute("normal", buffers.normals);
      if (view.mode !== "atlas") {
        gl.uniform4f(loc.color, .16, .32, .8, 1); gl.uniform1f(loc.lit, 1);
        gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 1);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.triangles); gl.drawElements(gl.TRIANGLES, data.triangles.length, gl.UNSIGNED_SHORT, 0);
        gl.disable(gl.POLYGON_OFFSET_FILL);
      }
      if (view.wire || view.mode === "atlas") {
        gl.uniform4f(loc.color, .43, .63, .9, view.mode === "atlas" ? .38 : .22); gl.uniform1f(loc.lit, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers.lines); gl.drawElements(gl.LINES, data.lines.length, gl.UNSIGNED_SHORT, 0);
      }
      gl.depthMask(false);
      if (view.host) lineLayer(buffers.host, guide.host.length, [.72, .49, .23, .24]);
      if (view.mode === "atlas") lineLayer(buffers.centre, guide.centre.length, [1, .72, .36, 1]);
      gl.depthMask(true);
    }};
  }

  function createCanvas(canvas, data, guide) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas rendering unavailable");
    const points = new Float32Array(data.positions.length), normal = new Float32Array(data.normals.length);
    const depth = new Float32Array(data.triangles.length / 3);
    const order = Array.from(depth, (_, i) => i), matrix = new Float32Array(9);
    const host = new Float32Array(guide.host.length), centre = new Float32Array(guide.centre.length);
    const palette = Array.from({length: 128}, (_, i) => `rgb(${Math.round(18+i*.45)} ${Math.round(32+i*.7)} ${Math.round(72+i*1.35)})`);
    function transform(source, target, view, project) {
      const w = canvas.width, h = canvas.height, focal = Math.min(w, h) * 1.12 * view.zoom;
      for (let k = 0; k < source.length; k += 3) {
        const x = source[k], y = source[k + 1], z = source[k + 2];
        const rx = matrix[0]*x+matrix[3]*y+matrix[6]*z, ry = matrix[1]*x+matrix[4]*y+matrix[7]*z, rz = matrix[2]*x+matrix[5]*y+matrix[8]*z;
        const f = focal / (view.projection === "perspective" ? 8.2-rz : 8.2);
        target[k] = project ? w/2+rx*f : rx; target[k+1] = project ? h/2-ry*f : ry; target[k+2] = rz;
      }
    }
    function segment(a, b, p) { ctx.moveTo(p[a],p[a+1]); ctx.lineTo(p[b],p[b+1]); }
    function drawGuide(source, target, color, view) {
      transform(source,target,view,true); ctx.beginPath();
      for(let k=0;k<target.length;k+=6) segment(k,k+3,target);
      ctx.strokeStyle=color; ctx.stroke();
    }
    return { name: "Canvas 2D", draw(pose, view) {
      rotation(pose, matrix); transform(data.positions, points, view, true); transform(data.normals, normal, view, false);
      ctx.fillStyle="#06090e"; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.lineWidth = Math.max(1, canvas.width / canvas.clientWidth * .65);
      // Canvas fallback uses a painter's sort; host guide is intentionally behind the tube.
      if(view.host) drawGuide(guide.host,host,"rgba(184,125,59,.25)",view);
      if(view.mode !== "atlas") {
        for(let i=0;i<depth.length;i++) { const k=i*3; depth[i]=(points[data.triangles[k]*3+2]+points[data.triangles[k+1]*3+2]+points[data.triangles[k+2]*3+2])/3; }
        order.sort((a,b)=>depth[a]-depth[b]);
        for(const i of order) {
          const k=i*3,a=data.triangles[k]*3,b=data.triangles[k+1]*3,c=data.triangles[k+2]*3;
          // Screen y points down: outward front faces have negative signed area.
          if ((points[b]-points[a])*(points[c+1]-points[a+1])-(points[b+1]-points[a+1])*(points[c]-points[a]) >= 0) continue;
          const light=Math.max(0,Math.min(127, Math.round(25+85*(-.36*normal[a]+.58*normal[a+1]+.73*normal[a+2]))));
          ctx.beginPath();ctx.moveTo(points[a],points[a+1]);ctx.lineTo(points[b],points[b+1]);ctx.lineTo(points[c],points[c+1]);ctx.closePath();
          ctx.fillStyle=palette[light];ctx.fill();
          // Cover antialias hairlines between adjacent triangles.
          ctx.strokeStyle=palette[light];ctx.lineWidth=.7;ctx.stroke();
        }
      }
      if(view.wire || view.mode === "atlas") {
        ctx.beginPath();
        for(let k=0;k<data.lines.length;k+=2) segment(data.lines[k]*3,data.lines[k+1]*3,points);
        ctx.lineWidth = Math.max(1, canvas.width / canvas.clientWidth * .65);
        ctx.strokeStyle=view.mode === "atlas" ? "rgba(110,161,230,.38)" : "rgba(110,161,230,.18)";ctx.stroke();
      }
      if(view.mode === "atlas") drawGuide(guide.centre,centre,"#ffb85c",view);
    }};
  }
  return Object.freeze({ VERSION, prepareMesh, rotation, guides, createWebGL, createCanvas });
});
