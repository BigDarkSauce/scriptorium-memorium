// The domain-aware explanatory compiler (docs/research/explanatory-compiler.md). Pure: no DOM, no three.js, so the
// quality gate, tools/test-domains.mjs and tools/verify-chain.mjs run it in node.
//   classifyStep(step)      → {domain, structure, primitive, medium, confidence, source, why, scores}
//   ROUTES                  structure → {primitive, medium, fallback}  (the routing table)
//   PRIMITIVES              the primitive kinds (figure kinds the reader draws with js/dio/prims/*.js)
//   validatePrimitive(f, E) normalises a primitive figure spec in place and pushes its errors into E
//   autoPrimitive(step, r)  a primitive built only from what the step already holds (its table), or null
//   domainSequence(domain)  the didactic beats a domain's explanation follows (used by js/dio/plans.js)
// A step may carry the AI's own choice as  "visual": {"domain","structure","primitive","why"}; it wins when valid.

export const DOMAINS = ['cs', 'maths', 'economics', 'business', 'philosophy', 'data', 'physical'];
export const DOMAIN_NAMES = { cs: 'Programming & computation', maths: 'Mathematics', economics: 'Economics', business: 'Business', philosophy: 'Philosophy', data: 'Data & evidence', physical: 'Physical sciences' };
export const STRUCTURES = ['construction', 'state_machine', 'transformation', 'distribution', 'causal_graph', 'competing', 'flow_network', 'argument_graph', 'taxonomy', 'data_narrative', 'algorithm', 'mechanism', 'agent_system', 'inference', 'emergence', 'control', 'analogy'];
export const MEDIA = ['diorama', 'panel', 'simulation', 'figure', 'slides'];

// one line per primitive (the prompts list these, so any AI picks the same kind for the same structure)
export const PRIMITIVES = {
  progressive_construction: { structure: 'construction', use: 'a system built up part by part: the simplest version first, each new part added because the previous version fails a stated problem', panel: true, scene: true },
  state_machine: { structure: 'state_machine', use: 'observable state: components and registers on wires; each clock tick sends a value along a wire and latches a register', panel: true, scene: true },
  transform2d: { structure: 'transformation', use: 'a 2×2 matrix as a motion of the plane: grid, basis vectors î ĵ, the unit square becoming a parallelogram of area det, the equation linked', panel: true },
  distribution_lab: { structure: 'distribution', use: 'a distribution built sample by sample: histogram, density curve, μ and σ sliders, the formula linked to the picture', panel: true },
  causal_loop: { structure: 'causal_graph', use: 'variables linked by signed influences (+ / −) with feedback loops labelled reinforcing (R) or balancing (B); a pulse propagates from a node', panel: true, scene: true },
  competing_explanations: { structure: 'competing', use: 'two to four rival explanations of the same facts, what each predicts, and which evidence tells them apart', panel: true },
  flow_network: { structure: 'flow_network', use: 'a business model as a system: customers, firms, suppliers, intermediaries, competitors with money and goods flowing; a unit-economics breakdown', panel: true, scene: true },
  argument_map: { structure: 'argument_graph', use: 'an argument as a navigable graph: question → claim → premises; objection → counterexample; response → revised claim; challenging a premise shows what it affects', panel: true },
  data_narrative: { structure: 'data_narrative', use: 'evidence as a sequence of chart states driven by steps, with annotations and a provenance line; "mode":"slides" for a plain dense analytic slide', panel: true },
  algorithm_sandbox: { structure: 'algorithm', use: 'grid pathfinding (BFS, Dijkstra, greedy, A*) with movable start and goal, paintable walls, the frontier and visited set drawn', panel: true },
  // the Revelation Engine's primitives (docs/research/revelation-engine.md)
  bayes_update: { structure: 'inference', use: 'competing hypotheses with prior beliefs; each piece of evidence, when revealed, reweights them by how likely it is under each (Bayes), shown as bars and as natural frequencies out of 100', panel: true },
  emergence: { structure: 'emergence', use: 'agents on a grid following one local rule (e.g. Schelling: move if fewer than t % of neighbours are like me); run it and watch a global pattern no agent intended; compare thresholds', panel: true },
  control_loop: { structure: 'control', use: 'a feedback controller: setpoint, measured output, error, controller gain and a delay; move the setpoint or add a disturbance and watch overshoot or oscillation appear', panel: true },
  analogy_map: { structure: 'analogy', use: 'a source idea mapped onto a target: which parts correspond, which relations carry over, and where the likeness breaks', panel: false }
};
export const PRIMITIVE_KINDS = Object.keys(PRIMITIVES);

// the routing table: structure → the primitive that draws it and the medium it is shown in first
export const ROUTES = {
  construction: { primitive: 'progressive_construction', medium: 'figure', fallback: 'diorama' },
  state_machine: { primitive: 'state_machine', medium: 'figure', fallback: 'panel' },
  transformation: { primitive: 'transform2d', medium: 'simulation', fallback: 'figure' },
  distribution: { primitive: 'distribution_lab', medium: 'simulation', fallback: 'figure' },
  causal_graph: { primitive: 'causal_loop', medium: 'simulation', fallback: 'diorama' },
  competing: { primitive: 'competing_explanations', medium: 'figure', fallback: 'slides' },
  flow_network: { primitive: 'flow_network', medium: 'panel', fallback: 'diorama' },
  argument_graph: { primitive: 'argument_map', medium: 'figure', fallback: 'figure' },
  taxonomy: { primitive: 'tree', medium: 'figure', fallback: 'figure' },
  data_narrative: { primitive: 'data_narrative', medium: 'figure', fallback: 'slides' },
  algorithm: { primitive: 'algorithm_sandbox', medium: 'simulation', fallback: 'figure' },
  mechanism: { primitive: 'scene', medium: 'diorama', fallback: 'figure' },
  agent_system: { primitive: 'scene', medium: 'diorama', fallback: 'simulation' },
  inference: { primitive: 'bayes_update', medium: 'simulation', fallback: 'figure' },
  emergence: { primitive: 'emergence', medium: 'simulation', fallback: 'diorama' },
  control: { primitive: 'control_loop', medium: 'simulation', fallback: 'figure' },
  analogy: { primitive: 'analogy_map', medium: 'figure', fallback: 'figure' }
};
// the structure a domain falls back to when no structure word is found, and its most natural ones (a tie-breaker)
const DOMAIN_STRUCT = {
  cs: ['construction', 'state_machine', 'algorithm'], maths: ['transformation', 'distribution', 'construction'], economics: ['causal_graph', 'competing', 'agent_system'],
  business: ['flow_network', 'data_narrative', 'causal_graph'], philosophy: ['argument_graph', 'competing', 'taxonomy'], data: ['data_narrative', 'distribution', 'competing'], physical: ['mechanism', 'causal_graph', 'construction']
};

// ---------------------------------------------------------------- the heuristic classifier
const R = s => new RegExp(s, 'gi');
const DOMAIN_WORDS = {
  cs: [R('\\b(code|program(s|ming)?|software|compil\\w*|algorithm\\w*|cpu|processor|register\\w*|clock (cycle|tick|pulse)|bits?|bytes?|binary|memory|cache|instruction\\w*|tokens?|tokeni[sz]\\w*|tensors?|neural|transformer|self-attention|attention head|array|queue|stack|pointer|python|javascript|function calls?|logic gates?|adder|data bus|bus|bigram|gradient descent|backprop\\w*|graph search|pathfind\\w*|dijkstra|breadth-first|a\\*)'), 2],
  maths: [R('\\b(matri(x|ces)|vectors?|eigen\\w*|determinant|linear (map|transformation)|basis|theorem|lemma|proofs?|integral|derivative|probabilit\\w*|distribution|variance|standard deviation|random variable|gaussian|normal (curve|distribution)|invariant|polynomial|parallelogram|unit square|shear|rotation by|axiom|μ|σ)'), 2],
  economics: [R('\\b(prices?|inflation|deflation|demand|supply|markets?|interest rates?|unemploy\\w*|wages?|gdp|monetary|fiscal|central bank|incentives?|elasticit\\w*|tax(es|ation)?|recession|money supply|labou?r market|households|consumption|output gap|economists?|economic|game theory|prisoner\'?s dilemma|payoffs?|tit for tat)'), 2],
  business: [R('\\b(revenue|customers?|suppliers?|margins?|profit\\w*|unit economics|franchise\\w*|subscriptions?|churn|acquisition cost|lifetime value|retail\\w*|airlines?|platform|marketplace|commission|distributors?|competitors?|business model|restaurant|rent|payroll|ingredients?|sales|pricing|startup|company|companies|firm)'), 2],
  philosophy: [R('\\b(arguments?|premises?|conclusions?|objections?|counterexamples?|claims?|valid(ity)?|sound(ness)?|thought experiment|utilitarian\\w*|moral\\w*|ethic\\w*|epistem\\w*|justified|belief|free will|consequential\\w*|deontolog\\w*|virtue|philosoph\\w*|knowledge|gettier|trolley)'), 2],
  data: [R('\\b(data(set)?|survey\\w*|charts?|per ?cent|percentage|trends?|respondents|statistics? (show|office)|census|polls?|share of|year[- ]on[- ]year|per capita|time series|figures? show|evidence shows|sample of \\d+|source:)'), 2],
  physical: [R('\\b(forces?|energy|mass|velocity|accelerat\\w*|molecules?|pressure|temperature|cells?|reaction|waves?|orbit|gravit\\w*|electric\\w*|magnet\\w*|friction|momentum|pendulum|spring|fluid|heat|photosynth\\w*|enzyme|membrane|atoms?)'), 2]
};
const STRUCT_WORDS = {
  argument_graph: [R('\\b(premises?|objections?|counterexamples?|therefore|it follows|conclusions?|valid|unsound|thought experiment|reply|response to|revised (claim|version)|the argument)'), 3],
  competing: [R('\\b(competing|rival|alternative (explanation|account)s?|hypothes[ie]s|explanations|accounts? of|which (explanation|account|theory)|distinguish(es)? between|tells? them apart|schools of thought|demand-side|structural explanation)'), 3],
  causal_graph: [R('\\b(feedback|loops?|reinforc\\w*|balanc\\w*|vicious|virtuous|spiral|leads? to|raises|lowers|pushes up|pushes down|knock-on|in turn|causal|cause[sd]?|drives?)'), 2],
  flow_network: [R('\\b(customers?|suppliers?|pays?|paid|sells?|flows? of (money|goods)|goods|intermediar\\w*|value chain|platform|marketplace|commission|distribut(or|ion network)|royalt\\w*|franchise fee|wholesale|hub-and-spoke|supply chain)'), 2],
  state_machine: [R('\\b(registers?|clock|states?|transitions?|latch\\w*|flip-flops?|bus|signals?|fetch|decode|execute|program counter|instruction register|cycles?|tick)'), 2],
  algorithm: [R('\\b(algorithm|search\\w*|frontier|shortest path|path|queue|visited|heuristic|bfs|breadth-first|dijkstra|a\\*|greedy|sort\\w*|traverse\\w*|grid)'), 2],
  construction: [R('\\b(build\\w*|from scratch|add(s|ed|ing)?|simplest|first version|next version|layers?|components?|step by step|we need|is needed|why we need|piece by piece|stack(ed|ing)|assembl\\w*)'), 1.5],
  transformation: [R('\\b(matri(x|ces)|transform\\w*|linear map|basis vectors?|determinant|rotation|shear|eigen\\w*|unit square|parallelogram|grid lines)'), 3],
  distribution: [R('\\b(distribution|normal|gaussian|variance|standard deviation|σ|μ|samples?|random|bell curve|histogram|mean of)'), 2],
  data_narrative: [R('\\b(per ?cent|percentage|survey|respondents|trend|rose|fell|grew|declined|from \\d{4} to \\d{4}|in \\d{4}|share of|chart|data show|compared with)'), 1.5],
  taxonomy: [R('\\b(types of|kinds of|classif\\w*|branches of|taxonomy|categor\\w*|families of|map of|divides?( roughly)? into|divided into|belongs to|beside|sits? under|a map)'), 2.5],
  mechanism: [R('\\b(mechanism|moves?|rotat\\w*|gears?|levers?|pistons?|valves?|pumps?|engine|machine|assembly|inside the|cutaway|parts? of the)'), 2],
  agent_system: [R('\\b(agents?|traders?|players?|strategies|strategy|repeated game|prisoner|cooperat\\w*|defect\\w*|population of|tit for tat|tournament)'), 2.5],
  inference: [R('\\b(bayes\\w*|prior|posterior|likelihood|base rate|false positive|diagnos\\w*|update (our|your|the) belief|evidence (for|against)|how likely|odds)'), 3],
  emergence: [R('\\b(emergen\\w*|local rules?|self-organi[sz]\\w*|flock\\w*|swarm\\w*|segregation|schelling|cellular automat\\w*|game of life|collective behaviou?r|no one intended|traffic jams?)'), 3],
  control: [R('\\b(setpoint|set point|thermostat|controller|control system|cruise control|feedback control|overshoot|oscillat\\w* around|gain|homeosta\\w*|regulat\\w* (to|around)|error signal|pid)'), 3],
  analogy: [R('\\b(analog(y|ous|ies)|is like|just as|in the same way|compare(d)? to a|works like|think of it as|metaphor)'), 2]
};
const AFFINITY = { cs: { construction: 2, state_machine: 2, algorithm: 2 }, maths: { transformation: 2, distribution: 2 }, economics: { causal_graph: 2, competing: 1.5, agent_system: 1 }, business: { flow_network: 3, data_narrative: 1 }, philosophy: { argument_graph: 3, competing: 1.5, taxonomy: 1 }, data: { data_narrative: 3, distribution: 1 }, physical: { mechanism: 3, causal_graph: .5 } };
const textOf = st => {
  if (!st) return '';
  const ex = (Array.isArray(st.explain) ? st.explain : []).map(p => typeof p === 'string' ? p : p && p.text);
  return [st.title, st.title, st.statement, st.answers, ...ex, st.intuition, ...(st.terms || []).map(t => t && (t.term + ' ' + t.meaning)), ...(st.bodies || [])].filter(Boolean).join(' \n ').replace(/\$([^$]*)\$/g, ' $1 ');
};
const count = (t, [re, w]) => (t.match(re) || []).length * w;
const norm = s => String(s || '').toLowerCase().replace(/[\s-]+/g, '_');
export const STRUCT_ALIAS = { argument: 'argument_graph', argument_map: 'argument_graph', causal: 'causal_graph', causal_loop: 'causal_graph', feedback: 'causal_graph', feedback_graph: 'causal_graph', loop: 'causal_graph', hypotheses: 'competing', competing_explanations: 'competing', flows: 'flow_network', business_model: 'flow_network', network: 'flow_network', transform: 'transformation', transform2d: 'transformation', progressive_construction: 'construction', signal_journey: 'state_machine', statemachine: 'state_machine', story: 'data_narrative', narrative: 'data_narrative', slides: 'data_narrative', search: 'algorithm', algorithm_sandbox: 'algorithm', agents: 'agent_system', game: 'agent_system', distribution_lab: 'distribution', sampling: 'distribution', concept_map: 'taxonomy' };
export const DOMAIN_ALIAS = { programming: 'cs', computing: 'cs', 'computer science': 'cs', computer_science: 'cs', math: 'maths', mathematics: 'maths', statistics: 'maths', econ: 'economics', economy: 'economics', management: 'business', ethics: 'philosophy', journalism: 'data', data_journalism: 'data', physics: 'physical', chemistry: 'physical', biology: 'physical', engineering: 'physical', earth: 'physical' };
const asDomain = d => { const k = norm(d).replace(/_/g, ' ').trim(); const a = DOMAIN_ALIAS[k] || DOMAIN_ALIAS[k.replace(/ /g, '_')] || k.replace(/ /g, '_'); return DOMAINS.includes(a) ? a : null; };
const asStructure = s => { const k = norm(s); const a = STRUCT_ALIAS[k] || k; return STRUCTURES.includes(a) ? a : null; };
// what a primitive kind tells us about its structure (a step that already carries a primitive figure is that structure)
const primStructure = k => (PRIMITIVES[k] && PRIMITIVES[k].structure) || null;
function carried(st) { const kinds = []; (st.explain || []).forEach(p => p && p.figure && kinds.push(p.figure.kind)); (st.demos || []).forEach(d => d && d.figure && kinds.push(d.figure.kind)); if (st.statementFigure) kinds.push(st.statementFigure.kind); return kinds.filter(k => PRIMITIVES[k]); }

export function mediumFor(structure, domain, st = {}) {
  const r = ROUTES[structure] || ROUTES.mechanism;
  // a dense table of numbers is an analytic slide, not a spectacle (the Perun lesson)
  if (structure === 'data_narrative' && st.table && Array.isArray(st.table.rows) && st.table.rows.length >= 6) return 'slides';
  if (structure === 'mechanism' && domain !== 'physical') return 'figure';
  return r.medium;
}
export function classifyStep(st, { hint } = {}) {
  const t = textOf(st), why = [];
  const dS = {}; DOMAINS.forEach(d => { dS[d] = count(t, DOMAIN_WORDS[d]); });
  if (st && st.code && Array.isArray(st.code.lines) && st.code.lines.length) { dS.cs += 4; why.push('the step has code'); }
  if (st && st.math) dS.maths += 1.5;
  if (st && /theorem|lemma|proof|corollary/i.test(st.kind || '')) dS.maths += 2;
  if (st && st.table && Array.isArray(st.table.rows) && st.table.rows.length >= 3) { dS.data += 3; why.push('the step has a table of ' + st.table.rows.length + ' rows'); }
  const sS = {}; STRUCTURES.forEach(s => { sS[s] = count(t, STRUCT_WORDS[s]); });
  if (st && st.table && Array.isArray(st.table.rows) && st.table.rows.length >= 3) sS.data_narrative += 4;
  carried(st || {}).forEach(k => { const s = primStructure(k); if (s) { sS[s] += 8; why.push('it already carries a ' + k); } });
  const rank = o => Object.entries(o).sort((a, b) => b[1] - a[1]);
  let [domain, dTop] = rank(dS)[0]; if (!dTop) { domain = 'physical'; why.push('no domain words: the physical default'); } else why.push(`domain words: ${rank(dS).filter(x => x[1]).slice(0, 3).map(([k, v]) => k + ' ' + v).join(', ')}`);
  // the domain's affinities break ties between structures; the strongest structure word count decides
  const aff = AFFINITY[domain] || {}; const total = {}; STRUCTURES.forEach(s => { total[s] = sS[s] + (sS[s] > 0 ? (aff[s] || 0) : (aff[s] || 0) * .25); });
  let [structure, sTop] = rank(total)[0];
  if (sTop < 2) { structure = DOMAIN_STRUCT[domain][0]; why.push(`no clear structure: the ${domain} default (${structure})`); }
  else why.push(`structure words: ${rank(sS).filter(x => x[1]).slice(0, 3).map(([k, v]) => k + ' ' + v).join(', ')}`);
  const second = rank(total)[1] ? rank(total)[1][1] : 0;
  let out = { domain, structure, primitive: (ROUTES[structure] || {}).primitive, medium: mediumFor(structure, domain, st || {}), confidence: +(sTop / ((sTop + second) || 1)).toFixed(2), source: 'heuristic', why: why.join('; '), scores: { domain: dS, structure: sS } };
  // the AI's own choice (step.visual, or a hint passed in) wins when it names known values
  const V = hint || (st && st.visual);
  if (V && typeof V === 'object') {
    const d2 = asDomain(V.domain), s2 = asStructure(V.structure) || primStructure(V.primitive);
    if (d2 || s2) { const S = s2 || out.structure, D = d2 || out.domain; out = { ...out, domain: D, structure: S, primitive: (PRIMITIVES[V.primitive] && primStructure(V.primitive) === S) ? V.primitive : ROUTES[S].primitive, medium: MEDIA.includes(V.medium) ? V.medium : mediumFor(S, D, st || {}), source: 'ai', heuristic: { domain: out.domain, structure: out.structure }, why: (V.why ? String(V.why).slice(0, 200) + ' · ' : '') + 'chosen by the AI (heuristic: ' + out.domain + '/' + out.structure + ')' }; }
  }
  return out;
}
export function classifyChain(A) { return (A && A.chain || []).map(st => ({ step: st.id, ...classifyStep(st) })); }

// ---------------------------------------------------------------- the didactic sequence per domain (Owen stages, re-read)
export const DOMAIN_SEQUENCES = {
  cs: [['curiosity', 'the problem the program must solve'], ['orientation', 'the simplest version that runs'], ['mechanism', 'why it fails, shown on a case'], ['decomposition', 'the part that fixes it, added'], ['inspection', 'the state inside, step by step'], ['understanding', 'the learner runs it and predicts']],
  maths: [['curiosity', 'the object and the question about it'], ['mechanism', 'the operation shown as a continuous motion'], ['inspection', 'what is preserved: the invariant'], ['reconstruction', 'the formal statement, linked to the picture'], ['understanding', 'a new case the learner tries']],
  economics: [['curiosity', 'the situation and its puzzle'], ['mechanism', 'the causal chain and its feedback'], ['intuition', 'an intervention: predict, then reveal'], ['inspection', 'a competing explanation and what tells them apart'], ['understanding', 'the evidence weighed']],
  business: [['orientation', 'the actors of the business'], ['mechanism', 'goods and money flowing between them'], ['inspection', 'the unit economics of one sale'], ['intuition', 'the decision or bottleneck'], ['understanding', 'the consequence for the whole system']],
  philosophy: [['curiosity', 'the question'], ['orientation', 'the claim and its terms'], ['decomposition', 'the premises'], ['inspection', 'an objection or counterexample'], ['reconstruction', 'the response and the revised claim'], ['understanding', 'the learner challenges a premise']],
  data: [['curiosity', 'the question the data answers'], ['orientation', 'the first chart state'], ['mechanism', 'the comparison that matters'], ['inspection', 'the annotated key point'], ['understanding', 'the provenance and the limits']],
  physical: [['curiosity', 'the question'], ['orientation', 'the whole'], ['decomposition', 'its parts'], ['inspection', 'one part inside'], ['mechanism', 'how it moves'], ['reconstruction', 'the whole again']]
};
export const domainSequence = d => DOMAIN_SEQUENCES[d] || DOMAIN_SEQUENCES.physical;

// ---------------------------------------------------------------- spec validation (shared with js/room/figspec.js)
const num = v => typeof v === 'number' ? isFinite(v) : typeof v === 'string' && v.trim() !== '' && isFinite(+v);
const N = v => +v;
const str = (v, n = 200) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const arr = v => Array.isArray(v) ? v : [];
const id = (v, i, p = 'n') => str(v == null || v === '' ? p + i : v, 30);
const SIGNS = { '+': 1, '-': -1, '−': -1, plus: 1, minus: -1, same: 1, opposite: -1, '1': 1, '-1': -1 };
export const ARG_TYPES = ['question', 'claim', 'premise', 'conclusion', 'objection', 'counterexample', 'response', 'revised'];
export const ARG_RELS = ['supports', 'attacks', 'answers', 'revises', 'addresses'];   // addresses: a claim put forward for the question (layout only)
export const FLOW_KINDS = ['money', 'goods', 'info'];
export const ROLES = ['customer', 'firm', 'supplier', 'intermediary', 'competitor', 'platform', 'regulator', 'partner'];
const cell = c => Array.isArray(c) && c.length >= 2 && num(c[0]) && num(c[1]) ? [Math.round(N(c[0])), Math.round(N(c[1]))] : null;

export function validatePrimitive(f, E) {
  const k = f.kind;
  if (k === 'progressive_construction') {
    f.parts = arr(f.parts).slice(0, 14).map((p, i) => typeof p === 'string' ? { id: 'p' + i, label: str(p, 40) } : { id: id(p.id, i, 'p'), label: str(p.label || p.id, 40), ...(p.note ? { note: str(p.note, 60) } : {}), ...(['x', 'y', 'w', 'h'].every(q => num(p[q])) ? { x: N(p.x), y: N(p.y), w: N(p.w), h: N(p.h) } : {}) }).filter(p => p.label);
    const ids = new Set(f.parts.map(p => p.id));
    f.stages = arr(f.stages).slice(0, 8).map((s, i) => ({ label: str(s.label || s.title || 'Stage ' + (i + 1), 60), adds: arr(s.adds).map(String).filter(x => ids.has(x)), why: str(s.why, 200), ...(s.problem ? { problem: str(s.problem, 160) } : {}), ...(s.test ? { test: str(s.test, 120) } : {}) })).filter(s => s.adds.length || s.why);
    f.links = arr(f.links).map(l => Array.isArray(l) ? { from: l[0], to: l[1], label: l[2] } : l).filter(l => l && ids.has(String(l.from)) && ids.has(String(l.to))).slice(0, 20).map(l => ({ from: String(l.from), to: String(l.to), ...(l.label ? { label: str(l.label, 24) } : {}) }));
    if (f.parts.length < 2) E.push('progressive_construction needs ≥ 2 "parts"');
    if (f.stages.length < 2) E.push('progressive_construction needs ≥ 2 "stages" (each {label, adds:[part ids], why})');
    if (f.stages.some(s => !s.why)) E.push('every stage needs "why" (the problem the added part solves)');
    const added = new Set(f.stages.flatMap(s => s.adds)); f.parts.forEach(p => { if (!added.has(p.id)) E.push(`part "${p.id}" is never added by a stage`); });
  } else if (k === 'state_machine') {
    f.nodes = arr(f.nodes || f.components).slice(0, 10).map((n, i) => ({ id: id(n.id, i), label: str(n.label || n.id, 30), ...(n.register || n.value != null ? { register: true, value: str(n.value ?? '0', 12) } : {}), ...(num(n.x) && num(n.y) ? { x: N(n.x), y: N(n.y) } : {}), ...(n.note ? { note: str(n.note, 40) } : {}) }));
    const ids = new Set(f.nodes.map(n => n.id));
    f.wires = arr(f.wires || f.edges).map(w => Array.isArray(w) ? { from: w[0], to: w[1], label: w[2] } : w).filter(w => w && ids.has(String(w.from)) && ids.has(String(w.to))).slice(0, 16).map(w => ({ from: String(w.from), to: String(w.to), ...(w.label ? { label: str(w.label, 20) } : {}) }));
    f.ticks = arr(f.ticks || f.steps).slice(0, 16).map((t, i) => ({ label: str(t.label || 'tick ' + (i + 1), 40), note: str(t.note || t.text, 160), packets: arr(t.packets || (t.packet ? [t.packet] : [])).filter(p => p && ids.has(String(p.from)) && ids.has(String(p.to))).slice(0, 4).map(p => ({ from: String(p.from), to: String(p.to), value: str(p.value ?? '', 12) })), set: Object.fromEntries(Object.entries(t.set && typeof t.set === 'object' ? t.set : {}).filter(([a]) => ids.has(a)).slice(0, 6).map(([a, b]) => [a, str(b, 12)])), ...(t.state ? { state: str(t.state, 24) } : {}) }));
    if (f.nodes.length < 2) E.push('state_machine needs ≥ 2 "nodes"');
    if (!f.wires.length) E.push('state_machine needs "wires" between nodes');
    if (f.ticks.length < 2) E.push('state_machine needs ≥ 2 "ticks" (each {label, note, packets:[{from,to,value}], set:{node:value}})');
  } else if (k === 'transform2d') {
    const m = arr(f.matrix || f.m); const ok = m.length === 2 && m.every(r => Array.isArray(r) && r.length === 2 && r.every(num));
    if (!ok) E.push('transform2d needs "matrix": [[a,b],[c,d]]'); else f.matrix = m.map(r => r.map(v => Math.max(-3, Math.min(3, N(v)))));
    f.presets = arr(f.presets).slice(0, 6).map(p => ({ label: str(p.label, 24), matrix: arr(p.matrix) })).filter(p => p.label && p.matrix.length === 2 && p.matrix.every(r => Array.isArray(r) && r.length === 2 && r.every(num))).map(p => ({ label: p.label, matrix: p.matrix.map(r => r.map(N)) }));
    f.vector = cell(f.vector) ? arr(f.vector).map(N) : null; if (!f.vector) delete f.vector;
    f.eigen = !!f.eigen;
  } else if (k === 'distribution_lab') {
    f.dist = ['normal', 'uniform', 'exponential'].includes(f.dist) ? f.dist : 'normal';
    f.mu = num(f.mu ?? f.mean) ? N(f.mu ?? f.mean) : 0; f.sigma = num(f.sigma ?? f.sd) ? N(f.sigma ?? f.sd) : 1;
    if (!(f.sigma > 0)) E.push('distribution_lab needs sigma > 0');
    f.range = Array.isArray(f.range) && f.range.length === 2 && num(f.range[0]) && num(f.range[1]) && +f.range[1] > +f.range[0] ? f.range.map(N) : [f.mu - 4.5 * Math.max(f.sigma, 1), f.mu + 4.5 * Math.max(f.sigma, 1)];
    f.muRange = Array.isArray(f.muRange) && f.muRange.length === 2 ? f.muRange.map(N) : [f.range[0] + (f.range[1] - f.range[0]) * .25, f.range[1] - (f.range[1] - f.range[0]) * .25];
    f.sigmaRange = Array.isArray(f.sigmaRange) && f.sigmaRange.length === 2 && +f.sigmaRange[0] > 0 ? f.sigmaRange.map(N) : [Math.max(.1, f.sigma * .25), f.sigma * 2.5];
    if (f.xlabel) f.xlabel = str(f.xlabel, 30); if (f.unit) f.unit = str(f.unit, 12);
    f.seed = num(f.seed) ? N(f.seed) : 7;
  } else if (k === 'causal_loop') {
    f.nodes = arr(f.nodes).slice(0, 10).map((n, i) => typeof n === 'string' ? { id: 'n' + i, label: str(n, 30) } : { id: id(n.id, i), label: str(n.label || n.id, 30), ...(num(n.x) && num(n.y) ? { x: N(n.x), y: N(n.y) } : {}) });
    const ids = new Set(f.nodes.map(n => n.id));
    f.edges = arr(f.edges).map(e => Array.isArray(e) ? { from: e[0], to: e[1], sign: e[2] } : e).filter(e => e && ids.has(String(e.from)) && ids.has(String(e.to)) && String(e.from) !== String(e.to)).slice(0, 20).map(e => ({ from: String(e.from), to: String(e.to), sign: SIGNS[String(e.sign ?? e.polarity ?? '+').trim().toLowerCase()] || 0, ...(e.label ? { label: str(e.label, 24) } : {}), ...(e.delay ? { delay: true } : {}) }));
    f.edges.forEach((e, i) => { if (!e.sign) E.push(`edge ${i + 1}: "sign" must be "+" or "−"`); });
    f.loops = arr(f.loops).slice(0, 6).map(l => ({ name: str(l.name || l.label, 40), nodes: arr(l.nodes).map(String) })).filter(l => l.name && l.nodes.length >= 2);
    if (f.start != null && !ids.has(String(f.start))) delete f.start;
    if (f.nodes.length < 2 || f.edges.length < 2) E.push('causal_loop needs ≥ 2 "nodes" and ≥ 2 signed "edges"');
  } else if (k === 'competing_explanations') {
    f.question = str(f.question, 160);
    f.hypotheses = arr(f.hypotheses).slice(0, 4).map((h, i) => ({ id: id(h.id, i, 'h'), label: str(h.label || h.name, 34), claim: str(h.claim || h.text, 180), predicts: arr(h.predicts).slice(0, 4).map(p => str(typeof p === 'string' ? p : p.text, 90)).filter(Boolean) }));
    const hid = new Set(f.hypotheses.map(h => h.id));
    f.evidence = arr(f.evidence).slice(0, 7).map((e, i) => ({ id: id(e.id, i, 'e'), label: str(e.label || e.text, 90), fits: Object.fromEntries(Object.entries(e.fits && typeof e.fits === 'object' ? e.fits : {}).filter(([h]) => hid.has(h)).map(([h, v]) => [h, ['+', '-', '0'].includes(String(v).replace('−', '-')) ? String(v).replace('−', '-') : '0'])), ...(e.note ? { note: str(e.note, 120) } : {}), ...(e.observed ? { observed: true } : {}) }));
    if (f.hypotheses.length < 2) E.push('competing_explanations needs 2–4 "hypotheses" ({label, claim, predicts})');
    if (f.evidence.length < 2) E.push('competing_explanations needs ≥ 2 "evidence" rows ({label, fits:{hypothesisId:"+|-|0"}})');
    if (f.evidence.length && !f.evidence.some(e => new Set(f.hypotheses.map(h => e.fits[h.id] || '0')).size > 1)) E.push('no evidence row tells the hypotheses apart');
  } else if (k === 'flow_network') {
    f.actors = arr(f.actors || f.nodes).slice(0, 9).map((a, i) => ({ id: id(a.id, i, 'a'), label: str(a.label || a.id, 28), role: ROLES.includes(a.role) ? a.role : 'firm', ...(num(a.x) && num(a.y) ? { x: N(a.x), y: N(a.y) } : {}), ...(a.note ? { note: str(a.note, 40) } : {}) }));
    const ids = new Set(f.actors.map(a => a.id));
    f.flows = arr(f.flows || f.edges).filter(x => x && ids.has(String(x.from)) && ids.has(String(x.to))).slice(0, 18).map(x => ({ from: String(x.from), to: String(x.to), kind: FLOW_KINDS.includes(x.kind) ? x.kind : 'money', label: str(x.label, 30), ...(num(x.amount) ? { amount: N(x.amount) } : {}) }));
    if (f.units) { const U = f.units; f.units = { title: str(U.title || 'One sale', 40), price: num(U.price) ? N(U.price) : null, currency: str(U.currency || '$', 3), items: arr(U.items).slice(0, 8).map(it => ({ label: str(it.label, 24), value: num(it.value) ? N(it.value) : 0 })).filter(it => it.label) }; if (f.units.price == null || !f.units.items.length) { E.push('"units" needs price and items [{label, value}]'); delete f.units; } else if (f.units.items.reduce((a, b) => a + b.value, 0) > f.units.price * 1.5) E.push('the unit costs exceed 150 % of the price: check the numbers'); }
    if (f.actors.length < 2 || !f.flows.length) E.push('flow_network needs ≥ 2 "actors" and ≥ 1 "flows" ({from,to,kind:"money|goods|info",label})');
  } else if (k === 'argument_map') {
    f.question = str(f.question, 160);
    f.nodes = arr(f.nodes).slice(0, 12).map((n, i) => ({ id: id(n.id, i), type: ARG_TYPES.includes(n.type) ? n.type : 'premise', text: str(n.text || n.label, 280), ...(n.short ? { short: str(n.short, 40) } : {}) }));
    const ids = new Set(f.nodes.map(n => n.id));
    f.links = arr(f.links || f.edges).map(l => Array.isArray(l) ? { from: l[0], to: l[1], rel: l[2] } : l).filter(l => l && ids.has(String(l.from)) && ids.has(String(l.to)) && l.from !== l.to).slice(0, 20).map(l => ({ from: String(l.from), to: String(l.to), rel: ARG_RELS.includes(l.rel) ? l.rel : 'supports' }));
    if (f.nodes.length < 3) E.push('argument_map needs ≥ 3 "nodes" ({id, type, text})');
    if (!f.links.some(l => l.rel === 'supports')) E.push('argument_map needs "supports" links from premises to a claim');
    f.nodes.forEach(n => { if (!n.text) E.push(`node ${n.id} has no text`); });
  } else if (k === 'data_narrative') {
    f.question = str(f.question, 160); f.mode = f.mode === 'slides' ? 'slides' : 'story'; f.chart = ['bars', 'line', 'dots'].includes(f.chart) ? f.chart : 'bars';
    f.categories = arr(f.categories).slice(0, 16).map(c => str(c, 16));
    f.series = arr(f.series).slice(0, 4).map(s => ({ name: str(s.name, 30), values: arr(s.values).slice(0, f.categories.length).map(v => num(v) ? N(v) : null) })).filter(s => s.values.length);
    f.ylabel = str(f.ylabel, 40); f.xlabel = str(f.xlabel, 30);
    const names = new Set(f.series.map(s => s.name));
    f.states = arr(f.states).slice(0, 8).map((s, i) => ({ title: str(s.title || 'Step ' + (i + 1), 80), show: s.show === 'all' || !Array.isArray(s.show) ? 'all' : s.show.map(String).filter(n => names.has(n)), highlight: arr(s.highlight).filter(num).map(N), annotate: arr(s.annotate).slice(0, 3).map(a => ({ at: num(a.at) ? N(a.at) : 0, series: a.series != null && names.has(String(a.series)) ? String(a.series) : null, text: str(a.text, 70) })).filter(a => a.text), note: str(s.note, 200), ...(Array.isArray(s.y) && s.y.length === 2 && s.y.every(num) ? { y: s.y.map(N) } : {}) }));
    const S = f.source || {}; f.source = { name: str(S.name || S.title, 90), year: str(S.year, 12), note: str(S.note, 120), ...(S.url ? { url: str(S.url, 200) } : {}) };
    if (!f.categories.length || !f.series.length) E.push('data_narrative needs "categories" and "series"');
    if (!f.states.length) E.push('data_narrative needs ≥ 1 "states" ({title, show, highlight, annotate:[{at,text}], note})');
    if (!f.source.name) E.push('data_narrative needs "source" {name, year, note}: the provenance line is part of the claim');
  } else if (k === 'algorithm_sandbox') {
    const G = f.grid || {}; let rows = arr(f.rows).map(r => String(r)); const w = Math.max(4, Math.min(30, Math.round(num(G.w) ? N(G.w) : rows[0] ? rows[0].length : 16))), h = Math.max(3, Math.min(18, Math.round(num(G.h) ? N(G.h) : rows.length || 9)));
    f.grid = { w, h }; const inside = c => c && c[0] >= 0 && c[1] >= 0 && c[0] < w && c[1] < h;
    f.walls = arr(f.walls).map(cell).filter(inside); f.forest = arr(f.forest).map(cell).filter(inside);
    rows.slice(0, h).forEach((r, y) => [...r.slice(0, w)].forEach((ch, x) => { if (ch === '#') f.walls.push([x, y]); else if (ch === 'F' || ch === '~') f.forest.push([x, y]); else if (ch === 'S') f.start = [x, y]; else if (ch === 'G') f.goal = [x, y]; })); delete f.rows;
    f.start = inside(cell(f.start)) ? cell(f.start) : [1, Math.floor(h / 2)]; f.goal = inside(cell(f.goal)) ? cell(f.goal) : [w - 2, Math.floor(h / 2)];
    const key = c => c[0] + ',' + c[1], sk = new Set([key(f.start), key(f.goal)]);
    f.walls = [...new Map(f.walls.filter(c => !sk.has(key(c))).map(c => [key(c), c])).values()]; f.forest = [...new Map(f.forest.filter(c => !sk.has(key(c))).map(c => [key(c), c])).values()];
    f.algorithm = ['bfs', 'dijkstra', 'greedy', 'astar'].includes(f.algorithm) ? f.algorithm : 'astar'; f.cost = num(f.cost) ? Math.max(1, Math.min(9, N(f.cost))) : 5;
    f.algorithms = arr(f.algorithms).filter(a => ['bfs', 'dijkstra', 'greedy', 'astar'].includes(a)); if (!f.algorithms.length) f.algorithms = ['bfs', 'dijkstra', 'greedy', 'astar'];
  } else if (k === 'bayes_update') {
    // {hypotheses:[{id,label,prior}], evidence:[{label, like:{hid: P(evidence | h)}}], question?}
    f.hypotheses = arr(f.hypotheses).slice(0, 4).map((h, i) => ({ id: id(h.id, i, 'h'), label: str(h.label || h.id, 40), prior: num(h.prior) ? Math.max(0, N(h.prior)) : 1 }));
    const tot = f.hypotheses.reduce((a, h) => a + h.prior, 0) || 1; f.hypotheses.forEach(h => { h.prior = h.prior / tot; });
    const hs = f.hypotheses.map(h => h.id);
    f.evidence = arr(f.evidence).slice(0, 6).map((e, i) => ({ id: id(e.id, i, 'e'), label: str(e.label, 90), like: Object.fromEntries(hs.map(h => [h, num(e.like && e.like[h]) ? Math.max(0, Math.min(1, N(e.like[h]))) : .5])), ...(e.note ? { note: str(e.note, 160) } : {}) }));
    if (f.hypotheses.length < 2) E.push('bayes_update needs ≥ 2 "hypotheses" ({id,label,prior})');
    if (!f.evidence.length) E.push('bayes_update needs "evidence" ({label, like:{hypothesisId: P(evidence | hypothesis)}})');
    f.evidence.forEach(e => { if (hs.every(h => e.like[h] === 0)) E.push(`evidence "${e.label}" is impossible under every hypothesis`); });
  } else if (k === 'emergence') {
    // {model:'schelling', size, density, share, threshold, thresholds?:[..]}  (Schelling 1971: a mild preference, a strong pattern)
    f.model = f.model === 'schelling' || !f.model ? 'schelling' : 'schelling';
    f.size = Math.max(12, Math.min(40, Math.round(num(f.size) ? N(f.size) : 24)));
    f.density = num(f.density) ? Math.max(.5, Math.min(.97, N(f.density))) : .88; f.share = num(f.share) ? Math.max(.2, Math.min(.8, N(f.share))) : .5;
    f.threshold = num(f.threshold) ? Math.max(0, Math.min(.9, N(f.threshold))) : .34; f.seed = num(f.seed) ? N(f.seed) : 7;
    f.labels = arr(f.labels).slice(0, 2).map(x => str(x, 16)); if (f.labels.length < 2) f.labels = ['triangles', 'squares'];
  } else if (k === 'control_loop') {
    // {plant:'heater', setpoint, start, gain, delay, disturbance?, unit?, labels?}
    f.setpoint = num(f.setpoint) ? N(f.setpoint) : 21; f.start = num(f.start) ? N(f.start) : 15; f.gain = num(f.gain) ? Math.max(0, Math.min(5, N(f.gain))) : .8;
    f.delay = num(f.delay) ? Math.max(0, Math.min(20, N(f.delay))) : 1; f.leak = num(f.leak) ? Math.max(0, Math.min(1, N(f.leak))) : .1; f.ambient = num(f.ambient) ? N(f.ambient) : 10;
    f.unit = str(f.unit || '°C', 8); f.output = str(f.output || 'room temperature', 30); f.actuator = str(f.actuator || 'heater power', 30);
  } else if (k === 'analogy_map') {
    // {source, target, maps:[[source part, target part, relation?]], breaks:[...]}
    f.source = str(f.source, 50); f.target = str(f.target, 50);
    f.maps = arr(f.maps).slice(0, 7).map(m => Array.isArray(m) ? { a: str(m[0], 50), b: str(m[1], 50), rel: str(m[2] || '', 60) } : { a: str(m.a || m.source, 50), b: str(m.b || m.target, 50), rel: str(m.rel || m.relation || '', 60) }).filter(m => m.a && m.b);
    f.breaks = arr(f.breaks).slice(0, 4).map(x => str(x, 140)).filter(Boolean);
    if (!f.source || !f.target) E.push('analogy_map needs "source" and "target"');
    if (f.maps.length < 2) E.push('analogy_map needs ≥ 2 "maps" ([source part, target part, relation])');
    if (!f.breaks.length) E.push('analogy_map needs "breaks": where the likeness stops holding (an analogy without its limits teaches a misconception)');
  }
  if (f.question != null && !f.question) delete f.question;
  return E;
}

// ---------------------------------------------------------------- the deterministic fallback (no AI)
// Built only from what the step holds: a table of numbers becomes a data narrative whose states are "all of it" and
// "the largest and smallest", with the step's own reference as the provenance line. Anything else needs authoring.
export function autoPrimitive(st, route) {
  if (!st || !route) return null;
  const T = st.table;
  if ((route.structure === 'data_narrative' || route.primitive === 'data_narrative') && T && Array.isArray(T.rows) && T.rows.length >= 2) {
    const cols = T.columns || [], ys = cols.map((c, i) => i).filter(i => i > 0 && T.rows.every(r => num(String(r[i] ?? '').replace(/[,%]/g, ''))));
    if (!ys.length) return null;
    const cats = T.rows.map(r => str(r[0], 16)), series = ys.slice(0, 3).map(i => ({ name: str(cols[i] || 'value', 30), values: T.rows.map(r => +String(r[i]).replace(/[,%]/g, '')) }));
    const v = series[0].values, hi = v.indexOf(Math.max(...v)), lo = v.indexOf(Math.min(...v));
    return { kind: 'data_narrative', caption: T.caption || ('The table of ' + (st.title || 'this step') + ', step by step.'), question: st.answers || '', categories: cats, series, ylabel: series.length === 1 ? series[0].name : '', mode: T.rows.length >= 6 ? 'slides' : 'story',
      states: [{ title: 'All of the table', show: 'all', note: 'Every row of the table, as it is printed.' }, { title: 'The extremes', show: [series[0].name], highlight: [hi, lo], annotate: [{ at: hi, text: 'largest: ' + cats[hi] }, { at: lo, text: 'smallest: ' + cats[lo] }], note: 'The largest and the smallest value of ' + series[0].name + '.' }],
      source: { name: st.ref || 'the PDF', year: '', note: 'drawn from the step\'s table' }, auto: true };
  }
  return null;
}
