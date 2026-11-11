// "+ Add PDF scroll": a guided dialog.
//   1 the PDF        pick or drop a file; its outline (chapters, sections, or the sheets of an infographic) is read at once
//   2 the place      bookcase, row and place on the row (hub.listShelves / hub.highlightSlot live preview / hub.placeScroll),
//                    optionally hung on the bookcase front
//   3 the pages      from–to, or tick chapters in the detected outline
//   4 the breakdown  Complete chain · Essential chain · Exact number of steps (N for the whole range, spread over the parts)
//   5 the analysis   every part through js/ai/pipeline.js (chain → coverage → quality gate → figures → dioramas) with a
//                    progress list, Cancel, and Resume (also after a reload: unfinished jobs are offered again)
// The hub API is used when present (typeof checks) and replaced by the library's own fields when it is not.
import { el, toast, uid, esc } from '../util.js';
import { aiAvailable, engine } from '../ai/claude.js';
// who writes, as the dialog says it (the AI settings choose: js/ai/aipanel.js)
const engineLine = () => ({ claude: 'Your Claude writes each part', hybrid: 'Your Claude reads and plans each part, the free models write the rest', free: 'The free models write each part' })[engine()] || 'Your Claude writes each part';
import { evidenceAvailable } from '../ai/evidence.js';
import { runJob, saveJob, pendingJobs, allocateSteps, STAGES } from '../ai/pipeline.js';

const STAGE_LABEL = { chain: 'chain', coverage: 'coverage', gate: 'quality check', figures: 'figures', dioramas: 'dioramas', done: 'done' };
const RUN = { job: null, ctrl: null, listeners: new Set(), last: new Map() };   // one running job at a time (the chip shows it)

// ---- the hub, through its public API, with fallbacks
function shelvesOf(app, hub) {
  if (hub && typeof hub.listShelves === 'function') { try { const L = hub.listShelves(); if (Array.isArray(L)) return L.map(s => ({ caseId: s.caseId ?? s.id, title: s.title || s.name || 'Bookcase', kind: s.kind, rows: (s.rows || []).map(r => ({ row: r.row, label: r.label ?? r.row + 1, slots: (r.slots || []).map(x => ({ slot: x.slot, free: !!x.free, bookId: x.bookId })) })) })); } catch (e) { console.warn(e); } }
  // fallback: the library's own records (rows = tiers, places = slots)
  return (app.lib.shelves || []).map(s => { const so = hub && hub.shelfObjs && hub.shelfObjs.get(s.id), u = (so && so.userData) || { tiers: s.kind === 'horizontal' ? 3 : 6, slotsPerTier: s.kind === 'horizontal' ? 17 : 5 }; const used = new Map(app.lib.books.filter(b => b.shelf === s.id).map(b => [(b.tier || 0) + ':' + (b.slot || 0), b.id])); const rows = []; for (let t = u.tiers - 1; t >= 0; t--) rows.push({ row: t, label: u.tiers - t, slots: [...Array(u.slotsPerTier).keys()].map(j => ({ slot: j, free: !used.has(t + ':' + j), bookId: used.get(t + ':' + j) })) }); return { caseId: s.id, title: s.name, kind: s.kind, rows }; });
}
function preview(hub, P) {
  if (!hub) return null;
  if (typeof hub.highlightSlot === 'function') { try { return hub.highlightSlot(P ? P.caseId : null, P && P.row, P && P.slot, { hang: !!(P && P.hang), frame: true }); } catch (e) { console.warn(e); } }
  if (typeof hub.highlight === 'function' && hub.shelfObjs) hub.highlight(P ? hub.shelfObjs.get(P.caseId) : null);
  return null;
}
function place(app, hub, b, P) {
  if (hub && typeof hub.placeScroll === 'function') { try { const r = hub.placeScroll(b.id, { caseId: P.caseId, row: P.row, slot: P.slot, ...(P.hang ? { hang: true } : {}) }); if (r && r.ok) return r; } catch (e) { console.warn(e); } }
  // that bookcase is full (or gone): the first free place on any bookcase, never the taken one
  if (hub && typeof hub.freeSlot === 'function' && typeof hub.placeScroll === 'function' && !hub.disposed) {
    const shelves = (hub.lib && hub.lib.shelves) || app.lib.shelves || [], order = [...shelves.filter(s => s.id === P.caseId), ...shelves.filter(s => s.id !== P.caseId)];
    for (const hang of P.hang ? [true, false] : [false]) for (const s of order) {
      const fs = hub.freeSlot(s, hang); if (!fs) continue;
      try { const r = hub.placeScroll(b.id, { caseId: s.id, row: fs.tier, slot: fs.slot, ...(hang ? { hang: true } : {}) }); if (r && r.ok) return r; } catch (e) { console.warn(e); }
    }
    if (typeof hub.makeDefaultShelf === 'function') { try { const s = hub.makeDefaultShelf(), fs = hub.freeSlot(s), r = fs && hub.placeScroll(b.id, { caseId: s.id, row: fs.tier, slot: fs.slot }); if (r && r.ok) return r; } catch (e) { console.warn(e); } }
  }
  Object.assign(b, { shelf: P.caseId, tier: P.row, slot: P.slot });
  if (hub && typeof hub.addScrollObj === 'function' && !hub.disposed) { const o = hub.addScrollObj(b); if (o) { o.userData.arrive = 0; o.scale.setScalar(.01); } if (hub.refill) hub.refill(P.caseId); hub.glowDirty = true; }
  app.saveLib(); return { ok: true, caseId: P.caseId, row: P.row, slot: P.slot };
}
const hubOf = app => app.mode && app.mode.constructor && app.mode.constructor.name === 'Hub' ? app.mode : (app.mode && typeof app.mode.listShelves === 'function' ? app.mode : null);

// ---- the dialog
// the place on a bookcase (the add-PDF dialog's step 2, also used for duplicated and fetched scrolls): sets S.place
function placeUI(app, hub, S, shelfId) {
  const list = shelvesOf(app, hub);
  if (!list.length) return [el('p', { text: 'There is no bookcase yet: the scroll goes on a new one.' })];
  if (!S.place) { const s0 = list.find(s => s.caseId === shelfId) || list[0]; const r0 = s0.rows.find(r => r.slots.some(x => x.free)) || s0.rows[0]; const x0 = r0 && r0.slots.find(x => x.free); S.place = { caseId: s0.caseId, row: r0 ? r0.row : 0, slot: x0 ? x0.slot : 0, hang: false }; }
  const sel = el('select', { class: 'field', 'aria-label': 'Bookcase' }, list.map(s => el('option', { value: s.caseId, text: `${s.title} (${s.kind || ''}, ${s.rows.reduce((a, r) => a + r.slots.filter(x => x.free).length, 0)} free)`, selected: s.caseId === S.place.caseId })));
  const grid = el('div', { class: 'ap-grid', role: 'grid', 'aria-label': 'Rows and places' }), info = el('div', { class: 'dim small ap-info' });
  const hang = el('label', { class: 'ap-check' }, [el('input', { type: 'checkbox', checked: S.place.hang, onchange: e => { S.place.hang = e.target.checked; show(); } }), ' Hang it on the front of the bookcase (marks it important)']);
  const show = () => {
    const s = list.find(x => x.caseId === S.place.caseId) || list[0]; grid.innerHTML = '';
    // one line per row: its label, then its places in a strip that scrolls sideways when the row is longer than the
    // dialog (never wrapped onto an unlabelled second line); each place shows its number
    const strips = [];
    s.rows.forEach(r => { const strip = el('div', { class: 'ap-slots' }, r.slots.map(x => { const on = S.place.row === r.row && S.place.slot === x.slot; const b = el('button', { type: 'button', role: 'gridcell', class: 'ap-slot' + (x.free ? '' : ' taken') + (on ? ' on' : ''), title: x.free ? `Row ${r.label}, place ${x.slot + 1}` : 'Taken', 'aria-label': `Row ${r.label}, place ${x.slot + 1}${x.free ? '' : ', taken'}`, 'aria-selected': String(on), disabled: !x.free, 'data-row': r.row, 'data-slot': x.slot, text: String(x.slot + 1) }); b.onclick = () => { S.place = { ...S.place, row: r.row, slot: x.slot }; const k = strip.scrollLeft; show(); const ns = grid.querySelectorAll('.ap-slots')[s.rows.indexOf(r)]; if (ns) ns.scrollLeft = k; }; return b; }));
      strips.push(strip); grid.append(el('div', { class: 'ap-row', role: 'row' }, [el('span', { class: 'ap-rl', text: 'Row ' + r.label }), strip])); });
    // the chosen place is scrolled into its strip's view
    requestAnimationFrame(() => strips.forEach(st => { const on = st.querySelector('.ap-slot.on'); if (on && (on.offsetLeft < st.scrollLeft || on.offsetLeft + on.offsetWidth > st.scrollLeft + st.clientWidth)) st.scrollLeft = on.offsetLeft - st.clientWidth / 2 + on.offsetWidth / 2; }));
    const res = preview(hub, S.place); info.textContent = `Row ${(s.rows.find(r => r.row === S.place.row) || {}).label || ''}, place ${S.place.slot + 1}` + (res && res.free === false ? ' — taken, the nearest free place will be used' : '') + (S.place.hang ? ', hanging' : '') + (res && res.ok ? ' · marked by the glowing ghost scroll above' : '');
  };
  sel.onchange = () => { const s = list.find(x => x.caseId === sel.value); const r = s.rows.find(rr => rr.slots.some(x => x.free)) || s.rows[0]; const x = r && r.slots.find(y => y.free); S.place = { caseId: s.caseId, row: r ? r.row : 0, slot: x ? x.slot : 0, hang: S.place.hang }; show(); };
  sel.id = 'ap-case';
  show(); return [el('div', { class: 'ap-pick' }, [el('label', { class: 'ap-lab', for: 'ap-case', text: 'Bookcase' }), sel]), el('div', { class: 'ap-pick-head' }, [el('span', { class: 'ap-lab', text: 'Row and place' }), info]), grid, hang];
}
// a scroll arriving from elsewhere (a duplicate, or one fetched from the shared shelf): its bookcase and place are chosen
// here; onChoose receives place(b), which puts the new book record there (hub.placeScroll), and writes its room itself
export function choosePlace(app, { title = 'Where should it go?', verb = 'Put it there', hint = '', onChoose } = {}) {
  const hub = hubOf(app), S = { place: null }, veil = el('div', { class: 'modal-veil addpdf-veil' });
  const box = el('div', { class: 'modal glass wide addpdf', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  const close = () => { veil.remove(); preview(hub, null); };
  box.append(el('h3', { text: title }), hint ? el('p', { class: 'dim small', text: hint }) : null, ...placeUI(app, hub, S, null),
    el('div', { class: 'row end' }, [el('button', { class: 'btn', text: 'Cancel', onclick: close }), el('button', { class: 'btn primary', text: verb, onclick: async () => { const P = S.place; close(); await onChoose({ place: b => P ? place(app, hub, b, P) : (app.saveLib(), { ok: true }) }); } })]));
  veil.append(box); document.body.append(veil); veil.onclick = e => { if (e.target === veil) close(); };
}
export function openAddPdf(app, { hub = hubOf(app), shelfId = null, file = null } = {}) {
  const S = { file: null, split: null, title: '', place: null, from: 1, to: 1, picked: new Set(), level: 'complete', n: 24, dioramas: true, deep: false };
  const veil = el('div', { class: 'modal-veil addpdf-veil' }), box = el('div', { class: 'modal glass wide addpdf', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Add a PDF scroll' });
  veil.append(box); document.body.append(veil);
  const close = () => { preview(hub, null); veil.remove(); removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape' && !RUN.ctrl) close(); }; addEventListener('keydown', onKey);
  const body = el('div', { class: 'ap-body' }), steps = el('ol', { class: 'ap-steps' }), foot = el('div', { class: 'row end ap-foot' });
  box.append(el('h3', { text: 'Add a PDF scroll' }), steps, body, foot);
  const STEP = ['The PDF', 'Place', 'Pages', 'Breakdown', 'Analyse']; let at = 0;
  const go = k => { at = k; render(); };
  // The dialog sits at the bottom of the screen (its bottom edge never moves; js/hub/hub.js frameAt puts a framed place in
  // the upper third, "clear of a dialog at the bottom"), and its height eases from one step to the next instead of jumping.
  let hT = 0;
  function render() {
    const h0 = box.isConnected ? box.getBoundingClientRect().height : 0;
    steps.innerHTML = ''; STEP.forEach((t, k) => steps.append(el('li', { class: k === at ? 'on' : k < at ? 'done' : '', text: (k + 1) + ' · ' + t, 'data-step': k })));
    body.innerHTML = ''; foot.innerHTML = '';
    veil.classList.toggle('placing', at === 1); box.dataset.step = at;
    [stepFile, stepPlace, stepPages, stepBreakdown, stepRun][at]();
    clearTimeout(hT); box.style.transition = 'none'; box.style.height = '';
    const h1 = box.getBoundingClientRect().height, calm = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (h0 && Math.abs(h1 - h0) > 2 && !calm) {
      box.style.height = h0 + 'px'; void box.offsetHeight;
      box.style.transition = 'height .32s cubic-bezier(.2,.8,.2,1)'; box.style.height = h1 + 'px';
      hT = setTimeout(() => { box.style.transition = ''; box.style.height = ''; }, 360);
    } else box.style.transition = '';
  }
  const btn = (text, on, cls = '') => el('button', { class: 'btn ' + cls, type: 'button', text, onclick: on });
  const nav = (next, ok = true) => { foot.append(btn(at ? 'Back' : 'Cancel', () => at ? go(at - 1) : close())); if (next) { const b = btn(next, () => go(at + 1), 'primary'); b.disabled = !ok; b.dataset.next = '1'; foot.append(b); } };

  // 1 · the PDF (and unfinished analyses to resume)
  function stepFile() {
    const inp = el('input', { type: 'file', accept: 'application/pdf', hidden: true });
    const drop = el('div', { class: 'ap-drop', tabindex: 0, role: 'button', 'aria-label': 'Choose a PDF' }, [el('b', { text: S.file ? S.file.name : 'Choose a PDF, or drop it here' }), el('span', { class: 'dim small', text: S.split ? `${S.split.pages} pages · ${S.split.parts.length} parts found ${METHOD[S.split.method] || ''}` : 'Books, chapters, papers, slides and infographic handouts.' })]);
    drop.onclick = () => inp.click(); drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') inp.click(); };
    drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); const f = [...(e.dataTransfer.files || [])].find(x => /pdf$/i.test(x.type) || /\.pdf$/i.test(x.name)); if (f) take(f); };
    inp.onchange = () => { if (inp.files[0]) take(inp.files[0]); };
    const st = el('div', { class: 'status' }); body.append(drop, inp, st);
    pendingJobs(app).then(J => { if (!J.length || !box.isConnected || at !== 0) return; body.append(el('div', { class: 'ap-resume' }, [el('h4', { text: 'Unfinished analyses' }), ...J.map(j => el('div', { class: 'row' }, [el('span', { text: `${j.title || 'A book'}: ${j.parts.length} part${j.parts.length > 1 ? 's' : ''}, ${j.status === 'failed' ? 'stopped by an error' : 'paused'}` }), btn('Resume', () => { close(); showProgress(app, j, { resume: true }); }, 'small primary')]))])); });
    nav('Next', !!S.split);
    async function take(f) {
      S.file = f; S.split = null; drop.querySelector('b').textContent = f.name; st.textContent = 'Reading the outline…';
      try {
        const sp = await app.ingest.splitBook(f, { onProgress: k => { st.textContent = 'Reading the outline… ' + Math.round(k * 100) + '%'; } });
        S.split = sp; S.title = sp.title || f.name.replace(/\.pdf$/i, ''); S.from = 1; S.to = sp.pages; S.picked = new Set(sp.parts.filter(p => !p.front).map((p, i) => i));
        sp.parts.forEach((p, i) => { p._k = i; });
        st.textContent = ''; render();
      } catch (e) { st.textContent = 'Could not read this PDF: ' + (e.message || e); }
    }
  }
  // 2 · the place on a bookcase
  function stepPlace() { body.append(...placeUI(app, hub, S, shelfId)); nav('Next'); }
  // 3 · the pages: from–to, or chapters of the outline
  function stepPages() {
    const sp = S.split, from = el('input', { type: 'number', class: 'field small num', min: 1, max: sp.pages, value: S.from, 'aria-label': 'From page' }), to = el('input', { type: 'number', class: 'field small num', min: 1, max: sp.pages, value: S.to, 'aria-label': 'To page' });
    const tree = el('div', { class: 'ap-outline' }), sum = el('div', { class: 'dim small ap-sum' });
    const overl = p => p.endPage >= S.from && p.startPage <= S.to;
    const sync = (fromTree) => {
      if (fromTree) { const P = sp.parts.filter(p => S.picked.has(p._k)); if (P.length) { S.from = Math.min(...P.map(p => p.startPage)); S.to = Math.max(...P.map(p => p.endPage)); from.value = S.from; to.value = S.to; } }
      else S.picked = new Set(sp.parts.filter(p => !p.front && overl(p)).map(p => p._k));
      tree.querySelectorAll('input[data-k]').forEach(c => { c.checked = S.picked.has(+c.dataset.k); });
      const P = sp.parts.filter(p => S.picked.has(p._k)), subs = P.reduce((a, p) => a + (p.subsections || []).filter(s => s.endPage >= S.from && s.startPage <= S.to).length, 0);
      sum.textContent = `Pages ${S.from}–${S.to} · ${P.length} part${P.length === 1 ? '' : 's'} (one scroll each) · ${subs} subsections to cover`; const nx = foot.querySelector('[data-next]'); if (nx) nx.disabled = !P.length;
    };
    from.oninput = () => { S.from = Math.max(1, Math.min(+from.value || 1, sp.pages)); if (S.to < S.from) { S.to = S.from; to.value = S.to; } sync(false); };
    to.oninput = () => { S.to = Math.max(S.from, Math.min(+to.value || sp.pages, sp.pages)); sync(false); };
    sp.parts.forEach(p => { if (p.front) return; tree.append(el('details', { class: 'ap-part' }, [el('summary', {}, [el('input', { type: 'checkbox', 'data-k': p._k, 'aria-label': 'Analyse ' + p.title, onclick: e => e.stopPropagation(), onchange: e => { if (e.target.checked) S.picked.add(p._k); else S.picked.delete(p._k); sync(true); } }), el('span', { text: ' ' + p.title }), el('span', { class: 'dim small', text: ` · p. ${p.startPage}${p.endPage > p.startPage ? '–' + p.endPage : ''} · ${(p.subsections || []).length} subsections` })]), el('ul', {}, (p.subsections || []).map(s => el('li', { class: 'dim small', text: `${s.id} ${s.title} · p. ${s.startPage}` })))])); });
    body.append(el('p', { class: 'dim', text: `Outline ${METHOD[sp.method] || ''}. Tick the chapters to analyse, or type a page range.` }), el('div', { class: 'row' }, [el('label', { text: 'Pages from' }), from, el('label', { text: 'to' }), to, btn('All', () => { S.from = 1; S.to = sp.pages; from.value = 1; to.value = sp.pages; sync(false); }, 'small')]), tree, sum);
    nav('Next'); sync(true);
  }
  // 4 · the breakdown level
  function stepBreakdown() {
    // each choice is one row: the radio, then its title with the description under it (the same layout and type for all three)
    const radio = v => el('input', { type: 'radio', name: 'aplevel', value: v, id: 'aplevel-' + v, checked: S.level === v, onchange: () => { S.level = v; render(); } });
    const parts = chosenParts(), mk = (v, t, d) => el('label', { class: 'ap-level' + (S.level === v ? ' on' : ''), for: 'aplevel-' + v }, [radio(v), el('b', { class: 'ap-lt', text: t }), el('span', { class: 'ap-ld', text: d })]);
    const minN = parts.reduce((a, p) => a + Math.max(1, (p.subsections || []).length), 0); if (S.n < minN) S.n = minN;
    const N = el('input', { type: 'number', class: 'field small num', min: minN, max: 400, value: S.n, 'aria-label': 'Number of steps', disabled: S.level !== 'exact' });
    const alloc = el('span', { class: 'ap-alloc' });
    const showAlloc = () => { if (S.level !== 'exact') { alloc.textContent = ''; return; } const A = allocateSteps(parts.map((p, i) => ({ ...p, id: 'k' + i })), S.n); alloc.textContent = 'Spread over the parts: ' + parts.map((p, i) => `${p.title.slice(0, 28)} ${A['k' + i]}`).join(' · '); };
    N.oninput = () => { S.n = Math.max(minN, +N.value || minN); showAlloc(); };
    body.append(
      mk('complete', 'Complete chain', 'Every definition, rule, worked example, table, figure, code block and panel item gets its own explained step. Length from the content; never coarser than the PDF.'),
      mk('essential', 'Essential chain', 'The spine: at least one explained step per subsection, keeping everything later steps build on.'),
      el('div', { class: 'ap-level' + (S.level === 'exact' ? ' on' : ''), onclick: e => { if (S.level !== 'exact' && e.target.tagName !== 'INPUT') { S.level = 'exact'; render(); } } }, [radio('exact'), el('label', { class: 'ap-lt', for: 'aplevel-exact', text: 'Exact number of steps' }), el('span', { class: 'ap-ld' }, [N, ` for the whole range (at least ${minN}: one per subsection).`]), alloc]),
      el('label', { class: 'ap-check ap-deep' }, [el('input', { type: 'checkbox', checked: S.deep, onchange: e => { S.deep = e.target.checked; render(); } }), el('span', {}, [el('b', { text: 'Deepest dive' }), ' (with any of the three): written for a reader with no background who forgets and gets lost. Every claim, assumption, formula and symbol is taken apart down to the principles it rests on and rebuilt from them, step by step, saying why, how and what for. Longer and slower to write.'])]),
      el('label', { class: 'ap-check' }, [el('input', { type: 'checkbox', checked: S.dioramas, onchange: e => { S.dioramas = e.target.checked; } }), ' Build the dioramas each part needs (one per dynamic or spatial idea, more for complex parts)']),
      el('p', { class: 'dim small', text: aiAvailable() ? `${engineLine()}${evidenceAvailable() && engine() !== 'free' ? ', with your research connectors for sources and extra examples' : ''}; a quality check rewrites any step that pastes the PDF or does not explain, and every paragraph gets a figure.` : 'Claude is not reachable from this view: each part\'s prompt is shown for you to run in any AI and paste back; figures and dioramas are then completed here.' }));
    showAlloc(); nav('Next');
  }
  const chosenParts = () => { const sp = S.split; return app.ingest.restrictParts ? app.ingest.restrictParts(sp.parts.filter(p => S.picked.has(p._k)), S.from, S.to) : sp.parts.filter(p => S.picked.has(p._k)); };
  // 5 · create the book, place it, and run the analysis
  function stepRun() {
    const parts = chosenParts(), sh = shelvesOf(app, hub).find(s => s.caseId === (S.place && S.place.caseId));
    body.append(el('div', { class: 'ap-review' }, [
      el('div', {}, [el('b', { text: S.title }), el('span', { class: 'dim', text: ` · ${S.file.name}` })]),
      el('div', { class: 'dim small', text: `${sh ? sh.title + ', row ' + ((sh.rows.find(r => r.row === S.place.row) || {}).label || '') + ', place ' + (S.place.slot + 1) + (S.place.hang ? ', hanging' : '') : 'a new bookcase'} · pages ${S.from}–${S.to} · ${parts.length} part${parts.length === 1 ? '' : 's'} · ${S.level === 'exact' ? 'exactly ' + S.n + ' steps' : S.level + ' chain'}${S.deep ? ' · deepest dive' : ''}${S.dioramas ? ' · dioramas' : ''}` })]));
    foot.append(btn('Back', () => go(at - 1)), btn('Add without analysing', () => create(false)), btn('Add and analyse', () => create(true), 'primary'));
    async function create(analyse) {
      foot.querySelectorAll('button').forEach(b => { b.disabled = true; });
      const id = 'bk-' + uid(), shelf = app.lib.shelves.find(s => s.id === (S.place && S.place.caseId)) || app.firstShelf();
      const b = { id, title: S.title, shelf: shelf.id, tier: S.place ? S.place.row : 0, slot: S.place ? S.place.slot : 0, color: shelf.color, icon: 'PDF', hasPdf: true, added: Date.now(), size: S.file.size, pages: S.split.pages };
      try { await app.store.set('pdf:' + id, S.file); } catch (e) { toast('Could not store the PDF: ' + (e.message || e)); foot.querySelectorAll('button').forEach(x => { x.disabled = false; }); return; }
      app.lib.books.push(b);
      const P = parts.map(p => { const q = { id: 'p-' + uid(), ...p }; delete q._k; return q; });
      await app.store.set('room:' + id, { dims: { w: 12, d: 10, h: 5.5 }, parts: P, splitMethod: S.split.method, range: { from: S.from, to: S.to } });
      if (S.place) place(app, hub, b, S.place); else app.saveLib();
      app.saveLib(); toast(`"${b.title}" placed on ${shelf.name}`);
      if (app.sfx) app.sfx.play('unroll', { gain: .45 });
      if (!analyse) { close(); return; }
      const job = { bookId: id, title: b.title, parts: P.map(p => p.id), level: S.level, n: S.level === 'exact' ? S.n : null, alloc: S.level === 'exact' ? allocateSteps(P, S.n) : null, deep: !!S.deep, dioramas: S.dioramas, status: 'pending', range: { from: S.from, to: S.to } };
      await saveJob(app, job); close(); showProgress(app, job);
    }
  }
  if (file) { S.file = file; }
  render();
  return { close, state: S, go };
}
const METHOD = { outline: 'from the PDF bookmarks', headings: 'from the headings', contents: 'from the contents page', windows: 'in fixed page windows', sheets: '(each page is a sheet; its panels are the subsections)' };

// ---- the progress view (a dialog that can be closed into a chip; the job keeps running)
export function showProgress(app, job, { resume = false } = {}) {
  if (RUN.job && RUN.job.bookId !== job.bookId && RUN.ctrl) { toast('Another analysis is running; it continues in the corner.'); openPanel(app); return; }
  if (!RUN.ctrl) start(app, job);
  openPanel(app);
}
function start(app, job) {
  RUN.job = job; RUN.ctrl = new AbortController(); RUN.last = new Map(); emit();
  runJob(app, job, { signal: RUN.ctrl.signal, onProgress: p => { RUN.last.set(p.part.id, { ...(RUN.last.get(p.part.id) || {}), ...(p.stage ? { stage: p.stage } : {}), ...(p.status ? { status: p.status } : {}), title: p.part.title, index: p.index }); emit(); } })
    .then(() => { toast(`"${job.title}" is analysed: open its room to read the scrolls`); })
    .catch(e => { if (!(e && e.code === 'cancelled')) toast('The analysis stopped: ' + ((e && (e.message || e.code)) || e)); })
    .finally(() => { RUN.ctrl = null; emit(); });
}
const emit = () => RUN.listeners.forEach(f => { try { f(); } catch (e) { } });
function openPanel(app) {
  let veil = document.querySelector('.addpdf-progress'); if (veil) return;
  const job = RUN.job; if (!job) return;
  veil = el('div', { class: 'modal-veil addpdf-progress' }); const box = el('div', { class: 'modal glass wide addpdf', role: 'dialog', 'aria-label': 'Analysis progress' }); veil.append(box); document.body.append(veil);
  const list = el('ol', { class: 'ap-prog' }), bar = el('div', { class: 'ap-bar' }, [el('i')]), st = el('div', { class: 'status ap-status' }), foot = el('div', { class: 'row end' });
  box.append(el('h3', { text: 'Analysing “' + job.title + '”' }), bar, list, st, foot);
  const draw = async () => {
    if (!veil.isConnected) { RUN.listeners.delete(draw); return; }
    const data = await app.loadRoom(job.bookId).catch(() => null); const parts = job.parts.map(id => data && data.parts.find(p => p.id === id)).filter(Boolean);
    list.innerHTML = ''; let doneN = 0, cur = null;
    parts.forEach(p => { const live = RUN.last.get(p.id) || {}, stage = live.stage || (p.job && p.job.stage) || 'pending', si = STAGES.indexOf(stage); if (stage === 'done') doneN++; else if (!cur && RUN.ctrl && RUN.job.current === p.id) cur = live.status;
      list.append(el('li', { class: 'ap-pp' + (stage === 'done' ? ' done' : RUN.job.current === p.id && RUN.ctrl ? ' now' : '') }, [el('span', { class: 'ap-pt', text: p.title }), el('span', { class: 'ap-stages' }, STAGES.slice(0, 5).map((s, k) => el('span', { class: 'ap-stage' + (si > k || stage === 'done' ? ' ok' : si === k && RUN.ctrl && RUN.job.current === p.id ? ' run' : ''), text: STAGE_LABEL[s] })))])); });
    bar.firstChild.style.width = (parts.length ? doneN / parts.length * 100 : 0) + '%';
    st.textContent = RUN.ctrl ? (cur || 'Working…') : job.status === 'done' ? 'Done. Every part is analysed.' : job.status === 'paused' ? 'Paused. Resume to continue where it stopped.' : job.error ? 'Stopped: ' + job.error : '';
    foot.innerHTML = '';
    if (RUN.ctrl) foot.append(el('button', { class: 'btn', text: 'Cancel', onclick: () => { RUN.ctrl.abort(); } }));
    else if (job.status !== 'done') foot.append(el('button', { class: 'btn primary', text: 'Resume', onclick: () => { start(app, job); } }));
    else foot.append(el('button', { class: 'btn primary', text: 'Open the room', onclick: () => { veil.remove(); app.openRoom(job.bookId); } }));
    foot.append(el('button', { class: 'btn ghost', text: RUN.ctrl ? 'Continue in the corner' : 'Close', onclick: () => { veil.remove(); RUN.listeners.delete(draw); chip(app); } }));
  };
  RUN.listeners.add(draw); draw();
}
// the corner chip while a job runs (click: the progress view again)
function chip(app) {
  let c = document.querySelector('.ap-chip'); if (c) return;
  c = el('button', { class: 'ap-chip glass', type: 'button', onclick: () => { openPanel(app); } }); document.body.append(c);
  const upd = () => { if (!RUN.job) { c.remove(); RUN.listeners.delete(upd); return; } const n = RUN.job.parts.length, d = [...RUN.last.values()].filter(x => x.stage === 'done').length; c.textContent = RUN.ctrl ? `Analysing “${RUN.job.title.slice(0, 26)}” · ${d}/${n}` : RUN.job.status === 'done' ? `“${RUN.job.title.slice(0, 26)}” is ready` : `Analysis paused · ${d}/${n} · resume`; if (!RUN.ctrl && RUN.job.status === 'done') setTimeout(() => { c.remove(); RUN.listeners.delete(upd); }, 8000); };
  RUN.listeners.add(upd); upd();
}
// after a reload: offer unfinished analyses once
export async function offerResume(app) {
  try { const J = await pendingJobs(app); if (!J.length || RUN.job) return; const j = J[0]; RUN.job = j; RUN.last = new Map(); chip(app); } catch (e) { }
}
export const _addpdfState = RUN;   // for tests
// a book is being removed (js/hub/hub.js removeBook): stop its running analysis and forget its job
export function cancelJobFor(bookId) { if (!RUN.job || RUN.job.bookId !== bookId) return; if (RUN.ctrl) RUN.ctrl.abort(); RUN.job = null; RUN.last = new Map(); emit(); }
