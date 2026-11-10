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

These are the exact prompts Scriptorium Memorialium sends to Claude (generated from \`js/ai/prompts.js\` by \`node prompts/build.mjs\`; do not edit them by hand). Use them with **any** AI (another Claude account, ChatGPT, Gemini, a local model) that can read your PDF. Every answer is plain JSON that you paste back into the app (open a scroll → *Paste JSON from another AI*, or *Import / export → Import JSON* for a whole room or library).

Order of work (the full recipe, with checklists, is in \`../docs/PROTOCOL.md\` → "Recipe for any AI"):
1. \`01-split-book.md\`: split the PDF into parts and list **every subsection** with page ranges (the app also does this itself, without AI).
2. \`02-analyse-part.md\`: one call per part; returns the logical chain with coverage, the PDF's figures cited by id, the question thread and demos.
3. \`07-fill-gaps.md\`: only when the coverage check finds a missing or coarse subsection: a small call with just that subsection's text.
3b. \`08-repair-steps.md\`: only when the quality gate finds steps that paste the PDF, repeat another step, state without explaining, or skip code explanations: just those steps are rewritten.
3c. \`09-figures.md\`: only for paragraphs and teaching boxes that still lack a figure.
3d. \`12-domain-compiler.md\`: the explanatory compiler: for steps whose structure (an argument, a feedback loop, a business model, a matrix, a data series…) is drawn best by a domain primitive and that have none yet, the visual routing and the interactive primitive spec (\`../docs/research/explanatory-compiler.md\`).
4. \`10-didactic-plan.md\`: before each 3D scene, a short plan (the question, the kind of knowledge, the levels, Jared Owen's explanatory sequence with an operation and a camera mode per beat, the comprehension check). Check it with \`node tools/verify-chain.mjs plan.json\`.
4b. \`03-author-diorama.md\`: one call per 3D scene the chain asked for (\`{"type":"scene","request":...}\`), built from the plan (paste the plan into the request's "plan").
4c. \`11-self-critique.md\`: could someone explain the concept after watching? A short check of the lessons against the plan's comprehension check; it may only patch lesson texts.
5. \`04-edit-diorama.md\`: change an existing diorama.
6. \`05-sub-scroll.md\`: expand one step into a detailed sub-scroll.
7. \`06-whole-room.md\`: everything in one answer (for AIs with large outputs).

The formats are documented in \`../docs/PROTOCOL.md\`, \`../docs/SCENE_SPEC.md\` and \`../schema/\`; a finished example is \`../examples/chain-coverage-example.json\`.

## Check an answer before pasting it

\`node tools/verify-chain.mjs chain.json [sections.json]\` (from the repository root, Node 18 or later, no installs) runs the app's own coverage check and the strict schema (\`../schema/chain.strict.schema.json\`) on a chain, and prints every fault: missing or coarse subsections, uncited figures, breaks in the question thread, demos without 3–6 lessons, lessons waiting for an event the model never logs, outside data without a source. Exit code 0 means it passes.

## Ids the app and any AI share

- Subsections: ${P.SUBSECTION_IDS}
- Figures and tables: ${P.FIGURE_IDS}

## What a good answer looks like (the quality gate)

The app (and \`node tools/verify-chain.mjs\`) rejects: more than 40 words pasted from the PDF in any paragraph; two steps repeating the same passage; a PDF figure shown by two steps or a page-sized crop; a step without \`explain\` paragraphs; code without a line-by-line \`code\` explanation and its interpreted output. Every paragraph of 60+ words, and every *Picture it*, *Common mistake* and *Check yourself*, carries a figure spec (\`../schema/figure.schema.json\`; kinds: ${P.FIGURE_KINDS_LIST}). Every chain gives a \`dioramaPlan\` (how many 3D dioramas each subsection needs). Breakdown levels: complete, essential, or exactly N steps (never coarser than the subsections). A worked answer for a 7-sheet statistics tutorial (infographics) is in \`../tools/fixtures/byu-stub/chain-0*.json\`.

## Where demo data comes from

Data and points shown by a demo are the PDF's own unless the demo says otherwise: give their place in the demo's \`ref\` ("Table 1.1, p. 4"), and the reader labels them *From the PDF · Table 1.1, p. 4*. Data from outside the PDF goes in the demo's \`extra\` (\`[{what, source}]\`, or \`source\` with \`"outside": true\`) and is labelled *Data added from outside the PDF*. A demo with no data of its own is labelled *Our drawing*.

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

` + block(`Read the attached book. Split it into its chapters (a section becomes its own part when its chapter is longer than 30 pages) with page ranges, and list every subsection of each part. Subsection ids: ${P.SUBSECTION_IDS} Then for EACH part build a chain exactly as specified below: every subsection covered at the source's resolution or finer, the PDF's own examples, numbers, tables and figures first (figure ids: ${P.FIGURE_IDS}), outside additions only in "extra" with a source, and a question thread (each step "answers" the previous step's "opens"). Return ONLY one JSON object:
{"format":"scriptorium-room/1","book":{"title":str,"pages":n},"room":{"parts":[{"title":str,"num":"1","startPage":n,"endPage":n,"summary":"one sentence","subsections":[{"id":"1.1","title":str,"level":2,"startPage":n,"endPage":n}],"analysis":CHAIN}]}}
where CHAIN is:
${P.CHAIN_FORMAT}

${P.HARD_RULES}

${P.EXPLAIN_RULES}
${P.CODE_RULES}
${P.FIGURE_SPEC}
${P.DIORAMA_RULES}

${P.BUILTIN_TYPES}
${P.DIAGRAM_TYPES}
${P.LESSON_FORMAT}
For 3D scenes not covered by the built-in models, put {"type":"scene","title":str,"purpose":str,"technique":"card|sweep|topdown","request":"precise description"}; the app (or prompt 03) authors them later.`) + `
Import the file in the app with *Import / export → Import JSON*. It appears as a new scroll on your first bookcase. Open each scroll once with the PDF attached to the book to run the coverage check.
`);
// the didactic planner (docs/PEDAGOGY.md, "The didactic planner") and the self-critique, shown with placeholders
w('prompts/10-didactic-plan.md', `# Plan a 3D demo before building it

The app sends this before it authors a scene (stage 5 of the pipeline). The plan is short (about 1.5k tokens): the demo's question, the kind of knowledge, the levels of its multiscale scene graph, Jared Owen's sequence (curiosity → orientation → decomposition → inspection → mechanism → intuition → reconstruction → understanding, recursive inside a beat) with one operation of the visual grammar and one camera mode per beat, an analogy with its limit, and the comprehension check. Operations are named, never described: the app already knows how to explode, section, compare, zoom, track and so on. \`node tools/verify-chain.mjs plan.json\` checks a plan; the built-in models' own plans are in \`../js/dio/plans.js\` (\`node tools/verify-chain.mjs --builtins\`).

` + block(P.planPrompt({ request: '<what the diorama must show>', purpose: '<the question the demo answers>' }, '<the study step it illustrates>')));
w('prompts/11-self-critique.md', `# Check a demo against its plan

Sent after a scene is authored from a plan. The first test outweighs the second: could a newcomer correctly answer the plan's comprehension check after these lessons, and only then: is it attractive? The answer may patch lesson texts (text, explain, explainBack), never the scene. The app stores the verdict on the scene as \`critique\`.

` + block(P.critiquePrompt({ question: '<the plan question>', comprehensionCheck: { explainBack: '<what the learner must explain>', misconceptionToAvoid: '<the wrong answer>' }, sequence: [{ stage: 'orientation', technique: 'establish', lesson: 0, answers: '<…>' }] }, { lessons: [{ title: '<lesson 1>', question: '<…>', text: '<…>', explain: '<…>', opens: '<…>', cameraMode: 'global' }] })));

// the follow-up, shown with a small mock chain so its structure is visible
// one coarse gap (1.1 already has S1) and one missing gap (1.2), so both kinds of thread instruction are shown
const mockA = { question: '<the part question>', chain: [{ id: 'S1', section: '<1.1>', title: '<existing step>', answers: '<…>', opens: '<question S1 opens>' }] };
const gaps = [{ id: '<1.1>', reason: 'too coarse: 1 step(s) for content that needs about 3', existing: true }, { id: '<1.2>', reason: 'missing: no step covers it' }];
w('prompts/07-fill-gaps.md', `# Fill the gaps the coverage check found

The app runs this automatically (inside claude.ai) after the main analysis when a subsection is missing, coarser than the source, or holds a PDF figure no step explains. It sends only those subsections' text, so it costs a fraction of the first call. Outside claude.ai the coverage panel's *Write the missing steps* button shows this prompt for copy and paste.

New steps get ids G1, G2, …; the app inserts them, renumbers the whole chain S1…Sn and remaps \`from\`. For a coarse subsection (one that already has steps) the new steps go right after its last existing step: the first new step answers a new question, which the app then writes into that existing step's \`opens\`, and the last new step opens what the existing step used to open.

` + block(P.followUpPrompt({ book: '<book title>', chapter: '<part title>', A: mockA, gaps, sections: demoSections, figures: demoFigures })));

// the quality gate's repair call and the figures call, shown with a small mock chain
const mockR = { chain: [{ id: 'S1', section: '<1.1>', title: '<step that pasted the page>', statement: '<the pasted page text>', answers: '<…>', opens: '<…>' }] };
w('prompts/08-repair-steps.md', `# Repair steps the quality gate rejected

The app runs this automatically after the analysis when a step pastes more than 40 words of the PDF, repeats another step, states without explaining, or leaves code unexplained. Only those steps are sent, with their subsections' text; they come back with the same ids, sections and question thread, and the gate runs again (at most two rounds).

` + block(P.repairPrompt({ book: '<book title>', chapter: '<part title>', A: mockR, issues: [{ step: 'S1', kind: 'copied', detail: '86 words copied from the PDF in "statement": explain it in your own words (quote at most 40 words, in "quote")' }, { step: 'S1', kind: 'unexplained', detail: 'only 0 words of explanation and no "explain" paragraphs' }], sections: demoSections })));
w('prompts/09-figures.md', `# Design the missing figures

Sent for paragraphs of 60+ words and teaching boxes (Picture it, Common mistake, Check yourself) that still have no valid figure. Whatever is still missing afterwards, the app builds from the step itself.

` + block(P.figuresPrompt({ book: '<book title>', chapter: '<part title>', A: { chain: [{ id: 'S3', title: '<step title>', section: '<1.2>' }] }, slots: [{ step: 'S3', slot: 'explain.0', text: '<the paragraph>' }, { step: 'S3', slot: 'misconception', text: '<the mistake>', small: true }] })));

w('prompts/12-domain-compiler.md', `# Compile the visual grammar (domain primitives)

Different disciplines explain with different visual languages (the study and the routing table: \`../docs/research/explanatory-compiler.md\`). The app classifies every step by **domain** (${P.DOMAIN_LIST}) and **structure**, and routes it to a visual grammar: a 3D diorama only for spatial ideas; for abstract structures one of the interactive primitives below, shown in the scroll, on the lectern (2.5D) and, for four of them, as a topdown diorama. This call is sent only for steps whose structure has a primitive and that carry none; without AI, a step with a table gets a data narrative built from it.

Check an answer with \`node tools/verify-chain.mjs chain.json\` (the "grammar" lines) and \`node tools/test-domains.mjs\` (the classifier's routing).

` + block(P.domainPrompt({ book: '<book title>', chapter: '<part title>', A: { chain: [] }, steps: [{ st: { id: 'S3', title: '<step title>', section: '<1.2>', statement: '<the step statement>', explain: [{ text: '<its explanation>' }] }, route: { domain: '<domain>', structure: '<structure>', primitive: '<primitive>', medium: '<medium>', source: 'heuristic' } }] })));

// docs/SCENE_SPEC.md: replace the generated block between the first ```text fence and its closing fence
const specPath = path.join(root, 'docs/SCENE_SPEC.md'); let spec = fs.readFileSync(specPath, 'utf8');
const a = spec.indexOf('```text\n'), b = spec.indexOf('\n```', a + 8);
if (a >= 0 && b > a) { spec = spec.slice(0, a) + '```text\n' + P.SCENE_SPEC + '\n\n' + P.BUILTIN_TYPES + '\n\n' + P.DIAGRAM_TYPES + spec.slice(b); w('docs/SCENE_SPEC.md', spec); }
