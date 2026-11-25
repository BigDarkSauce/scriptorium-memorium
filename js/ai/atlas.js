// Semantic chapter atlas compiler.
// It converts the already validated, PDF-grounded reasoning chain into topic-level concepts and typed relationships.
// This is AI-assisted semantic clustering, not a claim that the PDF has been "understood perfectly":
// the deterministic source index and validation report show what was grouped and what could not be mapped.
import { askJSON } from './claude.js';
import { lastRoute } from './free.js';

export const INCOMPLETENESS = [
  'structural', 'mechanistic', 'temporal', 'explanatory', 'relational', 'counterfactual'
];
const clean = (x, n = 500) => String(x == null ? '' : x).replace(/\s+/g, ' ').trim().slice(0, n);
const unique = xs => [...new Set((xs || []).filter(x => x != null).map(String))];
const isScene = d => !!(d && (d.type === 'scene' || Array.isArray(d.bodies) || (typeof d.type === 'string' && d.type !== 'figure')));

export function atlasPrompt({ book, part, analysis, sections = [] }) {
  const S = (analysis.chain || []).map(st => ({
    id: st.id, kind: st.kind, title: st.title, statement: st.statement,
    question: st.answers, opens: st.opens, section: st.section,
    from: st.from, bodies: st.bodies, explanation: (st.explain || []).map(x => x && x.text).filter(Boolean).join(' ').slice(0, 800),
    terms: (st.terms || []).map(x => ({ term: x.term, meaning: x.meaning })),
    figures: st.figures, pages: st.pages, sources: st.sources
  }));
  const C = sections.map(s => ({ id: s.id, title: s.title, level: s.level, startPage: s.startPage, endPage: s.endPage, summary: clean(s.text, 650) }));
  return `You are compiling a semantic chapter atlas for Scriptorium Memorialium. Do NOT write a conventional lesson, article, page-by-page summary, or long prose scroll. The output is a compact, accurate, auditable topic graph that will be rendered as a 2D mind map. Each map node represents a coherent explanatory diorama set.

SOURCE
Book: ${book}
Chapter / part: ${part}
PDF subsections (stable IDs and page spans):
${JSON.stringify(C)}
Validated reasoning steps (the IDs are authoritative; preserve them exactly):
${JSON.stringify(S)}

TASK
1. Discover the conceptual structure across the whole part. Group steps by meaning, mechanism, purpose and prerequisite—not by page boundaries, equal-sized batches or superficial word similarity. Treat a subsection as a source locator, not automatically a concept. A concept may span subsections; one subsection may contain several distinct concepts.
2. Create an appropriate number of topic nodes for the information's true breadth and depth. Prefer a small map of coherent, sufficiently deep concepts over a long flat list. Split a node when its steps explain meaningfully different mechanisms, states, scales or questions. Merge nodes only when they genuinely form one explanatory unit. Preserve prerequisites and dependencies.
3. Assign every supplied step ID to exactly one node. No invented or missing step IDs. The map must account for the complete source chain.
4. Create typed directed edges between nodes: prerequisite, part-of, causes, enables, constrains, transforms-into, regulates, contrasts-with, evidence-for, temporal-before, spatial-within, or application-of. Direction must mean something; do not add decorative edges. Include a short relationship label.
5. For each node, formulate one strong learner-facing question and a short explanation of the conceptual territory (not an essay). Also propose a diorama set: the 3D / 2D explanatory views that would make the concept intelligible, what each view must show, and what can be manipulated. Never force 3D for intrinsically abstract material: use an explanatory 2D map/diagram when spatial simulation would mislead. The app will connect these intentions to authored dioramas.
6. Add controlled generative incompleteness. Select one to three useful challenges across the part, only where the missing information is inferable. Use the six types:
   - structural: conceal a meaningful component of a structure;
   - mechanistic: show an initial and final state, with the mechanism withheld;
   - temporal: pause before a consequential transition;
   - explanatory: present an observation without its cause;
   - relational: omit a meaningful link between known concepts;
   - counterfactual: remove/change a component or variable and ask what follows.
   Each challenge needs stimulus, question, a useful hint, the expected answer, why the answer follows, and the kind of feedback that should be shown after a learner commits a prediction. For structural challenges, list the exact actor/body IDs only when those IDs occur in the supplied step's bodies; never invent scene actors. For other types, list actor IDs only when grounded in the chain. Do not make arbitrary gaps, and do not choose challenges requiring knowledge the supplied material has not introduced.
7. Keep facts and source boundaries honest. Every node carries stepIds and subsectionIds. Never invent PDF pages, figures, measurements, citations, mechanisms or data. Outside knowledge is not needed to complete this atlas. A fact absent from the source must not masquerade as a PDF claim.

Return ONLY JSON:
{
 "version":"scriptorium-atlas/1",
 "question":"the central question this part resolves",
 "nodes":[
  {"id":"stable-kebab-id","title":"short concept title","question":"a question worth exploring","summary":"1–3 precise sentences","stepIds":["S1","S2"],"subsectionIds":["1.1"],"knowledgeKinds":["structural|causal|temporal|relational|quantitative|procedural|historical|abstract"],"visualIntent":"what a diorama or diagram must make visible","dioramaSet":[{"title":"view title","purpose":"explanatory job","mustShow":["specific elements"],"manipulations":["variables or actions"],"medium":"3d|2d"}],"position":{"x":0-100,"y":0-100},"challenges":[{"id":"challenge-slug","type":"structural|mechanistic|temporal|explanatory|relational|counterfactual","stimulus":"what the learner sees or knows","question":"the prediction or reconstruction prompt","hint":"a small clue, not the answer","answer":"the accurate answer","why":"the causal or logical reason","feedback":"what to compare after the attempt","missingBodyIds":["only grounded IDs, otherwise []"]}]}
 ],
 "edges":[{"from":"node-id","to":"node-id","type":"prerequisite|part-of|causes|enables|constrains|transforms-into|regulates|contrasts-with|evidence-for|temporal-before|spatial-within|application-of","label":"short precise relation"}],
 "uncertainties":["explicit limits or ambiguity in the source"],
 "unassignedNotes":[]
}
QUALITY RULES
- All node stepIds together partition every supplied step ID exactly once; a step cannot occur in two nodes.
- Every edge endpoint exists and every challenge is attached to the node that owns its source material.
- Positions should make prerequisites and causal flow readable, with a few cross-links where appropriate.
- Aim for 4–14 nodes for a substantial chapter, but let the source determine the number; a short part can have 1–3, a long complex part can have more.
- Do not manufacture false causal order from the order in which the PDF happens to present material.
- The six incompleteness types are a repertoire, not a quota: use only those that are genuinely teachable from this part.
- Every node must be distinct enough that a learner could describe what its diorama set teaches.
`;
}

export function validateAtlas(A, stepIds) {
  if (!A || typeof A !== 'object' || !Array.isArray(A.nodes) || !A.nodes.length) return 'atlas has no nodes';
  if (!Array.isArray(A.edges)) return 'atlas has no edge array';
  if (A.nodes.length > 36) return 'atlas has too many nodes for one chapter map';
  const ids = new Set(), assigned = [];
  for (const n of A.nodes) {
    if (!n || !/^[a-z0-9][a-z0-9-]{1,55}$/.test(String(n.id || ''))) return 'node has an invalid stable id';
    if (ids.has(n.id)) return 'duplicate node id: ' + n.id;
    ids.add(n.id);
    if (!clean(n.title, 100) || !clean(n.question, 300) || !Array.isArray(n.stepIds) || !n.stepIds.length) return 'node is missing a title, question or stepIds: ' + n.id;
    assigned.push(...n.stepIds.map(String));
    if (!Array.isArray(n.challenges) || n.challenges.some(c => !c || !INCOMPLETENESS.includes(c.type) || !c.question || !c.answer || !c.why)) return 'node has an incomplete or unsupported challenge: ' + n.id;
    if (n.challenges.length > 3) return 'node has more than three challenges: ' + n.id;
    if (!n.position || !Number.isFinite(+n.position.x) || !Number.isFinite(+n.position.y)) return 'node has no finite map position: ' + n.id;
  }
  const want = unique(stepIds), got = unique(assigned);
  if (assigned.length !== got.length) return 'a source step has been assigned to more than one concept node';
  if (want.length !== got.length || want.some(id => !got.includes(id))) return 'the atlas does not partition all source steps (missing or invented step IDs)';
  for (const e of A.edges) if (!e || !ids.has(String(e.from)) || !ids.has(String(e.to)) || e.from === e.to) return 'edge has an invalid endpoint';
  return null;
}

function sourceIndex(analysis, sections, figures) {
  const byId = new Map((sections || []).map(s => [String(s.id), s]));
  const steps = (analysis.chain || []).map(st => {
    const sec = byId.get(String(st.section));
    return {
      stepId: String(st.id), sectionId: st.section || null,
      sectionTitle: sec ? sec.title : null,
      pages: unique([...(st.pages || []), ...(sec ? [sec.startPage, sec.endPage] : [])].filter(Boolean)).map(Number).filter(Number.isFinite),
      figureIds: unique([...(st.figures || []), ...(st.figureRefs || []).map(x => x && x.id)].filter(Boolean)),
      externalSources: (st.sources || []).map(s => ({ title: s.title || '', doi: s.doi || '', url: s.url || '' }))
    };
  });
  return {
    method: 'PDF hierarchy + subsection text + validated chain step mappings',
    sourceSubsections: (sections || []).map(s => ({ id: s.id, title: s.title, startPage: s.startPage, endPage: s.endPage })),
    pdfFigureIndex: (figures || []).map(f => ({ id: f.id, label: f.label, page: f.page, caption: f.caption || '' })),
    stepMappings: steps,
    completeness: {
      chainSteps: steps.length,
      indexedSteps: steps.length,
      missingPageReferences: steps.filter(s => !s.pages.length).map(s => s.stepId),
      sectionMappingsAbsent: steps.filter(s => !s.sectionId).map(s => s.stepId)
    }
  };
}

export async function compileAtlas({ book, part, analysis, sections = [], figures = [], onStatus, signal, auto = true } = {}) {
  const ids = (analysis.chain || []).map(st => String(st.id));
  if (!ids.length) throw new Error('Cannot compile a concept atlas without validated chain steps');
  let authored = null, failure = null;
  if (auto) {
    try {
      onStatus && onStatus('Mapping the chapter’s concepts and dependencies…');
      const prompt = atlasPrompt({ book, part, analysis, sections });
      authored = await askJSON(prompt, {
        role: 'director', signal, fresh: true,
        onStatus, manualTitle: 'Build this chapter concept atlas',
        validate: v => validateAtlas(v && (v.atlas || v), ids)
      });
      authored = authored && (authored.atlas || authored);
      const issue = validateAtlas(authored, ids);
      if (issue) throw new Error(issue);
    } catch (e) {
      if (e && e.code === 'cancelled') throw e;
      failure = String((e && (e.message || e.code)) || e);
      authored = null;
    }
  }
  // Deterministic fallback is explicit: it groups the validated chain by its existing subsection, not by AI-invented semantics.
  if (!authored) {
    const groups = new Map();
    (analysis.chain || []).forEach(st => {
      const key = String(st.section || 'unsectioned');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(st);
    });
    authored = {
      version: 'scriptorium-atlas/1',
      question: analysis.question || part,
      nodes: [...groups.entries()].map(([sectionId, steps], i) => ({
        id: 'source-group-' + (i + 1), title: clean((sections.find(s => String(s.id) === sectionId) || {}).title || steps[0].title || sectionId, 90),
        question: clean(steps[0].answers || steps[0].title, 260), summary: clean(steps.map(s => s.statement).join(' '), 420),
        stepIds: steps.map(s => String(s.id)), subsectionIds: [sectionId], knowledgeKinds: ['abstract'], visualIntent: 'AI semantic grouping was unavailable; inspect the linked source steps before treating this as a conceptual model.',
        dioramaSet: [], position: { x: 50, y: groups.size < 2 ? 50 : 12 + i * (76 / (groups.size - 1)) }, challenges: []
      })),
      edges: [...groups.keys()].slice(1).map((id, i) => ({ from: 'source-group-' + (i + 1), to: 'source-group-' + (i + 2), type: 'temporal-before', label: 'source order; semantic dependency not assessed' })),
      uncertainties: ['Semantic clustering did not complete. These are subsection-based source groups, not AI-validated concept relationships.'],
      unassignedNotes: []
    };
  }
  // Ground every map node in exact source chain and subsection IDs; AI-authored source claims never overwrite these records.
  const byStep = new Map((analysis.chain || []).map(st => [String(st.id), st]));
  authored.nodes = authored.nodes.map(n => {
    const stepIds = unique(n.stepIds).filter(id => byStep.has(id));
    const subIds = unique(stepIds.map(id => byStep.get(id).section).filter(Boolean));
    const refs = stepIds.map(id => byStep.get(id));
    const dioramas = [];
    refs.forEach(st => (st.demos || []).forEach((d, i) => {
      if (isScene(d)) dioramas.push({ stepId: String(st.id), demoIndex: i, title: clean(d.title || st.title, 100), purpose: clean(d.purpose || st.answers || st.title, 220) });
    }));
    return {
      ...n,
      stepIds, subsectionIds: subIds,
      title: clean(n.title, 100), question: clean(n.question, 300), summary: clean(n.summary, 500),
      position: { x: Math.max(4, Math.min(96, +n.position.x)), y: Math.max(4, Math.min(96, +n.position.y)) },
      dioramaRefs: dioramas,
      sourceRefs: {
        stepIds, subsectionIds: subIds,
        pages: unique(refs.flatMap(st => st.pages || []).filter(Number.isFinite)).map(Number),
        figureIds: unique(refs.flatMap(st => st.figures || [])),
        externalSources: refs.flatMap(st => (st.sources || []).map(s => ({ title: s.title || '', doi: s.doi || '', url: s.url || '' })))
      }
    };
  });
  const index = sourceIndex(analysis, sections, figures);
  index.webResearch = analysis.researchEvidence ? { ...analysis.researchEvidence, citations: (analysis.researchEvidence.citations || []).filter(c => c && /^https:\/\//i.test(c.url)) } : null;
  const atlas = {
    ...authored,
    sourceIndex: index,
    audit: {
      generatedAt: new Date().toISOString(),
      method: failure ? 'deterministic subsection fallback' : 'AI semantic clustering with strict source-step coverage validation',
      engine: lastRoute.provider || 'configured AI engine (route not exposed)',
      model: lastRoute.model || null,
      sourceStepCount: ids.length,
      assignedStepCount: unique(authored.nodes.flatMap(n => n.stepIds)).length,
      fallbackReason: failure || null,
      certainty: failure ? 'low: section grouping only' : 'AI-generated; inspect the source links and uncertainty notes',
      webResearch: index.webResearch ? { provider: index.webResearch.provider || null, model: index.webResearch.model || null, searches: index.webResearch.searched || 0, citations: index.webResearch.citations.length } : { status: 'no web-search citations recorded' }
    }
  };
  return atlas;
}
