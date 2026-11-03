# Sources studied and what was taken from each

Full technical notes are in `docs/research/`.

## flat-to-3d by Samnang Aing (MIT), https://github.com/Sam1983Aing/flat-to-3d

- **06 Card Model.** The card model is the same geometry as the real house in a card material. A sphere grown from the desk-lamp bulb discards card fragments inside it and real fragments outside, with an amber seam (`exp(-(d/W)²)`) that bloom catches. Parts build in with drops and soft bounces. → Taken as the `card` technique: the sphere field, the seam, and the drop build-in when a model is opened from a pedestal.
- **02 Section Sweep.** The section is drawn by inking the 3D model and seen through a 0.12° lens about 12 km away. A dolly zoom interpolates tan(fov/2) to keep the frame height, then swings to a three-quarter view. A vertical cut plane scans ink into the lit render. → Taken as the `sweep` technique: plane field, poché back faces, tan-space dolly zoom, and an ease that ends with speed into the next move (`x²(2.3−1.3x)`).
- **Principles adopted:** the drawing is the real model; one number drives everything; the camera never cuts; the change travels through the world, not across the screen; every texture is drawn in code.

## lintel-flat-2d by Samnang Aing (no licence file: ideas re-implemented, no code copied), https://github.com/Sam1983Aing/lintel-flat-2d

- The floor plan is the 3D model cut by a clipping plane at 1.2 m, filmed through a 3° lens from about 1.2 km. On scroll the cut rises while the camera tilts and the lens opens. Materials are "laid" cell by cell with jitter, so the front never reads as a growing circle. → Taken as the `topdown` technique: a rising clipping plane, a 3° to 40° dolly zoom, and a jittered field (`frontHash` per 0.8 m cell).

## Weatherglass (the reference artifact)

- **Post stack:** MSAA, bloom (0.32, 0.55, 0.92), output, then a grade pass (vignette 0.32, grain 0.035, warm lift). → Reproduced in `renderer.js`.
- **Lighting:** sun height drives light colour, intensity and exposure; the haze is the scene's own; decor reacts to the simulation (trees sway with wind, roof snow builds, windows glow). → Reproduced in environment presets and `behaviors`.
- **HUD:** frosted glass panels (blur 16 px, saturation 1.4, 20 px radius, inset highlight), brass accent #ffd98a, spring easing `cubic-bezier(.3,1.45,.45,1)`, pill toasts, and a coach whose steps complete only from real events, with dots for progress. → Reproduced in `css/app.css`. The lessons advance on real simulation events (`until: "event:<id>"`).
- **Performance:** a GPU tier, a pixel budget and adaptive resolution. → `Gfx.adapt()`.

## book-to-skill by virgiliojr94 (MIT), https://github.com/virgiliojr94/book-to-skill

- Chapter detection with multilingual "Chapter N" patterns; stripping running headers and footers seen at page edges on more than half the pages; exact Roman-numeral page-number removal; rejoining hyphenated words. Token saving comes from reading one chapter at a time. → Taken into `js/ai/ingest.js` and `skill/scriptorium-ingest/scripts/split_pdf.py`, with page ranges added (book-to-skill doesn't keep them) and the PDF outline used first.
