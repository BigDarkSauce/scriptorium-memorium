// Semantic chapter atlas compiler.
// It converts the already validated, PDF-grounded reasoning chain into topic-level concepts and typed relationships.
// This is AI-assisted semantic clustering, not a claim that the PDF has been "understood perfectly":
// the deterministic source index and validation report show what was grouped and what could not be mapped.
import { askJSON } from './claude.js';
import { lastRoute } from './free.js';
import { validateFigure } from '../room/figspec.js';

export const INCOMPLETENESS = [
  'structural', 'mechanistic', 'temporal', 'explanatory', 'relational', 'counterfactual'
];
const clean = (x, n = 500) => String(x == null ? '' : x).replace(/\s+/g, ' ').trim().slice(0, n);
const unique = xs => [...new Set((xs || []).filter(x => x != null).map(String))];
const isScene = d => !!(d && (d.type === 'scene' || Array.isArray(d.bodies) || (typeof d.type === 'string' && d.type !== 'figure')));
const stepFigureIds = step => unique([
  ...(step && Array.isArray(step.figures) ? step.figures.map(x => typeof x === 'string' ? x : x && x.id) : []),
  ...(step && Array.isArray(step.figureRefs) ? step.figureRefs.map(x => typeof x === 'string' ? x : x && x.id) : [])
].filter(Boolean));

/**
 * Build an auditable map from validated chain steps to figures that were actually extracted.
 * References absent from the extracted index remain unresolved; they are never silently promoted
 * into image attachments or presented as verified source evidence.
 */
export function sourceFigureEvidence(stepIds, sourceSteps = [], figures = []) {
  const wantedSteps = unique(stepIds);
  const byStep = new Map((sourceSteps || []).map(step => [String(step.id), step]));
  const figureSteps = new Map();
  wantedSteps.forEach(stepId => {
    const step = byStep.get(stepId);
    if (!step) return;
    stepFigureIds(step).forEach(figureId => {
      if (!figureSteps.has(figureId)) figureSteps.set(figureId, []);
      figureSteps.get(figureId).push(stepId);
    });
  });
  const indexed = new Map((figures || []).filter(f => f && f.id != null).map(f => [String(f.id), f]));
  const metadata = figureId => {
    const f = indexed.get(figureId);
    if (!f) return null;
    return {
      id: figureId,
      label: clean(f.label || f.id, 180),
      ...(f.kind ? { kind: String(f.kind) } : {}),
      caption: clean(f.caption || '', 500),
      ...(f.page != null && Number.isFinite(+f.page) ? { page: +f.page } : {}),
      ...(f.slide != null && Number.isFinite(+f.slide) ? { slide: +f.slide } : {}),
      ...(f.mediaPath ? { mediaPath: String(f.mediaPath) } : {}),
      stepIds: unique(figureSteps.get(figureId) || [])
    };
  };
  const referencedIds = [...figureSteps.keys()];
  return {
    figures: referencedIds.map(metadata).filter(Boolean),
    unresolvedFigureIds: referencedIds.filter(id => !indexed.has(id))
  };
}

/** Select only indexed, step-linked image assets, prioritising IDs explicitly requested by the concept plan. */
export function selectSourceFigureAttachments(node, sourceSteps = [], figures = [], max = 4) {
  const evidence = sourceFigureEvidence(node && node.stepIds || [], sourceSteps, figures);
  const linked = new Map(evidence.figures.map(record => [record.id, record]));
  const requested = unique((node && node.dioramaSet || []).flatMap(view => Array.isArray(view && view.sourceFigureIds) ? view.sourceFigureIds : []));
  const priority = [...requested, ...evidence.figures.map(record => record.id)];
  const byId = new Map((figures || []).filter(f => f && f.id != null).map(f => [String(f.id), f]));
  const limit = Number.isFinite(+max) ? Math.max(0, Math.floor(+max)) : 0;
  const selected = [];
  for (const id of unique(priority)) {
    if (selected.length >= limit) break;
    const record = linked.get(id), asset = byId.get(id);
    if (!record || !asset || typeof asset.dataUrl !== 'string' || !/^data:image\//i.test(asset.dataUrl)) continue;
    selected.push(asset);
  }
  return selected;
}

/** Metadata manifest for the exact image order passed to a vision-capable request. */
export function sourceFigureAttachmentManifest(node, sourceSteps = [], figures = [], max = 4) {
  const evidence = sourceFigureEvidence(node && node.stepIds || [], sourceSteps, figures);
  return selectSourceFigureAttachments(node, sourceSteps, figures, max).map((asset, index) => {
    const record = evidence.figures.find(item => item.id === String(asset.id));
    return record ? { attachmentIndex: index + 1, ...record } : null;
  }).filter(Boolean);
}

/**
 * Structured PowerPoint charts/SmartArt are linked to concepts by exact slide location.
 * This is a source locator link, not a claim that every object on the slide is semantically relevant.
 */
export function sourceVisualEvidence(stepIds, sourceSteps = [], sections = []) {
  const wanted = new Set(unique(stepIds));
  const sectionById = new Map((sections || []).map(section => [String(section.id), section]));
  const slideForStep = step => {
    const section = sectionById.get(String(step && step.section));
    return unique([
      ...(step && Array.isArray(step.pages) ? step.pages : []),
      ...(section ? [section.sourceSlide, section.startPage] : [])
    ].filter(Number.isFinite).map(Number));
  };
  const visuals = [];
  for (const section of sections || []) {
    for (const visual of section && Array.isArray(section.sourceVisuals) ? section.sourceVisuals : []) {
      if (!visual || !visual.id || !Number.isFinite(Number(visual.slide))) continue;
      const slide = Number(visual.slide);
      const linkedSteps = (sourceSteps || []).filter(step => wanted.has(String(step.id)) &&
        (String(step.section || '') === String(section.id) || slideForStep(step).includes(slide))
      ).map(step => String(step.id));
      if (!linkedSteps.length) continue;
      visuals.push({
        id: String(visual.id), kind: String(visual.kind || 'visual'),
        label: clean(visual.label || visual.caption || visual.id, 180),
        caption: clean(visual.caption || '', 500), slide,
        mediaPath: visual.mediaPath || '',
        sourceSectionId: String(section.id),
        sourceSectionTitle: clean(section.title || '', 180),
        stepIds: unique(linkedSteps),
        linkBasis: 'same-slide source locator',
        data: visual.data || {}
      });
    }
  }
  return { slides: unique(visuals.map(v => v.slide)), visuals };
}

/** Deterministic source-to-visual compilation; keeps source data separate from illustrative layout. */
export function buildVisualReconstructionBrief(node, sourceSteps = [], sections = [], sourceFigures = []) {
  const stepIds = unique(node && node.stepIds || []);
  const steps = (sourceSteps || []).filter(step => stepIds.includes(String(step.id)));
  const visuals = sourceVisualEvidence(stepIds, steps, sections);
  const figures = sourceFigureEvidence(stepIds, steps, sourceFigures);
  const tables = steps.filter(step => step.table && typeof step.table === 'object').map(step => ({
    stepId: String(step.id), caption: step.table.caption || '',
    columns: Array.isArray(step.table.columns) ? step.table.columns : [],
    rows: Array.isArray(step.table.rows) ? step.table.rows : []
  }));
  const equations = steps.filter(step => step.math || (step.derivation || []).length).map(step => ({
    stepId: String(step.id), expression: step.math || '',
    derivation: (step.derivation || []).map(item => ({ expression: item.expr || '', reason: item.why || '' }))
  }));
  const dependencies = steps.filter(step => Array.isArray(step.from) && step.from.length).map(step => ({
    stepId: String(step.id), dependsOnStepIds: unique(step.from).filter(id => stepIds.includes(id))
  }));
  return {
    conceptNodeId: node && node.id || '', sourceStepIds: stepIds,
    sourceSlides: visuals.slides, structuredVisuals: visuals.visuals,
    rasterFigures: figures.figures, unresolvedFigureIds: figures.unresolvedFigureIds,
    sourceTables: tables, sourceEquations: equations,
    sourceActors: unique(steps.flatMap(step => Array.isArray(step.bodies) ? step.bodies : [])),
    stepDependencies: dependencies,
    reconstructionRules: [
      'Preserve cached chart categories and values exactly; do not recalculate missing points, interpolate gaps or infer axis units.',
      'For SmartArt, preserve the exact node IDs, labels and directed connections. A connection is a source diagram link, not automatically a causal mechanism.',
      'Reconstruct table cells and symbolic expressions exactly before adding explanatory annotations.',
      'Use source-linked actors and relationships as the factual model. New layout geometry may be illustrative, but must not be presented as measured source geometry.',
      'Do not infer physical scale, coordinates, proportions, units or quantitative values from a raster screenshot alone.',
      'Keep unresolved figure references unresolved and separate any standard-theory additions from source claims.'
    ]
  };
}

/**
 * Convert supported source visuals into a faithful, locally rendered 2D figure.
 * No category/value is interpolated, no physical unit is invented, and SmartArt
 * connections are carried as source links rather than causal claims.
 */
export function sourceVisualFigure(record) {
  if (!record || !record.data) return null;
  const data = record.data, slide = Number(record.slide) || null;
  const captionBase = clean(record.label || data.title || record.id, 180);
  let spec = null;
  if (record.kind === 'chart') {
    const series = Array.isArray(data.series) ? data.series : [];
    const first = series[0];
    const categories = first && Array.isArray(first.points) ? first.points.map(p => p && p.category) : [];
    const alignedCategories = categories.length > 0 && categories.length <= 24 && series.length > 0 && series.length <= 7 &&
      categories.every(x => x != null && String(x).trim() !== '') &&
      series.every(s => Array.isArray(s.points) && s.points.length === categories.length &&
        s.points.every((p, i) => p && String(p.category) === String(categories[i]) && p.rawValue != null));
    const complete = alignedCategories && series.length <= 4 &&
      series.every(s => s.points.every(p => Number.isFinite(p.value)));
    if (data.chartKind === 'bar' && complete) {
      spec = {
        kind: 'bars',
        caption: 'Source chart: ' + captionBase + (slide ? ' · slide ' + slide : '') + '. Cached values; no axis unit inferred.',
        categories: categories.map(String),
        series: series.map(s => ({ name: s.name || 'Series', values: s.points.map(p => p.value) }))
      };
    } else if (alignedCategories && categories.length <= 14) {
      spec = {
        kind: 'table',
        caption: 'Source chart data: ' + captionBase + (slide ? ' · slide ' + slide : '') + '. Raw cached values; original chart type: ' + (data.chartKind || 'unknown') + '.',
        columns: ['Category', ...series.map(s => clean(s.name || 'Series', 30))],
        rows: categories.map((category, i) => [String(category == null ? '' : category), ...series.map(s => String(s.points[i].rawValue))])
      };
    }
  } else if (record.kind === 'smartart') {
    const nodes = Array.isArray(data.nodes) ? data.nodes : [];
    const links = Array.isArray(data.links) ? data.links : [];
    const nodeIds = new Set(nodes.map(n => String(n && n.id || '')).filter(Boolean));
    const complete = nodes.length >= 2 && nodes.length <= 12 && links.length > 0 && links.length <= 24 &&
      !(+data.omittedNodes || 0) && !(+data.omittedLinks || 0) &&
      nodes.every(n => n && n.id && n.label) &&
      links.every(e => e && nodeIds.has(String(e.from)) && nodeIds.has(String(e.to)));
    if (complete) {
      spec = {
        kind: 'flow',
        caption: 'SmartArt source structure: ' + captionBase + (slide ? ' · slide ' + slide : '') + '. Layout redrawn; source node IDs and connection types retained.',
        dir: 'LR',
        nodes: nodes.map(n => ({ id: String(n.id), label: String(n.label) })),
        edges: links.map(e => ({ from: String(e.from), to: String(e.to), ...(e.type ? { label: String(e.type) } : {}) }))
      };
    } else if (nodes.length >= 2 && nodes.length <= 14) {
      // When original connections are absent or truncated, show only the node inventory.
      // Never let the flow renderer's convenience fallback invent a chain of edges.
      spec = {
        kind: 'table',
        caption: 'SmartArt source node inventory: ' + captionBase + (slide ? ' · slide ' + slide : '') + '. Original connections are absent or incomplete; none are inferred.',
        columns: ['Source node ID', 'Label', 'Source type'],
        rows: nodes.map(n => [String(n.id || ''), String(n.label || ''), String(n.type || '')])
      };
    }
  }
  if (!spec) return null;
  const checked = validateFigure(spec);
  return checked.ok ? checked.fig : null;
}

/** Build only the diagram entries selected by this concept's own view plan. */
export function selectedSourceVisualFigures(node, sourceSteps = [], sections = []) {
  const selected = new Set(unique((node && node.dioramaSet || []).flatMap(view =>
    Array.isArray(view && view.sourceVisualIds) ? view.sourceVisualIds : []
  )));
  if (!selected.size) return [];
  return sourceVisualEvidence(node && node.stepIds || [], sourceSteps, sections).visuals
    .filter(record => selected.has(record.id))
    .map(record => {
      const figure = sourceVisualFigure(record);
      return figure ? {
        stepId: record.stepIds[0] || String((node.stepIds || [])[0] || ''),
        title: clean(record.label || record.kind, 100),
        purpose: record.kind === 'chart'
          ? 'A faithful 2D reconstruction of the source chart cache.'
          : 'A 2D reconstruction of the source SmartArt nodes and connections.',
        figure, sourceVisualId: record.id, sourceSlide: record.slide, sourceKind: record.kind
      } : null;
    }).filter(Boolean);
}

export function atlasPrompt({ book, sourceType = 'pdf', part, analysis, sections = [], figures = [] }) {
  const sourceUnit = sourceType === 'pptx' ? 'presentation slide source units' : 'PDF subsections';
  const S = (analysis.chain || []).map(st => ({
    id: st.id, kind: st.kind, title: st.title, statement: st.statement,
    question: st.answers, opens: st.opens, section: st.section,
    from: st.from, bodies: st.bodies, explanation: (st.explain || []).map(x => x && x.text).filter(Boolean).join(' ').slice(0, 800),
    terms: (st.terms || []).map(x => ({ term: x.term, meaning: x.meaning })),
    figures: st.figures, pages: st.pages, sources: st.sources
  }));
  const C = sections.map(s => ({ id: s.id, title: s.title, level: s.level, startPage: s.startPage, endPage: s.endPage, summary: clean(s.text, 650) }));
  const figureEvidence = sourceFigureEvidence((analysis.chain || []).map(st => st.id), analysis.chain || [], figures);
  const visualEvidence = sourceVisualEvidence((analysis.chain || []).map(st => st.id), analysis.chain || [], sections);
  return `You are compiling a semantic chapter atlas for Scriptorium Memorialium. Do NOT write a conventional lesson, article, page-by-page summary, or long prose scroll. The output is a compact, accurate, auditable topic graph that will be rendered as a 2D mind map. Each map node represents a coherent explanatory diorama set.

SOURCE
Book: ${book}
Chapter / part: ${part}
${sourceUnit} (stable IDs and source spans):
${JSON.stringify(C)}
Validated reasoning steps (the IDs are authoritative; preserve them exactly):
${JSON.stringify(S)}

SOURCE FIGURE INDEX (only locally extracted figures actually referenced by a validated source step; sourceFigureIds must be selected from this list):
${JSON.stringify(figureEvidence.figures)}
Unresolved figure references (not attachable, not valid sourceFigureIds):
${JSON.stringify(figureEvidence.unresolvedFigureIds)}

STRUCTURED SOURCE VISUAL INDEX (chart caches and SmartArt data extracted directly from the PowerPoint package; each record is linked to exact steps on the same slide):
${JSON.stringify(visualEvidence.visuals)}
These are structured source data, not image guesses. Preserve chart values and SmartArt node/connection IDs exactly. The original SmartArt layout and chart axis units may be unavailable.

TASK
1. Discover the conceptual structure across the whole part. Group steps by meaning, mechanism, purpose and prerequisite—not by page boundaries, equal-sized batches or superficial word similarity. Treat a subsection as a source locator, not automatically a concept. A concept may span subsections; one subsection may contain several distinct concepts.
2. Create an appropriate number of topic nodes for the information's true breadth and depth. Prefer a small map of coherent, sufficiently deep concepts over a long flat list. Split a node when its steps explain meaningfully different mechanisms, states, scales or questions. Merge nodes only when they genuinely form one explanatory unit. Preserve prerequisites and dependencies.
3. Assign every supplied step ID to exactly one node. No invented or missing step IDs. The map must account for the complete source chain.
4. Create typed directed edges between nodes: prerequisite, part-of, causes, enables, constrains, transforms-into, regulates, contrasts-with, evidence-for, temporal-before, spatial-within, or application-of. Direction must mean something; do not add decorative edges. Include a short relationship label.
5. For each node, formulate one strong learner-facing question and a short explanation of the conceptual territory (not an essay). Also propose a diorama set: the 3D / 2D explanatory views that would make the concept intelligible, what each view must show, and what can be manipulated. Each view MUST include sourceFigureIds and sourceVisualIds (arrays; use [] when no directly relevant source asset exists). Select sourceFigureIds only from the SOURCE FIGURE INDEX and only when the figure is referenced by a step assigned to this node. Select sourceVisualIds only from the STRUCTURED SOURCE VISUAL INDEX and only when the source visual shares a slide with one of the node's validated steps. Never invent IDs or infer a relationship from visual similarity. A same-slide link is a locator, not proof that the visual explains every step. Never force 3D for intrinsically abstract material: use an explanatory 2D map/diagram when spatial simulation would mislead. The app will connect these intentions to authored dioramas.
6. Add controlled generative incompleteness. Select one to three useful challenges across the part, only where the missing information is inferable. Use the six types:
   - structural: conceal a meaningful component of a structure;
   - mechanistic: show an initial and final state, with the mechanism withheld;
   - temporal: pause before a consequential transition;
   - explanatory: present an observation without its cause;
   - relational: omit a meaningful link between known concepts;
   - counterfactual: remove/change a component or variable and ask what follows.
   Each challenge needs stimulus, question, a useful hint, the expected answer, why the answer follows, and the kind of feedback that should be shown after a learner commits a prediction. Also provide a reasoning array of 2–5 short, ordered reveal units. Each unit must contain a concise title, a plain-language text, and sourceStepIds listing one or more exact step IDs from this node that support that unit. The units must build the answer in small inferential moves, not repeat the final answer in fragments. The learner sees the question first; after committing and revealing the expected answer, each UNFOLD action exposes exactly one next unit in the same challenge. Keep earlier units visible. Never use an UNFOLD action to advance to another challenge. For structural challenges, list the exact actor/body IDs only when those IDs occur in the supplied step's bodies; never invent scene actors. For other types, list actor IDs only when grounded in the chain. Do not make arbitrary gaps, and do not choose challenges requiring knowledge the supplied material has not introduced.
7. Keep facts and source boundaries honest. Every node carries stepIds and subsectionIds. Never invent PDF pages, figures, measurements, citations, mechanisms or data. Outside knowledge is not needed to complete this atlas. A fact absent from the source must not masquerade as a PDF claim.

Return ONLY JSON:
{
 "version":"scriptorium-atlas/1",
 "question":"the central question this part resolves",
 "nodes":[
  {"id":"stable-kebab-id","title":"short concept title","question":"a question worth exploring","summary":"1–3 precise sentences","stepIds":["S1","S2"],"subsectionIds":["1.1"],"knowledgeKinds":["structural|causal|temporal|relational|quantitative|procedural|historical|abstract"],"visualIntent":"what a diorama or diagram must make visible","dioramaSet":[{"title":"view title","purpose":"explanatory job","mustShow":["specific elements"],"manipulations":["variables or actions"],"medium":"3d|2d","sourceFigureIds":["only exact, indexed IDs referenced by this node's steps; otherwise []"],"sourceVisualIds":["only exact structured visual IDs on a slide mapped to this node; otherwise []"]}],"position":{"x":0-100,"y":0-100},"challenges":[{"id":"challenge-slug","type":"structural|mechanistic|temporal|explanatory|relational|counterfactual","stimulus":"what the learner sees or knows","question":"the prediction or reconstruction prompt","hint":"a small clue, not the answer","answer":"the accurate answer","why":"the causal or logical reason","feedback":"what to compare after the attempt","reasoning":[{"title":"first inferential move","text":"one short reasoning unit","sourceStepIds":["S1"]},{"title":"next inferential move","text":"the next linked unit","sourceStepIds":["S2"]}],"missingBodyIds":["only grounded IDs, otherwise []"]}]}
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

export function validateAtlas(A, stepIds, sourceSteps = [], requireProgressive = false, sourceFigures = [], requireVisualEvidence = false, sourceSections = []) {
  if (!A || typeof A !== 'object' || !Array.isArray(A.nodes) || !A.nodes.length) return 'atlas has no nodes';
  if (!Array.isArray(A.edges)) return 'atlas has no edge array';
  if (A.nodes.length > 36) return 'atlas has too many nodes for one chapter map';
  const ids = new Set(), assigned = [], challengeIds = new Set();
  const bodyIndex = new Map((sourceSteps || []).map(st => [String(st.id), (st.bodies || []).map(String)]));
  for (const n of A.nodes) {
    if (!n || !/^[a-z0-9][a-z0-9-]{1,55}$/.test(String(n.id || ''))) return 'node has an invalid stable id';
    if (ids.has(n.id)) return 'duplicate node id: ' + n.id;
    ids.add(n.id);
    if (!clean(n.title, 100) || !clean(n.question, 300) || !clean(n.summary, 500) || !Array.isArray(n.stepIds) || !n.stepIds.length) return 'node is missing a title, question, summary or stepIds: ' + n.id;
    assigned.push(...n.stepIds.map(String));
    if (!Array.isArray(n.dioramaSet) || !n.dioramaSet.length || n.dioramaSet.some(v => !v || !clean(v.title, 100) || !clean(v.purpose, 220) || !['2d', '3d'].includes(v.medium) || !Array.isArray(v.mustShow) || !Array.isArray(v.manipulations) || (requireVisualEvidence && (!Array.isArray(v.sourceFigureIds) || !Array.isArray(v.sourceVisualIds))))) return 'node is missing a complete explanatory-view plan: ' + n.id;
    if (requireVisualEvidence) {
      const linkedFigureIds = new Set(sourceFigureEvidence(n.stepIds, sourceSteps, sourceFigures).figures.map(f => f.id));
      const linkedVisualIds = new Set(sourceVisualEvidence(n.stepIds, sourceSteps, sourceSections).visuals.map(v => v.id));
      for (const view of n.dioramaSet) {
        if (view.sourceFigureIds.some(id => !linkedFigureIds.has(String(id)))) return 'view cites an unknown or unlinked source figure: ' + n.id + '/' + (view.title || 'untitled');
        if (unique(view.sourceFigureIds).length !== view.sourceFigureIds.length) return 'view repeats a source figure ID: ' + n.id + '/' + (view.title || 'untitled');
        if (view.sourceVisualIds.some(id => !linkedVisualIds.has(String(id)))) return 'view cites an unknown or unlinked structured source visual: ' + n.id + '/' + (view.title || 'untitled');
        if (unique(view.sourceVisualIds).length !== view.sourceVisualIds.length) return 'view repeats a structured source visual ID: ' + n.id + '/' + (view.title || 'untitled');
      }
    }
    if (!Array.isArray(n.challenges) || n.challenges.some(c => !c || !INCOMPLETENESS.includes(c.type) || !c.id || !c.question || !c.stimulus || !c.hint || !c.answer || !c.why || !c.feedback || !Array.isArray(c.missingBodyIds))) return 'node has an incomplete or unsupported challenge: ' + n.id;
    if (n.challenges.length > 3) return 'node has more than three challenges: ' + n.id;
    const allowedBodies = new Set(n.stepIds.flatMap(id => bodyIndex.get(String(id)) || []));
    for (const ch of n.challenges) {
      if (challengeIds.has(ch.id)) return 'atlas has a duplicate challenge id: ' + ch.id;
      challengeIds.add(ch.id);
      if (ch.type === 'structural' && ch.missingBodyIds.some(id => !allowedBodies.has(String(id)))) return 'structural challenge refers to an actor not listed in the node source steps: ' + ch.id;
      // New atlases carry a source-mapped, bitwise reasoning path. Keep the field optional for older saved atlases;
      // the reader supplies a single legacy explanation unit rather than inventing new reasoning.
      if (requireProgressive && (!Array.isArray(ch.reasoning) || ch.reasoning.length < 2)) return 'newly authored challenge must provide 2–5 ordered reveal units: ' + ch.id;
      if (ch.reasoning != null) {
        if (!Array.isArray(ch.reasoning) || ch.reasoning.length < 1 || ch.reasoning.length > 5) return 'challenge reasoning must contain 1–5 ordered reveal units: ' + ch.id;
        const nodeSteps = new Set(n.stepIds.map(String));
        for (const unit of ch.reasoning) {
          if (!unit || !clean(unit.title, 100) || !clean(unit.text, 700) || !Array.isArray(unit.sourceStepIds) || !unit.sourceStepIds.length) return 'challenge reasoning unit is missing a title, text or sourceStepIds: ' + ch.id;
          if (unit.sourceStepIds.some(id => !nodeSteps.has(String(id)))) return 'challenge reasoning unit cites a step outside its concept node: ' + ch.id;
        }
      }
    }
    if (!n.position || !Number.isFinite(+n.position.x) || !Number.isFinite(+n.position.y) || +n.position.x < 0 || +n.position.x > 100 || +n.position.y < 0 || +n.position.y > 100) return 'node has no valid map position: ' + n.id;
  }
  const want = unique(stepIds), got = unique(assigned);
  if (assigned.length !== got.length) return 'a source step has been assigned to more than one concept node';
  if (want.length !== got.length || want.some(id => !got.includes(id))) return 'the atlas does not partition all source steps (missing or invented step IDs)';
  const edgeTypes = new Set(['prerequisite','part-of','causes','enables','constrains','transforms-into','regulates','contrasts-with','evidence-for','temporal-before','spatial-within','application-of']);
  for (const e of A.edges) if (!e || !ids.has(String(e.from)) || !ids.has(String(e.to)) || e.from === e.to || !edgeTypes.has(String(e.type)) || !clean(e.label, 120)) return 'edge has an invalid endpoint, type or relationship label';
  if (A.memoryPlaces != null && !Array.isArray(A.memoryPlaces)) return 'atlas memoryPlaces must be an array';
  const memoryNodes = new Set(), memoryLocations = new Set();
  for (const place of A.memoryPlaces || []) {
    if (!place || !clean(place.nodeId, 80) || !ids.has(String(place.nodeId))) return 'memory place refers to a concept node not present in the atlas';
    if (memoryNodes.has(String(place.nodeId))) return 'atlas has more than one memory place for concept node: ' + place.nodeId;
    memoryNodes.add(String(place.nodeId));
    if (!clean(place.caseId, 100) || !Number.isInteger(+place.row) || +place.row < 0 || !Number.isInteger(+place.slot) || +place.slot < 0 || !clean(place.association, 240)) return 'memory place has an invalid bookcase, row, slot or association: ' + place.nodeId;
    const location = [String(place.caseId), String(+place.row), String(+place.slot)].join(':');
    if (memoryLocations.has(location)) return 'two concept nodes share the same loci location: ' + place.caseId + ' row ' + place.row + ' slot ' + place.slot;
    memoryLocations.add(location);
    if (place.review != null) {
      if (!place.review || typeof place.review !== 'object' || Array.isArray(place.review)) return 'memory place has an invalid recall record: ' + place.nodeId;
      if (place.review.response != null && (typeof place.review.response !== 'string' || place.review.response.length > 1200)) return 'memory place recall response is too long: ' + place.nodeId;
      if (place.review.confidence != null && !['', 'Low', 'Medium', 'High'].includes(place.review.confidence)) return 'memory place recall confidence is invalid: ' + place.nodeId;
      if (place.review.rating != null && !['again', 'recalled'].includes(place.review.rating)) return 'memory place recall rating is invalid: ' + place.nodeId;
      if (place.review.gradedAt != null && (typeof place.review.gradedAt !== 'string' || !Number.isFinite(Date.parse(place.review.gradedAt)))) return 'memory place recall timestamp is invalid: ' + place.nodeId;
      if (place.review.history != null) {
        if (!Array.isArray(place.review.history) || place.review.history.length > 12) return 'memory place recall history must contain at most twelve attempts: ' + place.nodeId;
        for (const attempt of place.review.history) {
          if (!attempt || typeof attempt.response !== 'string' || attempt.response.length > 1200 || !['', 'Low', 'Medium', 'High'].includes(attempt.confidence || '')) return 'memory place recall history contains an invalid attempt: ' + place.nodeId;
          if (attempt.rating != null && !['again', 'recalled'].includes(attempt.rating)) return 'memory place recall history contains an invalid rating: ' + place.nodeId;
          if (attempt.gradedAt != null && (typeof attempt.gradedAt !== 'string' || !Number.isFinite(Date.parse(attempt.gradedAt)))) return 'memory place recall history contains an invalid timestamp: ' + place.nodeId;
        }
      }
    }
  }
  return null;
}

function sourceIndex(analysis, sections, figures, sourceType = 'pdf') {
  const byId = new Map((sections || []).map(s => [String(s.id), s]));
  const steps = (analysis.chain || []).map(st => {
    const sec = byId.get(String(st.section));
    return {
      stepId: String(st.id), sectionId: st.section || null,
      sectionTitle: sec ? sec.title : null,
      pages: unique([...(st.pages || []), ...(sec ? [sec.startPage, sec.endPage] : [])].filter(Boolean)).map(Number).filter(Number.isFinite),
      ...(sourceType === 'pptx' ? { slides: unique([...(st.pages || []), ...(sec ? [sec.startPage, sec.endPage] : [])].filter(Boolean)).map(Number).filter(Number.isFinite) } : {}),
      figureIds: stepFigureIds(st),
      externalSources: (st.sources || []).map(s => ({ title: s.title || '', doi: s.doi || '', url: s.url || '' }))
    };
  });
  return {
    method: 'Locally extracted source hierarchy + subsection text + validated chain step mappings',
    sourceSubsections: (sections || []).map(s => ({ id: s.id, title: s.title, startPage: s.startPage, endPage: s.endPage, ...(sourceType === 'pptx' ? { slide: s.sourceSlide || s.startPage } : {}) })),
    pdfFigureIndex: (figures || []).map(f => {
      const links = sourceFigureEvidence((analysis.chain || []).map(st => st.id), analysis.chain || [], [f]).figures[0];
      return { id: f.id, label: f.label, kind: f.kind, page: f.page, ...(f.slide != null ? { slide: f.slide } : {}), ...(f.mediaPath ? { mediaPath: f.mediaPath } : {}), caption: f.caption || '', stepIds: links ? links.stepIds : [] };
    }),
    unresolvedFigureIds: sourceFigureEvidence((analysis.chain || []).map(st => st.id), analysis.chain || [], figures).unresolvedFigureIds,
    sourceVisualIndex: sourceVisualEvidence((analysis.chain || []).map(st => st.id), analysis.chain || [], sections).visuals,
    stepMappings: steps,
    completeness: {
      chainSteps: steps.length,
      indexedSteps: steps.length,
      missingPageReferences: steps.filter(s => !s.pages.length).map(s => s.stepId),
      sectionMappingsAbsent: steps.filter(s => !s.sectionId).map(s => s.stepId)
    }
  };
}

export async function compileAtlas({ book, sourceType = 'pdf', part, analysis, sections = [], figures = [], onStatus, signal, auto = true, researchAudit = [] } = {}) {
  const ids = (analysis.chain || []).map(st => String(st.id));
  if (!ids.length) throw new Error('Cannot compile a concept atlas without validated chain steps');
  let authored = null, failure = null;
  if (auto) {
    try {
      onStatus && onStatus('Mapping the chapter’s concepts and dependencies…');
      const prompt = atlasPrompt({ book, sourceType, part, analysis, sections, figures });
      const response = await askJSON(prompt, {
        role: 'director', signal, fresh: true,
        onStatus, manualTitle: 'Build this chapter concept atlas',
        onResearch: x => { if (!researchAudit.some(y => x.callId && y.callId === x.callId)) researchAudit.push({ ...x, task: 'Semantic chapter atlas' }); },
        validate: v => validateAtlas(v && (v.atlas || v), ids, analysis.chain, true, figures, true, sections)
      });
      const atlasResearch = response && response._webResearch || null;
      authored = response && (response.atlas || response);
      if (atlasResearch) { authored._atlasWebResearch = atlasResearch; if (!researchAudit.some(y => atlasResearch.callId && y.callId === atlasResearch.callId)) researchAudit.push({ ...atlasResearch, task: 'Semantic chapter atlas' }); }
      const issue = validateAtlas(authored, ids, analysis.chain, true, figures, true, sections);
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
  const bySection = new Map((sections || []).map(sec => [String(sec.id), sec]));
  authored.nodes = authored.nodes.map(n => {
    const stepIds = unique(n.stepIds).filter(id => byStep.has(id));
    const subIds = unique(stepIds.map(id => byStep.get(id).section).filter(Boolean));
    const refs = stepIds.map(id => byStep.get(id));
    const dioramas = [], explanatoryFigures = [];
    refs.forEach(st => {
      (st.demos || []).forEach((d, i) => {
        if (isScene(d)) dioramas.push({ stepId: String(st.id), demoIndex: i, title: clean(d.title || st.title, 100), purpose: clean(d.purpose || st.answers || st.title, 220) });
        else if (d && d.type === 'figure' && d.figure) explanatoryFigures.push({ stepId: String(st.id), title: clean(d.title || st.title, 100), purpose: clean(d.purpose || st.answers || st.title, 220), figure: d.figure });
      });
      (st.explain || []).forEach((ex, i) => {
        if (ex && ex.figure) explanatoryFigures.push({ stepId: String(st.id), title: clean(st.title || 'Explanation', 100), purpose: clean(ex.text || st.answers || st.title, 220), figure: ex.figure });
      });
      if (st.intuitionFigure) explanatoryFigures.push({ stepId: String(st.id), title: clean(st.title || 'Intuition', 100), purpose: clean(st.intuition || st.answers || st.title, 220), figure: st.intuitionFigure });
      if (st.misconceptionFigure) explanatoryFigures.push({ stepId: String(st.id), title: clean(st.title || 'Misconception', 100), purpose: clean(st.misconception || st.answers || st.title, 220), figure: st.misconceptionFigure });
    });
    // Preserve source-linked explanatory diagrams in the atlas itself. PDF crop IDs remain in sourceRefs rather
    // than being copied here, because their binary image assets live in the document's local figure store.
    // Only source visuals explicitly selected by this concept's plan become visible figure entries.
    explanatoryFigures.push(...selectedSourceVisualFigures(n, analysis.chain, sections));
    const seenFigures = new Set();
    const uniqueFigures = explanatoryFigures.filter(f => {
      const key = f.sourceVisualId || (f.stepId + '|' + f.title + '|' + JSON.stringify(f.figure));
      if (seenFigures.has(key)) return false; seenFigures.add(key); return true;
    });
    return {
      ...n,
      stepIds, subsectionIds: subIds,
      explanatoryFigures: uniqueFigures,
      title: clean(n.title, 100), question: clean(n.question, 300), summary: clean(n.summary, 500),
      position: { x: Math.max(4, Math.min(96, +n.position.x)), y: Math.max(4, Math.min(96, +n.position.y)) },
      dioramaRefs: dioramas,
      sourceRefs: {
        stepIds, subsectionIds: subIds,
        pages: unique(refs.flatMap(st => {
          const sec = bySection.get(String(st.section));
          return [...(st.pages || []), ...(sec ? [sec.startPage, sec.endPage] : [])];
        }).filter(Number.isFinite)).map(Number),
        pageSpans: subIds.map(id => {
          const sec = bySection.get(String(id));
          return sec ? { subsectionId: String(id), startPage: Number(sec.startPage), endPage: Number(sec.endPage) } : null;
        }).filter(Boolean),
        figureIds: [...sourceFigureEvidence(stepIds, analysis.chain, figures).figures.map(f => f.id), ...sourceFigureEvidence(stepIds, analysis.chain, figures).unresolvedFigureIds],
        figureRecords: sourceFigureEvidence(stepIds, analysis.chain, figures).figures,
        unresolvedFigureIds: sourceFigureEvidence(stepIds, analysis.chain, figures).unresolvedFigureIds,
        visualIds: sourceVisualEvidence(stepIds, analysis.chain, sections).visuals.map(v => v.id),
        visualRecords: sourceVisualEvidence(stepIds, analysis.chain, sections).visuals,
        stepSummaries: refs.map(st => ({
          stepId: String(st.id), title: clean(st.title, 120), statement: clean(st.statement, 900),
          answers: clean(st.answers, 260), opens: clean(st.opens, 260),
          pages: unique([...(st.pages || []), ...(bySection.get(String(st.section)) ? [bySection.get(String(st.section)).startPage, bySection.get(String(st.section)).endPage] : [])].filter(Number.isFinite)).map(Number),
          figureIds: stepFigureIds(st)
        })),
        externalSources: refs.flatMap(st => (st.sources || []).map(s => ({ title: s.title || '', doi: s.doi || '', url: s.url || '' })))
      }
    };
  });
  const index = sourceIndex(analysis, sections, figures, sourceType);
  index.sourceType = sourceType === 'pptx' ? 'pptx' : 'pdf';
  index.sourceUnit = index.sourceType === 'pptx' ? 'slide' : 'page';
  // One research record per actual API call. The pipeline's in-memory audit also sees calls that happened
  // before the atlas stage; use it preferentially to avoid double-counting the first chain response.
  const recorded = analysis.researchEvidenceCalls && analysis.researchEvidenceCalls.length
    ? analysis.researchEvidenceCalls
    : [analysis.researchEvidence].filter(Boolean);
  const researchParts = [...recorded, ...(researchAudit || []) , authored._atlasWebResearch].filter(Boolean);
  const signature = x => x.callId || [x.provider || '', x.model || '', +x.searched || 0, (x.citations || []).map(c => c && c.url || '').filter(Boolean).sort().join('|')].join('::');
  const uniqueResearch = researchParts.filter((x, i, all) => all.findIndex(y => signature(y) === signature(x)) === i);
  const researchCitations = uniqueResearch.flatMap(x => x.citations || []).filter(c => c && /^https:\/\//i.test(c.url));
  index.webResearch = uniqueResearch.length ? {
    provider: [...new Set(uniqueResearch.map(x => x.provider).filter(Boolean))].join(', '),
    model: [...new Set(uniqueResearch.map(x => x.model).filter(Boolean))].join(', '),
    searched: uniqueResearch.reduce((n, x) => n + (+x.searched || 0), 0),
    tasks: uniqueResearch.map(x => x.task || 'AI authoring call'),
    records: uniqueResearch.map(x => ({ callId: x.callId || null, provider: x.provider || '', model: x.model || '', searched: +x.searched || 0, task: x.task || 'AI authoring call', citations: (x.citations || []).filter(c => c && /^https:\/\//i.test(c.url)) })),
    citations: researchCitations.filter((c, i, a) => a.findIndex(y => y.url === c.url) === i)
  } : null;
  const { _atlasWebResearch, ...authoredAtlas } = authored;
  const atlas = {
    ...authoredAtlas,
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
      webResearch: index.webResearch ? { provider: index.webResearch.provider || null, model: index.webResearch.model || null, searches: index.webResearch.searched || 0, citations: index.webResearch.citations.length, callIds: (index.webResearch.records || []).map(x => x.callId).filter(Boolean) } : { status: 'no web-search citations recorded' }
    }
  };
  return atlas;
}
