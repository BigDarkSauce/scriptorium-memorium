// The reading scroll: a parchment overlay showing one part's logical chain. 3D showcases appear as 2D drawings
// (the real model seen through a long lens) with a Transition button that carries the camera into them.
import { el, esc, typeset, toast, uid, $, clamp, nextFrame, mathHTML } from '../util.js';
import { SVGDEMO, SVG_TYPES } from './diagrams.js';
import { renderSketch } from '../dio/engine.js';
import { DIO } from '../dio/models.js';
import { askJSON, errCopy, imageLimit, aiAvailable } from '../ai/claude.js';
import { chapterPrompt, authorPrompt, detailPrompt, verifyChain, gapsOf, followUpPrompt, mergeFollowUp } from '../ai/prompts.js';
import { partKey, cached } from '../store.js';
import { evidenceTools, evidenceAvailable, evidenceServers, verifySources, collectSources, searchOpenAlex, evidenceErr, doiUrl } from '../ai/evidence.js';
// Scroll drawings are rendered one per frame (each builds and renders a whole diorama), so opening a long scroll
// never freezes the page for the sum of them; a closed scroll's pending drawings are skipped.
let sketchQ = Promise.resolve();
const queueSketch = f => (sketchQ = sketchQ.then(nextFrame).then(f).catch(e => console.warn(e)));
const TOOLNAME = { search_literature: 'OpenAlex', search_evidence: 'Consensus', search_biomedical: 'PubMed' };
const toolStatus = st => (name, input) => { st.textContent = `Looking it up in ${TOOLNAME[name] || name}: “${String((input && input.query) || '').slice(0, 70)}”…`; };

export const is3D = d => d && (d.type === 'scene' || Array.isArray(d.bodies) || !!DIO[String(d.type || '').toLowerCase()]);
export const needsAuthoring = d => d && d.type === 'scene' && !Array.isArray(d.bodies);
const KIND_ABBR = { definition: 'DEF', axiom: 'AX', postulate: 'POST', lemma: 'LEM', theorem: 'THM', result: 'RES', derivation: '⇒', formula: 'EQ', example: 'EX', remark: 'REM' };

export class Reader {
  constructor(app, roomView, part) {
    this.app = app; this.room = roomView; this.part = part;
    this.el = el('section', { class: 'reader' }); app.ui.append(this.el);
    requestAnimationFrame(() => this.el.classList.add('in'));
    this.render();
    this.onKey = e => { if (e.key === 'Escape' && !document.querySelector('.modal-veil')) this.close(); }; addEventListener('keydown', this.onKey);
  }
  dock(mode, initial) {
    if (mode !== 'full') this.lastDock = mode; this.dockMode = mode;
    ['left', 'center', 'right', 'full'].forEach(k => this.el.classList.toggle('dock-' + k, k === mode));
    this.el.querySelectorAll('[data-dock]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.dock === mode)));
    if (!initial || mode !== 'full') { try { localStorage.setItem('scriptorium.readerDock', mode === 'full' ? (this.lastDock || 'right') : mode); } catch (e) { } }
  }
  close() {
    if (this._dockKey) { removeEventListener('keydown', this._dockKey); this._dockKey = null; } this.el.classList.remove('in'); removeEventListener('keydown', this.onKey); setTimeout(() => this.el.remove(), 500); this.room.onReaderClosed(this); }
  save() { this.room.save(); }
  bookName() { const b = this.room.book; return b.pdfTitle || b.title; }
  render() {
    const P = this.part, R = this.el; R.innerHTML = ''; this._figs = null;   // figures may have been cut since the last render
    const head = el('header', { class: 'reader-head' }, [
      el('div', { class: 'reader-title' }, [el('div', { class: 'kicker', text: (P.subOf ? 'Sub-scroll' : 'Part ' + (this.room.partIndex(P) + 1)) + (P.startPage ? ` · pages ${P.startPage}–${P.endPage}` : '') }), el('h2', { text: P.title })]),
      // where the scroll sits (left / centre / right) and full screen; remembered in this browser
      el('div', { class: 'reader-dock', role: 'group', 'aria-label': 'Scroll position' }, [['left', '⇤', 'Dock left'], ['center', '↔', 'Centre'], ['right', '⇥', 'Dock right'], ['full', '⛶', 'Full screen (F)']].map(([k, t, l]) =>
        el('button', { class: 'ibtn dark tiny', 'data-dock': k, 'aria-label': l, title: l, text: t, onclick: () => this.dock(this.dockMode === k && k === 'full' ? this.lastDock || 'right' : k) }))),
      el('button', { class: 'ibtn dark', 'aria-label': 'Close the scroll', title: 'Close (Esc)', text: '✕', onclick: () => this.close() })]);
    this.dock((() => { try { return localStorage.getItem('scriptorium.readerDock') || 'right'; } catch (e) { return 'right'; } })(), true);
    this._dockKey = e => { if ((e.key === 'f' || e.key === 'F') && !(e.target.closest && e.target.closest('input,textarea,[contenteditable]'))) this.dock(this.dockMode === 'full' ? this.lastDock || 'right' : 'full'); };
    addEventListener('keydown', this._dockKey);
    const body = el('div', { class: 'reader-body' }); this.body = body;
    R.append(el('div', { class: 'rod' }), head, body, el('div', { class: 'rod' }));
    if (!P.analysis) { this.renderEmpty(); return; }
    body.append(this.analyseBar(true), this.renderChain(P.analysis));
  }
  renderEmpty() {
    const P = this.part, b = this.body;
    b.append(el('div', { class: 'empty' }, [
      el('h3', { html: '<span class="illum">T</span>his part is still sealed' }),
      el('p', { text: P.summary || 'Analyse it to rebuild the content as one logical chain: every definition, axiom and formula once, each step derived from the earlier ones, with showcases you can step into.' }),
      this.analyseBar(false)]));
  }
  analyseBar(compact) {
    const depth = el('select', { class: 'field small', 'aria-label': 'Depth' }, [el('option', { value: 'complete', text: 'Complete chain (length from content)' }), el('option', { value: 'essential', text: 'Essential chain (length from content)' }), el('option', { value: 'exact', text: 'Exact number of steps…' })]);
    const n = el('input', { type: 'number', class: 'field small num', min: 3, max: 80, value: 16, hidden: true, 'aria-label': 'Number of steps' });
    depth.onchange = () => { n.hidden = depth.value !== 'exact'; };
    const st = el('div', { class: 'status' });
    const go = el('button', { class: 'btn primary small', text: compact ? 'Re-analyse' : 'Analyse this part', onclick: () => this.analyse(depth.value, +n.value, st, go) });
    const pasted = el('button', { class: 'btn small', text: 'Paste JSON from another AI', onclick: () => this.pasteJSON() });
    return el('div', { class: 'analyse-bar' + (compact ? ' compact' : '') }, [el('div', { class: 'row wrap' }, [depth, n, go, pasted]), st]);
  }
  // ---------- the analysis pipeline (docs/PROTOCOL.md, "Recipe for any AI") ----------
  // 1 subsections (cached) → 2 PDF figures (cached) → 3 one structured call → 4 verify coverage →
  // 5 targeted follow-ups for the gaps only → 6 save. Nothing stored is ever recomputed or re-asked.
  async material(st) {
    const P = this.part, book = this.room.book, src = P.subOf ? (this.room.data.parts.find(x => x.id === P.subOf) || P) : P;
    if (!book.hasPdf) return { sections: null, figures: [] };
    const blob = await this.app.store.get('pdf:' + book.id); if (!blob) return { sections: null, figures: [] };
    // the prompts name the book by the PDF's own Title metadata when it has one (else the file name)
    if (book.pdfTitle == null && this.app.ingest.pdfTitle) { try { book.pdfTitle = await this.app.ingest.pdfTitle(blob) || ''; if (this.app.saveLib) this.app.saveLib(); } catch (e) { } }
    if (st) st.textContent = 'Reading the subsections…';
    // a sub-scroll expands one step: it shares its parent's figures but is not checked against the parent's subsections
    const sec = P.subOf ? { sections: null } : await cached(partKey('sections', book.id, src.id), () => this.app.ingest.partSections(blob, src));
    let figures = [];
    try { if (st) st.textContent = 'Cutting the figures out of the pages…'; figures = await cached(partKey('figs', book.id, src.id), () => this.app.ingest.extractFigures(blob, src.startPage || 1, src.endPage || src.startPage || 1, { onProgress: k => { if (st) st.textContent = 'Cutting the figures out of the pages… ' + Math.round(k * 100) + '%'; } })); } catch (e) { figures = []; }
    if (!src.figureIndex || src.figureIndex.length !== figures.length) { src.figureIndex = this.app.ingest.figureMeta(figures); this.save(); }
    if (!sec.sections && !P.text) { try { P.text = undefined; this._text = await this.app.ingest.partText(blob, P.startPage || src.startPage || 1, P.endPage || src.endPage || 1); } catch (e) { } }
    return { sections: sec.sections, figures, blob, src, text: this._text || '' };
  }
  async analyse(depth, n, st, go) {
    const P = this.part, book = this.room.book; go.disabled = true;
    try {
      const M = await this.material(st); let images = [], attached = [], pageImgs = 0, text = P.text || M.text || '';
      if (!M.sections && !text && book.hasPdf) st.textContent = 'The PDF for this book is not stored in this browser.';
      const thinText = M.sections && M.sections.reduce((a, s) => a + s.inventory.chars, 0) < 400;
      if (thinText && imageLimit() && M.blob) { images = await this.app.ingest.pageImages(M.blob, P.startPage || 1, P.endPage || 1, imageLimit()); pageImgs = images.length; }
      else if (imageLimit() && M.figures.length) { const pick = M.figures.filter(f => !/^Unlabelled/.test(f.label)).concat(M.figures.filter(f => /^Unlabelled/.test(f.label))).slice(0, Math.min(6, imageLimit())); images = pick.map(f => dataUrlBlob(f.dataUrl)); attached = pick.map(f => f.id); }
      const meta = this.app.ingest.figureMeta(M.figures), chapter = P.title + (P.startPage ? ` (pages ${P.startPage}-${P.endPage})` : '');
      const prompt = chapterPrompt({ book: this.bookName(), chapter, text, depth, n, images: attached.length, pageImages: pageImgs, sections: M.sections, figures: meta, attached });
      st.textContent = 'Claude is reading and planning. Long parts can take a minute or two.';
      const A = await askJSON(prompt, { images, tools: evidenceTools(), onTool: toolStatus(st), onText: t => { st.textContent = 'Writing the chain… ' + t.length.toLocaleString() + ' characters'; }, manualTitle: 'Analyse "' + P.title + '" in any AI' });
      if (!A || !Array.isArray(A.chain)) throw { code: 'invalid_json' };
      if (A._truncated && A.chain.length > 1) A.chain.pop();            // the last step of a cut-off answer is incomplete; follow-ups refill it
      P.analysis = normalizeChain(A); delete P.analysis._truncated;
      await this.checkAndFill(st, M, { auto: aiAvailable() });
      this.save(); this.room.refreshStation(P); toast('Chain written'); this.render();
      if (evidenceAvailable() && collectSources(P.analysis).length) this.verify();
    } catch (e) { go.disabled = false; st.textContent = errCopy(e); }
  }
  // verify coverage; with auto, write what is missing in as few calls as possible (≤ 100k characters of text each)
  async checkAndFill(st, M, { auto = true, rounds = 2 } = {}) {
    const P = this.part, A = P.analysis; M = M || await this.material(st);
    if (!M.sections) { A.coverageReport = null; return; }
    const meta = this.app.ingest.figureMeta(M.figures);
    const secMeta = M.sections.map(x => ({ id: x.id, title: x.title, level: x.level, startPage: x.startPage, endPage: x.endPage }));
    let rep = verifyChain(A, M.sections, meta); A.coverageReport = { ...rep, sections: secMeta, followUps: (A.coverageReport && A.coverageReport.followUps) || 0 };
    for (let r = 0; auto && r < rounds; r++) {
      const gaps = gapsOf(rep, M.sections, meta); if (!gaps.length) break;
      const batches = []; let cur = [], size = 0;
      gaps.forEach(g => { const s = M.sections.find(x => x.id === g.id), k = s ? s.text.length : 0; if (cur.length && size + k > 100000) { batches.push(cur); cur = []; size = 0; } cur.push(g); size += k; }); if (cur.length) batches.push(cur);
      for (const b of batches) {
        if (st) st.textContent = `Filling ${b.length} gap${b.length > 1 ? 's' : ''}: ${b.map(g => g.id).join(', ')}…`;
        const add = await askJSON(followUpPrompt({ book: this.bookName(), chapter: P.title, A, gaps: b, sections: M.sections, figures: meta }), { tools: evidenceTools(), onTool: st ? toolStatus(st) : null, onText: t => { if (st) st.textContent = 'Writing the missing steps… ' + t.length.toLocaleString() + ' characters'; }, manualTitle: 'Write the missing steps in any AI' });
        if (add && (Array.isArray(add.steps) || Array.isArray(add.chain))) { mergeFollowUp(A, { ...add, steps: normalizeChain({ chain: add.steps || add.chain }).chain }, M.sections); A.coverageReport.followUps = (A.coverageReport.followUps || 0) + 1; }
      }
      rep = verifyChain(A, M.sections, meta); A.coverageReport = { ...rep, sections: secMeta, followUps: A.coverageReport.followUps };
    }
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
    let text = ''; if (!M.sections && book.hasPdf) { try { const blob = await this.app.store.get('pdf:' + book.id); if (blob) text = await this.app.ingest.partText(blob, P.startPage || 1, P.endPage || 1, 60000); } catch (e) { } }
    try {
      const A = await manualRelay(chapterPrompt({ book: this.bookName(), chapter: P.title + (P.startPage ? ` (pages ${P.startPage}-${P.endPage})` : ''), text, depth: 'complete', sections: M.sections, figures: this.app.ingest.figureMeta(M.figures) }), 'Analyse "' + P.title + '" in any AI');
      if (!A || !Array.isArray(A.chain)) throw 0;
      P.analysis = normalizeChain(A); await this.checkAndFill(null, M, { auto: false }); this.save(); this.room.refreshStation(P); this.render(); toast('Chain imported');
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
  jump(id) { const t = this.el.querySelector(`[data-sid="${CSS.escape(id)}"]`); if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'center' }); t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash'); } }
  // ---------- chain ----------
  renderChain(A) {
    const wrap = el('div', { class: 'chain' });
    const arcs = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); arcs.setAttribute('class', 'arcs'); wrap.append(arcs);
    wrap.append(el('div', { class: 'chain-head' }, [el('h2', { html: mathHTML(A.title || this.part.title) }), A.summary ? el('p', { html: mathHTML(A.summary) }) : null, A.question ? el('p', { class: 'part-q', html: '<b>The question of this part.</b> ' + mathHTML(A.question) }) : null, A.sourceNote ? el('div', { class: 'srcnote', text: A.sourceNote }) : null]));
    wrap.append(this.evidenceBar(A)); const cov = this.renderCoverage(A); if (cov) wrap.append(cov); this.seen3D = new Map();
    this._breaks = new Set(A.coverageReport ? A.coverageReport.threadBreaks || [] : []); this._numbers = new Map(((A.coverageReport && A.coverageReport.numbers && A.coverageReport.numbers.unmatched) || []).map(u => [u.step, u.values]));
    this._secTitle = new Map(((A.coverageReport && A.coverageReport.sections) || []).map(x => [x.id, x.title]));
    (A.chain || []).forEach(st => wrap.append(this.renderStep(st, wrap, A)));
    if (A.references && A.references.length) wrap.append(el('section', { class: 'refs' }, [el('h3', { text: 'References' }), el('ol', {}, A.references.map(r => el('li', {}, [renderSource(r)])))]));
    // typeset only once the scroll has finished unrolling (MathJax measures sizes; a scaled container gives NaN)
    setTimeout(() => { if (wrap.isConnected) typeset(wrap).then(() => drawArcs(wrap)); }, 1000); setTimeout(() => drawArcs(wrap), 400);
    return wrap;
  }
  renderStep(st, wrap, A) {
    const kind = String(st.kind || 'result').toLowerCase();
    const art = el('article', { class: 'step k-' + kind, 'data-sid': st.id });
    art.append(el('div', { class: 'badge', text: KIND_ABBR[kind] || st.id }));
    if (st.answers) art.append(el('div', { class: 'q-in' + (this._breaks && this._breaks.has(st.id) ? ' broken' : ''), title: this._breaks && this._breaks.has(st.id) ? 'The previous step opened a different question' : 'The question this step settles' }, [el('span', { class: 'q-mark', text: 'Q' }), el('span', { html: mathHTML(st.answers) })]));
    art.append(el('div', { class: 'meta' }, [el('span', { class: 'kind', text: st.id + ' · ' + kind }), el('h4', { html: mathHTML(st.title) }),
      st.section ? el('span', { class: 'sec-chip', title: (this._secTitle && this._secTitle.get(st.section)) || 'Subsection of the PDF', text: '§ ' + st.section }) : null,
      st.ref || (st.pages && st.pages.length) ? el('span', { class: 'ref', text: [st.ref, st.pages && st.pages.length && !/p\.\s*\d/.test(st.ref || '') ? 'p. ' + st.pages.join(', ') : ''].filter(Boolean).join(' · ') }) : null]));
    if (st.from && st.from.length) { const f = el('div', { class: 'from' }, ['follows from ']); st.from.forEach((id, i) => { if (i) f.append(', '); f.append(el('a', { text: id, tabindex: 0, onclick: () => { const t = wrap.querySelector(`[data-sid="${CSS.escape(id)}"]`); if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'center' }); t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash'); } } })); }); art.append(f); }
    if (st.statement) art.append(el('p', { class: 'stmt', html: mathHTML(st.statement) }));
    if (st.math) art.append(el('div', { class: 'disp', html: '\\[' + esc(st.math) + '\\]' }));
    if (st.derivation && st.derivation.length) { const ol = el('ol', { class: 'deriv' }); st.derivation.forEach(d => { const ex = typeof d === 'string' ? d : d.expr; ol.append(el('li', {}, [el('div', { class: 'ex', html: '\\[' + esc(ex) + '\\]' }), d.why ? el('div', { class: 'why', html: esc(d.why) }) : null])); }); art.append(ol); }
    if (st.table && st.table.rows && st.table.rows.length) art.append(renderTable(st.table));
    if (st.figures && st.figures.length) art.append(this.renderFigures(st));
    if (st.extra && st.extra.length) art.append(el('div', { class: 'extras' }, st.extra.map(x => el('div', { class: 'extra' }, [el('span', { class: 'extra-badge', text: 'Added from outside the PDF' }), el('span', { html: ' ' + esc(x.what || '') }), x.source ? el('span', { class: 'extra-src' }, [' — ', renderSource(x.source)]) : el('span', { class: 'err', text: ' — no source given' })]))));
    if (this._numbers && this._numbers.has(st.id)) art.append(el('div', { class: 'num-warn', text: 'Not found in the PDF text of this subsection: ' + this._numbers.get(st.id).join(', ') + '. Check these numbers against the page.' }));
    if (st.terms && st.terms.length) art.append(el('dl', { class: 'terms' }, st.terms.flatMap(t => [el('dt', { html: mathHTML(t.term) }), el('dd', { html: mathHTML(t.meaning) })])));
    if (st.intuition) art.append(el('p', { class: 'intuition', html: '<b>Picture it.</b> ' + mathHTML(st.intuition) }));
    if (st.misconception) art.append(el('p', { class: 'miscon', html: '<b>Common mistake.</b> ' + mathHTML(st.misconception) }));
    if (st.check && st.check.q) { const ans = el('div', { class: 'ans', hidden: true, html: mathHTML(st.check.a || '') }); art.append(el('div', { class: 'check' }, [el('div', { html: '<b>Check yourself.</b> ' + mathHTML(st.check.q) }), el('button', { class: 'linkbtn', text: 'Show the answer', onclick: e => { ans.hidden = !ans.hidden; e.target.textContent = ans.hidden ? 'Show the answer' : 'Hide the answer'; if (!ans.hidden) typeset(ans); } }), ans])); }
    const srcBox = el('div', { class: 'sources' }); this.fillSources(st, srcBox); art.append(srcBox);
    if (st.bodies && st.bodies.length) art.append(el('div', { class: 'bodies' }, ['attached to', ...st.bodies.map(b => el('span', { class: 'chip', text: b }))]));
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
  // the PDF's own figures, captioned with their page; distinct from our drawings
  renderFigures(st) {
    const box = el('div', { class: 'pdf-figs' });
    this.figureStore().then(F => {
      st.figures.forEach(id => {
        const f = F.get(id); if (!f) return;
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
    const wrapDemo = node => { if (!node || node.tagName === 'SPAN') return node; const prov = demoProvenance(d); const purp = d.purpose ? el('div', { class: 'demo-purpose', html: '<b>This demo answers:</b> ' + mathHTML(d.purpose) }) : null; const less = Array.isArray(d.lessons) && d.lessons.some(l => l && l.question) ? el('ol', { class: 'lesson-thread' }, d.lessons.map(l => el('li', {}, [el('span', { class: 'lq', html: mathHTML(l.question || l.title || '') }), l.opens ? el('span', { class: 'lo', html: ' → ' + mathHTML(l.opens) }) : null]))) : null; return el('div', { class: 'demo-wrap' }, [purp, node, less, prov]); };
    return wrapDemo(this.renderDemoInner(d, st, i, demos));
  }
  renderDemoInner(d, st, i, demos) {
    const t = String(d.type || '').toLowerCase();
    if (SVG_TYPES.includes(t)) {
      const slot = el('div', { class: 'svg-slot', hidden: true }); let cleanup = null;
      const btn = el('button', { class: 'demo-btn svg', 'aria-expanded': 'false' }, [el('span', { class: 'ic', text: '◇' }), el('span', { text: d.title || t })]);
      btn.onclick = () => { const open = btn.getAttribute('aria-expanded') === 'true'; btn.setAttribute('aria-expanded', String(!open)); slot.hidden = open; if (open) { cleanup && cleanup(); slot.innerHTML = ''; } else { try { cleanup = SVGDEMO(d, slot, e => { slot.append(el('p', { class: 'err', text: String(e.message || e) })); }); } catch (e) { slot.append(el('p', { class: 'err', text: e.message })); } } };
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
        card.append(el('div', { class: 'sketch-empty' }, [el('div', { class: 'kicker', text: (d.technique || 'card') + ' diorama · not built yet' }), el('b', { text: d.title || 'Scene' }), el('p', { class: 'dim small', text: d.request || '' }),
          el('button', { class: 'btn primary small', text: 'Build this diorama with AI', onclick: async ev => { ev.target.disabled = true; try { const spec = await askJSON(authorPrompt(d, `${st.title}: ${st.statement || ''}${st.answers ? ' | the step answers: ' + st.answers : ''}${st.opens ? ' | and opens: ' + st.opens : ''}`), { tools: evidenceTools(), onTool: toolStatus(st2), onText: t => st2.textContent = 'Authoring… ' + t.length.toLocaleString() + ' characters', manualTitle: 'Author this diorama in any AI' }); const s = spec.spec || spec; if (!Array.isArray(s.bodies)) throw { code: 'invalid_json' }; s.type = 'scene'; s.technique = s.technique || d.technique || 'card'; s.title = s.title || d.title; Object.keys(d).forEach(k => delete d[k]); Object.assign(d, s); this.save(); this.room.refreshStation(this.part); fill(); } catch (e) { ev.target.disabled = false; st2.textContent = errCopy(e); } } }), st2]));
        return;
      }
      const img = el('img', { class: 'sketch', alt: 'Drawing of ' + (d.title || d.type) });
      const go = el('button', { class: 'btn primary small', text: 'Transition ▸', onclick: () => this.openDiorama(d, st, img) });
      card.append(el('div', { class: 'sketch-frame' }, [img, el('div', { class: 'sketch-loading', text: 'drawing…' })]),
        el('figcaption', {}, [el('div', {}, [el('div', { class: 'kicker', text: stage ? `stage of the diorama shown in ${stage.first} · numbered parts are this step's bodies` : (d.technique || d.style || 'card') + ' · ' + (d.type === 'scene' ? 'authored scene' : d.type) }), el('b', { text: d.title || d.type })]), el('div', { class: 'row' }, [
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
    if (!evidenceAvailable()) kids.push(el('span', { class: 'dim small', text: ' Connect OpenAlex, Consensus or PubMed in claude.ai to ground and verify sources.' }));
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
      el('div', { class: 'row end' }, [el('button', { class: 'btn', text: 'Cancel', onclick: () => box.remove() }), el('button', { class: 'btn primary', text: 'Add', onclick: () => { st.demos = st.demos || []; const d = { type: 'scene', title: (ta.value || st.title).slice(0, 70), technique: tech.value, request: ta.value || `Embody "${st.title}": ${st.statement || ''}` }; st.demos.push(d); box.remove(); demos.insertBefore(this.renderDemo(d, st, st.demos.length - 1, demos), demos.lastChild); this.save(); } })])])]);
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
export function normalizeChain(A) {
  const strs = a => Array.isArray(a) ? a.map(String) : a != null && a !== '' ? [String(a)] : [];
  A.chain = (A.chain || []).filter(x => x && typeof x === 'object').map((x, i) => ({ id: String(x.id || 'S' + (i + 1)), kind: String(x.kind || 'result'), title: String(x.title || ''), statement: String(x.statement || ''), math: x.math ? String(x.math) : '', derivation: Array.isArray(x.derivation) ? x.derivation : [], from: Array.isArray(x.from) ? x.from.map(String) : [], bodies: Array.isArray(x.bodies) ? x.bodies.map(String).slice(0, 8) : [], demos: Array.isArray(x.demos) ? x.demos.filter(d => d && d.type || (d && d.bodies)).slice(0, 8) : [],
    terms: Array.isArray(x.terms) ? x.terms.filter(t => t && t.term).slice(0, 16) : [], intuition: x.intuition ? String(x.intuition) : '', misconception: x.misconception ? String(x.misconception) : '',
    check: x.check && x.check.q ? { q: String(x.check.q), a: String(x.check.a || '') } : null, basis: x.basis ? String(x.basis) : '', sources: normSources(x.sources),
    // subchapter coverage, the question thread, provenance (docs/PROTOCOL.md)
    section: x.section != null ? String(x.section) : '', answers: x.answers ? String(x.answers) : '', opens: x.opens ? String(x.opens) : '',
    ref: x.ref ? String(x.ref) : '', pages: (Array.isArray(x.pages) ? x.pages : x.pages != null ? [x.pages] : []).map(Number).filter(n => isFinite(n)).slice(0, 12),
    figures: strs(x.figures).slice(0, 12), extra: normExtra(x.extra),
    table: x.table && Array.isArray(x.table.rows) ? { caption: String(x.table.caption || ''), columns: strs(x.table.columns), rows: x.table.rows.filter(Array.isArray).slice(0, 80).map(r => r.map(c => String(c ?? ''))) } : null }));
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
  const pos = {}; wrap.querySelectorAll('.step').forEach(a => { pos[a.dataset.sid] = a.offsetTop + 27; });
  const NS = 'http://www.w3.org/2000/svg'; const defs = document.createElementNS(NS, 'defs'); defs.innerHTML = '<marker id="ah" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8z" fill="#9c3a28"/></marker>'; svg.append(defs);
  [...wrap.querySelectorAll('.step')].forEach((a, k) => { const f = a.querySelector('.from'); if (!f) return; [...f.querySelectorAll('a')].forEach((ln, j) => { const y0 = pos[ln.textContent], y1 = pos[a.dataset.sid]; if (y0 == null || y1 == null) return; const depth = 6 + ((k + j) % 4) * 3.5; const p = document.createElementNS(NS, 'path'); p.setAttribute('d', `M 18 ${y0} C ${depth - 6} ${y0}, ${depth - 6} ${y1}, 16 ${y1 - 1}`); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'rgba(156,58,40,.55)'); p.setAttribute('stroke-width', '1.3'); p.setAttribute('marker-end', 'url(#ah)'); svg.append(p); }); });
}

function normSources(a) { return Array.isArray(a) ? a.filter(s => s && (s.title || s.doi)).slice(0, 30).map(s => ({ ...s, title: String(s.title || ''), doi: s.doi ? String(s.doi).replace(/^https?:\/\/(dx\.)?doi\.org\//i, '') : '' })) : []; }
export function renderSource(s) {
  const href = s.url || (s.doi ? doiUrl(s.doi) : s.openalex || '');
  const mark = s.verified === true ? el('span', { class: 'vmark ok', title: 'Found in OpenAlex' + (s.cited_by != null ? ` · cited ${s.cited_by.toLocaleString()} times` : ''), text: '✓' }) : s.verified === false ? el('span', { class: 'vmark bad', title: s.checkNote || 'Not found in OpenAlex: the reference may be garbled or invented. Check before relying on it.', text: s.check === 'uncertain' ? '?' : '✗' }) : el('span', { class: 'vmark', title: 'Not checked yet', text: '·' });
  const title = href ? el('a', { href, target: '_blank', rel: 'noopener', html: esc(s.title || s.matched || s.doi) }) : el('i', { html: esc(s.title) });
  return el('span', { class: 'src' }, [mark, ' ', s.authors ? String(s.authors) + ' ' : '', s.year ? '(' + s.year + ') ' : '', title, s.venue ? el('span', { class: 'dim', text: ' · ' + s.venue }) : null, s.matched && s.verified ? el('span', { class: 'dim small', text: ' — matched: ' + s.matched }) : null, s.note ? el('span', { class: 'note', text: ' — ' + s.note }) : null]);
}
