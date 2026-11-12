#!/usr/bin/env node
// The explanatory compiler, offline (node, no installs): the classifier's routing, the AI override, the primitive
// specs' validation, and the example book (js/seeds-domains.js): every primitive present, every figure valid, its
// arithmetic right, its loops labelled correctly, its search optimal.
//   node tools/test-domains.mjs        exit code 0 = all pass
import { classifyStep, ROUTES, PRIMITIVE_KINDS, autoPrimitive, domainSequence } from '../js/dio/domains.js';
import { validateFigure, FIGURE_KINDS } from '../js/room/figspec.js';
import { DOMAIN_BOOK } from '../js/seeds-domains.js';
import { cycles } from '../js/dio/prims/loops.js';
import { search } from '../js/dio/prims/sandbox.js';
import { evaluate } from '../js/dio/prims/argument.js';
import { sceneFor } from '../js/dio/prims/scenes.js';
import { domainGrammar } from '../js/dio/plans.js';

let pass = 0, fail = 0; const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('FAIL  ' + msg); } };
const eq = (a, b, msg) => ok(a === b, `${msg}: got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`);

// ---------------------------------------------------------------- 1. routing: one step per structure, worded as a textbook would
const CASES = [
  ['cs', 'construction', 'progressive_construction', { title: 'Building a tiny GPT from scratch', statement: 'We start with the simplest bigram model and add self-attention because the bigram is needed context; then we add positional embeddings and a feed-forward layer, each component added because the previous version fails.' }],
  ['cs', 'state_machine', 'state_machine', { title: 'The fetch–decode–execute cycle', statement: 'On each clock tick the program counter sends an address over the bus, the instruction register latches the instruction, and register A latches the value: the state transitions once per cycle.' }],
  ['cs', 'algorithm', 'algorithm_sandbox', { title: 'Shortest paths with A*', statement: 'The algorithm keeps a frontier of grid cells, expands the one with the least cost plus heuristic, records where each visited cell came from, and stops at the goal; Dijkstra and breadth-first search use other orderings.' }],
  ['maths', 'transformation', 'transform2d', { kind: 'theorem', title: 'Determinant as area', statement: 'A 2×2 matrix is a linear transformation of the plane; the basis vectors î and ĵ land on its columns and the unit square becomes a parallelogram of area |det A|.' }],
  ['maths', 'distribution', 'distribution_lab', { title: 'The normal distribution', statement: 'A random variable with a normal distribution has mean μ and standard deviation σ; its histogram of many samples approaches the bell curve, with 68 % within one standard deviation.' }],
  ['economics', 'causal_graph', 'causal_loop', { title: 'Inflation feedback', statement: 'Higher prices raise wage demands, which raise costs and push up prices again, a reinforcing feedback loop; the central bank raises interest rates, which lowers spending and brakes inflation in a balancing loop.' }],
  ['economics', 'competing', 'competing_explanations', { title: 'Why is unemployment high?', statement: 'Economists offer competing explanations: a demand-side account, a structural explanation of skill mismatch, labour-market frictions and institutions; which explanation fits depends on evidence that distinguishes between them, such as vacancies.' }],
  ['business', 'flow_network', 'flow_network', { title: 'How a marketplace makes money', statement: 'Customers pay the platform, which keeps a commission and pays the suppliers; goods flow from suppliers to customers through the marketplace, and the business model depends on the margin on each sale.' }],
  ['philosophy', 'argument_graph', 'argument_map', { title: 'The Gettier problem', statement: 'The argument claims that knowledge is justified true belief; its premises say truth, belief and justification are necessary; an objection gives a counterexample, and a response proposes a revised claim.' }],
  ['data', 'data_narrative', 'data_narrative', { title: 'Who uses public transport?', statement: 'The survey shows the share of respondents who commute by bus fell from 18 per cent in 2010 to 11 per cent in 2020, a trend the chart compares across regions.', table: { columns: ['year', 'share %'], rows: [['2010', '18'], ['2015', '14'], ['2020', '11']] } }],
  ['philosophy', 'taxonomy', 'tree', { title: 'The branches of ethics', statement: 'Moral philosophy divides into kinds of theories: the types of ethics are metaethics, normative ethics and applied ethics; normative ethics classifies consequentialist, deontological and virtue theories.' }],
  ['physical', 'mechanism', 'scene', { title: 'How a four-stroke engine works', statement: 'Inside the engine the piston moves down, the intake valve opens, the crankshaft rotates and the mechanism converts the force of the burning fuel into rotation.' }],
  ['economics', 'agent_system', 'scene', { title: 'Cooperation in repeated games', statement: 'In a repeated prisoner\'s dilemma, players choose strategies such as tit for tat; a population of agents that cooperate or defect evolves as strategies earn different payoffs in a tournament.' }]
];
for (const [d, s, p, st] of CASES) { const r = classifyStep(st); eq(r.domain, d, `domain of "${st.title}"`); eq(r.structure, s, `structure of "${st.title}"`); eq(r.primitive, p, `primitive of "${st.title}"`); ok(['diorama', 'panel', 'simulation', 'figure', 'slides'].includes(r.medium), `medium of "${st.title}" is known (${r.medium})`); ok(r.why.length > 0, 'a reason is given'); }
// every structure routes to a primitive that is a figure kind or a scene
Object.entries(ROUTES).forEach(([s, r]) => ok(r.primitive === 'scene' || FIGURE_KINDS.includes(r.primitive), `route ${s} → ${r.primitive} is drawable`));
PRIMITIVE_KINDS.forEach(k => ok(FIGURE_KINDS.includes(k), `primitive ${k} is a figure kind`));
// the AI's field wins when valid, and is ignored when it names nothing known
{ const st = CASES[0][3]; const r = classifyStep({ ...st, visual: { domain: 'philosophy', structure: 'argument', why: 'test' } }); eq(r.structure, 'argument_graph', 'visual.structure alias "argument" overrides'); eq(r.source, 'ai', 'the override is marked as the AI\'s'); eq(r.heuristic.structure, 'construction', 'the heuristic answer is kept beside it');
  const r2 = classifyStep({ ...st, visual: { domain: 'astrology', structure: 'vibes' } }); eq(r2.source, 'heuristic', 'unknown visual values fall back to the heuristic'); }
// a long table is an analytic slide (the Perun rule); a code step leans to cs
eq(classifyStep({ title: 'Prices by city', statement: 'The table compares rents.', table: { columns: ['city', 'rent'], rows: [...Array(8)].map((_, i) => ['c' + i, String(100 + i)]) } }).medium, 'slides', 'a table of 8 rows becomes slides');
eq(classifyStep({ title: 'A loop', statement: 'Sum the numbers.', code: { lines: [{ code: 'for x in xs: s += x' }] } }).domain, 'cs', 'a step with code is cs');
ok(domainSequence('philosophy').length >= 5 && domainSequence('nope').length >= 5, 'every domain has a didactic sequence');

// ---------------------------------------------------------------- 2. validation of the primitive specs
const bad = [[{ kind: 'causal_loop', caption: 'x', nodes: ['a', 'b'], edges: [['n0', 'n1', 'maybe'], ['n1', 'n0', '+']] }, 'sign'], [{ kind: 'argument_map', caption: 'x', nodes: [{ id: 'a', text: 'A' }] }, 'nodes'], [{ kind: 'data_narrative', caption: 'x', categories: ['a'], series: [{ name: 's', values: [1] }], states: [{ title: 't' }] }, 'source'],
  [{ kind: 'competing_explanations', caption: 'x', hypotheses: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], evidence: [{ label: 'e', fits: { a: '+', b: '+' } }, { label: 'f', fits: { a: '0', b: '0' } }] }, 'tells'], [{ kind: 'progressive_construction', caption: 'x', parts: ['a', 'b'], stages: [{ label: 's', adds: ['p0'] }] }, 'stages'], [{ kind: 'transform2d', caption: 'x', matrix: [[1, 2]] }, 'matrix'], [{ kind: 'flow_network', caption: 'x', actors: [{ id: 'a' }, { id: 'b' }], flows: [{ from: 'a', to: 'b' }], units: { price: 1, items: [{ label: 'c', value: 3 }] } }, '150']];
bad.forEach(([f, word]) => { const v = validateFigure(f); ok(!v.ok && v.errors.some(e => e.includes(word)), `${f.kind} rejects a bad spec (${word}): ${v.errors.join('; ')}`); });
{ const v = validateFigure({ kind: 'algorithm_sandbox', caption: 'x', rows: ['S.#.G', '..#..', '.....'] }); ok(v.ok && v.fig.grid.w === 5 && v.fig.walls.length === 2 && v.fig.goal[0] === 4, 'sandbox rows → grid, walls, start, goal'); }

// ---------------------------------------------------------------- 3. the example book
const figs = []; DOMAIN_BOOK.parts.forEach(P => P.analysis.chain.forEach(st => (st.explain || []).forEach(p => p.figure && figs.push({ st, f: p.figure }))));
const kinds = new Set(figs.map(x => x.f.kind)); PRIMITIVE_KINDS.forEach(k => ok(kinds.has(k), `the example book has a ${k}`));
ok(new Set(DOMAIN_BOOK.parts.flatMap(P => P.analysis.chain.map(st => classifyStep(st).domain))).size >= 6, 'the example book covers at least six domains');
figs.forEach(({ st, f }) => { const v = validateFigure(f); ok(v.ok, `${st.title}: ${f.kind} is valid ${v.errors.join('; ')}`); });
DOMAIN_BOOK.parts.forEach(P => P.analysis.chain.forEach((st, i, ch) => { if (i) eq(st.answers, ch[i - 1].opens, `${P.title} ${st.id}: the question thread`); const r = classifyStep(st); ok(r.source === 'ai' && r.primitive === (st.visual.primitive === 'tree' ? 'tree' : st.visual.primitive), `${st.title} routes to its own primitive (${r.primitive})`);
  // the heuristic alone, without the AI's field, agrees on the structure for the example steps
  const h = classifyStep({ ...st, visual: null }); ok(h.structure === r.structure, `${st.title}: heuristic structure ${h.structure} = ${r.structure}`); }));
const byKind = k => figs.filter(x => x.f.kind === k).map(x => validateFigure(x.f).fig);
// arithmetic in the figures
{ const F = byKind('flow_network')[0], cost = F.units.items.reduce((a, b) => a + b.value, 0); ok(Math.abs(cost - 4.4) < 1e-9 && Math.abs(F.units.price - cost - 0.6) < 1e-9, 'coffee: costs $4.40, margin $0.60'); ok(Math.abs((F.units.price - cost) / F.units.price - .12) < 1e-9, 'coffee: margin 12 %'); }
{ const [M] = byKind('transform2d'); eq(M.matrix[0][0] * M.matrix[1][1] - M.matrix[0][1] * M.matrix[1][0], 2.5, 'matrix: det = 2.5'); const col = M.presets.find(p => /line/.test(p.label)).matrix; eq(col[0][0] * col[1][1] - col[0][1] * col[1][0], 0, 'collapse preset: det 0'); const sh = M.presets.find(p => /shear/.test(p.label)).matrix; eq(sh[0][0] * sh[1][1] - sh[0][1] * sh[1][0], 1, 'shear preset keeps area'); }
{ const [S] = byKind('state_machine'), v = Object.fromEntries(S.nodes.filter(n => n.register).map(n => [n.id, n.value])); S.ticks.forEach(t => Object.assign(v, t.set)); eq(v.a, '42', 'tiny computer: A = 28 + 14 = 42 after the last tick'); eq(v.pc, '2', 'tiny computer: PC = 2 after two instructions'); }
{ const D = byKind('data_narrative'); const co2 = D[0].series[0].values, rise = D[1].series[0].values; ok(Math.abs(co2[7] - co2[0] - 104.17) < 1e-6, 'CO₂: 421.08 − 316.91 = 104.17'); ok(Math.abs((co2[7] - co2[0]) / co2[0] * 100 - 32.87) < .01, 'CO₂: +32.9 %');
  rise.forEach((r, i) => ok(Math.abs(co2[i + 1] - co2[i] - r) < 1e-6, `CO₂: decade ${i} rise ${r} = ${(co2[i + 1] - co2[i]).toFixed(2)}`)); }
{ const [L] = byKind('causal_loop'), C = cycles(L.nodes, L.edges); eq(C.length, 2, 'inflation: two loops found'); const spiral = C.find(c => c.nodes.includes('w')), brake = C.find(c => c.nodes.includes('i')); eq(spiral.sign, 1, 'the wage–price spiral is reinforcing'); eq(brake.sign, -1, 'the monetary brake is balancing'); }
{ const [A] = byKind('argument_map'); const base = evaluate(A, new Set()); eq(base.get('p3'), 'contested', 'JTB: sufficiency is contested by the Gettier objection'); eq(base.get('c'), 'unsupported', 'JTB: the claim is unsupported while its premise is contested'); eq(base.get('rc'), 'contested', 'the revised claim is contested by fake barns');
  const after = evaluate(A, new Set(['x'])); eq(after.get('o'), 'unsupported', 'challenging the counterexample leaves the objection unsupported'); eq(after.get('c'), 'in', 'and the JTB claim stands again'); }
{ const [G] = byKind('algorithm_sandbox'), R = {}; ['bfs', 'dijkstra', 'greedy', 'astar'].forEach(a => { R[a] = search(G, G.walls, a); }); ok(R.astar.path.length > 0, 'sandbox: a path exists'); eq(R.astar.pathCost, R.dijkstra.pathCost, 'A* is optimal (same cost as Dijkstra)'); ok(R.astar.order.length < R.dijkstra.order.length, `A* expands fewer cells than Dijkstra (${R.astar.order.length} < ${R.dijkstra.order.length})`); ok(R.greedy.pathCost >= R.astar.pathCost, 'greedy is never cheaper than A*');
  const walled = search(G, [...G.walls, ...[...Array(G.grid.h)].map((_, y) => [5, y])], 'astar'); eq(walled.path.length, 0, 'a wall across the grid leaves no path'); }
{ const [E] = byKind('competing_explanations'); const tells = E.evidence.filter(e => new Set(E.hypotheses.map(h => e.fits[h.id] || '0')).size > 1); eq(tells.length, 4, 'unemployment: four rows tell the accounts apart, one does not'); }
// the four primitives with a spatial reading compile to scene specs with bodies and 2+ lessons with a thread
['progressive_construction', 'state_machine', 'causal_loop', 'flow_network'].forEach(k => { const s = sceneFor(byKind(k)[0]); ok(s && s.type === 'scene' && s.bodies.length >= 4 && s.lessons.length >= 2, `${k} compiles to a scene`); if (s) { s.lessons.forEach((l, i) => { if (i) eq(l.question, s.lessons[i - 1].opens, `${k} scene lesson thread ${i}`); }); try { new Function('api', s.code); pass++; } catch (e) { fail++; console.log('FAIL  ' + k + ' scene code does not parse: ' + e.message); } } });
ok(!sceneFor(byKind('argument_map')[0]), 'an argument map has no 3D reading');
// the deterministic fallback: a table becomes a data narrative
{ const st = { title: 'Rents', ref: 'Table 2, p. 4', table: { columns: ['city', 'rent'], rows: [['A', '900'], ['B', '1,200'], ['C', '700']] } }; const f = autoPrimitive(st, classifyStep(st)); ok(f && validateFigure(f).ok && f.states[1].highlight.join() === '1,2', 'autoPrimitive: a table → a valid data narrative marking the extremes'); }
// the planner: the domain picks the grammar
{ const g = domainGrammar(DOMAIN_BOOK.parts[4].analysis.chain[1]); eq(g.primitive, 'argument_map', 'planner: the Gettier step gets the argument map'); ok(g.sequence.length >= 5 && g.sequence[0].stage === 'curiosity', 'planner: a philosophy sequence of Owen stages'); }

// ---- figures that show: the analogy's depictions, "Picture it" illustrations, no redundant node diagrams, no cut text
{ const { normDepict, clipSentence, DEPICT_KINDS } = await import('../js/dio/prims/spec.js');
  const { pickDepict, splitBreak } = await import('../js/dio/prims/depict.js');
  const { validateFigure, redundantFigures } = await import('../js/room/figspec.js');
  const { endsUnfinished, qualityGate } = await import('../js/ai/prompts.js');
  ok(JSON.stringify(normDepict({ kind: 'barrier', params: { height: 7, focus: 'one', evil: '<x>' } })) === '{"kind":"barrier","params":{"height":1,"focus":"one"}}', 'a depiction is kept to known kinds, fields and ranges');
  ok(normDepict({ kind: 'rocket' }) === null, 'an unknown depiction kind is dropped');
  const P = (t, w, side) => pickDepict(t, { world: w, side });
  ok(P('person in the crowd', 'crowd at a fence', 'source').kind === 'barrier' && P('person in the crowd', 'crowd at a fence').params.agent === 'person', 'a person in a crowd at a fence: people at a barrier');
  ok(P('one A–B collision', 'A+B colliding', 'target').kind === 'collision', 'one collision: two particles meeting');
  ok(P('higher temperature T', 'A+B colliding', 'target').kind === 'tail', 'a higher temperature among molecules: the energy tail grows');
  ok(P('air temperature', 'a cricket chirps faster as its enzymes speed up').kind === 'thermometer' && P('chirp rate', '').kind === 'sound' && P('body temperature', 'a cricket').params.creature === 'cricket', 'Picture-it nodes: a thermometer, an organism warming, sound pulsing');
  ok(['resistor', 'battery', 'voltage', 'gear train', 'market price falls', 'xyzzy'].every(t => DEPICT_KINDS.includes(P(t, '').kind)), 'every phrase gets a depiction (a labelled still when nothing matches)');
  ok(P('xyzzy', '').kind === 'glyph' && P('xyzzy', '').params.label === 'xyzzy', 'the fallback is a still with its words, never empty');
  const sb = splitBreak('People aim at the fence; molecules move at random in every direction.'); ok(sb && /aim/.test(sb[0]) && /random/.test(sb[1]), 'a break splits into what the source does and what the target does');
  const A = validateFigure({ kind: 'analogy_map', caption: 'c', source: 'crowd at a fence', target: 'A+B colliding', maps: [{ a: 'fence height', b: 'activation energy', rel: 'threshold', depict: { source: { kind: 'barrier', params: { focus: 'barrier' } }, target: { kind: 'nope' } } }, ['running start', 'kinetic energy', 'decides success']], breaks: [{ text: 'People aim at the fence; molecules move at random.', depict: { source: 'barrier', target: { kind: 'agents', params: { mode: 'random' } } } }] });
  ok(A.ok && A.fig.maps[0].depict.source.kind === 'barrier' && !A.fig.maps[0].depict.target && A.fig.breakDepict[0].target.params.mode === 'random', 'analogy_map keeps valid per-row and per-break depictions');
  ok(JSON.stringify(validateFigure(A.fig).fig) === JSON.stringify(A.fig), 'analogy_map validation is stable (depictions survive a second pass)');
  const long = 'A cut pipe spills water out onto the floor; a cut wire stops the current at once. ' + 'No charge pours out of the cut ends, and nothing leaks. '.repeat(4);
  ok(/\.$/.test(validateFigure({ kind: 'analogy_map', caption: 'c', source: 's', target: 't', maps: [['a', 'b'], ['c', 'd']], breaks: [long] }).fig.breaks[0]), 'a long break is kept to whole sentences');
  ok(clipSentence('no full stop anywhere in this long text', 10) === 'no full stop anywhere in this long text', 'a text without a sentence end is never cut');
  const ct = validateFigure({ kind: 'contrast', caption: 'c', wrong: { title: 'W', text: 'x '.repeat(150) + 'slower per collision.' }, right: 'r' }).fig; ok(/slower per collision\.$/.test(ct.wrong.text), 'a contrast card keeps its whole sentence (was cut at 200 characters)');
  // redundancy: a flow that only boxes the step's own words, beside an animation of the same thing, is not drawn
  const st = { statement: 'Only collisions with energy above the activation energy react.', intuition: 'A crowd at a fence: only runners with a running start get over.', intuitionFigure: { kind: 'flow', caption: 'x', nodes: [{ id: 'a', label: 'crowd at the fence' }, { id: 'b', label: 'running start' }, { id: 'c', label: 'get over' }] } };
  const mo = { beats: [[0, 'The crowd mills about at the fence.'], [.5, 'Only those with a running start get over.']], items: [] };
  ok(redundantFigures(st, [mo]).has(st.intuitionFigure), 'a flow that restates the text beside its animation is redundant');
  ok(!redundantFigures(st, []).size, 'without an animation or richer figure the flow is kept');
  ok(!redundantFigures({ ...st, intuitionFigure: { ...st.intuitionFigure, nodes: [...st.intuitionFigure.nodes, { id: 'd', label: '2 in a billion collisions' }] } }, [mo]).size, 'a flow that adds a number the text does not give is kept');
  // a sentence that stops mid-way is flagged once for a rewrite
  ok(endsUnfinished('That a warmer cricket chirps slower per') && endsUnfinished('it trails off...') && !endsUnfinished('It ends well.') && !endsUnfinished('Its value is $x^2$'), 'unfinished sentences are recognised');
  const G = qualityGate({ chain: [{ id: 'S1', section: '1', statement: 'A whole statement.', explain: [{ text: 'A whole paragraph that explains it in enough words to count as an explanation here.' }], misconception: 'That a warmer cricket chirps slower per' }] }, [], []);
  ok(G.issues.some(i => i.kind === 'unfinished' && /misconception/.test(i.detail)), 'the quality gate asks for one rewrite of a cut-off misconception'); }
console.log(`test-domains: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
