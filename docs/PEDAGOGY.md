# How Scriptorium teaches, and how it stays correct

Scriptorium aims at understanding, not just coverage. A learner should be able to rebuild each idea, picture it, use it, and know when it fails. Every chain step and every diorama is built to that standard, and every factual claim can be traced to a source that really exists.

## 1. The shape of one step

| Field | What it does | Why (evidence) |
|---|---|---|
| `from` + strict order | Nothing is used before it is defined. Arrows in the margin show the dependencies. | Order matches how experts build knowledge, and it keeps the reader's load manageable (Sweller 1988). |
| `terms` | Every new symbol or word comes with its meaning and units. | Undefined symbols are the most common reason a derivation "doesn't stick". |
| `derivation` | One move per line, each with its reason. | Studying worked examples with a reason for each step beats unguided problem solving for novices (Sweller 1988). Writing the "why" invites self-explanation (Chi et al. 1994). |
| `intuition` | A plain-language picture with no new symbols. | Pairing words with images (dual coding) improves recall and transfer (Paivio 1991; Mayer 2002). |
| `bodies` + showcase | The idea attached to concrete objects and events: a 2D diagram or a 3D diorama you can change. | Same reason. The diorama's lessons make the learner predict, act and watch, not only read. |
| `misconception` | The commonest wrong belief and why it fails. | Understanding often requires replacing an intuitive model, not adding to it. That starts when the old model is shown to fail (Posner et al. 1982). |
| `check` | A question that needs understanding (predict, compare, explain), with its answer hidden. | Retrieval practice is one of the two techniques rated "high utility" in the largest review of study methods (Dunlosky et al. 2013). Testing beats re-reading for long-term retention (Roediger & Karpicke 2006). |
| `basis` + `sources` | Says where each claim comes from: the part's own text, standard knowledge, derived above, or a measured fact. Measured facts need a source. | Lets the reader judge how far to trust a claim, and keeps the AI honest. |

### Explained steps, not pasted pages

A scroll that repeats the PDF teaches nothing the PDF did not. The failure that made this rule explicit: a statistics tutorial made of infographic pages came back with the same page image and the same page text pasted into several steps. Every step is now an *explained* step:

| Part of the step | What it does | Why |
|---|---|---|
| `statement` | the claim in one or two sentences of the chain's own | a claim you can say in your own words is one you have understood (self-explanation, Chi et al. 1994) |
| `explain` | 2–4 short paragraphs that say how and why, with the source's numbers | the reasoning is what the learner rebuilds; a page of fragments (labels, arrows, call-outs) is turned into connected sentences |
| `quote` | at most 40 words copied exactly, only where the wording matters, each passage once | attribution without pasting; the gate rejects more than 40 copied words |
| `code` | every line of the source's code beside what it does, the printed output, and what that output means | code is read line by line, not as a picture; statistics output is only useful once interpreted (what a p-value does and does not say) |
| `examples` | the PDF's own worked example first, then, where it helps, one researched from the literature, badged *Added from outside the PDF* with its source | worked examples before problem solving (Sweller 1988); a second example from another context helps transfer |
| figures | every paragraph of 60 words or more, and every *Picture it*, *Common mistake* and *Check yourself*, comes with a drawing | dual coding (Paivio 1991; Mayer 2002): words with a picture that shows the same idea; the *Check yourself* picture appears only after the answer is revealed, so it does not give the answer away |

Figures are data the reader draws (flows, plots, distributions with shaded probabilities, bars from tables, number lines for inequalities, trees for decisions, Venn diagrams, timelines, labelled sketches, code traces, wrong-versus-right cards), so every model draws the same kinds of picture for the same kinds of idea, and labels are typeset. A short loop shows what changes (random draws piling up into a distribution, a parameter sweeping a curve, code executing line by line); with reduced motion it is a still with a play button. The PDF's own figure is used when it is the best illustration, shown once, captioned with its page.

The quality gate checks every answer for pasted text, repeated passages and figures, unexplained steps, unexplained code, missing subsections and missing figures, and sends only the offending steps back to be rewritten (docs/PROTOCOL.md, stage 4b).

### Breakdown levels

The learner chooses how fine the chain is, but never coarser than the source: *Complete* (every definition, rule, worked example, table, figure, code block and panel item its own step), *Essential* (the spine, at least one step per subsection), or an *exact number* of steps for the chosen pages (raised to the number of subsections if it is smaller).

## 2. Grounding: the literature as a co-author

Inside claude.ai the page uses the viewer's own research connectors (the artifact `mcp` capability):

- **OpenAlex**: an open index of about 250 million scholarly works in every field, with CC0 metadata and DOIs. It is used for search and for **verifying citations** (`resolve_references`).
- **Consensus**: semantic search over peer-reviewed papers for plain-language research questions, used for empirical claims and measured values.
- **PubMed**: biomedical and life-science literature.

**While writing** a chain, a diorama or a sub-scroll, Claude gets these as tools (`search_literature`, `search_evidence`, `search_biomedical`). The prompt's GROUNDING rules tell it to:
- look up the central laws, definitions and every number it will state or plot;
- copy titles and DOIs exactly from what it found;
- never invent a DOI;
- give a range when sources disagree.

**After writing**, every cited reference is checked against OpenAlex and marked:
- ✓ found;
- ? partial match;
- ✗ not found: the reference may be garbled or invented.

The reader can also press **Find sources** on any step to search OpenAlex and cite a work by hand.

**Without connectors** (outside claude.ai, or with another AI), the same prompts still ask for sources. They show as *unchecked* until verified.

**Corrections over fidelity.** When a book and the established literature disagree, the chain follows the literature, keeps the step, and says what differs in `sourceNote`. Two corrections made while grounding the example library:
- *Water cycle:* "warm air holds more water" was replaced by the saturation vapour pressure of water, $e_s(T)$, which rises about 7 % per kelvin. Saturation is a property of water at a given temperature, not of the air (Koutsoyiannis 2012).
- *Osmosis:* "water diffuses down its own concentration gradient" was replaced by flow driven by the water's chemical potential, mostly as bulk flow through pores (Kramer & Myers 2013; Kedem & Katchalsky 1958). The diorama's lesson text now says that its particle picture shows the direction of flow, not the molecular mechanism.

## 3. Dioramas

How many: each subsection gets as many dioramas as it has dynamic or spatial ideas (none for a list of definitions, one for a mechanism, two or three for a complex subsection), planned by the model (`dioramaPlan`) and built by the app. A diorama that cannot be authored is retried in a simpler form and otherwise replaced by a fitting ready-made model or a diagram, never left as an empty slot.


A diorama is the same idea made physical:
- **actors**: the bodies the idea is about, introduced one by one in the tour;
- **decor**: gives place and scale, and reacts to the simulation;
- **events**: fire at the meaningful moments;
- **lessons**: each changes one variable and says what to watch;
- **sources**: a `sources` list for the governing law and realistic parameter values, shown in the panel's *Sources* tab.

### The didactic planner: storyboard first, then the scene

Before a 3D demo is authored, the model writes a short **plan** (`planPrompt`, `PLAN_FORMAT` in `js/ai/prompts.js`; about 1.5k tokens): the question the demo answers, the **kind of knowledge** it teaches, the **levels** of its multiscale scene graph, the **sequence** of beats, one **analogy** with its limit, and the **comprehension check**. It is the black-and-white storyboard of Nucleus Medical Media's process: the logic of the explanation is fixed before any geometry or colour.

- **Jared Owen's sequence as a planning algorithm.** Each beat has a stage, in this order, skipping what the subject does not need and recursing inside a beat through `sub`: *curiosity* (a question that opens a gap) → *orientation* (the whole, establishing) → *decomposition* (functional parts) → *inspection* (one part's inside) → *mechanism* (the causal process) → *intuition* (an analogy or a scale comparison) → *reconstruction* (back to the whole, working) → *understanding* (the answer). Every beat states its `purpose`, the sub-question it `answers`, and the one it `opens`.
- **The technique follows the kind of knowledge.** Structure → `explode`; the inside → `section`, `inspect`, `peel`; cause → `chain` with the *mechanism* camera; scale → `zoom` with stations and levels, or `scaleTo`; history or assembly → `assemble`; change or disease → `compare` or `progression` (normal → initiating event → structural change → impairment → consequence → intervention); movement through a system → `track`; a point of view → `pov`. The operations are a library of declarative modules (`js/dio/grammar.js`, `js/dio/focus.js`, `js/dio/director.js`): the plan names them, it never re-invents how to animate a piston.
- **Five camera modes.** `global` (the whole environment), `object` (one object), `component` (a subsystem), `mechanism` (a static frame that holds while parts interact), `frame` (the subject's own frame of reference). The camera knows its level: a level indicator (*Organism ▸ Organ ▸ Tissue ▸ Cell ▸ Molecule*, or *System ▸ Subsystem ▸ Part ▸ Mechanism*) shows it, and a zoom keeps its landmark as a ghost (nested-scale storytelling).
- **Never an inside without its place in the whole.** A section, inspection or zoom comes after (or within) a global or object beat; `tools/verify-chain.mjs` treats the opposite as a fault.
- **Explanatory versus background motion.** Every mechanism beat lists the motion that explains (a clot forming and travelling) and the motion that only keeps the scene alive (blood that always flows). Decorative motion is not explanation.
- **Comprehension over attractiveness.** Each plan declares `comprehensionCheck` (`explainBack`, `misconceptionToAvoid`, `answer`); each lesson may carry `explainBack`. After authoring, a cheap self-critique (`critiquePrompt`, `critiqueDemo` in `js/ai/pipeline.js`) asks first whether a newcomer could now explain the concept correctly, and only then whether the demo is attractive; it may patch lesson texts, never the scene. The explore panel ends with *Explain it back* (generation and self-explanation: Chi et al. 1994; retrieval practice: Roediger & Karpicke 2006).

The built-in models carry their own plans (`js/dio/plans.js`; `node tools/verify-chain.mjs --builtins`), and the water-cycle flagship runs the whole sequence: the question and the valley (global) with a section through the lake, evaporation (mechanism), a ride with an air parcel (frame), orographic rain (mechanism), over the crest (frame), and the whole cycle again (reconstruction, the answer).

## 4. References (all checked against OpenAlex)

- Chi M T H, De Leeuw N, Chiu M-H, LaVancher C (1994). Eliciting self-explanations improves understanding. *Cognitive Science*. https://doi.org/10.1207/s15516709cog1803_3
- Dunlosky J, Rawson K A, Marsh E J, Nathan M J, Willingham D T (2013). Improving students' learning with effective learning techniques. *Psychological Science in the Public Interest*. https://doi.org/10.1177/1529100612453266
- Kedem O, Katchalsky A (1958). Thermodynamic analysis of the permeability of biological membranes to non-electrolytes. *Biochimica et Biophysica Acta*. https://doi.org/10.1016/0006-3002(58)90330-5
- Koutsoyiannis D (2012). Clausius–Clapeyron equation and saturation vapour pressure: simple theory reconciled with practice. *European Journal of Physics*. https://doi.org/10.1088/0143-0807/33/2/295
- Kramer E M, Myers D R (2013). Osmosis is not driven by water dilution. *Trends in Plant Science*. https://doi.org/10.1016/j.tplants.2012.12.001
- Mayer R E (2002). Multimedia learning. *Psychology of Learning and Motivation* 41. https://doi.org/10.1016/s0079-7421(02)80005-6
- Paivio A (1991). Dual coding theory: Retrospect and current status. *Canadian Journal of Psychology*. https://doi.org/10.1037/h0084295
- Posner G J, Strike K A, Hewson P W, Gertzog W A (1982). Accommodation of a scientific conception: Toward a theory of conceptual change. *Science Education*. https://doi.org/10.1002/sce.3730660207
- Roediger H L, Karpicke J D (2006). Test-enhanced learning. *Psychological Science*. https://doi.org/10.1111/j.1467-9280.2006.01693.x
- Sweller J (1988). Cognitive load during problem solving: Effects on learning. *Cognitive Science*. https://doi.org/10.1016/0364-0213(88)90023-7

The example library's subject references (Trenberth et al. 2007; Oki & Kanae 2006; Jasechko et al. 2013; Roe 2005; Galton 1889; Le Cam 1986; Smith 1962; Gode & Sunder 1993; van 't Hoff 1887; Preston et al. 1992; Nelson & Olsson 1986; Shinbrot et al. 1992; Goldstein 1975; CODATA 2018; Lighthill 1958; Hewitt & Hewitt 1979; Arrhenius 1889; Laidler 1984; Williams 2025) are listed with DOIs in `js/seeds-sources.js`.

## Deepest dive (round 13)

An option on any breakdown (Complete, Essential or Exact) for a reader with no background who forgets and gets lost.
The part is dismantled down to the principles its claims rest on and rebuilt from them (`DEEPEST_DIVE` in
`js/ai/prompts.js`). Each step gains a **recap** (where we are), **groundwork** (every prerequisite the reader may lack,
in the order needed, each with its plain meaning, why the step needs it, its own derivation and an example; shown folded
beside the step, after Nicky Case's expandable "Nutshell" explanations), and for every formula a **use** block (the
question it answers, its symbols with units, when it holds, a worked number and a sanity check). Derivations move one
justified step at a time; "clearly", "obviously", "it follows", "simply" are refused by the gate and sent back for
repair. A formula is posed as a problem first, so the reader could almost invent it (3Blue1Brown's framing). The step
count of an Exact breakdown counts the main steps; the foundations live inside them. The evidence: worked examples help
novices most (meta-analysis g = 0.48, Barbieri et al. 2023), and instructional explanations integrated with the
learner's own self-explanation help where self-explanation alone falls short (Renkl 2002).

"More detail → sub-scroll" no longer writes anything by itself: it asks what the reader wants explained and where
(any of the step's statement, paragraphs, formula, derivation lines, terms, examples, code and boxes), with an optional
deepest dive, and only then writes the sub-scroll.


## 5. Generative incompleteness: make the learner reconstruct

A conventional explanation can leave the learner watching, reading and recognising without generating the structure needed to explain or use it. Scriptorium therefore uses a prediction-first loop where a learner attempts a reconstruction before the full explanation appears:

**Activate → Predict → Commit → Inspect → Explain → Reconstruct → Transfer → Revisit.**

The system should not merely reveal information in an attractive order. It should create a gap that the learner can meaningfully try to close, then use the difference between their prediction and the supported explanation as feedback.

Six forms are available:

1. **Structural incompleteness:** hide a part of a structure and ask what belongs there.
2. **Mechanistic incompleteness:** show initial and final states while withholding the causal transition.
3. **Temporal incompleteness:** pause a process before a consequential next state.
4. **Explanatory incompleteness:** present an observation without its mechanism and ask what could explain it.
5. **Relational incompleteness:** show concepts without one important dependency or connection.
6. **Counterfactual incompleteness:** remove or change a component/variable and ask what follows.

These are not a quota. Each task must have an inferable target, enough prerequisite knowledge, and corrective feedback after the learner commits. Randomly obscuring pixels or withholding information the source has not introduced is not a useful challenge.

### Multimodal reconstruction, not compulsory mental imagery

A vivid mental image can help when the subject is spatial, structural or mechanical, but it is not a universal prerequisite for understanding. The same challenge should be accessible through a sketch, verbal explanation, symbolic reconstruction, ordering, physical gesture or interactive manipulation. The goal is a coherent generative model, not a particular imagery ability.

### Use the diorama as a testable model

A diorama is valuable when its spatial or temporal structure helps explain the concept. It should expose the relevant actors, states, relationships and controllable variables. The learner should be able to predict what happens when a meaningful variable changes, inspect the consequence, and explain why. An abstract proof, philosophical argument or purely relational taxonomy may be better represented as a 2D map or diagram than as an artificial 3D scene.

### Atlas nodes and source audit

The chapter atlas is compiled from validated reasoning steps, not directly from page count. A concept can span several subsections or slides; a source subsection can contain several concepts. The atlas validator checks that every supplied source step belongs to exactly one concept node, that edge endpoints exist, and that challenge records are complete. These deterministic checks protect coverage and graph integrity, but they cannot prove the model's semantic interpretation or scientific correctness. The source trail and uncertainty notes remain visible for review.

### Question branches and bitwise reconstruction

The atlas presents its challenges as a horizontal set of question branches rather than a vertical list of finished explanations. A learner selects one branch, sees its question and stimulus, writes a prediction and confidence, and commits before the expected reconstruction appears. The explanation is an ordered, source-mapped sequence of reasoning units: one UNFOLD action reveals exactly one unit, earlier units remain visible, Space reveals the next unit, and Ctrl+Z steps back. Switching branches preserves each branch's own prediction and reveal cursor. UNFOLD never advances to another question.

Newly authored reasoning units cite exact source-step IDs from their concept node. The validator rejects empty reasoning units and references outside that node. Older stored atlases without the structured sequence use their existing explanation as a single legacy reveal unit; the app does not invent missing intermediate reasoning. Implementation: `js/ai/atlas.js`, `js/room/atlas-view.js`, and `tools/test-atlas.mjs` / `tools/test-atlas-ui.mjs`.

### Rapid scanning and optional loci routes

The next workflow layer is specified in [Learning workflow](LEARNING-WORKFLOW.md). The orientation scan exposes the real source inventory (sections, terms, equations, examples, tables and figures) without pretending that a short index is a complete explanation. A question sweep then presents source-answerable prompts such as term completion, relationship completion, mechanism bridges, next-state prediction, equation anticipation, figure reading and worked-step reconstruction. The learner selectively opens depth one question at a time.

A first optional loci route is implemented over the atlas. A concept can be anchored to a bookcase ID, row and slot; the marker follows the bookcase when it is moved or rotated. The learner writes an association, visits the location, commits a reconstruction and confidence, and only then reveals the concept summary. The review record stays with the atlas, and the concept's source-step IDs remain available when the learner returns to the atlas. This initial version does not yet schedule due reviews through the retrieval ledger, support arbitrary room landmarks, or replace the atlas's full reasoning path. The rapid source-scan layer and spaced loci scheduling remain design targets.

### Evaluate learning, not only engagement

The relevant outcome is not how immersive a scene feels. Evaluate whether the learner can later reconstruct the idea without cues, explain the mechanism, calibrate confidence, diagnose a misconception and transfer the principle to a changed context. Engagement is useful when it supports these outcomes, not as a substitute for them.
