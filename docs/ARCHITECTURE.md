# Architecture

## Modes

`js/main.js` owns one WebGL renderer and switches between three **modes** with a warm fade. Each mode has `update(dt, t)` and `dispose()`.

| Mode | File | Scene |
|---|---|---|
| Hub | `js/hub/hub.js` | the library room: bookcases, scroll-books, furniture |
| Book room | `js/room/room.js` | one book: wall scrolls, pedestals with card models, reading overlay (`reader.js`) |
| Diorama | `js/dio/engine.js` | one diorama with its HUD |

**Switching** (`App._switch`): fade to the veil, dispose the old mode, build the new one, then give it its final look before
anything shows: a room's reflection probe is scheduled (`captureProbe`, which draws nothing), pending surface-map bakes run
(`BAKE.now`), a diorama's scanned detail is awaited (`aaa.scansReady`), every program is compiled (`gfx.prewarm`, parallel
where `KHR_parallel_shader_compile` exists), the probe is drawn in full (`RoomProbe.finish`), and a few frames are drawn.
Only then does the fade lift; at boot the page veil ("lighting the lamps…", `body.ready`) waits for the same switch.

**Address** (`js/route.js`, `App.route` / `App.onRoute`): the hash names the place, `#room=<bookId>` and
`#room=<bookId>&scroll=<partId>` (ids percent-encoded), nothing in the hall. A new place pushes a history entry; Back /
Forward and boot replace instead, and `onRoute` opens or closes the reader when only the scroll changed. `lib.lastRoom`
(`App.rememberRoom`) is the room and scroll visited last: the hall's double door (`roomshell.doorPick`, an invisible box at
`shell.userData.baroque.door`) leads back to it, and a book room's door leads back to the hall.

**Seed versioning** (`js/seeds-version.js`, `js/seeds-history.js` from `tools/seed-history.mjs`): a room stores its own copy
of each diorama spec, so `App.refreshSeedScenes` replaces untouched copies of an older built-in scene (fingerprint stamped
in `seedFp`, or listed in the history) with the current one, once per seed version (`room.seedStamp`), keeping slider values
and rewritten lessons; copies with the learner's edits are kept.

## Rendering (`js/gfx/renderer.js`)

The post chain follows Weatherglass's miniature look:
- a RenderPass into a half-float target with 4× MSAA;
- an OutlinePass, used for selection;
- UnrealBloom (0.32, 0.55, 0.86);
- an OutputPass with AgX tone mapping;
- a grade pass for vignette, grain, warm lift and the fade between modes.

Raycasts (picking, the director's clear-view search, the POV clear view) go through `js/gfx/bvh.js`: three-mesh-bvh 0.9.16 trees built lazily per geometry (≥ 256 triangles, index untouched, dropped for deforming geometry); `?bvh=0` turns it off (see `docs/research/tooling-decision.md`).

Shadows are soft (PCF). Resolution adapts to keep frames under about 22 ms. Environment lighting comes from a pre-filtered RoomEnvironment map. All textures are drawn in code (`textures.js`). Materials come from about 40 PBR presets (`materials.js`).

Diorama realism (v4):
- **Textures** (`js/gfx/proc.js`): seamless procedural wood, brushed metal, cast iron, paper, felt and marble sets with colour, normal and roughness maps; painted cloud banks and hill silhouettes; `alignUV()` gives world-scale UVs so grain runs along each part.
- **Materials** (`materials.js`): every preset is physically based. Vessels and cases are *thin-shell* glass (reflection only, edge-weighted), because three.js transmission renders only opaque objects and a transmissive flask would hide its water. Water, liquids, ice, gel and solid glass *do* use transmission (IOR, thickness, tinted absorption). While the drawing is showing, a shader hook flattens normal maps and removes clearcoat and sheen; each hook variant has its own shader define so compiled programs are never mixed up.
- **Lighting** (`js/dio/environments.js`): key, fill, rim and kicker lights per preset; the studio key is a spotlight with a fitted 2048 shadow map. Real-time contact shadows are rendered from below into a 512² target, blurred, every other frame.
- **Per-scene look** (`gfx.applyLook`): contrast, saturation, vignette, a subtle tilt-shift, exposure and bloom; `gfx.envFor(kind)` gives each preset its own reflection environment.
- **Shot hints**: `DIO.<model>.shots = {'<lowercase event-text substring>': {target, dist}}` tells the director where to point the camera for an event.

AAA surfaces and atmosphere (v5, `js/gfx/aaa.js`; details and maths in `docs/research/aaa-rendering.md`):
- **Procedural materials** `mud`, `cobble`, `crag`, `meadow`, `marblefloor`, `sand`, `bark` (also as `makeMaterial` presets, and the defaults of the builder's `terrain`, `mountain`, `rock`): one tileable GPU bake per kind (height, albedo variation, mask, roughness), read by an `onBeforeCompile` extension of MeshPhysicalMaterial in world space (planar or dominant-axis triplanar). Parallax occlusion ray-march (secant + binary refinement, LOD by distance, angle and texel footprint), silhouette fracture by `discard` (curvature-corrected ray exit, or a `bound` ring/rect), surface-gradient normals at two scales, cavity AO on the ambient, mineral flecks as metalness.
- **Wetness**: `AAA.uniforms.uAaaWet` / `uAaaRain` / `uAaaWetSpot`; models and scene code write `scene.userData.aaaWet = {g, rain, x, z, r, a}` and the environment applies it each frame (darker porous albedo, smoother roughness, puddles in the relief as a clearcoat water film with ripples, dew glints).
- **Outdoor lighting**: the sun is cascade 0 of up to three world-space shadow cascades (zero-intensity helper lights; the cascade is chosen per fragment in `materialize.js`), the hemisphere light is sky + ground bounce derived from the sun, and `scene.userData.aaaAtmos` drives the **AtmospherePass** (after the RenderPass, linear HDR): exponential height fog with Rayleigh + Henyey–Greenstein in-scatter and screen-space god rays from the depth texture both composer buffers now carry.
- **Quality** `gfx.quality` = `'low' | 'medium' | 'high'` (detected from the GPU string, DPR and caps; lowered and remembered when adaptive resolution bottoms out; `gfx.setQuality(q)`, `gfx.onQuality` callback). POM steps 0 / 12 / 24 near (4 far), cascades 1 / 2 / 3, god-ray samples 0 / 24 / 48, extra full-screen passes 0 / 1 / 2, pixel-depth offset and relief self-shadowing at high. Cascades change with the next diorama build.
- **No hitch on open**: the drawing keeps `scene.fog` (range pushed out) instead of removing it, and `Materializer.prewarm()` → `gfx.prewarm()` compiles the real and end states behind the veil. `gfx.stats()` returns draw calls, triangles, programs and passes of one frame.

Library architecture (`js/gfx/baroque.js`, `roomshell.js` with `style: 'baroque'`): the hall and the rooms are built from the study in `docs/research/baroque-libraries.md` (Metten, Admont, Mafra, Wiblingen): pilasters on a regular bay rhythm (`bay`, default 3.2 m) placed between the scrolls (`avoid`), a gilt cornice and coved ceiling with a fresco, tall arched windows on the light side, marble floors (`diagonal`, `checker`, `cubes`), and, from about 7 m height, a gallery with an upper book tier and spiral stairs. Geometry is merged by material (about 20 meshes). `userData.baroque.obstacles` gives the footprints of statues and stairs; walk mode collides with them.

## Drawing → real (`js/gfx/materialize.js`)

This generalises flat-to-3d (02 Section Sweep, 06 Card Model) and Lintel (top-down):

1. **One model, two looks.** Every material in a diorama is patched through `onBeforeCompile` with shared uniforms. Each fragment computes a **field** value (distance to a point, or a signed plane distance, plus a per-cell jitter) and compares it with `uFrontR`. Behind the front it shades as card: paper albedo, matte, no emission. Past the front it shades as its real material. On the boundary there is an amber seam that bloom picks up. Back faces through a section cut render as ink fill (poché).
2. **Ink.** Edge geometry (`EdgesGeometry`) and inverted-hull outlines, both faded by the same field, give crisp contour lines at any resolution.
3. **Flat is a long lens.** A camera key is `{target, dir, fov, frameH}`. Poses interpolate the field of view in tan space and the frame height in log space, which gives a dolly zoom from a 0.9–3° "drawing" lens into a 40° perspective. The pose blending is pure (`setProgress(t)`), so transitions can be scrubbed and replayed.
4. **Techniques:**
   - `card`: a sphere grows from the lamp corner, and parts drop in when opened from a pedestal;
   - `sweep`: a vertical plane scans along x, with poché;
   - `topdown`: a clipping plane rises, with poché, and a radial front follows.

The scroll illustration (`renderSketch`) renders the same scene at `t = 0` into a render target with drafting chrome added, so the image and the live drawing match.

## Dioramas

- `js/dio/scene.js` (`DioramaScene`) builds a scene without UI:
  - the environment preset (`environments.js`: studio, lab, landscape with Sky and a sun driven by the hour, cosmos, micro, abstract, ocean, night, plus an optional glass case);
  - either a **built-in model** (`models.js`, 16 ported physics models running through an adapter, plus the `custom3d` code host) or a **scene spec** (`builder.js`: about 60 shapes and macros);
  - the code API, declarative behaviours, and user edits (overrides and additions).
- Actors come from `D.label` (built-in models), from `role:"actor"` bodies, or from `api.label`. Unlabelled objects are decor.
- `js/dio/engine.js` (`DioramaView`) runs the stages:
  1. **sketch**;
  2. **materialise**;
  3. **tour**: one actor per wheel step or arrow key, the camera flying on a lifted arc, each name pinned once introduced;
  4. **explore**: a foldable left panel with step-by-step lessons (each needs Play before the next appears, and finished ones stay readable), variables, and objects.
- The **edit tool** raycasts any object and climbs to its root. It shows an OutlinePass and TransformControls, with actions to move, rotate, scale, hide, remove, replace or ask AI. Edits persist into the spec: as body fields for scene specs, or as `overrides` keyed by object path for built-in and code-made objects. Positions on moving objects are applied as offsets after the simulation's own update, so the dynamics keep working.

### Trees (`js/dio/trees.js`)
- `tree`, `pine` and `bush` scene shapes call `buildTree(kind, h, seed)`: a bent, tapered trunk with branches in the AAA `bark` material, and a crown of noise-displaced clumps plus alpha-tested leaf cards (one canvas leaf atlas). Pines are whorled drooping tiers with needle ribbons.
- Foliage shading: wrapped diffuse plus a back-lit translucency lobe; specular uses true N·L (wrapping it made bloom speckles).
- 4 geometry variants per kind, chosen by seed, plus mirror/yaw/±8 % height jitter. Geometry is shared and cached; materials are cached per scene (the materialize patch ties a material to one scene).
- Cost: 2 draw calls per tree (wood + foliage), about 1.5–2k triangles.
- `treeForest(kind, items, {color, seed})` builds instanced forests (2 draw calls per variant). Built-in models use it for background trees (countryside) and hedges (weather glass).

### Explainer cues (`js/dio/focus.js`, `js/dio/director.js`)
The specs and the evidence are in `research/explainer-animation.md` (§6); the lesson fields are in `SCENE_SPEC.md`, "Explainer cues".
- **Ownership.** The director owns *shots*: `zoom` (S4, exponential dolly with stations, target ring, scale bar, near/far scaling, `back`), `track` (S9, a ride on a centripetal Catmull–Rom rail) and the POV *bracket* (S6.4: establishing medium before, pull-out with a trail after). `zoom` and `track` count as moving shots in the grammar (the next shot is static; a zoom never follows a push: it starts with a cut to the overview). `Director.busy()` is true while a moving shot, a bracket or a cut is under way. `Cues` (one per `DioramaView`, `view.cues`) owns *beat overlays and step states*: `chain` (S1), `isolate` (S2), `peel` (S3).
- **Order per frame** (`DioramaView.update`): `cues.preStep()` takes the peel *lift* offsets off → `ds.step()` (the model moves its parts, the edit offsets are applied) → `dir.update()` (camera, beats, shots) → `comfort()` (the POV/move vignette from the camera's angular and linear speed) → `cues.update()` (chain timeline, peel animation, lift offsets put back, mask uniforms) → labels (S5: ≤ 4 full labels, the rest numbered dots).
- **Focus mask.** `FocusPass` is inserted just before the grade pass with `gfx.addPass(pass)` (an append-only hook in `renderer.js`; it returns a remover). It is disabled, at zero cost, unless a cue or the vignette is on. When on, it renders a half-resolution RGBA8 mask with its own depth buffer by re-rendering the scene through camera layers with override materials: layers 24–26 = large scenery (B = 1), 27–29 = opaque context (writes depth, black), one layer per face side (front, back, double) so each keeps its own culling (a BackSide sky cylinder seen from outside must not cover the model); 20 = isolate subject (G), 21 = chain links passed (R = 0.4), 22 = the chain front (R = 1), the last three double-sided with MAX blending. Transparent and transmissive meshes (glass) never occlude, so a link inside a glass still shows; peeled meshes are not occluders either. Shadow maps are not updated by the mask renders and the scene background/fog are switched off for them. The composite shader then greys and dims `1 − G`, adds the accent where R is set, and applies the comfort vignette. Layer bits are set only when membership changes (not per frame); the mesh list is re-gathered when the model is rebuilt.
- **Materials.** Chain and isolate clone nothing. Peel (ghost, clip) and the POV clear-view clone materials with `cloneMat()`, which re-attaches `onBeforeCompile` and the instance `customProgramCacheKey` (three.js `Material.clone()` drops both, which would silently remove the card → real patch); originals come back, and clones are disposed, on restore. Clip mode turns on `renderer.localClippingEnabled` and, while a cut is open, the shared `uPoche` uniform.
- **S10 inset** (`js/dio/inset.js`, `view.inset`). `Inset.update()` runs after `cues.update()`. It shows while `reason()` is `zoom` (any phase after the centring), `track` (ride), `pov`, or `close` (a running cinematic step whose camera is within 0.16 × the model radius of its target), and for 2 s after; never in Calm (`view.reducedMotion()`), below 600 px, or outside the explore stage. `InsetPass` is inserted with `gfx.addPass` after the focus pass, before the grade, and is disabled (zero cost) while hidden. When on, it renders the scene from the overview pose (`ds.overviewKey()`, the establishing wide) into its own HalfFloat target at half the device resolution (at least 0.6 px per CSS px), without the post chain and without updating shadow maps, every 2nd frame (3rd above 1.5 ms CPU, 4th above 3 ms or when the adaptive resolution is below 1); every frame it draws that target as a 220 × 140 px quad into the frame (exposure, AgX and sRGB as in OutputPass, the grade's vignette divided out at its pixels; alpha for the 0.35 s fade). The marks (camera dot, view wedge, zoom target ring, the ride's rail) are SVG in the `.dio-inset` frame. The corner is re-chosen every 0.5 s: least overlap with the panels, readouts, time bar, callout, chip and scale bar, then farthest from the callout. `inset.bench(n)` measures one inset render with a GPU sync (a 1-pixel read). `dispose()` unhooks the pass and frees the target, the quad and the DOM.
- **Moving shots finish.** `Director.frame()` does not re-frame an event beat while a zoom (also at its arrival view) or a track ride is on; `DioramaView.update` holds a step's completion while `dir.busy()` (at most 12 s more), so an early `until` never cuts a zoom or a ride half-way.
- **Explanatory operations** (`js/dio/grammar.js`, `view.ops`; the lesson fields are in `SCENE_SPEC.md`). `Ops` owns `explode`, `assemble`, `inspect`, `compare`, `progression`, `scaleTo` and the level indicator with its ghosted landmark; `section` is peel's clip mode with a fixed axis, an `at` point, a sweep time and a capped poché on the clipped clones only (each clone gets its own `uPoche` uniform, so thin double-sided sheets elsewhere keep their back faces). Nothing is created until an operation runs (no DOM, no pass, no material); `endStep()` gives everything back (offsets, visibility, materials, the render-pass hook, DOM). Per frame: `ops.preStep()` takes the explode/assemble offsets off before `ds.step()`, `ops.simRate()` freezes the simulation while parts are apart or a lineup shows (`DioramaView.update` multiplies the step and the step timer by it), `ops.update()` animates and puts the offsets back (world displacements converted to each part's parent frame, outermost first, so nested parts move by exactly their own displacement). `ops.busy()` holds a step's completion like `dir.busy()`; `ops.holdShot()` keeps the director from cutting away for an event. **Compare** builds a second `DioramaScene` that shares the scene, the uniforms, the materials and the environment (its world is a second group in the same scene, invisible outside the pass), steps it with the same time scale, and wraps the composer's `RenderPass`: the scene is drawn twice per frame into two halves of the same target (scissor; `side` also sets two viewports and the camera's aspect to a half), each time with the other world hidden, so both states get identical framing, light and post-processing. A built-in model is rebuilt after the second state, so its module state (shot targets, flows) belongs to the first. Pins are hidden while a comparison or a lineup shows (their positions would refer to one state only), and event callouts have no leader line in `side` mode. **Camera modes** (`lesson.cameraMode`): `global` → *wide*, `object` → *medium*, `component` → *push*, `mechanism` → *medium* that holds through events, `frame` → the POV bracket (or the track); `dir.mode` holds it for the step.
- **Comfort and reduced motion.** `view.reducedMotion()` = the **Calm** toggle (`prefs.motion`) or `prefers-reduced-motion`. POV turns are capped at 60°/s (≤ 120°/s²) with roll locked (also on `track` rides); a POV ride ends after 12 s unless the learner drags to look.

## Library and rooms

- Library meta lives in IndexedDB (`library.v3`); rooms in `room:<bookId>`; PDF blobs in `pdf:<bookId>`.
- Bookcases snap flush to the nearest wall. Books take free slots, eye-level tiers first.

### Hub shelves, scrolls and their API (`js/hub/hub.js`, `js/hub/props.js`)

- **Places.** A user bookcase has `tiers` rows (index 0 = the bottom row; people count rows from the top, `row label = tiers − index`) of `slotsPerTier` places at a 0.17 m pitch (horizontal case 3 × 17, vertical 6 × 5). The places of a row are centred between the stiles (`slotX`, and `slotAt` for the reverse). A cradled scroll (0.29 m, 0.40 m knob to knob) lies across the case depth with its middle at `SLOT_Z` ≈ 0.015 m in front of the case centre: its front knob ends at the tier board's front edge, its name tag hangs just before the board like a shelf label (behind the stiles' face), and its back knob stays 3 cm in front of the silk liner, so nothing of it leaves the bookcase. Every place of every row carries one holder, a pair of small dark velvet cradles under the roll's ends (one `InstancedMesh` per bookcase, `scroll-rests`). User bookcases hold scrolls only; empty places stay empty. The built-in wall cases keep their books.
- **Book fields** (persisted with the library, `library.v3`): `shelf`, `tier`, `slot`, plus `important: true` (a gold star on the name tag, ★ in the tooltip) and `hang: {metal, drop}` for a scroll hanging on chains (`metal` ∈ `brass | iron | silver | gold | black`, `drop` = metres from the board above to the roll's axis).
- **Hanging scrolls** (`props.poseScroll`, `setChains`, `hangLimits`, `hangSlots`). The roll hangs across the case (axis along x), 0.11 m behind the case front, its tag at the middle, on two chains from the underside of the board above (top row: the case's top board) to the knob tops. It spans ±0.20 m, so it reserves every place within 0.29 m of its centre (3 places). Its centre is kept 2 cm inside the stiles. The drop is clamped per row: from 0.11 m (the roll and seal clear the board above by 4 cm or more) to `row height − 0.163 m` (the tag's lower edge stays 1.2 cm or more above the cradles). That gives 0.11–0.34 m on a horizontal case and 0.11–0.28 m on a vertical one. The chains are link instances (pitch 10.6 mm, alternately turned 90°): one `InstancedMesh` per metal used on a bookcase.
- **Occupancy.** `need(so, b)` gives the `'tier:slot'` keys a book takes, `occ(caseId, exceptId)` gives everything placed on a bookcase, and `canPlace(caseId, tier, slot, hang, exceptId)` and `findSpot()` (the preferred row and the nearest places first, then eye-level rows) work from those. `repairSlots()` keeps hanging scrolls first. A scroll that clashes moves to the nearest free place. A hanging scroll that fits nowhere is laid in a cradle.
- **User interface.**
  - Right-click (mouse) or long-press (touch) a scroll, or click it in Arrange mode, to open a small menu: *Open*, *Tag as important*, *Hang on chains* / *Lay it back in a cradle*, chain metal swatches, a chain-length slider (bounded by the row), *Move to…* and *Delete scroll…*. A right-click on a holder opens the menu of the scroll that takes that place. With the menu open, Delete (or Backspace) also deletes. Deleting asks first in the app's own dialog (`util.confirmBox`), then `App.deleteBook` takes the book out of the library at once and offers *Undo* for 9 s (`util.toastAction`); its room, PDF, job and part caches are deleted from storage only after that (`App.purgeBook`; ids waiting are listed in localStorage `sm-pending-deletes` and swept at the next start).
  - *Move to…* is a dialog at the bottom of the screen with no dark veil: pick a bookcase, then a grid of rows × places with taken places disabled. The chosen place is previewed live.
  - In Arrange mode a scroll can be dragged. A ghost snaps to the nearest free place on the row under the pointer, and turns red when that row is full.
  - Hanging a scroll whose span is taken moves it to the nearest free span (the same row first, then other rows, then other bookcases) and says where it went.
- **Public API**, for the Add-PDF dialog and other callers (`app.mode` while the hub is shown):
  - `hub.listShelves()` → `[{caseId, title, kind, rows: [{row, label, hang: {min, max}, slots: [{slot, free, bookId?}]}]}]`. Rows come top first. `row` is the tier index (0 = bottom), `label` is what people read (1 = top), `free` is true when a new cradled scroll can go there, and `hang` is that row's chain-drop range in metres. A hanging scroll's reserved places show as taken, with its `bookId`.
  - `hub.highlightSlot(caseId, row, slot, {hang = false, frame = true, bookId = null})` shows a soft, pulsing warm ghost scroll at that place, hanging if `hang` is set. It turns red if the place cannot be taken; with `bookId` set, that book's own place counts as free. With `frame` set, the camera glides to the place over 0.8 s (in walk mode it only turns). It returns `{ok, free}`. `hub.highlightSlot(null)` clears the ghost.
  - `hub.placeScroll(bookId, {caseId, row, slot, hang?})` moves a book that is already in `lib.books` (for example right after ingestion) to that place. `hang` is `true | {metal, drop}` to hang it (this also tags it important), `false` to lay it in a cradle, or left out to keep its pose. If the place is taken, the nearest free place on that bookcase is used and a toast says so. It returns `{ok, caseId, row, slot, hang, moved}`, or `{ok: false, reason}`. It saves the library.
  - `hub.addFiles(files, place?)` / `hub.addPDF(file, place?)`: `place` = `{caseId, row, slot, hang?}` puts the first new scroll straight into the chosen place (reserved before anything is awaited). Without it, the old choice applies: the selected bookcase, then any bookcase with room.
  - Internals the menu uses: `moveBook(b, target)`, `setImportant(b, on)`, `setHang(b, on, {metal, drop})` and `setHangStyle(b, {metal, drop})`. The last one re-poses the scroll in place without rebuilding it.
- **Taking a scroll out** (`takeOutPath`, `scrollPose`). The scroll starts from its actual pose and moves in four steps:
  1. It rises 3 cm out of the cradles' hollow. A hanging scroll skips this: it leaves its hooks by going straight forward, since the knob tops fall away from the hooks.
  2. It slides straight forward along the case normal until its back end is 3 cm in front of everything on the bookcase: the case-frame bounds of the case without this scroll, so the cornice and the neighbours' tags count.
  3. It rises to reading height (1.62 m, or stays at its own height if higher).
  4. Only then does it turn to face the viewer. A turn about its middle brings its ends back toward the case by at most 6 mm.

  The legs are smootherstep-eased, with these timings: rise 0–0.35 s, slide 0.25–1.25 s, up from 1.1 s for 0.5–1.1 s (depending on height), turn from 1.22 s. The way out ends with the camera flight (`S0 = tFly − D`), or after it when the way out is longer (`tUn = max(tFly, S0 + D) + 0.1`). The unroll, glow and dive then follow as before. Escape replays the same path backwards.
- Rooms lay out stations along the perimeter, starting with the left wall, and grow when the parts don't fit.
- The pedestal miniature is the real diorama world, scaled down, with every material forced to card (`uFrontR = -∞`) and ink added. That is the card-model look.
- PDF ingestion (`js/ai/ingest.js`) merges the outline with numbered/bold headings (falling back to the contents page, then fixed windows), keeps every subsection with its pages, and cuts figures from the pages. The reader verifies coverage (`verifyChain`) and fills gaps with targeted follow-ups — see PROTOCOL.md, "Recipe for any AI". `tools/verify-chain.mjs` runs the same check, plus the strict schema, offline on any chain file.

### Reader folds (`js/room/reader.js`, `computeFolds` / `applyFolds`)

A scroll is never shown whole. After the chain is built, its DOM is cut into **units** and the units into **folds**:
- *Units*: a step's head (badge, the question it settles, kind and title, the statement with its figure, short quotes); each explanation paragraph with its figure; the display maths; the derivation; code; each worked example; a table; the PDF's figures; terms; intuition; misconception; *Check yourself* (question and hidden answer are one element, so they never split); the showcases. Sources, attached bodies, the question the step opens, figure links and number warnings are glued to the unit before them. The chain head, evidence, coverage and quality boxes ride with the first unit; the references are a unit of their own.
- *Folds*: units are added while a fold weighs at most 4.5 (a unit weighs 1, +1 when it holds a figure, drawing, table or code, +0.5 for a long text). A fold never ends between a step's head and its first unit, and a new step starts a new fold once the current one weighs 60 % of the budget. So a fold is about one step's question with its first two explanation blocks, or one section of a long step.
- Folds after the shown ones are `display: none` (`.unf-hidden`; a step whose parts are all hidden is hidden too), so they are neither tabbed into nor read aloud. Below the sheet the **fold bar** shows the rolled edge on a rod: *Unfold further · fold k of n read* (a real `<button>`: Enter / Space / tap) and a row of dots. Pressing it reveals the next fold: the chain's `clip-path` and a negative bottom margin animate together for 0.45–1.1 s (∝ the height uncovered), so the rod rolls down the page uncovering the new part; the `unroll` sound plays; with reduced motion the fold appears at once.
- **Persistence**: `part.unfold = {n, of}` in the room record (saved with the room), so a reload reopens the scroll as far as it was unrolled. The header's ⋯ menu has *Unfold all* and *Roll up*; at the end the bar offers *Roll it up again*.
- A jump to a step (coverage table, *follows from*, *shown in*) unrolls as far as needed first. MathJax typesets only the folds on show (it measures sizes), each fold when it is unrolled; the dependency arcs skip hidden steps.
- The 3D wall scroll in the room is unchanged.

## Presentation and navigation

- **Shot grammar** (`director.frame`, see `docs/research/presentation-craft.md`): every beat gets one shot, never a floating drift.
  - *wide*: the static overview, for a step without a named subject.
  - *push*: a cut to a medium-wide view, a 3.5 s eased dolly, then a hold. Used for an instruction about one object.
  - *medium*: static, framing the subject and the objects the sentence names. Used for explanations.
  - *close*: a 24° lens, cut in through a 0.5 s dip in the grade. Used for an event on a small part.
  - *pov*: the camera rides an actor (`engine.setPOV`).
  - Two moving shots never follow each other. The subject sits on a third of the frame left free by the panels. The lens eases back to the base FOV when the learner takes the camera.
  - Lessons may ask for a shot with `shot` and `pov`.
- **Read, then watch**: an instruction beat freezes the model (`timeScale` 0) until it has been read (hover pauses, › skips). The step then plays; events slow time to 0.3×, or 0.12× while descriptions are queued. During a step the instruction panel folds and the readouts shrink to the quantities the step mentions.
- **Point of view** (`engine.setPOV(actor)`, key P, the ◉ button in Objects):
  - The camera sits at the actor at a 74° FOV with a tiny near plane, and looks along the actor's motion, or at the current subject, or level at the model. Drag to look; Esc leaves.
  - Small actors are hidden so you see from them. Large ones (a flask, a cell) stay visible so you are inside them.
- **Sound** (`js/audio.js`, WebAudio, no files):
  - Ambience beds per place: library, room, studio/lab, outdoor with live rain and wind, ocean, space, micro.
  - One-shot effects for UI, scrolls, bookcases, pedestals, footsteps (tied to the walk bob), cuts, POV, and every diorama event. An event uses `ev.sound` if given, otherwise a keyword guess, panned to where it happens.
  - Mute and volume are remembered.
- **`js/dio/director.js`** turns lesson steps and simulation events into *beats*, shown one at a time.
  - Each beat gets one shot from the shot grammar above (`director.frame`), chosen from the beat: an instruction about one object gets a *push* (a 3.5 s eased dolly to the subject's bounding sphere, then a hold), an explanation a static *medium*, an event a *close* cut, a step with no named subject the *wide* view, and `shot`/`pov` in a lesson override the choice. The same subject keeps the shot on screen; nothing floats or drifts.
  - Its callout is anchored to the subject in screen space, with a leader line and a reading timer: 1.6 s plus words ÷ reading speed (150/210/300 wpm), 3–14 s.
  - During an instructed step, simulated time slows to 0.3× while an event is read (`timeScale`). A lesson waiting on `until: event:…` completes only after its beats have been read.
  - Optional guides are SVG arrows: motion direction from the anchor's screen velocity, plus links to the other actors the sentence names.
  - Preferences (`cinematic`, `guides`, `pace`) are kept in `localStorage['scriptorium.view']`.
- **Undo** (`DioramaView.undo`, Ctrl+Z):
  - transforms are stored as before-states keyed by object path;
  - structural edits are stored as spec snapshots, and they survive an AI rewrite of the spec.
- **Stage plates** (`renderSketch(..., {focusText})`): when a chain shows the same diorama again, the later drawing frames only the bodies its step names and marks them with coloured numbers and a legend. If nothing can be matched, a compact link replaces the repeat.
- **`js/nav.js`** is shared by the hub and the rooms. It has two modes:
  - *Overview*: orbit, with WASD gliding.
  - *Walk*: first person at a 1.62 m eye height, drag-to-look, 68° FOV narrowing to 30° when you look closely, inertia, head bob, and collisions against the room bounds and furniture boxes.
  - Speed and mode are remembered.

## Evidence (`js/ai/evidence.js`)

- Declares the viewer's connectors OpenAlex (`search_works`, `resolve_references`), Consensus (`search`) and PubMed (`search_articles`, `get_article_metadata`) through the artifact `mcp` capability.
- Wraps them as `sample` tools (`search_literature`, `search_evidence`, `search_biomedical`) that return small, uniform records.
- These tools are passed to every authoring call: analyse, author, edit, sub-scroll.
- `verifySources()` batches all cited references (25 per call) into `resolve_references` and stores `verified` / `check` / `openalex` on each source.
- Errors are reported per connector code (reconnect, add, not allowed…) and never collapsed into one message.
- Without the capability, the rest of the app is unchanged and sources show as unchecked.

## Quality gates

- `tools/smoke.mjs` (14 checks; the 14th runs the polish gate in quick mode) and the unit tests `tools/test-math.mjs`, `tools/test-prose.mjs`, `tools/test-ingest.mjs`.
- `tools/polish.mjs`: walks the hub, rooms, every seeded scroll unfolded (and the BYU fixture chains), every built-in model and flagship lesson beat by beat with Guides on and off, and the Add-PDF steps, at 1280×720 and iPhone 13 size, and checks overlaps, guide-label distance, clipped text, raw notation and italic units, figure legends and viewBox, off-screen HUD and colour. Resumable (`<out>/state.json` after every item); `--quick` for one view per area. The last full report is `docs/qa/polish-report.md`.

## Extending

- **New built-in model:** add `DIO.<name> = {params, build(D, p)}` in `models.js`, call `D.label` for actors and `D.event` for events, and list the model in `prompts.js` → `BUILTIN_TYPES`.
- **New shape or macro:** add a case to `buildShape` in `builder.js` and list it in `SCENE_SPEC`.
- **New environment:** add a case to `setupEnvironment`.

## The explanatory compiler (`js/dio/domains.js`, `js/dio/prims/`)

Design and sources: `docs/research/explanatory-compiler.md`. Different disciplines explain different *structures*, so each step is compiled into the visual grammar of its structure instead of one universal animation style.

- **Classifier** (`classifyStep(step)`, pure, node-safe): weighted keyword heuristics over the step's title, statement, explanation and terms, plus shape cues (code → `cs`, a table → `data`, a primitive it already carries) give a **domain** (`cs`, `maths`, `economics`, `business`, `philosophy`, `data`, `physical`) and a **structure**; the domain's affinities break ties. `ROUTES` maps the structure to a **primitive** and a **medium** (`diorama`, `panel`, `simulation`, `figure`, `slides`; a table of 6+ rows becomes `slides`). The AI's own choice, `step.visual = {domain, structure, primitive, medium?, why}`, wins when it names known values; the heuristic answer is kept beside it. `tools/test-domains.mjs` tests the routing.
- **Primitives** (`js/dio/prims/*.js`, one module each, `size(f, {narrow})` + `render(f, S)`): `progressive_construction` (construct.js), `state_machine` (signal.js), `transform2d` (transform.js), `distribution_lab` (sampler.js), `causal_loop` (loops.js), `competing_explanations` (rivals.js, HTML), `flow_network` (flows.js), `argument_map` (argument.js), `data_narrative` (story.js, with a `slides` mode), `algorithm_sandbox` (sandbox.js). They are figure kinds (`js/room/figspec.js` → `validatePrimitive`; `schema/figure.schema.json`), so `renderFigure` draws them wherever a figure goes: a paragraph, a teaching box, a `{type:"figure"}` demo.
- **Kit** (`kit.js`): an SVG stage on parchment (600 wide, 360 on a phone, with its own layout), typeset labels (`svgMath`) that are wrapped, measured after layout (`S.fit`: shrink to 72 %, then cut with a tooltip) and kept in the viewBox; curved wires routed round other boxes (`route`); a control row with at most a step bar, one primary action and two sliders; readouts; a "why" note (`mathHTML`). The frame loop runs only while the figure is on screen and something moves, never by itself under reduced motion (Calm or `prefers-reduced-motion`: steps change at once, pulses show their end state). A figure in a rolled-up fold is redrawn and measured when the fold opens.
- **Lectern** (`openLectern`, the 2.5D panel): the same primitive large on a board tilted toward the reader, its node layer lifted (drop shadow) and shifted against the wires with the pointer; flat and still under reduced motion; Esc or Close.
- **Diorama mode** (`scenes.js`, `sceneFor`): `progressive_construction`, `state_machine`, `causal_loop` and `flow_network` compile to a topdown scene spec (pillars or blocks with labels, tubes for edges, tokens riding them in the scene code, a `stage` / `tick` param, lessons from the primitive's own steps), opened by the figure's ◫ Diorama button.
- **Planner** (`js/dio/plans.js` `domainGrammar(step)`): the domain picks the grammar: primitive, medium, knowledge kinds and an Owen-stage sequence with valid operations (`domainSequence`).
- **Pipeline** (`js/ai/pipeline.js`): stage 4b `compileDomains` after the figures: steps whose structure has a primitive and that carry none are sent to the domain prompt (`domainPrompt`, `prompts/12-domain-compiler.md`, ≤ 12 steps a call, tool-free), else get `autoPrimitive` (a table → a data narrative); `A.domainReport` keeps every step's route. Diorama planning skips steps their primitive already explains; the diorama author may answer `{type:"figure", figure: primitive}` for a non-spatial idea. The quality gate's check 9 (`grammarIssues`) reports `grammar` (advisory) and invalid primitive demos (`badFigure`).
- **Example book**: "Ways of Explaining" (`js/seeds-domains.js`, on the Mathematics bookcase; `ensureDomainBook` adds it once to libraries seeded before it).

## The Revelation Engine (round 9)

`js/room/reveal.js` turns a step's central idea into a loop: hook → predict (with confidence) → reveal → refutation of a
confident error → the rule's boundary case → explain back → a transfer question that returns days later in the ◆ deck
(spaced, interleaved across scrolls). Its record (`reveal:ledger` in IndexedDB) holds the reader's predictions,
confidence, explanations and transfer history; nothing leaves the browser. A step's `reveal` field is written by the
analysis prompt (`js/ai/prompts.js`) or by hand; without one, a step with a *Check yourself* gets the loop in
free-prediction form, unless its epistemic type is a taxonomy or a chronology. The quality gate's check 10 enforces the
truth constraint (no rule without its boundary). Dioramas: `engine.js lessonPredict` + `predicts.js` (predict, then
play). Pictures of what labels refer to: `js/room/glyphs.js` (figures, the cast strip under each figure, terms).
New primitives: `bayes_update`, `emergence`, `control_loop`, `analogy_map` (`js/dio/prims/`). Rationale and sources:
`docs/research/revelation-engine.md`. Tests: `node tools/test-reveal.mjs`.


## Motion figures

`js/room/motion.js` plays a declarative animation (shapes, keyframes and makers such as `pend`, `gas`, `proj`, `curve`,
`bars`, `galton`, `lin`) from one clock u ∈ [0, 1], so every frame can be scrubbed and the same spec always gives the
same picture. The reader (`Reader.motion`) puts one under each "Picture it" and "Common mistake" paragraph: the step's
own (`intuitionMotion`, `misconceptionMotion`, written by the AI with the scroll and checked by `motionIssues`), or the
example library's (`js/seeds-motion.js`). A contrast plays the mistaken world beside the real one. Controls: play,
scrub, replay, ♪ (sonification), GIF (`js/room/gif.js`), and "3D ▸" when the step has a diorama. Rationale and sources:
docs/research/motion-figures.md.

## Revelation techniques and the laboratory (round 12)

`js/room/hooks.js` is a library of ways to reveal knowledge (not transitions or effects), in six families; the curiosity
family is rendered in full: partial revelation, anomaly, apparent impossibility, prediction invitation and unexplained
consequence. A hook is `{technique, text, parts?, options?, resolvedIn, payoff}`; every scroll opens with one before its
question (the AI's `A.hook`, `js/seeds-hooks.js`, or a partial revelation of its own conclusion), turning-point steps
may carry their own, and the step named by `resolvedIn` shows the payoff. Dioramas open with one over the drawing
(`spec.hook`, else `DIO_HOOKS` by title or type) that is paid with the step it names (`lesson`). The gate refuses a hook
without a payoff, settled at a missing step or before it is asked (`hookIssues`; non-blocking kind `hook`).

`js/dio/lab.js` is the diorama's Lab tab: guided discovery (the guide proposes informative experiments with their
reasons, predict / accept / skip / another) and the open laboratory (all sliders, "Record a run", the guide's next
choice still visible), with one notebook of findings computed from the readouts. Evidence and scoring:
`docs/research/revelation-techniques.md`. The readouts panel (bottom right) folds to its title bar (`foldReads`,
remembered).

## Frame budget (round 12)

The renderer starts at a resolution its GPU tier can hold (high 1.5, medium 1.25, low 1 × device pixels; `adapt()`
raises or lowers it from measured frame times). The main loop asks the place for a frame rate (`renderFps(idleMs)`):
the hall or a room at rest and untouched for 5 s is drawn at 30 frames a second, a room under an open scroll at 20, and
anything moving (the camera, a tween, an unfold, a drag) at the full rate; the state still updates every frame and any
input restores the full rate at once. The room's shadow map is redrawn every third frame (every eighth under a scroll)
and every frame while something flies or unfolds; the hall's only while something moves.

## Round 13

- Painted ceilings by subject (`js/gfx/ceilings.js`): the book room's domes carry an orrery (physics), a cartographer's
  sky (earth science), compass-and-straightedge constructions (mathematics), a molecular lattice (chemistry), a Galton
  board and its bell (statistics, markets) or phyllotaxis and leaves (biology); chosen from the bookcase name, else the
  book and part titles, else the hall's allegorical sky; the room's settings panel overrides it (`data.ceiling`).
- The diorama's opening hook flies from the caption to its place above the steps when the drawing has turned real,
  waits there through the tour as a floating copy and merges into the panel's card as the panel comes in.
- Full-window reading: one centred column of text, with figure rows, showcases and tables breaking out wider on the
  same axis. Figures' text is set at 12–13.5 px (axis ticks, legends, titles) and the small interface text one step
  larger; subscripts use lining figures (an old-style 0 read as a ring).
- Deepest dive and the sub-scroll request: docs/PEDAGOGY.md.

## Round 14: title screen, scriptoria, doors, maps, shared scrolls

- **Title screen (`js/title.js`).** A `TitleScreen` mode. On the left, a live `DioramaScene` for each 3D diorama in the
  current scriptorium (up to 12, the last room first; the built-in models when there are none), shot by a slow camera
  move (orbit, push-in, crane, circle) for `SHOT` = 9.5 s, then a 0.45 s dip through the grade fade to the next. The
  subject is shifted left with `camera.setViewOffset`, not by moving the scene. On the right: Continue, New scriptorium,
  Load scriptorium, Get a scroll. It is shown on boot unless the address names a room, `?title=0`, or the page runs
  under a test driver (`navigator.webdriver`; `?title=1` forces it).
- **Scriptoria (slots, `js/store.js`).** `store.useSlot(id)` prefixes every key with `slot:<id>/`; the first slot,
  `main`, keeps the old unprefixed keys, so existing libraries become it unchanged. `slots` and `lastSlot` are global.
  The IndexedDB name stays `scriptorium-memorium` on purpose: renaming it would orphan every saved library.
- **Autosave.** Writes are debounced (`saveLater`), flushed every 2 s, and flushed on `pagehide`, `visibilitychange` and
  `beforeunload`; `navigator.storage.persist()` is requested. `App.rememberPlace()` stores where you stand
  (`lib.lastPlace`: hall or room, open scroll, camera) every 1.5 s, which Continue returns to.
- **Camera moves (`App.cineRun`, `stepCine`, `arrive`).** Eased camera keyframes run after the mode's own update.
  Arrival kinds: `{from:'title'}` descends into the hall, `{pose}` returns to the stored camera, `{door:true}` starts at
  the threshold with the door open and closes it behind you.
- **Doors (`js/gfx/baroque.js`).** The leaves are real hinged groups (one merged mesh per material under a pivot at each
  jamb), with a warm light plane beyond. `info.door.set(k)` swings them (k 0..1). `App.walkThroughDoor(go)` walks up,
  opens the leaves by the clock (950 ms, so a slow frame never stretches it), steps through and calls `go()`.
- **Maps (`js/mapview.js`).** `MapView` (button, or M) draws an SVG plan from a provider the place supplies (`mapPlan()`
  in the hall and in a room), asked again every second and redrawn only when its JSON changes. The hall lists bookcases
  with their scroll counts and subjects; a room lists its scrolls in order with the dioramas on their pedestals. A
  click flies the camera there.
- **Shared scrolls (`js/share.js`).** Through the artifact's `db` capability: `pub/<uid>` holds a reader's visible
  scrolls (title, tags, sizes) and `pub/<uid>/books/<id>/chunks/<k>` the room in 180 000-character chunks (documents are
  capped at 256 KiB). Rules: everyone with view access reads `pub`; each reader writes only their own `pub/<uid>`
  (Contributor level or higher). The PDF is never shared. "Get scroll" lists every visible scroll with tag search; a
  pick, like Duplicate, goes through `choosePlace` (`js/room/addpdf.js`) to a bookcase of your choice, with new ids
  (sub-scrolls kept under their parents). A visible scroll is republished 8 s after its room changes.
- **Design references (`js/ai/evidence.js`).** With the Firecrawl connector, the writer gets `search_videos` (YouTube:
  lectures, documentaries, game playthroughs), `video_transcript`, `search_games` (Steam), `search_newsletter`
  (Substack) and `search_films` (Letterboxd), run as catalogued providers through `firecrawl_scrape`. They inform the
  design of a diorama or the order of reveals, never the facts. Reddit and Pinterest are not wired: both refuse
  automated access, and the honest route to them is their official API through a connector of their own.

## Round 15: tunnels, named maps, steady flights, a smooth showcase

- **Main menu.** A button beside "Arrange library" in the hall (and in a room's bar) opens the title screen. The place
  is remembered and saves are flushed first, so Continue returns there.
- **The tunnel (`js/gfx/tunnel.js`).** The front wall now has a real opening behind the double door (the wall's shape
  and the dado and skirting rings stop at the doorway), and behind it runs a 30 m tube in the door's own frame: one
  shader draws its six light rails, rings and streaks, all offset by a flow (metres) that the walk advances by the
  wall clock, and the far end brightens into warm light. A throat and an end wall close it round the doorway; a light
  outline marks the doorway from inside. It is drawn only while the door stands open or a walk is under way
  (`door.travel`). Leaving: approach, the leaves open, a step over the threshold, then the run down the bore (ease-in,
  the flow and the end's glow rising), and the next place is opened at 62 % of the run (or after 4.2 s), through the
  app's warm veil. Arriving: the camera starts 9.5 m down the destination's own tunnel, held there (`hold`) until the
  veil lifts, glides out through the doorway (ease-out, the flow slowing) and on to the view while the leaves close.
- **Flights that turn smoothly (`js/camfly.js`).** Camera moves (map flights in the hall and in rooms, the room's
  `flyTo`, the app's door and arrival moves) blend position and turn the orientation along the shortest arc
  (quaternion slerp), instead of blending the point looked at, which whipped the view sideways when that point passed
  near the camera. In a room, walk mode now takes up the heading a flight ends on (it used to snap back to its old one).
  The app's camera keys step by the wall clock (capped at 0.1 s), so a slow frame never stretches a door walk.
- **Maps with names and icons (`js/icons.js`, `js/mapview.js`).** 40 line icons, each with the word stems that call for
  it; `iconFor(name)` takes the longest matching stem. Bookcases get theirs from their name (and their scrolls'
  subjects) unless the reader chose one (Arrange library → Icon, or the icon beside a bookcase in the map's legend:
  `shelf.icon`). Scrolls take theirs from their titles; dioramas from their model type, else their titles. The plan draws
  each footprint with its icon and its name beside it, on the room side and beyond its dioramas, nudged apart when two
  names would collide; dioramas are drawn as icons where their pedestals stand.
- **The title screen's showcase.** A change of diorama happens entirely in the dark (the title's own dark, not the paper
  colour): the next diorama is built, its programs compiled, and it is run and drawn for six frames before it fades in.
  `gfx.swapScene` changes scene without resizing the canvas, and the title keeps one resolution (`fixedRes`: no
  adaptive steps during a shot). Measured over four changes: no visible resize; the visible compiles fell from three
  to one, and that one is the outgoing diorama's own cloud shadows switching on mid-dip. The decoration's large
  animated layer no longer uses a blend mode.

## Round 16: dissolves, a classical gallery, maps that read like plans, flights that never kick

- **Dissolves (`App.snapshot`, `App.dissolve`).** The last drawn frame is copied (in the task that drew it:
  `gfx._snap`, called after `composer.render`) into a canvas over the 3D view and under the interface (`.xfade`,
  z-index 1), which drifts slowly while it waits. Everything costly happens under it; then it fades by a CSS transition,
  which the compositor runs at its own pace even while the page's thread or the GPU is busy. Used for every change of
  diorama on the title screen (no more dips to dark) and for the title ↔ library switch (`_dissolveNext`: Continue,
  New, Load, Main menu), where the veil drops at once under the still, the arrival's camera move is held (`hold`) until
  the switch is done and then descends during the dissolve, and the interface fades in with it. Measured over four
  changes of diorama: no program compiled and no resize on a visible frame.
- **Flights that never kick.** (1) The app's camera keys start each turn from where the last key ended (`C.from.q`),
  never from the camera as it stands that frame (the place's walking or orbit controls had already turned it back to
  their old heading: the kick to the right into the tunnel); hall and room treat `app.cine` as busy. (2) A map flight in
  the hall lands only where walking or the overview allows (out of footprints, inside the hall; in the overview the
  orbit point is drawn back along the line of sight into the hall's limits): before, the next frame pushed the camera
  sideways. (3) Durations come from the way and the turn (`flightDur`), with a sine ease (peak speed π/2 × mean): the
  worst turn went from 24.8° to 5.2° per 1/20 s. The walk up to a door uses `dur: 'auto'` too.
- **Maps (`js/mapview.js`), after games and cartography.** The minimap carries markers only (icons on footprints,
  badges on dioramas, the camera's arrow and field of view), named on hover. The full map (M) names everything by
  boundary labelling: each wall's names stand in a column or rows outside that wall, in the same order as along it,
  joined by leaders that leave straight through the wall and bend once (they cannot cross); free-standing footprints
  get a plate beside them. Plates are measured in a wide hidden box first (a narrow one wrapped them after every word),
  the number of rows above and below and the plan's scale are settled together, and the plan fills the space left.
  Hovering a footprint, a plate or a legend line lights all three; a click flies there.
- **The gallery behind the doors (`js/gfx/tunnel.js`).** Classical instead of sci-fi: fluted Ionic columns on
  plinths (instanced), a gilded entablature, a coffered barrel vault with rosettes and oculi every other bay, an ivory
  marble floor with a red porphyry runner and gilt fillets, the floor level with the rooms', and the far end's light as a
  haze that thickens down the gallery. Everything repeats every bay (1.7 m), so the colonnade, the coffers and the inlay
  shift with the flow (wrapped every two bays) and the moving parts are clipped at the doorway. One shader lights it
  (no lamps out there); it undoes the place's colour grade (the house look multiplies blue by 3.4 to cancel the
  lamplight; to the power .75, so the marble stays ivory).

## Round 17: lag at the root (measured on an AMD Radeon 610M), the iris, the door

Measured on the device itself (Radeon 610M via ANGLE/D3D11) with GPU timer queries, long-task observers and CPU profiles.

- **GPU class** (`js/gfx/tier.js` `classifyGpu`): "AMD Radeon" used to match the discrete rule, so the weakest
  integrated GPU ran at 'high'. Integrated GPUs now start at 'low'; `tame()` makes 'low' really cheap (refraction ->
  see-through glass, no clearcoat/sheen/iridescence/anisotropy, two lights besides the shadow caster with their energy
  folded into an ambient fill, hard PCF shadows at most 1024 px, updated every other frame).
- **GPU governor** (`renderer.pollGpu`): EXT_disjoint_timer_query_webgl2 times the composer each frame. Over 17 ms the
  level steps down (remembered per GPU), at 'low' the pixel ratio falls to .5; under 6.5 ms for three windows it climbs
  back. The old CPU frame-time rule could not see GPU cost. Title at 1920x1080: median frame 39.6 -> ~15 ms. Storm
  glass: 58.6 -> 16.7 ms.
- **Prewarm** with no variants compiled nothing; it now compiles the scene in ~25 ms slices (`compileSliced`) and waits
  for parallel compiles. Title first frames: 1152 -> 31-100 ms.
- **Room switch order**: the reflection probe (`P.finish`, which sets `scene.environment`) used to run after the
  prewarm, so every lit program recompiled synchronously in the first frame. Probe first, then prewarm. Hall -> room:
  long tasks 762+1385+3981 ms -> 918+463+213 ms; veil 2.3 s. Room -> hall: veil 1.0 s, one 301 ms task, then median
  13.4 ms frames.
- **Sketches**: async compile + async pixel read, a persistent cache keyed by content hash and size, drawn only near
  the viewport and in idle time. Opening a scroll: no long tasks (was 337+1583+174 ms).
- **Iris** (`uIris` in the grade shader, `App.iris`): Continue / New / Back to title close the screen from the edges
  to black and open it again from the centre. Entering from the title starts in the gallery before closed doors that
  swing open, walks through, and closes them behind.
- **Maps**: leader lines start on the ring around each icon, not at its centre.
- **Title showcase** loads rooms through `app.loadRoom`, so seed upgrades apply (the newest dioramas).

## Round 18: free models, a fade through black, one lens through the tunnel

- **Three AI engines** (docs/FREE-MODELS.md): *Claude directs*, *Claude + free models*, *free models only*, chosen in
  the AI panel (js/ai/aipanel.js; the sparkle button under the graphics button). `askJSON` (js/ai/claude.js) takes a
  `role`: the director's requests (a chapter's chain, a diorama's plan and critique) go to Claude in the hybrid mode,
  the worker's (coverage, repairs, figures, domain compile, diorama authoring, expansions) to the free pool; each
  stands in for the other at its limit. tools/test-engines.mjs checks the routing (15 checks, mocked providers).
- **The free router** (js/ai/free.js): live model lists, a ranking for long exact JSON, per-model budgets learned
  from 429s (minute and day, reset headers, 00:00 UTC), validation with one named retry, a 30-day answer cache, and a
  wait for the earliest reset instead of a failure. Keys stay in localStorage.
- **Measured from a page on the test laptop, no key at all:** OVHcloud's Qwen3.5-397B wrote the test chain (7 steps,
  0 quality-gate issues, 106 s); the full pipeline on a test part (chain → coverage → gate → figures → domain
  compile) ran in 6 min 9 s on OVHcloud alone (gpt-oss-120b wrote the chain after Qwen's answer failed to parse;
  6 correct steps, 18 figure slots, one plot without axis titles); a diorama (mass on a spring) was planned and
  authored by Qwen3.5-397B (the full version failed the scene check, the simpler one passed: 5 bodies, 3 lessons,
  params and readouts) in 2 min 41 s and ran without errors. LLM7 and Pollinations answer without a key but only
  with small models and tight limits (Pollinations: one reply per 45 s, short answers). Keyed providers (Gemini,
  Groq, Cerebras, Mistral, OpenRouter…) answer cross-origin from the page; their writing is tested by the panel's
  "Test the free models" once a key is entered.
- **Inside claude.ai the free engines cannot run**: the Artifact's page may not call outside addresses (tested in the
  published artifact: every provider unreachable). The panel says so; hybrid then uses Claude for all, free-only
  falls back to copy-and-paste. Standalone (Launch Scriptorium.bat → localhost:8000, or raw.githack.com) they work.
- **Title showcase**: each diorama darkens over the last quarter of its shot (grade uniform `uDim`, edges slightly
  ahead), the change happens in black, the next comes up out of black (1.6 s). No frozen frame.
- **Arrivals keep one lens**: the walking view's 68° lens used to snap on in the first free frame after a flight
  (50°/55° during it). `nav.lensFov()` is now the last key's target and the flight eases to it; the tunnel cut uses
  one lens on both sides (62°). Largest per-frame change measured: 0.05°.
- **Polish gate 12/12**: sign badges clear of edge labels (loops.js: labelled edges get room, badges slide along
  their curve), wrapped lines 1.28 em apart, axis titles inside the figure, the camera's cut name steps below the
  step cue.
