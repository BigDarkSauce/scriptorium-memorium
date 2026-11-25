# Scriptorium Memorialium

A walkable 3D library for studying anything. Each PDF or PowerPoint presentation becomes a **room**. Its chapters and parts are analysed into coherent topic groups, then displayed as an interactive **2D concept atlas**. Each concept node opens its linked sequence of explanatory **dioramas**: detailed, manipulable simulations of structures, mechanisms, processes, data and relationships. The original source remains indexed behind every concept.

- **Library hub.** A baroque hall whose size you can change. Place bookcases, move them, rotate them and name them by subject (Maths, Physics, Biology…). Add PDFs or `.pptx` presentations; each appears as a scroll lying in its holder, with its name tag. Click a scroll: it unfolds in a shaft of light and carries you into its room. Right-click it to move, hang or delete it (with undo). The hall's door leads back to the room you visited last.
- **Links.** The address names the room and the open scroll (`#room=…&scroll=…`): a reload or a shared link reopens it, and Back / Forward step through the places you visited.
- **Book rooms.** Parts are found automatically: from the PDF's bookmarks, then from chapter headings, then from a printed contents page, then in 20-page windows. They hang from the left wall onward. The room grows when more scrolls need hanging, and you can resize it.
- **Concept atlases.** The validated source chain is grouped by meaning, mechanism, prerequisite and question—not page or slide boundaries—into an interconnected mind map. Selecting a node reveals its diorama sequence, what each view explains, and the source trail. The reader is atlas-first rather than a long conventional lesson scroll.
- **Source coverage and audit.** PDF ingestion uses bookmarks, headings, typography, page geometry, inventories and figures. PowerPoint ingestion follows the actual Open XML slide order and extracts shape/table text, speaker notes and accessible image descriptions. These remain source units; the AI then groups material across them into coherent concepts. Every concept records its source step IDs, subsection IDs, page/slide spans and figure IDs; a strict coverage check ensures no source step disappears or is assigned twice.
- **The book's own figures.** Figures and tables are cut from PDF pages with captions and source page references. PowerPoint image assets are not claimed to have been interpreted visually; only text, speaker notes and accessible descriptions are treated as extracted facts. Anything taken from external research is kept separate from PDF claims and carries its returned URL/source metadata.
- **Discoverable knowledge.** The atlas offers prediction-before-reveal challenges using structural, mechanistic, temporal, explanatory, relational and counterfactual incompleteness. Learners commit an answer and confidence before feedback is shown. These challenges are used only where the supplied source supports a meaningful inference.
- **Dioramas.** Each concept node opens its linked diorama sequence. Every new 3D scene is planned with a source-mapped model contract (system boundary, actors, state variables, mechanisms, constraints, assumptions and observables), checked against the authored scene, then reviewed separately for causal, quantitative and intervention fidelity. Results, unresolved claims and assumptions are saved with the scene and checked by the offline verifier. These checks make assumptions inspectable; they are not proof of scientific correctness. Every 3D model keeps the app's drafting-to-materialisation transition, camera movement, body introductions, guided lessons and manipulable variables. A node may also expose a 2D explanatory figure when a spatial model would mislead. See [the model-contract and audit design](docs/research/simulation-model-contract.md).
- **Edit anything.** Select any object to move, rotate, scale, hide, remove or replace it, add new objects, or ask an AI to change it in plain words.
- **Grounded in actual research.** The local OpenAI integration uses the Responses API with the live `web_search` tool when external evidence is genuinely needed. Search-call metadata and returned citations are recorded separately from the uploaded-document index. Other configured models remain automatic fallbacks; they do not inherit OpenAI's native web-search tool.
- **OpenAI-first, locally secured.** The Windows launcher can prompt for an OpenAI API key without echoing it, keep it in the server process environment, and proxy Responses API requests through localhost. The browser never stores the OpenAI key. Other providers can be enabled as fallbacks.

## Run it

**Windows with OpenAI:** double-click `Launch Scriptorium with OpenAI.bat`. It asks for your OpenAI API key using a hidden prompt, keeps it in the local server's environment for that run, then opens the app. API usage is billed by OpenAI separately from a ChatGPT subscription. See [docs/OPENAI-LOCAL.md](docs/OPENAI-LOCAL.md).

- **Hosted/online:** the published artifact does not have access to your local OpenAI server or its environment key. Use the standalone localhost launcher for the OpenAI-first workflow.
- **Fallback providers:** in the AI settings panel you can configure other OpenAI-compatible or free providers. The router tries OpenAI first, then enabled fallbacks if the local endpoint is unavailable.
- **On your computer without OpenAI:** double-click `Launch Scriptorium.bat` to run the local server with fallback providers but no OpenAI key. For the OpenAI-first route use `Launch Scriptorium with OpenAI.bat`. The first run also creates a **Scriptorium Memorialium** shortcut with the scroll icon, both in this folder and on your Desktop. The launcher starts a small local server on port 8000 (a working Python if there is one, checked with `python -c "import http.server"` so the Microsoft Store placeholder is skipped; else the `py` launcher; else the built-in PowerShell server in `launcher/serve.ps1`), waits until it answers, and then opens http://localhost:8000 in your browser. Keep its window open while you use the app; closing it stops the server.
- **Any system:** the page uses ES modules, so serve the folder over HTTP rather than opening `index.html` directly:

```bash
./serve.sh                        # or: python3 -m http.server 8000   — then open http://localhost:8000
```

Notes for running locally:
- three.js, MathJax, pdf.js and the fonts load from CDNs, so you need to be online.
- Your library, rooms and PDFs are stored in the browser (IndexedDB) for that address. The example books' dioramas are brought up to date by themselves when a new version changes them, unless you edited them (`js/seeds-version.js`). Use the same address and port each time (http://localhost:8000) or you will see an empty library; *Import / export* moves a library between browsers.
- OpenAI requests go through `/__openai/v1/responses` on localhost. The same-origin server reads `OPENAI_API_KEY`; it does not expose the key to JavaScript. For a different model or provider, use the AI settings panel. The offline chain verifier remains available (`tools/verify-chain.mjs`).

## Check a chain from another AI

Any AI's answer for one part can be checked offline before it is pasted into the app (Node 18 or later, nothing to install):

```bash
node tools/verify-chain.mjs answer.json                    # a chain, or a whole scriptorium-room/1 file
node tools/verify-chain.mjs answer.json sections.json      # also check against the part's subsections and their text
```

It runs the app's own coverage check (`verifyChain` in `js/ai/prompts.js`) and the strict schema (`schema/chain.strict.schema.json`), and prints one line per fault: a subsection without steps or coarser than the book, a PDF figure nobody cites, a break in the question thread, a 3D demo without 3–6 lessons, a lesson waiting for an event the model never logs, outside data without a source. Numbers that are not in the PDF text are printed as warnings. Exit code 0 means the chain passes; `--json` prints the full report, `--loose` checks the base schema only. `examples/chain-coverage-example.json` passes.

## Simulation contract regression test

Run `node tools/test-model-contract.mjs` (Node 18 or later, no installs) to exercise the source-evidence, actor identity, parameter range/unit and legacy-compatibility checks used by the scene authoring pipeline.

## Smoke test

`tools/smoke.mjs` opens the whole app in headless Chromium and checks it end to end: boot, every seeded room and scroll, every built-in diorama, lessons, editing, the library arranger, import, WebGL context loss, memory leaks and console errors.

```bash
./serve.sh &                                               # serve the app on http://localhost:8000
npm i -g playwright && npx playwright install chromium     # once
node tools/smoke.mjs                                       # or: node tools/smoke.mjs http://localhost:8000/
```

A run takes about 3 minutes on a machine with a GPU and 10–15 minutes with software rendering. `SMOKE_OUT=dir` saves two canvas captures, `SMOKE_SLOW=1` also runs every built-in model through the drawing → real transition, `SMOKE_HEADED=1` shows the browser. Exit code 0 = all checks passed, 1 = a check failed, 2 = it could not start (no server or no playwright).

## Learning workflow

The concept atlas now supports horizontal question branches, prediction-first commitments and source-linked, one-reasoning-unit-at-a-time unfolding. An optional loci route is also available: learners can anchor a concept to a bookcase row/slot, add their own memory cue, and practise recall at that place. A compact source scan also exposes subsections and searchable, source-linked terms, equations, examples, tables, figures and code, with native autocomplete drawn from the source; adaptive scan prompts and loci routes also use the existing spaced-retrieval ledger, with learner self-ratings and expanding review intervals; arbitrary room landmarks remain future design targets.

See [docs/LEARNING-WORKFLOW.md](docs/LEARNING-WORKFLOW.md) for the scan → question sweep → selective depth model, the optional spatial memory layer, its source-grounding guardrails and evaluation criteria. The [pedagogy guide](docs/PEDAGOGY.md) and [user guide](docs/USER_GUIDE.md) explain the implementation currently available.

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
js/ai/                OpenAI-first provider router, optional fallbacks, evidence connectors, prompts, PDF/PPTX ingestion
prompts/              the portable prompt pack (same text the app sends; regenerate with `node prompts/build.mjs`)
schema/               JSON Schemas: chain (coverage, question thread, figures, extra), strict profile, semantic atlas, scene and room
tools/                verify-chain.mjs (offline check of a chain or room file), smoke.mjs (end-to-end browser test), polish.mjs (layout and
                      colour gate), test-math / test-prose / test-seeds (unit checks), seed-history.mjs (regenerates js/seeds-history.js)
examples/             example scenes, a room file, and a complete chain with its coverage map
skill/                optional portable ingest skill that turns a PDF into an importable room file
docs/                 architecture, protocol, scene spec, user guide, pedagogy & grounding, research notes
launcher/             Windows launcher helpers (local server, shortcut maker)
assets/               app icon (scriptorium.ico / .png)
```

Built with three.js r170, MathJax 3 and pdf.js 3.11. Almost every texture is drawn in code; the image files are the app icons and three CC0 scanned surface sets (ground, moss, bark) in `assets/textures` (see `CREDITS.txt` there) that add fine detail to the dioramas' landscapes.

## Licence

All rights reserved: see [LICENSE](LICENSE). You may view, download and run it for your own personal study; copying, modifying or republishing needs the owner's permission. Third-party components keep their own licences ([THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)).
