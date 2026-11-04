// Regenerates the portable prompt pack (prompts/*.md) and the spec block of docs/SCENE_SPEC.md from js/ai/prompts.js,
// so the files people paste into other AIs are always the exact texts the app sends.
// Run from the repository root:   node prompts/build.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = await import(path.join(root, 'js/ai/prompts.js'));
const w = (f, t) => { fs.writeFileSync(path.join(root, f), t); console.log('wrote', f, t.length, 'chars'); };
const block = t => '```text\n' + t + '\n```\n';

// a placeholder part with two subsections and one figure, so the pack shows the real structure of the request
const demoSections = [
  { id: '<1.1>', num: '1.1', title: '<subsection title>', level: 2, startPage: 3, endPage: 4, text: '<paste the text of subsection 1.1 here>', inventory: null },
  { id: '<1.2>', num: '1.2', title: '<next subsection title>', level: 2, startPage: 4, endPage: 6, text: '<paste the text of subsection 1.2 here>', inventory: null }];
const demoFigures = [{ id: '<fig-1-1>', label: '<Figure 1.1>', page: 3, caption: '<its caption>' }];

w('prompts/00-README.md', `# Prompt pack

These are the exact prompts Scriptorium Memorium sends to Claude (generated from \`js/ai/prompts.js\` by \`node prompts/build.mjs\`; do not edit them by hand). Use them with **any** AI (another Claude account, ChatGPT, Gemini, a local model) that can read your PDF. Every answer is plain JSON that you paste back into the app (open a scroll → *Paste JSON from another AI*, or *Import / export → Import JSON* for a whole room or library).

Order of work (the full recipe, with checklists, is in \`../docs/PROTOCOL.md\` → "Recipe for any AI"):
1. \`01-split-book.md\`: split the PDF into parts and list **every subsection** with page ranges (the app also does this itself, without AI).
2. \`02-analyse-part.md\`: one call per part; returns the logical chain with coverage, the PDF's figures cited by id, the question thread and demos.
3. \`07-fill-gaps.md\`: only when the coverage check finds a missing or coarse subsection: a small call with just that subsection's text.
4. \`03-author-diorama.md\`: one call per 3D scene the chain asked for (\`{"type":"scene","request":...}\`).
5. \`04-edit-diorama.md\`: change an existing diorama.
6. \`05-sub-scroll.md\`: expand one step into a detailed sub-scroll.
7. \`06-whole-room.md\`: everything in one answer (for AIs with large outputs).

The formats are documented in \`../docs/PROTOCOL.md\`, \`../docs/SCENE_SPEC.md\` and \`../schema/\`; a finished example is \`../examples/chain-coverage-example.json\`.

## Ids the app and any AI share

- Subsections: the heading number ("1.2.3"); an opening text before the first subsection is "<chapter>.0"; unnumbered headings are "p<page>-<k>"; page windows of a part without headings are "<num>-w<k>".
- Figures: "Figure 3.2" → \`fig-3-2\`, "Table 1.1" → \`tab-1-1\`, an unnumbered figure on page 12 → \`fig-p12-1\`.

## Grounding and sources

Inside claude.ai the app hands Claude research tools while it writes (OpenAlex, Consensus and PubMed, through your own connectors) and checks every cited reference against OpenAlex afterwards (✓ found, ✗ not found). With another AI, let it use its own web or literature search to follow the GROUNDING rules in these prompts. Its references show as unchecked until you press *Verify against OpenAlex* inside claude.ai. Anything taken from outside the PDF must sit in an \`extra\` field with its source; the reader shows it with an "Added from outside the PDF" badge.
`);
w('prompts/01-split-book.md', '# Split a book into parts and subsections\n\n' + block(P.splitPrompt({ book: '<book title>', pages: '<number of pages>', outline: '<optional: paste the table of contents or the first pages>' })));
w('prompts/02-analyse-part.md', `# Analyse one part into a logical chain

Replace the placeholders. Inside the app the SUBSECTIONS list (with an inventory of what each contains), the FIGURES list and the PART TEXT (marked per subsection) are filled in automatically. With another AI, either paste them the same way, or attach the PDF, name the pages, and leave the "(not provided)" lines in: the AI then derives the subsections and figure ids itself by the rules in the prompt.

"depth" options in the app: complete (length from the content), essential (at least one step per subsection), or exact N steps (never fewer than the number of subsections).

` + block(P.chapterPrompt({ book: '<book title>', chapter: '<part title (pages a-b)>', sections: demoSections, figures: demoFigures })) + `
Without the lists (attach the PDF instead):

` + block(P.chapterPrompt({ book: '<book title>', chapter: '<part title (pages a-b)>', text: '<paste the text of the part here, or attach the PDF and say which pages>' }).split('PROCEDURE')[0] + 'PROCEDURE … (identical to the prompt above from here on)'));
w('prompts/03-author-diorama.md', '# Author a 3D diorama\n\n' + block(P.authorPrompt({ request: '<what the diorama must show: actors, decor, variables, events, lessons>', technique: '<card | sweep | topdown>', purpose: '<the question the demo answers>' }, '<the study step it illustrates | the step answers: … | and opens: …>')));
w('prompts/04-edit-diorama.md', '# Change a diorama\n\n' + block(P.editPrompt({ type: '<paste the current spec JSON here>' }, { name: '<selected object, optional>' }, '<what to change>')));
w('prompts/05-sub-scroll.md', '# Expand a step into a sub-scroll\n\n' + block(P.detailPrompt({ step: { id: 'S3', title: '<step title>', statement: '<step statement>', answers: '<question it settles>', opens: '<question it opens>' }, chain: [] })));
w('prompts/06-whole-room.md', `# A whole book room in one answer

For AIs that can produce long outputs. Attach the PDF and send:

` + block(`Read the attached book. Split it into its chapters (a section becomes its own part when its chapter is longer than 30 pages) with page ranges, and list every subsection of each part (ids: heading numbers, "p<page>-<k>" for unnumbered headings). Then for EACH part build a chain exactly as specified below: every subsection covered at the source's resolution or finer, the PDF's own examples, numbers, tables and figures first (figure ids: "Figure 3.2" → fig-3-2), outside additions only in "extra" with a source, and a question thread (each step "answers" the previous step's "opens"). Return ONLY one JSON object:
{"format":"scriptorium-room/1","book":{"title":str,"pages":n},"room":{"parts":[{"title":str,"num":"1","startPage":n,"endPage":n,"summary":"one sentence","subsections":[{"id":"1.1","title":str,"level":2,"startPage":n,"endPage":n}],"analysis":CHAIN}]}}
where CHAIN is:
${P.CHAIN_FORMAT}

${P.HARD_RULES}

${P.BUILTIN_TYPES}
${P.DIAGRAM_TYPES}
${P.LESSON_FORMAT}
For 3D scenes not covered by the built-in models, put {"type":"scene","title":str,"purpose":str,"technique":"card|sweep|topdown","request":"precise description"}; the app (or prompt 03) authors them later.`) + `
Import the file in the app with *Import / export → Import JSON*. It appears as a new scroll on your first bookcase. Open each scroll once with the PDF attached to the book to run the coverage check.
`);
// the follow-up, shown with a small mock chain so its structure is visible
const mockA = { question: '<the part question>', chain: [{ id: 'S1', section: '<1.1>', title: '<existing step>', answers: '<…>', opens: '<question S1 opens>' }] };
const gaps = [{ id: '<1.2>', reason: 'missing: no step covers it' }];
w('prompts/07-fill-gaps.md', `# Fill the gaps the coverage check found

The app runs this automatically (inside claude.ai) after the main analysis when a subsection is missing, coarser than the source, or holds a PDF figure no step explains. It sends only those subsections' text, so it costs a fraction of the first call. Outside claude.ai the coverage panel's *Write the missing steps* button shows this prompt for copy and paste.

` + block(P.followUpPrompt({ book: '<book title>', chapter: '<part title>', A: mockA, gaps, sections: demoSections, figures: demoFigures })));

// docs/SCENE_SPEC.md: replace the generated block between the first ```text fence and its closing fence
const specPath = path.join(root, 'docs/SCENE_SPEC.md'); let spec = fs.readFileSync(specPath, 'utf8');
const a = spec.indexOf('```text\n'), b = spec.indexOf('\n```', a + 8);
if (a >= 0 && b > a) { spec = spec.slice(0, a) + '```text\n' + P.SCENE_SPEC + '\n\n' + P.BUILTIN_TYPES + '\n\n' + P.DIAGRAM_TYPES + spec.slice(b); w('docs/SCENE_SPEC.md', spec); }
