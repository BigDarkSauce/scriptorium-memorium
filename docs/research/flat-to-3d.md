# flat-to-3d: analysis for a "diorama builder"

Source analysed (read only, not executed): `/tmp/claude-0/-home-claude/c61ae887-f2bc-5616-8c17-4937082f620d/scratchpad/src/f2d/flat-to-3d-main/`
(Samnang Aing, MIT; three.js 0.160/0.169 from jsDelivr import maps, plain ES modules, no build step, no image files, every texture painted on a `<canvas>` at load.)

Read in full: root README, all 7 README.md + PROMPT.md, all of `06-card-model` (index.html, js/house.js, js/sweep.js, js/page.js, js/desk.js, js/real.js — the staging/furniture middle of real.js skimmed) and all of `02-section-sweep` (index.html scripts, main.js, house.js, draw.js, real.js; look.js = canvas texture recipes, skimmed for structure + the material table). Others skimmed at the relevant functions.

---

## 0. Two corrections to the brief, up front

1. **06-card-model does not fold paper.** There is no net, no hinge, no fold animation in 06. The "card model" is *the same list of boxes* as the real house (`houseParts()` in `js/house.js`), rendered with a card material. The hero "builds itself" by *dropping* contour layers, *sliding* the house into its cut-out and *standing up* trees/figures (scale-y with overshoot). The card→real transition is a **growing sphere** centred on the desk-lamp bulb: card is drawn outside, real house inside (`js/sweep.js`).
   The hinge-fold technique ("flat sheet folds up into a box") exists in **01-exploded-house `?dir=b` "The Unfolded Room"** (`dir-b.js`): walls on pivots at their bottom edges, `rotation = ±π/2 · (1 − ease(win(p,a,b)))`, staggered windows. A generalised "card pieces fold up on a desk" needs 06's look + sphere swap **and** 01-b's hinges.
2. **No pencil/sketch look anywhere.** Every demo is a crisp CAD/ink look: paper `#f2efe7`, ink `#1d1c19`, one amber `#e85d04` "pen tip". In 02 the "drawing" is not SVG/canvas line art: it is a **full-screen shader that inks the 3D model** from a normal/depth/id float buffer. Only the annotations (grid bubbles, level marks, dimensions, sun lines, room names) are an SVG overlay re-projected from world coordinates every frame. In 06 the only 2D drawings are canvas textures pinned on the studio wall, generated from the parts list (`sheetTexture()` in desk.js). A "hand pencil" look would be new work (easy to add in the 02 ink shader: jitter the edge sample offsets, vary line weight with noise, graphite grain).

The architecture insight that matters most for generalisation: **in every demo the "flat drawing" and the "real thing" are the same geometry, and the transition is a scalar field over world space compared against one animated uniform.** Only the field changes:

| demo | field f(worldPos) | uniform it is compared to |
|---|---|---|
| 01 plotter | `dot(w, dir) + k·length(w.xz − c.xz)` | `uDraw` (lines), `uDrawFill` (fills) |
| 02 sweep | `w.x` | `uScanX` |
| 03 colour scan | `w.x` | `uColourX` |
| 04 time-lapse | per-vertex `aWeek` (build week) | `uNow` |
| 05 schedule | per-part `t0..t1` inside its phase bar (CPU) | week |
| 06 card→real | `distance(w, bulb)` (+ compression far away) | `uSweepR` |
| 07 elevation | `dot(w.xy, (√½, −√½))` | `uSweep.z` |

and "flat" is always **the real perspective camera with a tiny lens from very far away**, opened by a **dolly zoom** that keeps a chosen frame (height at the target) constant: `distance = frameHeight / (2·tan(fov/2))`.

---

## 1. What each experiment does (user experience)

All are scroll-driven: one scroll value (smoothed with exponential damping) plus a clock drive a pure `update(T, scroll)`; every one has `?rec`/`?offline`/`__frame(t,s)` hooks for deterministic frame-by-frame recording.

**01 Exploded House** (3 variants via `?dir=`). Opens on an exploded axonometric of a timber house in 6 layers (slab, walls, glazing, cladding, rafters, roof) hanging over its plan, ink on paper, numbered labels, dotted landing lines. Loader = plotter: a front sweeps up the model, lines first in amber then cooling to ink, fills behind. Scroll: layers land one by one in building order (everything above drops with it; glazing/cladding slide in sideways from their wall; the landing layer goes amber, label lights). Camera comes to the porch and widens from a 1.5° lens at ~1.26 km (axo) to eye-level perspective (dolly zoom), glass door slides, you walk in and up to the loft with captions and a corner plan. Stays a drawing inside: no lights, 3-weight screen-space crease lines, pale grained fills. `?dir=b`: interior elevations folded flat round a plan fold up into a closed box (hinges), colour comes in, door opens, walk in. `?dir=c`: five-storey block stacks floor by floor round its core.

**02 Section Sweep.** Loader: a small key plan, cut line A-A draws across it, then the key plan flies into a slot in the title block. The section plots itself: earth hatch and poché first (poché fills in by height rank with a 45° hatch that thickens to solid), then lines behind the cut front-to-back, then notes (grid bubbles grow, level marks, dimension strings, room names, three dashed amber sun-angle lines for 21 Dec/Mar/Jun). Scroll 1 (0–2.5 screen heights, "swing"): lens opens 0.12° → 58° while the camera comes in so the cut keeps its size; overlapping, it orbits to a three-quarter view (yaw 39°, pitch 8.2°, fov 35°). Scroll 2 ("sweep"): a vertical amber "CAD CUT PLANE" (SVG polygon + `X = …M` readout) crosses the house from garden (x 25.5) to hill (x 3.4, then off to −60); behind it pixels become the lit render; when it passes the south glass (x ≈ 18.4) the dashed sun lines fade and ray-marched sunbeams fade in at the same angle. Scroll 3 ("walk"): one continuous C1 Catmull-Rom spline at eye height 1.62 m in through the cut, ~28 keys, slowing (not stopping) at labelled rooms (living, study, upper lounge, snug, bedroom, lower garden), level camera with vertical lens shift. A live mini section radar shows camera position/view cone; clicking zones jumps the scroll. Scroll 4 ("rev"): back out, scan runs back, lens closes, flat sheet returns with a stamp and "Start a project".

**03 Open Section.** Flat 1:100 section of a three-level hillside house plots itself (amber pen lines sweep left→right). Lens opens 1.6° → 64° with the camera moving in so the frame on the cut never changes (`dist = frameH / tan(half)`, never orbits). An amber scan line turns ink into material, sunlight, shadow. Camera visits floor by floor always facing the cut, with cards; pulls back to the section in colour; closing section with small sections of other houses. Implementation: one clipping plane + black lids (cap `ShapeGeometry` of each profile) on every solid the plane passes; one Lambert material whose vertices carry both an ink colour and a material colour (`withColour()`); notes on a 2D canvas overlay; a 3D key in the corner.

**04 Build Time-Lapse.** A construction sequence sheet: six small axo line drawings of one house at six stages, with a programme (Gantt) whose bars draw as the loader. All six tiles draw on one clock (fresh lines amber, cooling to black). Scroll zooms into tile 01; behind the ink the lit site "pours in" in build order with an amber edge. Reverse dolly zoom 2° → 50° to eye height at the dig. Then scroll = calendar: the house rises week by week while the camera walks four spline legs (down to the garden, up a scaffold stair, onto the terrace, through a forest of props at week 18 with sun shafts), furniture arrives, handover; back out into drawing 06, house un-builds into its drawing, sheet returns with bars full. Implementation: every vertex has `aWeek`/`aOut`; `gone()` discards if `vWeek > uNow`; the six tiles are the same live model rendered into 6 screen rects at 6 weeks (`aim()` in pipe.js); sun moves with the weeks; beams ray-marched against the sun shadow map.

**05 Schedule Build.** Gantt dock along the bottom, site above. Wheel moves the orange "today" line; fence, dig, crane lowers each frame/wall/roof panel with sway and damped touchdown, cladding, lawn grows, lights on; at handover the door swings open and you walk in (Catmull-Rom, 5 stops). Scroll back → it comes apart. Drag chart to scrub, ▶ BUILD plays. Implementation: `PHASES` table (`w0`,`w1`); `add(obj, phase, order, how)` with `how ∈ {drop, rise, grow, show}`; `update(week)` is pure. Live phase piece gets orange edges and a 22% warm tint.

**06 Card Model.** (detailed in §2A) A white card study model of a house on a slope on an architect's desk at night: card walls, acetate windows, greyboard contour layers, laser-cut card trees, white lathe scale figures, desk lamp, cutting mat, steel rule, scalpel, pencil, mug, trace rolls, drawings of the same house pinned on dark walls. Loader: a scalpel scores a line across a sheet of card, the sheet parts along the cut. Hero builds: lamp clicks on, contour layers drop in, house slots in, trees and figures stand up, headline slides up. Dive to the scale figure's eye height (readout: cm on desk / m in house; "A centimetre of card is a metre of house"). Turn: sphere grows from the bulb; inside, card becomes concrete/oak/glass/grass with an amber scan seam; lamp light becomes a low sun from the same direction; dark studio stays (no sky). Walk: sliding door opens, living room, up through the double height to the study where the same card model sits on the desk under a mini lamp; turn round to the glass. Back out: sphere shrinks, card returns, lamp clicks off into moonlight, "Start a project".

**07 Sunlit Elevation** (3 takes on one engine: one door / a row of six / a 1:20 brick detail). Front elevation, straight on through a 2° lens, ink outlines drafting themselves bottom-first (each line growing along its length), then 45° hatching pours in along the light. The hatching is *computed from the shadow map* with the sun at the drafting convention `(-1,1,1)/√3`, so drawn shadows = real shadows. Scroll: relief (lens opens a little, camera turns), a thin amber 45° line sweeps across and turns paper into brick/stone/zinc/glass, "not one shadow moves"; then the sun moves to late afternoon; climb steps, door opens, walk to courtyard; facts card. Camera keys are frames (target, frame height, lens); distance derived; lens interpolated in log space (2° → 55° without a jump). Uses Lenis for smooth scroll.

---

## 2A. 06-card-model in depth

### Modules
- `index.html`: DOM HUD (headline, altitude ruler, chips, room cards, end section), scroll track = six `<section>`s of 140/420/440/640/460/100 vh, an **inline classic-script loader** that paints before three.js arrives (`window.__loader.paint(p, lift, open)`: scored line `scaleX(p)`, SVG scalpel translated along it, then the two halves of the card sheet slide apart with box-shadows forming the cut edge).
- `js/house.js`: the parts list (1 unit = 1 m). Also `PEOPLE`, `TREES`.
- `js/desk.js`: canvas textures, card/greyboard/desk materials, `cardHouse()`, `contourLayers()`, `modelTrees()`, `modelFigures()`, `deskProps()` (desk, mat, rule, scalpel, pencil, rolls, pot, books, mug, offcuts), `buildLamp()`, `studioWalls()` + `sheetTexture()` (plan/section/elevation/site drawn from the parts list).
- `js/real.js`: real materials, `realHouse()` (same parts, per-face material buckets, ~20 draw calls), `terrain()` (heightfield from the same contour function), `realTrees()`, `staging()` (sculpted furniture + the tiny 1:100 model on the study desk), `skyEnv()` PMREM.
- `js/sweep.js`: the switch (sphere front + per-side light weights).
- `js/page.js`: renderer, lights, post chain, camera chapters, the frame loop, HUD copy.

### Data model ("one parts list, two worlds")
```js
// house.js
const box = (x0,y0,z0,x1,y1,z1, m, k='struct', ph=2) => P.push({ b:[x0,y0,z0,x1,y1,z1], m, k, ph });
// m: material key OR per-face spec {all:'conc', top:'oak', bot:'plaster'}
// k: 'struct' | 'frame' | 'glass' | 'stair' | 'furn' | 'land'
// ph: build phase 1 footings … 8 fit-out
```
Walls with openings: `wall(axis, t0, t1, a0, a1, b0, b1, holes, m, ph)` → `carve()` splits the wall rectangle into boxes around rectangular holes; each hole gets a 50 mm steel frame + 20 mm pane (floor-to-ceiling holes > 2.3 m are left open as doors). Everything is axis-aligned boxes (plus lathe figures, extruded tree profiles, extruded contour layers).

The desk world is built **100× bigger** around the house: on the desk "1 unit = 1 cm", so the house file never knows it is a model (`MAT_TOP = -9.6`, `DESK_TOP = -10.1`, lamp head at `(56,36,12)`, aimed at `(14,-4.5,-2.5)`).

Card render of the parts (`cardHouse`): drop `furn`, `land`, phase ≤ 1; glass → acetate; everything else → `cardBox(b)` merged into **one mesh** with `M.card`, acetate into one transparent mesh (`renderOrder 2`).

### The card look
- Texture `T.card`: 1024² canvas, fill `#f3f0e8`, 110 dark + 80 light radial "formation cloud" blotches, 6800 + 3200 short quadratic fibres (wrapped for seamless tiling), per-pixel grain ±9; tile = 4 cm. Also used as bumpMap (`bumpScale 0.065`, roughness 0.91).
- **Foamboard core on cut edges** (`withCore`): `cardBox` detects thin panels (thickness 0.15–0.75 and ≥1.6× thinner than the other dims) and writes `aCore = (isEdgeFace, positionAcrossThickness)`; the fragment patch paints a 3-ply edge: skins, a tinted core (`uCoreTint = (0.86,0.82,0.75)`), dark glue lines at 0.095/0.905, a slight crush highlight. This is the single most "it's card" detail.
- Greyboard contour layers: `T.board` (#aba69e, pulp flecks), edge texture `T.burn` (pressed-pulp strata + vertical blade-score lines). Layers are `ExtrudeGeometry` of a contour outline (one layer per 0.8 m, base 3.2 m), with a notch where the house sits; materials `[M.board, M.burn]` (caps/sides).
- Trees: a profile (trunk rectangle + crown outline, cypress/olive/round) extruded 0.12 thick, a second copy rotated 90° (slotted cross), on a card disc.
- Figures: `LatheGeometry` of a 16-point profile, scaled z 0.62, 1.765 m (17.6 mm) tall.
- Acetate: `MeshPhysicalMaterial` clearcoat 1, ior 1.56, opacity 0.21, envMapIntensity 1.9.

### The desk / studio environment
Dark oak desk 600×400 canvas wood (700 sine-wobbled grain strokes), green A0 self-healing cutting mat (4096×3004 canvas: 1 cm grid, majors every 10, 45/60/30° angle lines, numbers, score marks), brushed steel rule with mm ticks (roughness map), scalpel (ribbed handle + extruded blade), hex pencil, trace rolls, pencil pot, books + mug, card offcuts with window holes already cut, a balanced-arm lamp (twin rods, helix springs as `TubeGeometry`, lathe shade, emissive rim/inner/bulb), and four walls + ceiling of near-black `#2c2926` with 16 pinned A-sized sheets (generated drawings, slight tilt, red pins). Scene background `#0b0a09`, `FogExp2(…, 0.00035)` (card materials opt out of fog). Env = `RoomEnvironment` PMREM at 0.04 blur.

### Lighting: two lightings in one scene
three.js lights are global, so `sweep.js` **patches the light loop** (`lights_fragment_begin`) so every light's contribution is multiplied by a per-side weight:
```js
const SIDE = {
  card: { dirK:[0,1,1], hemiK:[1,0], spotK:1, pointK:0 },   // moon + fill, night hemi, desk-lamp spot
  real: { dirK:[1,0,0], hemiK:[0,1], spotK:0, pointK:1 },   // sun, day hemi, interior point lamps
};
// e.g. 'getDirectionalLightInfo( directionalLight, directLight );' + 'directLight.color *= uDirK[ i ];'
```
Relies on light order: directional `[sun, moon, fill]` (shadow-casting sun sorts first), hemisphere `[night, day]` by insertion. Shadow depth: each mesh's `customDepthMaterial = DEPTH[side]` so each light's shadow map only sees its own world.
- Card side: `SpotLight(0xffe1c0, 6800·k, 0, angle 0.78, penumbra 0.55, decay 2)` at the bulb, 4096² shadow; wall spill spot 3400·k; moon `DirectionalLight(0x8eb4e8)` 1.38→0.32 as lamp k goes 0→1; fill 0.58·k; night hemi `(0x64748c, 0xb89e82)` 0.28 + 0.34k; an interior "hearth" spot inside the card model only when the lamp is off at the end.
- Real side: sun `DirectionalLight(0xffc690)` intensity `lerp(2.85, 4.15, dayK)`, from `SUN_DIR = (0.9456, 0.1305, 0.2981)` (7.5° high, "where the lamp's light came from, lowered to a late afternoon"), at 220 m, ortho shadow box ±46×±40, 4096², `bias −0.00025, normalBias 0.035`; day hemi `(0xb8cce6, 0x918270)` 0.25→0.40; six warm `PointLight(0xffc98a)` interior lamps (one lights the mini model on the study desk).
- `dayK = sstep(seg(R, 42, 66))` — lighting cross-fade is keyed to the sphere radius, not to scroll directly. Exposure 1.02 → 1.06.
- `renderer.shadowMap.autoUpdate = false`; shadows re-rendered only when a key string of moving things (layer y, house y, tree scales, R, door) changes.
- Lamp switch `setLamp(k)`: tungsten ramp `k = eout(seg(tb, 1.48, 1.82))` on; off at the end `k *= 1 − eout(seg(e, 0.2, 0.38))`.

### Real materials
All canvas-painted with world-space UVs (`worldUV()` picks the two axes orthogonal to the face's dominant normal, so textures run on across boxes): board-marked concrete (16 board strips, seams, tie holes; tile 2.4 m), wide-plank oak (tile 3.6), travertine paving, grass (+ shader dual-scale rotated sampling and noise in `patchLand`), bark; foliage with a fake subsurface back-light term (`patchFoliage`). Glass `MeshPhysicalMaterial` opacity 0.11. Terrain is a heightfield `landAt(x,z)` that "undoes the steps" of the same contour function `Xof(t,z)` used for the greyboard layers (with a 14% memory of the 0.8 m benches so card and land rhyme during the turn), dense near (0.5 m), growing spacing to 1 km.

### The switch (sweep.js) — key code
```glsl
// vertex: vSweepW = (modelMatrix * vec4(transformed,1.)).xyz;
float rawSweepD = distance(vSweepW, uSweepC);
float compSweepD = rawSweepD < 66.0 ? rawSweepD : 66.0 + (rawSweepD - 66.0) * 0.22;     // far studio compressed
compSweepD += max(0.0, vSweepW.x - 41.5) * 2.5 + max(0.0, vSweepW.z - 22.5) * 2.5;    // hand-tuned bias
float sweepD = min(compSweepD, uSweepClamp);
// card side:  if (uSeamK > 0.0 && sweepD < uSweepR) discard;
// real side:  if (sweepD > uSweepR) discard;
float dSeam = abs(sweepD - uSweepR);
float coreLine = exp(-pow(dSeam / uSweepW, 2.0));                                     // W = 0.20
float echoLine = 0.36 * exp(-pow((dSeam - uSweepW*2.6) / (uSweepW*0.75), 2.0));
float softBand = 0.28 * exp(-pow(dSeam / (uSweepW*4.5), 2.0));
float gridEnv  = exp(-pow(dSeam / (uSweepW*11.5), 1.6));
float cadGrid  = max(cY*0.62, max(cX, cZ)*0.42) * gridEnv;                             // 1 m / 0.5 m world grid
float sweepSeam = uSweepGlow * uSeamK * (coreLine*1.15 + echoLine + softBand + cadGrid) * smoothstep(98., 72., compSweepD);
// before opaque_fragment: outgoingLight += uSweepCol * sweepSeam;   col = (2.15, 0.82, 0.24) HDR → bloom
```
Injected at `#include <clipping_planes_fragment>` (discard) and `#include <opaque_fragment>` (seam). `customProgramCacheKey` = `prev | sweep-side`. Studio meshes join the card side with `seam: 0` so they never discard or glow (the dark studio stays around the real house). Both worlds are compiled up front behind the loader (`SWEEP.R = 60; renderer.compile(); composer.render(); SWEEP.R = 0`) to avoid a stall at the turn.

Radius schedule (piecewise smoothstep `pw()` over the turn chapter τ):
`turnR = [[0,38],[0.10,47.5],[0.40,56.5],[0.68,66.5],[0.88,71.2],[1,72.8]]` — 43 reaches the lens, 47 the figure, 48–66 the house in true metres, 66–72.8 completes slope and trees. Back: `[[0,72.8],[0.44,72.8],[0.58,66.5],[0.7,56.5],[0.78,45],[0.88,0]]`. Glow `sstep(seg(R,36,41))·(1−0.85·sstep(seg(R,70.5,72.75)))`. Real meshes `visible = R > 32`; card meshes hidden once `R ≥ R_MAX − 0.3`.

### Hero build timings (seconds after loader, `tb`)
- loader: knife lift `seg(0, 0.38)`, sheet opens `eio4(seg(0.28, 1.36))`
- lamp on `eout(seg(1.48, 1.82))`
- contour layer i: starts `2.0 + 0.13·i`, falls from y=13 with `y = 13·(1 − s²)` over 0.42 s, then a bounce `13·0.02·sin(π·u)` over 0.18 s, fades in over the first 40%
- house slot: start 3.45, 1.25 s, `y = 15·(1 − eout4(s))`, `rotY = 0.045·(1 − eout(s))`, `x = 0.5·(1 − eout(s))` ("placed by hand: slow at the end")
- trees: start `4.45 + 0.045·i`, 0.45 s, `scale.y = eback(s)` with overshoot c = 1.6; figures `4.9 + 0.07·i`, 0.4 s
- headline lines `eout4(seg(5.1 + 0.14i, 6.1 + 0.14i))` sliding 125% up from a mask
Easings: `sstep = t²(3−2t)`, `eio` cubic in-out, `eio4` quartic in-out, `eout` cubic out, `eout4` quartic out, `eback` back-out c=1.6, `pw(x, pts)` piecewise smoothstep between keys.

### Camera
Scroll in vh; chapters `dive [40,460]`, `turn [460,880]`, `walk [880,1500]`, `back [1520,1960]`, `end [1960,2030]`. Smoothing `smooth += (exact − smooth)·(1 − e^(−3.4·dt))`.
- Hero `p (87,31,73) → t (1.2,−3.6,1.4)`, fov 27.8, DOF (Bokeh focus on house). Pre-roll push-in from `(114,49,98)` fov 30 with `eio(seg(tb,1.3,6.6))`, idle "breath" sinusoid `±0.9, ±0.5`.
- Dive path (centripetal Catmull-Rom, position and target curves): `(87,31,73) → (64,15,46) → (50,3,24) → (46,−2,16) → (41.5,−2.9,10.5) → (37.6,−3.2,6.6)`; fov 27.8 → 50.
- **Scroll by scale** (`measurePath`): sample the curve 600×, cost of each step = `length / (heightAboveGarden + 3)`, normalise, invert by binary search ⇒ each halving of the height costs equal scroll. `de = lerp(d, sstep(d), 0.5)` adds a gentle ease.
- Turn: curve eye → two mid keys → SPOT `(33.0,−3.15,6.3)` (where the figure stood; the figure fades out `1 − sstep(seg(τ,0.01,0.14))`), with a 2° fov "breath".
- Walk/back: `makeShot(keys)` = position curve + a separate yaw/pitch curve (unwrapped, so it can turn on the spot without flipping), scroll spent by "effort" = distance + 2.2·turn angle (÷ height when it moves through scale on the way back). Walk timing remapped by `pw(w, [[0,0],[0.258,0.42],[0.435,0.56],[0.823,0.825],[1,1]])` to dwell. Door slides `1.85·sstep(seg(w,0.08,0.22))`.
Post: HalfFloat RT with 4× MSAA → GTAO (glass hidden during AO) → Bokeh → UnrealBloom(0.34, 0.48, 2.15) → OutputPass → grade (vignette 0.52, split-tone, grain 0.02). Quality governor drops DPR by 0.25 after 2 s of slow frames.

---

## 2B. 02-section-sweep in depth

### Modules
- `index.html`: inline loader (key plan SVG, cut line via `strokeDashoffset`, flies into the title-block slot), SVG overlay `#ov` for notes, title block, CAD radar, scroll `#track`.
- `house.js`: the house once as data → `buildPieces()`.
- `draw.js`: the ink (ND pass + full-screen ink/composite shader + FXAA).
- `real.js`: the lit house rendered into a target, sun depth map, ray-marched shafts.
- `look.js`: canvas textures, PMREM env with "light cards", material table `M`, sky gradient.
- `main.js`: camera poses, swing (dolly zoom + orbit), walk spline, story(y), SVG notes, HUD, frame loop.

### Data model: pieces
Same structure helpers as 06 (`box`, `carve`, `wall`, `glassRun`, scissor stair), but `box()` **splits at the cut plane `z = CUT = 0`**:
```js
if (z1 <= CUT) halves.push(['behind', b, false]);
else if (z0 >= CUT) halves.push(['front', b, false]);
else { halves.push(['behind', [x0,y0,z0,x1,y1,CUT], true]); halves.push(['front', [x0,y0,CUT,x1,y1,z1], true]); }
// a face lying on the cut becomes poché: mat 'poche', id = ID.poche + 0.9·rank
```
Each face becomes a **piece**: `{ pos: Float32[], nor: Float32[], mat: 'conc'|'oak'|…, id, part: 'behind'|'front'|'people', glass, kind, uv }`. Drawing ids: `paper 1, poche 2(+0.9·rank), earth 4, person 5, life 6`. `rank = clamp((cy+4.3)/12.5)·0.82 + rnd·0.18` orders the poché fill on load (bottom first, with jitter). Per-face materials by sign/axis: `{ all, px, nx, py, ny, pz, nz }`.
**The land is literally a 2D section profile extruded along depth**: `band(profile, z0, z1, part, cutAt)` = `ExtrudeGeometry(Shape(profile), {depth})`, triangles classified by normal into grass (top), earthCut (sides), and an `ID.earth` cap on the cut face. Different profiles for behind/side/front bands. This is exactly the "2D outline + depth" primitive the diorama builder needs.
`mergePieces(list, {uv, id})` builds BufferGeometry with optional `aId` attribute. `solids()` exports boxes for camera-path collision checks (`__checkPath()`: every walk sample closer than 0.18 m to a non-glass box).

### How the drawing is drawn (draw.js)
Pass 1, ND: all non-glass pieces merged per part with one `ShaderMaterial` (DoubleSide) into a **float RGBA target** (Nearest): `gl_FragColor = vec4(n.xy, viewDepth − near, id)` (normal flipped on back faces).
Pass 2, INK (full screen): for each pixel
- reconstruct world position from depth: `worldAt(uv, s) = camWorld · (mix(fr.x,fr.y,uv.x)·z, mix(fr.z,fr.w,uv.y)·z, −z, 1)` with `fr` = frustum tangents (supports lens shift);
- **edges**: 4 directions (±x, ±y, two diagonals); depth "bend" second difference with a perspective correction, normalised by the pixel footprint `foot(z)` and thresholded `smoothstep(dK, 2dK, bd/f)` (dK 1.6); normal crease `smoothstep(0.1, 0.28, 1 − dot)`; silhouette against empty; leafy crowns use a softer test so foliage isn't a black blob;
- **line weight by distance behind the cut**: `w = mix(1, 0.46, smoothstep(0.4, 12, −worldZ))`; **plot-in**: `rv = 1 − smoothstep(uLines − 1.4, uLines, layer)` reveals lines front-to-back as `uLines` grows;
- **poché**: ids 2–3.5 → 45° screen hatch whose coverage grows with `uPoche − rank·0.62` until solid `#161513`;
- **earth hatch**: id 4 → world-space 45° lines `(wp.x + wp.y)/0.31`, revealed bottom-up by `uEarth`;
- paper grain `hash(fragCoord)·0.024`;
- **composite**: `m = 1 − smoothstep(scanX − 0.015, scanX + 0.015, wp.x)` (sky uses a ray to z = −30 and a 5 m soft edge); `col = mix(real, ink, m)`;
- **sun shafts** added on the real side: `real += cSun · (1 − exp(−shaft·0.135·uShaft·(0.4 + 0.6·HG(μ, g=0.55))))·0.48`;
- **scan line styles** (`uSweepMode`): 0 plain line + wash; 1 "stencil": 1.65 m band with 0.8 m world grid + orange edges; 2 X-ray cross-hatch; **3 (used) "CAD terminal"**: 1.15 m band, 1 m contour lines on y, orange wireframe of the detected edges, and a crisp `1.65 px` line.
Then FXAA to screen. Note: the comments in house.js/draw.js say figures (id 5) and plants (id 6) "stay drawn" inside the real house, but in the shipped shader the composite `mix(real, col, m)` has no id test (the `isP` flag computed in `edgeAt` is never used in `main`), and real.js renders figures with `look.M.figure`. So that intent is stale; to get it, add `if (isPerson) m = 1.` before the composite.

### The lit render (real.js + look.js)
Same pieces bucketed by `part|mat`, merged, `look.M[mat]`. Sun `DirectionalLight(0xffd6a6, 4.1)` from `SUN_DIR = (0.85,0.44,0.28)` normalised (the December angle, to match the drawn dashed line), shadow 4096², box ±26×(−18..22); fill `DirectionalLight(0xeef4fa, 0.85)`; hemi `(0xe4ebf0, 0xd2c4b0, 0.82)`; ambient 0.2; ten warm `PointLight(0xffc990)` room lamps; `FogExp2(0xe6d6be, 0.0045)`; ACES, exposure 1.06; GTAO (radius 0.35, 8 samples, glass hidden). Rendered at 0.6–0.75× resolution into a HalfFloat target (never to screen); ink stays at full res on top. Shadow map only re-rendered when `front` visibility changes.
**Sunbeams**: an orthographic sun camera renders a float depth map (1024²); a half-res full-screen pass reconstructs each pixel's ray, clips it to the house AABB (`(4,−3.2,−7.7)–(18.3,7.6, 0 or 3.7 inside)`), marches 22 steps with interleaved-gradient-noise jitter, accumulates `step(q.z, sunDepth + 0.0015)·dt`.
Materials (look.js): all `MeshStandardMaterial` with canvas `map` + canvas `bumpMap`, world-metre tiling, env = PMREM of a gradient sky dome + three white "light cards" for grazing speculars; `poche` = `MeshBasicMaterial 0x161513`; glass `MeshBasic` 0.17 opacity with env reflection; emissive `shade`, `opal`, `fire`.

### Camera and the 2D→3D transition
One `PerspectiveCamera` with a hand-built asymmetric frustum (`placePose`): pose = `{p, t, fov, sx, sy}`; lens shift in metres at the target; `near = max(0.05, min(dist − 45, dist·0.5))`, `far = max(dist + 170, 220)`; frustum tangents stored in `cam.userData.fr` for the ink shader.
- Hero frame: target `(13, 1.2, 0)`, frame height `hgt = max(44, 25.3·asp)/asp` (≈25 m), lens 0.12° (`TAN0 = tan(0.06°)`) ⇒ distance ≈ 12 km.
- `swingState(sw)` over scroll 0–2.5 screen heights:
```js
const q1 = eIO(ramp(sw, 0.0, 0.56));         // dolly zoom
const q2 = eInCont(ramp(sw, 0.16, 0.84));    // orbit to 3/4 (overlaps)
const u = lerp(TAN0, Math.tan(F.f1 * Math.PI / 360), q1);   // interpolate tan(fov/2) → perspective grows evenly
const fovA = 2 * Math.atan(u) * 180 / Math.PI, distA = h.hgt / 2 / u;
// then blend fov/dist/target/yaw/pitch toward F.end {t:[11.2,1.1,-4.6], yaw:39, pitch:8.2, fov:35, dist:28.4}
// eInCont(x) = x²(2.3 − 1.3x): ease-in ending with slope 0.7 so it hands into the walk spline without stopping
```
F.f1 = 58° (72° portrait). Then the sweep pose `F.sweep {t:[13.8,1.55,-4.1], yaw:20, pitch:4.2, fov:45, dist:17.5}` is key 1 of the walk spline.
- Scan position: `forwardScanX(sp)`: `lerp(25.5, 3.4, eInCont(sp/0.82))` then a C1-matched quadratic `3.4 − 3.4t − 60t²` out to −60 (through the hill). `sp = (y − 2.0)/(CH.sweep[1] − 2.0)` so the scan starts 0.5 screen heights before the swing ends. Shafts `eSine(ramp(18.4 − scanX, 0, 6))`; sun lines fade `1 − ramp(18.6 − scanX, 0, 4)`.
- Walk: keys `{p, t, fov, rest, label}`; segment scroll length `clamp(9·dist + 0.55·angleDeg, 42, 145) + 0.65·(rest_i + rest_i+1)` (first segment 210); a monotone cubic Hermite remap with tangents = harmonic mean of secants, ×0.52 at labelled rooms (slow, never stop). Level camera inside: target y pulled to eye height and the difference expressed as vertical lens shift `sy` (clamped ±0.42·d) — "like an architectural photographer". Front half of the house (`part 'front'`) is shown only between the spline parameters where the camera crosses z < CUT − 0.35.
- Scroll smoothing `yCur += (yT − yCur)·(1 − e^(−6·dt))`; `prefers-reduced-motion` disables it.
- Load sequence (seconds b after loader): earth `eOut(ramp(b,0.15,0.85))`; lines `uLines = −1.6 + 2.7·eOut(ramp(b,0.25,0.6)) + 26·eIO(ramp(b,0.85,1.45))`; poché `eIO(ramp(b,0.5,1.3))`; grid bubbles from 0.2 + 0.06i; levels from 1.45 + 0.07i; sun lines from 1.85 + 0.16i; dimensions 2.0 + 0.12i; room names 2.15 + 0.05i. The notes are SVG elements re-projected with `Vector3.project(cam)` each frame, lines grown by lerping the endpoint.
- Lens readout: 35 mm-equivalent `mm = 12 / tan(fov/2)`; the title block flips "Scale 1:100" → "Not to scale" when fov ≥ 1.2°.

---

## 3. The prompts and stated principles

All seven PROMPT.md files share one template (they are "starter prompts", explicitly *not* the author's page):
1. "I want to build a scroll-driven landing page for [subject]."
2. "The idea:" — the opening drawing, described in drafting vocabulary (poché, hatched earth, grid bubbles, level marks, dashed sun lines, title block…). "Nothing looks 3D."
3. "The scroll, in order:" a numbered storyboard: loader → drawing draws itself → the transition → the walk → return to the drawing → CTA.
4. "What I care about:" the non-negotiables.
5. "Before you write any code, propose the [house] with sizes I can picture and the camera path stop by stop, and wait for my answer. Then build in checkpoints. First checkpoint only: [loader, drawing, first transition]. Record it and show me before you go further." Plus: "The last paragraph matters as much as the idea. Without it you get a finished page you did not choose."

Per-prompt asks: 01 plotter loader, layers land in building order, dolly zoom from a 1.5° lens ~1 km, crease lines in 3 weights, corner plan. 02 key-plan loader, section draws itself (earth+poché, lines front→back, notes), dolly zoom then 3/4 turn, vertical scan with sun lines → sunbeams, walk via the cut, back to sheet; 0.12° lens ~12 km; full-screen ink shader from normal+depth mixing lit render by scan position; "camera never cuts". 03 one clipping plane + black lids; `distance = frame height / tan(lens/2)`; camera never orbits; give the depth something to show. 04 every part carries its week; one list of phases drives programme, drawings and site; 6 tiles = live model through 2° lens. 05 one phase table drives bars and parts; live phase orange in both places; held high 3/4 camera "so the building is what moves"; not cartoonish; working days. 06 scalpel loader; hero builds; dive where every halving of height costs equal scroll; sphere from the bulb with amber scan line; lamp → low sun; no sky, dark studio stays; one parts list rendered as card or real at the same coordinates; card and house lit separately. 07 hatching computed from the shadow map at the drafting convention (−1,1,1); camera keys are frames, lens blends without a jump; one material per surface chosen per pixel by the sweep.

Recurring design principles (stated across prompts/READMEs/comments):
- **The drawing is not a picture**: it is the real 3D model seen through a long lens, or inked from it. One model, two (or more) looks.
- **One number drives everything** (scroll 0–1, or week); `update()` is a pure function of (time, scroll) ⇒ reversible, scrubbable, recordable.
- **One table/list drives every view** (parts list, phases).
- **The camera never cuts**; transitions are continuous dolly zooms / splines with C1 hand-offs; slow down at stops, don't stop.
- **The change travels through the world, not across the screen** (world-space fronts, not screen wipes).
- Fixed palette: paper `#f2efe7`, ink `#1d1c19`, one amber `#e85d04` (06: near-black page, cream card); Chakra Petch headlines, IBM Plex Mono labels; CAD chrome (corner registration marks, title block, lens readout in mm, mini map/key).
- Constraints: three.js from CDN, plain files, no build step, **no image files, every texture drawn in code**; ~100–190 KB per demo.
- Process: propose sizes and camera path first, wait; build in checkpoints, record and review.

---

## 4. Generalisation proposal: a "diorama builder"

### 4.1 Core idea
Build everything from one **scene description** → one list of world-space **pieces** (triangles + material key + drawing id + reveal attributes). From pieces, three renderers: **sketch** (ink), **card** (paper model), **real** (lit PBR). A **front** (scalar field over world space vs. a uniform) decides per pixel which one shows. A **camera rig** of frame-based keys handles flat→perspective. A **timeline** maps one progress value to all uniforms.

Recommendation on pipeline: use **06's forward material patching** as the backbone (both worlds as real meshes, discard by field — works with shadows, AO, bloom, any front shape, no float-target requirement) and add **02's ND + ink full-screen pass** as an optional "sketch" layer composited over it by the same field. 02's deferred approach is better for crisp section drawings (poché, hatching, line weight by depth); 06's is better for "physical model" transitions.

### 4.2 Scene description (input)
```js
/** @typedef {[number, number]} V2 */
const scene = {
  units: 1,                          // 1 unit = 1 m
  up: 'y',
  cut: { normal: [0, 0, 1], offset: 0 },   // optional section plane (02/03)
  sun: { dir: [0.85, 0.44, 0.28], color: 0xffd6a6, intensity: 4.1, shadowBox: 30 },
  sketchSun: [-1, 1, 1],             // drafting convention for computed hatching (07)
  palette: { paper: 0xf2efe7, ink: 0x1d1c19, accent: 0xe85d04, poche: 0x161513 },
  materials: {                       // real look; card look is derived unless given
    conc: { real: { kind: 'concrete', tile: 2.4 }, card: 'card' },
    oak:  { real: { kind: 'planks', tile: 3.6, hue: 31 } },
    glass:{ real: { kind: 'glass' }, card: 'acetate', ink: 'none' },
    soil: { real: { kind: 'grass' }, card: 'greyboard', ink: 'earthHatch' },
  },
  bodies: [
    // prism: 2D outline in a plane, extruded along that plane's normal
    { id: 'wallN', plane: 'zy', at: 3.7, outline: [[-8,-3.6],[4,-3.6],[4,6.8],[-8,6.8]],
      holes: [[[-1.2,0],[1.2,0],[1.2,2.4],[-1.2,2.4]]], depth: 0.3,
      material: 'conc', faces: { inner: 'plaster' },
      build: { phase: 2, order: 0.1, how: 'rise' },          // 04/05
      card:  { hinge: { edge: 0, angle: 90 }, foldAt: 0.3 },  // 01-b style fold-up (optional)
      kind: 'struct' },                                       // struct|glass|life|person|land
    { id: 'land', plane: 'xy', outline: sectionProfile, depth: [-8, 4], material: 'soil', kind: 'land' },
    { id: 'fig1', lathe: figureProfile, at: [15.4, 0, -2.8], material: 'figure', kind: 'person' },
  ],
  camera: [ /* frame keys, §4.5 */ ],
  timeline: [ /* chapters, §4.6 */ ],
};
```

### 4.3 Engine API
```js
// geometry
export function buildPieces(scene) -> Piece[]
//   Piece = { pos: Float32Array, nor: Float32Array, uv: Float32Array, mat, inkId, part, kind,
//             bodyId, phase, order, hinge? }
export function piecesToMeshes(pieces, materialFor, { mergeBy = 'mat' }) -> THREE.Group
export function prism(outline, holes, plane, at, depth) -> THREE.BufferGeometry  // ExtrudeGeometry + orient + worldUV
export function splitAtPlane(geometry, plane) -> { behind, front, capFaces }      // generalises 02's box split
export function worldUV(geometry) -> geometry                                    // from 06/02

// looks
export function createLook(renderer, scene) -> { real: {key: Material}, card: {key: Material}, env }
export function cardMaterial({ tint, coreTint, tile }) -> MeshStandardMaterial   // T.card + withCore()
export function patchFront(material, side, front, opts) -> material              // sweep.js generalised
export function patchLightSides(material, side) -> material                      // per-side light weights
export function createInk(renderer, pieces, opts) -> { renderND(cam), compose(cam, uniforms) } // draw.js

// fronts (scalar fields), all GLSL snippets + JS uniforms
export const Fronts = {
  plane(normal, offset),            // 02/03/07: dot(p, n) - uOffset
  sphere(center),                   // 06: distance(p, c) - uR   (+ optional far compression)
  plotter(dir, center, radialK),    // 01: dot(p, dir) + k·|p.xz - c.xz|
  attribute(name),                  // 04: per-vertex aWeek vs uNow
};

// camera
export function frameKey({ target, frameH, fov, yaw = 0, pitch = 0, sx = 0, sy = 0, at }) -> Key
export function cameraAt(keys, p) -> Pose          // log-space fov, tan-space dolly
export function applyPose(camera, pose, aspect)    // asymmetric frustum with lens shift (02 placePose)
export function splineShot(keys, { effort = 'distance' | 'scale', turnCost, rests }) -> { at(s) -> Pose }

// build animation
export function buildSchedule(pieces, phases) -> { update(t) }     // 05 add()/update() generalised
export function foldNet(bodies, { order }) -> { update(t) }         // 01-b hinges, generalised

// orchestration
export function createDiorama(renderer, scene) -> { update(T, progress), render(), dispose() }
```

### 4.4 Code sketches

**(a) Prism from a 2D outline (the universal body).** 02 already does this for the land (`band()`); generalise to any plane:
```js
import * as THREE from 'three';
const PLANES = { // map 2D (u,v) + extrusion w into world xyz
  xy: (u, v, w) => [u, v, w],      // section plane, extrude along z (02/03)
  zy: (u, v, w) => [w, v, u],      // wall seen from x
  xz: (u, v, w) => [u, w, -v],     // plan, extrude up (06 contour layers)
};
export function prism(outline, holes = [], plane = 'xy', depth = [0, 1]) {
  const [d0, d1] = Array.isArray(depth) ? depth : [0, depth];
  const shape = new THREE.Shape(outline.map(([u, v]) => new THREE.Vector2(u, v)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([u, v]) => new THREE.Vector2(u, v))));
  const g = new THREE.ExtrudeGeometry(shape, { depth: d1 - d0, bevelEnabled: false, curveSegments: 6 }).toNonIndexed();
  const p = g.attributes.position, n = g.attributes.normal, map = PLANES[plane];
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, ...map(p.getX(i), p.getY(i), p.getZ(i) + d0));
    n.setXYZ(i, ...map(n.getX(i), n.getY(i), n.getZ(i)));
  }
  // fix winding if the map is a reflection (det < 0): swap 2nd/3rd vertex of each triangle
  return worldUV(g);
}
```
Classify triangles by normal (cap vs side, top vs bottom) to assign `faces: {top, bottom, side, cap}` materials and the ink id, exactly as 02's `band()` does. Splitting at the cut: for axis-aligned prisms along the cut normal, split the depth range (`[d0, cut]`, `[cut, d1]`) and mark the cap at `cut` as poché — no CSG needed (02's trick). For arbitrary orientation, fall back to 03's approach (clipping plane + per-body cap `ShapeGeometry` of the outline moved to the plane).

**(b) A generic front patch (06 sweep.js generalised).**
```js
export const FRONT = { uR: { value: 0 }, uW: { value: 0.2 }, uGlow: { value: 0 },
                       uCol: { value: new THREE.Color(2.15, 0.82, 0.24) },
                       uC: { value: new THREE.Vector3() }, uN: { value: new THREE.Vector3(1, 0, 0) } };
const FIELD = {
  sphere: 'float frontD(vec3 p){ return distance(p, uFrontC); }',
  plane:  'float frontD(vec3 p){ return dot(p, uFrontN); }',
  plotter:'float frontD(vec3 p){ return dot(p, uFrontN) + 0.35 * length(p.xz - uFrontC.xz); }',
};
export function patchFront(mat, side /* 'a' (outside/before) | 'b' (inside/after) */, kind = 'sphere', { seam = 1 } = {}) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (s, r) => {
    prev?.call(mat, s, r);
    Object.assign(s.uniforms, { uFrontR: FRONT.uR, uFrontW: FRONT.uW, uFrontGlow: FRONT.uGlow,
      uFrontCol: FRONT.uCol, uFrontC: FRONT.uC, uFrontN: FRONT.uN, uSeamK: { value: seam } });
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFrontW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFrontW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vFrontW; uniform vec3 uFrontC, uFrontN, uFrontCol; uniform float uFrontR, uFrontW, uFrontGlow, uSeamK;
        ${FIELD[kind]}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float fd = frontD(vFrontW);
        ${side === 'a' ? 'if (uSeamK > 0.0 && fd < uFrontR) discard;' : 'if (fd > uFrontR) discard;'}
        float ds = abs(fd - uFrontR);
        float seamV = uFrontGlow * uSeamK * (exp(-pow(ds / uFrontW, 2.0)) * 1.15
                    + 0.28 * exp(-pow(ds / (uFrontW * 4.5), 2.0)));`)
      .replace('#include <opaque_fragment>', 'outgoingLight += uFrontCol * seamV;\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => `front-${kind}-${side}`;
  mat.needsUpdate = true;
  return mat;
}
// shadows: mesh.customDepthMaterial = patchFront(new THREE.MeshDepthMaterial({depthPacking: THREE.RGBADepthPacking}), side, kind)
```
Note: when used with 06's light-side patch, keep 06's stated constraint — directional light order (shadow casters first) and hemisphere insertion order must match the weight arrays.

**(c) Per-side light weights** — lift 06's `LIGHTS` string replacement verbatim into `patchLightSides(mat, side)` with weights computed from a scene light registry (`{light, side}`) rather than hard-coded arrays; build the arrays in three's sort order (`castShadow` directionals first).

**(d) Card renderer** (06 desk.js): per piece, detect thin panels and write `aCore`; one merged mesh per card material (`card`, `acetate`, `greyboard`). Ship 06's `T.card`, `T.board`, `T.burn` recipes and `withCore()` as-is. Trees/figures: 06's slotted-cross extruded profile and lathe figure are generic "entourage" primitives.

**(e) Fold-up net (new, from 01-b).** For "cut paper pieces that fold up on a desk": each body that should fold gets a hinge edge (index into its outline) in its own plane. Build: lay the piece flat on the desk by rotating it about the hinge by −angle; animate back.
```js
export function foldNet(meshes /* {mesh, hinge:{a:V3,b:V3}, angle, window:[t0,t1]} */) {
  for (const f of meshes) {
    const pivot = new THREE.Group();
    pivot.position.copy(f.hinge.a);
    f.axis = f.hinge.b.clone().sub(f.hinge.a).normalize();
    f.mesh.position.sub(f.hinge.a);           // mesh geometry stays in world coords; offset under pivot
    pivot.add(f.mesh); f.pivot = pivot;
  }
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  const win = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
  return {
    roots: meshes.map((f) => f.pivot),
    update(t) {
      for (const f of meshes) {
        const flat = 1 - ease(win(t, ...f.window));                   // 1 = lying flat (01-b convention)
        f.pivot.quaternion.setFromAxisAngle(f.axis, -f.angle * flat);
      }
    },
  };
}
```
Nested hinges (a roof folding on a wall) = nested pivots (01-b puts the ceiling `lid` under the north wall pivot). Stagger windows like 01-b: `FOLD = { west:[0.12,0.24], north:[0.19,0.31], east:[0.26,0.38], south:[0.33,0.45], lid:[0.42,0.56] }`; contents scale in (`items.scale = lerp(0.015, 1, ease(win(...)))`). For automatic nets from a closed body: hinge each wall prism on its bottom outline edge, outward; roofs hinge on a wall top edge. A "scored line then parts" loader (06) and an amber line on the crease while it folds are cheap polish. Important: shadows need `shadowMap.needsUpdate = true` while anything folds (06 pattern: key string of moving state).

**(f) Sketch layer (02 draw.js generalised).** Keep `ND_MAT` + `INK` nearly verbatim; parameterise the composite by the same front: replace `wp.x` vs `uScanX` with `frontD(wp)` vs `uFrontR`, so a sphere (06-style) or plane (02-style) can reveal real behind ink. Ink ids become per-piece (`paper`, `poche`, `earthHatch`, `person`, `life`) from `scene.materials[k].ink`. For a pencil variant: offset the 4 sample directions by `hash(floor(fragCoord/3))·0.6px`, modulate `ink` by `0.75 + 0.25·noise(wp·8)`, multiply paper by a graphite tooth texture; optional "wobble" by perturbing `vUv` with low-frequency noise before sampling `tND`.

**(g) Computed hatching (07).** In the real/paper material for the sketch state: `shade = 1 − getShadowMask()·smoothstep(−0.02, 0.06, dot(N, uSun))`; `col = mix(paper, ink, lineAt(q.x + q.y, period)·shade)` with `q` = planar UV of the face. Start `uSun` at `(-1,1,1)/√3` and the sketch hatching equals the real shadows. Good for "sunlit" educational scenes (sundials, seasons, solar design).

**(h) Camera: frame keys + dolly zoom.**
```js
const D2R = Math.PI / 180, lerp = (a, b, t) => a + (b - a) * t;
export const frameKey = (k) => ({ yaw: 0, pitch: 0, sx: 0, sy: 0, ease: easeInOutCubic, ...k }); // {at, target, frameH, fov}
export function cameraAt(keys, p) {
  let i = 0; while (i < keys.length - 2 && p > keys[i + 1].at) i++;
  const a = keys[i], b = keys[i + 1] ?? a, u = a === b ? 0 : b.ease(Math.min(1, Math.max(0, (p - a.at) / (b.at - a.at))));
  // tan-space lens (02 swingState / 03 page.js): perspective grows evenly
  const ta = Math.tan(a.fov * D2R / 2), tb = Math.tan(b.fov * D2R / 2), th = lerp(ta, tb, u);
  return {
    target: a.target.map((v, j) => lerp(v, b.target[j], u)),
    frameH: Math.exp(lerp(Math.log(a.frameH), Math.log(b.frameH), u)),   // 07: log-space
    fov: 2 * Math.atan(th) / D2R, yaw: lerp(a.yaw, b.yaw, u), pitch: lerp(a.pitch, b.pitch, u),
    sx: lerp(a.sx, b.sx, u), sy: lerp(a.sy, b.sy, u),
  };
}
export function applyPose(cam, P, aspect) {
  const th = Math.tan(P.fov * D2R / 2), dist = P.frameH / 2 / th;           // the cut keeps its size
  const y = P.yaw * D2R, x = P.pitch * D2R, t = new THREE.Vector3(...P.target);
  cam.position.copy(t).add(new THREE.Vector3(Math.sin(y) * Math.cos(x), Math.sin(x), Math.cos(y) * Math.cos(x)).multiplyScalar(dist));
  cam.lookAt(t); cam.updateMatrixWorld();
  const near = Math.max(0.05, Math.min(dist - 45, dist * 0.5)), far = Math.max(dist + 170, 220);
  const l = -th * aspect + P.sx / dist, r = th * aspect + P.sx / dist, b = -th + P.sy / dist, tp = th + P.sy / dist;
  cam.near = near; cam.far = far;
  cam.projectionMatrix.makePerspective(l * near, r * near, tp * near, b * near, near, far);
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
  cam.userData.fr = new THREE.Vector4(l, r, b, tp);                            // for the ink pass
}
// "flat" key: { at: 0, target: [13, 1.2, 0], frameH: 25, fov: 0.12 }  -> ~12 km away, reads as orthographic
// "open" key: { at: 0.56, target: [13, 1.2, 0], frameH: 25, fov: 58 }
// "3/4"  key: { at: 1, target: [11.2, 1.1, -4.6], frameH: 2 * 28.4 * Math.tan(35 * D2R / 2), fov: 35, yaw: 39, pitch: 8.2 }
```
Watch depth precision at 12 km: 02 sets `near = dist − 45`, i.e. a thin slab around the model, which is why it works. Keep that.
Splines after the dolly: `splineShot(keys, {effort})` = centripetal Catmull-Rom for positions + separate yaw/pitch curve (06 `makeShot`) + arc-length/effort reparameterisation (`effort = 'scale'` divides step length by height above ground: 06 `measurePath`) + optional monotone Hermite remap with slow-down at `rest` keys (02 `buildWalk`). Use `eInCont(x) = x²(2.3 − 1.3x)` to hand off from a key-blend into a spline with non-zero velocity.

**(i) Build schedule (04/05).** `buildSchedule(pieces, phases)`: for each body `t0 = ph.w0 + order·(span − d)`, `how ∈ {drop, rise, grow, show}`; `drop` = `y += (1 − easeOut(s))·h` plus damped settle `sin(…·2.5π)·exp(−(s−0.76)·14)·0.04`; `rise` = `pivot.scale.y = easeOut(s)` with pivot at base; `grow` = uniform scale. Live piece: color `lerp(accent, 0.22)` and edges amber. GPU alternative (04): bake `aWeek` per vertex (can be an affine wavefront per phase `w0 + k·(x − x0)/len`, so seams between pieces build continuously) and `discard if aWeek > uNow` — then the build is just `Fronts.attribute('aWeek')` with an amber band where `uNow − aWeek` is small.

### 4.5 Orchestration
```js
export function createDiorama(renderer, scene) {
  const pieces = buildPieces(scene);
  const look = createLook(renderer, scene);
  const card = piecesToMeshes(pieces.filter(p => p.kind !== 'furn'), (k) => look.card[k]);
  const real = piecesToMeshes(pieces, (k) => look.real[k]);
  card.traverse(o => o.isMesh && patchFront([].concat(o.material)[0], 'a', scene.front ?? 'sphere'));
  real.traverse(o => o.isMesh && patchFront([].concat(o.material)[0], 'b', scene.front ?? 'sphere'));
  const ink = scene.sketch ? createInk(renderer, pieces) : null;
  const folds = foldNet(collectHinges(card, scene.bodies));
  const build = buildSchedule(pieces, scene.phases ?? []);
  const cam = new THREE.PerspectiveCamera();
  const tl = timeline(scene.timeline);        // chapters [{name, from, to}], returns {chapter, local(t)}
  // compile both worlds behind the loader (06): FRONT.uR.value = big; renderer.compile(...); FRONT.uR.value = 0;
  return {
    camera: cam,
    update(T, p) {
      const S = tl.at(p);
      applyPose(cam, cameraAt(scene.camera, p), innerWidth / innerHeight);
      folds.update(S.local('fold'));
      build.update(S.local('build') * (scene.weeks ?? 1));
      FRONT.uR.value = piecewise(S.local('materialise'), scene.frontKeys);   // e.g. 06 turnR
      FRONT.uGlow.value = /* on while the front is moving */ 0;
      setLightBlend(dayK(FRONT.uR.value));                                   // 06: lighting keyed to the front
      // shadows: needsUpdate only when the moving-state key changes
    },
    render() { /* forward composer (GTAO, bloom, grade); if ink: renderND + compose over it */ },
  };
}
```
Three-stage contract the engineer asked for — **sketch view → animated materialisation → real lit 3D**:
- Sketch: `fov 0.12°–2°` flat key, ink layer on (or card look), lines plotted by `Fronts.plotter`/`uLines`, notes in SVG projected from world.
- Materialisation: dolly zoom to 45–58°, then a front (plane scan for "drawing → real", sphere from a light for "model → real", hinges for "net → model", week attribute for "build"), with an amber seam and a CAD grid band in a few metres around it, sketch sun lines handing over to real beams at the same angle.
- Real: PBR, one shadowing sun (`PCFSoft`, 4096², `autoUpdate=false`), hemi + warm point lamps, PMREM env from a painted sky + light cards, GTAO with glass hidden, ACES ~1.05, optional ray-marched shafts (02 `real.js` pattern), level camera with lens shift for interiors.

### 4.6 Practical notes and pitfalls seen in the code
- Compile every shader permutation before the reveal (06 renders once with the front at max; 02 calls `update()` at a walk position behind the loader). Changing the number of clipping planes or lights later recompiles (03 keeps both planes for the whole page for this reason).
- 06's far-distance compression and `+ max(0, x − 41.5)·2.5` bias in the field are hand-tuned for one scene; expose `compress: {from, k}` and an optional bias function instead of baking it.
- Light-order coupling in 06's per-side weights is fragile; derive arrays from a registry.
- Deterministic RNG (mulberry32-style) everywhere so procedural textures/placements are stable.
- `?rec`/`__frame(t, s)` hooks: make the engine's `update(T, p)` pure from the start — every demo relies on it for recording and for reversible scroll.
- The 02 ink needs a float render target with `NearestFilter`; on mobile 02 renders the lit house at 0.6× and keeps ink at full resolution.
- World-space UVs (`worldUV`) are what make box-built models look continuous; keep them in `buildPieces`.
- Collision check for camera paths (02 `__checkPath`) is worth keeping as a dev tool.

### 4.7 Reusable pieces from the other demos (copy candidates)
- 01 `core.js` `patchFill`/`patchLine` (plotter reveal with amber pen tip; `drawOrder = dot(w, dir) + k·radial`), `eyeKey`/`camAt` (log fov), and `dir-b.js` hinged fold.
- 03 clipping-plane section with per-piece cap geometry (`p.cap = new THREE.ShapeGeometry(p.shape)`) and dual vertex colour (ink colour + material colour, `withColour`), and the "profile pushed along depth `z0..z1`" data model (`add(kind, pts, z0, z1)`), which is the closest existing match to "2D outline + depth" bodies.
- 04 `aWeek`/`aOut` per-vertex build attributes with world-space affine wavefronts per phase; multi-viewport tiles of one live model (`aim()`), sun that moves with the timeline.
- 05 `PHASES` table + `add(obj, phase, order, how)` + pure `update(week)`; crane drop with damped settle; "live" amber highlighting shared between chart and model.
- 07 shadow-map-driven hatching at the drafting sun `(-1,1,1)`, diagonal sweep `dot(p.xy, (√½, −√½))`, outlines that draft themselves along their length, camera keys as frames with log-space lens blend, Lenis smooth scroll.
