// Depictions: a small vocabulary of code-drawn pictures of things and events, each on a 200 × 120 stage, so a figure
// can show what a phrase names instead of only printing it. Used by the analogy map (a selected correspondence shows
// its source and its target side by side; a "where the likeness breaks" row shows the two behaviours that differ) and
// by "Picture it" flows (a small illustration under every node). Every depiction is either a short loop (agents at a
// barrier, a collision, a rising thermometer, sound pulsing…) or, for an object or a quantity, a precise still; under
// reduced motion every one is drawn as one still frame. Nothing here is decoration: a depiction is chosen because the
// phrase names its referent (keyword rules below) or because the figure says so ({kind, params}, validated by
// normDepict); when nothing matches, a labelled still (a glyph or icon with the words) is drawn, never an empty box.
//
//   pickDepict(text, {world, side}) → {kind, params}     world = the surrounding subject ("crowd at a fence")
//   normDepict(d)                   → {kind, params} | null
//   mountDepict(host, spec, {color, labels, calm, title}) → dispose()   host = an HTML element or an <svg> to draw into
//   splitBreak(text)                → [source part, target part] | null   ("X; Y", "X, whereas Y", "X, but Y")
import { NS, FC, rng, calm as calmPref } from './kit.js';
import { glyphFor, drawGlyph } from '../../room/glyphs.js';
import { iconFor, iconPath } from '../../icons.js';
import { DEPICT_KINDS, DEPICT_USES, normDepict, clipSentence } from './spec.js';

export const DW = 200, DH = 120;
export { DEPICT_KINDS, DEPICT_USES, normDepict, clipSentence };

// ---------------------------------------------------------------- choosing a depiction from words
const C = {
  barrier: /\b(fence|wall|barrier|hurdle|threshold|activation|e_?a\b|eₐ|over the top|hump|cross(es|ing)? (over|the)|clear(s|ing)?\b|hill)/,
  crowd: /\b(crowd|people|persons?|runners?|athletes?|someone|everyone|players?|walkers?|pedestrians?|humans?|children|kids)\b/,
  particle: /(molecul|particle|atom|\bions?\b|electron|collision|collid|\bgas\b|enzyme|reactant|substrate|\ba\s*[+–-]\s*b\b)/,
  collision: /(collision|collid|bump|\bmeets?\b|\bhits?\b|impact|encounter)/,
  energy: /(running start|run-?up|kinetic|\benergy|\bspeed|\bfast|momentum|velocit|vigou?r)/,
  heat: /(warm|heat|\bhot\b|temperature|\bt\b|livel|thermal|kelvin|°c|degrees)/,
  thermo: /(thermometer|temperature|°c|kelvin|air temp)/,
  dist: /(distribution|fraction|proportion|\btail\b|\bshare\b|percent|%|bell curve|spread of|only (a )?few|only some)/,
  rate: /(\brate\b|per (second|minute|hour)|frequency|how often|how fast|tempo|\bpace\b)/,
  sound: /(chirp|sound|\bsong|\bsing|\bcalls?\b|noise|\btone|pitch|\bhear|rhythm|\bbeat|click)/,
  wave: /(\bwaves?\b|oscillat|vibrat|ripple|\bsignal)/,
  spring: /(spring|elastic|stretch|hooke|rubber band)/, pend: /(pendul|\bswing)/,
  container: /(\btank|bucket|container|reservoir|\bbath|basin|\bfill|\blevel\b|\bstock\b|accumulat|\bstore)/,
  flow: /(\bflow|current|\bpipe|stream|\bpump|channel|river|circulat|battery|\bwires?\b|circuit|resist|\bbulb)/,
  gauge: /(pressure|voltage|potential difference|\bcharge\b|\bamount)/,
  cell: /(\bcells?\b|membrane|organelle|bacteri|nucleus|tissue)/,
  market: /(\bprice|market|buyer|seller|demand|supply|\bstall|\bshop|\bcost|money|€|\$|\bpay|\bsale)/,
  gear: /(\bgears?\b|\bcogs?\b|machine|engine|motor|clockwork|\bwheel)/,
  body: /(cricket|insect|\bbody\b|animal|organism|\bbugs?\b|beetle|\bbees?\b|\bants?\b|lizard|frog|cold-blooded|ectotherm)/,
  exchange: /(two-way|both ways|both directions|back and forth|reversib|equilibrium|⇌|bridge)/,
  balance: /(seesaw|see-saw|\blever|\bbalance|torque|\bscales\b|\bweigh)/,
  aim: /(\baim|choos|decid|intend|deliberat|try to|\bwant|on purpose|target)/,
  random: /(random|every direction|all directions|aimless|by chance|blind|haphazard|jostl|mill(s|ing)? about)/,
  one: /(^|\b)(one|a single|single|each|individual|person|molecule|runner|car)\b/,
  count: /(how many|number of|count|more (runs|of them|molecules|people)|reach the top|succeed|success)/,
  height: /(height|\bhigh\b|\btall|threshold|\bsize of|activation|\be_?a\b|eₐ)/,
  rising: /(rises?|rising|more|higher|increas|grow|faster|livel|warmer|up\b)/,
  falling: /(falls?|falling|less|lower|decreas|shrink|slower|cooler|colder|down\b)/
};
const has = (re, s) => re.test(s);
export function pickDepict(text, ctx = {}) {
  const t = ' ' + String(text || '').toLowerCase().replace(/\$/g, '') + ' ', w = ' ' + String(ctx.world || '').toLowerCase() + ' ', tw = t + ' ' + w;
  const personWorld = has(C.crowd, t) || (!has(C.particle, t) && has(C.crowd, w)), agent = personWorld ? 'person' : 'dot';
  const particleWorld = has(C.particle, t) || (!has(C.crowd, t) && has(C.particle, w));
  const heat = has(C.heat, t) && !/\b(heat of|latent)\b/.test(t), mode = has(C.random, t) ? 'random' : has(C.aim, t) ? 'aim' : personWorld ? 'aim' : 'random';
  const P = {}, out = (kind, p = {}) => ({ kind, params: { ...P, ...p } });
  const label = /\be_?a\b|eₐ|activation/.test(tw) ? 'Eₐ' : undefined;
  if (has(C.sound, t)) return out('sound', { rising: heat || has(C.rising, t) && !has(C.falling, t), rate: has(C.rate, t) ? .55 : .4 });
  if (has(C.body, t)) { const bug = /cricket|insect|\bbug|beetle|\bbee|\bant\b|grasshopper/; return out('body', { heat: heat || has(C.rising, t), creature: bug.test(t) || (/\bbody\b/.test(t) && bug.test(w)) ? 'cricket' : has(C.crowd, t) || (/\bbody\b/.test(t) && has(C.crowd, w)) ? 'person' : 'animal' }); }
  if (has(C.pend, t)) return out('pendulum'); if (has(C.spring, t)) return out('spring');
  if (has(C.gear, t)) return out('gear'); if (has(C.cell, t) && !has(C.barrier, t)) return out('cell');
  if (has(C.market, t)) return out('stall', { trend: has(C.falling, t) ? 'down' : has(C.rising, t) ? 'up' : 'flat' });
  if (has(C.exchange, t)) return out('exchange'); if (has(C.balance, t)) return out('balance', { tilt: has(C.falling, t) ? -.5 : .5 });
  if (has(C.particle, t) && /drift/.test(t)) return out('flow', { rate: .05 });
  // the barrier family: a threshold to clear, a crowd with a running start, a warmer crowd
  if (has(C.barrier, t) || (personWorld && has(C.barrier, w) && (has(C.energy, t) || has(C.one, t) || heat || has(C.count, t)))) {
    const focus = has(C.height, t) ? 'barrier' : has(C.energy, t) ? 'speed' : has(C.count, t) ? 'count' : has(C.one, t) && !heat ? 'one' : undefined;
    return out('barrier', { agent, mode: personWorld ? (has(C.random, t) ? 'random' : 'aim') : mode, ...(focus ? { focus } : {}), ...(heat ? { heat: true } : {}), ...(label ? { label } : {}) });
  }
  if (has(C.collision, t)) return out('collision', { agent, react: .25, ...(has(C.energy, t) ? { focus: 'speed' } : {}) });
  if (heat && (has(C.particle, t) || (ctx.side && particleWorld))) return out('tail', { heat: true, ...(label ? { label } : {}) });
  if (heat && personWorld && has(C.barrier, w)) return out('barrier', { agent, mode: 'aim', heat: true, focus: 'count' });
  if (has(C.dist, t)) return out('tail', { heat: false, ...(label ? { label } : {}) });
  if (has(C.energy, t) && particleWorld) return out('collision', { agent: 'dot', focus: 'speed', react: .25 });
  if (has(C.energy, t) && personWorld) return out('agents', { agent, mode: 'aim', speed: .8 });
  if (has(C.thermo, t) || heat) return out('thermometer', { from: has(C.falling, t) ? .8 : .25, to: has(C.falling, t) ? .3 : .8 });
  if (has(C.rate, t)) return out('meter', { value: .7, rising: has(C.rising, t) });
  if (has(C.wave, t)) return out('wave'); if (has(C.container, t)) return out('container', { level: .6 });
  if (has(C.flow, t)) return out('flow', { narrow: /narrow|resist|thin|bulb/.test(t), rate: /drift|slow|millimet/.test(t) ? .05 : /battery|pump/.test(t) ? .8 : .5, ...(/spill|leak|pours? out|gush/.test(t) && !/\bno\b[^.;]*pours? out/.test(t) ? { spill: true } : {}), ...(/\bstops?\b|\bhalts?\b|no (charge|current|flow)/.test(t) ? { stopped: true } : {}) });
  if (has(C.gauge, t)) return out('meter', { value: .65, rising: has(C.rising, t), label: String(text).trim().slice(0, 24) });
  if (has(C.crowd, t)) return out('agents', { agent: 'person', mode });
  if (has(C.particle, t)) return out('agents', { agent: 'dot', mode: 'random' });
  return out('glyph', { label: String(text || '').replace(/\s+/g, ' ').trim().slice(0, 60) });
}
// a "where the likeness breaks" sentence usually says what the source does and then what the target does instead
export function splitBreak(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  const m = s.match(/^(.{8,}?)(?:;\s+|\s+[—–]\s+|,?\s+(?:whereas|while|but|yet|instead)\s+|\.\s+(?:But|In|Yet|Instead|Real|Actual)\b)(.{8,})$/);
  if (!m) return null; let b = m[2]; if (/^(In|Real|Actual)\b/.test(s.slice(m.index + m[1].length).replace(/^[.;\s—–]+/, ''))) b = s.slice(m.index + m[1].length).replace(/^[.;\s—–]+/, '');
  return [m[1].replace(/[;,.\s]+$/, ''), b.replace(/^\s+/, '')];
}

// ---------------------------------------------------------------- the drawings (state + draw on a 200 × 120 stage)
const lerp = (a, b, t) => a + (b - a) * t, cl = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (c1, c2, t) => { const p = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); const a = p(c1), b = p(c2); return '#' + a.map((v, i) => Math.round(lerp(v, b[i], cl(t, 0, 1))).toString(16).padStart(2, '0')).join(''); };
function person(D, x, y, s, c, op = 1, run = 0) {   // a stick figure standing on (x, y), s = height
  const g = D.mk('g', { opacity: op, stroke: c, 'stroke-width': 1.6, 'stroke-linecap': 'round', fill: 'none' }); const h = s / 5, sw = Math.sin(run) * h * .9;
  D.mk('circle', { cx: x, cy: y - s + h * .7, r: h * .7, fill: c, stroke: 'none' }, g);
  D.mk('path', { d: `M${x} ${y - s + h * 1.4}L${x} ${y - h * 1.8}M${x} ${y - h * 1.8}L${x + sw} ${y}M${x} ${y - h * 1.8}L${x - sw} ${y}M${x} ${y - s + h * 2}L${x + h * 1.1} ${y - s + h * 2.6 - sw * .3}M${x} ${y - s + h * 2}L${x - h * 1.1} ${y - s + h * 2.6 + sw * .3}` }, g); return g;
}
const dot = (D, x, y, r, c, op = 1, label) => { D.mk('circle', { cx: x, cy: y, r, fill: c, opacity: op, stroke: '#fffaf0', 'stroke-width': .8 }); if (label && D.labels) D.txt(x, y + 3.4, label, { 'text-anchor': 'middle', 'font-size': 9.5, fill: '#fff', 'font-weight': 700, stroke: 'none' }); };
const KIND = {};
// agents moving: at random (molecules, a milling crowd) or all aiming one way (runners)
KIND.agents = { moving: () => true, create(P, R) {
  const n = P.n || (P.agent === 'person' ? 9 : 16), A = [...Array(n)].map((_, i) => ({ x: 14 + R() * 172, y: P.agent === 'person' ? 100 - R() * 10 : 18 + R() * 88, a: R() * 6.283, v: .4 + R() * .8, ph: R() * 6 }));
  return { step(dt, t) { const k = (P.heat ? lerp(.5, 1.5, (t % 8) / 8) : 1) * (20 + 40 * (P.speed ?? .5)); A.forEach(a => { if (P.mode === 'aim') { a.x += a.v * k * dt; a.ph += dt * 10 * a.v; if (a.x > 194) a.x = 6; } else { a.x += Math.cos(a.a) * a.v * k * dt; a.y += Math.sin(a.a) * a.v * k * dt * (P.agent === 'person' ? .3 : 1); a.ph += dt * 6; if (a.x < 8 || a.x > 192) { a.a = Math.PI - a.a; a.x = cl(a.x, 8, 192); } const y0 = P.agent === 'person' ? 88 : 14, y1 = P.agent === 'person' ? 108 : 110; if (a.y < y0 || a.y > y1) { a.a = -a.a; a.y = cl(a.y, y0, y1); } if (R() < dt * .6) a.a += (R() - .5) * 2; } }); },
    draw(D, t) { const k = P.heat ? (t % 8) / 8 : 0, c = P.heat ? mix(D.color, FC.rubric, k) : D.color; if (P.agent === 'person') D.mk('line', { x1: 4, x2: 196, y1: 110, y2: 110, stroke: FC.mute });
      A.forEach((a, i) => { const hi = P.focus === 'one' && i === 0, op = P.focus === 'one' && !hi ? .35 : 1, cc = hi ? FC.rubric : c; if (P.mode === 'aim' && P.focus === 'speed') D.mk('line', { x1: a.x - a.v * 16, x2: a.x - 3, y1: a.y - 10, y2: a.y - 10, stroke: cc, 'stroke-width': 1.2, opacity: .5 });
        if (P.agent === 'person') person(D, a.x, a.y, 22, cc, op, a.ph); else dot(D, a.x, a.y, 4, cc, op); });
      if (P.heat && D.labels) D.txt(8, 14, 'T rising ↑', { 'font-size': 10.5, fill: FC.rubric }); } };
} };
// a barrier with agents at it, seen from the side: only those with energy above the threshold get over (people at a
// fence run at it; molecules on an energy hump move both ways at random and roll over only with enough energy)
KIND.barrier = { moving: () => true, create(P, R) {
  const person_ = P.agent === 'person', aim = person_ ? P.mode !== 'random' : P.mode === 'aim', bx = 120, ground = 108, n = P.n || (person_ ? 8 : 14), hgt = 30 + 46 * (P.height ?? .55), top = ground - hgt, thr = .5 + .3 * (P.height ?? .55);
  let A, over, T0 = 0; const init = () => { over = 0; A = [...Array(n)].map((_, i) => ({ x: 10 + R() * 92, lane: person_ ? 0 : (i % 4) * 4, vx: aim || R() < .5 ? 1 : -1, e: Math.pow(R(), 1.5), st: 'in', j: 0, ph: R() * 6, wait: aim ? R() * 1.6 : 0 })); if (P.focus === 'one') { A[0].e = .97; A[0].x = 16; A[0].vx = 1; A[0].wait = .4; } };
  init(); const heatK = t => P.heat ? lerp(.62, 1.35, ((t - T0) % 9) / 9) : 1;
  return {
    step(dt, t) { if (t - T0 > 9) { T0 = t; init(); } const k = heatK(t);
      A.forEach(a => { if (a.wait > 0) { a.wait -= dt; return; } const sp = (person_ ? 24 : 22) + 66 * a.e * k; a.ph += dt * sp * .25;
        if (a.st === 'jump') { a.j += dt / .7; a.x = lerp(bx - 9, bx + 20, cl(a.j, 0, 1)); if (a.j >= 1) { a.st = 'out'; over++; } return; }
        if (a.st === 'out') { a.x += sp * .5 * dt; if (a.x > 196) a.st = 'gone'; return; }
        if (a.st === 'gone') return;
        a.x += a.vx * sp * dt; if (a.x < 8) { a.vx = 1; a.x = 8; }
        if (a.vx > 0 && a.x >= bx - 9) { if (a.e * k > thr) { a.st = 'jump'; a.j = 0; } else { a.vx = -1; a.x = bx - 9; if (!aim) a.e = Math.pow(R(), 1.5); } }
        else if (aim && a.vx < 0 && a.x < 20 + R() * 40) a.vx = 1;
        else if (!aim && R() < dt * .7) a.vx = -a.vx; }); },
    draw(D, t) { const k = heatK(t), hk = P.heat ? ((t - T0) % 9) / 9 : 0, c = P.heat ? mix(D.color, FC.rubric, hk * .8) : D.color;
      D.mk('line', { x1: 4, x2: 196, y1: ground + 1, y2: ground + 1, stroke: FC.mute, 'stroke-width': 1.2 });
      const bc = P.focus === 'barrier' ? FC.rubric : mix(FC.rubric, '#bfa58a', .35), bw = P.focus === 'barrier' ? 2 : 1.3;
      if (person_) { D.mk('rect', { x: bx - 3, y: top, width: 7, height: hgt, fill: 'rgba(156,58,40,.15)', stroke: bc, 'stroke-width': bw }); for (let y = top + 8; y < ground; y += 10) D.mk('line', { x1: bx - 3, x2: bx + 4, y1: y, y2: y, stroke: bc, 'stroke-width': .8 }); }
      else D.mk('path', { d: `M${bx - 22} ${ground}C${bx - 8} ${ground} ${bx - 10} ${top} ${bx} ${top}C${bx + 10} ${top} ${bx + 8} ${ground} ${bx + 22} ${ground}`, fill: 'rgba(156,58,40,.13)', stroke: bc, 'stroke-width': bw });
      if (P.focus === 'barrier') D.mk('line', { x1: bx + 26, x2: bx + 26, y1: ground - 1, y2: top + 1, stroke: FC.rubric, 'stroke-width': 1.2, 'marker-start': D.arrow(FC.rubric), 'marker-end': D.arrow(FC.rubric) });
      if (D.labels) { if (P.focus === 'barrier') D.txt(bx + 31, top + hgt * .55, P.label || (person_ ? 'fence' : 'Eₐ'), { 'font-size': 11, fill: FC.rubric, 'font-style': 'italic' }); else D.txt(bx, ground + 11, P.label || (person_ ? 'fence' : 'Eₐ'), { 'text-anchor': 'middle', 'font-size': 10.5, fill: FC.rubric, 'font-style': 'italic' }); }   /* under the barrier, clear of the agents going over it */
      A.forEach((a, i) => { if (a.st === 'gone') return; const hi = P.focus === 'one' && i === 0, op = P.focus === 'one' && !hi ? .3 : 1, good = a.st !== 'in', cc = hi ? FC.rubric : good ? FC.verd : c;
        const lift = a.st === 'jump' ? Math.sin(Math.PI * cl(a.j, 0, 1)) * (hgt + (person_ ? 6 : 2)) : 0, y = ground - (person_ ? 0 : 4 + a.lane) - lift;
        if (P.focus === 'speed' && a.st === 'in') { const L = 4 + 20 * a.e * k, yy = y - (person_ ? 12 : 0); D.mk('line', { x1: a.x - a.vx * L, y1: yy, x2: a.x - a.vx * 4, y2: yy, stroke: a.e * k > thr ? FC.verd : cc, 'stroke-width': 2, opacity: .55, 'stroke-linecap': 'round' }); }
        if (person_) person(D, a.x, y, 20, cc, op, a.st === 'jump' ? 1 : a.ph); else dot(D, a.x, y, 3.8, cc, op); });
      if (D.labels && (P.focus === 'count' || P.heat)) D.txt(196, 14, `over: ${over} of ${n}`, { 'text-anchor': 'end', 'font-size': 10.5, fill: FC.verd });
      if (P.heat) thermoMini(D, 10, 8, hk); } };
} };
function thermoMini(D, x, y, k) { D.mk('rect', { x, y, width: 6, height: 26, rx: 3, fill: '#fffaf0', stroke: FC.soft, 'stroke-width': .9 }); D.mk('rect', { x: x + 1.5, y: y + 24 - 20 * k, width: 3, height: 20 * k + 1, fill: FC.rubric }); D.mk('circle', { cx: x + 3, cy: y + 28, r: 4.2, fill: FC.rubric }); }
// two particles meet: most bounce apart, the energetic few react
KIND.collision = { moving: () => true, create(P, R) {
  const per = 2.4, Nc = Math.max(2, Math.min(6, Math.round(1 / (P.react || .25))));
  return { step() { }, draw(D, t) { const cyc = Math.floor(t / per), u = (t % per) / per, react = cyc % Nc === Nc - 1, e = react ? .9 : .25 + .35 * ((cyc * 7) % 5) / 5, y = 64 + (cyc % 3 - 1) * 4, person_ = P.agent === 'person';
    const meet = .42, x1 = u < meet ? lerp(18, 96, u / meet) : react ? 100 : lerp(96, 30, (u - meet) / (1 - meet)), x2 = u < meet ? lerp(182, 104, u / meet) : react ? 100 : lerp(104, 170, (u - meet) / (1 - meet));
    if (P.focus === 'speed' || D.labels) { const bw = 70, bxx = 64, by = 12; D.mk('rect', { x: bxx, y: by, width: bw, height: 7, rx: 2, fill: '#f1e9d8', stroke: FC.mute, 'stroke-width': .8 }); D.mk('rect', { x: bxx, y: by, width: bw * e, height: 7, rx: 2, fill: e > .6 ? FC.verd : FC.brass }); D.mk('line', { x1: bxx + bw * .6, x2: bxx + bw * .6, y1: by - 3, y2: by + 10, stroke: FC.rubric, 'stroke-width': 1.5 }); if (D.labels) { D.txt(bxx - 4, by + 7, 'energy', { 'text-anchor': 'end', 'font-size': 10, fill: FC.soft }); D.txt(bxx + bw * .6 + 3, by + 18, 'Eₐ', { 'font-size': 10, fill: FC.rubric }); } }
    if (u >= meet && u < meet + .12) { const r = 6 + 60 * (u - meet); D.mk('circle', { cx: 100, cy: y, r, fill: 'none', stroke: react ? FC.gold : FC.mute, 'stroke-width': 2, opacity: 1 - (u - meet) / .12 }); }
    if (u < meet && P.focus === 'speed') { const L = 8 + 20 * e; D.mk('line', { x1: x1 - L, x2: x1 - 6, y1: y, y2: y, stroke: D.color, 'stroke-width': 2, opacity: .5 }); D.mk('line', { x1: x2 + L, x2: x2 + 6, y1: y, y2: y, stroke: FC.brass, 'stroke-width': 2, opacity: .5 }); }
    if (react && u >= meet) { const x = lerp(100, 150, (u - meet) / (1 - meet)); dot(D, x - 4, y, 7, D.color, 1); dot(D, x + 5, y, 7, FC.brass, 1); if (D.labels) D.txt(x, y + 22, 'reacts', { 'text-anchor': 'middle', 'font-size': 10.5, fill: FC.verd, 'font-weight': 700 }); }
    else if (person_) { person(D, x1, y + 22, 24, D.color, 1, t * 8); person(D, x2, y + 22, 24, FC.brass, 1, t * 8 + 2); }
    else { dot(D, x1, y, 8, D.color, 1, 'A'); dot(D, x2, y, 8, FC.brass, 1, 'B'); if (D.labels && u > meet + .15) D.txt(100, y + 24, 'bounce apart', { 'text-anchor': 'middle', 'font-size': 10.5, fill: FC.soft }); } } };
} };
// a distribution of energies with the tail above the threshold shaded
KIND.tail = { moving: P => !!P.heat, create(P) {
  return { step() { }, draw(D, t) { const kT = P.heat ? lerp(.8, 1.5, (Math.sin(t * 1.1 - 1.57) + 1) / 2) : 1, cut = P.cut || .6, x0 = 14, x1 = 192, y0 = 104, H = 78, Emax = 7;
    const f = E => 2 * Math.sqrt(E / Math.PI) * Math.exp(-E / kT) / Math.pow(kT, 1.5), fmax = .5, X = E => x0 + (x1 - x0) * E / Emax, Y = v => y0 - H * cl(v / fmax, 0, 1.2);
    let d = '', sh = '', tot = 0, tail = 0; const Ec = cut * Emax; for (let i = 0; i <= 120; i++) { const E = Emax * i / 120, v = f(E); d += (i ? 'L' : 'M') + X(E).toFixed(1) + ' ' + Y(v).toFixed(1); tot += v; if (E >= Ec) { tail += v; sh += (sh ? 'L' : `M${X(E).toFixed(1)} ${y0}L`) + X(E).toFixed(1) + ' ' + Y(v).toFixed(1); } }
    D.mk('line', { x1: x0, x2: x1, y1: y0, y2: y0, stroke: FC.soft }); D.mk('line', { x1: x0, x2: x0, y1: y0, y2: y0 - H - 4, stroke: FC.soft });
    if (sh) D.mk('path', { d: sh + `L${X(Emax).toFixed(1)} ${y0}Z`, fill: 'rgba(156,58,40,.3)' }); D.mk('path', { d, fill: 'none', stroke: P.heat ? mix(D.color, FC.rubric, (kT - .8) / .7) : D.color, 'stroke-width': 2 });
    D.mk('line', { x1: X(Ec), x2: X(Ec), y1: y0, y2: y0 - H, stroke: FC.rubric, 'stroke-width': 1.4, 'stroke-dasharray': '3 2' });
    if (D.labels) { D.txt(X(Ec) + 3, y0 - H + 8, P.label || 'Eₐ', { 'font-size': 11, fill: FC.rubric }); D.txt(x1, 14, `above: ${Math.round(100 * tail / tot)} %`, { 'text-anchor': 'end', 'font-size': 10.5, fill: FC.rubric }); D.txt(x1, y0 + 12, 'energy →', { 'text-anchor': 'end', 'font-size': 10, fill: FC.soft }); if (P.heat) D.txt(x0 + 6, 14, kT > 1.15 ? 'warmer' : 'cooler', { 'font-size': 10.5, fill: kT > 1.15 ? FC.rubric : FC.lapis }); } } };
} };
// a dial (a rate, an amount), with ticks of events below at that rate
KIND.meter = { moving: () => true, create(P) { let acc = 0, ev = [];
  return { step(dt, t) { const v = P.rising ? lerp(.15, P.value ?? .75, cl((t % 6) / 4, 0, 1)) : P.value ?? .6; acc += dt * (.5 + 3.5 * v); if (acc >= 1) { acc = 0; ev.push(t); } ev = ev.filter(x => t - x < 2.4); },
    draw(D, t) { const v = P.rising ? lerp(.15, P.value ?? .75, cl((t % 6) / 4, 0, 1)) : P.value ?? .6, cx = 100, cy = 78, r = 50, a = Math.PI * (1 - v);
      D.mk('path', { d: `M${cx - r} ${cy}A${r} ${r} 0 0 1 ${cx + r} ${cy}`, fill: 'none', stroke: '#e8dcc2', 'stroke-width': 10 }); D.mk('path', { d: `M${cx - r} ${cy}A${r} ${r} 0 0 1 ${(cx + r * Math.cos(a)).toFixed(1)} ${(cy - r * Math.sin(a)).toFixed(1)}`, fill: 'none', stroke: D.color, 'stroke-width': 10 });
      for (let i = 0; i <= 10; i++) { const b = Math.PI * (1 - i / 10); D.mk('line', { x1: cx + (r - 9) * Math.cos(b), y1: cy - (r - 9) * Math.sin(b), x2: cx + (r - 14) * Math.cos(b), y2: cy - (r - 14) * Math.sin(b), stroke: FC.soft, 'stroke-width': .8 }); }
      D.mk('line', { x1: cx, y1: cy, x2: cx + (r - 6) * Math.cos(a), y2: cy - (r - 6) * Math.sin(a), stroke: FC.ink, 'stroke-width': 2.2, 'stroke-linecap': 'round' }); D.mk('circle', { cx, cy, r: 4, fill: FC.ink });
      ev.forEach(x => { const k = (t - x) / 2.4; D.mk('rect', { x: 186 - k * 172, y: 98, width: 3, height: 12, fill: D.color, opacity: 1 - k * .7 }); }); D.mk('line', { x1: 12, x2: 190, y1: 110.5, y2: 110.5, stroke: FC.mute });
      if (D.labels && P.label) D.txt(cx, cy + 16, P.label, { 'text-anchor': 'middle', 'font-size': 10.5, fill: FC.soft }); } }; } };
KIND.thermometer = { moving: P => P.from !== P.to, create(P) {
  return { step() { }, draw(D, t) { const a = P.from ?? .25, b = P.to ?? .8, u = cl((t % 6) / 3.6, 0, 1), v = lerp(a, b, u * u * (3 - 2 * u)), x = 90, top = 12, bot = 92, lvl = bot - (bot - top - 6) * v;
    D.mk('rect', { x: x - 7, y: top, width: 14, height: bot - top + 4, rx: 7, fill: '#fffaf0', stroke: FC.soft, 'stroke-width': 1.2 }); D.mk('rect', { x: x - 3.5, y: lvl, width: 7, height: bot - lvl + 6, fill: mix(FC.lapis, FC.rubric, v) }); D.mk('circle', { cx: x, cy: bot + 10, r: 11, fill: mix(FC.lapis, FC.rubric, v), stroke: FC.soft, 'stroke-width': 1.2 });
    for (let i = 0; i <= 6; i++) { const y = bot - (bot - top - 6) * i / 6; D.mk('line', { x1: x + 8, x2: x + (i % 3 ? 12 : 16), y1: y, y2: y, stroke: FC.soft, 'stroke-width': .8 }); }
    if (v > .55) for (let i = 0; i < 3; i++) { const ph = (t * .8 + i / 3) % 1; D.mk('path', { d: `M${132 + i * 16} ${100 - ph * 60}q5 -6 0 -12q-5 -6 0 -12`, fill: 'none', stroke: FC.rubric, 'stroke-width': 1.3, opacity: (v - .55) * 2.2 * (1 - ph) }); }
    if (D.labels) D.txt(x + 20, lvl + 4, (b >= a ? 'rising' : 'falling'), { 'font-size': 10.5, fill: FC.soft }); } };
} };
KIND.container = { moving: () => true, create(P) { const drops = [];
  return { step(dt, t) { if (Math.floor(t * 5) !== Math.floor((t - dt) * 5)) drops.push(t); while (drops.length && t - drops[0] > .8) drops.shift(); },
    draw(D, t) { const base = P.level ?? .6, v = cl(base + .12 * Math.sin(t * .8), .05, .95), x = 50, y = 22, w = 100, h = 82;
      D.mk('rect', { x, y: y + h * (1 - v), width: w, height: h * v, fill: 'rgba(45,91,142,.25)' }); D.mk('path', { d: `M${x} ${y}V${y + h}H${x + w}V${y}`, fill: 'none', stroke: FC.soft, 'stroke-width': 2 });
      D.mk('path', { d: `M${x + 18} 6h14v10`, fill: 'none', stroke: FC.soft, 'stroke-width': 3 }); drops.forEach(s => { const k = (t - s) / .8; D.mk('circle', { cx: x + 32, cy: 18 + k * (y + h * (1 - v) - 18), r: 2, fill: D.color }); });
      if (P.flowDir === 'both' || P.flowDir === 'out') D.mk('path', { d: `M${x + w} ${y + h - 6}h22`, fill: 'none', stroke: D.color, 'stroke-width': 3, 'marker-end': D.arrow(D.color) }); } }; } };
KIND.flow = { moving: () => true, create(P, R) { const D0 = [...Array(18)].map(() => ({ x: R() * 200, y: R(), fall: 0 }));
  return { step(dt) { const sp = 10 + 80 * (P.rate ?? .5); D0.forEach(d => { if (P.stopped) return; const nx = P.narrow && d.x > 80 && d.x < 120 ? 2 : 1;
      if (P.spill && d.x > 96 && d.x < 104 && !d.fall && R() < .5) d.fall = 1; if (d.fall) { d.fall += dt * 60; d.x += sp * .3 * dt; if (d.fall > 46) { d.fall = 0; d.x = 0; } return; }
      d.x += sp * nx * dt; if (d.x > 200) d.x -= 200; }); },
    draw(D) { const half = x => P.narrow && x > 76 && x < 124 ? 9 : 22, gap = P.spill || P.stopped;
      D.mk('path', { d: P.narrow ? 'M0 38H70C78 38 78 51 86 51H114C122 51 122 38 130 38H200M0 82H70C78 82 78 69 86 69H114C122 69 122 82 130 82H200' : gap ? 'M0 38H92M108 38H200M0 82H92M108 82H200M92 34V86M108 34V86' : 'M0 38H200M0 82H200', fill: 'none', stroke: FC.soft, 'stroke-width': 2 });
      D0.forEach(d => { if (P.stopped && d.x > 92 && d.x < 108) return; dot(D, d.x, 60 + (d.y - .5) * 2 * (half(d.x) - 4) + (d.fall || 0), 3.2, D.color, d.fall ? .6 : .9); });
      if (P.stopped) { D.mk('path', { d: 'M96 52l8 16M104 52l-8 16', stroke: FC.rubric, 'stroke-width': 2 }); if (D.labels) D.txt(100, 104, 'cut: nothing moves', { 'text-anchor': 'middle', 'font-size': 10.5, fill: FC.rubric }); }
      else if (P.spill) { if (D.labels) D.txt(100, 116, 'spills out', { 'text-anchor': 'middle', 'font-size': 10.5, fill: FC.rubric }); }
      else D.mk('line', { x1: 150, x2: 186, y1: 100, y2: 100, stroke: D.color, 'stroke-width': 1.5, 'marker-end': D.arrow(D.color) });
      if (D.labels && (P.rate ?? .5) < .1) D.txt(100, 104, 'drifts: mm per second', { 'text-anchor': 'middle', 'font-size': 10.5, fill: FC.soft }); } }; } };
KIND.spring = { moving: () => true, create(P) { return { step() { }, draw(D, t) { const A = 14 + 22 * (P.amp ?? .6), x = 120 + A * Math.sin(t * 2.6), n = 10;
  D.mk('path', { d: 'M14 30V96', stroke: FC.soft, 'stroke-width': 3 }); let d = 'M14 63'; for (let i = 1; i <= n; i++) d += `L${(14 + (x - 30) * i / (n + 1)).toFixed(1)} ${i % 2 ? 53 : 73}`; d += `L${x - 16} 63`; D.mk('path', { d, fill: 'none', stroke: D.color, 'stroke-width': 1.6 });
  D.mk('rect', { x: x - 16, y: 47, width: 32, height: 32, rx: 4, fill: '#f4ead2', stroke: FC.brass, 'stroke-width': 1.5 }); D.mk('line', { x1: 8, x2: 196, y1: 80, y2: 80, stroke: FC.mute }); D.mk('line', { x1: 120, x2: 120, y1: 86, y2: 98, stroke: FC.mute, 'stroke-dasharray': '2 2' }); } }; } };
KIND.pendulum = { moving: () => true, create(P) { return { step() { }, draw(D, t) { const a = (.25 + .35 * (P.amp ?? .6)) * Math.sin(t * 2.2), L = 82, x = 100 + L * Math.sin(a), y = 12 + L * Math.cos(a);
  D.mk('line', { x1: 70, x2: 130, y1: 12, y2: 12, stroke: FC.soft, 'stroke-width': 3 }); D.mk('line', { x1: 100, y1: 12, x2: x, y2: y, stroke: FC.soft, 'stroke-width': 1.4 }); D.mk('path', { d: `M${100 - L * .45} ${12 + L * .9}A${L} ${L} 0 0 0 ${100 + L * .45} ${12 + L * .9}`, fill: 'none', stroke: FC.mute, 'stroke-dasharray': '2 3' }); D.mk('circle', { cx: x, cy: y, r: 9, fill: D.color }); } }; } };
KIND.wave = { moving: () => true, create(P) { return { step() { }, draw(D, t) { const A = 12 + 22 * (P.amp ?? .6), k = .05 + .07 * (P.rate ?? .4); let d = ''; for (let x = 6; x <= 194; x += 3) d += (x === 6 ? 'M' : 'L') + x + ' ' + (60 - A * Math.sin(k * x - t * 3)).toFixed(1);
  D.mk('line', { x1: 6, x2: 194, y1: 60, y2: 60, stroke: FC.mute, 'stroke-dasharray': '3 3' }); D.mk('path', { d, fill: 'none', stroke: D.color, 'stroke-width': 2 }); const yy = 60 - A * Math.sin(k * 100 - t * 3); D.mk('circle', { cx: 100, cy: yy, r: 4.5, fill: FC.rubric }); } }; } };
// sound pulsing in rhythm (a chirp, a call): arcs leave a source; the beats are marked on a strip, faster when rising
KIND.sound = { moving: () => true, create(P) { let acc = 0; const beats = [];
  const per = t => { const r = P.rising ? lerp(.25, .9, ((t % 8) / 8)) : (P.rate ?? .45); return lerp(1.3, .32, r); };
  return { step(dt, t) { acc += dt; if (acc >= per(t)) { acc = 0; beats.push(t); } while (beats.length && t - beats[0] > 3) beats.shift(); },
    draw(D, t) { const sx = 34, sy = 52; D.mk('path', { d: `M${sx - 16} ${sy - 9}h9l11 -10v38l-11 -10h-9z`, fill: '#f4ead2', stroke: FC.soft, 'stroke-width': 1.3 });
      beats.forEach(b => { const k = (t - b) / 1.6; if (k > 1) return; for (let j = 0; j < 2; j++) { const r = 14 + k * 110 + j * 7; D.mk('path', { d: `M${sx + r * Math.cos(-.7)} ${sy + r * Math.sin(-.7)}A${r} ${r} 0 0 1 ${sx + r * Math.cos(.7)} ${sy + r * Math.sin(.7)}`, fill: 'none', stroke: D.color, 'stroke-width': 2 - j * .7, opacity: (1 - k) * (1 - j * .4) }); } });
      D.mk('line', { x1: 10, x2: 192, y1: 106, y2: 106, stroke: FC.mute }); beats.forEach(b => { const k = (t - b) / 3; D.mk('rect', { x: 190 - k * 178, y: 96, width: 3, height: 10, fill: D.color, opacity: 1 - k * .6 }); });
      if (D.labels) D.txt(192, 92, P.rising ? 'faster ▸' : 'rhythm', { 'text-anchor': 'end', 'font-size': 10.5, fill: FC.soft }); } }; } };
KIND.cell = { moving: () => true, create(P, R) { const M = [...Array(9)].map(() => ({ a: R() * 6.28, r: 1.25 + R() * .3, s: .2 + R() * .3 }));
  return { step(dt) { M.forEach(m => { m.r -= m.s * dt * .3; if (m.r < .45) { m.r = 1.35; m.a = R() * 6.28; } }); },
    draw(D) { const cx = 100, cy = 60, rx = 62, ry = 40; D.mk('ellipse', { cx, cy, rx: rx + 3, ry: ry + 3, fill: 'none', stroke: D.color, 'stroke-width': 1.3 }); D.mk('ellipse', { cx, cy, rx, ry, fill: 'rgba(63,125,110,.1)', stroke: D.color, 'stroke-width': 1.3 });
      D.mk('circle', { cx: cx - 14, cy: cy - 4, r: 14, fill: 'rgba(106,74,138,.18)', stroke: FC.violet }); D.mk('ellipse', { cx: cx + 26, cy: cy + 12, rx: 10, ry: 5, fill: 'rgba(207,168,79,.3)', stroke: FC.brass });
      M.forEach(m => dot(D, cx + rx * m.r * Math.cos(m.a), cy + ry * m.r * Math.sin(m.a), 2.6, FC.rubric, .9)); } }; } };
KIND.stall = { moving: () => true, create(P, R) { const B = [...Array(5)].map((_, i) => ({ x: -20 - i * 40, ph: R() * 6 }));
  return { step(dt, t) { const many = P.trend === 'down' ? 1.4 : P.trend === 'up' ? .55 : 1; B.forEach(b => { b.x += 22 * many * dt; b.ph += dt * 8; if (b.x > 90) b.x = -40 - R() * 60 * (2 - many); }); },
    draw(D, t) { const u = (t % 6) / 6, p0 = 2.4, p = P.trend === 'up' ? p0 + 1.2 * u : P.trend === 'down' ? p0 + .9 - .9 * u : p0;
      for (let i = 0; i < 6; i++) D.mk('rect', { x: 100 + i * 15, y: 18, width: 15, height: 12, fill: i % 2 ? '#fffaf0' : 'rgba(156,58,40,.6)' }); D.mk('rect', { x: 100, y: 30, width: 90, height: 6, fill: FC.brass });
      D.mk('line', { x1: 104, x2: 104, y1: 36, y2: 108, stroke: FC.soft, 'stroke-width': 2 }); D.mk('line', { x1: 186, x2: 186, y1: 36, y2: 108, stroke: FC.soft, 'stroke-width': 2 }); D.mk('rect', { x: 100, y: 74, width: 90, height: 14, fill: '#f4ead2', stroke: FC.soft });
      [120, 140, 160].forEach(x => D.mk('circle', { cx: x, cy: 68, r: 6, fill: FC.rubric, opacity: .8 }));
      D.mk('rect', { x: 126, y: 44, width: 40, height: 16, rx: 3, fill: '#fffaf0', stroke: FC.ink }); D.txt(146, 56, '€' + p.toFixed(2), { 'text-anchor': 'middle', 'font-size': 11, fill: P.trend === 'up' ? FC.rubric : P.trend === 'down' ? FC.verd : FC.ink, 'font-weight': 700 });
      D.mk('line', { x1: 4, x2: 196, y1: 108.5, y2: 108.5, stroke: FC.mute }); B.forEach(b => { if (b.x > -10 && b.x < 96) person(D, b.x, 108, 22, D.color, 1, b.ph); }); } }; } };
const gearPath = (r, n) => { let d = ''; for (let i = 0; i < n * 2; i++) { const a0 = i * Math.PI / n, a1 = (i + 1) * Math.PI / n, rr = i % 2 ? r - 5 : r; d += (i ? 'L' : 'M') + (rr * Math.cos(a0)).toFixed(1) + ' ' + (rr * Math.sin(a0)).toFixed(1) + 'L' + (rr * Math.cos(a1)).toFixed(1) + ' ' + (rr * Math.sin(a1)).toFixed(1); } return d + 'Z'; };
KIND.gear = { moving: () => true, create(P) { return { step() { }, draw(D, t) { const s = 40 + 60 * (P.speed ?? .5), a = t * s;
  const g1 = D.mk('g', { transform: `translate(76 60) rotate(${a.toFixed(1)})` }); D.mk('path', { d: gearPath(34, 12), fill: '#f4ead2', stroke: FC.brass, 'stroke-width': 1.5 }, g1); D.mk('circle', { r: 6, fill: FC.brass }, g1); D.mk('line', { x1: 0, y1: 0, x2: 22, y2: 0, stroke: FC.brass, 'stroke-width': 2 }, g1);
  const g2 = D.mk('g', { transform: `translate(${76 + 34 + 21} 60) rotate(${(-a * 34 / 22 + 8).toFixed(1)})` }); D.mk('path', { d: gearPath(22, 8), fill: '#e4ebf3', stroke: D.color, 'stroke-width': 1.5 }, g2); D.mk('circle', { r: 4, fill: D.color }, g2); D.mk('line', { x1: 0, y1: 0, x2: 14, y2: 0, stroke: D.color, 'stroke-width': 2 }, g2); } }; } };
// an organism that warms (or cools): its colour follows its temperature, heat shimmers off it
KIND.body = { moving: P => !!P.heat, create(P) { return { step() { }, draw(D, t) { const k = P.heat ? (Math.sin(t * .9 - 1.57) + 1) / 2 : .5, c = mix(FC.lapis, FC.rubric, k), cr = P.creature || 'animal';
  if (cr === 'person') person(D, 100, 108, 80, c, 1, 0);
  else if (cr === 'cricket') { const g = D.mk('g', { stroke: c, 'stroke-width': 1.6, fill: 'none', 'stroke-linecap': 'round' }); D.mk('ellipse', { cx: 96, cy: 70, rx: 34, ry: 12, fill: mix('#fffaf0', c, .35) }, g); D.mk('circle', { cx: 136, cy: 66, r: 9, fill: mix('#fffaf0', c, .35) }, g);
    D.mk('path', { d: 'M142 60C160 40 176 34 192 30M143 62C162 48 178 46 194 46M84 78L66 98M100 80L96 100M112 78L120 98M70 64L48 40L36 96' }, g); D.mk('path', { d: 'M70 62C90 54 112 56 126 62', 'stroke-width': 1 }, g); }
  else { const g = D.mk('g', { stroke: c, 'stroke-width': 1.6, fill: mix('#fffaf0', c, .3) }); D.mk('ellipse', { cx: 96, cy: 70, rx: 38, ry: 20 }, g); D.mk('circle', { cx: 140, cy: 56, r: 12 }, g); D.mk('path', { d: 'M74 86v18M92 88v18M106 88v18M120 84v18M58 66l-16 -8', fill: 'none' }, g); }
  if (P.heat) { for (let i = 0; i < 3; i++) { const ph = (t * .7 + i / 3) % 1; D.mk('path', { d: `M${72 + i * 22} ${50 - ph * 34}q4 -5 0 -10q-4 -5 0 -10`, fill: 'none', stroke: FC.rubric, 'stroke-width': 1.2, opacity: k * (1 - ph) }); } thermoMini(D, 10, 10, k); } } }; } };
KIND.exchange = { moving: () => true, create(P, R) { const C0 = [...Array(8)].map((_, i) => ({ u: i / 8, dir: i % 2 ? 1 : -1 }));
  return { step(dt) { C0.forEach(c => { c.u += dt * .22; if (c.u > 1) c.u -= 1; }); },
    draw(D) { D.mk('rect', { x: 4, y: 40, width: 42, height: 60, rx: 4, fill: 'rgba(45,91,142,.15)', stroke: D.color }); D.mk('rect', { x: 154, y: 40, width: 42, height: 60, rx: 4, fill: 'rgba(207,168,79,.22)', stroke: FC.brass });
      D.mk('path', { d: 'M46 62H154M46 80H154', stroke: FC.soft, 'stroke-width': 1.5 }); D.mk('path', { d: 'M46 62Q100 44 154 62', fill: 'none', stroke: FC.mute });
      C0.forEach(c => { const x = c.dir > 0 ? lerp(46, 154, c.u) : lerp(154, 46, c.u); D.mk('rect', { x: x - 5, y: c.dir > 0 ? 64 : 72, width: 10, height: 6, rx: 2, fill: c.dir > 0 ? D.color : FC.brass }); });
      if (D.labels) { D.txt(25, 34, '→ 4/min', { 'text-anchor': 'middle', 'font-size': 10, fill: D.color }); D.txt(175, 34, '4/min ←', { 'text-anchor': 'middle', 'font-size': 10, fill: FC.brass }); } } }; } };
KIND.balance = { moving: () => true, create(P) { return { step() { }, draw(D, t) { const a = (P.tilt ?? .4) * .25 * (1 - .15 * Math.cos(t * 1.4)), cx = 100, cy = 78, L = 80;
  D.mk('path', { d: `M${cx - 12} 104L${cx} ${cy}L${cx + 12} 104Z`, fill: '#f4ead2', stroke: FC.soft }); const g = D.mk('g', { transform: `rotate(${(a * 57.3).toFixed(1)} ${cx} ${cy})` }); D.mk('rect', { x: cx - L, y: cy - 4, width: 2 * L, height: 5, fill: FC.brass }, g);
  D.mk('rect', { x: cx - L + 4, y: cy - 22, width: 18, height: 18, fill: D.color }, g); D.mk('rect', { x: cx + L - 30, y: cy - 30, width: 26, height: 26, fill: FC.rubric }, g); D.mk('line', { x1: 8, x2: 192, y1: 104.5, y2: 104.5, stroke: FC.mute }); } }; } };
// the fallback: a still picture of the thing named, with its words
KIND.glyph = { moving: () => false, create(P) { return { step() { }, draw(D) { const lab = P.label || ''; const g = P.icon && glyphFor('', P.icon) ? P.icon : glyphFor(lab);
  D.mk('rect', { x: 6, y: 6, width: 188, height: 108, rx: 10, fill: '#fffaf0', stroke: D.color, 'stroke-width': 1.2, 'stroke-dasharray': '4 3' });
  if (g) drawGlyph(D.g, g, 100, D.labels ? 46 : 60, D.labels ? 50 : 64, D.color, { animate: !D.calm });
  else { const ic = iconFor(lab, 'book'), s = (D.labels ? 50 : 64) / 24, gg = D.mk('g', { transform: `translate(${100 - 12 * s} ${(D.labels ? 46 : 60) - 12 * s}) scale(${s})` }); D.mk('path', { d: iconPath(ic), fill: 'none', stroke: D.color, 'stroke-width': 1.6 / s * 1.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, gg); }
  if (D.labels && lab) { const words = lab.split(/\s+/), L = []; let cur = ''; words.forEach(w => { if ((cur + ' ' + w).trim().length > 28 && cur) { L.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }); if (cur) L.push(cur); L.slice(0, 2).forEach((l, i) => D.txt(100, 90 + i * 13, l + (i === 1 && L.length > 2 ? ' …' : ''), { 'text-anchor': 'middle', 'font-size': 11, fill: FC.ink })); } } }; } };

// ---------------------------------------------------------------- mounting one depiction
let uidN = 0;
export function mountDepict(host, spec, opts = {}) {
  const S = normDepict(spec) || pickDepict(opts.title || '', {}), K = KIND[S.kind] || KIND.glyph, P = S.params || {};
  const svg = host instanceof (typeof SVGSVGElement !== 'undefined' ? SVGSVGElement : function () { }) ? host : document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${DW} ${DH}`); svg.setAttribute('class', ((svg.getAttribute('class') || '') + ' dp-svg dp-' + S.kind).trim()); svg.setAttribute('role', 'img'); if (opts.title) svg.setAttribute('aria-label', opts.title);
  if (svg !== host) host.append(svg);
  const defs = document.createElementNS(NS, 'defs'); svg.append(defs); const layer = document.createElementNS(NS, 'g'); svg.append(layer); const mid = 'dpa' + (++uidN) + Math.random().toString(36).slice(2, 6); const arrows = new Map();
  const D = { g: layer, color: opts.color || FC.lapis, labels: opts.labels !== false, calm: opts.calm != null ? opts.calm : calmPref(),
    mk(n, a = {}, parent = layer) { const e = document.createElementNS(NS, n); for (const k in a) if (a[k] != null && a[k] !== false) e.setAttribute(k, a[k]); parent.append(e); return e; },
    txt(x, y, s, a = {}) { const e = D.mk('text', { x, y, 'font-family': 'Alegreya, Georgia, serif', 'font-size': 11, fill: FC.ink, stroke: '#fbf6ea', 'stroke-width': 3, 'paint-order': 'stroke', ...a }); e.textContent = s; return e; },
    arrow(c) { if (arrows.has(c)) return `url(#${arrows.get(c)})`; const id = mid + arrows.size; const m = document.createElementNS(NS, 'marker'); [['id', id], ['viewBox', '0 0 10 10'], ['refX', '8'], ['refY', '5'], ['markerWidth', '6'], ['markerHeight', '6'], ['orient', 'auto-start-reverse'], ['markerUnits', 'userSpaceOnUse']].forEach(([k, v]) => m.setAttribute(k, v)); m.innerHTML = `<path d="M0 0L10 5L0 10z" fill="${c}"/>`; defs.append(m); arrows.set(c, id); return `url(#${id})`; } };
  let seed = 7; String(opts.seed || opts.title || S.kind).split('').forEach(ch => { seed = (seed * 31 + ch.charCodeAt(0)) >>> 0; });
  const st = K.create(P, rng(seed)); let t = 0;
  const frame = () => { layer.textContent = ''; st.draw(D, t); };
  const moving = K.moving(P) && !D.calm;
  if (!moving) { const poster = opts.poster != null ? opts.poster : 4.2; for (let i = 0; i < poster * 30; i++) { t += 1 / 30; st.step(1 / 30, t); } frame(); return () => { }; }
  let raf = 0, alive = true, visible = true, last = 0, gone = 0;
  const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(es => { visible = es.some(e => e.isIntersecting); if (visible && !raf && alive) raf = requestAnimationFrame(loop); }) : null; if (io) io.observe(svg);
  const loop = now => { raf = 0; if (!alive) return; if (!svg.isConnected) { gone = gone || now; if (now - gone > 3000) { stop(); return; } } else gone = 0; const dt = last ? Math.min(.05, (now - last) / 1000) : 1 / 60; last = now; if (visible) { t += dt; st.step(dt, t); frame(); raf = requestAnimationFrame(loop); } else last = 0; };
  const stop = () => { alive = false; cancelAnimationFrame(raf); raf = 0; if (io) io.disconnect(); };
  t = .6; st.step(.6, .6); frame(); raf = requestAnimationFrame(loop);
  return stop;
}
