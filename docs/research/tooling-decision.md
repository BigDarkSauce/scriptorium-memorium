# Tooling decision: Blender, three.js ecosystem, design guides, 2-D figure libraries

Date 2026-11-08. Question: which Blender, three.js or design-guide tools make the workflow cheaper (AI tokens, iteration
time) while raising visual quality, given the constraints (three.js r170, plain ES modules from a CDN, no build step,
claude.ai artifact: page/file ≤ 16 MB, asset ≤ 15 MB, scripts only from cdnjs / jsdelivr / unpkg, runs locally too).

Every number below was measured in this container (2 vCPU, no GPU, Chromium with SwiftShader for WebGL) unless marked
*not measured*. The raw logs, scripts and test renders are kept in the session scratchpad
(`r7/tooling/`: `notes-measure.md`, `bvh-ab-1.json`, `bvh-equiv.json`, `bake1/`, `scripts/`).

Terms used:
- **BVH** (bounding-volume hierarchy): a tree of boxes over a mesh's triangles, so a ray only tests the few triangles
  in the boxes it passes through instead of all of them.
- **Raycast**: shooting a ray into the scene and listing what it hits (mouse picking, "is the view blocked?").
- **Brute force**: three.js's own raycast, which tests every triangle of every mesh the ray's bounding sphere reaches.
- **Bake**: computing something expensive once (offline or once at load) and storing the result in a texture or file.
- **glTF / .glb**: the standard 3-D asset file; **meshopt / Draco**: geometry compression for it; **KTX2**: GPU
  texture compression.
- **Kit**: a pre-built, parametric scene module the AI names in one line (`{"shape":"cabin"}`) instead of composing
  it from primitives.

---

## 1. Ranked decision table

Score columns: **run cost** (per frame / per load on the user's machine), **integration cost** (work and risk for us),
**quality gain**, **risk**. Ranked by value per cost.

| # | Item | Decision | Run cost | Integration | Quality / workflow gain (evidence) | Risk |
|---|---|---|---|---|---|---|
| 1 | **three-mesh-bvh 0.9.16** for all raycasts | **Adopt now — done** (`js/gfx/bvh.js`, flag) | 0 per frame; lazy tree build 4–90 ms per scene, 0.07–1 MB | 1 new file, 3 lines in `main.js`, 1 import-map entry | Zoom-shot search (`director.clearAxis`) on the water-cycle valley **2691 → 22 ms**, weather glass **5756 → 854 ms**, osmosis **451 → 170 ms**; 50 edit-pick rays **287 → 12 ms**. Identical results (400/400 nearest hits and hit counts, 5/5 scenes; same camera axes). Removes multi-second main-thread freezes on zoom shots. | Low: falls back to three's raycast if the module fails to load; dynamic geometry detected and left brute-force |
| 2 | **Golden-image regression** (`tools/shots.mjs`: fixed seeds, frozen clock, playwright screenshots of the 4 flagships + hub + one room, per-pixel diff with tolerance) | **Adopt now** | 0 (dev only) | ~150 lines; playwright and `sharp` are already installed | Several workers edit `engine.js`, `focus.js`, `materials` concurrently; `polish.mjs` catches layout faults but not "the marble lost its reflections". A diff image per view catches silent look regressions in ~3 min (SwiftShader) instead of a human review round. | Low (needs time/grain freezing so frames are deterministic) |
| 3 | **Offline hero-prop pipeline: Blender (bpy) → glTF → gltf-transform (meshopt + WebP) → `assets/kit/*.glb`**, loaded with three's own `GLTFLoader` + `MeshoptDecoder` (both in `three/addons` r170, no new CDN) | **Adopt now as a pilot** (3–5 props: brass microscope, retort stand + glassware set, fluted column/pilaster capital, astrolabe/orrery, lectern) | One fetch per prop (45–242 KB each measured); no per-frame cost beyond triangles | Medium: a `kit` shape in `builder.js` that loads async (placeholder box first), maps glTF material names to `makeMaterial` presets so `materialize.js` still does drawing → real | Real bevels, subdivision, and **baked AO** (ambient occlusion: how enclosed each point is; measured 1024² bake in 11 s) on props the AI uses again and again; procedural code cannot bake AO. AI cost per use: one line. | Medium: asset size budget, async build, materials must keep the card→real patch |
| 4 | N8AO 2.0.1 instead of GTAOPass at quality *high* | Adopt later | *not measured on a GPU* (SwiftShader timings are meaningless for AO) | Needs `postprocessing` 6.39 (peer `three ≥ 0.168 < 0.188`, OK for r170) **and** an import-map entry for `three/examples/jsm/` (N8AO imports that path), because its module imports both at top level | N8AO is the AO most three.js showcases use (half-res, denoised, temporal); ours is GTAO + Poisson denoise from depth only. Gain is real but unproven here: needs a GPU A/B (frame time + screenshots) first. | Medium: two post-processing stacks in one page |
| 5 | troika-three-text (SDF text) for `text` / `sign` shapes and 3-D labels | Adopt later | small (one SDF atlas per font) | 4 import-map entries (it depends on `bidi-js`, `troika-three-utils`, `troika-worker-utils`, `webgl-sdf-generator`); jsdelivr `+esm` would bundle a second copy of three, so it must be mapped by hand. Pin `0.53.0` (0.53.1 is < 2 weeks old). | Crisp text at any distance (now: 1024-px canvas textures that blur in close-ups). Only matters for the sign/text shapes; the HUD labels are DOM and already crisp. | Low–medium |
| 6 | three-gpu-pathtracer for path-traced stills (pedestal thumbnails, scroll plates) | Adopt later — **blocked by version** | seconds per still on a GPU | Current releases need **three ≥ 0.185** (0.0.25–0.0.28); the last r170-compatible one (0.0.23, 2024) pairs with three-mesh-bvh 0.7. Revisit when the app moves to three ≥ r185. | Highest possible still quality (true GI, caustics in glass) for a few images per room. | High until three is upgraded |
| 7 | KTX2 (Basis) textures | Adopt later (with #3) | lower GPU memory, faster upload | `toktx` (KTX-Software) is not installable here (GitHub release download redirected, not on PyPI/npm as a binary); `KTX2Loader` + transcoder are in three r170. Today's 2.3 MB of JPEG textures do not justify it. | Matters only once the kit ships many textures. | Low |
| 8 | lil-gui 0.21 dev panel (`?tune=1`) for look parameters (`applyLook`, material presets, AO, bloom) | Adopt later | 0 (only when asked for) | ~40 KB, one dynamic import | Faster human tuning; the AI and agents tune in code anyway. | Low |
| 9 | camera-controls 3.1.2 | Reject (now) | — | High: `director.js` already owns a shot grammar (push, zoom, track, POV, clearAxis), comfort caps and scrubbable poses built on OrbitControls | Its smooth `setLookAt`/`fitToBox` duplicate what the director does; swapping the controls under a 700-line director is risk without a visible gain. Port single ideas (e.g. `fitToBox` padding) if needed. | High |
| 10 | pmndrs `postprocessing` as the whole post chain | Reject | — | Rewrite of `renderer.js` and the custom passes (Atmosphere, Focus, Inset, grade) | Effect merging would save a few full-screen passes; not worth a rewrite. (Used only if #4 is adopted.) | High |
| 11 | three-stdlib, realism-effects | Reject | — | — | three-stdlib duplicates `three/addons` r170 (26 MB package). realism-effects (SSGI, TRAA) is unmaintained since 2023-05. | — |
| 12 | Blender for the hall/rooms (lightmap or HDRI bakes), Geometry Nodes scatter, procedural material bakes | Reject | — | — | The hall and rooms change at runtime (bookcases moved, room size from the book), so a baked lightmap is wrong after the first edit; the runtime `RoomProbe` already reflects the real room. Scatter and the `aaa.js` materials are generated on the GPU in milliseconds with 0 bytes shipped, and AI-authored scenes are different every time. | — |
| 13 | D3, p5.js, Lottie for 2-D scroll figures | Reject (keep typed SVG specs in `diagrams.js`) | — | — | See §5: the AI now writes a compact typed spec (`{"type":"plot", …}`); D3 or p5 would make it write code (more tokens, more failures), Lottie JSON is keyframe-verbose and needs After Effects to author. | — |

---

## 2. Evidence

### 2.1 Raycasting (item 1)

Where three.js brute force hurt (code read): `director.clearAxis` tries up to 44 candidate camera directions × 9 rays
(+9 through see-through surfaces, +1 for the dolly path) against every opaque mesh for each zoom shot, and again while a
zoom holds and the subject drifts behind something (`updateZoom`). The edit pick (`engine.js`), the POV clear view
(9 rays every 0.15 s), and hover picks in the hub and rooms use the same raycaster.

Measured with `scripts/bvh-ab.mjs` (same page loaded with `?bvh=0` and with the default; 4 actors per scene; median of 5
runs; "cold" = first run including the lazy tree builds):

| Scene | clearAxis brute → BVH (ms) | cold | 50 pick rays (ms) | trees built / memory / build time |
|---|---|---|---|---|
| Water cycle (flagship 1) | 2691 → **21.8** | 2844 → 112 | 287 → 12.3 | 30 / 323 KB / 53 ms |
| Galton board | 3.7 → 0.7 | 1.3 → 12.8 | 22 → 0.7 | 11 / – / 10 ms |
| Market | 17 → 45 (noise, same axes) | 118 → 117 | 5.1 → 1.9 | 122 / 1.0 MB / 51 ms |
| Osmosis | 451 → **170** | 706 → 274 | 3.7 → 2.3 | 14 / – / 31 ms |
| Weather glass | 5756 → **854** | 5701 → 1918 | 98 → 13 | 42 / 66 KB / 89 ms |
| Gas | 31 → 18 | 42 → 64 | 0.5 → 1.0 | 3 / – / 4 ms |
| Surface | 9.1 → 0.2 | 9 → 9.5 | 26 → 0.3 | 2 / – / 9 ms |
| Circuit | 12.7 → 12.4 | 22 → 36 | 0.7 → 0.7 | 1 / – / 0.1 ms |

Correctness (`scripts/bvh-equiv.mjs`, one page, model frozen, the shipped wrapper vs three's raycast): for 400 camera
rays the nearest hit (object and distance to 1e-4) **and the number of hits** were identical in all 5 scenes tested
(water cycle, osmosis, gas, surface, weather glass), and `clearAxis` chose identical axes. (Cross-page A/B rows differ
in a few rays only because moving models are in different states in two page loads.)

Hub (`scripts/bvh-hub.mjs`, 50 rays against the lists the hub really picks from): scrolls 0.4 → 0.8 ms, bookcases
0.6 → 2.5 ms warm, after a one-time lazy build of 16 + 28 ms (0.6 MB). The hub's pick lists are small, so there the
BVH is neutral; it pays off where a ray meets large meshes (terrain, relief, glass instruments). For scale: 50 rays
against the *whole* hall (524 k triangles) take 1.0–2.0 s brute-force and 63 ms with trees (built once in 0.87 s,
3.4 MB) — which is why nothing should ever raycast the whole hall.

What remains slow with the BVH on is not triangles but **instance counts**: three's `InstancedMesh.raycast` tests every
instance (weather glass: 1600 grass tufts, 3712 fern fronds; osmosis: 400 water molecules). Two cheap follow-ups, both
in `director.js` (owned by another worker, so not done here): skip `InstancedMesh` decor with more than ~200 instances
in `occluders()` (grass and ferns never block a view meaningfully), and set `raycaster.firstHitOnly = true` in
`blockCost` (it only needs "blocked or not"; three-mesh-bvh then stops at the first hit).

### 2.2 Blender headless (items 3, 12)

- **It runs here.** `pip install bpy==5.2.3` (Blender 5.2.3 LTS, Python 3.13 wheel) took **25 s** (975 MB venv);
  `import bpy` 1.4 s; the glTF exporter is built in. `download.blender.org` is blocked by the proxy; PyPI works.
- Test (`scripts/bake_test.py`): a fluted column (24 flutes, entasis, torus base, bevelled plinth and abacus) and a lathed
  Erlenmeyer flask with subdivision, UV-unwrapped, AO baked with Cycles on the CPU, exported, and one Cycles still:

| Step | Time |
|---|---|
| Build column / flask (bmesh + modifiers) | 0.10 s / 0.01 s |
| Smart UV project (both) | 0.03 s |
| Cycles AO bake, 1024², 64 spp (column) | 11.2 s |
| Cycles AO bake, 512², 64 spp (flask) | 8.7 s |
| glTF export (both) | 0.2 s |
| Cycles still 512², 64 spp, denoised | 7.6 s |
| **Total wall time** | **28.5 s** |

| Asset | Triangles | raw .glb | meshopt | gltf-transform `optimize` (weld + quantize + meshopt) | Draco |
|---|---|---|---|---|---|
| Column | 23,796 | 1,661,568 B | 365,916 | **241,904** | 63,500 |
| Flask | 8,192 | 211,300 | 61,416 | **44,876** | 25,712 |

AO map 1024²: PNG 604 KB → WebP q85 81 KB → JPEG 138 KB. gltf-transform 4.5.1 (npm) optimizes a file in 0.6 s.

Reading: a hero prop costs about 0.1–0.3 MB and half a minute of offline compute, once. Meshopt is preferred over
Draco because its decoder ships inside `three/addons` (`libs/meshopt_decoder.module.js`, no WASM fetch) and decodes
faster; Draco is 3–4× smaller on disk and can be used for the largest props (its decoder is fetched from the three
CDN path at load).

Why only hero props and not the rooms: the token budget of a scene is not where geometry lives. In the water-cycle
flagship (34.7 k characters ≈ 9.6 k tokens), `bodies` is 6.8 k characters; `code` (14.6 k), `lessons` (6.3 k) and `plan`
(3.5 k) dominate, and the body list already uses kit macros (`cabin`, `jetty`, `vitrine`, `forest`, `hills`). So a
glTF kit is a **quality** lever (bevels, baked occlusion, sculpted detail the AI cannot write), not a big token saver;
the token lever is keeping macros one line long and shortening `code` with model helpers.

### 2.3 Library versions and CDN fit (pinned ≥ 2 weeks old on 2026-11-08)

| Package | Pin | Released | Peer | ESM entry, imports | Note |
|---|---|---|---|---|---|
| three-mesh-bvh | **0.9.16** | 2026-10-08 | three ≥ 0.159 | `build/index.module.js` (290 KB, 62 KB gz), imports only `three` | adopted |
| n8ao | 2.0.1 | 2026-08-10 | postprocessing ≥ 6.30, three ≥ 0.137 | `dist/N8AO.js`, imports `postprocessing` and `three/examples/jsm/postprocessing/Pass.js` | later |
| postprocessing | 6.39.5 | 2026-09-09 | three ≥ 0.168 < 0.188 | `build/index.js` | only with N8AO |
| troika-three-text | 0.53.0 | 2026-07-24 | three ≥ 0.125 | 4 runtime deps to map | later |
| three-gpu-pathtracer | 0.0.27 | 2026-10-08 | **three ≥ 0.185** | — | blocked on r170 |
| camera-controls | 3.1.2 | 2025-11-17 | three ≥ 0.126 | `dist/camera-controls.module.js`, no imports | rejected |
| lil-gui | 0.21.0 | 2025-10-12 | — | `dist/lil-gui.esm.js` | later |
| @gltf-transform/cli | 4.5.1 | 2026-09-28 | — | node only (offline) | with item 3 |

The container itself cannot reach cdn.jsdelivr.net (proxy 403); the local server maps the same specifiers to vendored
copies (`/vendor-bvh/…` next to `/vendor-three/…`). The browser of a real user loads them from jsdelivr.

---

## 3. Design guides and workflow sources: what changes the process

- **three.js manual / forum best practices** ("How to dispose of objects", "Optimize lots of objects", raycasting
  guidance): merge static geometry by material (done in `baroque.js`), instance repeated props (done for trees, grass,
  chains), never raycast against dense decor, and use a BVH for anything picked often (now done).
- **Three.js Journey / Bruno Simon's portfolio techniques**: bake lighting into textures for *static* scenes (his room
  scenes are fully baked in Blender), use matcaps for stylised looks, and keep a debug GUI. For us: baking applies to
  fixed hero props only (§2.2), because our rooms and dioramas are generated and edited at runtime.
- **gltf-transform** (`optimize`, `meshopt`, `draco`, `webp`, `resize`, `dedup`, `prune`): the standard last step of
  every asset; measured above. Use `--texture-size 1024` and WebP for colour maps, keep normal maps lossless or high
  quality.
- **Process changes with the best return**:
  1. *Golden images* (item 2) so concurrent edits cannot silently degrade a look.
  2. *A kit of parametric modules* the AI names in one line; each new recurring object becomes a macro (procedural)
     or a kit prop (Blender) rather than 10 primitives repeated in every spec.
  3. *LOD by distance* with `THREE.LOD` for kit props over ~10 k triangles (gltf-transform `simplify` makes the lower
     levels offline in seconds).
  4. *Measure before porting*: `gfx.stats()`, `inset.bench()`, and the bench scripts in the scratchpad give per-scene
     numbers; every adoption in this file is gated on one.

---

## 4. Integration steps for the top three "adopt now" items

### 4.1 three-mesh-bvh (done, see §6)
1. Import map entry `"three-mesh-bvh": "https://cdn.jsdelivr.net/npm/three-mesh-bvh@0.9.16/build/index.module.js"`
   in `index.html` (the local test server maps it to its vendored copy).
2. `js/gfx/bvh.js`: `installBVH()` wraps `Mesh.prototype.raycast` once; trees are built lazily with `indirect: true`
   (index buffer untouched), only for geometries ≥ 256 triangles, never for skinned / morphed / batched /
   drawRange-limited geometry; a changed position or index version drops the tree and leaves that geometry
   brute-force; `geometry.dispose()` frees it. Flag: `?bvh=0` or `localStorage['scriptorium.bvh'] = '0'`.
3. `main.js` calls `installBVH()` before the app starts and exposes the counters as `app.bvh`
   (`on, failed, built, skipped, bytes, ms`).
4. Follow-ups for the director's owner: `firstHitOnly` in `blockCost`, and skip dense `InstancedMesh` decor in
   `occluders()` (§2.1).

### 4.2 Golden-image regression
1. `tools/shots.mjs` (playwright, SwiftShader, viewport 960 × 600, DPR 1): boot with `?shots=1`, which freezes the
   grade's grain seed and the app clock (`W.t` fixed), turns adaptive resolution off and forces quality `medium`.
2. Views: hub overview, one book room, the four flagships at the explore stage (skipIntro, after 20 fixed updates),
   one built-in model in the drawing state. Capture with the existing `S.capture` path (canvas → PNG).
3. Compare with `docs/qa/golden/<view>.png` using `sharp` (raw RGBA) and a per-pixel threshold (ΔE ≈ 6) plus an
   allowed-changed-area threshold (0.5 %); write `diff-<view>.png` (changed pixels in red) to the output folder.
4. `--update` rewrites the goldens after an intended look change; the commit then shows the new images.

### 4.3 Hero-prop kit (pilot)
1. `tools/blender/kit.py` (bpy 5.2.3 in a venv; `pip install bpy==5.2.3` with `NO_PROXY` cleared): one function per
   prop, real bevels/subdivision, one material slot per preset name (`brass`, `glass`, `walnut`, …), smart UV,
   Cycles AO bake 1024² 64 spp into `<prop>_ao`.
2. `gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress webp --texture-size 1024`, then
   `assets/kit/<prop>.glb`; budget ≤ 300 KB per prop, ≤ 3 MB for the kit.
3. `builder.js` shape `kit` (`{"shape":"kit","name":"microscope","pos":[…],"scale":…}`): insert a placeholder group
   at once, load with `GLTFLoader` + `MeshoptDecoder` (both in `three/addons`), cache the parsed scene per name,
   clone, and replace each glTF material with `makeMaterial(<slot name>)` + `aoMap` so `materialize.js` patches it like
   any other part (drawing → real keeps working). Register the names in `SCENE_SPEC.md` and `prompts.js`.
4. Gate: golden images (4.2) and `gfx.stats()` triangle counts before and after each prop.

---

## 5. 2-D scroll figures and animations

| Option | Fit | Verdict |
|---|---|---|
| Hand SVG from typed specs (`diagrams.js`: plot, tangent, riemann, vectors, matrix, complex, unitcircle, fourier, distribution, parametric, phase, customsvg, figure) | AI writes ~10–40 lines of JSON; crisp at any zoom; takes the scroll's fonts and maths typesetting; animated by its own loop that stops when the figure leaves the page | **Keep** (it is the cheapest path per token and already has validation in `figspec.js`) |
| D3 7.9 | Excellent for data plots (scales, axes, shapes) | Reject as an AI-facing format: it would make the AI write code. Possible later *inside* `diagrams.js` (only `d3-scale`/`d3-shape`, ~30 KB) if axis/tick quality needs it. |
| p5.js 2.3 | Generative sketches | Reject: 17 MB package (≈1 MB runtime), its own global loop, no SVG crispness. Canvas 2D does what we need. |
| Lottie (lottie-web 5.13 / dotlottie-web 0.82) | Designer-made vector animation | Reject: needs After Effects (or similar) to author; JSON keyframes are far more tokens than our specs; no data binding to sliders. |

---

## 6. What was implemented and its measured effect

- `js/gfx/bvh.js` (new), `js/main.js` (+3 lines), `index.html` (one import-map entry).
- Feature flag: on by default; `?bvh=0` or `localStorage['scriptorium.bvh'] = '0'` restores three's raycast; any
  load failure does the same (`app.bvh.failed` holds the reason).
- Effect (SwiftShader, 2 vCPU; a real GPU does not speed up raycasting, which is CPU work): zoom-shot direction search
  **123× faster** on the water-cycle valley (2.69 s → 22 ms), **6.7×** on the weather glass (5.76 s → 0.85 s), **2.7×**
  on osmosis; edit picking 2–80× faster; small scenes unchanged (± a few ms). One-off tree builds of 4–90 ms per scene,
  0.07–1 MB of memory. Results identical to three's raycast in every comparison made.
