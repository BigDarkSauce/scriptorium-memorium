# Scriptorium Memorium

A walkable 3D library for studying anything. Each PDF becomes a **room**. Its chapters hang as **scrolls** along the walls, each rebuilt as one rigorous logical chain. Beside each scroll stands a **pedestal** carrying a small card model. Step into it and the idea plays out as a living 3D **diorama** of bodies, events and processes.

- **Library hub.** A cozy room whose size you can change. Place bookcases, move them, rotate them and name them by subject (Maths, Physics, Biology…). Add PDFs; each appears as a folded scroll with its name. Click a scroll: it unfolds in a shaft of light and carries you into its room.
- **Book rooms.** Parts are found automatically: from the PDF's bookmarks, then from chapter headings, then from a printed contents page, then in 20-page windows. They hang from the left wall onward. The room grows when more scrolls need hanging, and you can resize it.
- **Reading scrolls.** Each part becomes a chain where every step follows from earlier ones: definitions, axioms, derivations line by line, results. Each step names the bodies it is about. You choose the length: complete, essential, or an exact number of steps. Any step can grow its own sub-scroll.
- **Dioramas.** Every 3D showcase first appears on the scroll as a **drawing**. The drawing is not a picture: it is the real model seen through a very long lens. Press **Transition** and it materialises while the camera dives in. Scrolling then introduces each significant body in turn, its name pinned beside it. Then a foldable panel opens with step-by-step instructions (each one played before the next appears) and the variables.
- **Edit anything.** Select any object to move, rotate, scale, hide, remove or replace it, add new objects, or ask an AI to change it in plain words.
- **Works with any AI.** Inside claude.ai the page uses the viewer's own Claude. Everywhere else, every request is a portable prompt and every answer is documented JSON (see `prompts/`, `docs/PROTOCOL.md`, `skill/`).

## Run it

The page uses ES modules, so serve the folder over HTTP rather than opening the file directly:

```bash
python3 -m http.server 8000      # then open http://localhost:8000
```

On Windows, double-click `serve.bat`. three.js, MathJax and pdf.js load from CDNs, so you need to be online.

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
js/ai/                Claude connector, prompts, PDF ingestion
prompts/              the portable prompt pack (same text the app sends)
schema/               JSON Schemas: chain, scene, room
examples/             example scenes and a room file
skill/                a Claude skill that turns a PDF into a room file
docs/                 architecture, protocol, scene spec, user guide, research notes
```

Built with three.js r170, MathJax 3 and pdf.js 3.11. Every texture is drawn in code; the project ships no image files.
