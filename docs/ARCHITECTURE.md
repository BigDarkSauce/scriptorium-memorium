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
