# Architecture

## Modes

`js/main.js` owns one WebGL renderer and switches between three **modes** with a warm fade. Each mode has `update(dt, t)` and `dispose()`.

| Mode | File | Scene |
|---|---|---|
| Hub | `js/hub/hub.js` | the library room: bookcases, scroll-books, furniture |
| Book room | `js/room/room.js` | one book: wall scrolls, pedestals with card models, reading overlay (`reader.js`) |
| Diorama | `js/dio/engine.js` | one diorama with its HUD |

## Rendering (`js/gfx/renderer.js`)

The post chain follows Weatherglass's miniature look:
- a RenderPass into a half-float target with 4× MSAA;
- an OutlinePass, used for selection;
- UnrealBloom (0.32, 0.55, 0.86);
- an OutputPass with AgX tone mapping;
- a grade pass for vignette, grain, warm lift and the fade between modes.

Shadows are soft (PCF). Resolution adapts to keep frames under about 22 ms. Environment lighting comes from a pre-filtered RoomEnvironment map. All textures are drawn in code (`textures.js`). Materials come from about 40 PBR presets (`materials.js`).

Diorama realism (v4):
- **Textures** (`js/gfx/proc.js`): seamless procedural wood, brushed metal, cast iron, paper, felt and marble sets with colour, normal and roughness maps; painted cloud banks and hill silhouettes; `alignUV()` gives world-scale UVs so grain runs along each part.
- **Materials** (`materials.js`): every preset is physically based. Vessels and cases are *thin-shell* glass (reflection only, edge-weighted), because three.js transmission renders only opaque objects and a transmissive flask would hide its water. Water, liquids, ice, gel and solid glass *do* use transmission (IOR, thickness, tinted absorption). While the drawing is showing, a shader hook flattens normal maps and removes clearcoat and sheen; each hook variant has its own shader define so compiled programs are never mixed up.
- **Lighting** (`js/dio/environments.js`): key, fill, rim and kicker lights per preset; the studio key is a spotlight with a fitted 2048 shadow map. Real-time contact shadows are rendered from below into a 512² target, blurred, every other frame.
- **Per-scene look** (`gfx.applyLook`): contrast, saturation, vignette, a subtle tilt-shift, exposure and bloom; `gfx.envFor(kind)` gives each preset its own reflection environment.
- **Shot hints**: `DIO.<model>.shots = {'<lowercase event-text substring>': {target, dist}}` tells the director where to point the camera for an event.

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
  - either a **built-in model** (`models.js`, 17 ported physics models running through an adapter) or a **scene spec** (`builder.js`: about 60 shapes and macros);
  - the code API, declarative behaviours, and user edits (overrides and additions).
- Actors come from `D.label` (built-in models), from `role:"actor"` bodies, or from `api.label`. Unlabelled objects are decor.
- `js/dio/engine.js` (`DioramaView`) runs the stages:
  1. **sketch**;
  2. **materialise**;
  3. **tour**: one actor per wheel step or arrow key, the camera flying on a lifted arc, each name pinned once introduced;
  4. **explore**: a foldable left panel with step-by-step lessons (each needs Play before the next appears, and finished ones stay readable), variables, and objects.
- The **edit tool** raycasts any object and climbs to its root. It shows an OutlinePass and TransformControls, with actions to move, rotate, scale, hide, remove, replace or ask AI. Edits persist into the spec: as body fields for scene specs, or as `overrides` keyed by object path for built-in and code-made objects. Positions on moving objects are applied as offsets after the simulation's own update, so the dynamics keep working.

## Library and rooms

- Library meta lives in IndexedDB (`library.v3`); rooms in `room:<bookId>`; PDF blobs in `pdf:<bookId>`.
- Bookcases snap flush to the nearest wall. Books take free slots, top tier first.
- Rooms lay out stations along the perimeter, starting with the left wall, and grow when the parts don't fit.
- The pedestal miniature is the real diorama world, scaled down, with every material forced to card (`uFrontR = -∞`) and ink added. That is the card-model look.
- PDF ingestion (`js/ai/ingest.js`) tries the outline, then headings, then the contents page, then fixed windows. It strips running headers and footers and rejoins hyphenated words.

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
  - Each beat has a camera shot: a push-in to the subject's bounding sphere with a slight change of azimuth, then a slow drift.
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

## Extending

- **New built-in model:** add `DIO.<name> = {params, build(D, p)}` in `models.js`, call `D.label` for actors and `D.event` for events, and list the model in `prompts.js` → `BUILTIN_TYPES`.
- **New shape or macro:** add a case to `buildShape` in `builder.js` and list it in `SCENE_SPEC`.
- **New environment:** add a case to `setupEnvironment`.
