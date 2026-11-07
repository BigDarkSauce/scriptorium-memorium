# AAA rendering in a WebGL2 diorama: procedural relief, wet surfaces, cascaded sun shadows, atmosphere

This note describes the rendering upgrade of the dioramas (`js/gfx/aaa.js`, `js/gfx/renderer.js`,
`js/gfx/materialize.js`, `js/dio/environments.js`, the outdoor models and flagship scenes). It gives the techniques,
the maths behind them, the parameter choices with their physical reasons, the measured costs, and the honest limits.

Terms used throughout:
- **Fragment**: one pixel-sized sample a triangle produces; the fragment shader decides its colour.
- **Height field** `h(u) ∈ [0,1]`: a 2-D function giving how high the surface detail rises at texture position `u`.
- **Tile**: the world size covered by one repeat of a procedural texture (for example 1.6 units of meadow).
- **Linear (scene-referred) colour**: light values before tone mapping; physically meaningful sums and products are
  only correct here. AgX tone mapping and the grade pass turn them into display colours at the end.
- **Irradiance `E`**: light power arriving per area (what a light's `intensity` means in three.js for a
  directional light). **Radiance `L`**: light leaving a surface or a volume toward the eye (what a pixel shows).

---

## 1. Procedural material generator (`aaa.js`)

### 1.1 Why bake, and what is baked

A ray-marched relief shader reads the height field many times per pixel (once per step). Evaluating fBm (many noise
octaves) and Voronoi (nine or 25 cells) at every step would cost hundreds of noise evaluations per pixel. So each
material kind is generated **once on the GPU** into a small tileable render target, then only *read* per pixel:

| channel | meaning |
|---|---|
| R | height `h` |
| G | albedo variation |
| B | kind mask: stone id (cobble), grass cover (meadow), crack (crag), vein (marble), lichen (bark), shell grit (sand), clay patch (mud) |
| A | roughness variation |

Size: 512² at medium/high, 256² at low; format RGBA16F where the GPU can render to half floats (16-bit heights
give smooth normals from finite differences), RGBA8 otherwise. The target is mip-mapped, so the relief anti-aliases
by itself with distance. A bake costs one full-screen pass: about 0.5 ms on a mid-range GPU (measured 446 ms for all
seven kinds on the SwiftShader *software* renderer). Bakes are scheduled in idle time after boot (`prebake()`), are
shared by every scene, and are re-run after a WebGL context loss (`rebakeAll()`).

### 1.2 Noise library

- **Hash**: PCG integer hash (`uint` arithmetic, exact and identical on every GPU; no `fract(sin())` precision issues).
- **Simplex 2D/3D** (Gustavson/Ashima, MIT): used at run time for non-repeating large-scale variation (macro colour
  breakup over ~5 m, so the tile never reads as a repeat).
- **Periodic gradient (Perlin) noise**: every lattice coordinate is taken `mod P` (an integer period), so the bake
  tiles seamlessly. Quintic fade `6t⁵ − 15t⁴ + 10t³` keeps second derivatives continuous (no grid artefacts in normals).
- **fBm** (fractional Brownian motion): `Σ aᵢ n(2ⁱ f u)` with `aᵢ = 2⁻ⁱ`; with periods `P·2ⁱ` it stays tileable.
- **Ridged multifractal**: `(1 − |n|)²`, each octave weighted by the previous one; gives the sharp crests of crag rock.
- **Voronoi with true border distance** (two-pass method after Quilez): first find the nearest cell centre, then the
  exact distance to the bisector with each neighbour. F2 − F1 is not a distance and makes mortar lines of uneven
  width; the true border distance makes even, crisp joints between cobbles and clean rock fractures.

### 1.3 The kinds and their physical parameters

Albedo values are linear reflectances (measured ranges from material libraries and remote-sensing tables). Roughness
is the GGX perceptual roughness three.js uses.

| kind | height synthesis | albedo (linear) | roughness dry → wet → puddle | porosity |
|---|---|---|---|---|
| `mud` | fBm undulation + Voronoi clods + footstep dimples + fine grain | 0.04–0.13 | 0.62–0.94 → ×0.4 → 0.05 | 0.9 |
| `cobble` (wet cobblestone) | Voronoi setts, domed tops `e^0.42`, chipped faces, sandy joints | stone 0.13–0.2, joints 0.05 | stone 0.5–0.78, joints 0.95 | stone 0.3, joints 0.8 |
| `crag` (craggy rock / cliff) | ridged multifractal + strata `sin(2π·7v + warp)` − Voronoi fractures | 0.12–0.26 by height band, moss 0.07 on up-facing ledges | 0.68–0.92 | 0.2 |
| `meadow` (soil + grass) | fBm + pebbles + grass clumps with blade noise | soil 0.075, grass 0.06–0.13 green; mud band at the water line 0.045 | soil 0.82–0.97, grass 0.78 | 0.7 (0.9 at the shore) |
| `marble` (polished floor) | 2×2 slabs, grout joints, veins `|sin(2π(2u+v+2.6w))|^10` | 0.70–0.78 | 0.05–0.14 | 0 (only a film) |
| `sand` | asymmetric wind ripples (gentle stoss 72 %, steep lee 28 %) + grains | 0.42–0.5 | 0.8–0.95 | 0.55 |
| `bark` | anisotropic ridged furrows (period 7 × 1) + cork plates | 0.06–0.15, lichen 0.2 | 0.82–1 | 0.5 |

**Metalness** is 0 for every kind except sparse mineral flecks (mica in sand, pyrite in granite setts and crag),
which are metallic (1) on 0.1–0.4 % of texels: that is what makes rock glitter in low sun. **Slope**: crag grows moss
and meadow grows grass only where the geometric normal faces up (`smoothstep(0.62, 0.9, N_y)` and
`smoothstep(0.72, 0.93, N_y)`); steep faces stay bare rock or soil, as erosion keeps them.

### 1.4 Projection (no UVs needed)

The shader maps the bake by **world position**, so any mesh works (terrain, merged icosahedra, instanced trunks):
- ground kinds: planar along world **Y** (`u = (x, z) / tile`);
- rock and bark: **dominant-axis triplanar**. The axis with the largest `|N|` component carries the relief; the other
  two projections are sampled at the *displaced* point and blended with weights `|N|⁸`, so there is no seam where the
  dominant axis changes; the relief depth fades where two weights are within 0.04–0.3 of each other.

A **micro layer** (the same relief at 3.7× frequency, rotated 37°, a third of the amplitude) adds grain and breaks
the tile; simplex macro variation tints the albedo by ±15 % over a few metres.

### 1.5 Normals: surface gradients

The height field is turned into a normal with the **surface-gradient** formulation (Mikkelsen 2020):
1. central differences of the baked height at the hit point give `∂h/∂u`; the step is one texel or the pixel
   footprint, whichever is larger (this filters the normal like a mip level would);
2. the world gradient of the displaced height `H = depth · h` is `∇H = (e₁ ∂h/∂u₁ + e₂ ∂h/∂u₂) · depth / tile`,
   where `e₁, e₂` are the projection's world axes;
3. it is projected onto the tangent plane: `g = ∇H − N_g (N_g · ∇H)`;
4. the shading normal is `N = normalize(N_g − g)`.

This works on curved geometry without tangent attributes, and the triplanar layers add their gradients before the
normalisation (blending gradients, not normals, keeps the relief strength right).

---

## 2. Parallax occlusion mapping with silhouette fracture

### 2.1 The ray in projection space

Notation at a fragment: world position `P`, interpolated geometric normal `N_g`, unit view ray `V = normalize(P − C)`
(from the camera `C` into the surface), projection axis `A` (with `N_g · A > 0`), lateral axes `e₁, e₂`.

- Slope of the geometric surface along `A`: `g = −(N_g·e₁, N_g·e₂) / (N_g·A)`.
- Lateral and axial parts of the ray: `v_l = (V·e₁, V·e₂)`, `v_a = V·A`.
- Depth below the (tangent) surface after travelling a ray length `s`:
  `δ(s) = ρ s − ½ κ s² |v_l|²`, with `ρ = g·v_l − v_a = −(N_g·V)/(N_g·A) > 0`.
  The second term is the **curvature correction**: a surface with curvature `κ` falls away from its tangent plane by
  `½ κ d²` at lateral distance `d`. The shader estimates `κ = |fwidth(N_g)| / |fwidth(P)|` per pixel (how fast the
  normal turns per unit length); for flat ground it is 0.
- The detail surface lies at depth `D(s) = depth · (1 − h(u₀ + v_l s / tile))` below the geometric surface
  (relief is carved *into* the mesh; peaks touch the mesh, valleys are `depth` deep).
- The ray hits the relief where `f(s) = δ(s) − D(s)` first becomes ≥ 0.

### 2.2 March and refinement

1. **Linear search**: `n` equal steps up to `s_max = depth / ρ` (where the ray reaches the bottom of the layer),
   capped at a lateral travel of 14 × depth so grazing rays stay bounded. One texture read per step
   (`textureGrad` with derivatives taken before the loop, so mip selection is correct inside the branch).
2. **Binary refinement** of the bracket `[s_{i−1}, s_i]` (2 steps at medium, 4 at high): halve, keep the half whose
   end points straddle `f = 0`.
3. **Secant** on the final bracket: `s* = a₀ + (a₁ − a₀)·f(a₀)/(f(a₀) − f(a₁))`, the classic POM interpolation,
   which removes the remaining stair-stepping.

The hit point `P* = P + V s*` replaces `P` for every channel (albedo, normal, roughness, wetness), and at *high* it
also writes the **pixel depth offset**: `gl_FragDepth = ½ (clip(P*).z / clip(P*).w) + ½`, so objects standing on the
ground sink into its hollows correctly.

### 2.3 Silhouette clipping

Two conditions `discard` a fragment (only past the drawing stage; the white card model keeps clean edges):
1. **The ray leaves the shell.** On a curved surface `δ(s)` is a parabola with maximum `ρ²/(2κ|v_l|²)`. If it turns
   negative (`δ < −0.03 depth`) the ray has passed over the curved horizon without meeting any relief; if the loop ends
   without a hit on a curved surface the same holds. Near silhouettes of rocks, hills and trunks the view ray is
   almost tangent (`ρ → 0`), so only the highest relief is met: the outline becomes bumpy and fractured instead of
   polygonal.
2. **The hit point lies outside the declared boundary.** Flat meshes have no curvature at their rim, so a boundary is
   given in the material (`bound: {type:'ring', x, z, rIn, rOut}` or a rectangle). A ray that enters near the edge and
   reaches its hit point beyond it is discarded: the edge shows the relief's cross-section (the meadow ring and the
   turf on the outdoor plinth end in torn sod, not a compass-drawn circle).

### 2.4 Level of detail

`steps = mix(min, mix(0.6·max, max, 1 − |N·V|), 1 − smoothstep(3, 26, distance))` — more steps at grazing angles
(where parallax is largest), fewer with distance. Independently the relief depth fades out with the texel footprint:
`depth ×= 1 − smoothstep(2.5, 4.5, log₂(texels per pixel))`; once one pixel covers more than ~16 texels the parallax
is sub-pixel and the loop is skipped entirely. Limits: **24 steps near / 4 far at high, 12 / 4 at medium, off at low**
(normal-mapped relief only). Self-shadowing (high only) marches 6 steps from the hit point toward the key light
(directional sun or the studio spot) and darkens direct light by up to 80 % where relief rises above that ray.

---

## 3. Wetness

Physical model after Lagarde, *Water drop 3 — Physically based wet surfaces* (2013):

- **Inputs**: global `uAaaWet` ∈ [0,1] (rain or dew), a local wet spot `(x, z, r, amount)` (the rain cell of the water
  cycle), and per kind a response (marble 0.6 = it sheds water, soil 1) and a porosity.
- **Accumulation**: water stays on up-facing surfaces: `W = wet · mix(0.3, 1, smoothstep(0.05, 0.85, N_y))`.
- **Capillary darkening** (water fills the pores, so less light scatters back out): `albedo ×= mix(1, 0.32, porosity · W)`.
- **Smoother microsurface**: `roughness → mix(r, max(0.1, 0.4 r), W)`.
- **Puddles** fill the relief from the bottom up: the water level rises with `W`, so a fragment whose height lies
  below `level(W) = pud · W` is under standing water (only on ground facing up): albedo × 0.6 (absorption), base
  roughness 0.05, the base normal flattens toward `N_g`.
- **Water film** = three.js clearcoat (a second specular lobe over the base, Fresnel F0 = 0.04): coat strength
  `max(0.45 · damp, puddle)`, coat roughness 0.2 (damp) → 0.03 (standing water). While it rains the coat normal
  carries **ripples**: two layers of expanding rings in a jittered grid (`cos(30(r − 0.45φ))·e^{−x²·0.08}·(1 − φ)²`).
- **Dew glints**: on damp, up-facing surfaces a sparse set of micro-facets (one per 1/160-unit cell, density ∝
  wetness) gets a random normal and a very sharp lobe (`(N_m·H)^700`) toward the key light — the "screen-space
  specular highlights for dew" the brief asked for, computed in the material, faded where a cell is smaller than a
  pixel (no sparkle noise at distance).

Wired to the weather: the weatherglass meadow (`wet`, `rainK` of its weather model → `scene.userData.aaaWet`), the
water-cycle rain cell (a wet spot that follows the raining cloud, accumulates at 0.35/s × rain and dries at 0.012/s),
and the shoreline of its lake (a mud band within 0.1 units of the water line, saturated).

---

## 4. Lighting

### 4.1 Sun shadow cascades (landscape, ocean, night)

- **Cascade 0** is the key light itself, its orthographic shadow fitted to the plinth (±8.6 units, 2048², 0.0084
  units per texel).
- **Cascades 1 and 2** are zero-intensity directional lights along the same direction (they light nothing; only
  their shadow maps are used): ±34 units (1024² at medium, 2048² at high) for hedgerows and trees, ±110 units (1024²,
  high only) for the far hills.
- **Selection** in the directional-light loop (`materialize.js`, `cascadeChunk`): the sun takes the shadow of the
  first cascade whose map contains the fragment, blended over a 6 % band at the map edge (no visible seam); the helper
  lights are skipped. Only one or two `getShadow` calls are paid per fragment, not one per cascade.
- **Biases**: normal bias = 2.2 texels of each map (`2.2 · 2S / mapSize`), depth bias −0.0003 per cascade index
  (the wider depth range of outer cascades needs more). Too little bias gives acne on the turf; too much detaches
  shadows from contact ("peter-panning") — 2.2 texels is just above the PCF-soft kernel radius.
- The studio and desk presets keep their spotlight key and **contact shadows** (rendered from below and blurred).

Why not three's `CSM` addon: it fits cascades to the camera frustum. During the drawing → real transition the camera
is a 1–3° telephoto hundreds of units away, so camera-fitted cascades would cover empty space; its `setupMaterial`
also replaces each material's `onBeforeCompile`, which would break the materialize and AAA hooks. Fixed world-space
cascades suit a bounded diorama, cost nothing per frame, and never shimmer.

### 4.2 Sky and bounce, not flat ambient

The hemisphere light is derived from the sun every frame (`skyBounce`):
- **ground side** = `ρ_ground · E_sun · sin(elevation) · 0.85`: the irradiance a downward face receives from an infinite
  Lambertian ground of albedo ρ lit by the sun (0.85 for the part of the ground in shadow);
- **sky side** = `E_sun · sin(elevation) · 0.15` (clear-sky diffuse is ~15 % of the direct beam on a horizontal
  surface; up to +35 % under cloud, which scatters the beam) — at night a floor of 0.1 for moonlit sky and airglow.

The ambient that reaches AAA surfaces is **attenuated**: cavity AO from the relief (height below its blurred
neighbourhood, depth in the layer) multiplies the indirect diffuse (hemisphere + IBL), and a specular-occlusion term
(Lagarde) the indirect specular. Other materials keep the contact shadows (studio) and cascaded sun shadows (outdoors).

### 4.3 Atmosphere pass (`AtmospherePass`, linear HDR, before bloom and AgX)

**Height fog.** With density `σ(y) = σ₀ e^{−(y−y₀)/H}` along the view ray `y(s) = y_c + s·d_y`, the optical depth to
distance `d` has a closed form:

`τ = ∫₀ᵈ σ₀ e^{−(y_c + s d_y − y₀)/H} ds = σ₀ · d · e^{−(y_c − y₀)/H} · (1 − e^{−k}) / k`, with `k = d_y d / H`

(and `(1 − e^{−k})/k → 1 − k/2` for `|k| < 10⁻³`). Transmittance `T = e^{−τ}`. Single scattering with albedo 1 gives

`L = L₀ T + L_s (1 − T)`, `L_s = E_sun [w_R P_R(μ) + (1 − w_R) P_HG(μ, g)] + L_amb`,

with `μ = cos` of the angle between view ray and sun, the **Rayleigh** phase `P_R(μ) = 3/(16π) (1 + μ²)` and the
**Henyey–Greenstein** (Mie) phase `P_HG(μ, g) = (1 − g²) / (4π (1 + g² − 2gμ)^{3/2})`. Both integrate to 1 over the
sphere. `g = 0.76` (landscape) is typical of continental haze aerosols (0.7–0.85), so haze glows strongly toward the
sun and little away from it; `w_R = 0.3` keeps a blue-ish isotropic part.

| preset | σ₀ (1/unit) | H (scale height) | y₀ | g | god-ray weight |
|---|---|---|---|---|---|
| landscape | 0.012 (+0.03 × storm) | 2.2 | −1 (the field) | 0.76 | 0.45 (× (1 − 0.8 storm)) |
| ocean | 0.014 | 3 | −0.6 (sea) | 0.8 | 0.5 |
| night | 0.03 | 0.9 (ground mist) | −0.2 | 0.7 | 0.25 |

**God rays.** For each pixel, `N` samples march from the pixel toward the sun's screen position (up to 90 % of the
way, start jittered by interleaved gradient noise to hide banding). Each sample counts 1 where the depth buffer is
empty (open sky: three's `Sky` writes no depth), weighted by the sun's angular glow `max(0, ω·s)^24` and a decay
`0.965ⁱ`. The result `f` (the fraction of the line that sees the sun) scales the Mie in-scatter of the sun over an
effective optical depth: `L += E_sun · P_HG(μ, g) · f · w_god · 0.2`. (A first tuning with the full `4π·w_god` factor
washed the whole frame out; 0.08 left the shafts barely visible; 0.2 is the shipped value.) The sun's screen visibility fades the effect when the sun is behind the camera or far off screen.

**Passes.** Medium: one full-screen pass with 24 inline samples. High: a half-resolution ray pass (48 samples) plus
the composite = 2 passes. Low: no pass (three's per-material fog remains). Both composer buffers carry a depth
texture (resolved from the 4× MSAA render). The pass fades in with the drawing → real transition
(`scene.userData.aaaAtmosK`), so the paper drawing is never fogged.

---

## 5. The "lag when a diorama constructs and changes colour"

**Measured cause** (instrumented by recording the id of every WebGL program after each frame; SwiftShader, so only
relative numbers matter):
1. At progress 0.74 the materializer *removed* `scene.fog` for the drawing and gave it back for the real world. Fog
   is part of every program's key, so **every material recompiled in that one frame** (+27 programs on the
   weatherglass; on a real GPU 20–100 ms each without parallel compile).
2. At the end, `engine.removeInk()` removes every object flagged `isInk` — which includes the director's accent
   spotlight. One light fewer changes every program's light count: **another full recompile** (+20 programs, the
   longest frame of the whole opening).
3. The texture background (sky gradient) program compiled on first sight.

4. All precompiles targeted the screen instead of the composer buffer (see §6): the wrong variants.

**Fixes** (`materialize.js`, `renderer.js`):
- the fog stays attached; the drawing pushes its range out of reach (`near = 10⁸`) or sets the density to 0;
- `Materializer.prewarm()` → `gfx.prewarm()` compiles, while the screen is still veiled, the real state (sky and stars
  visible) and the end state (ink lights hidden), with `compileAsync` (parallel compile where the browser has
  `KHR_parallel_shader_compile`), and renders the texture background once into a 1×1 target;
- the atmosphere programs and all seven material bakes are prepared in idle time after boot;
- nothing sets `material.needsUpdate` per frame (the weatherglass ground used to change colour/clearcoat each frame
  without recompiles, now it only writes uniforms).

The real fix for cause 2 belongs in `engine.js` (not edited here): `removeInk()` should skip lights
(`if (o.userData.isInk && !o.isLight)`). After that patch, set `PREWARM.inkLights = false` in `materialize.js`.

Results: see the table in §6.

---

## 6. Costs

**Per frame, measured** (`gfx.stats()`-equivalent: one full composer frame incl. shadow passes; draw calls and
triangles are resolution-independent; "before" = the build before this change):

| scene (preset) | before: calls / triangles | low | medium | high | extra full-screen passes (low/med/high) |
|---|---|---|---|---|---|
| lever (landscape, countryside) | 48 / 27 k | 50 / 32 k | 68 / 41 k | 90 / 54 k | 0 / 1 / 2 |
| water cycle (landscape, flagship) | 345 / 174 k | 341 / 170 k | 444 / 188 k | 546 / 205 k | 0 / 1 / 2 |
| weatherglass (studio + painted sky) | 336 / 377 k | 336 / 377 k | 336 / 377 k | 334 / 376 k | 0 / 0 / 0 |
| pendulum (studio) | — | — | 57 / 35 k | — | 0 |
| double pendulum (night) | 71 / 39 k (capture frame) | — | 91 / 46 k | 111 / 53 k (capture frame) | 0 / 1 / 2 |
| lens (desk) | 122 / 41 k (capture frame) | — | 100 / 33 k | 122 / 41 k (capture frame) | 0 |
| wave (ocean) | — | — | 190 / 109 k | — | 0 / 1 / 2 |

The extra draw calls outdoors are the shadow passes of the outer cascades (each cascade renders the shadow casters
once more; the countryside trees and hills now cast). Studio/desk scenes are unchanged apart from AAA materials.

**Per pixel (GPU estimate from the shader)**, texture reads of one AAA surface fragment:

| quality | ray-march | refine | channels (hit, 4-tap gradient, 3-tap micro layer, AO) | self-shadow | total reads near / far | vs. a normal-mapped MeshPhysicalMaterial (≈ 4–6) |
|---|---|---|---|---|---|---|
| low | — | — | 9 | — | 9 / 9 | ~1.7× |
| medium | 1 + 12 (4 far) | 2 | 9 | — | 24 / 16 | ~4× near |
| high | 1 + 24 (4 far) | 4 | 9 (+3 per extra triplanar axis in blend zones) | 6 | 44 / 20 | ~8× near |

ALU per fragment adds two simplex-3D evaluations (~120 ops), the surface-gradient normal and the wetness model
(~60 ops); rain ripples (~40 ops) run only inside puddles. The loop exits early on a hit, so the average is well
below the maximum (half the steps on typical ground). At 1080p with the ground covering ~40 % of the frame the high
setting reads ~37 M texels per frame for relief: about 1–1.5 ms on a GTX 1660 / RX 6600-class GPU, 2–3 ms on Iris Xe
at medium. Atmosphere: medium = 24 depth reads + 2 per pixel at full resolution (~55 M reads at 1080p, ~0.6 ms);
high = 48 reads at quarter pixel count + composite (~30 M, ~0.5 ms). Shadow cascades: +1 (medium) or +2 (high)
shadow-map renders of the casters (2048²/1024²), ~0.3–0.8 ms on a mid-range GPU for these scenes.

Budget check against the brief: extra full-screen passes 2 at high, 1 at medium, 0 at low; POM max 24 steps near
and 4 far; at medium on mid-range hardware the estimated additions (relief ~2 ms, atmosphere ~0.6 ms, one extra
cascade ~0.4 ms) keep a typical diorama frame inside 16.7 ms, and the adaptive resolution plus the automatic
quality step-down catch the rest.

**Opening a diorama** (weatherglass, medium quality; programs compiled per frame counted by WebGL program ids; the
state changes driven step by step so every state is measured; SwiftShader, so ms are relative):

| | before | after |
|---|---|---|
| first sketch frame after the veil lifts | 16.7 s render (≈150 programs compiled in that frame) | 0.34 s (all precompiled) |
| new programs at progress ≈ 0.74 (fog switch) | +27 in one frame | 0 (+1 small program at 0.8) |
| new programs at the end (accent light removed) | +20 in one frame (9.8–31.6 s) | 0 |
| extra work behind the veil | — | prewarm ≈ 1.6 s on SwiftShader (two compile sets); overlaps the fade with parallel compile |

A further cause was found while measuring: `renderer.compile()` / `compileAsync()` compile for the *current render
target*. Called with the screen as target (as `main.js` does before lifting the veil), they build sRGB + AgX program
variants, while the diorama really renders into the composer's linear half-float buffer — so every "precompiled"
program was compiled a second time in the first visible frame. `gfx.prewarm()` sets the composer's read buffer as the
target while compiling.

## 7. Honest limits (WebGL2 vs a Crimson-Desert-class engine)

- **No virtual texturing, no streaming**: each kind is one 512² tile + micro layer + simplex breakup. A AAA terrain
  blends dozens of layers from scanned 4K–8K sets with runtime virtual textures. Up close the tile still repeats
  after ~2 m on large flat areas.
- **POM is not geometry**: silhouettes are faked per pixel (correct only where the curvature estimate holds; on
  polygon edges with flat normals the estimate jumps), shadows are cast by the *undisplaced* mesh (a pebble does not
  shadow its neighbour except through the 6-step self-shadow), and contact with objects is right only at high (pixel
  depth offset). Engines use tessellation or virtualised micro-geometry (Nanite) instead; WebGL2 has neither
  tessellation nor mesh shaders.
- **Atmosphere is screen space**: god rays exist only when the sun is on or near the screen and the occluder is
  visible; there is no shadow-mapped volumetric fog (froxels) or multiple scattering. Engines march a 3-D light
  volume with temporal reprojection; that needs compute shaders and 3-D render targets with history (WebGPU).
- **No global illumination**: the bounce is an analytic hemisphere from the ground albedo; no ray-traced or
  probe-based GI, no screen-space reflections (the water film reflects the pre-filtered environment, not the scene).
- **No temporal anti-aliasing**: MSAA handles geometry edges, mip-mapping and the derivative-scaled normal filter
  handle the relief; dew glints are faded with distance instead of being accumulated over frames.
- **Discard costs early-Z** on the silhouette materials (and `gl_FragDepth` at high disables it). This is why
  silhouettes are limited to the materials that need them and the far field uses 4 steps.
- **Shader compile time**: the AAA program is large; on a cold start without `KHR_parallel_shader_compile` (Firefox
  on some platforms, Safari) the first diorama pays its compiles behind the veil, not during the transition.
- **Measurement**: the build machine renders with SwiftShader (software), so absolute frame times are meaningless;
  the cost table uses draw calls, triangles, programs, full-screen passes and texture reads per pixel, which carry
  over to real GPUs.

## Landscape kit: the water-cycle valley at Weatherglass quality (implemented)

The recipes of `realism-playbook.md` (R1–R9, R12, R13 and part of R11) are implemented as modules and exposed as
scene-spec shape kinds (`SCENE_SPEC.md`, "Landscape kit"); `WATER_CYCLE` in `js/seeds-scenes.js` is rebuilt on them.

| module | what it does | spec kinds |
|---|---|---|
| `js/gfx/terrain.js` | one height field on the mesh grid (fBm + terraces + smooth-max peaks + downhill river with an automatic waterfall + lake bowl + pads + path); RGBA half-float texture (height, river, lake, slope) + bilinear CPU sampler + ecology `suit(x,z,kind)`; meadow/rock meshes split by slope and height (flatter diagonal per quad); peaks with `own` are cut out as separate bodies | `terrain{…field options}`, `peak` |
| `js/gfx/soil.js` | the four cut faces of the block with strata (turf rim, humus, loam with mottles/burrows/stones, clay, gravel, tilted bedrock beds with joints, roots), wetness soaking down, derivative-bump normals; walnut plinth | `soilBlock` (built by `terrain{block:true}`) |
| `js/gfx/grass.js` | instanced blades (arc bend of constant length, gust crests, flutter, per-vertex colour, translucency, root AO, distance hash-culling with widening), flowers (6 species), reeds and cattails; grow out of the paper with the materialize front | `grassField`, `flowers`, `reeds` |
| `js/gfx/water.js` | lake in two passes (multiply by Beer–Lambert transmittance, add in-scatter + Fresnel sky + glint + glitter + lapping foam + rain rings), hand-compared sun shadow, cloud shadow; river ribbon with flow-space streaks, waterfall sheet, plunge foam, spray | `lake`, `river`/`waterfall` |
| `js/gfx/clouds.js` | raymarched puff clouds (smooth-union SDF, Perlin–Worley erosion, dual-lobe HG over three scattering octaves, powder, terrain occlusion, camera-inside mode); 32³ CPU noise; cloud-shadow splat at 15 Hz | `cloud{volume:true}`, `cloudVolume` |
| `js/gfx/precip.js` | vapour wisps (soft stretched point sprites) and velocity-aligned rain streaks | `particles{type:vapour|streaks}` |
| `js/dio/trees.js` | species table (tree, oak, birch, cherry; pine, bush), crown-ellipsoid normals, vertex wind (lean ∝ h², per-tree phase, leaf flutter) on foliage and bark (`TREE_WIND` define) | `oak`, `birch`, `cherry`, `tree{species}`, `forest` |
| `js/gfx/aaa.js` | scanned CC0 micro layer (Ground103 on meadow/mud/sand, Moss002 on up-facing crag, Bark001 on bark), lazily loaded from `assets/textures`, weight 0 until loaded (no recompile, graceful fallback); two hashed offsets per noise cell against tiling; off at low quality | (automatic) |
| `js/gfx/materialize.js` | `ShaderMaterial`s take the scene's front uniforms through `userData.onFront(U)`; cloud-shadow hook on directional light 0 of every patched material in outdoor scenes (`AAA_CLOUDSH` define, own program key) | — |
| `js/gfx/renderer.js` | grade pass `uPunch` (AgX "Punchy" approximation: power 1 + .3k, saturation 1 + .25k); `look.punch`: landscape .9, ocean .8, studio/desk .45, hub/rooms .15, default .3 | — |
| `js/dio/environments.js` | WG sun colour/intensity ramp from elevation; outdoor exposure raised to match the punch look | — |

Measured with `gfx.stats()` (one full frame, shadow passes included; SwiftShader, so no GPU times) on the rebuilt valley:

| quality | draw calls | triangles | programs | grass blades | notes |
|---|---|---|---|---|---|
| low | 94 | 0.32 M | 99 | 18 k (5 tris) | no flowers, POM off, scans off, clouds 20/4 steps, 151 × 116 terrain grid |
| medium | 123 | 0.74 M | 103 | 46 k (7 tris) | 2.2 k flowers, 261 × 201 grid, clouds 30/5 steps, atmosphere pass |
| high | ≈130 (est.) | ≈1.3 M (est.) | — | 100 k (9 tris) | 361 × 277 grid, clouds 44/6 steps |

Before the rebuild the playbook counted ~444 draw calls at medium, most of them the transmission pre-pass of the old
transmissive lake; the new lake has none. Estimated GPU cost at medium on a GTX 1660-class card (from shader arithmetic):
grass 1.0–1.5 ms, clouds 1.5–2.5 ms (three boxes, early-out outside the puffs), lake + river 0.3–0.5 ms, soil 0.1 ms,
scans +0.2 ms, i.e. about 3.5–5 ms on top of the existing 6–8 ms: inside 16.7 ms.

Known gaps against Weatherglass: no planar mirror for the lake (sky + dark landscape band only), no contact-hardening
shadow filter (R11.1) and no HDRI reflections (R11.4), no log cabin/jetty/smoke (R10: the cottage is the old `house`),
pines and bushes keep the older geometry, cloud lighting is not yet tuned against the golden-hour lessons, no R15 visual gate. (The pedagogy hook is in: rain
on the slope speeds the stream and its waterfall.)
