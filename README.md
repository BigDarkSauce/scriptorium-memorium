# Scriptorium Memorium

A walkable 3D library for studying anything. Each PDF becomes a **room**. Its chapters hang as **scrolls** along the walls, each rebuilt as one rigorous logical chain. Beside each scroll stands a **pedestal** carrying a small card model. Step into it and the idea plays out as a living 3D **diorama** of bodies, events and processes.

- **Library hub.** A cozy room whose size you can change. Place bookcases, move them, rotate them and name them by subject (Maths, Physics, Biology…). Add PDFs; each appears as a folded scroll with its name. Click a scroll: it unfolds in a shaft of light and carries you into its room.
- **Book rooms.** Parts are found automatically: from the PDF's bookmarks, then from chapter headings, then from a printed contents page, then in 20-page windows. They hang from the left wall onward. The room grows when more scrolls need hanging, and you can resize it.
- **Reading scrolls.** Each part becomes a chain where every step follows from earlier ones: definitions, axioms, derivations line by line, results. Each step names the bodies it is about. You choose the length: complete, essential, or an exact number of steps. Any step can grow its own sub-scroll.
- **Nothing coarser than the book.** Import finds the hierarchy (chapter → section → subsection) from the bookmarks, numbered and bold headings, or the contents page, and keeps every subsection's text with its pages. Each scroll shows a coverage map: which steps cover which subsection. Missing or coarse subsections are filled by a small follow-up call that sends only their text.
- **The book's own figures.** Figures and tables are cut out of the PDF pages with their captions and shown in the steps that explain them, marked *From the PDF, p. N*. Anything taken from outside the PDF is marked *Added from outside the PDF* with its source.
- **A question thread.** Every step, and every lesson in a diorama, answers one question and opens the next; the thread runs down the scroll's margin.
- **Dioramas.** Every 3D showcase first appears on the scroll as a **drawing**. The drawing is not a picture: it is the real model seen through a very long lens. Press **Transition** and it materialises while the camera dives in. Scrolling then introduces each significant body in turn, its name pinned beside it. Then a foldable panel opens with step-by-step instructions (each one played before the next appears) and the variables.
- **Edit anything.** Select any object to move, rotate, scale, hide, remove or replace it, add new objects, or ask an AI to change it in plain words.
- **Grounded in the literature.** While Claude writes, it can search OpenAlex, Consensus and PubMed through your claude.ai connectors. Each step says where it comes from, and every cited reference is checked against OpenAlex (✓ found / ✗ not found). Each step also carries its terms with units, a plain picture, the commonest misconception and a self-check question (see `docs/PEDAGOGY.md`).
- **Works with any AI.** Inside claude.ai the page uses the viewer's own Claude. Everywhere else, every request is a portable prompt and every answer is documented JSON (see `prompts/`, `skill/`, and the step-by-step "Recipe for any AI" in `docs/PROTOCOL.md`).

## Run it

- **Online:** open the published version, https://claude.ai/artifact/QpCmKYRujhaHzeq4eY2rie, or double-click `Scriptorium Memorium (online).url`. This is the only way to get the built-in Claude analysis and the research connectors.
- **On your computer (Windows):** double-click `Launch Scriptorium.bat`. The first run also creates a **Scriptorium Memorium** shortcut with the scroll icon, both in this folder and on your Desktop. The launcher starts a small local server (Python if you have it, otherwise the built-in PowerShell server in `launcher/serve.ps1`) and opens http://localhost:8000. Keep its window open while you use the app. Locally, AI work goes through *Copy prompt / Paste JSON* (see `docs/PROTOCOL.md`).
- **Any system:** the page uses ES modules, so serve the folder over HTTP rather than opening the file directly:

```bash
python3 -m http.server 8000      # then open http://localhost:8000
```

three.js, MathJax and pdf.js load from CDNs, so you need to be online.

## Three materialisation techniques

These are generalised from Samnang Aing's experiments (see `docs/RESEARCH.md`). The rule they share: *the drawing is the real model*.

| Technique | Drawing | Transition | Good for |
|---|---|---|---|
| `card` (06 Card Model) | white card model on the drafting desk, 2° lens | a light sphere turns card into real materials | objects, machines, organisms, economies |
| `sweep` (02 Section Sweep) | the section seen dead-on, 0.9° lens | a vertical cut plane scans across, ink → light | layered things: cells, soils, circuits, timelines |
| `topdown` (Lintel) | the plan from straight above, 3° lens | the section cut rises as the camera tilts into perspective | maps, fields, networks, populations |

## Repository map

```
index.html            page shell (import map, CDN libraries)
css/app.css           HUD design (glass panels, parchment scrolls)
js/main.js            boot, mode switching, seed library, import/export
js/gfx/               renderer + post chain, procedural textures, materials, room shell, materialiser
js/dio/               diorama: scene builder (shapes & macros), environments, built-in models, runtime (tour, lessons, edit)
js/hub/               library room and its props
js/room/              book room, reading scroll, 2D diagrams
js/ai/                Claude connector, research connectors (evidence.js), prompts, PDF ingestion
prompts/              the portable prompt pack (same text the app sends; regenerate with `node prompts/build.mjs`)
schema/               JSON Schemas: chain (with coverage, question thread, figures, extra), scene, room
examples/             example scenes, a room file, and a complete chain with its coverage map
skill/                a Claude skill that turns a PDF into a room file
docs/                 architecture, protocol, scene spec, user guide, pedagogy & grounding, research notes
launcher/             Windows launcher helpers (local server, shortcut maker)
assets/               app icon (scriptorium.ico / .png)
```

Built with three.js r170, MathJax 3 and pdf.js 3.11. Every texture is drawn in code; the only image files are the app icon.
