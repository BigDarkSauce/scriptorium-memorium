// The reading scroll: a parchment overlay showing one part's logical chain. 3D showcases appear as 2D drawings
// (the real model seen through a long lens) with a Transition button that carries the camera into them.
import { el, esc, typeset, toast, uid, $, clamp, nextFrame, mathHTML, mathText } from '../util.js';
import { SVGDEMO, SVG_TYPES, renderFigure } from './diagrams.js';
import { closeLecterns } from '../dio/prims/index.js';
import { prose } from './prose.js';
import { renderSketch } from '../dio/engine.js';
import { DIO } from '../dio/models.js';
import { askJSON, errCopy, imageLimit, aiAvailable } from '../ai/claude.js';
import { chapterPrompt, detailPrompt } from '../ai/prompts.js';
import { analysePart, coverageFill, material as pipeMaterial, authorDemo, fallbackDemo } from '../ai/pipeline.js';
import { partKey, cached } from '../store.js';
import { addReveals } from '../seeds-sources.js';
import { renderReveal, openDeck, stats as revealStats, normReveal } from './reveal.js';
import { glyphFor, glyphSVG } from './glyphs.js';
import { renderMotion, hasMotion, motionIssues } from './motion.js';
import { seedMotion } from '../seeds-motion.js';
import { evidenceTools, evidenceAvailable, evidenceServers, verifySources, collectSources, searchOpenAlex, evidenceErr, doiUrl } from '../ai/evidence.js';
// Scroll drawings are rendered one per frame (each builds and renders a whole diorama), so opening a long scroll
// never freezes the page for the sum of them; a closed scroll's pending drawings are skipped.
let sketchQ = Promise.resolve();
const queueSketch = f => (sketchQ = sketchQ.then(nextFrame).then(f).catch(e => console.warn(e)));
const TOOLNAME = { search_literature: 'OpenAlex', search_evidence: 'Consensus', search_biomedical: 'PubMed', search_any_discipline: 'SciSpace', search_computing: 'Hugging Face', search_clinical_trials: 'ClinicalTrials.gov' };
const toolStatus = st => (name, input) => { st.textContent = `Looking it up in ${TOOLNAME[name] || name}: “${String((input && input.query) || '').slice(0, 70)}”…`; };

export const is3D = d => d && (d.type === 'scene' || Array.isArray(d.bodies) || !!DIO[String(d.type || '').toLowerCase()]);
export const needsAuthoring = d => d && d.type === 'scene' && !Array.isArray(d.bodies);
// prose with code and maths in it (js/room/prose.js): TeX spans first, then R / Python tokens as <code>, the rest typeset
export { prose };
const KIND_ABBR = { definition: 'DEF', axiom: 'AX', postulate: 'POST', lemma: 'LEM', theorem: 'THM', result: 'RES', derivation: '⇒', formula: 'EQ', example: 'EX', remark: 'REM' };

export class Reader {
  constructor(app, roomView, part) {
    this.app = app; this.room = roomView; this.part = part;
    this.el = el('section', { class: 'reader' }); app.ui.append(this.el);
    requestAnimationFrame(() => this.el.classList.add('in'));
    this.render();
    // Esc closes the ⋯ menu first when it is open (whatever holds the focus: on a one-fold scroll both items are disabled and
    // the focus stays on ⋯), and the scroll only when no menu is open
    this.onKey = e => { if (e.key !== 'Escape' || document.querySelector('.modal-veil')) return; if (this.menuOpen()) { e.preventDefault(); this.toggleMenu(false); const b = this.el.querySelector('.reader-menu-btn'); if (b) b.focus(); return; } this.close(); }; addEventListener('keydown', this.onKey);
    // a press anywhere outside the menu and its ⋯ button closes the menu
    this.onDown = e => { if (!this.menuOpen()) return; const m = this.el.querySelector('.reader-menu'); if (m && e.target && m.contains(e.target)) return; this.toggleMenu(false); }; addEventListener('pointerdown', this.onDown, true);
  }
  menuOpen() { const pop = this.el.querySelector('.reader-menu-pop'); return !!(pop && !pop.hidden); }
  dock(mode, initial) {
    if (mode !== 'full') this.lastDock = mode; this.dockMode = mode;
    ['left', 'center', 'right', 'full'].forEach(k => this.el.classList.toggle('dock-' + k, k === mode));
    this.el.querySelectorAll('[data-dock]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.dock === mode)));
    if (!initial || mode !== 'full') { try { localStorage.setItem('scriptorium.readerDock', mode === 'full' ? (this.lastDock || 'right') : mode); } catch (e) { } }
  }
  // the interactive figures stop with the scroll: their stages are disposed (observers, frame loops) and a lectern
  // opened from it is closed
  releaseFigures() { try { closeLecterns(); this.el.querySelectorAll('.fig.prim').forEach(b => b._prim && b._prim.dispose()); } catch (e) { console.warn(e); } }
  close() {
    this.releaseFigures(); if (this._dockKey) { removeEventListener('keydown', this._dockKey); this._dockKey = null; } this.el.classList.remove('in'); removeEventListener('keydown', this.onKey); removeEventListener('pointerdown', this.onDown, true); setTimeout(() => this.el.remove(), 500); this.room.onReaderClosed(this); }
  save() { this.room.save(); }
  bookName() { const b = this.room.book; return b.pdfTitle || b.title; }
  render() {
    const P = this.part, R = this.el; R.innerHTML = ''; this._figs = null;   // figures may have been cut since the last render
    const head = el('header', { class: 'reader-head' }, [
      el('div', { class: 'reader-title' }, [el('div', { class: 'kicker', text: (P.subOf ? 'Sub-scroll' : 'Part ' + (this.room.partIndex(P) + 1)) + (P.startPage ? ` · pages ${P.startPage}–${P.endPage}` : '') }), el('h2', { text: P.title })]),
      // where the scroll sits (left / centre / right) and full screen; remembered in this browser
      el('div', { class: 'reader-dock', role: 'group', 'aria-label': 'Scroll position' }, [['left', '⇤', 'Dock left'], ['center', '↔', 'Centre'], ['right', '⇥', 'Dock right'], ['full', '⛶', 'Full screen (F)']].map(([k, t, l]) =>
        el('button', { class: 'ibtn dark tiny', 'data-dock': k, 'aria-label': l, title: l, text: t, onclick: () => this.dock(this.dockMode === k && k === 'full' ? this.lastDock || 'right' : k) }))),
      el('div', { class: 'reader-menu' }, [el('button', { class: 'ibtn dark tiny reader-menu-btn', type: 'button', 'aria-label': 'Scroll menu: unfold all, roll up', 'aria-haspopup': 'menu', 'aria-expanded': 'false', title: 'Unfold all · Roll up', text: '⋯', onclick: () => this.toggleMenu() }), el('div', { class: 'reader-menu-pop', role: 'menu', hidden: true, onkeydown: e => { if (e.key === 'Escape') { e.stopPropagation(); this.toggleMenu(false); this.el.querySelector('.reader-menu-btn').focus(); } } })]),
      // the transfer deck (reveal.js): rules uncovered earlier, back in new situations on their day
      this.revisitBtn = el('button', { class: 'ibtn dark tiny rv-pill', type: 'button', 'aria-label': 'Revisit: new situations for rules you uncovered', title: 'Revisit: rules you uncovered, in new situations', html: '◆<span class="rv-n"></span>', onclick: () => openDeck({ typeset, onClose: () => this.refreshRevisit() }) }),
      el('button', { class: 'ibtn dark', 'aria-label': 'Close the scroll', title: 'Close (Esc)', text: '✕', onclick: () => this.close() })]);
    this.refreshRevisit();
    this.dock((() => { try { return localStorage.getItem('scriptorium.readerDock') || 'right'; } catch (e) { return 'right'; } })(), true);
    if (this._dockKey) removeEventListener('keydown', this._dockKey);   // render() runs again after an analysis or a check: one F listener, not one per render
    this._dockKey = e => { if ((e.key === 'f' || e.key === 'F') && !(e.target.closest && e.target.closest('input,textarea,[contenteditable]'))) this.dock(this.dockMode === 'full' ? this.lastDock || 'right' : 'full'); };
    addEventListener('keydown', this._dockKey);
    const body = el('div', { class: 'reader-body' }); this.body = body;
    R.append(el('div', { class: 'rod' }), head, body, el('div', { class: 'rod' }));
    if (!P.analysis) { this.folds = null; this.renderEmpty(); return; }
    if (!(P.analysis.chain || []).length) { this.folds = null; this.renderNoSteps(); return; }
    if (addReveals(P.analysis)) this.save();   /* an example scroll from before the Revelation Engine gets its loops (seeds-sources.js) */   // analysed, but the chain came back empty: nothing to unfold
    const chain = this.renderChain(P.analysis); body.append(this.analyseBar(true), chain, this.foldBar);
  }
  // ---------- progressive unfolding ----------
  // A scroll is never shown whole: its content is cut into folds at natural points (docs/ARCHITECTURE.md, "Reader
  // folds") and revealed one fold at a time by unrolling the sheet past a rod. How far each scroll was unrolled is kept
  // in the room record (part.unfold), so it survives a reload.
  //  units: a step's head (badge, question, title, statement, its figure, quotes) · each explanation paragraph with its
  //  figure · the display maths · the derivation · code · each example · table · figures · terms · intuition ·
  //  misconception · Check yourself (question and answer are one element) · showcases. Sources, bodies, the next
  //  question, figure links and number warnings are glued to the unit before them.
  //  folds: units are added while the fold weighs ≤ FOLD_W (a unit weighs 1, plus 1 with a figure or a drawing, plus
  //  .5 for a long text); a fold never ends between a step's head and its first unit, and a new step starts a new fold
  //  once the current one is well filled.
  computeFolds(wrap) {
    const GLUE = /^(sources|bodies|q-out|num-warn|fig-refs|extras)$/, HEAD = /^(badge|q-in|meta|from|stmt|quote-ref|src-quote)$/;
    const weigh = e => 1 + (e.querySelector('.fig-host, .pdf-figs figure, .sketch-card, .svg-slot, .src-table-wrap, .code-step') || /fig-host|pdf-figs|src-table-wrap|code-step/.test(e.className) ? 1 : 0) + ((e.textContent || '').length > 700 ? .5 : 0);
    const units = []; let pre = [];
    for (const c of [...wrap.children]) {
      if (c.classList.contains('arcs') || c.classList.contains('fold-bar')) continue;
      if (!c.classList.contains('step')) { if (!units.length || c.classList.contains('refs')) { if (c.classList.contains('refs')) units.push({ els: [c], w: 1, art: null, idx: 2 }); else pre.push(c); } else units[units.length - 1].els.push(c); continue; }
      let cur = null, idx = 0;
      for (const k of [...c.children]) {
        const cls = k.classList[0] || '';
        if (HEAD.test(cls) || (cur && cur.idx === 0 && cls === 'fig-host' && cur.els[cur.els.length - 1].classList.contains('stmt'))) { if (!cur || cur.idx !== 0) { cur = { els: [], w: 1, art: c, idx: 0, head: true }; units.push(cur); } cur.els.push(k); continue; }
        if (GLUE.test(cls) && cur) { cur.els.push(k); continue; }
        cur = { els: [k], w: weigh(k), art: c, idx: ++idx }; units.push(cur);
      }
    }
    if (pre.length) { if (units.length) units[0].els.unshift(...pre); else units.push({ els: pre, w: 1, art: null, idx: 0 }); }
    const FOLD_W = 4.5, folds = []; let f = null;
    units.forEach(u => {
      const brk = f && f.w > 0 && ((u.head && f.w >= FOLD_W * .6) || (u.idx >= 2 || u.head || !u.art) && f.w + u.w > FOLD_W);
      if (!f || brk) { f = { units: [], w: 0 }; folds.push(f); }
      f.units.push(u); f.w += u.w;
    });
    return folds;
  }
  setupFolds(wrap) {
    const P = this.part; this.folds = this.computeFolds(wrap); const n = this.folds.length;
    const saved = P.unfold && +P.unfold.n; this.shown = Math.max(1, Math.min(n, saved || 1));
    this.folds.forEach((f, i) => f.units.forEach(u => u.els.forEach(e => { e.dataset.fold = i; })));
    const bar = this.foldBar = el('div', { class: 'fold-bar' });
    this.applyFolds(false); return bar;
  }
  // hide the folds beyond `shown`; a step whose every part is hidden is hidden too; then the rod and its label
  applyFolds(animate, prevH) {
    const wrap = this.el.querySelector('.chain') || this._wrap, n = this.folds.length, k = this.shown;
    if (!wrap) return;
    this.folds.forEach((f, i) => f.units.forEach(u => u.els.forEach(e => e.classList.toggle('unf-hidden', i >= k))));
    wrap.querySelectorAll(':scope > .step').forEach(a => a.classList.toggle('unf-hidden', ![...a.children].some(c => !c.classList.contains('unf-hidden'))));
    const bar = this.foldBar; bar.innerHTML = ''; bar.classList.toggle('done', k >= n);
    if (k < n) {
      const go = el('button', { class: 'unroll', type: 'button', 'aria-label': `Unfold further: fold ${k + 1} of ${n}`, onclick: () => this.unfold(1) }, [el('span', { class: 'unroll-sheet', 'aria-hidden': 'true' }), el('span', { class: 'unroll-rod', 'aria-hidden': 'true' }), el('span', { class: 'unroll-label' }, [el('b', { text: 'Unfold further' }), el('span', { class: 'unroll-prog', text: `fold ${k} of ${n} read` })])]);
      // the curiosity gap at the edge: the question the next fold answers, shown (not answered) on the rod
      { const nx = this.folds.slice(k).flatMap(f => f.units.map(u => u.els).flat()), q = nx && nx.map(e => e.matches && (e.matches('.q-in, .reveal-card') ? e : e.querySelector && e.querySelector('.q-in, .rv-hook'))).find(Boolean); const t = q && (q.querySelector('.rv-hook') || q).textContent.replace(/^Q\s*/, '').replace(/^Predict, then unfold\s*/, '').trim(); if (t) go.querySelector('.unroll-label').append(el('span', { class: 'unroll-tease', text: 'Next: ' + (t.length > 110 ? t.slice(0, 108).replace(/\s+\S*$/, '') + '…' : t) })); }
      bar.append(go, el('div', { class: 'fold-dots', 'aria-hidden': 'true' }, this.folds.map((_, i) => el('i', { class: i < k ? 'on' : '' }))));
    } else bar.append(...[el('div', { class: 'unroll end' }, [el('span', { class: 'unroll-rod', 'aria-hidden': 'true' }), el('span', { class: 'unroll-label' }, [el('b', { text: 'The whole scroll is open' }), el('span', { class: 'unroll-prog', text: `${n} fold${n > 1 ? 's' : ''}` })])]), n > 1 ? el('button', { class: 'linkbtn roll-up', type: 'button', text: 'Roll it up again', onclick: () => this.rollUp() }) : null].filter(Boolean));   /* (append(null) would print the word "null" under a one-fold scroll's bar) */
    const mi = this.el.querySelector('.reader-menu-pop'); if (mi) this.fillMenu(mi);
    this.typesetShown();
    if (!animate) { requestAnimationFrame(() => drawArcs(wrap)); return; }
    // the sheet unrolls: the new part is uncovered from the old bottom edge down while the rod rolls down with it
    const dh = Math.max(0, wrap.offsetHeight - prevH), calm = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (calm || !dh || !wrap.animate) { drawArcs(wrap); return; }
    const dur = Math.round(clamp(dh * .9, 450, 1100)), ease = 'cubic-bezier(.3,.7,.25,1)';
    wrap.animate([{ clipPath: `inset(0 0 ${dh}px 0)`, marginBottom: `-${dh}px` }, { clipPath: 'inset(0 0 0px 0)', marginBottom: '0px' }], { duration: dur, easing: ease });
    const rod = bar.querySelector('.unroll-rod'); if (rod && rod.animate) rod.animate([{ backgroundPositionY: '0px' }, { backgroundPositionY: `${Math.round(dh / 3)}px` }], { duration: dur, easing: ease });
    setTimeout(() => { if (wrap.isConnected) drawArcs(wrap); }, dur + 30);
  }
  unfold(m = 1, quiet = false) {
    const n = this.folds.length; if (this.shown >= n) return; const wrap = this.el.querySelector('.chain'), prevH = wrap ? wrap.offsetHeight : 0;
    const hadFocus = !!(document.activeElement && document.activeElement.closest && document.activeElement.closest('.fold-bar'));
    this.shown = Math.min(n, this.shown + m); this.persistFolds();
    if (!quiet && this.app.sfx) this.app.sfx.play('unroll', { gain: .35 });
    this.applyFolds(!quiet && m === 1, prevH);
    // the keyboard stays on the rod (Enter, Enter, … unrolls the scroll fold by fold); at the end, on "Roll it up again"
    const b = this.foldBar.querySelector('button'); if (b && hadFocus) b.focus({ preventScroll: true });
  }
  unfoldAll() { this.unfold(this.folds.length, true); }
  rollUp() { this.shown = 1; this.persistFolds(); if (this.app.sfx) this.app.sfx.play('paper', { gain: .5 }); this.applyFolds(false); if (this.body) this.body.scrollTo({ top: 0, behavior: 'smooth' }); }
  persistFolds() { const P = this.part, n = this.folds.length; const old = P.unfold || {}; if (old.n === this.shown && old.of === n) return; P.unfold = { n: this.shown, of: n }; this.save(); }
  // unroll as far as needed to show an element (a jump to a step, a coverage link)
  unfoldTo(t) { const f = t && t.closest('[data-fold]') || (t && t.querySelector && t.querySelector('[data-fold]')); const i = f ? +f.dataset.fold : -1; if (this.folds && i >= this.shown) this.unfold(i + 1 - this.shown, true); }
  // MathJax measures sizes, so maths is typeset only once its fold is shown (and once the scroll has finished opening)
  typesetShown() {
    if (!this._typesetReady) return; const wrap = this.el.querySelector('.chain'); if (!wrap) return;
    const todo = [...wrap.querySelectorAll('[data-fold]')].filter(e => !e.classList.contains('unf-hidden') && !e._ts && !e.closest('.unf-hidden')); if (!todo.length) return;
    todo.forEach(e => { e._ts = true; }); typeset(todo).then(() => drawArcs(wrap));
  }
  fillMenu(pop) {
    const n = this.folds ? this.folds.length : 0; pop.innerHTML = '';
    pop.append(el('div', { class: 'rm-kicker', text: n ? `Unrolled: fold ${this.shown} of ${n}` : this.part.analysis ? 'No steps to unfold' : 'Not analysed yet' }),
      el('button', { class: 'rm-item', type: 'button', role: 'menuitem', text: 'Unfold all', disabled: !n || this.shown >= n, onclick: () => { this.unfoldAll(); this.toggleMenu(false); } }),
      el('button', { class: 'rm-item', type: 'button', role: 'menuitem', text: 'Roll up', disabled: !n || this.shown <= 1, onclick: () => { this.rollUp(); this.toggleMenu(false); } }));
  }
  toggleMenu(on) { const pop = this.el.querySelector('.reader-menu-pop'), b = this.el.querySelector('.reader-menu-btn'); if (!pop) return; on = on ?? pop.hidden; pop.hidden = !on; b.setAttribute('aria-expanded', String(on)); if (on) { this.fillMenu(pop); const f = pop.querySelector('button:not([disabled])'); if (f) f.focus(); } }
  renderEmpty() {
    const P = this.part, b = this.body;
    b.append(el('div', { class: 'empty' }, [
      el('h3', { html: '<span class="illum">T</span>his part is still sealed' }),
      el('p', { text: P.summary || 'Analyse it to rebuild the content as one logical chain: every definition, axiom and formula once, each step derived from the earlier ones, with showcases you can step into.' }),
      this.analyseBar(false)]));
  }
  renderNoSteps() {
    const b = this.body;
    b.append(el('div', { class: 'empty no-steps' }, [
      el('h3', { html: '<span class="illum">N</span>o steps were found' }),
      el('p', { text: 'The last analysis of this part came back without a single step, so there is nothing to unfold yet. Analyse it again (another depth may help), or paste a chain from another AI.' }),
      this.analyseBar(false, 'Analyse again')]));
  }
  analyseBar(compact, label) {
    const depth = el('select', { class: 'field small', 'aria-label': 'Depth' }, [el('option', { value: 'complete', text: 'Complete chain (length from content)' }), el('option', { value: 'essential', text: 'Essential chain (length from content)' }), el('option', { value: 'exact', text: 'Exact number of steps…' })]);
    const n = el('input', { type: 'number', class: 'field small num', min: 3, max: 80, value: 16, hidden: true, 'aria-label': 'Number of steps' });
    depth.onchange = () => { n.hidden = depth.value !== 'exact'; };
    const st = el('div', { class: 'status' });
    const go = el('button', { class: 'btn primary small', text: label || (compact ? 'Re-analyse' : 'Analyse this part'), onclick: () => this.analyse(depth.value, +n.value, st, go) });
    const pasted = el('button', { class: 'btn small', text: 'Paste JSON from another AI', onclick: () => this.pasteJSON() });
    return el('div', { class: 'analyse-bar' + (compact ? ' compact' : '') }, [el('div', { class: 'row wrap' }, [depth, n, go, pasted]), st]);
  }
  // ---------- the analysis pipeline (docs/PROTOCOL.md, "Recipe for any AI"; js/ai/pipeline.js) ----------
  // chain → coverage follow-ups → quality gate with targeted repairs → figures → dioramas per subsection. Nothing stored
  // is ever recomputed or re-asked; an interrupted run resumes at the stage it reached.
  ctx() { const room = this.room; return { app: this.app, book: room.book, data: room.data, save: () => this.save(), refresh: p => room.refreshStation(p) }; }
  async material(st) { return pipeMaterial(this.ctx(), this.part, { onStatus: t => { if (st) st.textContent = t; } }); }
  async analyse(depth, n, st, go) {
    const P = this.part; go.disabled = true;
    try {
      await analysePart(this.ctx(), P, { level: depth, n, force: true, onStatus: t => { st.textContent = t; } });
      this.save(); this.room.refreshStation(P); toast('Chain written'); this.render();
      if (evidenceAvailable() && collectSources(P.analysis).length) this.verify();
    } catch (e) { go.disabled = false; st.textContent = errCopy(e); }
  }
  // verify coverage; with auto, write what is missing in as few calls as possible (≤ 100k characters of text each)
  async checkAndFill(st, M, { auto = true, rounds = 2 } = {}) {
    M = M || await this.material(st);
    await coverageFill(this.ctx(), this.part, M, { auto, rounds, onStatus: t => { if (st) st.textContent = t; } });
  }
  async fillGaps(btn) {
    btn.disabled = true; const st = btn.nextSibling || null;
    try { await this.checkAndFill(st, null, { auto: true, rounds: 1 }); this.save(); this.room.refreshStation(this.part); this.render(); toast('Coverage updated'); }
    catch (e) { btn.disabled = false; if (st) st.textContent = errCopy(e); else toast(errCopy(e)); }
  }
  async pasteJSON() {
    const { manualRelay } = await import('../ai/claude.js');
    const P = this.part, book = this.room.book;
    let M = { sections: null, figures: [] }; try { M = await this.material(null); } catch (e) { }
    let text = ''; if (!M.sections && book.hasPdf) { try { const blob = await this.app.store.get('pdf:' + book.id); if (blob && this.app.ingest.keyPDF) this.app.ingest.keyPDF(blob, book.id); if (blob) text = await this.app.ingest.partText(blob, P.startPage || 1, P.endPage || 1, 60000); } catch (e) { } }
    try {
      const A = await manualRelay(chapterPrompt({ book: this.bookName(), chapter: P.title + (P.startPage ? ` (pages ${P.startPage}-${P.endPage})` : ''), text, depth: 'complete', sections: M.sections, figures: this.app.ingest.figureMeta(M.figures) }), 'Analyse "' + P.title + '" in any AI');
      if (!A || !Array.isArray(A.chain)) throw 0;
      P.analysis = normalizeChain(A); P.job = { stage: 'coverage' }; await analysePart(this.ctx(), P, { auto: false }); this.save(); this.room.refreshStation(P); this.render(); toast('Chain imported');
    } catch (e) { if (e && e.code !== 'cancelled') toast('That JSON has no "chain"'); }
  }
  // the PDF's own figures for this part (from IndexedDB); metadata only when the images are not stored here
  async figureStore() {
    if (this._figs) return this._figs;
    const P = this.part, book = this.room.book, src = P.subOf ? (this.room.data.parts.find(x => x.id === P.subOf) || P) : P;
    let figs = null; try { figs = await this.app.store.get(partKey('figs', book.id, src.id)); } catch (e) { }
    this._figs = new Map((figs || src.figureIndex || []).map(f => [f.id, f])); return this._figs;
  }
  renderCoverage(A) {
    const R = A.coverageReport; if (!R || !R.subsections) return null;
    const bad = R.missing.length + R.thin.length, figTxt = R.figures ? ` · ${R.figuresCited} of ${R.figures} PDF figures cited` : '';
    const thread = R.threadBreaks.length || R.threadMissing.length ? ` · question thread: ${R.threadBreaks.length + R.threadMissing.length} gap${R.threadBreaks.length + R.threadMissing.length > 1 ? 's' : ''}` : ' · question thread intact';
    const box = el('details', { class: 'coverage' + (bad || R.figuresUncited.length ? ' warn' : ' ok') }, [el('summary', {}, [el('span', { class: 'cov-ic', text: bad ? '◔' : '●' }), el('span', { text: `Coverage: ${R.covered} of ${R.subsections} subsections` + (R.thin.length ? ` (${R.thin.length} coarser than the source)` : '') + figTxt + thread + (R.followUps ? ` · ${R.followUps} follow-up call${R.followUps > 1 ? 's' : ''}` : '') })])]);
    const tb = el('table', { class: 'cov-table' }, [el('thead', {}, [el('tr', {}, ['Subsection', 'Pages', 'Steps'].map(t => el('th', { text: t })))])]);
    const body = el('tbody'); const map = {}; (A.coverage || []).forEach(c => { map[c.subsection] = c.steps; });
    const secs = (R.sections || []).length ? R.sections : (A.coverage || []).map(c => ({ id: c.subsection, title: '' }));
    secs.forEach(s => {
      const steps = map[s.id] || [], miss = R.missing.some(m => m.id === s.id), thin = R.thin.find(t => t.id === s.id);
      const cell = el('td'); steps.forEach((id, i) => { if (i) cell.append(' '); cell.append(el('a', { text: id, tabindex: 0, onclick: () => this.jump(id) })); });
      if (miss) cell.append(el('span', { class: 'cov-miss', text: 'not covered' })); if (thin) cell.append(el('span', { class: 'cov-thin', text: ` coarser than the source (${thin.steps} for ~${thin.expect})` }));
      body.append(el('tr', { class: miss ? 'miss' : thin ? 'thin' : '' }, [el('td', { html: `<b>${esc(s.id)}</b> ${esc(String(s.title || '').replace(new RegExp('^' + String(s.id).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+'), ''))}` }), el('td', { text: s.startPage ? s.startPage + (s.endPage > s.startPage ? '–' + s.endPage : '') : '' }), cell]));
    });
    tb.append(body); box.append(tb);
    const notes = [];
    if (R.figuresUncited.length) notes.push('PDF figures not yet explained: ' + R.figuresUncited.map(f => f.label).join(', ') + '.');
    if (R.threadBreaks.length) notes.push('The question thread breaks before ' + R.threadBreaks.join(', ') + '.');
    if (R.extrasUnsourced.length) notes.push('Outside additions without a source in ' + R.extrasUnsourced.join(', ') + '.');
    if (R.numbers && R.numbers.unmatched.length) notes.push(`Numbers not found in the PDF text: ${R.numbers.unmatched.map(u => u.step + ' (' + u.values.join(', ') + ')').join('; ')}. Check them against the page.`);
    if (R.demoIssues && R.demoIssues.length) notes.push('Demos to fix: ' + R.demoIssues.slice(0, 6).map(x => `${x.step} (${x.type}): ${x.issue}`).join('; ') + (R.demoIssues.length > 6 ? `; and ${R.demoIssues.length - 6} more` : '') + '.');
    if (R.unknownFigures && R.unknownFigures.length) notes.push('Figure ids that are not in this part: ' + R.unknownFigures.map(u => u.step + '→' + u.id).join(', ') + '.');
    notes.forEach(t => box.append(el('p', { class: 'cov-note', text: t })));
    if (bad || R.figuresUncited.length) { const st2 = el('span', { class: 'status' }); box.append(el('div', { class: 'row' }, [el('button', { class: 'btn small primary', text: 'Write the missing steps', onclick: e => this.fillGaps(e.target) }), st2])); }
    return box;
  }
  jump(id) { const t = this.el.querySelector(`[data-sid="${CSS.escape(id)}"]`); if (t) { this.unfoldTo(t.querySelector('[data-fold]') || t); t.scrollIntoView({ behavior: 'smooth', block: 'center' }); t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash'); } }
  // ---------- chain ----------
  renderChain(A) {
    const wrap = el('div', { class: 'chain' });
    const arcs = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); arcs.setAttribute('class', 'arcs'); wrap.append(arcs);
    wrap.append(el('div', { class: 'chain-head' }, [el('h2', { html: mathHTML(A.title || this.part.title) }), A.summary ? el('p', { html: mathHTML(A.summary) }) : null, A.question ? el('p', { class: 'part-q', html: '<b>The question of this part.</b> ' + mathHTML(A.question) }) : null, A.sourceNote ? el('div', { class: 'srcnote', text: A.sourceNote }) : null]));
    wrap.append(this.evidenceBar(A)); const cov = this.renderCoverage(A); if (cov) wrap.append(cov); const qual = this.renderQuality(A); if (qual) wrap.append(qual); this.seen3D = new Map(); this._shownPdf = new Map();
    this._breaks = new Set(A.coverageReport ? A.coverageReport.threadBreaks || [] : []); this._numbers = new Map(((A.coverageReport && A.coverageReport.numbers && A.coverageReport.numbers.unmatched) || []).map(u => [u.step, u.values]));
    this._secTitle = new Map(((A.coverageReport && A.coverageReport.sections) || []).map(x => [x.id, x.title]));
    (A.chain || []).forEach(st => wrap.append(this.renderStep(st, wrap, A)));
    if (A.references && A.references.length) wrap.append(el('section', { class: 'refs' }, [el('h3', { text: 'References' }), el('ol', {}, A.references.map(r => el('li', {}, [renderSource(r)])))]));
    this._wrap = wrap; this.setupFolds(wrap);
    // typeset only once the scroll has finished unrolling (MathJax measures sizes; a scaled container gives NaN), and only
    // the folds on show (the rest when they are unrolled)
    setTimeout(() => { if (wrap.isConnected) { this._typesetReady = true; this.typesetShown(); } }, 1000); setTimeout(() => drawArcs(wrap), 400);
    return wrap;
  }
  refreshRevisit() { const b = this.revisitBtn; if (!b) return; revealStats().then(S => { const n = b.querySelector('.rv-n'); if (n) n.textContent = S.due ? ' ' + S.due : ''; b.classList.toggle('due', S.due > 0); b.hidden = !S.loops; }).catch(() => { }); }
  renderStep(st, wrap, A) {
    const kind = String(st.kind || 'result').toLowerCase(); this._curTerms = [...(Array.isArray(st.terms) ? st.terms : []), ...(st.bodies || []).map(b => { const m = String(b).match(/^(.*?)\s*·\s*(.+?)\s+(\S{1,4})$/); return m ? { term: m[3], meaning: m[1] + ' · ' + m[2] } : null; }).filter(Boolean)];   /* "bob · mass m" names the symbol m too */   /* the step's symbols: a figure's "m" is drawn as what m means (glyphs.js) */
    const art = el('article', { class: 'step k-' + kind, 'data-sid': st.id });
    art.append(el('div', { class: 'badge', text: KIND_ABBR[kind] || st.id }));
    if (st.answers) art.append(el('div', { class: 'q-in' + (this._breaks && this._breaks.has(st.id) ? ' broken' : ''), title: this._breaks && this._breaks.has(st.id) ? 'The previous step opened a different question' : 'The question this step settles' }, [el('span', { class: 'q-mark', text: 'Q' }), el('span', { html: mathHTML(st.answers) })]));
    art.append(el('div', { class: 'meta' }, [el('span', { class: 'kind', text: st.id + ' · ' + kind }), el('h4', { html: mathHTML(st.title) }),
      st.section ? el('span', { class: 'sec-chip', title: (this._secTitle && this._secTitle.get(st.section)) || 'Subsection of the PDF', text: '§ ' + st.section }) : null,
      st.ref || (st.pages && st.pages.length) ? el('span', { class: 'ref', text: [st.ref, st.pages && st.pages.length && !/p\.\s*\d/.test(st.ref || '') ? 'p. ' + st.pages.join(', ') : ''].filter(Boolean).join(' · ') }) : null]));
    if (st.from && st.from.length) { const f = el('div', { class: 'from' }, ['follows from ']); st.from.forEach((id, i) => { if (i) f.append(', '); f.append(el('a', { text: id, tabindex: 0, onclick: () => this.jump(id) })); }); art.append(f); }
    if (st.statement) art.append(el('p', { class: 'stmt', html: prose(st.statement) }));
    if (st.statementFigure) art.append(this.figure(st.statementFigure));
    // short attributed excerpts (≤ 40 words); a passage quoted before is a link, never a second copy
    (st.quote || []).filter(q => q && q.text).forEach(q => art.append(q.dupOf ? el('div', { class: 'quote-ref' }, ['Quoted in ', el('a', { text: q.dupOf, tabindex: 0, onclick: () => this.jump(q.dupOf) })]) : el('blockquote', { class: 'src-quote' }, [el('span', { html: '“' + mathHTML(q.text) + '”' }), el('cite', { text: ' — the PDF' + (q.ref ? ', ' + q.ref : '') })])));
    // the explanation: paragraphs in the step's own words, each text-heavy one with its figure
    (st.explain || []).forEach(p => { const t = typeof p === 'string' ? p : p && p.text; if (!t) return; const row = el('div', { class: 'explain' + (p.figure ? ' has-fig' : '') }, [el('p', { html: prose(t) })]); if (p.figure) row.append(this.figure(p.figure)); art.append(row); });
    if (st.math) art.append(el('div', { class: 'disp', html: '\\[' + esc(st.math) + '\\]' }));
    if (st.derivation && st.derivation.length) { const ol = el('ol', { class: 'deriv' }); st.derivation.forEach(d => { const ex = typeof d === 'string' ? d : d.expr; ol.append(el('li', {}, [el('div', { class: 'ex', html: '\\[' + esc(ex) + '\\]' }), d.why ? el('div', { class: 'why', html: esc(d.why) }) : null])); }); art.append(ol); }
    if (st.code && Array.isArray(st.code.lines) && st.code.lines.length) art.append(renderCode(st.code));
    (st.examples || []).forEach(x => art.append(this.renderExample(x)));
    if (st.table && st.table.rows && st.table.rows.length) art.append(renderTable(st.table));
    if (st.figures && st.figures.length) art.append(this.renderFigures(st));
    if (st.figureRefs && st.figureRefs.length) art.append(el('div', { class: 'fig-refs' }, st.figureRefs.map(r => r.in ? el('span', { class: 'chip' }, [`${r.id} — shown in `, el('a', { text: r.in, tabindex: 0, onclick: () => this.jump(r.in) })]) : el('span', { class: 'chip dim', text: `${r.id} (p. ${r.page}) is a whole page: explained here instead of pasted` }))));
    if (st.extra && st.extra.length) art.append(el('div', { class: 'extras' }, st.extra.map(x => el('div', { class: 'extra' }, [el('span', { class: 'extra-badge', text: 'Added from outside the PDF' }), el('span', { html: ' ' + esc(x.what || '') }), x.source ? el('span', { class: 'extra-src' }, [' — ', renderSource(x.source)]) : el('span', { class: 'err', text: ' — no source given' })]))));
    if (this._numbers && this._numbers.has(st.id)) art.append(el('div', { class: 'num-warn', text: 'Not found in the PDF text of this subsection: ' + this._numbers.get(st.id).join(', ') + '. Check these numbers against the page.' }));
    if (st.terms && st.terms.length) art.append(el('dl', { class: 'terms' }, st.terms.flatMap(t => { const g = glyphFor(t.meaning, t.icon); return [el('dt', { html: (g ? glyphSVG(g, 15) + ' ' : '') + mathHTML(t.term) }), el('dd', { html: prose(t.meaning) })]; })));
    // the teaching boxes: the paragraph, its animation (the event or process it describes, played out; js/room/motion.js),
    // then its static figure as the summary to keep
    if (st.intuition) art.append(el('div', { class: 'intuition box-fig' }, [el('p', { html: '<b>Picture it.</b> ' + prose(st.intuition) }), this.motion(A, st, 'intuition'), st.intuitionFigure ? this.figure(st.intuitionFigure, true) : null]));
    if (st.misconception) art.append(el('div', { class: 'miscon box-fig' }, [el('p', { html: '<b>Common mistake.</b> ' + prose(st.misconception) }), this.motion(A, st, 'misconception'), st.misconceptionFigure ? this.figure(st.misconceptionFigure, true) : null]));
    const rv = renderReveal(st, { partId: this.part.id, partTitle: this.part.title, figure: f => this.figure(f, true), typeset, sfx: this.app.sfx, onReveal: () => this.refreshRevisit() });
    if (rv) art.append(rv);
    else if (st.check && st.check.q) {
      // the check's figure may give the answer away: it is drawn only when the answer is revealed
      const ans = el('div', { class: 'ans', hidden: true }, [el('div', { html: prose(st.check.a || '') })]); let drawn = false;
      art.append(el('div', { class: 'check' }, [el('div', { html: '<b>Check yourself.</b> ' + prose(st.check.q) }), el('button', { class: 'linkbtn', text: 'Show the answer', onclick: e => { ans.hidden = !ans.hidden; e.target.textContent = ans.hidden ? 'Show the answer' : 'Hide the answer'; if (!ans.hidden) { if (!drawn && st.check.figure) { ans.append(this.figure(st.check.figure, true)); drawn = true; } typeset(ans); } } }), ans]));
    }
    const srcBox = el('div', { class: 'sources' }); this.fillSources(st, srcBox); art.append(srcBox);
    if (st.bodies && st.bodies.length) art.append(el('div', { class: 'bodies' }, ['attached to', ...st.bodies.map(b => el('span', { class: 'chip', mathLabel: b }))]));
    const demos = el('div', { class: 'demos' });
    (st.demos || []).forEach((d, i) => demos.append(this.renderDemo(d, st, i, demos)));
    demos.append(el('div', { class: 'step-tools' }, [
      el('button', { class: 'linkbtn', text: '+ showcase', onclick: () => this.addShowcase(st, demos) }),
      el('button', { class: 'linkbtn', text: 'More detail → sub-scroll', onclick: () => this.moreDetail(st, A) }),
      evidenceAvailable() ? el('button', { class: 'linkbtn', text: 'Find sources', onclick: () => this.findSources(st, srcBox) }) : null]));
    art.append(demos);
    if (st.opens) art.append(el('div', { class: 'q-out', title: 'The question this step opens (the next step settles it)' }, [el('span', { class: 'q-mark', text: '→' }), el('span', { html: mathHTML(st.opens) })]));
    return art;
  }
  // one figure spec (js/room/figspec.js), drawn once the PDF's figure store is known (a "pdf" figure needs it)
  // a teaching box's animation: the step's own (written with the scroll, st.intuitionMotion / st.misconceptionMotion), or
  // the example library's (js/seeds-motion.js) while the paragraph is still the seed's
  motion(A, st, slot) {
    const spec = st[slot + 'Motion'] || seedMotion(A && A.title, st.id, slot, st[slot]); if (!hasMotion(spec)) return null;
    const host = el('div', { class: 'mo-host' }), d = (st.demos || []).find(x => x && (Array.isArray(x.bodies) || DIO[x.type]));   /* a portal: the same process, stepped into in 3D */
    try { renderMotion(spec, host, { text: st[slot], label: slot === 'intuition' ? 'Picture it' : 'Common mistake', actions: d ? [{ label: '3D ▸', title: 'Step into this step’s diorama', on: () => this.openDiorama(d, st, null) }] : [] }); } catch (e) { console.warn('motion', e); return null; } return host;
  }
  figure(spec, small = false) {
    const host = el('div', { class: 'fig-host' + (small ? ' small' : '') }), terms = this._curTerms || [];
    this.figureStore().then(F => { if (spec && spec.kind === 'pdf') { const first = this._shownPdf && this._shownPdf.get(spec.id); if (first) { host.append(el('div', { class: 'fig-refs' }, [el('span', { class: 'chip' }, [`${spec.id} — shown in `, el('a', { text: first, tabindex: 0, onclick: () => this.jump(first) })])])); return; } if (this._shownPdf) this._shownPdf.set(spec.id, host.closest('[data-sid]') ? host.closest('[data-sid]').dataset.sid : 'above'); } try { renderFigure(spec, host, { small, figStore: F, terms }); const cast = castStrip(spec, terms); if (cast) host.append(cast); } catch (e) { host.append(el('p', { class: 'err', text: e.message })); } });
    return host;
  }
  renderExample(x) {
    if (!x) return null; const added = x.origin === 'added';
    return el('div', { class: 'example-card' + (added ? ' added' : '') }, [
      el('div', { class: 'ex-head' }, [added ? el('span', { class: 'extra-badge', text: 'Added from outside the PDF' }) : el('span', { class: 'pdf-tag', text: 'From the PDF' + (x.ref ? ' · ' + x.ref : '') }), el('b', { html: ' ' + mathHTML(x.title || 'Worked example') })]),
      x.problem ? el('p', { class: 'ex-problem', html: prose(x.problem) }) : null,
      Array.isArray(x.solution) && x.solution.length ? el('ol', { class: 'ex-sol' }, x.solution.map(y => el('li', {}, [y && y.text ? el('span', { html: prose(y.text) }) : null, y && y.math ? el('div', { class: 'ex', html: '\\[' + esc(y.math) + '\\]' }) : null]))) : null,
      x.answer ? el('p', { class: 'ex-answer', html: '<b>Answer.</b> ' + prose(x.answer) }) : null,
      added ? (x.source ? el('div', { class: 'extra-src' }, ['Source: ', renderSource(x.source)]) : el('div', { class: 'err', text: 'No source given for this added example.' })) : null]);
  }
  // the quality gate's report: what was repaired, what the app fixed itself, what is still open
  renderQuality(A) {
    const Q = A.qualityReport; if (!Q) return null; const fin = Q.final || {}, open = (fin.issues || Q.remaining || []).filter(i => i.kind !== 'dioramas' && i.kind !== 'grammar');
    const R = Q.rounds || [], first = R[0] ? R[0].issues : 0;
    const box = el('details', { class: 'coverage quality' + (open.length ? ' warn' : ' ok') }, [el('summary', {}, [el('span', { class: 'cov-ic', text: open.length ? '◔' : '●' }), el('span', { text: `Quality check: ${open.length ? open.length + ' open issue' + (open.length > 1 ? 's' : '') : 'passed'}` + (Q.repaired ? ` · ${Q.repaired} step${Q.repaired > 1 ? 's' : ''} rewritten` : '') + (first ? ` (${first} found at first)` : '') + (A.figureReport ? ` · ${A.figureReport.slots} figures` : '') + (A.dioramaReport ? ` · ${A.dioramaReport.made.length} diorama${A.dioramaReport.made.length === 1 ? '' : 's'} built` : '') })])]);
    if (Q.fixed && Q.fixed.length) box.append(el('p', { class: 'cov-note', text: 'Fixed by the app: ' + Q.fixed.slice(0, 8).join('; ') + (Q.fixed.length > 8 ? '…' : '') + '.' }));
    open.slice(0, 12).forEach(i => box.append(el('p', { class: 'cov-note' }, [i.step ? el('a', { text: i.step, tabindex: 0, onclick: () => this.jump(i.step) }) : el('b', { text: i.section || '' }), ' ' + i.kind + ': ' + i.detail])));
    if (open.length) { const st2 = el('span', { class: 'status' }); box.append(el('div', { class: 'row' }, [el('button', { class: 'btn small primary', text: 'Repair these steps', onclick: async e => { e.target.disabled = true; try { const P = this.part; P.job = { ...(P.job || {}), stage: 'gate' }; await analysePart(this.ctx(), P, { auto: true, onStatus: t => { st2.textContent = t; } }); this.render(); } catch (x) { e.target.disabled = false; st2.textContent = errCopy(x); } } }), st2])); }
    return box;
  }
  // the PDF's own figures, captioned with their page; distinct from our drawings
  renderFigures(st) {
    const box = el('div', { class: 'pdf-figs' });
    this.figureStore().then(F => {
      st.figures.forEach(id => {
        const f = F.get(id); if (!f) return;
        // a PDF figure is shown once in the scroll; a later citation is a link back to it
        const first = this._shownPdf && this._shownPdf.get(id); if (first && first !== st.id) { box.append(el('div', { class: 'fig-refs' }, [el('span', { class: 'chip' }, [`${f.label || id} — shown in `, el('a', { text: first, tabindex: 0, onclick: () => this.jump(first) })])])); return; }
        if (this._shownPdf) this._shownPdf.set(id, st.id);
        // the crop already shows the book's caption; repeat it only when the image is missing or was cut without it
        const capInCrop = f.dataUrl && f.caption && f.src !== 'caption-only';
        const cap = el('figcaption', {}, [el('span', { class: 'pdf-tag', text: 'From the PDF, p. ' + f.page }), el('b', { text: ' ' + (f.label || id) + (f.caption && !capInCrop ? ' ' : '') }), capInCrop ? null : el('span', { text: String(f.caption || '').replace(/^(Figure|Fig\.?|Table)\s*[A-Z]?[\d.\-–]+[a-z]?\s*[.:\-–—|]?\s*/i, '') })]);
        const fig = el('figure', { class: 'pdf-fig' + (f.dataUrl ? '' : ' noimg'), 'data-fig': id });
        if (f.dataUrl) { const img = el('img', { src: f.dataUrl, alt: (f.caption || f.label || 'Figure') + ' (from the PDF, page ' + f.page + ')', title: 'Click to enlarge', loading: 'lazy' }); img.onclick = () => lightbox(f); fig.append(img); }
        else fig.append(el('div', { class: 'pdf-fig-missing', text: 'The figure image is not stored in this browser (the PDF is needed to cut it out).' }));
        fig.append(cap); box.append(fig);
      });
    });
    return box;
  }
  renderDemo(d, st, i, demos) {
    const wrapDemo = node => { if (!node || node.tagName === 'SPAN') return node; const prov = demoProvenance(d);
      // a fallback (authoring failed, or no AI here): say so, and offer to author the requested diorama again
      const fb = d.requested ? el('div', { class: 'demo-fallback' }, [el('span', { text: (d.type === 'figure' ? 'A diagram stands in' : 'A ready-made model stands in') + ' for the requested diorama “' + (d.requested.title || '') + '”' + (d.fallback ? ' (' + d.fallback + ')' : '') + '. ' }), aiAvailable() ? el('button', { class: 'linkbtn', text: 'Try building it with AI', onclick: async ev => { ev.target.disabled = true; const keep = { ...d }; Object.keys(d).forEach(k => delete d[k]); Object.assign(d, { type: 'scene', ...keep.requested }); try { await authorDemo(this.ctx(), st, d, {}); } catch (e) { Object.keys(d).forEach(k => delete d[k]); Object.assign(d, keep); } this.save(); this.room.refreshStation(this.part); const w = ev.target.closest('.demo-wrap'); if (w) demos.replaceChild(this.renderDemo(d, st, i, demos), w); } }) : null]) : null; const purp = d.purpose ? el('div', { class: 'demo-purpose', html: '<b>This demo answers:</b> ' + mathHTML(d.purpose) }) : null; const less = Array.isArray(d.lessons) && d.lessons.some(l => l && l.question) ? el('ol', { class: 'lesson-thread' }, d.lessons.map(l => el('li', {}, [el('span', { class: 'lq', html: mathHTML(l.question || l.title || '') }), l.opens ? el('span', { class: 'lo', html: ' → ' + mathHTML(l.opens) }) : null]))) : null; return el('div', { class: 'demo-wrap' }, [purp, node, less, prov, fb]); };
    return wrapDemo(this.renderDemoInner(d, st, i, demos));
  }
  renderDemoInner(d, st, i, demos) {
    const t = String(d.type || '').toLowerCase();
    if (SVG_TYPES.includes(t)) {
      const slot = el('div', { class: 'svg-slot', hidden: true }); let cleanup = null;
      const btn = el('button', { class: 'demo-btn svg', 'aria-expanded': 'false' }, [el('span', { class: 'ic', text: '◇' }), el('span', { mathLabel: d.title || t })]);
      btn.onclick = () => { const open = btn.getAttribute('aria-expanded') === 'true'; btn.setAttribute('aria-expanded', String(!open)); slot.hidden = open; if (open) { cleanup && cleanup(); slot.innerHTML = ''; } else { try { cleanup = SVGDEMO(d, slot, e => { slot.append(el('p', { class: 'err', text: String(e.message || e) })); }); } catch (e) { slot.append(el('p', { class: 'err', text: e.message })); } } };
      if (t === 'figure') setTimeout(() => { if (btn.getAttribute('aria-expanded') !== 'true') btn.click(); }, 0);   // a diagram standing in for a diorama is shown open
      return el('div', { class: 'demo2d' }, [btn, slot]);
    }
    if (!is3D(d)) return el('span');
    // the same diorama appears once as the overview drawing; later steps get a stage plate that frames and marks
    // only the bodies that step is about (or, if none can be identified, a compact link instead of a repeat)
    const dkey = d.type === 'scene' ? 'scene:' + (d.title || '') : String(d.type);
    const first = this.seen3D && this.seen3D.get(dkey); if (this.seen3D && !first) this.seen3D.set(dkey, st.id);
    const stage = first && first !== st.id && !needsAuthoring(d) ? { focusText: [d.title || '', st.title, (st.bodies || []).join(' ')].join(' '), label: st.id + ' ' + st.title, first } : null;
    const card = el('figure', { class: 'sketch-card' + (stage ? ' stage' : '') });
    const fill = () => {
      card.innerHTML = '';
      if (needsAuthoring(d)) {
        const st2 = el('div', { class: 'status' });
        card.append(el('div', { class: 'sketch-empty' }, [el('div', { class: 'kicker', text: (d.technique || 'card') + ' diorama · not built yet' }), el('b', { mathLabel: d.title || 'Scene' }), el('p', { class: 'dim small', math: d.request || '' }),
          el('button', { class: 'btn primary small', text: 'Build this diorama with AI', onclick: async ev => { ev.target.disabled = true; try { await authorDemo(this.ctx(), st, d, { onStatus: t => { st2.textContent = t; } }); this.save(); this.room.refreshStation(this.part); demos.replaceChild(this.renderDemo(d, st, i, demos), card.closest('.demo-wrap') || card); } catch (e) { ev.target.disabled = false; st2.textContent = errCopy(e); } } }), st2]));
        return;
      }
      const img = el('img', { class: 'sketch', alt: 'Drawing of ' + (d.title || d.type) });
      const go = el('button', { class: 'btn primary small', text: 'Transition ▸', onclick: () => this.openDiorama(d, st, img) });
      card.append(el('div', { class: 'sketch-frame' }, [img, el('div', { class: 'sketch-loading', text: 'drawing…' })]),
        el('figcaption', {}, [el('div', {}, [el('div', { class: 'kicker', text: stage ? `stage of the diorama shown in ${stage.first} · numbered parts are this step's bodies` : (d.technique || d.style || 'card') + ' · ' + (d.type === 'scene' ? 'authored scene' : d.type) }), el('b', { mathLabel: d.title || d.type })]), el('div', { class: 'row' }, [
          el('button', { class: 'btn small', text: 'Pedestal', title: 'Show this as the card model on the pedestal by this scroll', onclick: () => { this.part.pedestal = { step: st.id, demo: i }; this.save(); this.room.refreshStation(this.part); toast('Placed on the pedestal'); } }), go])]));
      img.addEventListener('click', () => this.openDiorama(d, st, img));
      queueSketch(() => !this.el.isConnected ? null : renderSketch(this.app.gfx, d, 800, stage ? 420 : 500, stage || {}).then(url => {
        if (!url) { // nothing specific to frame: a compact reference rather than the same picture again
          card.className = 'sketch-ref'; card.innerHTML = '';
          card.append(el('span', { class: 'ic', text: '↺' }), el('span', { html: `Same diorama as <a>${esc(stage.first)}</a>${d.params ? ', with this step\'s settings: ' + esc(Object.entries(d.params).map(([k, v]) => k + ' = ' + v).join(', ')) : ''}.` }), el('button', { class: 'btn small primary', text: 'Open ▸', onclick: () => this.openDiorama(d, st, null) }));
          card.querySelector('a').onclick = () => { const t = this.el.querySelector(`[data-sid="${CSS.escape(stage.first)}"]`); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
          return;
        }
        img.src = url; card.classList.add('ready'); }).catch(e => { card.querySelector('.sketch-loading').textContent = 'Could not draw: ' + e.message; }));
    };
    fill(); return card;
  }
  // ---------- evidence ----------
  evidenceBar(A) {
    const all = collectSources(A), ok = all.filter(s => s.verified).length, bad = all.filter(s => s.verified === false).length, todo = all.length - ok - bad;
    const st = el('span', { class: 'dim small' });
    const label = !all.length ? 'No sources cited yet.' : `${all.length} source${all.length > 1 ? 's' : ''} cited · ${ok} verified` + (bad ? ` · ${bad} not found` : '') + (todo ? ` · ${todo} unchecked` : '');
    const kids = [el('span', { class: 'ev-ic', text: '❦' }), el('span', { text: label })];
    if (evidenceAvailable() && todo) kids.push(el('button', { class: 'linkbtn', text: 'Verify against OpenAlex', onclick: () => this.verify(st) }));
    if (!evidenceAvailable()) kids.push(el('span', { class: 'dim small', text: ' Connect OpenAlex, Consensus, PubMed, SciSpace, Hugging Face or ClinicalTrials.gov in claude.ai to ground and verify sources.' }));
    kids.push(st); this.evBar = el('div', { class: 'evidence-bar' }, kids); return this.evBar;
  }
  async verify(st) {
    const A = this.part.analysis; st = st || (this.evBar && this.evBar.lastChild); if (st) st.textContent = ' Checking references…';
    // outside additions ("extra") are verified too: the objects are shared, so marks land on the steps
    const V = { references: A.references || [], chain: (A.chain || []).map(x => ({ sources: [...(x.sources || []), ...(x.extra || []).map(e => e.source).filter(Boolean)], demos: x.demos || [] })) };
    try { const r = await verifySources(V, (i, n) => { if (st) st.textContent = ` Checked ${i} of ${n}…`; }); this.save(); toast(`${r.ok} of ${r.checked} references found in OpenAlex`); this.render(); }
    catch (e) { if (st) st.textContent = ' ' + evidenceErr(e, 'OpenAlex'); }
  }
  fillSources(st, box) {
    box.innerHTML = ''; const S = st.sources || []; if (!S.length && !st.basis) return;
    box.append(el('div', { class: 'src-head' }, [st.basis ? el('span', { class: 'basis b-' + st.basis, text: { 'source-text': 'from the text', standard: 'standard knowledge', derived: 'derived above', empirical: 'measured fact' }[st.basis] || st.basis }) : null, S.length ? el('span', { text: 'Sources' }) : null]));
    if (S.length) box.append(el('ul', {}, S.map(s => el('li', {}, [renderSource(s)]))));
  }
  async findSources(st, box) {
    const q = [st.title, st.statement && st.statement.replace(/\$[^$]*\$/g, '').slice(0, 120)].filter(Boolean).join(' ');
    const res = el('div', { class: 'src-results' }, [el('div', { class: 'dim small', text: 'Searching OpenAlex…' })]); box.append(res);
    try {
      const R = await searchOpenAlex(q, { limit: 5 }); res.innerHTML = '';
      if (!R.length) { res.append(el('div', { class: 'dim small', text: 'Nothing close found. Try More detail, or add a source by hand in the exported JSON.' })); return; }
      res.append(el('div', { class: 'dim small', text: 'Pick the works that support this step:' }));
      R.forEach(r => res.append(el('div', { class: 'src-cand' }, [renderSource(r), el('button', { class: 'btn small', text: 'Cite', onclick: () => { st.sources = st.sources || []; st.sources.push({ title: r.title, authors: r.authors, year: r.year, doi: r.doi, url: r.url, note: 'chosen by the reader', verified: true, check: 'exact', cited_by: r.cited_by }); this.save(); this.fillSources(st, box); } })])));
    } catch (e) { res.innerHTML = ''; res.append(el('div', { class: 'err', text: evidenceErr(e, 'OpenAlex') })); }
  }
  openDiorama(d, st, img) {
    if (!img || !img.src) { this.app.openDiorama(d, { title: d.title || st.title, subtitle: this.part.title + ' · ' + st.id + ' ' + st.title, context: `${st.title}: ${st.statement || ''}`, onSave: () => this.save(), returnTo: { room: this.room.book.id, part: this.part.id }, autoTransition: true }); return; }
    const r = img.getBoundingClientRect();
    this.app.openDiorama(d, { fromRect: r, fromImg: img.src, title: d.title || st.title, subtitle: this.part.title + ' · ' + st.id + ' ' + st.title, context: `${st.title}: ${st.statement || ''}`, onSave: () => this.save(), returnTo: { room: this.room.book.id, part: this.part.id } });
  }
  addShowcase(st, demos) {
    const ta = el('textarea', { class: 'field', rows: 3, placeholder: 'Describe what the diorama should show (bodies, variables, events), or leave empty to let AI choose.' });
    const tech = el('select', { class: 'field small' }, ['card', 'sweep', 'topdown'].map(t => el('option', { value: t, text: { card: 'Card model', sweep: 'Section sweep', topdown: 'Top-down plan' }[t] })));
    const box = el('div', { class: 'modal-veil' }, [el('div', { class: 'modal glass' }, [el('h3', { text: 'Add a showcase to ' + st.id }), ta, el('label', { text: 'Materialisation' }), tech,
      el('div', { class: 'row end' }, [el('button', { class: 'btn', text: 'Cancel', onclick: () => box.remove() }), el('button', { class: 'btn primary', text: 'Add', onclick: () => { st.demos = st.demos || []; const d = { type: 'scene', title: (ta.value || st.title).slice(0, 70), technique: tech.value, purpose: st.answers || '', request: ta.value || `Embody "${st.title}": ${st.statement || ''}` }; st.demos.push(d); box.remove();
        // authored at once (full, then simpler); without AI, or if both fail, a fitting model or diagram stands in: never an empty slot
        const slot = el('div', { class: 'status', text: 'Building the diorama…' }); demos.insertBefore(slot, demos.lastChild);
        authorDemo(this.ctx(), st, d, { onStatus: t => { slot.textContent = t; } }).catch(() => { if (d.type === 'scene' && !Array.isArray(d.bodies)) Object.assign(d, fallbackDemo(st, d)); }).then(() => { slot.replaceWith(this.renderDemo(d, st, st.demos.length - 1, demos)); this.save(); this.room.refreshStation(this.part); }); } })])])]);
    document.body.append(box);
  }
  async moreDetail(st, A) {
    const t = toast('Writing a sub-scroll for ' + st.id + '…', 6000);
    try {
      const sub = await askJSON(detailPrompt({ step: st, chain: A.chain }), { tools: evidenceTools(), manualTitle: 'Expand this step in any AI' });
      if (!sub || !Array.isArray(sub.chain)) throw { code: 'invalid_json' };
      const part = { id: 'p-' + uid(), title: sub.title || (st.title + ' in detail'), subOf: this.part.id, fromStep: st.id, analysis: normalizeChain(sub) };
      this.room.addPart(part, this.part); toast('Sub-scroll hung beside this one');
    } catch (e) { toast(errCopy(e)); }
  }
}
// Provenance of what a demo shows (docs/PROTOCOL.md, "Demo provenance"): data and points come from the PDF unless the
// demo carries "extra" (or a "source" marked outside:true). "ref" (or pages, or a source naming the PDF) says where.
// A demo with no data of its own is our drawing.
export function demoOrigin(d) {
  const ex = Array.isArray(d.extra) ? d.extra.filter(x => x && (x.what || x.source)) : d.extra && typeof d.extra === 'object' ? [d.extra] : d.extra ? [{ what: String(d.extra) }] : [];
  const src = d.source && typeof d.source === 'object' ? d.source : typeof d.source === 'string' ? { title: d.source } : null;
  // chains written before this rule cited outside data in "source" with a DOI or URL: still read as outside
  const legacyOutside = src && src.outside == null && !src.fromPdf && !d.ref && (src.doi || src.url);
  if (ex.length || (src && (src.outside === true || legacyOutside))) return { kind: 'outside', extra: ex, source: src && (src.outside === true || legacyOutside) ? src : null };
  const pages = Array.isArray(d.pages) ? d.pages : d.page != null ? [d.page] : [];
  const where = [d.ref || (src && (src.ref || src.title)) || '', pages.length && !/p\.\s*\d/.test(d.ref || '') ? 'p. ' + pages.join(', ') : ''].filter(Boolean).join(', ');
  const hasData = (Array.isArray(d.points) && d.points.length) || !!d.ref || !!src || pages.length > 0 || !!d.data;
  return hasData ? { kind: 'pdf', where } : { kind: 'own' };
}
function demoProvenance(d) {
  const o = demoOrigin(d);
  if (o.kind === 'outside') return el('div', { class: 'demo-prov' }, [el('span', { class: 'extra-badge', text: 'Data added from outside the PDF' }), ' ',
    o.source ? renderSource(o.source) : null, o.source && o.extra.length ? ' · ' : null,
    ...o.extra.map((x, k) => el('span', {}, [k ? '; ' : '', String(x.what || ''), x.source ? el('span', { class: 'extra-src' }, [' — ', renderSource(x.source)]) : el('span', { class: 'err', text: ' — no source given' })]))]);
  if (o.kind === 'pdf') return el('div', { class: 'demo-prov pdf' }, [el('span', { class: 'pdf-tag', text: 'From the PDF' }), o.where ? el('span', { text: ' ' + o.where }) : null, el('span', { class: 'dim', text: ' · drawn by us' })]);
  return el('div', { class: 'demo-prov own', text: 'Our drawing' });
}
const fig = f => f && typeof f === 'object' && (f.kind || f.type) ? f : null;
export function normalizeChain(A) {
  const src = (A.chain || []).filter(x => x && typeof x === 'object');
  const strs = a => Array.isArray(a) ? a.map(String) : a != null && a !== '' ? [String(a)] : [];
  A.chain = (A.chain || []).filter(x => x && typeof x === 'object').map((x, i) => ({ id: String(x.id || 'S' + (i + 1)), kind: String(x.kind || 'result'), title: String(x.title || ''), statement: String(x.statement || ''), math: x.math ? String(x.math) : '', derivation: Array.isArray(x.derivation) ? x.derivation : [], from: Array.isArray(x.from) ? x.from.map(String) : [], bodies: Array.isArray(x.bodies) ? x.bodies.map(String).slice(0, 8) : [], demos: Array.isArray(x.demos) ? x.demos.filter(d => d && d.type || (d && d.bodies)).slice(0, 8) : [],
    terms: Array.isArray(x.terms) ? x.terms.filter(t => t && t.term).slice(0, 16) : [], intuition: x.intuition ? String(x.intuition) : '', misconception: x.misconception ? String(x.misconception) : '',
    check: x.check && x.check.q ? { q: String(x.check.q), a: String(x.check.a || '') } : null, basis: x.basis ? String(x.basis) : '', sources: normSources(x.sources),
    // subchapter coverage, the question thread, provenance (docs/PROTOCOL.md)
    section: x.section != null ? String(x.section) : '', answers: x.answers ? String(x.answers) : '', opens: x.opens ? String(x.opens) : '',
    ref: x.ref ? String(x.ref) : '', pages: (Array.isArray(x.pages) ? x.pages : x.pages != null ? [x.pages] : []).map(Number).filter(n => isFinite(n)).slice(0, 12),
    figures: strs(x.figures).slice(0, 12), extra: normExtra(x.extra),
    table: x.table && Array.isArray(x.table.rows) ? { caption: String(x.table.caption || ''), columns: strs(x.table.columns), rows: x.table.rows.filter(Array.isArray).slice(0, 80).map(r => r.map(c => String(c ?? ''))) } : null,
    // explained steps (docs/PEDAGOGY.md): paragraphs with figures, short quotes, code line by line, worked examples, small figures
    explain: (Array.isArray(x.explain) ? x.explain : x.explain ? [x.explain] : []).map(p => typeof p === 'string' ? { text: p } : p && p.text ? { text: String(p.text), ...(fig(p.figure) ? { figure: fig(p.figure) } : {}) } : null).filter(Boolean).slice(0, 8),
    quote: (Array.isArray(x.quote) ? x.quote : x.quote ? [x.quote] : []).map(q => typeof q === 'string' ? { text: q } : q && q.text ? { text: String(q.text), ref: q.ref ? String(q.ref) : '', ...(q.dupOf ? { dupOf: q.dupOf } : {}) } : null).filter(Boolean).slice(0, 4),
    code: x.code && Array.isArray(x.code.lines) ? { lang: String(x.code.lang || 'r'), lines: x.code.lines.slice(0, 60).map(l => typeof l === 'string' ? { code: l, explain: '' } : { code: String(l && l.code || ''), explain: String(l && l.explain || '') }), output: Array.isArray(x.code.output) ? x.code.output.map(String).slice(0, 30) : x.code.output ? String(x.code.output).split('\n').slice(0, 30) : [], interpret: String(x.code.interpret || '') } : null,
    examples: (Array.isArray(x.examples) ? x.examples : []).filter(e => e && (e.problem || e.title)).slice(0, 4).map(e => ({ title: String(e.title || ''), origin: e.origin === 'added' ? 'added' : 'pdf', ref: String(e.ref || ''), problem: String(e.problem || ''), solution: (Array.isArray(e.solution) ? e.solution : []).map(y => typeof y === 'string' ? { text: y } : { text: String(y && y.text || ''), math: y && y.math ? String(y.math) : '' }).slice(0, 12), answer: String(e.answer || ''), ...(e.source ? { source: normSources([typeof e.source === 'string' ? { title: e.source } : e.source])[0] || null } : {}) })),
    ...(fig(x.statementFigure) ? { statementFigure: fig(x.statementFigure) } : {}), ...(fig(x.intuitionFigure) ? { intuitionFigure: fig(x.intuitionFigure) } : {}), ...(fig(x.misconceptionFigure) ? { misconceptionFigure: fig(x.misconceptionFigure) } : {}),
    ...(Array.isArray(x.figureRefs) ? { figureRefs: x.figureRefs } : {}), ...(x.repaired ? { repaired: x.repaired } : {}),
    // the explanatory compiler's routing (js/dio/domains.js): the AI's own choice of domain, structure and primitive
    ...(normReveal(x.reveal) ? { reveal: normReveal(x.reveal) } : {}),
    ...Object.fromEntries(['intuitionMotion', 'misconceptionMotion'].filter(k => x[k] && typeof x[k] === 'object' && !motionIssues(x[k]).length).map(k => [k, x[k]])),   /* an animation that does not check out is dropped, never half drawn */
    ...(x.visual && typeof x.visual === 'object' ? { visual: Object.fromEntries(['domain', 'structure', 'primitive', 'medium', 'why'].filter(k => x.visual[k]).map(k => [k, String(x.visual[k]).slice(0, 200)])) } : {}) }));
  A.chain.forEach((st, i) => { const x = src[i]; if (st.check && x && x.check && fig(x.check.figure)) st.check.figure = fig(x.check.figure); });
  if (Array.isArray(A.dioramaPlan)) A.dioramaPlan = A.dioramaPlan.filter(p => p && p.subsection != null).map(p => ({ subsection: String(p.subsection), count: Math.max(0, Math.min(3, +p.count || 0)), why: String(p.why || '') }));
  A.references = normSources(A.references);
  if (A.question) A.question = String(A.question);
  if (!Array.isArray(A.coverage)) A.coverage = []; else A.coverage = A.coverage.filter(c => c && c.subsection != null).map(c => ({ subsection: String(c.subsection), steps: strs(c.steps) }));
  if (!Array.isArray(A.figuresSkipped)) delete A.figuresSkipped;
  return A;
}
function normExtra(e) {
  const arr = Array.isArray(e) ? e : e && typeof e === 'object' ? [e] : e ? [{ what: String(e) }] : [];
  return arr.filter(x => x && (x.what || x.source)).slice(0, 8).map(x => ({ what: String(x.what || ''), source: x.source ? (typeof x.source === 'string' ? { title: x.source } : normSources([x.source])[0] || null) : null }));
}
// code explained line by line: each source line beside what it does, then the printed output and what it means
function renderCode(c) {
  const t = el('table', { class: 'code-lines' }, [el('tbody', {}, c.lines.map((l, i) => el('tr', {}, [el('td', { class: 'ln', text: String(i + 1) }), el('td', { class: 'cl' }, [el('code', { text: (l && l.code) || String(l || '') })]), el('td', { class: 'ce', html: prose((l && l.explain) || '') })])))]);
  const out = Array.isArray(c.output) ? c.output : c.output ? String(c.output).split('\n') : [];
  return el('div', { class: 'code-step' }, [el('div', { class: 'code-head' }, [el('span', { class: 'kind', text: (c.lang || 'code').toUpperCase() + ' · line by line' })]), el('div', { class: 'code-wrap' }, [t]),
    out.length ? el('pre', { class: 'code-out', text: out.join('\n') }) : null, c.interpret ? el('p', { class: 'code-int', html: '<b>What the output says.</b> ' + prose(c.interpret) }) : null]);
}
function renderTable(T) {
  const t = el('table', { class: 'src-table' });
  if (T.caption) t.append(el('caption', { html: mathHTML(T.caption) }));
  if (T.columns && T.columns.length) t.append(el('thead', {}, [el('tr', {}, T.columns.map(c => el('th', { html: mathHTML(c) })))]));
  t.append(el('tbody', {}, T.rows.map(r => el('tr', {}, r.map(c => el('td', { html: mathHTML(c) }))))));
  return el('div', { class: 'src-table-wrap' }, [t]);
}
function dataUrlBlob(u) { const [h, b] = String(u).split(','); const bin = atob(b || ''); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: (h.match(/data:([^;]+)/) || [])[1] || 'image/jpeg' }); }
function lightbox(f) {
  const box = el('div', { class: 'modal-veil fig-lightbox', onclick: e => { if (e.target === box || e.target.tagName === 'BUTTON') box.remove(); } }, [el('figure', {}, [el('img', { src: f.dataUrl, alt: f.label || 'Figure' }), el('figcaption', {}, [el('span', { class: 'pdf-tag', text: 'From the PDF, p. ' + f.page }), ' ', el('span', { text: f.caption || f.label || '' })]), el('button', { class: 'btn small', text: 'Close' })])]);
  document.body.append(box);
}
export function drawArcs(wrap) {
  const svg = wrap.querySelector('.arcs'); if (!svg) return; svg.innerHTML = ''; svg.setAttribute('height', wrap.scrollHeight);
  const pos = {}; wrap.querySelectorAll('.step:not(.unf-hidden)').forEach(a => { pos[a.dataset.sid] = a.offsetTop + 27; });
  const NS = 'http://www.w3.org/2000/svg'; const defs = document.createElementNS(NS, 'defs'); defs.innerHTML = '<marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8z" fill="#9c3a28"/></marker>'; svg.append(defs);
  [...wrap.querySelectorAll('.step:not(.unf-hidden)')].forEach((a, k) => { const f = a.querySelector('.from'); if (!f) return; [...f.querySelectorAll('a')].forEach((ln, j) => { const y0 = pos[ln.textContent], y1 = pos[a.dataset.sid]; if (y0 == null || y1 == null) return; const depth = 6 + ((k + j) % 4) * 3.5; const p = document.createElementNS(NS, 'path'); p.setAttribute('d', `M 18 ${y0} C ${depth - 6} ${y0}, ${depth - 6} ${y1}, 16 ${y1 - 1}`); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'rgba(156,58,40,.55)'); p.setAttribute('stroke-width', '1.3'); p.setAttribute('marker-end', 'url(#ah)'); svg.append(p); }); });
}

function normSources(a) { return Array.isArray(a) ? a.filter(s => s && (s.title || s.doi)).slice(0, 30).map(s => ({ ...s, title: String(s.title || ''), doi: s.doi ? String(s.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '') : '' })) : []; }
// Under a figure, the cast of its symbols: each of the step's terms whose symbol is written in the figure, as a chip with
// a picture of what it stands for (glyphs.js) and its meaning cut to the first clause: "(ball) m · mass of the bob".
// Nothing when the figure names none of them, or when it is a PDF page (that already has its own legend).
export function castStrip(spec, terms) {
  if (!spec || spec.kind === 'pdf' || !Array.isArray(terms) || !terms.length || spec.cast === false) return null;
  const words = new Set(); JSON.stringify(spec, (k, v) => { if (typeof v === 'string' && !/^(kind|d|color|fill|tone|shape|id|chart|dist|icon)$/.test(k)) mathText(v).split(/[^\p{L}\p{N}_′'·]+/u).forEach(w => w && words.add(w)); return v; });
  const sym = t => mathText(String(t.term || '')).replace(/\s+/g, '').trim();
  const hit = terms.filter(t => { const s = sym(t); return s && s.length <= 12 && words.has(s); }).slice(0, 6); if (!hit.length) return null;
  return el('div', { class: 'fig-cast' }, hit.map(t => { const g = glyphFor(t.meaning, t.icon); return el('span', { class: 'cast-chip', title: String(t.meaning || '') }, [g ? el('span', { class: 'cast-g', html: glyphSVG(g, 16) }) : null, el('b', { html: mathHTML(t.term) }), el('span', { class: 'cast-m', html: ' ' + prose(String(t.meaning || '').split(/[,;(]/)[0].trim()) })]); }));
}
export function renderSource(s) {
  const href = [s.url, s.doi ? doiUrl(s.doi) : '', s.openalex].map(u => String(u || '').trim()).find(u => /^https?:\/\//i.test(u)) || '';   // model/imported text: never a javascript: or data: link
  const mark = s.verified === true ? el('span', { class: 'vmark ok', title: 'Found in OpenAlex' + (s.cited_by != null ? ` · cited ${s.cited_by.toLocaleString()} times` : ''), text: '✓' }) : s.verified === false ? el('span', { class: 'vmark bad', title: s.checkNote || 'Not found in OpenAlex: the reference may be garbled or invented. Check before relying on it.', text: s.check === 'uncertain' ? '?' : '✗' }) : el('span', { class: 'vmark', title: 'Not checked yet', text: '·' });
  const title = href ? el('a', { href, target: '_blank', rel: 'noopener', html: esc(s.title || s.matched || s.doi) }) : el('i', { html: esc(s.title) });
  const EK = { effect: 'measured effect', method: 'teaching method tested', visual: 'visualisation tested', implementation: 'works technically', inspiration: 'inspiration only' }, ek = EK[s.evidence] ? el('span', { class: 'ev-kind ek-' + s.evidence, title: 'What kind of support this source gives', text: EK[s.evidence] }) : null;   /* evidence kinds are kept apart: an effect existing is not a method working */
  return el('span', { class: 'src' }, [mark, ' ', ek, ek ? ' ' : null, s.authors ? String(s.authors) + ' ' : '', s.year ? '(' + s.year + ') ' : '', title, s.venue ? el('span', { class: 'dim', text: ' · ' + s.venue }) : null, s.matched && s.verified ? el('span', { class: 'dim small', text: ' — matched: ' + s.matched }) : null, s.note ? el('span', { class: 'note', text: ' — ' + s.note }) : null]);
}
