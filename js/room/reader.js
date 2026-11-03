// The reading scroll: a parchment overlay showing one part's logical chain. 3D showcases appear as 2D drawings
// (the real model seen through a long lens) with a Transition button that carries the camera into them.
import { el, esc, typeset, toast, uid, $, clamp } from '../util.js';
import { SVGDEMO, SVG_TYPES } from './diagrams.js';
import { renderSketch } from '../dio/engine.js';
import { DIO } from '../dio/models.js';
import { askJSON, errCopy, imageLimit } from '../ai/claude.js';
import { chapterPrompt, authorPrompt, detailPrompt } from '../ai/prompts.js';
import { evidenceTools, evidenceAvailable, evidenceServers, verifySources, collectSources, searchOpenAlex, evidenceErr, doiUrl } from '../ai/evidence.js';
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
  close() { this.el.classList.remove('in'); removeEventListener('keydown', this.onKey); setTimeout(() => this.el.remove(), 500); this.room.onReaderClosed(this); }
  save() { this.room.save(); }
  render() {
    const P = this.part, R = this.el; R.innerHTML = '';
    const head = el('header', { class: 'reader-head' }, [
      el('div', { class: 'reader-title' }, [el('div', { class: 'kicker', text: (P.subOf ? 'Sub-scroll' : 'Part ' + (this.room.partIndex(P) + 1)) + (P.startPage ? ` · pages ${P.startPage}–${P.endPage}` : '') }), el('h2', { text: P.title })]),
      el('button', { class: 'ibtn dark', 'aria-label': 'Close the scroll', title: 'Close (Esc)', text: '✕', onclick: () => this.close() })]);
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
  async analyse(depth, n, st, go) {
    const P = this.part, book = this.room.book; go.disabled = true; st.textContent = 'Reading the pages…';
    try {
      let text = P.text || '', images = [];
      if (!text && book.hasPdf) { const blob = await this.app.store.get('pdf:' + book.id); if (blob) { text = await this.app.ingest.partText(blob, P.startPage || 1, P.endPage || (P.startPage || 1) + 20); if (text.replace(/\s|\[page \d+\]/g, '').length < 400 && imageLimit()) images = await this.app.ingest.pageImages(blob, P.startPage || 1, P.endPage || 1, imageLimit()); } }
      const prompt = chapterPrompt({ book: book.title, chapter: P.title + (P.startPage ? ` (pages ${P.startPage}-${P.endPage})` : ''), text, depth, n, images: images.length });
      st.textContent = 'Claude is reading and planning. Long parts can take a minute or two.';
      const A = await askJSON(prompt, { images, tools: evidenceTools(), onTool: toolStatus(st), onText: t => { st.textContent = 'Writing the chain… ' + t.length.toLocaleString() + ' characters'; }, manualTitle: 'Analyse "' + P.title + '" in any AI' });
      if (!A || !Array.isArray(A.chain)) throw { code: 'invalid_json' };
      P.analysis = normalizeChain(A); this.save(); this.room.refreshStation(P); toast('Chain written'); this.render();
      if (evidenceAvailable() && collectSources(P.analysis).length) this.verify();
    } catch (e) { go.disabled = false; st.textContent = errCopy(e); }
  }
  async pasteJSON() {
    const { manualRelay } = await import('../ai/claude.js');
    const P = this.part, book = this.room.book;
    let text = ''; if (book.hasPdf) { try { const blob = await this.app.store.get('pdf:' + book.id); if (blob) text = await this.app.ingest.partText(blob, P.startPage || 1, P.endPage || 1, 60000); } catch (e) { } }
    try { const A = await manualRelay(chapterPrompt({ book: book.title, chapter: P.title, text, depth: 'complete' }), 'Analyse "' + P.title + '" in any AI'); if (!A || !Array.isArray(A.chain)) throw 0; P.analysis = normalizeChain(A); this.save(); this.room.refreshStation(P); this.render(); toast('Chain imported'); } catch (e) { if (e && e.code !== 'cancelled') toast('That JSON has no "chain"'); }
  }
  // ---------- chain ----------
  renderChain(A) {
    const wrap = el('div', { class: 'chain' });
    const arcs = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); arcs.setAttribute('class', 'arcs'); wrap.append(arcs);
    wrap.append(el('div', { class: 'chain-head' }, [el('h2', { html: esc(A.title || this.part.title) }), A.summary ? el('p', { html: esc(A.summary) }) : null, A.sourceNote ? el('div', { class: 'srcnote', text: A.sourceNote }) : null]));
    wrap.append(this.evidenceBar(A)); this.seen3D = new Map();
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
    art.append(el('div', { class: 'meta' }, [el('span', { class: 'kind', text: st.id + ' · ' + kind }), el('h4', { html: esc(st.title) })]));
    if (st.from && st.from.length) { const f = el('div', { class: 'from' }, ['follows from ']); st.from.forEach((id, i) => { if (i) f.append(', '); f.append(el('a', { text: id, tabindex: 0, onclick: () => { const t = wrap.querySelector(`[data-sid="${CSS.escape(id)}"]`); if (t) { t.scrollIntoView({ behavior: 'smooth', block: 'center' }); t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash'); } } })); }); art.append(f); }
    if (st.statement) art.append(el('p', { class: 'stmt', html: esc(st.statement) }));
    if (st.math) art.append(el('div', { class: 'disp', html: '\\[' + esc(st.math) + '\\]' }));
    if (st.derivation && st.derivation.length) { const ol = el('ol', { class: 'deriv' }); st.derivation.forEach(d => { const ex = typeof d === 'string' ? d : d.expr; ol.append(el('li', {}, [el('div', { class: 'ex', html: '\\[' + esc(ex) + '\\]' }), d.why ? el('div', { class: 'why', html: esc(d.why) }) : null])); }); art.append(ol); }
    if (st.terms && st.terms.length) art.append(el('dl', { class: 'terms' }, st.terms.flatMap(t => [el('dt', { html: esc(t.term) }), el('dd', { html: esc(t.meaning) })])));
    if (st.intuition) art.append(el('p', { class: 'intuition', html: '<b>Picture it.</b> ' + esc(st.intuition) }));
    if (st.misconception) art.append(el('p', { class: 'miscon', html: '<b>Common mistake.</b> ' + esc(st.misconception) }));
    if (st.check && st.check.q) { const ans = el('div', { class: 'ans', hidden: true, html: esc(st.check.a || '') }); art.append(el('div', { class: 'check' }, [el('div', { html: '<b>Check yourself.</b> ' + esc(st.check.q) }), el('button', { class: 'linkbtn', text: 'Show the answer', onclick: e => { ans.hidden = !ans.hidden; e.target.textContent = ans.hidden ? 'Show the answer' : 'Hide the answer'; if (!ans.hidden) typeset(ans); } }), ans])); }
    const srcBox = el('div', { class: 'sources' }); this.fillSources(st, srcBox); art.append(srcBox);
    if (st.bodies && st.bodies.length) art.append(el('div', { class: 'bodies' }, ['attached to', ...st.bodies.map(b => el('span', { class: 'chip', text: b }))]));
    const demos = el('div', { class: 'demos' });
    (st.demos || []).forEach((d, i) => demos.append(this.renderDemo(d, st, i, demos)));
    demos.append(el('div', { class: 'step-tools' }, [
      el('button', { class: 'linkbtn', text: '+ showcase', onclick: () => this.addShowcase(st, demos) }),
      el('button', { class: 'linkbtn', text: 'More detail → sub-scroll', onclick: () => this.moreDetail(st, A) }),
      evidenceAvailable() ? el('button', { class: 'linkbtn', text: 'Find sources', onclick: () => this.findSources(st, srcBox) }) : null]));
    art.append(demos);
    return art;
  }
  renderDemo(d, st, i, demos) {
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
          el('button', { class: 'btn primary small', text: 'Build this diorama with AI', onclick: async ev => { ev.target.disabled = true; try { const spec = await askJSON(authorPrompt(d, `${st.title}: ${st.statement || ''}`), { tools: evidenceTools(), onTool: toolStatus(st2), onText: t => st2.textContent = 'Authoring… ' + t.length.toLocaleString() + ' characters', manualTitle: 'Author this diorama in any AI' }); const s = spec.spec || spec; if (!Array.isArray(s.bodies)) throw { code: 'invalid_json' }; s.type = 'scene'; s.technique = s.technique || d.technique || 'card'; s.title = s.title || d.title; Object.keys(d).forEach(k => delete d[k]); Object.assign(d, s); this.save(); this.room.refreshStation(this.part); fill(); } catch (e) { ev.target.disabled = false; st2.textContent = errCopy(e); } } }), st2]));
        return;
      }
      const img = el('img', { class: 'sketch', alt: 'Drawing of ' + (d.title || d.type) });
      const go = el('button', { class: 'btn primary small', text: 'Transition ▸', onclick: () => this.openDiorama(d, st, img) });
      card.append(el('div', { class: 'sketch-frame' }, [img, el('div', { class: 'sketch-loading', text: 'drawing…' })]),
        el('figcaption', {}, [el('div', {}, [el('div', { class: 'kicker', text: stage ? `stage of the diorama shown in ${stage.first} · numbered parts are this step's bodies` : (d.technique || d.style || 'card') + ' · ' + (d.type === 'scene' ? 'authored scene' : d.type) }), el('b', { text: d.title || d.type })]), el('div', { class: 'row' }, [
          el('button', { class: 'btn small', text: 'Pedestal', title: 'Show this as the card model on the pedestal by this scroll', onclick: () => { this.part.pedestal = { step: st.id, demo: i }; this.save(); this.room.refreshStation(this.part); toast('Placed on the pedestal'); } }), go])]));
      img.addEventListener('click', () => this.openDiorama(d, st, img));
      requestAnimationFrame(() => renderSketch(this.app.gfx, d, 800, stage ? 420 : 500, stage || {}).then(url => {
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
    try { const r = await verifySources(A, (i, n) => { if (st) st.textContent = ` Checked ${i} of ${n}…`; }); this.save(); toast(`${r.ok} of ${r.checked} references found in OpenAlex`); this.render(); }
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
export function normalizeChain(A) {
  A.chain = (A.chain || []).filter(x => x && typeof x === 'object').map((x, i) => ({ id: String(x.id || 'S' + (i + 1)), kind: String(x.kind || 'result'), title: String(x.title || ''), statement: String(x.statement || ''), math: x.math ? String(x.math) : '', derivation: Array.isArray(x.derivation) ? x.derivation : [], from: Array.isArray(x.from) ? x.from.map(String) : [], bodies: Array.isArray(x.bodies) ? x.bodies.map(String).slice(0, 8) : [], demos: Array.isArray(x.demos) ? x.demos.filter(d => d && d.type || (d && d.bodies)).slice(0, 4) : [],
    terms: Array.isArray(x.terms) ? x.terms.filter(t => t && t.term).slice(0, 12) : [], intuition: x.intuition ? String(x.intuition) : '', misconception: x.misconception ? String(x.misconception) : '',
    check: x.check && x.check.q ? { q: String(x.check.q), a: String(x.check.a || '') } : null, basis: x.basis ? String(x.basis) : '', sources: normSources(x.sources) }));
  A.references = normSources(A.references);
  return A;
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
