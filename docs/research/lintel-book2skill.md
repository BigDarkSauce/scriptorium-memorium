# Research report: Lintel ("Top->Down" flat 2D to 3D) and book-to-skill

Date: 2026-11-03. Both repositories were cloned with `git clone --depth 1` and read as untrusted data. Nothing in them was executed.

- Lintel: https://github.com/Sam1983Aing/lintel-flat-2d (HEAD `c6029d9`, 28 Oct 2026), local copy `/tmp/claude-0/-home-claude/c61ae887-f2bc-5616-8c17-4937082f620d/scratchpad/src/lintel`
- book-to-skill: https://github.com/virgiliojr94/book-to-skill (HEAD `7540eef`, 28 Oct 2026), local copy `/tmp/claude-0/-home-claude/c61ae887-f2bc-5616-8c17-4937082f620d/scratchpad/src/book2skill`

Terms used below:
- **Clipping plane**: a plane given to the renderer. Every pixel on one side of it is thrown away before it is drawn.
- **Section cut / plan cut**: how architects make a floor plan. They slice the building horizontally at about 1.2 m and look straight down.
- **Poché**: the solid black fill architects put inside a cut wall.
- **Dolly zoom**: the camera moves closer while the lens widens (or the reverse), so the subject stays the same size on screen while perspective changes.
- **FOV (field of view)**: the angle the lens sees. 3° is an extreme telephoto with almost no perspective. 50° is a normal lens.
- **`frame`**: Lintel's name for the width in metres that fills the view. Distance = frame / (2·tan(fov/2)).
- **vh**: 1% of the viewport height. Lintel measures scroll distance in vh.
- **onBeforeCompile**: a three.js hook that lets you edit a built-in material's GLSL before it compiles.

---

## Part 1. Lintel (Casa Serra), the "Top->Down" technique

### 1.1 What the repo is

Lintel is the landing page for an imaginary architecture studio. It is built with three.js r160 (classic script build), GSAP 3.13 with ScrollTrigger, and Lenis 1.1.14. There is no build step and there are no 3D model files. Everything is generated in code: the house, its furniture (`staging.js`, 5,822 lines in v10), its procedural GLSL materials (`code-materials.js`, 5,212 lines) and the sky (`code-sky.js`).

Layout:
- `001 Lintel/v10/` is the final version (21 Oct 2026). `v1/` to `v8d/` are earlier versions, each frozen when it was signed off.
- `shared/` holds the engine: `fx-core.js`, `fx-experience.js` (the scroll film), `fx-post.js` (post-processing with ink and paper), `fx-ink.js`, `fx-paint.js`, `ENGINE.md`. v10 carries its own copy.
- `teach/` holds the course material: the technique cards (`lintel-3/02-techniques.md`), four small standalone demos (`lintel-3/demos/*.html`), the prompt ladder (`lintel-4/03-prompt-ladder.md`), a run of the starter prompt by a fresh agent (`lintel-4/starter-run/`, a compact implementation of about 1,200 lines), and long logs (`journal.md`, `session-log.md`, `decisions.md`).
- `brief-*.md` files are hand-off briefs between sessions. `GEMINI.md` holds the rules for the Gemini phase. Claude Code (Opus 5.5) built it up to v8c, and Gemini carried it on to v10.
- **License: the repo has no LICENSE file.** By default that means all rights reserved. The ideas below can be reimplemented freely, but the code should not be copied verbatim.

There are no files called `PROMPT.md`. The prompts are in `teach/lintel-4/03-prompt-ladder.md`, `teach/lintel-4/starter-run/README.md`, the briefs, and `GEMINI.md`.

### 1.2 What the visitor sees, step by step (v10)

1. **Loader.** A "Dark Studio Workstation": a walnut desk drawn in the post shader (`deskSurface`), with four live counters.
2. **Paper roll-out.** A cylinder of paper rolls across the desk (`deskUnroll`) and leaves an A-101 blueprint sheet tilted by -3° (`cardScale 0.62`, `cardRot -0.052`, `cardCenter [0.655, 0.49]`). The sheet *is* the 3D render. The post shader frames it as a card on the desk. Over the first 64 vh of scroll the card grows to full screen (`deskExpand = easeInOut(span(s,0,64))`, `cardScale 0.685→1`, `cardRot -0.048→0`).
3. **The sheet at rest.** You see a 1:200 floor plan: ink walls, room names, dimensions, hatching. Nothing moves. Grain, depth of field, camera drift and pointer parallax are all off. The authors measured 0.000 change between frames at rest.
4. **"The lens opens."** On scroll the sheet tilts, and the walls grow out of it. Technically, three things happen together:
   - the camera's pitch goes from 89.4° to 64°;
   - the lens widens from 3° to 36° while the camera comes closer, so the house keeps its size (dolly zoom);
   - the clipping plane rises from 1.2 m to 3.52 m, just under the ceilings. This is what makes the walls "rise".
5. **Approach and door.** A low glide over the forecourt (fov 44°), then the camera stops at the pivot door (fov 50°). The door swings along its drawn arc. The world outside turns from ink into material.
6. **The walk.** The camera walks at eye height through the entrance, living room, kitchen and dining, wine room, patio and olive, a 24 m glass gallery, the bedroom, dressing room, bath and garden. Each room stays an ink drawing until the camera reaches it. Then its materials are "laid" piece by piece, each piece with a brief orange outline. In the entrance the roof lifts off. The camera rises to a plan of the living room (fov 4°), then drops into it.
7. **Ending.** v10 holds on the built entrance facade, then a consultation finale. Earlier versions lifted back to the top view, and a roll of paper wiped the house back into the first sheet. The last frame matched the first frame to within 0.1 of a grey level out of 255.
8. **Time of day.** A switcher offers Morning, Noon, Golden (the default) and Night.

### 1.3 The key insight: the plan is a cut, not an extrusion

The house is never extruded from 2D. The full 3D house exists from the first frame. The "2D drawing" is that house, sliced by one renderer-wide clipping plane at 1.2 m and seen through a 3° lens from about 1.2 km away. The "rise" is that clipping plane moving upward while the camera tilts and the lens opens. The author's rule, from the starter prompt: *"The floor plan is not a picture. It is the real 3D model, cut at about 1.2 m and seen from straight above through a very long lens. The drawing and the building are the same thing."*

The minimal demo (`teach/lintel-3/demos/section-cut.html`):

```js
const CUT = 1.2, LENS_FLAT = 3, LENS_OPEN = 40, TILT_OPEN = 56, WALL_H = 2.8;
const LID_DROP = 0.004;   // the lid rides this far under the cut. Exactly at the cut, the plane would slice it off too
const FRAME = 6.4;        // metres from the middle of the plan to the top of the frame, the same at every lens
const cutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), CUT);
renderer.clippingPlanes = [cutPlane];
camera.up.set(0, 0, -1);  // north is up on the sheet

// a wall: outside plaster, inside ink (BackSide), no bottom face, plus a flat ink "lid" the size of its footprint
const faces = (m) => [m, m, m, null, m, m];
scene.add(new THREE.Mesh(geo, faces(outside)), new THREE.Mesh(geo, faces(inside)));
const lid = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x0 + w / 2, 0, z0 + d / 2);

function frame() {
  const e = open * open * (3 - 2 * open);                 // smoothstep
  cutPlane.constant = cut;
  lids.visible = cut < WALL_H;                            // above the walls there is nothing to close
  lids.position.y = cut - LID_DROP;
  const lens = LENS_FLAT + (LENS_OPEN - LENS_FLAT) * e, tilt = TILT_OPEN * e * Math.PI / 180;
  const dist = FRAME / Math.tan(lens * Math.PI / 360);    // dolly zoom: keep the frame constant
  camera.fov = lens;
  camera.position.set(0, Math.cos(tilt) * dist, Math.sin(tilt) * dist);
  camera.near = Math.max(0.5, dist - 40); camera.far = dist + 40;   // tight depth range from far away
  camera.lookAt(0, 0, 0); camera.updateProjectionMatrix();
}
```

The knobs and why they have those values (from `02-techniques.md`):
- **Cut height 1.2 m.** It passes through the windows and above the furniture. Lower, and the windows vanish. Higher, and the cut slices the door heads.
- **Lens 3°.** At 10° the walls near the edge of the sheet start showing their sides.
- **Lids (poché).** Without lids, the "ink" was only whatever the camera happened to see inside the hollow walls. The result flickered as the view tilted. Adding lids cut the flicker score at the first scroll from 2.65 to 0.51.
- **Roofs.** The cut waits just under the ceilings until the camera is below every roof. Otherwise the cut sweeps through roof slabs and you see their hollow insides.

**Production (v10 `scene.js` ≈ line 4020).** The cut is a function of scroll and of camera height:

```js
const rise = FX.smooth(span(idx, 0.18, 0.9));               // idx = fractional camera-key index (hero=0, lens=1)
const land = camY < 3.55 ? FX.smooth((3.55 - camY) / 1.0) : 0;
const inside = FX.smooth(span(s, at('door','h1') + 45, at('hall') - 5));
cut = inside >= 1 ? OFF : inside > 0 ? FX.lerp(5.25, 5.3, inside)
    : FX.lerp(1.2, 3.52, rise) + 1.73 * land;               // 1.2 -> 3.52 (just under ceilings), then over the canopy
cutPlane.constant = cut;
capMeshes.forEach((m) => { const c = m.userData.cap;          // lids grouped by height range
  m.visible = cut < OFF && cut > c[0] + 0.01 && cut < c[1] - 0.005;
  if (m.visible) m.position.y = cut + 0.001; });
```

`OFF = 1e5` switches the cut off once you are inside. Later the cut comes back for the "roof lifts off" climb to the living-room plan: it goes 5.3 → 3.52 → 5.3.

### 1.4 Camera and timing: the engine (`shared/fx-experience.js`)

**Keys.** The camera path is a list of keys. The v10 opening keys:

```js
{ id: 'hero', t: [1.0, 0, -2.1], yaw: 0, pitch: 89.4, fov: 3, frame: 61.5, hold: 24, go: 115 },
{ id: 'lens', t: [-14.75, 0, -4], yaw: 0, pitch: 64, fov: 36, dist: 46, go: 90 },
{ id: 'approach', t: [-14.75, 2.6, 2], yaw: 0, pitch: 13.6, fov: 44, dist: 12.35, go: 78 },
{ id: 'door', t: [-14.75, 2.2, -2.5], yaw: 0, pitch: -3, fov: 50, dist: 11.5, hold: 58, go: 85 },
```

Some numbers that follow from these keys:
- The hero distance is 61.5 / (2·tan 1.5°) ≈ 1,174 m.
- The `lens` key's frame is 2·46·tan 18° ≈ 29.9 m.
- `hold` is the scroll length (in vh) that the camera rests on a key. `go` is the scroll length of the travel to the next key.

**How a camera position is computed each frame:**
- **Log space.** Each key stores `lf = ln(fov)` and `lfr = ln(frame)`. A 3° → 36° change is a factor of 12. Interpolating in log space gives an even zoom feel across that range.
- **Catmull-Rom.** Every channel (target x, y, z, yaw, pitch, roll, lf, lfr) is interpolated through the keys with a Catmull-Rom spline (a smooth curve that passes through every key).
- **Placing the camera.** `dist = frame / (2·tan(fov/2))`. The camera is placed by yaw and pitch around the target `t`. It sets `near = clamp(dist·0.02, 0.05, 30)` and `far = max(2000, dist·6)`.
- **Ease between rests.** `mapScroll` applies a cosine ease between two "hold" keys: `e = 0.5 - 0.5·cos(π·f)`. Keys without a hold are waypoints the path bends through.
- **Camera weight.** The camera trails the scroll: `sD += (s - sD)·(1 - exp(-dt·camWeight))` with `camWeight = 9`. This is what gives the motion its "heavy" feel.
- **Push at a stop.** At a rest the camera pushes in by 5% (`lfr += ln(1 - 0.05·push)`) and drifts 1.2° in yaw.
- **Lenis.** Smooth scroll uses `easing: t => min(1, 1.001 - 2^(-10t))`, `wheelMultiplier 1.08`, and is driven by `gsap.ticker`. Programmatic jumps use `1 - (1-t)^3.6` over 2.5 s.
- **Easing helpers** (`fx-core.js`): `smooth = x²(3-2x)` and `easeInOut` = cubic in-out.

**The compact rig from the starter run** (`teach/lintel-4/starter-run/result/js/rig.js`). This version is simpler and easier to lift. The page is a function of scroll progress `s` from 0 to 1:

```js
export const STOPS = { sheetEnd: 0.06, liftEnd: 0.34, landed: 0.58, walk: 0.64, end: 1 };
const early = (t) => 0.5 * io(t) + 0.5 * (1 - (1 - t) * (1 - t));   // tip early so walls are seen rising
const elev = track([[0, 90], [s1, 90], [s2, 33, early], [s3, 0, io]]);
const fovL = track([[0, L(T(2))], [s1, L(T(2))], [s2, L(T(4.6)), io], [s3, L(T(fovWalk)), io5]]); // log(tan(fov/2))
const frmL = track([[0, L(F0)], [s1, L(F0)], [s2, L(46), io], [s3, L(landFrame), io5]]);
const cut  = track([[0, 1.2], [s1 + 0.01, 1.2], [s2, 2.64, io], [0.455, 2.69, lin], [0.555, 5.4, io]]);
// io = smoothstep, io5 = quintic smootherstep, fovWalk = 50 (58 if aspect<1.5, 76 portrait)
```

The order of events in this rig:
1. The sheet holds for the first 6% of the scroll.
2. Over the next 28% the camera tips from 90° to 33° (eased so the tilt starts early), and the cut rises to 2.64 m.
3. By 0.555 the cut has reached 5.4 m, above every parapet, so the roofs close in.
4. The camera lands at 0.58 and walks from 0.64.

Two more details: the walk uses a monotone cubic `glide()` so the pace never stops dead, and fog goes from 4000/9000 m to 26/92 m as the camera lands.

### 1.5 Drawing to material: the data model and the "scan"

**Data model** (v10 `scene.js`):
- `ROOMS` is a table of rectangles in plan metres: `{ id, r:[x0,y0,x1,y1], name, label:[x,y], h (default 3.6, living 4.5, entrance 4.8), floor, walls:{N,E,W}, clerestory, outdoor }`.
- `OPEN` lists the openings in the walls: `{ axis:'h'|'v', c, a, b, type:'open'|'door'|'glass'|'pivot', head, into, hinge, panes }`.
- Walls are generated along grid lines with these openings cut out. Lids are collected while the walls are built.
- `KEYS` is the camera path. `DOSSIERS` are the labelled stops.

**Per-room reveal.** Every material goes through `drawable(mat, hatch, opts)`, which patches its shader with `onBeforeCompile`. The patched shader:
- computes the world position and which room the pixel is in;
- reads that room's reveal value from a uniform array `uRV` (0 = drawing, 1 = real);
- outputs either paper and hatch (writing alpha = 1 as a "still drawing" flag for the post pass) or the real lit material.

From the scan demo:

```glsl
float room = roomOf(worldPos); float rev = uRev[int(room)];
vec3 cell = floor(worldPos / PIECE);                          // slab or panel, PIECE = 1 m
float t = mix(depthIntoRoom(cell), hash(cell), 0.25) * (1.0 - BAND);  // the moment this piece lands
float real = step(t, rev);
float fresh = real * (1.0 - smoothstep(0.0, 0.14, rev - t));  // orange outline for 0.14 reveal units
color = mix(paperAndInk, color, real); color = mix(color, ORANGE, fresh * outline);
```

On the JavaScript side, each room's reveal is a window of scroll around its camera stop:

```js
const living = ease(span(s, at('living') - 68, at('living') + 14));
```

The rule: what is beside and behind you is real, and everything ahead stays a drawing, even through glass. Rooms the walk never enters turn real together with a neighbour.

**Ink lines are a post-process.** They are not geometry. `fx-post.js` reads a prepass of normals and depth. It draws a line where the normals change sharply (`smoothstep(0.35,0.8,nd)`) or where the second derivative of depth jumps (`smoothstep(0.01,0.03,zl)`).
- The second derivative is used instead of the first, so a floor seen at a grazing angle stays clean.
- In telephoto mode (`inkTele`) a depth step is judged against the size of one pixel at that depth. That way a table seen from 1 km away still gets its outline.
- `P.zBase` re-centres depth precision on the nearest visible point. Without that, depth was only good to 7 cm on the plan, and small outlines blinked.
- Paper regions get fibre noise and hatching.
- The starter run uses a simpler alternative: build the house as a watertight solid and paint back faces ink (`!gl_FrontFacing → uInkCol`). Then the cut shows solid black walls with no extra lid geometry.

### 1.6 Lighting, shadows and finish

The sun (v10 `scene.js` ≈ line 2976):

```js
const sun = new THREE.DirectionalLight(0xffe2bc, 6.2);
const EL = 32 * Math.PI / 180, AZ = Math.atan2(0.37, -0.93);   // west-south-west at 32 degrees
sun.position.copy(sd).multiplyScalar(140).add(new V3(1, 0, 1));
sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
sc.left = -44; sc.right = 44; sc.top = 40; sc.bottom = -40; sc.near = 40; sc.far = 300;
sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;   // static scene: redraw only when needed
hemiLight = new THREE.HemisphereLight(0xefebe4, 0xd8c3a6, 0.5);
```

- The engine uses `PCFSoftShadowMap`, sRGB output, and a post "Finisher" with ACES tone mapping, AO, bloom, depth of field, grain and vignette.
- **One-number light** (`light-options.js`). A table `HOURS` gives the sun colour, power, hemisphere intensity, exposure, haze and lamp strength at five sun elevations (44, 32, 20, 12 and 5°). The code blends between two rows. `elAt(clock)` turns a time of day into a sun elevation. So a "look" is only a clock time: morning 7.75 h, noon 13.25 h, plus golden and night presets.
- When the sun moves, `placeSun` refits the shadow box: `bottom = -(46·sin e + 1.5)`, `top = 46·sin e + 11·cos e + 1.5`. This keeps the shadow edge equally crisp at a low sun.
- **`capSky` with SUN_CAP = 6.** The HDR sky's own sun is capped at 6× the sky's mid brightness. Otherwise the sun is in the scene twice (once as the light, once as an unshadowable bright spot in the sky map), and polished floors mirror it straight through walls.
- Lamps share four pooled point lights, handed out by weight, so no light ever pops on or off.
- Shaders are precompiled under the loader (`renderer.compileAsync`). Before that, a first visit took 57 s to become ready.
- The pixel budget is fixed: 5.6 megapixels while the view is a drawing, 3.4 on the walk.

### 1.7 The prompts and the stated principles

**The starter prompt** (`teach/lintel-4/03-prompt-ladder.md`, step 1), verbatim apart from the [brackets]:

> I want to build a scroll-driven landing page for [subject]. The idea: the page opens on a flat floor plan, like a sheet an architect prints. Black ink on paper, room names, dimensions. Nothing looks 3D. When the visitor scrolls, the walls rise out of the drawing, the camera comes down to the front door and walks through [rooms] at eye height. Each room stays a line drawing until the camera gets there, then the real materials sweep across it.
> What I care about: The floor plan is not a picture. It is the real 3D model, cut at about 1.2 m and seen from straight above through a very long lens. The drawing and the building are the same thing. The camera travels deep into the space, room after room. It does not orbit the building from outside. It should feel like [ambition]. three.js, GSAP ScrollTrigger and Lenis, plain files, no build step. Free CC0 materials.
> Before you write any code, propose the layout of the building with sizes I can picture, and the camera path stop by stop. Give me two or three directions to choose from and wait for my answer. Then build in checkpoints. First checkpoint only: the plan sheet, the walls rising, and the walk to the first room. Record it and show me before you go further.

**The ladder's next six steps:**
2. "Make it premium. Give every size with an everyday comparison."
3. "Travel along Z, don't orbit."
4. "The scan follows the camera. Show 3 fill options as recorded demos."
5. "Review with scores out of 10. Reach 8."
6. "Use an outside reviewer who sees only my words and the stills. Measure blinking with frames and a number."
7. "Open and close on one physical gesture from the subject's world (the roll of paper)."

**What the author says about the process.** About 70 prompts over two weeks and four iterations: "there isn't one prompt… it's a conversation with checkpoints." A fresh agent ran the starter prompt once: about 83K tokens for turn 1, about 407K for checkpoint 1.

**Stated rules** (`brief-iteration-4.md`, `GEMINI.md`):
- The scan follows the camera.
- No blinking: the plan reads 0.000 at rest, measured with `tools/flicker.mjs`.
- No fill that reads as a growing circle.
- Start and end on the same drawing.
- Nothing floats: every object has a contact shadow.
- At least 8/10 in every category, scored by an outside reviewer on stills.
- Keep the options behind URL switches (`?light=`, `?fill=`, `?hero=`, `?look=`).
- Freeze every signed-off version into its own folder.
- Visual over text: show recorded options, not lists.
- Trust measurements (`probe.mjs`, `flicker.mjs`).
- A style rule for all writing: no em dashes or semicolons.

---

## Part 2. book-to-skill

### 2.1 Identification

`gh search repos book-to-skill` returns **virgiliojr94/book-to-skill** first: "Turn any technical book PDF into a Claude Code skill." It is the project that third-party lists and trend posts point to (TopDeepLearning lists about 8.6K stars). It is also vendored into other repos (`.opencode/skills/book-to-skill`, `majiayu000/claude-skill-registry`).

- **License: MIT** (`LICENSE.md`, "Copyright (c) 2025 virgiliojr94").
- It is also on PyPI as `book-to-skill`, but only the extractor CLI is published there.

Other repos with similar names, not cloned: `apple-ouyang/book-to-skill` (Chinese, "books into executable skills"), `zhimaAi/BookToSkill` (JSONL knowledge index plus retrieval helper), `kitchen-engineer42/pdf2skills`, `sebastianhaba/book-to-course-skill`, `kangarooking/cangjie-skill`.

### 2.2 Architecture: two halves

1. **A deterministic Python extractor**, `scripts/extract.py`, which calls `book_to_skill/cli.py` and `utils.py`. It writes `<tmp>/book_skill_work/full_text.txt`, which holds all sources merged, each separated by a `====…\nSOURCE: <file> (Path: …)` banner. It also writes `metadata.json`, with these fields:
   - per source: `filename`, `format`, `pages`, `pages_label`, `words`, `chars`, `estimated_tokens`, `extraction_method`, `fallback_reason`, `images_dropped`;
   - structure: `chapters_detected`, `chapters_method` (numeric, structural or none), `chapter_headings_sample` (the first 10), `has_toc`.
2. **A spec-driven generator.** This is the agent following `SKILL.md` (55 KB, Steps 0–11).

### 2.3 How a PDF is turned into text

The PDF parser is `book_to_skill/parsers/pdf.py`.

**Before extraction:**
- **Scan check.** `looks_image_only()` runs `pdftotext -f 1 -l 5`. If the first five pages contain no text, it fails fast and tells the user to run `ocrmypdf`.
- **Optional quality hook.** If the Firecrawl `pdf-inspector` package is installed, its Markdown output is trusted only when four conditions all hold: the PDF is classified `text_based`, confidence is at least 0.90, no pages need OCR, and there are no encoding issues.

**Extraction, by the content type the user chose in Step 1.5:**
- **Technical books:** Docling, with layout-aware Markdown, tables and code blocks, no OCR. It takes about 164 s for a 103-page book versus 0.1 s for pdftotext, and it recovers 48 tables and 36 code blocks.
- **Text books:** `pdftotext -layout -enc UTF-8` first, then pypdf (pages joined with `\f`), then pdfminer.

**Cleaning** (`clean_pdftotext`). The input is split into pages on the form-feed character (`\f`). Then:
1. Count the first and last non-blank line of every page.
2. A line that appears at a page edge on more than half of all pages is treated as a running header or footer. It is removed, but only at page edges, so a real mid-page heading that repeats the running title survives.
3. Bare page numbers at page edges are removed: Arabic `\d{1,4}`, or a canonical Roman numeral from 1 to 99. The regex is exact so that words like "MIX" and "CIVIL" are not deleted.
4. Words split by a hyphen at a line end are joined: `(\w)-\n(\w) → \1\2`.

Other steps: page count comes from `pdfinfo`, then pypdf, then by counting `\f` characters. `sanitize.py` strips zero-width characters and the Unicode tag block, and folds Kangxi radicals into ideographs.

### 2.4 How chapters are detected (`utils.detect_structure`)

This answers the question exactly: **it does not use the PDF outline (bookmarks), and it does not record page ranges.** After cleaning, page boundaries are thrown away. Chapters are found by heading heuristics over plain text, and the result is only a *count plus a sample*. The actual slicing is done later by the agent.

**Path 1, numeric headings.** The extractor scans every line outside fenced code blocks with `_EXPLICIT_CHAPTER`:

```
^\s*(?:chapter|unit|lesson|module|lecture|part|chapitre|kapitel|cap[ií]tulo|capitolo|hoofdstuk|chương|ch\.?)\s*(?:(\d{1,2})|(?P<roman>[IVXLCDMivxlcdm]{1,7}))\b(?P<rest>.*)$
```

It then rejects prose with three guards:
- **The tail after the number** must be end of line, punctuation, or a word that starts with a capital letter (`_HEADING_TAIL`). "Chapter 6 explores…" is a cross-reference, not a heading.
- **Period tails.** A tail like "Chapter 4. References are…" counts only if it is at most 8 words and the line above ended a sentence.
- **Numbers above 99** are rejected (this drops years).

It also matches:
- Roman-numeral heads such as "II. The Carpet-Bag";
- about 20 other scripts (Chinese 第N章, Korean 제N장, Russian Глава, Hindi, Persian, Hebrew, and more);
- Markdown `##` prefixes, which Docling produces.

Chapters are counted as *distinct numbers*, so a table-of-contents entry and the body heading count once. Lines matching "Part N" are kept apart so they do not compete with chapters.

**Path 2, structural headings** (used when fewer than 2 numeric headings are found). It collects ATX headings (`#`, `==`) and setext/RST underlines. It skips:
- front and back matter (Preface, Foreword, Index, Bibliography, Appendix, …);
- titles made only of punctuation.

It then picks the shallowest heading depth that has at least 2 distinct titles. Digit-led titles ("## 1. Intro") count only if there are at least 3 of them and the median body per section is at least 200 characters. That threshold separates tutorial steps (about 20 characters) from real sections (500 to 5,000).

**TOC flag.** `has_toc` is true when a line in the first 30K characters is a "Contents" heading. Multilingual variants are matched (目录, Índice, Inhaltsverzeichnis, …).

**Known limits** (from the docs). Pro Git (section titles only) and Moby-Dick (Roman-numeral chapter titles) do not auto-segment. The user or agent then points at sections manually.

### 2.5 How the agent splits and writes the skill (`SKILL.md`)

1. **Step 2.5.** Show a cost estimate and wait for the user. Input ≈ `estimated_tokens × 1.3`. Output ≈ chapters × budget + 4,000 + 4,500.
2. **Step 2.6.** For books over 50K tokens, use "REPL-style" access: treat `full_text.txt` as a corpus to query, not something to read whole. The agent finds chapter offsets with `grep -n -E "^\s*(Chapter|CHAPTER)\s+[0-9]+"`, pulls slices with `sed -n 'start,endp'`, and checks claims with `grep -c`. **So the chunk boundaries are line numbers in the text file, found at run time.**
3. **Step 3.** Read the first 8,000 characters and the TOC to get the title, author and chapter list.
4. **Step 4.** Ask the user's purpose. This sets `DEPTH` to reference or study.
5. **Step 7.** Write one file per chapter, `chapters/chNN-<slug>.md`. The template sections are: Core Idea, Frameworks Introduced, Key Concepts, Mental Models, Anti-patterns, Code Examples and Reference Tables (technical books only), Worked Example (study depth only), Key Takeaways, Connects To. The token budget per chapter:

| | reference | study |
|---|---|---|
| text | 800–1,200 | 1,000–1,800 |
| technical | 1,200–1,800 | 2,000–3,000 |

6. **Step 8.** Write `glossary.md`, `patterns.md` and `cheatsheet.md`.
7. **Step 9.** Write the master `SKILL.md`, under 4,000 tokens and front-loaded, because compaction cuts from the end. It holds the core frameworks (about 2,000 tokens), a chapter index table linking `chapters/…`, an alphabetical topic index (term → chNN) and the scope.
8. **Step 9.5.** Run the advisory prompt-injection scanner.
9. **Step 10.** Install the skill to `~/.agents/skills/<slug>`, with a symlink from `~/.claude/skills/<slug>`.

**Output tree:**

```
<slug>/SKILL.md
<slug>/chapters/ch01-<slug>.md …
<slug>/glossary.md
<slug>/patterns.md
<slug>/cheatsheet.md
```

**Principles:** density over completeness, practitioner voice ("Use X when Y"), a front-loaded SKILL.md, chapters loaded on demand, never raw text. The token saving comes from progressive disclosure: only `SKILL.md` (about 4K tokens) is in context, and a chapter file is loaded only when the topic index points to it.

### 2.6 Reusing the approach: a chapter splitter with page ranges

The steps below take book-to-skill's strengths (header/footer stripping, chapter regexes, the structural-heading fallback, the summary template, progressive disclosure) and add what it lacks: the **PDF outline** and **page ranges**.

**In a browser with pdf.js:**

```js
import * as pdfjsLib from 'pdfjs-dist';               // pin a version, set GlobalWorkerOptions.workerSrc

async function splitPdf(file) {
  const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const N = doc.numPages, labels = await doc.getPageLabels();    // printed page labels, e.g. "xii", "45"
  // 1. Outline first: the PDF's own bookmarks are the most reliable chapter map
  const outline = await doc.getOutline();
  let heads = [];
  if (outline?.length) {
    const top = pickChapterLevel(outline);               // level whose items look like chapters (>=2, not front matter)
    for (const it of top) {
      const dest = typeof it.dest === 'string' ? await doc.getDestination(it.dest) : it.dest;
      if (dest) heads.push({ title: it.title.trim(), page: (await doc.getPageIndex(dest[0])) + 1, method: 'outline' });
    }
  }
  // 2. Per-page text with font sizes (kept per page, so page numbers survive)
  const pages = [];
  for (let p = 1; p <= N; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    pages.push(toLines(tc.items));                       // group items by y into lines: {text, size: max |transform[3]|}
  }
  stripRunningHeaders(pages);                            // book-to-skill rule: edge line on > N/2 pages, page-number regex
  // 3. Fallbacks when there is no outline: heading regexes and font-size outliers
  if (heads.length < 2) heads = detectHeadings(pages);   // CHAPTER_RE (ported from _EXPLICIT_CHAPTER) + size > 1.35 x body median
  if (heads.length < 2) heads = parsePrintedToc(pages, labels);   // "Title ..... 123" lines mapped through page labels
  if (heads.length < 2) heads = fixedWindows(N, 20);              // last resort: 20-page parts, flagged low confidence
  heads = heads.filter((h) => !FRONT_BACK.has(h.title.toLowerCase())).sort((a, b) => a.page - b.page);
  return heads.map((h, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].page - 1 : N;
    const text = pages.slice(h.page - 1, end).map((l) => l.map((x) => x.text).join('\n')).join('\n\f\n');
    return { n: i + 1, title: h.title, startPage: h.page, endPage: end, printed: [labels?.[h.page - 1], labels?.[end - 1]],
             method: h.method, tokens: Math.round(text.split(/\s+/).length / 0.75), text };
  });
}
```

Points to note:
- **Prefer the outline.** `getOutline()` plus `getDestination` plus `getPageIndex` gives exact start pages. Each chapter ends one page before the next one starts.
- **Font-size outliers.** In `getTextContent`, `item.transform[3]` (or `item.height`) is the font size. A line much larger than the median body size, and short, is a heading candidate. Combine this with the book-to-skill regexes.
- **Two page numbers.** Keep both the physical page index and the printed label (`getPageLabels`), because a printed TOC refers to printed labels.
- **Scanned pages.** If a page has almost no text items, flag it (like `looks_image_only`). Do not invent chapters for it.
- **Summaries.** Send one request per chapter (in parallel, with a token budget per chapter) using the book-to-skill chapter template. Then make one final pass over the chapter summaries to build the index. For very large chapters, summarise in page windows and merge.

**As a Claude skill** (a "pdf-chapters" skill):
- `scripts/split.py`, run with `python -I`, writes `chapters.json` (`[{n,title,start_page,end_page,method,tokens}]`) and one text file per chapter. It uses the same order of attempts:
  1. `pypdf.PdfReader(f).outline` with `reader.get_destination_page_number(item)`;
  2. `pdftotext -f s -l e -layout` per page, then the regex and structural fallback (book-to-skill's `detect_structure` can be imported, since it is MIT);
  3. printed-TOC parsing;
  4. fixed windows.
- `SKILL.md` tells Claude to: run the splitter; show the table of chapters and page ranges for the user to confirm (book-to-skill's "confirm before generating" step); write `chapters/chNN-slug.md` with YAML front matter `pages: 45-78, source_pages_label: "31-64"` and the template; then write a front-loaded index `SKILL.md` that maps chapters and topics to files.
- Keep book-to-skill's safeguards: sanitise invisible Unicode, treat the book as untrusted text, and scan the generated files for injected instructions.

---

## Part 3. Making the top-down technique a reusable engine function

### 3.1 The contract

```ts
type Body = {
  id: string;
  footprint: [number, number][];          // plan polygon in metres, (x, z), counter-clockwise
  holes?: [number, number][][];
  base?: number;                           // metres above ground (default 0)
  height: number;                          // metres
  kind?: 'solid' | 'wall' | 'glass' | 'ground' | 'decor';
  material: { color: number; roughness?: number; metalness?: number; map?: string; opacity?: number };
  zone?: string;                           // reveal group (room)
  label?: string;
};
type SceneDesc = { bodies: Body[]; sun?: { elevation: number; azimuth: number; color?: number; power?: number };
                   paper?: number; ink?: number; accent?: number };
type DioramaOpts = {
  rise?: 'cut' | 'grow';                   // 'cut' = Lintel's honest section; 'grow' = per-body extrusion stagger
  cutPlan?: number;                        // 1.2
  lensFlat?: number; lensOpen?: number;    // 3, 40 (degrees)
  pitchFlat?: number; pitchOpen?: number;  // 89.4, 35 (degrees above horizon)
  yawOpen?: number;                        // 30
  timeline?: { hold: number; tilt: [number, number]; rise: [number, number]; reveal: [number, number]; light: [number, number] };
  revealOrigin?: [number, number];         // where the material sweep starts (a door)
};
interface Diorama {
  group: THREE.Group;
  setProgress(t: number): void;            // 0 = flat sketch, 1 = lit 3D diorama (scroll-scrub)
  play(durationSec?: number): Promise<void>;
  update(dt: number): void;
  dispose(): void;
}
function createTopDownDiorama(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera,
                              scene: THREE.Scene, desc: SceneDesc, opts?: DioramaOpts): Diorama;
```

### 3.2 Code sketch (three.js r160)

```js
const smooth = (x) => (x = Math.min(1, Math.max(0, x)), x * x * (3 - 2 * x));
const quint  = (x) => (x = Math.min(1, Math.max(0, x)), x * x * x * (x * (x * 6 - 15) + 10));
const span   = (x, a, b) => Math.min(1, Math.max(0, (x - a) / (b - a)));
const lerp   = (a, b, k) => a + (b - a) * k;

export function createTopDownDiorama(renderer, camera, scene, desc, o = {}) {
  o = Object.assign({ rise: 'cut', cutPlan: 1.2, lensFlat: 3, lensOpen: 40, pitchFlat: 89.4, pitchOpen: 35, yawOpen: 30,
    timeline: { hold: 0.08, tilt: [0.08, 0.7], rise: [0.12, 0.62], reveal: [0.45, 0.92], light: [0.55, 1.0] } }, o);
  const PAPER = new THREE.Color(desc.paper ?? 0xede8dc), INK = new THREE.Color(desc.ink ?? 0x1d1b18);
  const ACCENT = new THREE.Color(desc.accent ?? 0xe8591a);
  const group = new THREE.Group(); scene.add(group);

  // ---- bounds, used for the camera frame and the shadow box
  const box = new THREE.Box3(); let maxH = 0;
  desc.bodies.forEach((b) => { b.footprint.forEach(([x, z]) => box.expandByPoint(new THREE.Vector3(x, 0, z)));
                               maxH = Math.max(maxH, (b.base || 0) + b.height); });
  const centre = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const frame = Math.max(size.x / camera.aspect, size.z) * 1.15;   // metres of plan that fill the view height

  // ---- the cut and the shared uniforms
  const cutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), o.cutPlan);
  if (o.rise === 'cut') renderer.clippingPlanes = [cutPlane];
  const U = { uReveal: { value: 0 }, uOrigin: { value: new THREE.Vector2(...(o.revealOrigin || [box.min.x, box.max.z])) },
              uReach: { value: size.length() }, uPaper: { value: PAPER }, uInk: { value: INK }, uAccent: { value: ACCENT } };

  // ---- the material patch: paper until the sweep front passes, then the real lit material, with an accent band
  function sketchable(mat) {
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'varying vec3 vWp;\n' + sh.vertexShader.replace('#include <project_vertex>',
        '#include <project_vertex>\n vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'varying vec3 vWp; uniform float uReveal, uReach; uniform vec2 uOrigin; uniform vec3 uPaper, uInk, uAccent;\n' +
        sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
          vec3 cell = floor(vWp / 1.0);
          float h = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          float t = mix(distance(vWp.xz, uOrigin) / uReach, h, 0.25) * 0.86;   // the moment this piece lands
          float real = step(t, uReveal) * step(0.0001, uReveal);
          float fresh = real * (1.0 - smoothstep(0.0, 0.14, uReveal - t));
          vec3 sketch = gl_FrontFacing ? uPaper : uInk;                       // back faces = poche through the cut
          gl_FragColor.rgb = mix(sketch, gl_FragColor.rgb, real);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uAccent, fresh * 0.35);`);
    };
    mat.side = THREE.DoubleSide; mat.polygonOffset = true; mat.polygonOffsetFactor = 1; mat.polygonOffsetUnits = 1;
    return mat;
  }

  // ---- bodies: extrude the footprint upward, add ink edges and a poche lid
  const lids = [], growers = [], inkMat = new THREE.LineBasicMaterial({ color: INK, transparent: true });
  desc.bodies.forEach((b, i) => {
    const shape = new THREE.Shape(b.footprint.map(([x, z]) => new THREE.Vector2(x, -z)));   // shape y = -z
    (b.holes || []).forEach((h) => shape.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z)))));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: b.height, bevelEnabled: false }).rotateX(-Math.PI / 2);
    // (after rotateX(-90 deg), extrusion depth runs up +Y and shape y=-z maps back to world z)
    const m = b.material;
    const mat = sketchable(new THREE.MeshStandardMaterial({ color: m.color, roughness: m.roughness ?? 0.8,
      metalness: m.metalness ?? 0, transparent: b.kind === 'glass', opacity: m.opacity ?? (b.kind === 'glass' ? 0.3 : 1) }));
    const mesh = new THREE.Mesh(geo, mat); mesh.position.y = b.base || 0;
    mesh.castShadow = b.kind !== 'ground' && b.kind !== 'glass'; mesh.receiveShadow = true;
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), inkMat); mesh.add(edges);
    group.add(mesh);
    if (b.kind !== 'ground' && b.kind !== 'decor') {           // a lid of ink the shape of the footprint
      const lid = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2),
                                 new THREE.MeshBasicMaterial({ color: INK }));
      lid.userData.range = [b.base || 0, (b.base || 0) + b.height]; group.add(lid); lids.push(lid);
    }
    growers.push({ mesh, delay: (i / desc.bodies.length) * 0.35 });   // for rise: 'grow'
  });

  // ---- light: a sun with a shadow box fitted to the bounds, a hemisphere fill, ACES
  const s = desc.sun || { elevation: 32, azimuth: -158 };
  const el = THREE.MathUtils.degToRad(s.elevation), az = THREE.MathUtils.degToRad(s.azimuth);
  const sun = new THREE.DirectionalLight(s.color ?? 0xffe2bc, 0);
  sun.position.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).multiplyScalar(size.length() * 2).add(centre);
  sun.target.position.copy(centre); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const r = size.length() * 0.6, sc = sun.shadow.camera;
  Object.assign(sc, { left: -r, right: r, top: r, bottom: -r, near: 0.1, far: size.length() * 4 }); sc.updateProjectionMatrix();
  sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.03; sun.shadow.radius = 3;
  const hemi = new THREE.HemisphereLight(0xefebe4, 0xd8c3a6, 1.4);
  group.add(sun, sun.target, hemi);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  scene.background = PAPER.clone();

  // ---- camera: dolly zoom in log space, the same frame at every lens
  const lnF0 = Math.log(o.lensFlat), lnF1 = Math.log(o.lensOpen), lnW0 = Math.log(frame), lnW1 = Math.log(frame * 0.8);
  function placeCamera(k, kTilt) {
    const fov = Math.exp(lerp(lnF0, lnF1, k)), w = Math.exp(lerp(lnW0, lnW1, k));
    const dist = w / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
    const pitch = THREE.MathUtils.degToRad(lerp(o.pitchFlat, o.pitchOpen, kTilt)), yaw = THREE.MathUtils.degToRad(o.yawOpen * kTilt);
    camera.up.set(0, 1, 0);
    camera.position.set(centre.x + Math.sin(yaw) * Math.cos(pitch) * dist, centre.y + Math.sin(pitch) * dist,
                        centre.z + Math.cos(yaw) * Math.cos(pitch) * dist);
    camera.fov = fov; camera.near = Math.max(0.05, dist - size.length()); camera.far = dist + size.length() * 2;
    camera.lookAt(centre); camera.updateProjectionMatrix();
  }

  function setProgress(t) {
    const T = o.timeline;
    const kTilt = quint(span(t, T.tilt[0], T.tilt[1]));
    const kLens = smooth(span(t, T.tilt[0], T.tilt[1]));
    // the walls rise: the cut climbs from plan height to just above the tallest body, then switches off
    const kRise = smooth(span(t, T.rise[0], T.rise[1]));
    if (o.rise === 'cut') {
      const cut = kRise >= 1 ? 1e5 : lerp(o.cutPlan, maxH + 0.05, kRise);
      cutPlane.constant = cut;
      lids.forEach((l) => { const [a, b] = l.userData.range; l.visible = cut > a + 0.01 && cut < b - 0.005; l.position.y = cut - 0.004; });
    } else {
      growers.forEach((g) => { g.mesh.scale.y = Math.max(0.001, smooth(span(kRise, g.delay, g.delay + 0.65))); });
      lids.forEach((l) => (l.visible = false));
    }
    U.uReveal.value = smooth(span(t, T.reveal[0], T.reveal[1]));
    const kLight = smooth(span(t, T.light[0], T.light[1]));
    sun.intensity = 6.0 * kLight; hemi.intensity = lerp(1.4, 0.5, kLight);
    inkMat.opacity = lerp(1, 0.18, U.uReveal.value);          // the drawing's lines step back as the materials land
    renderer.shadowMap.needsUpdate = true;
    placeCamera(kLens, kTilt);
  }

  let tNow = 0;
  setProgress(0);
  return {
    group, setProgress: (t) => setProgress((tNow = t)),
    play: (sec = 5) => new Promise((res) => { const t0 = performance.now();
      const step = () => { const k = Math.min(1, (performance.now() - t0) / (sec * 1000)); setProgress((tNow = k));
        k < 1 ? requestAnimationFrame(step) : res(); }; step(); }),
    update() {},
    dispose() { renderer.clippingPlanes = []; group.traverse((x) => { x.geometry?.dispose(); x.material?.dispose?.(); }); scene.remove(group); },
  };
}
```

Example input:

```js
const d = createTopDownDiorama(renderer, camera, scene, { bodies: [
  { id: 'ground', kind: 'ground', footprint: [[-20,-20],[20,-20],[20,20],[-20,20]], height: 0.05, material: { color: 0xbfae8e } },
  { id: 'wallN', kind: 'wall', footprint: [[-8,-6],[8,-6],[8,-5.7],[-8,-5.7]], height: 3, material: { color: 0xf2ede2 } },
  { id: 'tower', kind: 'solid', footprint: [[2,0],[6,0],[6,4],[2,4]], height: 9, material: { color: 0x8a6a4c, roughness: 0.6 } },
]}, { rise: 'cut', revealOrigin: [-8, 6] });
await d.play(5);    // or: d.setProgress(scrollProgress) from a ScrollTrigger / Lenis callback
```

### 3.3 Default timeline (as fractions of `t`), and why

| Phase | t window | Ease | Reason (from Lintel) |
|---|---|---|---|
| Sketch hold | 0 → 0.08 | none | The drawing must hold perfectly still first. That stillness makes the reveal land. |
| Tilt and lens 3°→40° | 0.08 → 0.70 | quintic tilt, smoothstep lens | Dolly zoom in log space keeps the plan's size while perspective arrives. |
| Cut rises 1.2 m → max height | 0.12 → 0.62 | smoothstep | It starts just after the tilt starts, so the walls are seen rising, not only seen risen (the starter rig's "tip early"). |
| Material sweep | 0.45 → 0.92 | smoothstep | Pieces land from `revealOrigin` with a 0.25 jitter and an accent band of 0.14. Never a growing circle: the hash jitter breaks up the round front. |
| Light up | 0.55 → 1.0 | smoothstep | The sun goes from 0 to 6 and the hemisphere from 1.4 to 0.5. Shadows arrive together with the materials. |

### 3.4 Caveats and next steps

- **Global clipping and shadows.** Global `renderer.clippingPlanes` interacts with the shadow pass. The sketch brings the sun in only late and switches the cut off at the end of the rise, which is the same thing Lintel does (`OFF = 1e5`). If shadows are needed during the cut, use per-material `clippingPlanes` and give the shadow depth material the same planes (`mesh.customDepthMaterial`).
- **Lines.** For production-quality lines, replace `EdgesGeometry` with Lintel's post-process approach: a normal and depth prepass, normal difference plus the second derivative of depth, and depth precision re-centred on the nearest visible point. Lines then glide smoothly instead of crawling.
- **Labels.** Room names and dimensions can be plane meshes laid on the plan, fading out with `uReveal`.
- **Flicker.** Add a flicker metric like Lintel's `tools/flicker.mjs`: compare each frame to the mean of its two neighbours. At rest the score must read 0.000.
