# Realism playbook: from flat dioramas to Weatherglass quality

This note says what to build, in which order, in which file, and what it costs. It is a set of decisions, not a
survey. It builds on `aaa-rendering.md` (procedural relief, wetness, cascades, atmosphere: already shipped) and
`weatherglass.md` (the full reverse-engineering of the user's Weatherglass artifact). Read those for the maths that
is already in the code; this note covers what is still missing.

Terms used throughout:
- **Instancing**: one draw call renders many copies of one small mesh; each copy reads its own per-instance
  attributes (root position, height, seed). `InstancedBufferGeometry` + `InstancedBufferAttribute`.
- **Draw call**: one `gl.drawElements` the CPU issues; a mid-range desktop handles ~300 per frame comfortably in
  WebGL2 before the CPU, not the GPU, limits the frame rate.
- **Two-pass (multiply + add) transparency**: draw a transparent surface twice. Pass 1 multiplies what is behind it
  by the surface's transmittance (`blendSrc = Zero, blendDst = SrcColor`); pass 2 adds the light the surface
  scatters and reflects (`One, One` or premultiplied `One, OneMinusSrcAlpha`). Physically this is exactly
  `L = L_behind · T + L_surface`, with no sorting problems and no screen copy.
- **Transmittance `T = e^{−σ·d}`** (Beer–Lambert): the fraction of light that survives a path of length `d` through a
  medium with extinction coefficient `σ` (per unit length, per colour channel).
- **Raymarch**: step along the view ray inside a bounding box, sampling a density function, accumulating
  transmittance and in-scattered light.
- **Mid GPU / medium**: a GTX 1660 / RX 6600-class card at 1080p with `gfx.quality = 'medium'`. All millisecond
  figures here are **estimates** from shader arithmetic and texture reads (the build machine renders with
  SwiftShader, so it cannot measure GPU time); draw calls and triangles are exact counts of what the recipe creates.
- **WG** = the Weatherglass artifact. Line numbers `WG:n` refer to the prettified copy
  `/tmp/claude-0/-home-claude/c61ae887-f2bc-5616-8c17-4937082f620d/scratchpad/wg/app.pretty.js` (rebuild it with
  `npx prettier` on the inline module of `scratchpad/weatherglass_ref/index.html` if the scratchpad was cleared).
  WG is built on three.js r186; differences from our r170 are flagged where they matter (§9).

---

## 0. Why the water-cycle valley looks flat (diagnosis)

The flagship scene (`js/seeds-scenes.js` `WATER_CYCLE`, built by `js/dio/builder.js`) is assembled from generic
primitives. Each one below is a specific, fixable cause:

| what you see | cause in our code | what Weatherglass does instead |
|---|---|---|
| a smooth green felt for a valley | `terrain` = one displaced 128² plane with the AAA `meadow` shader; **no geometry above the ground** | 20k / 60k / 120k instanced grass blades + 1.8k–7k flowers + reeds (WG:47262) on a terrain whose shader only fills the gaps between blades |
| a glassy slab for a lake | `water` = flat plane, `MeshPhysicalMaterial` with `transmission` (and that forces three to re-render every opaque object into a transmission target) | analytic depth from the terrain height, Beer–Lambert absorption, Fresnel reflection, sun glint + glitter, a lapping foam line, two-pass blending (WG:42180–42313) |
| cotton balls for clouds | `cloud` = 13 merged icosahedra with an opaque-ish sheen material | each cloud a box raymarched through a smooth union of the same puffs, eroded by 3-D noise, lit with dual-lobe phase, multiple-scattering octaves and a powder term (WG:57154–57339) |
| no sense of a cut-out world | round terrain whose rim just folds down | a rectangular block whose cut faces show strata: bedrock beds, gravel, clay, loam, humus, hanging roots, turf rim (WG:40063–40238) |
| a toy house | `house` = box + 4-sided cone + emissive planes | a log cabin with chinking, shingles, chimney smoke, a jetty, in one merged mesh with a per-vertex material kind (WG `B4`/`X4`, ~56535) |
| water with nowhere to go | no river, no waterfall; rain on the ridge simply vanishes | a spline river carved into the terrain, a waterfall sheet, plunge foam, a lake fed by it (WG:42940–43150) |
| trees as lollipops on a lawn | 14 trees, 2 species, one trunk + 4–5 branches, no wind in the shader | 40–80 plants, 6 species from recursive branch tables, crown-ellipsoid foliage normals, per-tree spring state and vertex wind (WG:45579, 45841, 45909) |
| a grey, low-contrast image | AgX in r170 ships **without** its look (`// v = agxLook(v, look);` is commented out in `tonemapping_pars_fragment`), so it renders the desaturated AgX base | ACES Filmic + a warm-lift grade (WG:36842, 36862) |

The outdoor *lighting* (cascades, sky bounce, atmosphere, god rays) and the AAA ground and rock *materials* are
already at the right level. The gap is almost entirely **content density and four special materials** (grass, water,
clouds, soil section). That is good news: none of it needs a new rendering architecture.

---

## 1. Priorities

Ordered by visible gain per hour of work. "Port" means the WG code can be moved over nearly line for line (it is the
user's own artifact, so reuse is fine); "adapt" means the idea transfers but the code must change.

| # | recipe | files | draw calls added (medium) | triangles (medium) | est. GPU ms (medium) | source |
|---|---|---|---|---|---|---|
| 1 | **R1 Terrain field** (one height/mask bake shared by everything) | new `js/dio/terrainfield.js`, `builder.js` `terrain` | 0 | 0 | 0 (CPU ~15 ms once) | WG `bakeTerrainData` (~38216), `br()` suitability (WG:38145) |
| 2 | **R2 Instanced grass** | new `js/dio/meadow.js`, `builder.js` | +1 | +280 k (40 k blades × 7) | 1.0–1.5 | port WG:45527–45560, 46648–46872, 45023 |
| 3 | **R4 Lake water shader** (drop transmission) | new `js/dio/waterfx.js`, `builder.js` `water`, `materials.js` | +2, but **−1 full opaque re-render** | +8 k | 0.3 (net saving 1.5–3) | port WG:41661–41882, 42180–42313 |
| 4 | **R6 Volumetric puff clouds** + cloud shadows | new `js/dio/clouds.js`, `builder.js` `cloud`, `aaa.js` (3-D noise bake), `materialize.js` (shadow hook) | +3 (one box each) | +36 | 1.5–2.5 | port WG:57154–57339, `JT()` hook (weatherglass.md §2) |
| 5 | **R7 Soil section skirt** | `builder.js` `terrain` (skirt mesh), shader in `aaa.js` | +1 | +2 k | 0.1–0.2 | port WG:40063–40238 |
| 6 | **R12 Tone and grade** (AgX "Punchy" look, outdoor exposure, miniature tilt-shift) | `renderer.js` grade pass, `environments.js` | 0 | 0 | ≈0 | Blender AgX looks; WG:36862 |
| 7 | **R5 River + waterfall + plunge foam** | `waterfx.js`, `terrainfield.js` (carving), `seeds-scenes.js` | +3 | +6 k | 0.2–0.4 | port WG:42940–43150 |
| 8 | **R8 Trees: species, crown normals, wind, alpha-to-coverage** | `trees.js` | 0 (instanced forests) | +60 k | 0.3 | adapt WG:45579–45612, 45841, 46030–46060, 46425–46549 |
| 9 | **R3 Flowers and reeds** | `meadow.js` | +2 | +100 k | 0.3 | port WG:47038–47197, `fR` reeds |
| 10 | **R9 Instanced rocks with lichen/moss** | `builder.js` `rock` (scatter mode), `aaa.js` crag | +1 (+1 per cascade) | +50 k | 0.2 | adapt WG `$T` rocks (weatherglass.md §3) |
| 11 | **R11 Contact-hardening soft shadows + sun colour model** | `materialize.js` / one-time `ShaderChunk` patch, `environments.js` | 0 | 0 | ≈0 (fewer taps on average) | adapt WG:37711–37758, `World._updateLight` |
| 12 | **R13 Scanned CC0 PBR sets** (soil, moss, bark) blended into the procedural materials, Poly Haven HDRI for reflections | `aaa.js`, `textures.js`, artifact assets | 0 | 0 | +0.2 (3 extra texture reads) | §6 texture sources; `hybrid-soil-moss-surface` (scottstts skills) |
| 13 | **R10 Log cabin, dock, chimney smoke** | `builder.js` `house` → `cabin` | +2 | +6 k | 0.1 | adapt WG `B4`/`X4` |
| 14 | **R15 Visual gate** (colour entropy, edge density, contrast) in the QA harness | `tools/` | — | — | — | `threejs-game-skills` visual scorecard |

Budget check for the rebuilt valley at medium: about 260 draw calls (today 444; the transmission pass alone accounts
for most of the difference), about 0.75 M triangles, and an estimated 5–7 ms of GPU work for the new systems on
top of the existing ~6–8 ms. That stays inside 16.7 ms, and the existing adaptive resolution and quality step-down
cover weaker GPUs. Low quality must keep: grass 16 k blades with 3 segments, no flowers, clouds at 20 steps, no
river glitter.

---

## 2. Recipes

### R1. One terrain field for everything

**Technique.** Bake the valley once into a float `DataTexture` (256 × 256 over the plinth) holding
`(height, riverMask, lakeMask, slope)`, and keep the same `Float32Array` on the CPU with a bilinear sampler
`field.h(x, z)`. Compose the height with **polynomial smooth max/min** so features blend without creases:

```js
// js/dio/terrainfield.js
const smax = (a, b, k) => { const h = Math.min(1, Math.max(0, .5 + .5 * (b - a) / k)); return a + (b - a) * h + k * h * (1 - h); };
const smin = (a, b, k) => -smax(-a, -b, k);
export function bakeTerrain({ w, d, N = 256, base, peaks = [], river = null, lake = null, pads = [] }) {
  const H = new Float32Array(N * N * 4);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i / (N - 1) - .5) * w, z = (j / (N - 1) - .5) * d;
    let h = base(x, z);                                                      // fBm meadow
    for (const p of peaks) h = smax(h, p.h * Math.exp(-((x - p.x) ** 2 + ((z - p.z) * p.squash) ** 2) / (p.r * p.r)) * (1 + .25 * p.ridged(x, z)), .35);
    let rm = 0; if (river) { const q = river.nearest(x, z); rm = Math.max(0, 1 - q.dist / q.halfWidth); h = smin(h, q.y - .05 * rm * rm, .08); }
    let lm = 0; if (lake) { const n = Math.hypot((x - lake.cx) / lake.rx, (z - lake.cz) / lake.rz) * (1 + .06 * Math.sin(5 * Math.atan2(z - lake.cz, x - lake.cx))); lm = Math.max(0, 1 - n);
      h = smin(h, lake.bottom + (lake.level + .38 - lake.bottom) * Math.pow(n / 1.25, 2.1), .12); }
    for (const p of pads) { const k = Math.min(1, Math.hypot(x - p.x, z - p.z) / p.r); h = h * k * k + p.y * (1 - k * k); }
    const o = (j * N + i) * 4; H[o] = h; H[o + 1] = rm; H[o + 2] = lm;
  }
  // slope from central differences into channel 3, then the texture and a CPU sampler
  /* … */ return { tex, h: (x, z) => bilerp(H, N, w, d, x, z, 0), mask: (x, z, c) => bilerp(H, N, w, d, x, z, c), w, d };
}
```

The lake bowl `bottom + (level + 0.38 − bottom)·(n/1.25)^2.1` and the river carving are WG's (weatherglass.md §3,
"Terrain"). Our `builder.js` `terrain` case keeps its spec fields and gains `peaks`, `river`, `lake`, `pads`; it
builds the mesh from `field.h` and publishes the field on the build context (`ctx.terrainField`) so later bodies
(grass, rocks, trees, water, the skirt) use it.

**Also bake a suitability function** like WG's `br(x, z, kind)` (WG:38145): a product of smoothsteps over slope,
height, distance to water and distance to the cabin. Grass, flowers, reeds, rocks and trees are all scattered by it,
which is what makes WG read as an ecology instead of a sprinkle: grass thins on steep ground, reeds stand only in the
shallows, trees avoid the path.

**Why it matters visually.** Every later recipe needs to know "how deep is the water here" and "is this ground
meadow, bank, beach or rock". Without one shared field the lake edge, the grass edge, the mud band and the foam line
disagree, and disagreeing edges are what make a scene look assembled.

**Cost.** CPU ~15 ms for 256² once at build; one 1 MB float texture; no per-frame cost.

**Also:** the scene code's raycast `hAt()` (seeds-scenes.js line 78) becomes `field.h(x, z)`: exact and ~1000× cheaper.

---

### R2. Instanced grass blades (port)

**Technique** (WG:45527–45560, 46670–46872, scatter 45023).
- Geometry: one blade = a strip of `seg` rows (two vertices each) plus a tip vertex (`Wy`, WG:46648): `x ∈ {−½, ½}`,
  `y = t ∈ [0, 1]`. 3 / 4 / 5 rows → 5 / 7 / 9 triangles.
- Per-instance attributes: `aRoot = (x, y, z, rand)`, `aShape = (height, width, yaw, droop)`,
  `aTint = (dryness, inLakeBasin, damp, turfDensity)`.
- Vertex shader on a `MeshStandardMaterial` via `onBeforeCompile`: the blade bends as a **circular arc** of constant
  length toward a bend vector `B` (radians, xz), so it never stretches however hard the wind blows:

```glsl
// vertex head (WG:45527, 45542)
vec3 vegArc(vec2 B, float L, float t, out vec3 T) {
  float th = max(length(B), 0.002); vec2 d = B / th; float a = th * t, s = sin(a), c = cos(a), r = L / th;
  T = vec3(d.x * s, c, d.y * s);
  return vec3(d.x * r * (1.0 - c), r * s, d.y * r * (1.0 - c));
}
vec2 vegWindBend(vec2 xz, float rnd, float stiff, out float gust) {
  vec2 W = uWind; float sp = length(W); vec2 dir = sp > 1e-4 ? W / sp : vec2(1, 0), perp = vec2(-dir.y, dir.x);
  float along = dot(xz, dir);
  float wave = 0.5 + 0.5 * sin(along * 2.3 - uTime * (2.2 + min(sp, 4.0) * 0.5) + snoise(xz * 0.8) * 5.0);
  wave *= wave * (3.0 - 2.0 * wave);                                   // sharp crests, broad troughs
  float amt = (1.0 - exp(-sp * 0.55 / stiff)) * 1.3 * (0.68 + 0.64 * wave);
  float fl = sin(uTime * (6.5 + rnd * 4.0) + rnd * 40.0 + along * 5.0), fl2 = sin(uTime * (4.1 + rnd * 2.0) + rnd * 23.0 - along * 3.0);
  float flAmp = (0.035 + 0.035 * min(sp, 4.0)) / stiff;
  gust = wave * (1.0 - exp(-sp * 0.7));
  return dir * (amt + fl * flAmp * 0.5) + perp * fl2 * flAmp * 0.55;
}
```

```glsl
// replaces <beginnormal_vertex> (WG:46745-46772, trimmed: no snow/season)
float H = aShape.x * uGrow;                       // uGrow: 0 → 1 as the materialize front passes (see below)
float gust; vec2 B = vegWindBend(aRoot.xz, aRoot.w, 1.0, gust) * mix(0.65, 1.3, clamp(H / 0.16, 0.0, 1.0));
B += vec2(-sin(aShape.z), cos(aShape.z)) * aShape.w;                 // resting droop
vec3 T; vec3 off = vegArc(B, H, position.y, T);
float tw = aShape.z + (aRoot.w - 0.5) * 1.3 * position.y;            // slight twist up the blade
vec3 side = vec3(cos(tw), 0.0, sin(tw));
float wdt = aShape.y * pow(1.0 - pow(position.y, 1.5), 0.8);         // tapering width
vec3 vegPos = aRoot.xyz + off + side * position.x * wdt;
vec3 n = normalize(cross(side, T)); n *= sign(dot(n, cameraPosition - vegPos) + 1e-5);   // thin blade faces the eye
vec3 objectNormal = normalize(mix(n, vec3(0, 1, 0), 0.45));          // 45 % toward up: the meadow shades as a sward
vGrass = vec4(position.y, aTint.x, aRoot.w, gust);
// and <begin_vertex> becomes: vec3 transformed = vegPos;
```

- Fragment: per-blade albedo computed **once per vertex** (meadow patches from two noise scales, lush damp
  swathes, a few straw-coloured dead blades: `step(0.94, fract(rnd·17.9))`, WG:46724–46742), darker at the root,
  fresher at the tip, **pale glossy flanks on wind crests** so gusts visibly sweep as bands (WG:46787).
- Light: root occlusion on direct and indirect light by height along the blade (WG:46794–46802) and a translucency
  lobe `pow(saturate(dot(V, −L)), 3)` added to the direct diffuse (`RE_Direct_Veg`, WG:45616–45627). These two terms
  are what make WG's grass glow in low sun instead of reading as green paint.
- Scatter (WG:45023): 45 % of blades in **tufts** of 6–20 within 2.5–6 cm, the rest uniform, rejected by the
  suitability field; heights `0.042 + 0.07·r²` (+ more on damp ground), widths 0.009–0.017 units. At our scale (the
  valley is 13 units, trees 0.8–1.5 tall) WG's numbers transfer unchanged.
- Distance LOD without popping (from the GPU-computed grass example in scottstts' skills,
  `gpu-grass-system.js` lines 534–538): beyond a distance band, cull a growing fraction of blades by their own hash
  and widen the survivors to keep coverage:
  `cull = smoothstep(d0, d1, dist); alive = step(cull, hash); width *= mix(1.0, 1.8, cull);` and fade blade colour
  toward the ground colour over the same band.

**Integration with our pipeline.**
- `materialize.js` `patchMaterial()` chains our `onBeforeCompile` but sets `customProgramCacheKey` to
  `'front-p' + type` for every patched material. Give the grass material its own `defines = { VEG_GRASS: '' }` (as
  `trees.js` does with `SM_FOLIAGE`), or its program will be shared with an unrelated patched
  MeshStandardMaterial.
- Card → real: during the drawing stage the meadow must not exist. Multiply the blade height by
  `uGrow = smoothstep(uFrontR − 0.6, uFrontR, frontD(root))` evaluated per blade root, so grass **grows out of the
  paper as the front passes**, a free and charming transition. (The materialize patch already gives every material
  `uFrontR` and `frontD`.)
- `castShadow = false` (WG does the same: blade shadows would be sub-texel noise at 0.008 units per texel), receive
  shadows, `userData.noInk = true`, `raycast = () => {}` so the edit tool never selects 40 000 blades, and an explicit
  `boundingSphere` (instanced geometry has none).

**Why it matters.** It is the single largest difference between our valley and WG. Blades give parallax, a soft
silhouette on every hill, self-shadowing at the root, colour variation and wind motion. Everything else in this
note is secondary to it.

**Cost.** Medium: 40 k blades × 7 triangles = 280 k triangles, 1 draw call, ~360 k vertex invocations with two noise
calls each (~0.6 ms) plus fragment work over ~30 % of the screen with 2–3× overdraw (~0.5 ms): **1.0–1.5 ms**. Low 16 k
× 5 = 80 k triangles; high 90 k × 9 = 810 k triangles (2–3 ms, high only).

---

### R3. Flowers, reeds and cattails (port)

**Technique.** Same instancing and arc bend as R2, with a small multi-part mesh per flower: a stem strip turned to
the eye, basal leaves, a petal ring and a disc; six species (daisy, buttercup, cornflower, violet, poppy, aster) with
the petal outline cut in the fragment shader (`discard` outside a species-specific width function), heads turned
toward the sun by day (WG:47060–47197). Reeds and cattails grow only where the suitability field says "shore
shallows" (`p > level − 0.07 && p < level + 0.07`, WG `UC`). Counts 1.8 k / 3.5 k / 7 k flowers, 0.7 k / 1.4 k / 2.2 k
reeds.

**Why.** Saturated points of colour at ~0.5 % coverage are what the eye reads as "meadow" rather than "lawn"; reeds
draw the lake shore as a line of texture instead of a geometric edge.

**Cost.** Medium: ~100 k triangles, 2 draw calls, ~0.3 ms.

---

### R4. The lake: analytic water, not a transmissive slab (port)

**Technique** (WG:41661–41882 helpers, 42180–42313 lake fragment).
1. Water depth is **analytic**: `depth = uWaterLevel − field.h(p.xz)` from R1's texture (no depth buffer read).
2. Normal = wind-driven Gerstner-like trains (4 directions, WG:41682–41706) + advected noise **chop** whose octaves
   fade out once they are smaller than a pixel (`fp = max(fwidth(p.xz))`, WG:41717–41731); the slope variance the
   pixel could not resolve **widens the glint lobe** instead of aliasing into speckles (WG:42286–42289). This is the
   "derivative-filtered normal bands" rule in scottstts' water-optics skill too.
3. Refracted path length to the bed `path = depth / max(−refract(−V, N, 0.75).y, 0.18)`; transmittance
   `T = exp(−σ·path)` with `σ = (2.65, 0.92, 1.04)` per unit (absorption kills red first; + silt `(0.8, 0.95, 1.35)·turbid`).
4. **Pass 1 (multiply)**: `gl_FragColor = vec4(T·(1−F)·(1−0.8·foam), 1)` with `blendSrc = Zero, blendDst = SrcColor`.
   The lake bed (our AAA `mud`/`meadow`, which already darkens and gets caustics, see below) shows through, tinted
   by depth.
5. **Pass 2 (add)**: in-scatter `albedo·ambient·(1−T)` + reflection `·F` + sun glint (normalised Blinn–Phong
   microfacet, `D·F/(4·N·V)`, which stretches a low sun into a long path, WG:41849) + glitter (Cox–Munk facet
   statistics, WG:41866) + foam. Blend `One, One` (WG uses `One, OneMinusSrcAlpha` with alpha 1, equivalent here).
6. Shore: a thin lapping foam line that breathes `lapPos = 0.011 + 0.008·sin(t·1.15 + noise·2π)`, lace from noise,
   plus whitecaps in strong wind (WG:42225–42233).
7. Reflection: start with the sky only (our scene paints a sky gradient; reflect `R.y = abs(R.y)` into it) plus a
   **dark landscape band** for low rays (`wLandscape`, WG:41655) so the far shore and hills read in the water. A
   planar mirror (WG renders it at 0.25–0.5 of screen resolution, only when the camera or the sun moves) is the
   high-quality upgrade: +1 scene render at quarter size ≈ 0.8 ms; high only.
8. Caustics on the bed: add the "drift" caustic web (WG:39686, also in `three-fluid-fx`
   `WaterCausticsDistortionPass.ts`) to the AAA meadow/mud **diffuse** where `depth > 0`, scaled by
   `exp(−1.4·depth)` and the sun's visibility. That is a 10-line addition to `aaa.js`, keyed by a `uAaaWaterLevel`
   uniform.

Sketch of the material pair (`js/dio/waterfx.js`):

```js
const common = { transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
  uniforms: { ...U /* time, wind, sun dir/colour, sky colours, field tex, level, shadow map + matrix */ }, vertexShader: VS };
const mul = new THREE.ShaderMaterial({ ...common, defines: { W_MUL: '' }, fragmentShader: FS, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor });
const add = new THREE.ShaderMaterial({ ...common, fragmentShader: FS, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, depthWrite: true });
const a = new THREE.Mesh(geo, mul), b = new THREE.Mesh(geo, add); a.renderOrder = 1; b.renderOrder = 1.001;
```

The add pass writes depth so that the `AtmospherePass` and god rays see the water surface, not the lake bed.

**Sun shadow on the water.** A `ShaderMaterial` does not get three's shadow chunks. Pass the sun's
`shadow.map.texture` and `shadow.matrix` as uniforms and compare by hand; in r170 depth is RGBA-packed:
`float lit = step(sc.z + bias, unpackRGBAToDepth(texture2D(uSunShadow, sc.xy)));` (include `<packing>`).

**Integration.**
- `patchMaterial` skips `ShaderMaterial`s, so the water does not take part in card → real. Add `FRONT_GLSL` and the
  front uniforms to the water shader (output paper colour when `isCard`) or fade `uOpacity` with the front.
- Keep the spec contract: `shape.kind = 'water'` builds a group with `userData.water`; add `shape.mode = 'lake'`
  (default in `landscape`) that uses this material and reads `ctx.terrainField`. Other presets (flasks, the ocean
  model) keep the existing `water` preset.
- Remove the separate `lakebed` plane from WATER_CYCLE: the terrain itself is the bed once R1 carves the bowl.

**Why it matters.** Real water is defined by depth-dependent colour (clear at the shore, deep teal in the middle),
Fresnel (mirror at grazing angles, transparent from above), and the sun's glitter path. Transmission gives none of
these; it gives a uniform glassy tint. **Cost:** 2 draws, ~8 k triangles, ~0.3 ms; and removing the only transmissive
material in the scene saves three's transmission pre-pass (a full re-render of all opaque objects into a mip-mapped
target), estimated 1.5–3 ms and ~100–150 draw calls at medium.

---

### R5. River, waterfall and plunge pool (port)

**Technique.**
- **River ribbon** along R1's spline (Catmull–Rom, 28 samples per segment, width `lerp(0.1, 0.24, t)`), with
  attributes `aFlow` (arc length), `aSide` (−1…1 across), `aDir`. Its fragment shader (WG:42940–43046) advects two
  noise-gradient octaves in **flow space** (`ft = τ − uFlowTime·(1 − 0.55·bank)`, so the banks lag and curl), with foam
  streaks riding the current, whitewater where the slope is steep, froth below the fall, a lapping waterline and
  bubble lines; reflection mixes the dark banks for low rays and the sky for high ones.
- **Waterfall sheet** (WG:43048–43114): a curved strip from the lip to the pool, uv `u` lip→pool, `w` across. Edges
  fray and the sheet opens into strands lower down (`strands = smoothstep(0.18, 0.45, streak + 0.3 − 0.28u)`), white
  water develops as it falls (`aer = smoothstep(0.02, 0.6, u)`), a glassy tongue over the lip, back-lit glow
  `pow(dot(−V, L), 4)`, premultiplied output. Its vertex shader swells the sheet with flow.
- **Plunge pool foam disc** (WG:43125–43149): rings of noise in polar coordinates with bubbles.
- Particles: 200–400 instanced mist/spray sprites at the foot (stateless: position = f(fract(t·speed + seed))).

**Why.** Moving water with foam is the strongest "this world is alive" cue after grass. For this lesson it is also
content: rain on the windward slope **runs off** down the river into the lake, which closes the cycle the lessons
describe (see §3, "Pedagogy hook").

**Cost.** 3–4 draws, ~6 k triangles, ~0.2–0.4 ms (the river covers little screen).

---

### R6. Volumetric puff clouds and their shadows (port)

**Technique** (WG:57154–57339).
- Keep our `cloud` spec (`r`, `puffs`) and its puff layout; instead of merging icosahedra, pass the puff centres and
  radii as `uniform vec4 uPuffs[20]` to a `ShaderMaterial` on a `BoxGeometry(1,1,1)` scaled to the puffs' AABB.
- Density: signed distance to the **smooth union** of the puffs; coverage `smoothstep(edge, −1.6·edge, sd)`;
  low-frequency **erosion** carves billows (`remap(cov, (1 − n1.r)·mix(0.62, 0.78, hf), 1)`), a flat condensation base,
  then high-frequency detail that is billowy on top and wispy underneath (`d = pow(d, mix(1.05, 0.55, hf))`). Detail
  **erodes**, it never adds density (the same rule as the volumetric-clouds skill).
- March: coarse strides until the first contact, then back off and refine to `≤ 1` optical depth per step; leap
  through empty space with the SDF; interleaved-gradient-noise jitter; stop at `T < 0.02`.
- Light: 4–6 steps toward the sun growing ×1.65, reused on alternate samples; dual-lobe Henyey–Greenstein
  `mix(hg(−0.3), hg(0.8), 0.5)` over **three multiple-scattering octaves** (Wrenninge:
  `lum = e^{−od}·ph0·powder + 0.45·e^{−0.3 od}·ph1 + 0.22·e^{−0.1 od}·ph2`) and a **powder** term that darkens the
  creases between front-lit billows; sky ambient on top, ground bounce underneath, AO by depth in the cloud.
- Colour from our model state: the scene code already computes `qc` (condensed water); map it to `grey`
  (albedo white → slate `(0.37, 0.40, 0.47)`) and darker bellies when raining. Replace the scene's
  `material.color.lerp(slate)` / `opacity` writes with `uniforms.uGrey` / `uFade`.
- 3-D noise: a 64³ RGBA8 tileable Perlin–Worley texture, baked once on the GPU with `THREE.WebGL3DRenderTarget`
  (64 slice draws) in `aaa.js` `prebake()`, shared by all clouds.
- **Cloud shadows** (weatherglass.md §2, `JT()`): patch `ShaderChunk.lights_fragment_begin` once so the sun's
  `directLight.color *= cloudShadowAt(worldPos)`; `cloudShadowAt` projects the point along the sun direction to the
  cloud layer and samples a 128 × 128 float texture of optical depth that the CPU splats from the puffs at 15 Hz with a
  1-2-1 blur, returning `exp(−τ)`. Our clouds move across the valley during every lesson, so their shadows sweeping
  over the meadow, the lake and the ridge are a large realism gain for almost no GPU cost.

```glsl
// fragment core (WG:57281-57339, trimmed)
for (int i = 0; i < MAX_STEPS; i++) {
  if (t >= tF || T < 0.02) break;
  vec3 p = ro + rd * t; float sd = shapeSD(p);
  if (sd > edge) { t += ds * max(1.0, floor((sd - edge) / ds)); continue; }      // empty-space leap
  float cov, dens = fullDensity(p, sd, cov) * uFade;
  if (dens > 0.003) {
    if (!fine) { fine = true; ds = dsF; t = max(tN, t - dsC * 0.8); continue; }  // back off, refine
    if ((++tick & 1) == 1 || T > 0.7) { od = 0.0; float sl = l0; vec3 lp = p;
      for (int j = 0; j < LIGHT_STEPS; j++) { lp += uSunDir * sl; od += lightDensity(lp) * sl; sl *= 1.65; } od *= sigma; }
    float powder = mix(1.0, 1.0 - exp(-od * 2.0 - dens * 0.6), 0.75 * (1.0 - backlit));
    float lum = exp(-od) * ph0 * powder + 0.45 * exp(-od * 0.3) * ph1 + 0.22 * exp(-od * 0.1) * ph2;
    vec3 Lin = sunCol * lum + mix(bounce, skyCol, smoothstep(0.0, 0.85, heightFrac(p.y))) * amo;
    float Tr = exp(-dens * sigma * ds); col += T * albedo * Lin * (1.0 - Tr); T *= Tr;
  } else if (fine && ++thin > 4) { fine = false; ds = dsC; }
  t += ds;
}
gl_FragColor = vec4(col, 1.0 - T);    // premultiplied: blend One, OneMinusSrcAlpha
```

Steps by quality: 20 / 30 / 44 primary, 4 / 5 / 6 light. Sort clouds back-to-front by `renderOrder`; switch the box to
`BackSide` when the camera is inside it (the POV lesson rides a parcel *into* the cloud). The `parcel` POV and
`track` shots stay valid: the cloud body keeps its position and scale contract.

**Why.** Clouds are a named actor in four of six lessons; they are the most-watched object in the scene, and
icosahedra are the most obviously fake thing in it.

**Cost.** 3 draws; each box covers ~5–15 % of the frame. Estimated **1.5–2.5 ms** at medium (WG ships the same budget
in its tier 1). If it is too much, render clouds into a half-resolution target and composite with a depth-aware
upsample (~0.7 ms).

---

### R7. The soil cross-section (port)

**Technique** (WG:40063–40238, mesh `LE` 40246). Make the valley a **rectangular block** and build a skirt: the four
vertical walls from the terrain edge down to a flat bottom, with attributes `aU` (distance along the perimeter),
`aSurf` (terrain height above this column), `aTop`, `aNy` (surface normal y). Its fragment shader paints, from the
top: a turf rim with blade streaks and a 0.04-unit overhang shadow; humus; loam with iron mottles, worm burrows and
embedded stones; a clay band (smooth, laminated, faintly sheeny); gravel (two Voronoi scales of domed stones in dark
grit); bedrock in sandstone/shale beds of uneven thickness that **tilt under the mountains**; sparse slanted joints;
hanging roots below the turf. Layer boundaries follow the surface profile (thick soil under meadows, rock near the
surface under peaks), wetness soaks down from the top after rain (`G.y` = our `aaaWet`), and the section darkens with
depth. Normals by screen-derivative bump (`tBump`, WG:39718), so no tangents or UVs are needed.

Port notes: replace WG's `groundAt` with our `AAA.uniforms.uAaaWet` / wet spot; replace `uGrassColor` with the
terrain's `low` colour. Put the shader in `aaa.js` beside the other kinds so it shares the noise library and quality
switches.

**Why.** It turns a landscape into a **diorama**: the cut edge says "this is a specimen, look inside", exactly what
the user loves in WG, and it is pedagogically on topic (infiltration, groundwater, the bedrock under the ridge).

**Cost.** 1 draw, ~2 k triangles, fragment-heavy but small on screen: ~0.1–0.2 ms.

---

### R8. Trees: species, crown normals, wind, clean alpha

What `trees.js` already has (bent trunk, clustered leaf cards, wrapped diffuse, translucency, AAA bark, instanced
forests) is good. Four changes close the gap to WG:

1. **Species table and recursive growth** instead of one hand-coded broadleaf. Port WG's table `HC` (WG:45841) for
   oak, birch, cherry (with blossom cells in the atlas), keep our pine, and grow branches level by level (`segs`,
   `kids`, `angle`, `lenRatio`, `tropism`, `wander`). Birch: chalk-white bark with dark lenticels and a black
   fissured base (WG:46528–46535). The scottstts `structured-ash-growth` reference states the same contract: a
   per-level table, stratified child slots, permuted angles.
2. **Crown-ellipsoid normals** for leaf cards: `normal = normalize(0.5·n_crown + 0.38·n_clump + 0.12·n_card)` where
   `n_crown` is the normal of the crown's ellipsoid at the card (WG:46030–46055). We bend toward the clump and crown
   centre already (0.65/0.35); add the ellipsoid term so a crown shades as one soft volume with a lit side and a
   shadow side at any distance. Per-card AO from depth in the crown and height in it (WG `F` term).
3. **Vertex wind** (WG:45579–45612): lean ∝ height², oscillation at `f = 0.95/√H`, the top dipping on an arc, branch
   noise coherent over a branch, leaf flutter about the card's attach point (never its centre). Store
   `aTree = (root, H)` and `aInfo = (index, flex, phase, kind)` per vertex. This replaces the whole-object `sway`
   behaviour in the spec (`behaviors: [{target: 'tree*', type: 'sway'}]`), which rotates rigid trees. Drive it from the
   scene's `wind` parameter through a uniform.
4. **`alphaToCoverage: true`** on foliage materials (we render into a 4× MSAA target, so it is supported; WG does it
   at tier > 0). Alpha-tested leaf edges stop crawling and get anti-aliased for free. (Wooden Raft Games' "Tackling
   transparent textures" compares alphaTest with sorted transparency and recommends alphaTest; alpha-to-coverage is
   the better third option once MSAA exists.)

Placement: scatter by R1's suitability: pines above the meadow on the ridge flanks, oaks in the valley, a birch
group along the stream, one blossoming cherry by the cabin, bushes along the path and the lake. Use `treeForest()`
for everything that is decor (2 draw calls per kind × variant).

**Cost.** ~40 trees: ~16 draws + shadow casts, ~100 k triangles total (+60 k), ~0.3 ms.

---

### R9. Rocks that sit in the ground

**Technique.** One `InstancedMesh` of 110 / 170 / 210 rocks from 4 shape variants (noise-displaced icosahedra), each
**sunk into the lowest of six surrounding terrain samples** and tilted partly to the terrain normal; stepping stones in
the river; boulders at the foot of the ridge (talus). Shading: our AAA `crag` already has relief, cracks, mineral
flecks and moss on up-facing ledges; add WG's lichen patches (`smoothstep(0.67, 0.71, noise3(p·8))·smoothstep(0.1,
0.6, N.y)`, two colours, WG:39772–39775) and **wetness at the waterline**. A custom depth material is not needed
(our rocks are opaque).

**Why.** Rocks half-buried with moss on top and grass around their base (R2's suitability says "bare within 3 cm of a
rock") anchor everything to the ground; floating, fully exposed spheres are what make our current two boulders look
placed.

**Cost.** 1 draw + 1 per shadow cascade; ~50 k triangles; ~0.2 ms.

---

### R10. A cabin worth looking at

**Technique.** Replace `house` in this scene with a `cabin` kind: logs (cylinders with end-grain discs), chinking
between them, a shingled roof, a stone chimney, a door, two windows with frames, a porch, a woodpile, and a jetty into
the lake. Merge everything into **one geometry with a per-vertex `aKind` attribute** and shade it with one material
whose fragment switches on the kind (log, end grain, chinking, shingle, stone, iron, glass, curtain) as WG's `X4`
does (~56535): end-grain rings, shingles with moss in the overlaps, algae and wet darkening near the waterline,
windows that glow warm in the evening lesson (`hour ≥ 18`). Chimney smoke: 40 instanced soft billboards rising with
the wind, each a closed-form function of its seed.

**Cost.** 1–2 draws, ~6 k triangles, ~0.1 ms.

---

### R11. Light that models form

1. **Contact-hardening soft shadows** (WG:37711–37758): replace `getShadow` in `ShaderChunk.shadowmap_pars_fragment`
   once at boot: 4 Vogel-disk taps over the widest radius → early out when all lit or all shadowed (most pixels);
   otherwise a blocker probe pulls the reference depth toward the light to estimate occluder distance, and the filter
   radius goes from 1 texel at contact to `shadowRadius` for distant occluders. Shadows are then crisp where a trunk
   meets the ground and soft under the crown, which is how real penumbrae behave. **r170 adaptation:** r170 has no
   `sampler2DShadow` path; use its `texture2DCompare(sampler2D, uv, z)` and define `interleavedGradientNoise` and a
   Vogel disk yourself (r186 provides both). Patch the chunk before the first compile, and keep `materialize.js`'s
   cascade selection (it calls `getShadow`, so it inherits the new filter).
2. **Sun colour and intensity from elevation** (WG `World._updateLight`, weatherglass.md §2): white-warm
   `(1, .94, .86)` → gold `(1, .68, .38)` below `sunY = .42` → red `(1, .43, .2)` near the horizon;
   `I = 4.6·smoothstep(−.035, .07, y)·(.68 + .32·smoothstep(.1, .55, y))`. Our landscape uses an HSL ramp that is
   noticeably flatter; port the three-key ramp into `environments.js` `R.update` and let `skyBounce` follow.
3. **Auto exposure** toward `lerp(1, 1.65, night)·(1 + 0.22·golden)` with rate 2.5/s, instead of the fixed
   `.55 + day·.35` (which under-exposes the golden-hour lesson).
4. **Reflections from a real sky**: our `landscape` reflects a synthetic `envScene`. Load one Poly Haven 1K HDRI
   (`kiara_1_dawn_1k.hdr` or `hilly_terrain_01_1k.hdr`, §6) through `RGBELoader` → PMREM, use it only as
   `scene.environment` (not as background) at intensity 0.3–0.5. Wet rocks, the water film, the cabin windows and
   any metal then reflect a believable sky with a horizon and clouds instead of a gradient.

**Cost.** ≈ 0 ms (the shadow filter is cheaper on average than r170's 17-tap PCF soft); one 1.5 MB file.

---

### R12. Tone mapping, grade and the miniature look

- **AgX "Punchy" look.** r170's `AgXToneMapping` omits the look step, so its output is the deliberately flat AgX
  base. Apply an approximation of Blender's Punchy look in the grade pass (display space, right after the OutputPass;
  Blender applies it inside the AgX curve, so tune by eye), per scene:
  `c = pow(c, vec3(1.35)); float l = dot(c, vec3(.2126,.7152,.0722)); c = l + (c − l)·1.4;` (power 1.35, saturation
  1.4). Expose it as `look.punch` (0 = base AgX, 1 = Punchy) in `renderer.js` `applyLook`; default 1 for outdoor
  dioramas, 0.5 for the hub. Alternative with the same effect: ACES Filmic for `landscape`, as WG does. Keep AgX:
  it handles the bright sun disc and bloom more gracefully, and the look restores the contrast.
- **Grade like WG** (WG:36862): vignette 0.32, warm lift `c·(1.01, 1, .985) + (.008, .007, .01)·(1 − c)`, grain 0.035.
  We already have these knobs; the valley's look should set them.
- **Tilt-shift tied to the camera** (WG): `amount = lerp(0.7, 0.95, p)·lerp(0.35, 1, v)` with
  `p = clamp((22 − radius)/12)` and `v = smoothstep(0.35, 1.05, pitch)`; focus band 0.17–0.24 around the target's
  screen height. A *little* miniature blur at the top and bottom of the frame is the strongest single cue that this is a
  precious small object; too much reads as a filter. We have `uTilt`; drive it from the camera rig.
- **Long lens for the overview.** WG frames its case at FOV 34 from radius 21.5. Our valley camera is
  `r = 13.5` at the default ~40° FOV, which exaggerates perspective and makes the valley look like a toy table
  rather than a miniature world. Use FOV 30–34 and scale the radius so the same width fits (`r ≈ 17–18`).

**Cost.** ≈ 0 (a few ALU in an existing pass).

---

### R13. Scanned CC0 texture sets, used where procedural is weakest

Our procedural bakes are right for relief and wetness, but procedural albedo has no "photographic" micro-variation:
grit, crumbs, fibres. Blend scanned CC0 sets in as the **micro layer**, keep procedural for macro, masks, relief and
wetness (the contract of scottstts' `hybrid-soil-moss-surface`: scanned sets own albedo/AO/roughness/normal micro
detail, procedural fields own displacement, masks, moisture and cracks):

- soil, banks, path: ambientCG **Ground103** (colour, normal, roughness, AO, displacement);
- moss on rocks, turf rim, damp hollows: ambientCG **Moss002**;
- bark: ambientCG **Bark001** (scottstts' `bark-color/normal/roughness.jpg`, 512 × 1024);
- the exact URLs and sizes are in §6.

Recipe in `aaa.js`:
1. Repack each set into two 1024² textures: `albedo` (sRGB JPEG q85, ~250 KB) and `ORM+N` as two files: a linear
   JPEG with AO/roughness/height in R/G/B (~300 KB) and the OpenGL normal (q92, ~500 KB). Three reads instead of five.
2. Sample in world space with the same projection the bake uses (planar Y for ground, triplanar for rock/bark), at a
   real-world tile (Ground103 covers ~2 m: at the valley's scale use tile ≈ 0.6 units).
3. **Break the repeat** with Inigo Quilez's "texture repetition" technique (3 hashed offsets per Voronoi cell blended
   by distance; or the cheaper 2-sample version keyed by a low-frequency noise index), so a 1K tile never reads as a
   grid over 13 units.
4. Blend: `albedo = mix(procedural, scanned · tint(procedural hue), uScan)`, normals by adding surface gradients (the
   bake's gradient + the scanned normal converted to a gradient), roughness by multiply-and-renormalise. Wetness still
   applies after.

Delivery: commit the repacked files under `assets/tex/` for the local build, and upload the same files as artifact
assets (each ≤ 15 MB; total ~3 MB) for the claude.ai build; the page declares the `assets` capability and loads them by
the URLs the upload returns. Fall back to the pure procedural material when a texture fails to load (the current
behaviour).

**Cost.** +3 texture reads per AAA fragment (~+0.2 ms), ~3 MB download, ~12 MB GPU memory with mipmaps.

---

### R14. Performance rules for all of the above

- **Instance or merge everything repeated**: grass, flowers, reeds, rocks, trees (per variant), cloud boxes, rain,
  smoke. Target ≤ 300 draw calls at medium including shadow passes (`threejs-game-skills` budget table: desktop ≤ 300
  calls, ≤ 750 k triangles, ≤ 2 post passes beyond render + output; we have 1–2 at medium/high).
- **Casters**: only trees, rocks, the cabin, mountains and clouds (cloud shadows come from R6's texture, so the cloud
  boxes do *not* cast into the shadow map). Grass, flowers, water, the skirt never cast.
- **Distance tiers**: grass hash-culling band (R2), tree crowns keep their card count (they are few), rocks at
  cascade 1–2 only beyond 8 units.
- **Quality picks** in one place (`gfx.quality`), as WG's `quality.pick(low, med, high)`: grass 16 k / 40 k / 90 k,
  blade segments 3 / 4 / 5, flowers 0 / 3.5 k / 7 k, cloud steps 20 / 30 / 44, light steps 4 / 5 / 6, river glitter off at
  low, planar mirror high only.
- **Prewarm** the new programs (`Materializer.prewarm()` → `gfx.prewarm()` already compiles the real and end states;
  the new materials must exist in the scene before it runs, with `uGrow = 1` variants identical to `uGrow = 0`).
- **Program keys**: every new `onBeforeCompile` material needs its own `defines` entry (see R2, "Integration").
- **Never `needsUpdate` per frame**; season, wind, wetness and cloud state are uniforms.

---

### R15. A visual gate, so "flat" is caught before the user sees it

`threejs-game-skills` (`threejs-aaa-graphics-builder/references/visual-scorecard.md`) measures screenshots: colour
entropy below ~3 bits or one colour above 60 % of the frame = sparse flat scene; edge density below ~0.04 =
primitive-dominated; luminance contrast below ~60 = fog/darkness compression. Add these three numbers to our
screenshot harness for the flagship overview, the lake push and the ridge medium shot, and record them before and
after each recipe. They are advisory (a calm composition can measure low), but they are objective evidence for the
judgement the user made by eye.

---

## 3. Rebuilding the water-cycle valley to Weatherglass quality

The lesson code (thermodynamics, clouds' state machine, rain, the parcel, the tracks, the shots) stays. Body ids,
positions of actors and the wind axis (−z) stay, so `tour`, `tracks.parcel`, `shots` and `flows` remain valid. What
changes is what those bodies are made of and what surrounds them.

### Layout (top view, units; the wind blows toward −z)

```
 z = −4.5 ┌──────────────────────────────────────────────┐  back edge rises (R1: smoothstep(.2, −3.9, z)² · 1.25)
          │  farhill bands (painted, outside the block)   │
 z = −2.8 │      ridgeN ▲      RIDGE ▲ (actor)   ridgeS ▲  │  pines on the flanks above h ≈ .6; scree + boulders at the foot
          │            ╲ saddle: spring                   │
 z = −1.6 │             ╲ stream (R5)                     │  birch group along the stream
 z = −0.7 │              ╲__ waterfall, 0.35 drop ──┐     │  cliff step band in R1
          │   oaks, bushes     ╲ plunge pool        │     │
 z = +0.3 │                     ╲___ river mouth    │     │  reeds + cattails in the shallows
 z = +1.7 │   path ┄┄┄┄┄┄┄┄┄┄  LAKE (actor) 2.5 × 2.9 │  ▲ windsock (2.9, .2)
          │                 ellipse, noisy rim       │     │
 z = +3.7 │       meadow + flowers     dock ═╗   CABIN (3.5, 3.7) + chimney smoke, woodpile, cherry in blossom
 z = +4.5 └──────────────────────────────────────────────┘  front + right faces cut: soil section (R7) toward the camera
          x = −6.5                                     x = +6.5
```

- **Block**: 13 × 9 units (x × z), terrain from R1 on a 288 × 200 grid (medium; 160 × 108 low, 384 × 256 high), with
  WG's diagonal choice per quad (pick the flatter diagonal) so ridges do not zig-zag. The rounded rim goes; the two
  sides facing the default camera are cut and show the soil section; the other two can be cut too (cheap) for orbiting.
- **Plinth**: our `plinth()` in walnut under the block, 0.25 proud on every side, with the AAA wood. A brass
  nameplate: "The water cycle".
- **Beyond the block**: no 3-D far hills (they compete with the ridge and cost shadows). Two painted hill bands
  (`proc.js` `hillLayer`) on a cylinder at r ≈ 40 behind the ridge, hazed by the atmosphere pass, and the scene's
  painted sky gradient. This keeps the reading "a world in a specimen block" while still giving depth.

### Layers (back to front)

1. Sky gradient (scene code) + sun disc and glare sprite (already there) + Poly Haven HDRI as reflection only (R11).
2. Painted far hill bands with aerial perspective.
3. Ridge and two side ridges: R1 Gaussian peaks with ridged noise, smooth-max into the base; AAA `crag` with strata
   (WG `tRock` banding is a good palette reference: `(.13, .125, .12)` → `(.30, .28, .25)`, iron-stained beds `(.26,
   .18, .12)`), moss on ledges, snow only if a lesson asks (snowline 9 = off today).
4. Pines on the flanks, birches by the stream, boulders and scree at the foot (R8, R9).
5. Stream, waterfall, plunge pool (R5).
6. Meadow: R2 grass + R3 flowers, bare earth on the path and around the cabin (Ground103 micro layer, R13), damp dark
   banks with pebbles along the stream and the lake (WG `bankM`, `tPebbles`), a narrow sandy beach on the lake's south
   shore (`beachM`).
7. Lake (R4) with reeds, a dock and a rowing boat tied to it.
8. Cabin with smoke (R10), a cherry in blossom, a woodpile, the windsock (keep: it is an actor).
9. Clouds (R6) with their shadows on all of the above; rain (keep the scene's streaks but draw them as velocity-aligned
   instanced quads with a soft profile, and add splash rings on the lake with `wRainRings`, WG:41737).
10. Soil section at the cut edge (R7), wetting from the top where it rained.

### Materials (summary)

| surface | material | notes |
|---|---|---|
| meadow floor between blades | AAA `meadow`, darkened to `grass · (0.4 + 0.34·tuft)` (WG:39829) | the floor is mostly *shadow between blades*; ours is too bright and too uniform |
| path, cabin yard | AAA `mud` + Ground103 micro | trodden: lighter, smoother, pebbles |
| banks | dark humus `(.07, .05, .035)–(.12, .088, .055)` with pebbles and moss | saturate with the shore wetness we already have |
| ridge | AAA `crag` | add lichen (R9), keep POM |
| lake bed | the terrain itself, AAA mud/silt + caustics (R4.8) | delete the `lakebed` plane |
| water | R4 / R5 shaders | no transmission anywhere in this scene |
| trees | R8 species; AAA bark + Bark001 micro | |
| cabin | R10 one-material kinds | |
| clouds | R6 | |
| soil section | R7 | |

### Lighting

Landscape preset as now (sun = cascade 0 fitted to the block, cascades 1–2, sky bounce, atmosphere pass) plus R11:
contact-hardening shadows, the WG sun colour ramp, auto exposure, HDRI reflections, cloud shadows. Default hour 11
gives a high sun; the shot list should prefer **hour 9–10 or 15–16** for the overview (long shadows across the
meadow, a glitter path on the lake, back-lit grass when the camera looks toward the sun's azimuth). The
`environment.azimuth: −45` places the sun front-left of the default camera; rotate it to back-left (≈ +135°) for the
overview so the clouds get a silver lining and the grass glows: back light is where every recipe above pays off most.

### Camera

- Overview: FOV 32, radius ~18, pitch ~1.13 rad (WG "hero"), target `[.3, 1.4, −.3]`; tilt-shift band on the lake
  and the river mouth.
- Lake push: FOV 28, low pitch (~0.35 rad above the water) so the far shore reflects and the glitter path stretches.
- Ridge medium: from the lee side, looking back at the cloud climbing the windward slope (the rain shadow lesson).
- Keep the parcel POV (74°) and the track shot; inside a cloud the R6 material switches to `BackSide`.

### Pedagogy hook (optional, for the lesson author)

The river makes runoff visible: after "Wind to the ridge" the stream's `uFlow` can rise with `rainSlope`, the waterfall
swells (the vertex shader already widens it with flow) and the lake level rises a few millimetres (WG `waterRise`).
That is the closing arc of the cycle, which the current scene can only describe in text.

### Order of work

R1 → R2 (judge the scene here: most of the "flat" complaint should be gone) → R4 → R6 → R7 → R12 → R5 → R8 → R3 →
R9 → R11 → R10 → R13. Measure draw calls, triangles and programs with `gfx.stats()` after each step and record the
R15 metrics.

---

## 4. Hub and room materials

What makes marble, gilt, wood, fabric and plaster read as real is, in order: **(1) an environment that contains the
room's real bright sources**, (2) **roughness variation** that follows use and geometry, (3) albedo inside physical
ranges, (4) edge and cavity wear, (5) micro-normals at the correct real-world scale, (6) contact occlusion. Our hub
fails mostly on (1) and (2).

### 4.1 First: reflect the hall, not a generic studio (biggest win)

The hub and rooms use `gfx.envStudio`, a PMREM of three's `RoomEnvironment` (a grey box with soft boxes), at
intensity 0.16–0.2; gilt compensates with `envMapIntensity: 3.4` (`baroque.js` line 23). A polished floor and gilt
mouldings therefore reflect a room that is not there, which reads as plastic.

Recipe (`hub.js` / `roomshell.js`, after the hall is built): render a `CubeCamera` (256²) once from about eye height in
the middle of the hall, with the windows as **HDR emissive** (radiance 8–20, not 1) and the lamps/candles on, then
`pmrem.fromCubemap()`; set it as `scene.environment` at intensity 1, and drop gilt's `envMapIntensity` to ~1.2. Re-bake
only when the hall layout changes (bookcases moved). Polished marble then shows the window shafts and the dark
bookcases, and gilt flashes where the windows are mirrored: the two visual signatures of a baroque library. Fallback
until the probe is ready: a Poly Haven interior HDRI (`dancing_hall_1k.hdr` or `st_fagans_interior_1k.hdr`, §6).

Cost: one-time 6 renders of the hall at 256² + PMREM, ~30–60 ms at load behind the veil; zero per frame.

### 4.2 Marble (floors, columns, scagliola)

- Polished floor: `roughness 0.06–0.12`, `clearcoat 0` (the polish *is* the surface; a clearcoat on top doubles the
  reflection and looks lacquered). Variation is what sells it: a **traffic map** (rougher, 0.2–0.3, and slightly
  duller along walking paths and before the doors and bookcases), per-tile roughness jitter ±0.03, faint lippage
  (tiles tilted 0.1–0.3° each, via a per-tile normal offset), grout recessed with dirt (`albedo × 0.6`, roughness 0.9).
- Columns: veins with **soft translucency**: marble scatters light under the surface; fake it with a wrap term
  `(N·L + 0.3)/1.3` on the diffuse and a slightly lighter, warmer albedo near silhouettes (sheen 0.15, sheenColor warm
  white), never with transmission.
- Albedo: statuary 0.70–0.80 linear at most; coloured antiques per `textures.js` `MARBLES` are fine.
- Normal map: almost none on polished stone (veins are flat); only the per-tile and chip normals.

### 4.3 Gilt (water gilding vs oil gilding)

- Gold F0 (linear) `(1.0, 0.78, 0.34)`, metalness 1.
- **Burnished highs, matte lows**: water-gilded frames are burnished only on raised parts. Drive roughness by
  curvature/cavity: `roughness = mix(0.12, 0.45, cavity)`; cavity from the mouldings' baked vertex AO (we already bake
  flute hollows into vertex colours in `baroque.js`).
- **Bole showing through** on worn edges (rubbed arrises): red-brown `(0.42, 0.13, 0.06)` dielectric (metalness 0,
  roughness 0.6) where `edgeWear · noise > threshold`. A few percent of the area is enough.
- **Toned recesses**: a dark brown glaze `(0.10, 0.07, 0.04)` in cavities, metalness 0.3.
- Leaf seams (we have them in `gildTex`) at 8 cm squares in real scale; keep.
- Without 4.1 none of this shows: gilt *is* a mirror of the room.

### 4.4 Wood (walnut, boiserie, bookcases)

- Figured grain plus **pores**: a fine anisotropic normal along the grain (pores ~0.3 mm, scale correct for 1 m =
  1 unit), roughness 0.45–0.55 in the wood, a **varnish clearcoat** 0.4–0.6 with clearcoatRoughness 0.2–0.3 whose
  normal stays flat (varnish fills the pores: the base layer is rough and textured, the coat is smooth).
- Per-board colour and grain-angle jitter (instance colour or a per-board UV offset) so panels do not repeat.
- Wear: lighter, smoother edges on shelf fronts and stair handrails; darker grime in the corners of panels (cavity).
- Albedo: walnut 0.05–0.15 linear; pale fruitwood 0.25–0.4.

### 4.5 Fabric (curtains, cushions, the reading-chair, the runner)

- `sheen` is the defining term: sheen 0.6–1, `sheenColor` = the fabric colour lightened (velvet: much lighter and
  desaturated), `sheenRoughness` 0.3 (velvet) to 0.6 (wool).
- Weave normal at thread scale (a thread is ~0.5 mm; a 2 cm tile at 32 threads), fading to zero beyond ~3 m
  (mipmapped normals do that if the map's mip chain is right).
- Diffuse: wrapped (`(N·L + 0.5)/1.5`) for soft cloth; roughness 0.9+; albedo of dyed wool 0.05–0.4.
- Drape geometry matters more than shader: curtains need folds (a sine-swept plane with gathered top, ~40 segments),
  not a flat plane.

### 4.6 Plaster and stucco

- Lime plaster is never flat or pure white: albedo 0.65–0.78 warm, **trowel undulation** as a low-frequency normal
  (30–60 cm wavelength, ±0.5°), fine grit (0.5 mm), roughness 0.85–0.95, and faint hairline cracks.
- **Cavity and corner darkening**: AO toward the cornice, the coving and the floor (bake per-vertex at merge or use a
  distance-to-edge term in the wall shader), plus a soft dirt gradient up from the skirting (0–30 cm).
- Stucco ornaments (rocaille): same albedo, slightly smoother on the highs (handled during gilding prep), dust in the
  recesses.

### 4.7 Contact occlusion

Bake per-vertex AO for the merged hall geometry once at build (a short-range hemisphere test on the CPU against the
merged meshes, or `three-mesh-bvh` if added): bookcases on the floor, pilasters on walls, statues on plinths. At high
quality add three's `GTAOPass` (in r170: half-resolution, denoised; `radius ≈ 0.25`, 16 samples) for dynamic objects;
note that `GTAOPass` darkens the final colour, not only indirect light, so keep its intensity low (≤ 0.6). Cost:
GTAO ~1.5–2.5 ms at 1080p (it re-renders the scene for normals and depth): high only.

---

## 5. Hub/room texture sets (when downloads are possible)

If the user downloads ambientCG sets in a browser on their machine (the ambientCG and Poly Haven hosts are not
reachable from this container or from the connected-device shell; §6), these ids exist (verified in a mirror's
folder listing) and fit the rooms: **Marble009 / Marble012 / Marble023** (floors, columns), **WoodFloor041,
Wood049** (boards, panels), **Fabric048** (upholstery), **Plaster001, PaintedPlaster017** (walls), **Rock024 / Rock026** (exterior
stone), **Grass004** (meadow micro layer, if R2 is not enough at close range). Use the 1K-JPG packages; repack as in
R13.

---

## 6. Texture sources reachable from this environment (tested 2026-11-06)

Network tests from the container (and the connected-device shell, same allowlist):

| host | result |
|---|---|
| `ambientcg.com` (API and downloads) | **blocked** |
| `api.polyhaven.com`, `dl.polyhaven.org`, `polyhaven.com` | **blocked** |
| `huggingface.co` (texture datasets) | blocked (container) |
| `registry.npmjs.org`, `unpkg.com`, `cdn.jsdelivr.net` (from the container shell; the published page itself still loads scripts from jsDelivr) | blocked |
| `raw.githubusercontent.com` | **works** (200, full files) |
| `git clone` over HTTPS from github.com | **works** (shallow and blobless clones) |
| GitHub REST API via `gh` | blocked for repos not attached to the session |

So: **CC0 PBR sets can be fetched only where they are mirrored inside GitHub repositories.** Three such sources
were found and verified; everything below is CC0 1.0 (public domain) unless noted.

### 6.1 PBR material sets (CC0)

All from `scottstts/Threejs-Awesome-Graphics-Agent-Skills` (MIT repository; these files are ambientCG / Poly Haven
assets under CC0, stated in its `THIRD_PARTY_LICENSES.md` for Bark001 and by the ambientCG/Poly Haven file names
for the others). Pin the commit `53eb5a24097425d82532ec33697ad472750132a4`. Base URL:
`https://raw.githubusercontent.com/scottstts/Threejs-Awesome-Graphics-Agent-Skills/53eb5a24097425d82532ec33697ad472750132a4/`

| set (source, licence) | path under the base URL | maps, size each | use |
|---|---|---|---|
| **Ground103** (ambientCG, CC0) | `skills/threejs-procedural-materials/assets/hybrid-soil-moss-surface/Ground103_1K-JPG_{Color,NormalGL,Roughness,AmbientOcclusion,Displacement}.jpg` | 1024²: 1505 / 2137 / 854 / 905 / 479 KB | soil, path, banks, soil-section humus micro layer |
| **Moss002** (ambientCG, CC0) | `…/hybrid-soil-moss-surface/moss/Moss002_1K-JPG_{Color,NormalGL,Roughness,AmbientOcclusion}.jpg` | 1024²: 1841 / 2396 / 728 / 897 KB | moss on rocks and trunks, turf rim, damp hollows |
| **Bark001** (ambientCG, CC0) | `skills/threejs-procedural-vegetation/assets/structured-ash-growth/bark-{color,normal,roughness}.jpg` | 512 × 1024: 831 / 1271 / 397 KB | trunk micro layer (oak, pine) |
| **aerial_asphalt_01** (Poly Haven, CC0) | `skills/threejs-precipitation-surfaces/assets/wet-puddle-rain/road/aerial_asphalt_01_{diff,nor_gl,rough,ao}_2k.jpg` | 2048²: 2802 / 2752 / 1393 / 1930 KB | not needed for the valley; a wet cobble/road reference |
| **Ice002** (ambientCG, CC0) | `https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/textures/ambientcg/Ice002_1K-JPG_{Color,NormalGL,Roughness,Displacement}.jpg` | 1024², NormalGL 1277 KB | frozen lake / winter variant |

The same repository also holds `luminescent-water/assets/rock-*.jpg` and `coastal-breaker-ocean/sand-*.jpg`, but their
provenance is not stated; do not use them.

Not usable: `MrBrax/Source-2-Public-Domain-Textures` mirrors ~150 ambientCG/Poly Haven sets (marble, wood, fabric,
plaster, rock) but only as **compiled Source 2 `.vtex_c` files**, not images. `BabylonJS/Assets` textures are
**CC BY 4.0** (attribution required) and not documented per file. `pmndrs/drei-assets/normals/*` has no stated
licence.

### 6.2 HDRIs (Poly Haven, CC0), 1K, for reflections and IBL

| file | URL | size | use |
|---|---|---|---|
| kiara_1_dawn_1k.hdr | `https://raw.githubusercontent.com/pmndrs/drei-assets/master/hdri/kiara_1_dawn_1k.hdr` | 1475 KB | valley reflections, golden-hour lessons |
| hilly_terrain_01_1k.hdr | `https://raw.githubusercontent.com/gkjohnson/3d-demo-data/main/hdri/hilly_terrain_01_1k.hdr` | 1600 KB | valley reflections, midday |
| aristea_wreck_puresky_1k.hdr | `https://raw.githubusercontent.com/gkjohnson/3d-demo-data/main/hdri/aristea_wreck_puresky_1k.hdr` | 1453 KB | sky-only reflection (no ground in the probe) |
| dancing_hall_1k.hdr | `https://raw.githubusercontent.com/gkjohnson/3d-demo-data/main/hdri/dancing_hall_1k.hdr` | 1725 KB | hub fallback probe (ornate hall with windows) |
| st_fagans_interior_1k.hdr | `https://raw.githubusercontent.com/pmndrs/drei-assets/master/hdri/st_fagans_interior_1k.hdr` | 1524 KB | room fallback probe (old timber interior) |
| venice_sunset / quarry_01 / blouberg_sunrise_2 / moonless_golf (1k) | `https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/textures/equirectangular/<name>_1k.hdr` | 1.4–1.7 MB | alternatives |

`pmndrs/drei-assets` credits "HDRIs from HDRI Haven" and `gkjohnson/3d-demo-data` "HDRI files are from Polyhaven.com";
Poly Haven assets are CC0.

### 6.3 Can they be artifact assets?

Yes. Every file is far below the 15 MB per-asset limit (largest 2.8 MB; after repacking per R13, 0.25–0.5 MB). The
artifact must declare the `assets` capability; upload with `Artifact` `asset: true` (up to 25 images per call) and
reference the returned URLs. For the local build, keep the repacked files in `assets/tex/`. Total for the valley
(Ground103 + Moss002 + Bark001 repacked + one HDRI): ~4.5 MB.

---

## 7. What each external reference contributed (and what to ignore)

- **Weatherglass** (the user's artifact): the source of R2–R7, R10, R11 and the grade. Port directly (see the report
  list at the end of §8).
- **scottstts/Threejs-Awesome-Graphics-Agent-Skills**: the CC0 texture sets (§6); the hybrid soil/moss contract (R13);
  the GPU grass distance-culling with density compensation (R2); vegetation rules (crown normals, petiole-anchored
  leaf wind, per-level species tables) that confirm R8; water-optics failure list (unfiltered micro-waves, constant
  opacity instead of Fresnel) that matches R4; cloud rule "detail erodes, never adds". Its examples are mostly
  WebGPU/TSL or large systems (spectral ocean, BVH glass, XPBD cloth); none is a better fit than WG's code for our
  WebGL2 diorama.
- **majidmanzarpour/threejs-game-skills**: the render budget table and the visual scorecard with measurable
  thresholds (R14, R15); its core rule "glow does not make primitives look AAA; authored forms first, then materials,
  then lighting, then effects" is exactly the order of §1.
- **dgreenheck/webgpu-claude-skill**: TSL/WebGPU only (r183+ APIs). Not applicable to the r170 WebGL2 path; useful
  later if the app moves to `WebGPURenderer` (compute-shader grass placement, indirect draws).
- **artcodev/three-fluid-fx**: a 2-D stable-fluids solver with GLSL and TSL passes (MIT). Its caustic web is the
  same "drift" formula WG uses (R4.8). A 2-D fluid could drive the scrolls' explanatory animations (ink in water,
  smoke) but adds nothing to the diorama realism.
- **azakhary/nixie-fx**: a particle-effect runtime for an external editor's exported bundles (MIT, npm). Useful only
  if particle effects are authored in that editor; our stateless instanced particles (rain, smoke, spray) are simpler.
- **AftabIbrahimKazi/ai-dev-kit**: coding standards and agent tooling; no graphics content.
- **three.js r170 examples**: `webgl_postprocessing_gtao` (GTAOPass with denoise; §4.7), `webgl_shaders_ocean` /
  `webgl_water` (Reflector-based planar water; WG's own low-res mirror is the better model for R4.7),
  `webgl_mesh_batch` (`BatchedMesh` with per-object culling and sorting: an option for the hub's many distinct props,
  not needed in the valley), `webgl_instancing_performance` (instanced vs merged vs naive: confirms instancing for
  repeats), `webgl_shadowmap_csm` (camera-fitted cascades, rejected in aaa-rendering.md §4.1 for good reasons),
  `webgl_materials_envmaps_groundprojected` (`GroundedSkybox`: not needed). `webgl_loader_gltf_progressive_lod` and
  `webgl_batch_lod_bvh` do not exist at r170.
- **Wooden Raft Games blog**: "Tackling transparent textures" (alphaTest vs sorted transparency for grass; R8.4),
  "Fix lag when adding or removing dynamic lights" (the light-count recompile we already fixed), "Simple height fog"
  (superseded by our atmosphere pass), "How to implement LOD".
- **GitHub topic three-js**: top repositories are frameworks and tools (three-mesh-bvh, pmndrs/postprocessing,
  Gaussian splats, path tracers); none targets terrain/grass/water specifically. `three-mesh-bvh` is the one worth
  adding later, for fast raycasts against the dense valley (edit tool) and baked AO in the hub.
- **Three.js Resources site** (threejsresources.com): category index (Materials & Textures, Shaders, TSL, Performance,
  Post-Processing); no specific grass/water/terrain resource beyond a commercial water add-on. **TSL Textures**
  (procedural marble, wood, etc.) is TSL/WebGPU only; its formulas can be ported to GLSL if a texture is missing.

---

## 8. 2-D figures and loops in scrolls (separate workstream, short)

- **Static explanatory figures**: write **SVG** directly (or with **D3** for data-driven parts: `d3-shape` for curves
  and areas, `d3-scale` and `d3-axis` for plots). SVG stays crisp at any zoom, inherits the scroll's fonts, takes CSS
  colour tokens (light/dark), and is accessible text. D3 is on cdnjs (exact version pin, e.g. `d3@7.9.0`).
- **Animated loops ("GIF-like")**: animate the same SVG with CSS keyframes or the Web Animations API; for particle or
  field animations (vapour rising, rain, flow lines) use a `<canvas>` 2D context with `requestAnimationFrame` and a fixed
  seed, looping on an exact period. Pause off-screen with `IntersectionObserver`; honour `prefers-reduced-motion`.
- **When a real file is needed** (export, sharing): record the canvas with `MediaRecorder` to WebM, or encode a GIF
  with the small `gifenc` encoder. Avoid real GIFs inside the app: they are larger and lower quality than a live SVG.
- **p5.js**: good for quick generative sketches, but it is a 1 MB runtime with its own global loop; plain Canvas 2D is
  enough here. **Fabric.js**: only if a figure must be user-editable (drag labels, annotate). **Babylon.js**: a second
  3-D engine; no reason to mix it with three.js. **node-canvas / Skia (CanvasKit)**: server-side or heavy (~7 MB wasm);
  not for a no-build artifact.

---

## 9. Porting notes (WG r186 → our r170) and pitfalls

- Shadows: r170 `getShadow` takes `sampler2D` with RGBA-packed depth (`texture2DCompare` → `unpackRGBAToDepth`); WG's
  r186 code uses `sampler2DShadow`, `vogelDiskSample` and `interleavedGradientNoise`, which r170 lacks. Define the two
  helpers yourself.
- `RE_Direct_Physical`, `geometryNormal`, `geometryViewDir`, `geometryPosition` and the chunk names WG replaces
  (`begin_vertex`, `beginnormal_vertex`, `color_fragment`, `roughnessmap_fragment`, `aomap_fragment`,
  `lights_physical_pars_fragment`, `normal_fragment_begin`) all exist in r170.
- `materialize.js` chains `onBeforeCompile` but overwrites `customProgramCacheKey`: use a unique `defines` entry per
  new material kind.
- `ShaderMaterial`s (water, clouds, waterfall) are not patched by the materializer: add the card → real logic yourself.
- WG's `GLSL_COMMON` (`windAt`, `groundAt`, `terrainAt`, `cloudShadowAt`) is backed by its own data textures; map them to
  ours: `windAt` → a uniform from the scene's `wind` parameter (or a small CPU field later), `groundAt` →
  `AAA.uniforms` wetness, `terrainAt` → R1's field texture, `cloudShadowAt` → R6's texture.
- WG renders with ACES and exposure ~1–1.65; our AgX pipeline needs the R12 look, or WG's albedo constants will look
  washed out. WG albedos are display-tuned for ACES; check them against the linear ranges in `aaa-rendering.md` §1.3.

### Port directly from Weatherglass (summary)

1. Grass blade geometry, arc bend, wind bend, blade albedo, root AO, translucency (WG:45511–45627, 46648–46872) and the
   tufted scatter (WG:45023).
2. Flowers with species petal outlines (WG:47038–47197); reeds/cattails (`UC`, `fR`).
3. Lake fragment and helpers: `wSigma`, `wAlbedo`, `wWaves`, `wChop`/`wChopLostVar`, `wGlint`, `wGlitter`, foam line,
   two-pass blending (WG:41655–41882, 42180–42313).
4. River ribbon and waterfall sheet and plunge foam (WG:42940–43149).
5. Puff-cloud raymarch with erosion, dual-lobe phase, multiple-scattering octaves, powder (WG:57154–57339) and the
   cloud-shadow light hook (`JT`).
6. Soil section shader (WG:40063–40238) and the skirt attributes (WG:40246+).
7. Rock shading `tRock` (WG:39750–39779) and pebbles/caustics/ripples helpers (WG:39686–39741).
8. Contact-hardening shadow filter (WG:37711–37758), adapted to r170.
9. Tree wind `vegTreeDisplace` (WG:45579–45612), species table (WG:45841) and crown-normal construction (WG:46030–46060),
   bark shading by species (WG:46513–46549).
10. Sun colour/intensity ramp, auto exposure, tilt-shift driven by the camera, grade constants (weatherglass.md §2).

---

## 10. Material sources explored (interiors pass, 2026-11-07)

What was looked at for the hub, book rooms and demo props, what was used, and why. Implementation:
`js/gfx/surfaces.js` (probe, surface stack, GTAO), `js/gfx/textures.js` (companion maps), `js/gfx/baroque.js`,
`js/gfx/materials.js`, `js/dio/environments.js`.

**Three.js Resources** (threejsresources.com). Categories browsed: Materials & Textures (18), Environment (14),
Lighting (4), Shaders (14), TSL. Related-resource chains followed from tool pages: *Physically Based* → Freestylized,
Freepbr, Textures.com, Cgbookcase; *tsl textures* → tsl-Uniform-UI, Three.js Water Pro, Powershot, Three.js Journey
WebGPU/TSL course; Lighting → HDRify, three-good-godrays (pmndrs postprocessing). Used: **Physically Based**
(physicallybased.info, CC0 database, cloned from `AntonPalmqvist/physically-based-api`, `deploy/v2/materials.json`)
for measured values: metal F0 in linear sRGB (brass 0.91/0.778/0.423, gold 1.0/0.773/0.307, copper 0.932/0.623/0.522,
stainless 0.669/0.639/0.598, chromium 0.654/0.685/0.701, iron 0.53/0.51/0.49), marble albedo 0.83/0.79/0.75 with
subsurface radius 0.85/0.56/0.40 (red scatters farthest: the warm wrap tint on pale marble), borosilicate/soda-lime
glass ior 1.52 and Abbe 64, water ior 1.3325. Not used: the PBR texture libraries (Freepbr, Cgbookcase, Textures.com,
Substance): their hosts are not reachable from this environment (§6), and the matcap/AI-texturing tools do not fit a
lit PBR scene. TSL Textures is WebGPU-only; its marble/wood ideas were already covered by our canvas generators.

**threejs.org examples (r170, read from the vendored copy)**: `webgl_materials_cubemap_dynamic` and
`webgl_lightprobe_cubecamera` (CubeCamera into a HalfFloat `WebGLCubeRenderTarget`, then PMREM) → `RoomProbe`;
`webgl_postprocessing_gtao` → `RoomAO` (but see the r170 bug below); `webgl_materials_physical_transmission(_alpha)`
and `webgl_loader_gltf_transmission` → thin-walled transmission (`thickness: 0`) for panes and vessels;
`webgl_loader_gltf_anisotropy`/`_sheen`/`_dispersion`, `webgl_materials_physical_clearcoat` → anisotropic gilt and
brass, damask sheen, polishing coats; `webgl_postprocessing_ssr`/`ssao` (not used: SSR re-renders the scene with
per-object selection and costs more than the box-projected probe, which gives the floor and gilt their reflections;
SSAO is superseded by GTAO); `webgl_decals` (not needed: wear and grime are computed in the material).
**r170 pitfalls found:** (1) with `scene.environment` set and `material.envMap === null`, three writes
`scene.environmentIntensity` into every material's `envMapIntensity` uniform each frame, so per-material values (the
old gilt 3.4) never applied; the hub reflected its RoomEnvironment at 0.16 everywhere. With the probe the scene
intensity is 1 and material values are kept at 1 for honesty. (2) `GTAOPass.setGBuffer(depthTexture)` dereferences a
normal target it never created; build the pass normally, then switch it to depth-only input (normals reconstructed
from depth) and shrink the unused target. (3) `material.defaultAttributeValues` works for any material, so meshes
without a custom attribute (`aEdge`) still render.

**GitHub topic three-js** (sorted by stars): frameworks and tools; material-relevant were `gkjohnson/threejs-sandbox`
(cloned: GTAO, PCSS, screen-space reflections, a depth-peeled translucent material — informative, none adopted:
our probe + GTAO cover reflections and AO more cheaply; PCSS is the same idea as the contact-hardening filter of R11),
`pmndrs/postprocessing` (N8AO-class AO; not added: a second post framework), `three-mesh-bvh` (still the right tool
if baked per-vertex AO is wanted later), `three-gpu-pathtracer` (offline reference only).

**Babylon.js** docs: *Reflection probes* (render-once refresh, place the probe at the centre of the meshes that use
it; `realTimeFiltering` = our PMREM), *Reflections and refractions → local cubemaps* (`CubeTexture.boundingBoxSize`,
`boundingBoxPosition`: box-projected reflections, after ARM's "reflections based on local cubemaps") → adopted as the
`SM_BOXPROJ` patch of `getIBLRadiance` (the reflection ray is intersected with the room box and re-aimed from the probe
position; weighted by 1 − roughness), *Mastering PBR* (specular anti-aliasing, horizon occlusion, sub-surface
translucency with thickness, sheen, tinted clearcoat, anisotropy direction maps): used as the checklist for the stacks
(marble wrap translucency, sheen damask, anisotropic burnished gilt); specular AA was not needed beyond mip-mapped
normal maps.

**CC0 scanned sets** (§6): none of the mirrors reachable from here holds marble, wood, fabric, plaster or leather in
image form, so every interior stack is procedural (canvas, cached, built lazily on first use): colour + normal +
roughness (+ metalness for gilt tooling) per texture, with the normal and roughness derived from the same random
sequence as the colour (veins, pores, leaf seams, tooling and bands line up). No new files under `assets/textures/`.

**Costs and boot (measured 2026-11-08, SwiftShader, 640 × 400, medium unless noted).**

| | before | after |
|---|---|---|
| hub: draw calls / triangles | 156 / 458 k | 158 / 458 k (high: 162, +1 pass GTAO) |
| hub: programs | 38 | 53 (first version 85: features became uniform-driven so materials share programs) |
| hub: texture memory (unique sources) | 66.7 MB | 86.7 MB (high: 119.6 MB, companions at full size) |
| book room: calls / programs / textures | 698 / 104 / 84 MB | 699 / 124 / 100.9 MB |
| gas (lab, transmissive glass) | 73 calls / 79 k tris | 100 / 125 k (the transmission pass renders the opaque scene once more) |
| pendulum (studio) | 53 / 34 k | 53 / 34 k |
| boot to first hub frame | 9–10 s, longest task 17–18 s | 7 s, longest task 13 s |

After the first frame: the probe starts 0.8 s later and renders one cube face per frame (2–135 ms each in SwiftShader;
on a GPU < 1 ms), then pre-filters in one frame (7 s in SwiftShader, a few ms on a GPU); the 22 companion bakes run one
per idle slice (16–210 ms each, 1.6 s in all). Probe memory: one 768 × 1024 HalfFloat PMREM (6.3 MB), the cube target
is freed after each capture. Per pixel: one 3-octave value-noise fbm (macro) + one noise (wear) + a box intersection in
the IBL lookup; the floor adds the footprint loop (≤ 24 SDF boxes).

**Pitfalls met in this pass.** Swapping a texture's `Source` after upload fails in r170 (immutable storage): bake into a
placeholder canvas of the final size. Reading back a GPU-accelerated 2D canvas (`getImageData`) cost ~2 min in
SwiftShader: canvases that are read back are created with `willReadFrequently`. A 0.05-rough polish lit by the sun
overflows half floats in a probe face (Inf → white blobs after PMREM): the surface patch caps punctual specular at 3.0
like `materials.js`. A probe smaller than 256² changes the CUBE_UV defines and recompiles every program: 256² at every
level. `materialize.js` calls a material's previous `onBeforeCompile` unbound: chains must close over the material.

**Still open.** The sunlit hall reads warmer than before: its own bounce (sun, candles, gilt, limewash) replaced the
neutral studio fill; the window skylight is boosted cool in the probe and the sun moved to ~4800 K, but a camera white
balance in the grade (owned by the grade/valley work) would finish the job. Companion relief applies to materials
created at 'medium'/'high'; switching from 'low' to a higher level takes effect on the next load.
