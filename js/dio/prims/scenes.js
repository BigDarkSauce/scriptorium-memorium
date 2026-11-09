// Primitive → 3D diorama (the "diorama mode" of the four primitives with a spatial reading): a topdown scene spec
// (docs/SCENE_SPEC.md) on the plinth, whose code moves tokens along the edges and whose lessons walk the primitive's
// own steps (stages, ticks, loops, flows). Pure data + a code string: the diorama engine builds and runs it.
const C = o => JSON.parse(JSON.stringify(o));
const slug = (s, i) => (String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 18) || 'n') + '-' + i;
const lab = s => String(s || '').slice(0, 22);
// positions on the plinth (x, z) for n items: a ring, or a snake of rows
const ringXZ = (n, r = 4.2) => [...Array(n)].map((_, i) => [r * Math.cos(-Math.PI / 2 + i * 2 * Math.PI / n), r * Math.sin(-Math.PI / 2 + i * 2 * Math.PI / n) * .82]);
const snakeXZ = (n, cols = 3) => { const rows = Math.ceil(n / cols); return [...Array(n)].map((_, i) => { const r = Math.floor(i / cols), c0 = i % cols, c = r % 2 ? cols - 1 - c0 : c0; return [(c - (cols - 1) / 2) * 3.6, (r - (rows - 1) / 2) * 3]; }); };
const arc = (a, b, h = .9, n = 14) => [...Array(n + 1)].map((_, k) => { const u = k / n; return [+(a[0] + (b[0] - a[0]) * u).toFixed(3), +(.45 + h * 4 * u * (1 - u)).toFixed(3), +(a[1] + (b[1] - a[1]) * u).toFixed(3)]; });
const node = (id, name, at, color, h = .5, describe = '') => [{ id, name, label: name, role: 'actor', describe: describe || name, shape: { kind: 'cylinder', r: .62, h }, material: { preset: 'ceramic', color }, position: [at[0], h / 2, at[1]] }];   /* named by the diorama's own pins */
const base = (title, purpose) => ({ type: 'scene', title, purpose, technique: 'topdown', environment: { preset: 'studio' }, bodies: [{ id: 'board', name: 'Board', role: 'decor', shape: { kind: 'box', w: 10.4, h: .12, d: 7.6, round: .1 }, material: { preset: 'parchment' }, position: [0, .06, 0] }], tour: [], lessons: [] });
// the token code: each token rides one polyline, looping, with a phase; tokens of hidden edges hide
const TOKENS = `const R = __R__; const toks = R.map((r, i) => ({ o: api.body(r.id), p: r.pts, ph: r.ph || 0, sp: r.sp || .35, on: r.on }));
api.onFrame((dt, t) => { const st = api.p.stage ?? 99; toks.forEach(k => { if (!k.o) return; const vis = k.on == null || k.on <= st; k.o.visible = vis; if (!vis) return; const u = ((t * k.sp + k.ph) % 1) * (k.p.length - 1), i = Math.floor(u), f = u - i, a = k.p[i], b = k.p[Math.min(k.p.length - 1, i + 1)]; k.o.position.set(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f); }); });`;
const tokenCode = rides => TOKENS.replace('__R__', JSON.stringify(rides));
export function sceneFor(f) {
  if (!f) return null;
  if (f.kind === 'flow_network') return flowScene(f);
  if (f.kind === 'causal_loop') return loopScene(f);
  if (f.kind === 'progressive_construction') return buildScene(f);
  if (f.kind === 'state_machine') return machineScene(f);
  return null;
}
function flowScene(f) {
  const S = base(f.title || 'The business as a system', f.question || f.caption), col = { supplier: -1.5, partner: -1.5, firm: 0, platform: 0, regulator: 0, competitor: 0, intermediary: 1.5, customer: 3 };
  const xs = [...new Set(f.actors.map(a => col[a.role] ?? 0))].sort((a, b) => a - b), at = new Map();
  xs.forEach((x, ci) => { const here = f.actors.filter(a => (col[a.role] ?? 0) === x); here.forEach((a, j) => at.set(a.id, [(ci - (xs.length - 1) / 2) * (10 / Math.max(1, xs.length - .2)), a.role === 'competitor' ? 2.9 : (j - (here.length - 1) / 2) * 2.9 - .5])); });
  const ids = new Map(f.actors.map((a, i) => [a.id, slug(a.label, i)]));
  f.actors.forEach(a => S.bodies.push(...node(ids.get(a.id), a.label, at.get(a.id), a.role === 'competitor' ? '#c9826f' : a.role === 'customer' ? '#8fb3d9' : '#d9c48f', .5, a.note || a.role)));
  const rides = [];
  f.flows.forEach((x, i) => { const a = at.get(x.from), b = at.get(x.to), side = x.kind === 'money' ? .35 : -.35, dz = b[0] - a[0], dx = -(b[1] - a[1]), L = Math.hypot(dx, dz) || 1, o = [dx / L * side, dz / L * side], pts = arc([a[0] + o[0], a[1] + o[1]], [b[0] + o[0], b[1] + o[1]], x.kind === 'money' ? 1.1 : .7);
    S.bodies.push({ id: 'flow' + i, name: (x.label || x.kind), role: 'decor', shape: { kind: 'tube', points: pts, r: .045 }, material: { preset: x.kind === 'money' ? 'brass' : 'plastic', color: x.kind === 'money' ? '#b8913c' : '#2d5b8e' } });
    [0, .5].forEach(ph => { const id = 'tok' + i + (ph ? 'b' : 'a'); S.bodies.push({ id, name: x.kind === 'money' ? 'coin' : 'crate', role: 'decor', shape: x.kind === 'money' ? { kind: 'cylinder', r: .16, h: .05 } : { kind: 'box', w: .26, h: .26, d: .26 }, material: { preset: x.kind === 'money' ? 'gold' : 'wood' }, position: pts[0] }); rides.push({ id, pts, ph }); }); });
  S.code = tokenCode(rides) + `\napi.readout('flows', () => ${f.flows.length});`;
  S.tour = f.actors.map(a => ids.get(a.id));
  const firm = f.actors.find(a => a.role === 'firm') || f.actors[0], cust = f.actors.find(a => a.role === 'customer') || f.actors[f.actors.length - 1], q0 = f.question || 'How does this business make money?';
  S.lessons = [
    { title: 'The actors', question: q0, text: 'Look at the actors on the board: who makes, who sells, who buys.', focus: ids.get(firm.id), run: 4, explain: f.actors.map(a => a.label + ' (' + a.role + ')').join(', ') + '.', opens: 'Which way do the goods travel?' },
    { title: 'Follow the goods', question: 'Which way do the goods travel?', text: 'Watch the wooden crates on the blue tubes.', focus: ids.get(cust.id), shot: 'medium', run: 5, explain: f.flows.filter(x => x.kind === 'goods').map(x => x.label).join('; ') || 'No goods change hands.', opens: 'And the money?' },
    { title: 'Follow the money', question: 'And the money?', text: 'Watch the gold coins on the brass tubes: they run against the goods they pay for.', focus: ids.get(firm.id), shot: 'medium', run: 5, explain: f.flows.filter(x => x.kind === 'money').map(x => x.label).join('; ') + (f.units ? `. Of a ${f.units.currency}${f.units.price} sale, ${f.units.currency}${(f.units.price - f.units.items.reduce((s, it) => s + it.value, 0)).toFixed(2)} is left as margin.` : '.'), opens: 'Where would a change in one flow show up?' }];
  return S;
}
function loopScene(f) {
  const S = base(f.title || 'Feedback loops', f.question || f.caption), at = ringXZ(f.nodes.length), ids = new Map(f.nodes.map((n, i) => [n.id, slug(n.label, i)])), P = new Map(f.nodes.map((n, i) => [n.id, at[i]]));
  f.nodes.forEach(n => S.bodies.push(...node(ids.get(n.id), n.label, P.get(n.id), '#d9c48f')));
  const rides = [];
  f.edges.forEach((e, i) => { const a = P.get(e.from), b = P.get(e.to), dz = b[0] - a[0], dx = -(b[1] - a[1]), L = Math.hypot(dx, dz) || 1, o = [dx / L * .35, dz / L * .35], pts = arc([a[0] + o[0], a[1] + o[1]], [b[0] + o[0], b[1] + o[1]], .8), s = pts[Math.round(pts.length * .74)];
    S.bodies.push({ id: 'edge' + i, name: 'influence ' + (e.sign > 0 ? '+' : '−'), role: 'decor', shape: { kind: 'tube', points: pts, r: .045 }, material: { preset: 'plastic', color: '#5b4532' } }, { id: 'sign' + i, name: e.sign > 0 ? 'plus' : 'minus', role: 'decor', shape: { kind: 'sphere', r: .2 }, material: { preset: 'plastic', color: e.sign > 0 ? '#3f7d6e' : '#9c3a28' }, position: s }, { id: 'pulse' + i, name: 'signal', role: 'decor', shape: { kind: 'sphere', r: .14 }, material: { preset: 'emissive', color: e.sign > 0 ? '#5fbf9a' : '#e0705a', emissive: e.sign > 0 ? '#3f7d6e' : '#9c3a28' }, position: pts[0] });
    rides.push({ id: 'pulse' + i, pts, ph: i * .17, sp: .3 }); });
  S.code = tokenCode(rides);
  S.tour = f.nodes.map(n => ids.get(n.id));
  const q0 = f.question || 'What happens when one variable changes?';
  S.lessons = [{ title: 'The variables', question: q0, text: 'Each pillar is a variable; each tube an influence. Green beads are +, red beads −.', focus: ids.get(f.nodes[0].id), run: 4, explain: 'Along a + influence the next variable moves the same way; along a − influence, the opposite way.', opens: 'Does a change come back to where it started?' },
    { title: 'Around the loop', question: 'Does a change come back to where it started?', text: 'Follow the glowing signals around the ring.', focus: ids.get(f.nodes[Math.min(1, f.nodes.length - 1)].id), shot: 'wide', run: 6, explain: 'A loop with an even number of − signs reinforces the change; an odd number balances it.', opens: 'Which of these loops dominates?' }];
  return S;
}
// the parts of one stage share a muted manuscript tone (rubric, lapis, verdigris, brass, violet), so the blocks stand
// off the parchment board and the stages read apart (one cream tone for every block washed out against the board)
const STAGE_TONES = ['#a8543e', '#3f6d9a', '#4d8473', '#a5853f', '#6e5390', '#8a6a4a'];
function buildScene(f) {
  const S = base(f.title || 'Built up part by part', f.question || f.caption), stageOf = new Map(); f.stages.forEach((s, i) => s.adds.forEach(id => { if (!stageOf.has(id)) stageOf.set(id, i); }));
  const order = f.parts.slice().sort((a, b) => stageOf.get(a.id) - stageOf.get(b.id)), at = snakeXZ(order.length, order.length > 4 ? 3 : 2), ids = new Map(order.map((p, i) => [p.id, slug(p.label, i)])), P = new Map(order.map((p, i) => [p.id, at[i]]));
  order.forEach(p => { const [x, z] = P.get(p.id); S.bodies.push({ id: ids.get(p.id), name: p.label, label: p.label, role: 'actor', describe: (f.stages[stageOf.get(p.id)] || {}).why || p.label, shape: { kind: 'box', w: 2.6, h: .6, d: 1.6, round: .08 }, material: { preset: 'ceramic', color: STAGE_TONES[stageOf.get(p.id) % STAGE_TONES.length] }, position: [x, .42, z] });  });
  const rides = []; f.links.forEach((l, i) => { const a = P.get(l.from), b = P.get(l.to); if (!a || !b) return; const pts = arc(a, b, .6); S.bodies.push({ id: 'link' + i, name: 'link', role: 'decor', shape: { kind: 'tube', points: pts, r: .05 }, material: { preset: 'brass' } }, { id: 'lt' + i, name: 'value', role: 'decor', shape: { kind: 'sphere', r: .13 }, material: { preset: 'emissive', color: '#ffd98a', emissive: '#cfa84f' }, position: pts[0] }); rides.push({ id: 'lt' + i, pts, on: Math.max(stageOf.get(l.from), stageOf.get(l.to)) }); });
  S.params = [{ key: 'stage', label: 'stage', min: 0, max: f.stages.length - 1, value: 0, step: 1 }];
  const vis = Object.fromEntries(order.map(p => [ids.get(p.id), stageOf.get(p.id)])), links = Object.fromEntries(f.links.map((l, i) => ['link' + i, Math.max(stageOf.get(l.from) ?? 0, stageOf.get(l.to) ?? 0)]));
  S.code = tokenCode(rides) + `\nconst VIS = ${JSON.stringify(vis)}, LNK = ${JSON.stringify(links)}, NAME = ${JSON.stringify(Object.fromEntries(order.map(p => [ids.get(p.id), p.label])))}; const drop = {};
api.onFrame((dt) => { const st = Math.round(api.p.stage); for (const id in VIS) { const o = api.body(id), lb = api.body(id + '-t'); if (!o) continue; const on = VIS[id] <= st; o.visible = on; if (lb) lb.visible = on; if (on && drop[id] == null) { drop[id] = 1.6; api.event('added: ' + NAME[id], o.position); } if (!on) drop[id] = null; if (drop[id]) { drop[id] = Math.max(0, drop[id] - dt * 3); o.position.y = .42 + drop[id]; if (lb) lb.position.y = .95 + drop[id]; } } for (const id in LNK) { const o = api.body(id); if (o) o.visible = LNK[id] <= st; } });
api.readout('stage', () => Math.round(api.p.stage) + 1);`;
  S.tour = order.map(p => ids.get(p.id));
  S.lessons = f.stages.slice(0, 6).map((s, i) => ({ title: s.label.slice(0, 40), question: i ? (s.problem || 'What is still missing?') : (f.question || 'What is the simplest version that works?'), text: s.adds.length ? 'Watch ' + s.adds.map(id => (f.parts.find(p => p.id === id) || {}).label).join(', ') + ' drop in.' : s.label, set: { stage: i }, focus: ids.get(s.adds[0]) || ids.get(order[0].id), shot: 'medium', run: 4, explain: s.why, opens: (f.stages[i + 1] && (f.stages[i + 1].problem || 'What is still missing?')) || 'What would you add next?' }));
  if (S.lessons.length < 3) S.lessons.push({ title: 'The whole', question: S.lessons[S.lessons.length - 1].opens, text: 'Look at the whole system again.', focus: ids.get(order[0].id), run: 3, explain: 'Every part is there because a simpler version failed without it.', opens: 'What would you add next?' });
  return S;
}
function machineScene(f) {
  const S = base(f.title || 'A signal journey', f.question || f.caption), at = snakeXZ(f.nodes.length, f.nodes.length > 4 ? 3 : 2), ids = new Map(f.nodes.map((n, i) => [n.id, slug(n.label, i)])), P = new Map(f.nodes.map((n, i) => [n.id, at[i]]));
  f.nodes.forEach(n => { const [x, z] = P.get(n.id); S.bodies.push({ id: ids.get(n.id), name: n.label, label: n.label + (n.register ? ' (register)' : ''), role: 'actor', describe: n.note || (n.register ? 'holds a value between clock ticks' : n.label), shape: { kind: 'box', w: 2.4, h: .55, d: 1.5, round: .06 }, material: n.register ? { preset: 'brass' } : { preset: 'ceramic', color: '#d8d0bd' }, position: [x, .4, z] });  });
  const wires = new Map(); f.wires.forEach((w, i) => { const pts = arc(P.get(w.from), P.get(w.to), .35); wires.set(w.from + '>' + w.to, pts); S.bodies.push({ id: 'wire' + i, name: 'wire', role: 'decor', shape: { kind: 'tube', points: pts, r: .04 }, material: { preset: 'copper' } }); });
  // one packet per tick, riding its tick's first packet wire; the "tick" param picks which
  const T = f.ticks.map(t => t.packets.map(p => wires.get(p.from + '>' + p.to) || [[...P.get(p.from)].flatMap((v, k) => k ? [.6, v] : [v]), [...P.get(p.to)].flatMap((v, k) => k ? [.6, v] : [v])]));
  S.bodies.push({ id: 'packet', name: 'packet', label: 'packet', role: 'actor', describe: 'a value travelling on a wire', shape: { kind: 'sphere', r: .2 }, material: { preset: 'emissive', color: '#ff9a7a', emissive: '#9c3a28' }, position: [0, .6, 0] });
  S.params = [{ key: 'tick', label: 'tick', min: 1, max: f.ticks.length, value: 1, step: 1 }];
  S.code = `const T = ${JSON.stringify(T)}; const pk = api.body('packet'); let last = -1;
api.onFrame((dt, t) => { const k = Math.max(0, Math.min(T.length - 1, Math.round(api.p.tick) - 1)), L = T[k]; if (k !== last) { last = k; api.event('clock tick ' + (k + 1), null); } if (!L.length) { pk.visible = false; return; } pk.visible = true; const p = L[Math.floor(t / 1.6) % L.length], u = (t % 1.6) / 1.6 * (p.length - 1), i = Math.floor(u), f = u - i, a = p[i], b = p[Math.min(p.length - 1, i + 1)]; pk.position.set(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f); });
api.readout('tick', () => Math.round(api.p.tick));`;
  S.tour = [...f.nodes.map(n => ids.get(n.id)), 'packet'];
  S.lessons = f.ticks.slice(0, 6).map((t, i) => ({ title: ('Tick ' + (i + 1) + ': ' + t.label).slice(0, 44), question: i ? 'What does tick ' + (i + 1) + ' change?' : (f.question || 'What happens on one clock tick?'), text: 'Watch the glowing packet: which wire carries it, which part receives it.', set: { tick: i + 1 }, focus: t.packets[0] ? ids.get(t.packets[t.packets.length - 1].to) : 'packet', shot: 'medium', run: 4, explain: t.note || t.label, opens: i + 1 < Math.min(6, f.ticks.length) ? 'What does tick ' + (i + 2) + ' change?' : 'What is the machine\'s state now?' }));
  return C(S);
}
