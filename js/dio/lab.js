// The laboratory of a diorama: two ways to run experiments on the model, and one notebook for both.
//
//   Guided discovery  the guide proposes one experiment at a time, chosen because it is informative, and says why; the
//                     learner predicts, accepts it or skips it. The sliders show the settings but are the guide's.
//   Open laboratory   the learner sets any permitted parameter and records runs; the guide's next choice and its reason
//                     stay visible in one line, so the learner always sees what it would do and why.
//
// Why both, and why the guide picks with a little chance (docs/research/revelation-techniques.md, "The laboratory"):
// in Kölmel et al. (2026, Computers in Human Behavior Reports 22, 101050; N = 64), system-randomised parameters gave the
// deepest exploration and the longest time per data point, user control gave the broadest exploration but the highest
// mental demand and frustration, and understanding did not differ. Discovery helps only when guided (Alfieri et al.
// 2011); the guide's first rule is the control of variables: change one thing against a reference run (Chen & Klahr
// 1999). Which experiment is "informative" follows active learning (Gureckis & Markant 2012): the one whose outcome the
// learner's runs so far cannot yet tell, scored here, transparently, by four visible terms (untested variable, the
// common mistake's variable, distance from every run so far, a second level of a variable that did something).
import { el, fmt, mathHTML } from '../util.js';
import { DIO } from './models.js';

const NUM = /[-−]?\d+(?:[.,]\d+)?(?:e[-+]?\d+)?/i;
const num = v => { if (typeof v === 'number') return isFinite(v) ? v : null; const m = NUM.exec(String(v ?? '')); return m ? +m[0].replace('−', '-').replace(',', '.') : null; };
const LS = 'scriptorium.lab:';
const load = k => { try { return JSON.parse(localStorage.getItem(LS + k) || 'null'); } catch (e) { return null; } };
const save = (k, v) => { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) { } };
const isToggle = r => r && r[0] === 0 && r[1] === 1 && /·|\bon\b|\boff\b|switch|sweep|auto/i.test(String(r[4] || ''));

export class Lab {
  constructor(v) {
    this.v = v; this.key = String(v.spec.title || v.spec.type || 'dio'); const S = load(this.key) || {};
    this.mode = v.prefs.labMode === 'open' ? 'open' : 'guided'; this.runs = Array.isArray(S.runs) ? S.runs.slice(-40) : []; this.skipped = new Set(); this.cur = null; this.offer = null; this.pred = null; this.n = S.n || this.runs.length;
    this.base = Object.fromEntries(this.keys().map(k => [k, v.ds.p[k]]));   // the reference settings: the model as opened
  }
  persist() { save(this.key, { runs: this.runs.slice(-40), n: this.n }); }
  keys() { const R = this.v.ds.ranges; return Object.keys(R).filter(k => !(this.v.spec.hidden || []).includes(k) && !isToggle(R[k]) && R[k][1] > R[k][0]); }
  pname(k) { const r = this.v.ds.ranges[k]; return (r && r[4]) || k; }
  pval(k, x) { const r = this.v.ds.ranges[k]; return fmt(x) + (r && r[3] ? ' ' + r[3] : ''); }
  reads() { return this.v.ds.readouts().map(([k, x]) => [String(k), num(x)]).filter(([, x]) => x != null); }
  // ---------- choosing the next experiment ----------
  dist(a, b) { const K = this.keys(); if (!K.length) return 0; let s = 0; K.forEach(k => { const r = this.v.ds.ranges[k], d = ((a[k] ?? this.base[k]) - (b[k] ?? this.base[k])) / (r[1] - r[0]); s += d * d; }); return Math.sqrt(s / K.length); }
  varied(k) { return this.runs.filter(r => r.set && Math.abs((r.set[k] ?? this.base[k]) - this.base[k]) > 1e-9 && Object.keys(r.diff || {}).length === 1); }
  baseRun() { return this.runs.find(r => r.kind === 'baseline' && this.dist(r.set, this.base) < 1e-6); }
  // a run's number for a readout: its value when it settles (a period, a pressure), else the size of its swing (an angle
  // that oscillates has a mean near zero that says nothing)
  rel(a, b) { return Math.abs(b - a) / Math.max(Math.abs(a), Math.abs(b), 1e-9); }
  watchFor(k) {   // the readout this experiment should be judged by: a settled one first, the one this variable moved most
    const B = this.baseRun(); if (!B) return null; const names = Object.keys(B.out), runs = k ? this.varied(k) : [];
    const steady = names.filter(n => B.steady[n]), pool = steady.length ? steady : names;
    if (runs.length && runs[0].watch && pool.includes(runs[0].watch) && B.out[runs[0].watch] != null && runs[0].out[runs[0].watch] != null && this.rel(B.out[runs[0].watch], runs[0].out[runs[0].watch]) > .03) return runs[0].watch;   /* a variable keeps the readout it was first judged by */
    if (runs.length) { let best = null, bd = -1; for (const n of pool) { const d = Math.max(...runs.map(r => r.out[n] != null && B.out[n] != null ? this.rel(B.out[n], r.out[n]) : 0)); if (d > bd) { bd = d; best = n; } } if (best && bd > .005) return best; }
    const W = this.v.spec.watch || (DIO[this.v.spec.type] || {}).watch; if (W && names.includes(W)) return W; return pool[0] || null; }
  rname(n, r) { return r && r.steady && r.steady[n] === false ? 'the swing of ' + n : n; }
  candidates() {
    const v = this.v, K = this.keys(), out = [], prev = this.runs.map(r => r.set), mis = String(v.opts.misconception || '').toLowerCase();
    if (!this.baseRun()) return [{ kind: 'baseline', set: {}, title: 'A reference run', why: ['Every comparison needs a reference: record the model as it stands, so later runs have something to differ from.'], score: 9 }];
    const novelty = set => prev.length ? Math.min(...prev.map(p => this.dist({ ...this.base, ...set }, p))) : 1;
    const authored = (v.spec.experiments || (DIO[v.spec.type] || {}).experiments || []).filter(x => x && x.set && typeof x.set === 'object');
    authored.forEach((x, i) => { const set = Object.fromEntries(Object.entries(x.set).filter(([k]) => k in v.ds.ranges).map(([k, y]) => [k, +y])); if (!Object.keys(set).length) return; const nv = novelty(set); if (nv < .02) return; out.push({ kind: 'authored', id: 'a' + i, set, watch: x.watch, title: x.title || Object.keys(set).map(k => this.pname(k) + ' = ' + this.pval(k, set[k])).join(', '), why: [String(x.why || 'Written with this diorama as a telling run.')], score: 1.6 + nv }); });
    K.forEach(k => {
      const r = v.ds.ranges[k], tried = this.varied(k), name = this.pname(k), inMis = mis && (mis.includes(String(name).toLowerCase()) || new RegExp('\\b' + k.toLowerCase() + '\\b').test(mis));
      for (const f of [.08, .25, .75, .92]) {
        const x = +(r[0] + (r[1] - r[0]) * f).toPrecision(3); if (Math.abs(x - this.base[k]) < (r[1] - r[0]) * .1) continue;
        const set = { [k]: x }, nv = novelty(set); if (nv < .03) continue; const why = []; let s = nv;
        if (!tried.length) { s += 1; why.push(`You have not changed ${name} yet. Changing it alone, everything else as in the reference run, shows its effect and nothing else's.`); }
        else if (tried.length === 1) { const W = this.watchFor(k), B = this.baseRun(), r1 = tried[0]; const d = W && B && B.out[W] != null && r1.out[W] != null ? this.rel(B.out[W], r1.out[W]) : 0; if (d > .03) { s += .5; why.push(`${name} changed ${W} by ${Math.round(d * 100)} % last time. A second value shows the shape of the effect: in proportion, faster, or slower.`); } else { s -= .3; why.push(`A second value of ${name}, to confirm that it really leaves the readouts alone.`); } }
        else s -= .2 * tried.length;
        if (inMis && tried.length < 2) { s += .8; why.push(`The common mistake here is about ${name}. If the readouts stay put, your own run refutes it.`); }
        if (f === .08 || f === .92) { s += .1; why.push(`Near the ${f > .5 ? 'top' : 'bottom'} of its range, an effect is largest and easiest to see.`); }
        why.push(`It lies ${Math.round(nv * 100)} % of the way across the settings from your nearest run.`);
        out.push({ kind: 'ofat', set, title: `${name} = ${this.pval(k, x)}`, why, score: s, k });
      }
    });
    // once every variable has been tried, the widest gap in what has been tried: two variables at once
    if (K.length >= 2 && K.every(k => this.varied(k).length)) { let best = null; for (let j = 0; j < 40; j++) { const a = K[Math.floor(Math.random() * K.length)], b = K.filter(x => x !== a)[Math.floor(Math.random() * (K.length - 1))], set = {}; [a, b].forEach(k => { const r = v.ds.ranges[k]; set[k] = +(r[0] + (r[1] - r[0]) * (.1 + .8 * Math.random())).toPrecision(3); }); const nv = novelty(set); if (!best || nv > best.nv) best = { set, nv }; }
      if (best) out.push({ kind: 'gap', set: best.set, title: Object.keys(best.set).map(k => `${this.pname(k)} = ${this.pval(k, best.set[k])}`).join(', '), why: ['Two variables at once, where no run has been: it fills the widest gap in what you have tried and shows whether their effects simply add.'], score: .6 + best.nv }); }
    return out.filter(c => !this.skipped.has(this.ckey(c))).sort((a, b) => b.score - a.score);
  }
  ckey(c) { return JSON.stringify(c.set); }
  // the next offer: one of the three most informative, drawn with chances in proportion to their score (system-randomised
  // within what is worth doing); the others stay listed so the choice is visible
  propose(force) {
    if (this.offer && !force) return this.offer; const C = this.candidates(); if (!C.length) { this.offer = null; return null; }
    const top = C.slice(0, 3), w = top.map(c => Math.max(.05, c.score) ** 2), tot = w.reduce((a, b) => a + b, 0); let r = Math.random() * tot, i = 0; while (i < top.length - 1 && (r -= w[i]) > 0) i++;
    const pick = top[i]; pick.watch = pick.watch || this.watchFor(pick.k); pick.alts = C.filter(c => c !== pick).slice(0, 2); pick.drawn = top.length > 1; this.offer = pick; this.pred = null; return pick;
  }
  skip() { if (this.offer) this.skipped.add(this.ckey(this.offer)); this.offer = null; this.propose(); this.v.renderParams(); }
  // ---------- running ----------
  run(exp, src = 'guide') {
    const v = this.v; if (this.cur || v.running != null) return;
    const set = { ...this.base, ...(exp ? exp.set : {}) }; if (src === 'mine') Object.assign(set, Object.fromEntries(this.keys().map(k => [k, v.ds.p[k]])));
    for (const k in set) if (k in v.ds.p) v.ds.p[k] = Math.min(v.ds.ranges[k][1], Math.max(v.ds.ranges[k][0], set[k]));
    v.rebuild(); v.refreshPins(); v.ds.playing = true; v.syncTimeUI(); if (v.dir) { v.dir.clear(); v.dir.clearCaption && v.dir.clearCaption(); }
    const diff = Object.fromEntries(Object.entries(set).filter(([k, x]) => Math.abs(x - this.base[k]) > 1e-9));
    this.cur = { kind: exp ? exp.kind : 'mine', title: exp ? exp.title : Object.keys(diff).map(k => `${this.pname(k)} = ${this.pval(k, set[k])}`).join(', ') || 'The reference settings', why: exp ? exp.why : [], set, diff, watch: (exp && exp.watch) || this.watchFor(Object.keys(diff)[0]), pred: this.pred, src, dur: +(v.spec.labRun || (v.spec.experiments && v.spec.experiments.dur)) || 8, t0: v.ds.t, last: -1, S: {} };
    this.offer = null; v.renderParams();
  }
  tick() {   // called every frame by the engine, after the model has stepped
    const c = this.cur; if (!c) return; const v = this.v, t = v.ds.t - c.t0;
    if (t - c.last >= .1) { c.last = t; for (const [n, x] of this.reads()) (c.S[n] || (c.S[n] = [])).push(x); }
    const bar = v.paramBox && v.paramBox.querySelector('.lab-bar i'); if (bar) bar.style.width = Math.min(100, t / c.dur * 100) + '%';
    if (t >= c.dur) this.finish();
  }
  finish() {
    const c = this.cur; if (!c) return; this.cur = null; const out = {}, steady = {}, span = {};
    for (const [n, L] of Object.entries(c.S)) { if (!L.length) continue; const tail = L.slice(Math.floor(L.length / 2)), lo = Math.min(...tail), hi = Math.max(...tail), mean = tail.reduce((a, b) => a + b, 0) / tail.length; steady[n] = hi - lo <= .03 * Math.max(Math.abs(mean), 1e-9); out[n] = steady[n] ? L[L.length - 1] : (hi - lo) / 2; span[n] = [lo, hi]; }
    const row = { n: ++this.n, kind: c.kind, title: c.title, why: c.why, set: c.set, diff: c.diff, watch: c.watch, pred: c.pred, src: c.src, out, steady, span, dur: c.dur };
    if (c.kind === 'baseline' || (!Object.keys(c.diff).length)) row.kind = 'baseline';
    row.finding = this.finding(row); this.runs.push(row); this.persist(); this.propose(true); this.v.renderParams();
    const nb = this.v.paramBox && this.v.paramBox.querySelector('.lab-nb tr:last-child'); if (nb) nb.classList.add('fresh');
  }
  // what the run showed, in words, from the numbers only: the watched readout against the reference run
  finding(r) {
    const B = this.baseRun() || (r.kind === 'baseline' ? r : null), W = r.watch;
    if (r.kind === 'baseline') { const S = Object.keys(r.out).slice(0, 3).map(n => r.steady[n] ? `${n} = ${fmt(r.out[n])}` : `${n} swings between ${fmt(r.span[n][0])} and ${fmt(r.span[n][1])}`); return S.length ? 'Reference: ' + S.join('; ') + '.' : 'Reference recorded (no readout gave a number).'; }
    if (!W || r.out[W] == null) return 'The watched readout gave no number in this run.';
    if (!B || B.out[W] == null) return `${this.rname(W, r)} = ${fmt(r.out[W])}.`;
    const x0 = B.out[W], x = r.out[W], d = this.rel(x0, x), up = x > x0, ch = Object.keys(r.diff).map(k => `${this.pname(k)} ${this.pval(k, B.set[k] ?? this.base[k])} → ${this.pval(k, r.set[k])}`).join(' and ');
    const noisy = !(B.steady[W] && r.steady[W]), tol = noisy ? .06 : .02, name = this.rname(W, r), pct = Math.abs(x0) > 1e-9 ? Math.round(Math.abs(x - x0) / Math.abs(x0) * 100) : null;
    if (d <= tol) return `${ch || 'The same settings'} left ${name} unchanged (${fmt(x0)} → ${fmt(x)}, within ${Math.round(tol * 100)} %)` + (Object.keys(r.diff).length === 1 ? `: here it does not depend on ${this.pname(Object.keys(r.diff)[0])}.` : '.');
    return `${ch} changed ${name} from ${fmt(x0)} to ${fmt(x)}` + (pct != null && pct < 1000 ? ` (${up ? '+' : '−'}${pct} %)` : '') + '.';
  }
  verdict(r) { if (!r.pred || r.kind === 'baseline') return null; const B = this.baseRun(), W = r.watch; if (!B || B.out[W] == null || r.out[W] == null) return null; const d = this.rel(B.out[W], r.out[W]), tol = B.steady[W] && r.steady[W] ? .02 : .06, real = d <= tol ? 'same' : r.out[W] > B.out[W] ? 'up' : 'down'; return real === r.pred; }
  // ---------- the panel ----------
  render(box) {
    const v = this.v, guided = this.mode === 'guided';
    const seg = el('div', { class: 'lab-mode', role: 'tablist', 'aria-label': 'Laboratory mode' }, [['guided', 'Guided discovery', 'The guide chooses informative experiments and says why; you predict, accept or skip'], ['open', 'Open laboratory', 'Set any variable yourself and record runs']].map(([m, t, ti]) => el('button', { class: 'lab-seg', role: 'tab', 'aria-selected': String(this.mode === m), title: ti, text: t, onclick: () => { this.mode = m; v.prefs.labMode = m; v.setPref('labMode', m); v.renderParams(); } })));
    const wrap = el('div', { class: 'lab' }, [seg]);
    if (this.cur) wrap.append(el('div', { class: 'lab-card running' }, [el('div', { class: 'lab-k', text: 'Running · run ' + (this.n + 1) }), el('div', { class: 'lab-t', mathLabel: this.cur.title }), el('div', { class: 'lab-bar' }, [el('i')]), this.cur.watch ? el('div', { class: 'dim small', html: 'Watching ' + mathHTML(this.cur.watch, 'label') }) : null]));
    else {
      const o = this.propose();
      if (guided) {
        if (!o) wrap.append(el('div', { class: 'lab-card' }, [el('div', { class: 'lab-t', text: 'Every informative experiment the guide knows has been run.' }), el('div', { class: 'dim small', text: 'Switch to the open laboratory to try your own.' })]));
        else wrap.append(this.offerCard(o, true));
      } else {
        wrap.append(el('div', { class: 'lab-row' }, [el('button', { class: 'btn primary small', text: 'Record a run', title: 'Restart the model with the settings below and record its readouts', disabled: v.running != null, onclick: () => this.run(null, 'mine') }), el('button', { class: 'btn ghost small', text: 'Back to reference', title: 'Reset the variables to the model as it was opened', onclick: () => { for (const k in this.base) v.setParam(k, this.base[k], true); v.rebuild(); v.refreshPins(); v.renderParams(); } })]));
        if (o) wrap.append(this.offerCard(o, false));
      }
    }
    box.prepend(wrap);
    if (this.runs.length) { if (guided) wrap.append(this.notebook()); else box.insertBefore(this.notebook(), this.v.dynBox && this.v.dynBox.parentNode === box ? this.v.dynBox : null); }   /* open laboratory: the sliders first, the notebook under them */
    if (guided) box.querySelectorAll('input[type=range]').forEach(i => { i.disabled = true; i.title = 'The guide sets these in guided discovery: switch to the open laboratory to set them yourself'; });
  }
  offerCard(o, guided) {
    const v = this.v, B = this.baseRun(), W = o.watch, canPred = guided && o.kind !== 'baseline' && W && B && B.out[W] != null;
    const why = el('ul', { class: 'lab-why' }, o.why.map(w => el('li', { html: mathHTML(w, 'label') })));
    const preds = canPred ? el('div', { class: 'lab-pred' }, [el('span', { class: 'dim small', html: 'First, predict: will ' + mathHTML(this.rname(W, B), 'label') + ' (' + fmt(B.out[W]) + ' in the reference run) rise, fall or stay?' }), el('div', { class: 'lab-opts' }, [['up', 'rises ▲'], ['down', 'falls ▼'], ['same', 'stays the same']].map(([k, t]) => el('button', { class: 'lp-opt', type: 'button', 'aria-checked': String(this.pred === k), text: t, onclick: () => { this.pred = k; v.renderParams(); } })))]) : null;
    const alts = o.alts && o.alts.length ? el('details', { class: 'lab-alts' }, [el('summary', { text: 'What else the guide weighed' }), el('ol', {}, o.alts.map(a => el('li', {}, [el('span', { mathLabel: a.title }), el('span', { class: 'dim', text: ' · score ' + a.score.toFixed(2) + ' · ' + (a.why[0] || '') })]))), el('p', { class: 'dim small', text: o.drawn ? 'This one was drawn at random from the three highest scores, with chances in proportion to them: a little chance widens what you explore.' : 'This is the only candidate left.' })]) : null;
    return el('div', { class: 'lab-card offer' + (guided ? '' : ' compact') }, [
      el('div', { class: 'lab-k', text: guided ? 'The guide proposes' : 'The guide would try next' }),
      el('div', { class: 'lab-t', mathLabel: o.title }),
      el('div', { class: 'dim small', html: W ? 'Watch ' + mathHTML(this.rname(W, B), 'label') : 'Records every readout' }),
      el('div', { class: 'lab-score', title: 'How informative the guide judges this run (the sum of the reasons below)' }, [el('i', { style: `width:${Math.min(100, o.score / 3 * 100)}%` })]),
      el('div', { class: 'lab-whyk', text: 'Why this one' }), why, preds,
      el('div', { class: 'lab-row' }, [el('button', { class: 'btn primary small', text: guided ? 'Accept and run' : 'Run it', disabled: v.running != null, onclick: () => this.run(o) }), el('button', { class: 'btn ghost small', text: 'Skip', title: 'Not this one: the guide offers the next', onclick: () => this.skip() }), el('button', { class: 'btn ghost small', text: 'Another', title: 'Draw again from the most informative', onclick: () => { this.propose(true); v.renderParams(); } })]),
      alts]);
  }
  notebook() {
    const rows = this.runs.slice(-12), vd = r => { const x = this.verdict(r); return x == null ? '' : x ? ' ✓' : ' ✗'; };
    const t = el('table', { class: 'lab-nb' }, [el('tbody', {}, rows.map(r => el('tr', { class: r.kind, title: r.kind === 'baseline' ? 'The reference run' : r.title }, [el('td', { class: 'lab-n', text: String(r.n) + (r.src === 'mine' ? '' : '·g') }), el('td', {}, [el('span', { html: mathHTML(r.finding || '', 'label') }), r.pred ? el('span', { class: 'lab-vd ' + (this.verdict(r) ? 'ok' : 'no'), text: ' You predicted ' + { up: 'a rise', down: 'a fall', same: 'no change' }[r.pred] + vd(r) }) : null])])))]);
    return el('div', { class: 'lab-book' }, [el('div', { class: 'lab-whyk', text: 'Notebook' }), t, el('div', { class: 'lab-row' }, [el('span', { class: 'dim small', text: '·g = proposed by the guide' }), el('button', { class: 'linkbtn small', text: 'Clear', onclick: () => { this.runs = []; this.n = 0; this.persist(); this.offer = null; this.v.renderParams(); } })])]);
  }
}
