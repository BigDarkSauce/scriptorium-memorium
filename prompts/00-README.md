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

## Ids the app and any AI share

- Subsections: the heading number ("1.2.3"); an opening text before the first subsection is "<chapter>.0"; unnumbered headings are "p<page>-<k>"; page windows of a part without headings are "<num>-w<k>".
- Figures: "Figure 3.2" → `fig-3-2`, "Table 1.1" → `tab-1-1`, an unnumbered figure on page 12 → `fig-p12-1`.

## Grounding and sources

Inside claude.ai the app hands Claude research tools while it writes (OpenAlex, Consensus and PubMed, through your own connectors) and checks every cited reference against OpenAlex afterwards (✓ found, ✗ not found). With another AI, let it use its own web or literature search to follow the GROUNDING rules in these prompts. Its references show as unchecked until you press *Verify against OpenAlex* inside claude.ai. Anything taken from outside the PDF must sit in an `extra` field with its source; the reader shows it with an "Added from outside the PDF" badge.
