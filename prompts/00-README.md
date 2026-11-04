# Prompt pack

These are the exact prompts Scriptorium Memorium sends to Claude (generated from `js/ai/prompts.js` by `node prompts/build.mjs`; do not edit them by hand). Use them with **any** AI (another Claude account, ChatGPT, Gemini, a local model) that can read your PDF. Every answer is plain JSON that you paste back into the app (open a scroll → *Paste JSON from another AI*, or *Import / export → Import JSON* for a whole room or library).

Order of work (the full recipe, with checklists, is in `../docs/PROTOCOL.md` → "Recipe for any AI"):
1. `01-split-book.md`: split the PDF into parts and list **every subsection** with page ranges (the app also does this itself, without AI).
2. `02-analyse-part.md`: one call per part; returns the logical chain with coverage, the PDF's figures cited by id, the question thread and demos.
3. `07-fill-gaps.md`: only when the coverage check finds a missing or coarse subsection: a small call with just that subsection's text.
4. `03-author-diorama.md`: one call per 3D scene the chain asked for (`{"type":"scene","request":...}`).
5. `04-edit-diorama.md`: change an existing diorama.
6. `05-sub-scroll.md`: expand one step into a detailed sub-scroll.
7. `06-whole-room.md`: everything in one answer (for AIs with large outputs).

The formats are documented in `../docs/PROTOCOL.md`, `../docs/SCENE_SPEC.md` and `../schema/`; a finished example is `../examples/chain-coverage-example.json`.

## Check an answer before pasting it

`node tools/verify-chain.mjs chain.json [sections.json]` (from the repository root, Node 18 or later, no installs) runs the app's own coverage check and the strict schema (`../schema/chain.strict.schema.json`) on a chain, and prints every fault: missing or coarse subsections, uncited figures, breaks in the question thread, demos without 3–6 lessons, lessons waiting for an event the model never logs, outside data without a source. Exit code 0 means it passes.

## Ids the app and any AI share

- Subsections: the heading's number ("1.2", "1.2.3", "A.1"); the text of a chapter before its first heading is "<chapter number>.0" (e.g. "1.0"; "p<page>.0" when the chapter has no number); an unnumbered heading is "p<page>-<k>" (k = its position in the part's list of subsections, from 1); a part with no headings inside is cut into windows of 2 pages, "<part number>-w<k>" (e.g. "3-w1" = the part's first two pages; "p<first page>-w<k>" when the part has no number).
- Figures and tables: "Figure 3.2" → fig-3-2, "Fig. 2-3" → fig-2-3, "Figure 3.2a" → fig-3-2a, "Table 1.1" → tab-1-1, an unnumbered figure on page 12 → fig-p12-1, an unnumbered table on page 12 → tab-p12-1 (k counts the unnumbered figures, or tables, of that page from 1).

## Where demo data comes from

Data and points shown by a demo are the PDF's own unless the demo says otherwise: give their place in the demo's `ref` ("Table 1.1, p. 4"), and the reader labels them *From the PDF · Table 1.1, p. 4*. Data from outside the PDF goes in the demo's `extra` (`[{what, source}]`, or `source` with `"outside": true`) and is labelled *Data added from outside the PDF*. A demo with no data of its own is labelled *Our drawing*.

## Grounding and sources

Inside claude.ai the app hands Claude research tools while it writes (OpenAlex, Consensus and PubMed, through your own connectors) and checks every cited reference against OpenAlex afterwards (✓ found, ✗ not found). With another AI, let it use its own web or literature search to follow the GROUNDING rules in these prompts. Its references show as unchecked until you press *Verify against OpenAlex* inside claude.ai. Anything taken from outside the PDF must sit in an `extra` field with its source; the reader shows it with an "Added from outside the PDF" badge.
