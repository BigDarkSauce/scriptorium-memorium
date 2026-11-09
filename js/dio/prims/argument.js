// argument_map (Wi-Phi's sequence; Carneades' acceptability, Gordon, Prakken & Walton 2007): the argument as a
// navigable object. Question → claim ← premises; objection ⟶ claim or premise; counterexample ⟶ objection's target;
// response ⟶ objection; revised claim ⟶ claim. Press a node to inspect it; challenge it and every statement whose
// support runs through it changes status (shown as "affected").
// Spec: {question, nodes:[{id,type,text,short?}], links:[{from,to,rel:'supports'|'attacks'|'answers'|'revises'}]}
import { FC, nodeBox, boxExit, short, mathHTML } from './kit.js';

const TYPE = { question: [FC.ink, 'mute', 'Question'], claim: [FC.lapis, 'lapis', 'Claim'], conclusion: [FC.lapis, 'lapis', 'Conclusion'], premise: [FC.verd, 'verd', 'Premise'], objection: [FC.rubric, 'rubric', 'Objection'], counterexample: [FC.rubric, 'rubric', 'Counterexample'], response: [FC.brass, 'brass', 'Response'], revised: [FC.violet, '#efe8f3', 'Revised claim'] };
const REL = { supports: [FC.soft, null], attacks: [FC.rubric, '6 4'], answers: [FC.brass, null], revises: [FC.violet, '2 4'], addresses: [FC.mute, '1 3'] };
// statuses after the challenges: in · rejected (challenged) · unsupported (a support is out) · contested (an
// unanswered attacker is in) · answered (an objection defeated by a response that is in)
export function evaluate(f, challenged) {
  const st = new Map(f.nodes.map(n => [n.id, 'in'])), sup = id => f.links.filter(l => l.to === id && l.rel === 'supports').map(l => l.from), att = id => f.links.filter(l => l.to === id && l.rel === 'attacks').map(l => l.from), ans = id => f.links.filter(l => l.to === id && l.rel === 'answers').map(l => l.from);
  const ok = id => ['in'].includes(st.get(id));
  for (let it = 0; it < 12; it++) { let ch = false;
    f.nodes.forEach(n => { let s; if (challenged.has(n.id)) s = 'rejected'; else if (ans(n.id).some(ok)) s = 'answered'; else if (sup(n.id).length && !sup(n.id).every(ok)) s = 'unsupported'; else if (att(n.id).some(ok)) s = 'contested'; else s = 'in'; if (st.get(n.id) !== s) { st.set(n.id, s); ch = true; } });
    if (!ch) break; }
  return st;
}
export const size = (f, o) => { const L = layers(f), rows = rowsOf(f, L, o.narrow ? 2 : 3); return { W: o.narrow ? 360 : 600, H: 24 + rows.length * (o.narrow ? 86 : 84) }; };
function layers(f) { const L = new Map(f.nodes.map(n => [n.id, 0])); for (let it = 0; it < 12; it++) { let ch = false; f.links.forEach(l => { const v = (L.get(l.to) || 0) + 1; if (v > L.get(l.from) && v < 8) { L.set(l.from, v); ch = true; } }); if (!ch) break; } return L; }
function rowsOf(f, L, per) { const max = Math.max(...L.values()), rows = []; for (let d = 0; d <= max; d++) { const ns = f.nodes.filter(n => L.get(n.id) === d); for (let i = 0; i < ns.length; i += per) rows.push(ns.slice(i, i + per)); } return rows.filter(r => r.length); }
export function render(f, S) {
  const { W } = S, per = S.narrow ? 2 : 3, L = layers(f), rows = rowsOf(f, L, per), rh = S.narrow ? 86 : 84, P = new Map(), nw = S.narrow ? 158 : 178, nh = S.narrow ? 62 : 58;
  rows.forEach((row, ri) => row.forEach((n, j) => P.set(n.id, [(j + .5) * W / row.length, 18 + (ri + .5) * rh])));
  let sel = null; const challenged = new Set(), base = evaluate(f, new Set());
  const draw = () => {
    S.clear(); const st = evaluate(f, challenged), affected = new Set(f.nodes.filter(n => st.get(n.id) !== base.get(n.id) && !challenged.has(n.id)).map(n => n.id));
    f.links.forEach(l => { const a = P.get(l.from), b = P.get(l.to), [c, dash] = REL[l.rel], p = boxExit(a, nw, nh, b, 2), q = boxExit(b, nw, nh, a, 6), dim = st.get(l.from) !== 'in'; S.mk('line', { x1: p[0], y1: p[1], x2: q[0], y2: q[1], stroke: c, 'stroke-width': 1.6, 'stroke-dasharray': dash, opacity: dim ? .35 : 1, 'marker-end': S.arrow(c) });
      if (l.rel !== 'supports' && l.rel !== 'addresses') { const m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; S.mk('rect', { x: m[0] - 25, y: m[1] - 8, width: 50, height: 15, rx: 7, fill: FC.bg, stroke: c, 'stroke-width': .7 }); S.txt(m[0], m[1] + 3.5, l.rel, { 'text-anchor': 'middle', 'font-size': 9.5, fill: c, 'font-style': 'italic' }); } });
    f.nodes.forEach(n => { const [x, y] = P.get(n.id), [col, tone, name] = TYPE[n.type], s = st.get(n.id), on = sel === n.id, aff = affected.has(n.id);
      if (aff) S.mk('rect', { x: x - nw / 2 - 5, y: y - nh / 2 - 5, width: nw + 10, height: nh + 10, rx: 12, fill: 'rgba(207,168,79,.35)', stroke: FC.gold, 'stroke-width': 1.5 });
      const g = nodeBox(S, x, y + 6, nw, nh, n.short || short(n.text, S.narrow ? 64 : 76), { tone: s === 'rejected' ? '#eee6d8' : tone, stroke: on ? FC.ink : col, sw: on ? 2.6 : 1.3, fs: S.fs - 1.5, maxL: 3, cls: 'pnode', dash: s === 'unsupported' || s === 'contested' ? '5 3' : null }); g.dataset.id = n.id; g.style.cursor = 'pointer';
      // the type and the status on the top edge
      const tag = name + (s !== 'in' ? ' · ' + s : ''), tw = Math.min(nw - 12, tag.length * 6.2 + 12); S.mk('rect', { x: x - nw / 2 + 6, y: y - nh / 2 - 7, width: tw, height: 14, rx: 7, fill: s === 'rejected' ? FC.soft : s === 'in' ? col : FC.gold }, g); S.txt(x - nw / 2 + 12, y - nh / 2 + 3.5, tag, { 'font-size': 9.5, fill: '#fff', 'font-weight': 600, fit: tw - 10 }, g);
      if (s === 'rejected') S.mk('line', { x1: x - nw / 2 + 8, x2: x + nw / 2 - 8, y1: y + 6, y2: y + 6, stroke: FC.rubric, 'stroke-width': 1.6 }, g); });
    tell(st, affected);
  };
  const chBtn = S.btn('Challenge this', () => { if (!sel) return; if (challenged.has(sel)) challenged.delete(sel); else challenged.add(sel); draw(); }, { primary: true, title: 'Reject the selected statement and see what it affects' });
  S.btn('Reset', () => { challenged.clear(); sel = null; draw(); });
  const tell = (st, affected) => { const n = f.nodes.find(x => x.id === sel), name = id => { const m = f.nodes.find(x => x.id === id); return m ? TYPE[m.type][2].toLowerCase() + ' “' + short(m.short || m.text, 40) + '”' : id; };
    chBtn.disabled = !sel || (n && n.type === 'question'); chBtn.innerHTML = sel && challenged.has(sel) ? 'Accept it again' : 'Challenge this';
    S.say((f.question ? `<p class="arg-q"><span class="q-mark">Q</span> ${mathHTML(f.question)}</p>` : '') + (n ? `<p><b>${TYPE[n.type][2]}.</b> ${mathHTML(n.text)} <i>(${st.get(n.id)})</i></p>` : '<p>Press a statement to read it in full, then challenge it.</p>') + (affected.size ? `<p><b>Affected:</b> ${[...affected].map(id => mathHTML(name(id)) + ' → <i>' + st.get(id) + '</i>').join('; ')}.</p>` : challenged.size ? '<p><b>Affected:</b> nothing else rests on it.</p>' : ''));
    S.read([['challenged', challenged.size], ['affected', affected.size], ['claims standing', f.nodes.filter(x => /claim|conclusion|revised/.test(x.type) && st.get(x.id) === 'in').length + ' of ' + f.nodes.filter(x => /claim|conclusion|revised/.test(x.type)).length]]); };
  S.svg.addEventListener('click', ev => { const g = ev.target.closest && ev.target.closest('.pnode'); sel = g ? g.dataset.id : null; draw(); });
  draw(); S.redraw = draw; S.challenge = id => { sel = id; challenged.add(id); draw(); };
  return { draw };
}
