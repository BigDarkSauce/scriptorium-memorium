// Scriptorium Memorium — boot, mode switching (library hub ↔ book room ↔ diorama), persistence, import/export.
import { Gfx } from './gfx/renderer.js';
import * as store from './store.js';
import * as ingest from './ai/ingest.js';
import { initAI } from './ai/claude.js';
import { initEvidence } from './ai/evidence.js';
import { Hub } from './hub/hub.js';
import { BookRoom } from './room/room.js';
import { DioramaView } from './dio/engine.js';
import { normalizeChain } from './room/reader.js';
import { legacyScrolls } from './seeds-legacy.js';
import { FLAGSHIPS } from './seeds-scenes.js';
import { groundChain } from './seeds-sources.js';
import { SCENE_SPEC, BUILTIN_TYPES, DIAGRAM_TYPES, CHAIN_FORMAT, chapterPrompt, authorPrompt, splitPrompt } from './ai/prompts.js';
import { el, $, uid, toast, sleep, clamp } from './util.js';

const LIB_KEY = 'library.v3';
class App {
  constructor() {
    this.canvas = $('#scene'); this.ui = $('#ui'); this.store = store; this.ingest = ingest;
    try { this.gfx = new Gfx(this.canvas); } catch (e) { this.fatal('WebGL is not available in this browser: ' + e.message); throw e; }
    this.mode = null; this.last = performance.now(); this.t = 0;
    initAI(); initEvidence();
  }
  fatal(msg) { const f = $('#fatal'); f.textContent = msg; f.style.display = 'block'; }
  async boot() {
    this.lib = await store.get(LIB_KEY);
    if (!this.lib || !this.lib.shelves) { this.lib = this.seedLibrary(); await store.set(LIB_KEY, this.lib); for (const [id, room] of this.seedRooms) await store.set('room:' + id, room); }
    await this.migrateV2();
    this.openHub();
    requestAnimationFrame(() => document.body.classList.add('ready'));
    this.loop();
  }
  // Scrolls written with Scriptorium v2 (same page, localStorage) become a book on the first bookcase.
  async migrateV2() {
    if (this.lib.migratedV2) return; let old = null; try { old = JSON.parse(localStorage.getItem('scriptorium.v2') || 'null'); } catch (e) { }
    this.lib.migratedV2 = true; this.saveLib(); if (!old || !Array.isArray(old.layers)) return;
    const parts = []; old.layers.forEach(L => (L.scrolls || []).forEach(sc => { if (sc.analysis && Array.isArray(sc.analysis.chain)) parts.push({ id: 'p-' + uid(), title: sc.title || sc.analysis.title || 'Scroll', summary: sc.analysis.summary || '', analysis: normalizeChain(sc.analysis), layer: L.name }); }));
    const mine = parts.filter(p => !/^Example scroll/.test(p.analysis.sourceNote || '')); if (!mine.length) return;
    const shelf = this.lib.shelves[0]; const n = this.lib.books.filter(b => b.shelf === shelf.id).length;
    const b = { id: 'bk-' + uid(), title: 'My earlier scrolls', shelf: shelf.id, tier: 2 - Math.floor(n / 17), slot: n % 17, color: '#9c3a28', icon: 'V2', hasPdf: false };
    this.lib.books.push(b); await store.set('room:' + b.id, { dims: { w: 12, d: 10, h: 5.5 }, parts: mine }); this.saveLib(); toast(`Your ${mine.length} earlier scroll(s) are on ${shelf.name} as "My earlier scrolls"`);
  }
  saveLib() { store.saveLater(LIB_KEY, () => this.lib, 300); }
  saveRoom(id, room) { store.saveLater('room:' + id, () => room, 400); }
  async loadRoom(id) {
    const r = (await store.get('room:' + id)) || { dims: { w: 12, d: 10, h: 5.5 }, parts: [] };
    // example rooms saved before grounding existed get their verified sources and teaching fields once
    const b = this.lib && this.lib.books.find(x => x.id === id);
    if (b && b.example && !r.grounded) { r.parts.forEach(p => { if (p.analysis) p.analysis = normalizeChain(groundChain(p.analysis)); }); r.grounded = 1; store.set('room:' + id, r); }
    return r;
  }
  // ---------- modes, with a warm fade between them ----------
  async switchMode(make) {
    const g = this.gfx.grade.uniforms.uFade;
    if (g.value < .99) { for (let k = g.value; k < 1; k += .08) { g.value = k; await sleep(16); } }
    g.value = 1;
    if (this.mode) { try { this.mode.dispose(); } catch (e) { console.warn(e); } this.mode = null; }
    this.gfx.outline.enabled = false; this.gfx.outline.selectedObjects = []; this.gfx.renderer.toneMappingExposure = .9; this.gfx.bloom.strength = .32;
    try { this.mode = await make(); } catch (e) { console.error(e); toast('Could not open: ' + e.message); this.mode = new Hub(this); }
    await sleep(60); for (let k = 1; k > 0; k -= .05) { g.value = k; await sleep(16); } g.value = 0;
  }
  openHub(opts = {}) { this.history = []; return this.switchMode(() => new Hub(this, opts)); }
  async openRoom(bookId, opts = {}) {
    const book = this.lib.books.find(b => b.id === bookId); if (!book) return this.openHub();
    const data = await this.loadRoom(bookId); this.currentRoom = bookId;
    return this.switchMode(() => new BookRoom(this, book, data, opts));
  }
  openDiorama(spec, opts = {}) {
    const back = opts.returnTo;
    const o = Object.assign({}, opts, { onExit: () => { if (back && back.room) this.openRoom(back.room, { openPart: back.part }); else this.openHub(); } });
    // keep the scroll image visible during the fade: the flight starts after the switch
    return this.switchMode(() => new DioramaView(this, spec, o));
  }
  loop() {
    requestAnimationFrame(() => this.loop());
    const now = performance.now(), dt = Math.min(.05, (now - this.last) / 1000); this.last = now; this.t += dt;
    if (this.mode) { try { this.mode.update(dt, this.t); } catch (e) { console.error(e); } }
    this.gfx.adapt(dt * 1000); this.gfx.render(dt, this.t);
  }
  // ---------- seed library: subject bookcases with example books and flagship dioramas ----------
  seedLibrary() {
    const L = legacyScrolls(); this.seedRooms = new Map();
    const lib = { v: 3, hub: { w: 18, d: 12, h: 7 }, shelves: [], books: [] };
    const W = lib.hub.w, D = lib.hub.d;
    const sh = (name, kind, x, z, rot, color) => { const s = { id: 'sh-' + uid(), name, kind, x, z, rot, color }; lib.shelves.push(s); return s; };
    const physics = sh('Physics', 'horizontal', -4.6, -D / 2 + .28, 0, '#8a2a1e');
    const maths = sh('Mathematics', 'horizontal', 4.6, -D / 2 + .28, 0, '#2d5b8e');
    const chem = sh('Chemistry', 'vertical', -W / 2 + .28, -2.2, Math.PI / 2, '#3f7d6e');
    const bio = sh('Biology', 'vertical', -W / 2 + .28, .2, Math.PI / 2, '#6a8a3a');
    const econ = sh('Economics & Statistics', 'vertical', W / 2 - .28, -2.2, -Math.PI / 2, '#8f733a');
    const earth = sh('Earth Science', 'vertical', W / 2 - .28, .2, -Math.PI / 2, '#2f6f8f');
    const slots = new Map();
    const book = (shelf, title, parts, icon = 'EX') => {
      const n = slots.get(shelf.id) || 0; slots.set(shelf.id, n + 1);
      const tiers = shelf.kind === 'horizontal' ? 3 : 6, per = shelf.kind === 'horizontal' ? 17 : 5;
      const eye = shelf.kind === 'horizontal' ? 2 : 3; // eye-level tier: scroll centres at 1.25 m (horizontal) / 1.59 m (vertical), then the tier below
      const b = { id: 'bk-' + uid(), title, shelf: shelf.id, tier: Math.max(0, Math.min(tiers - 1, eye - Math.floor(n / per))), slot: n % per, color: shelf.color, icon, hasPdf: false, example: true };
      lib.books.push(b); this.seedRooms.set(b.id, { dims: { w: 12, d: 10, h: 5.5 }, parts: parts.map(p => ({ id: 'p-' + uid(), ...p })) });
    };
    const asPart = s => ({ title: s.title, summary: s.analysis.summary, analysis: normalizeChain(groundChain(JSON.parse(JSON.stringify(s.analysis)))) });
    const scenePart = (spec, title, summary, steps) => ({ title, summary, analysis: normalizeChain(groundChain({ title, summary, sourceNote: 'Example diorama authored in the universal scene format (see docs/SCENE_SPEC.md).', chain: steps.map((s, i) => ({ id: 'S' + (i + 1), kind: s[0], title: s[1], statement: s[2], math: s[3] || '', from: i ? ['S' + i] : [], bodies: s[4] || [], demos: i === steps.length - 1 || s[5] ? [JSON.parse(JSON.stringify(spec))] : [] })) })), pedestal: { step: 'S' + steps.length, demo: 0 } });
    book(physics, 'Classical Mechanics', L[0].filter(s => /Pendulum|Projectiles|Five/.test(s.title)).map(asPart), 'PHY');
    book(earth, 'The Weather Glass', L[0].filter(s => /Weather/.test(s.title)).map(asPart), 'ATM');
    book(maths, 'Calculus & Linear Maps', L[1].map(asPart), 'MATH');
    book(chem, 'Collision Theory', L[2].map(asPart), 'CHEM');
    const [water, galton, market, osmo] = FLAGSHIPS;
    book(earth, 'The Water Cycle', [scenePart(water, 'The water cycle', 'Energy from the sun moves water from lake to cloud to mountain and back.', [
      ['definition', 'Evaporation', 'Molecules at the surface of liquid water that gain enough energy escape as vapour; the rate grows with heating.', '', ['lake', 'sun']],
      ['definition', 'Saturation', 'Air at a given temperature can hold at most a certain amount of water vapour; cooler air holds less.', '', ['air parcel']],
      ['result', 'Orographic rain', 'Wind forces moist air up a mountain slope; it expands, cools below saturation, and the excess condenses and falls as rain.', '', ['cloud', 'wind', 'mountains', 'rain']]])], 'H2O');
    book(econ, 'Probability & the Bell Curve', [scenePart(galton, 'Galton board', 'A bell curve made of coin flips.', [
      ['definition', 'Bernoulli trial', 'One random event with two outcomes: "right" with probability $p$, "left" with probability $1-p$.', '', ['peg', 'ball']],
      ['theorem', 'Binomial distribution', 'The number $K$ of right-bounces in $N$ independent trials satisfies $P(K=k)=\\binom{N}{k}p^k(1-p)^{N-k}$, with mean $Np$ and variance $Np(1-p)$.', 'P(K=k)=\\binom{N}{k}p^k(1-p)^{N-k}', ['bins']],
      ['result', 'Normal approximation', 'For large $N$ the binomial is close to a normal curve with the same mean and spread (de Moivre–Laplace, a case of the central limit theorem).', '', ['curve', 'bins']]])], 'STAT');
    book(econ, 'Markets', [scenePart(market, 'Supply and demand', 'How a market finds the price where buyers and sellers agree.', [
      ['definition', 'Demand', 'At each price $p$, the quantity $D(p)$ buyers want; it falls as $p$ rises because fewer buyers value the good above the price.', '', ['buyers']],
      ['definition', 'Supply', 'At each price $p$, the quantity $S(p)$ sellers offer; it rises with $p$ because more sellers cover their cost.', '', ['sellers']],
      ['result', 'Equilibrium', 'Price adjusts with excess demand, $\\dot p \\propto D(p)-S(p)$, and comes to rest where $D(p^*)=S(p^*)$.', '\\dot p = k\\,(D(p)-S(p))', ['price', 'stall', 'curves']]])], 'ECON');
    book(bio, 'Cell Membranes', [scenePart(osmo, 'Osmosis', 'Why water flows towards dissolved particles across a membrane.', [
      ['definition', 'Semi-permeable membrane', 'A barrier with pores that pass small solvent molecules (water) but not larger solute molecules.', '', ['membrane']],
      ['result', 'Osmosis', 'Water moves by diffusion across the membrane towards the side with more solute until the extra pressure there balances the flow.', '', ['water molecules', 'solute molecules']],
      ['theorem', 'Osmotic pressure', 'For dilute solutions the balancing pressure is $\\pi = cRT$ (van \'t Hoff), proportional to the solute concentration.', '\\pi = cRT', ['water levels']]])], 'BIO');
    return lib;
  }
  // ---------- universal import / export (any AI can produce these files) ----------
  portDialog(bookId) {
    const book = bookId && this.lib.books.find(b => b.id === bookId);
    const file = el('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    const out = (name, obj) => this.download(name, JSON.stringify(obj, null, 2));
    const box = el('div', { class: 'modal-veil' }, [el('div', { class: 'modal glass wide' }, [
      el('h3', { text: 'Import / export' }),
      el('p', { class: 'dim', text: 'Everything is plain JSON in one documented format (docs/PROTOCOL.md). Any AI (another Claude account, ChatGPT, Gemini) can produce a room from your PDF with the prompt pack, and you import the result here.' }),
      el('div', { class: 'row wrap' }, [
        el('button', { class: 'btn', text: 'Copy the prompt pack', onclick: async () => { try { await navigator.clipboard.writeText(this.promptPack(book)); toast('Prompt pack copied'); } catch (e) { toast('Clipboard blocked: use Download instead'); } } }),
        el('button', { class: 'btn', text: 'Download prompt pack', onclick: () => this.download('scriptorium-prompt-pack.md', this.promptPack(book)) }),
        book ? el('button', { class: 'btn', text: 'Export this room', onclick: async () => out(book.title.replace(/\W+/g, '-') + '.room.json', { format: 'scriptorium-room/1', book: { title: book.title, pages: book.pages || null }, room: await this.loadRoom(book.id) }) }) : null,
        el('button', { class: 'btn', text: 'Export whole library', onclick: async () => { const rooms = {}; for (const b of this.lib.books) rooms[b.id] = await this.loadRoom(b.id); out('scriptorium-library.json', { format: 'scriptorium-library/1', library: this.lib, rooms }); } }),
        el('button', { class: 'btn primary', text: 'Import JSON…', onclick: () => file.click() })]),
      el('div', { class: 'row end' }, [el('button', { class: 'btn', text: 'Close', onclick: () => box.remove() })]), file])]);
    file.onchange = async () => { try { const j = JSON.parse(await file.files[0].text()); await this.importJSON(j, bookId); box.remove(); } catch (e) { toast('Could not import: ' + e.message); } };
    document.body.append(box);
  }
  async importJSON(j, bookId) {
    if (j.format === 'scriptorium-library/1' && j.library) { this.lib = j.library; await store.set(LIB_KEY, this.lib); for (const id in (j.rooms || {})) await store.set('room:' + id, j.rooms[id]); toast('Library imported'); return this.openHub(); }
    const room = j.room || (j.parts ? j : null);
    if (room && Array.isArray(room.parts)) {
      room.parts.forEach(p => { p.id = p.id || 'p-' + uid(); if (p.analysis) normalizeChain(p.analysis); });
      if (bookId) { const cur = await this.loadRoom(bookId); room.dims = room.dims || cur.dims; await store.set('room:' + bookId, room); toast('Room imported'); return this.openRoom(bookId); }
      const shelf = this.lib.shelves[0]; const title = (j.book && j.book.title) || room.title || 'Imported book';
      const b = { id: 'bk-' + uid(), title, shelf: shelf.id, tier: 0, slot: this.lib.books.filter(x => x.shelf === shelf.id).length, color: shelf.color, icon: 'JSON', hasPdf: false };
      this.lib.books.push(b); this.saveLib(); await store.set('room:' + b.id, room); toast(`"${title}" added to ${shelf.name}`); return this.openHub();
    }
    if (j.chain) { toast('That is a single chain: open a scroll and use "Paste JSON from another AI".'); return; }
    if (j.type || j.bodies) { return this.openDiorama(j, {}); }
    throw new Error('Unrecognised JSON');
  }
  promptPack(book) {
    return `# Scriptorium Memorium — prompt pack
Use these prompts with any AI that can read your PDF. Paste each JSON answer back into the app (open a scroll → "Paste JSON from another AI", or Import JSON for a whole room).

## 1. Split the book into parts
${splitPrompt({ book: book ? book.title : '<book title>', pages: book && book.pages || '<n>', outline: '' })}

## 2. Analyse one part into a logical chain (repeat per part)
${chapterPrompt({ book: book ? book.title : '<book title>', chapter: '<part title, pages a–b>', text: '<paste the part text, or attach the PDF and name the pages>' })}

## 3. Author a 3D diorama for a step
${authorPrompt({ request: '<what the diorama must show>', technique: 'card' })}

## 4. A whole room in one go (optional)
Return {"format":"scriptorium-room/1","book":{"title":str,"pages":n},"room":{"parts":[{"title":str,"startPage":n,"endPage":n,"summary":str,"analysis":${CHAIN_FORMAT}}]}}
`;
  }
  async download(name, text) {
    try { const d = window.claude && await claude.use('downloads'); if (d) { await d.save({ filename: name, data: text }); return; } } catch (e) { if (e && e.code === 'declined') return; }
    try { const a = el('a', { href: URL.createObjectURL(new Blob([text], { type: 'application/json' })), download: name }); document.body.append(a); a.click(); a.remove(); } catch (e) { toast('Download blocked here: use Copy instead'); }
  }
}
const app = new App(); window.__scriptorium = app;
app.boot().catch(e => { console.error(e); app.fatal('Could not start: ' + e.message); });
