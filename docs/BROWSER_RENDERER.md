# Browser presentation 1.1.0

This is a post-v1.0.0 presentation update, not a new geometry or release freeze.
`gluball-core.js`, `phase2-core.js`, the sealed vectors, and the historical release
manifest retain their existing versions and meaning.

## Views and controls

- Sculpture: opaque blue tube with interpolated mesh normals, directional light,
  specular highlights, and a subtle rim in WebGL.
- Knot atlas: wire tube and amber canonical centreline. This is an inspection
  view, not a computed Seifert surface or knot-complement fibration.
- Optional host torus: an amber parameter grid using the canonical R and r.
  The host is an explanatory overlay, not an additional GLUBALL surface.
- Drag/arrow keys orbit; zoom slider or +/- changes camera magnification;
  Space toggles playback. Camera reset and tick reset are separate.
- Perspective and orthographic projections are presentation choices.
- Reduced-motion preference starts paused and switching to reduced motion pauses
  playback. Play remains an explicit user choice.

## Rendering cost

The previous Canvas path rebuilt projected point objects and 1,728 quad objects,
repeated vertex trigonometry, sorted quads, and issued per-cell fills/strokes on
each frame. The WebGL path uploads the existing 96 × 18 mesh once, including
3,456 indexed triangles, then updates a rotation matrix and a few uniforms.
The default view has one indexed draw call per frame. Adding mesh and host guide
adds at most two more calls. No libraries, CDN requests, bundler, textures, or
postprocessing pipeline are required.

Normals are averaged from the canonical mesh's oriented triangles solely for
lighting. GPU Float32 positions are rounded copies of CPU reference positions;
they have no geometry/evidence authority. Presentation version 1.1.0 identifies
the browser exporter implementation independently of core version 1.0.0.

The Canvas 2D fallback caches positions, normals, index order, projection arrays,
and its palette. It retains a painter's depth sort, front-face filtering and
flat triangle lighting. It is visually less smooth than WebGL. Its host grid is
painted behind the tube and its wire overlay is an x-ray inspection overlay;
these are not equivalent to WebGL depth-buffer visibility.

Drawing-buffer density is capped at 1.75 device pixels and approximately 2.4
million pixels, without changing canonical mesh or sampling counts. The app
stops scheduling frames while paused (after pending changes are painted), hidden,
or context-lost, and resets the clock on resume. There is no hidden-time catch-up.
WebGL context restoration reuploads buffers and redraws the current state.

## Telemetry and evidence

Display FPS counts actual submissions, not GPU completion. Frame submission is
CPU time around resize/pose/draw work, not GPU time or end-to-end frame latency.
No universal speedup or hardware FPS claim is made. The fixed tick clock remains
nominally 60 Hz with the existing 250 ms per-frame catch-up cap.

Export captures tick and presentation settings before asynchronous SHA-256
sealing. The evidence envelope binds the canonical geometry, sample contract,
tick, implementation and runtime. Camera, renderer, lighting/view selection and
canvas dimensions are presentation metadata outside the receipt envelope.

## Validation

Run all existing contract gates plus:

```sh
node tests/renderer.mjs
node tests/browser-controls.mjs
```

Renderer tests verify Float32 copies of canonical vertices, outward normalized
normals, closed oriented seams, agreement with the original scalar transform,
bounded WebGL draw calls, static buffer reuse, and context reconstruction.
Control tests run the actual app with a mock DOM/RAF clock and verify scheduling,
visibility, motion preference, fallback, exact step/reset behavior and async
export capture. Mock WebGL tests do not prove shader compilation or driver behavior.

During authoring, Canvas fallback sculpture and atlas views were rendered with
Skia and visually inspected. Live browser inspection was blocked by the cloud
browser's local-preview policy; WebGL shader/driver validation, responsive browser
layout checks, and real-device FPS measurements remain manual checks before merge.

Suggested browser acceptance: load the page on desktop and mobile widths; compare
both modes and projections; drag/zoom; pause and verify idle work; step/reset;
export JSON; hide/resume; exercise reduced motion; disable WebGL to inspect Canvas;
use WEBGL_lose_context from developer tools to verify recovery where supported.
For a fair performance comparison, use the same browser, hardware, viewport,
DPR, mesh-overlay setting and running interval on the base and PR branches.
Record CPU submission time separately from display FPS and GPU timings.

## Visual reference

[Jesse Bettencourt's Torus Knot Fibration Visualization](https://www.cs.toronto.edu/~jessebett/projects/torus-knot-fibration/index.html)
inspired the readable surface/curve/host-torus layering. No source code, textures,
or figure assets from that project or the supplied images were copied. Its
fibration and stereographic construction are not implemented here.
