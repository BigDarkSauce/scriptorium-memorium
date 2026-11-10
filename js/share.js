// Shared scrolls: a scroll (a book and its room of chapter scrolls) marked "visible to everyone" is copied to the
// artifact's shared database, where every viewer can find it ("Get scroll") and put a copy on their own bookcases.
//
//   pub/<user>                         one document per person: the index of what they share
//                                      { items: { <bookId>: { title, tags, shelf, parts, steps, dioramas, color, icon,
//                                        chunks, updated } }, updated }
//   pub/<user>/books/<bookId>/chunks/<k>  the room itself, as JSON text cut into ≤ 180 000-character pieces (a document
//                                      holds at most 256 KiB)
//
// Rules (declared with the page): everyone who can open the page reads pub/…; each person writes only their own
// pub/<own id> subtree; the artifact's owner can tidy any of it. Signed-out visitors, and Viewers or Commenters, read
// but cannot share (the platform gives them view level only). The PDF itself is never shared, only the analysis.
import { el, toast, uid, esc, mathHTML } from './util.js';

const CH = 180000;
let DB = null, USER = null, ME = null, tried = false;
async function caps() {
  if (tried) return { db: DB, user: USER, me: ME }; tried = true;
  try { const C = window.claude; if (C && C.use) { [DB, USER] = await Promise.all([C.use('db'), C.use('user')]); if (USER) ME = await USER.id(); } } catch (e) { console.warn('share', e); }
  return { db: DB, user: USER, me: ME };
}
export async function shareAvailable() { const c = await caps(); return { read: !!c.db, write: !!(c.db && c.me && (!c.user || (await c.user.can('data.write')) !== false)) }; }

// the tags a scroll is found by: the reader's own, its bookcase, the subject its titles suggest
export function autoTags(book, room, shelfName = '') {
  const t = new Set(), txt = [book.title, ...(room.parts || []).map(p => p.title)].join(' ').toLowerCase();
  [['physics', /physic|mechanic|orbit|pendul|gravit|optic|electr/], ['mathematics', /math|calcul|derivat|algebra|linear|geometr|harmon/], ['chemistry', /chem|molec|reaction|equilibri/], ['biology', /bio|cell|osmo|membran|anatom|gene/], ['earth science', /earth|weather|climate|water cycle|barometer/], ['statistics', /statist|probab|galton|bell|random/], ['economics', /econ|market|supply|demand|price/], ['history', /histor|war|empire|century/], ['philosophy', /philosoph|ethic|logic|mind/]].forEach(([k, re]) => { if (re.test(txt)) t.add(k); });
  if (shelfName) t.add(shelfName.toLowerCase());
  return [...t];
}
const statsOf = room => { const P = room.parts || []; let steps = 0, dio = 0; P.forEach(p => (((p.analysis || {}).chain) || []).forEach(s => { steps++; (s.demos || []).forEach(d => { if (d && (d.type === 'scene' || d.kind === '3d' || d.three)) dio++; }); })); return { parts: P.length, steps, dioramas: dio }; };
// a shared copy of a room: no PDF, no cached figures, no reading position
const clean = room => { const r = JSON.parse(JSON.stringify(room)); delete r.camera; delete r.lastPart; (r.parts || []).forEach(p => { delete p.read; delete p.progress; }); return r; };

export async function publishBook(book, room, { tags = [], shelfName = '' } = {}) {
  const { db, me } = await caps(); if (!db || !me) throw new Error('Sharing needs you to be signed in with permission to add to this page');
  const text = JSON.stringify(clean(room)), n = Math.ceil(text.length / CH), base = `pub/${me}/books/${book.id}`;
  for (let k = 0; k < n; k++) await db.doc(`${base}/chunks/${k}`).set({ d: text.slice(k * CH, (k + 1) * CH) });
  const idx = db.doc('pub/' + me), cur = await idx.get(), items = (cur.exists && cur.data().items) || {};
  // stale chunks past the new end are removed
  const old = items[book.id] && items[book.id].chunks || 0; for (let k = n; k < old; k++) await db.doc(`${base}/chunks/${k}`).delete().catch(() => { });
  items[book.id] = { title: String(book.title).slice(0, 200), tags: tags.slice(0, 12).map(s => String(s).slice(0, 40)), shelf: String(shelfName || '').slice(0, 80), ...statsOf(room), color: book.color || '', icon: book.icon || '', chunks: n, updated: Date.now() };
  await idx.set({ items, updated: Date.now() });
}
export async function unpublishBook(bookId) {
  const { db, me } = await caps(); if (!db || !me) return;
  const idx = db.doc('pub/' + me), cur = await idx.get(); if (!cur.exists) return; const items = cur.data().items || {}, n = (items[bookId] || {}).chunks || 0;
  for (let k = 0; k < n; k++) await db.doc(`pub/${me}/books/${bookId}/chunks/${k}`).delete().catch(() => { });
  delete items[bookId]; await idx.set({ items, updated: Date.now() });
}
// every shared scroll from every person, newest first
export async function listShared() {
  const { db, user, me } = await caps(); if (!db) return [];
  const snap = await db.collection('pub').get(), out = [];
  snap.docs.forEach(d => { const items = (d.data() || {}).items || {}; Object.entries(items).forEach(([id, it]) => out.push({ owner: d.id, id, mine: d.id === me, ...it })); });
  if (user && out.length) { try { const P = await user.profiles([...new Set(out.map(x => x.owner))]); out.forEach(x => { x.by = (P[x.owner] && P[x.owner].name) || ''; }); } catch (e) { } }
  return out.sort((a, b) => (b.updated || 0) - (a.updated || 0));
}
export async function fetchShared(it) {
  const { db } = await caps(); let s = '';
  for (let k = 0; k < it.chunks; k++) { const d = await db.doc(`pub/${it.owner}/books/${it.id}/chunks/${k}`).get(); if (!d.exists) throw new Error('This scroll is no longer shared'); s += d.data().d; }
  return JSON.parse(s);
}

// ---------- the "Get scroll" window ----------
export async function openGetScroll(app) {
  const veil = el('div', { class: 'modal-veil' }), box = el('div', { class: 'modal glass wide getscroll', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Get a shared scroll' });
  const q = el('input', { class: 'field', type: 'search', placeholder: 'Search titles, tags, bookcases, people…', 'aria-label': 'Search shared scrolls' });
  const chips = el('div', { class: 'gs-tags', role: 'group', 'aria-label': 'Filter by tag' }), list = el('div', { class: 'gs-list', role: 'list' }), status = el('div', { class: 'dim small', text: 'Looking along the shared shelf…' });
  const close = () => veil.remove();
  box.append(el('div', { class: 'gs-head' }, [el('h3', { text: 'Get a scroll' }), el('button', { class: 'ibtn', 'aria-label': 'Close', text: '×', onclick: close })]), el('p', { class: 'dim small', text: 'Scrolls other readers have made visible. Pick one, then choose where it goes on your bookcases: you get your own copy to read, edit and extend.' }), q, chips, status, list);
  veil.append(box); document.body.append(veil); veil.onclick = e => { if (e.target === veil) close(); }; q.focus();
  let all = [], on = new Set();
  try { all = await listShared(); } catch (e) { status.textContent = 'The shared shelf could not be read: ' + (e.message || e.code || e); return; }
  if (!(await shareAvailable()).read) { status.textContent = 'Shared scrolls appear when this page is opened in Claude, signed in.'; return; }
  const count = {}; all.forEach(x => (x.tags || []).forEach(t => { count[t] = (count[t] || 0) + 1; }));
  Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 24).forEach(([t, n]) => chips.append(el('button', { class: 'gs-chip', type: 'button', 'aria-pressed': 'false', text: `${t} · ${n}`, onclick: e => { on.has(t) ? on.delete(t) : on.add(t); e.target.setAttribute('aria-pressed', String(on.has(t))); show(); } })));
  const show = () => {
    const words = q.value.toLowerCase().split(/\s+/).filter(Boolean), L = all.filter(x => { const hay = [x.title, x.shelf, x.by, ...(x.tags || [])].join(' ').toLowerCase(); return words.every(w => hay.includes(w)) && [...on].every(t => (x.tags || []).includes(t)); });
    status.textContent = all.length ? `${L.length} of ${all.length} shared scroll${all.length > 1 ? 's' : ''}` : 'Nothing is shared yet. Mark one of your scrolls “visible to everyone” (its menu on the bookcase) to be the first.';
    list.innerHTML = '';
    L.slice(0, 200).forEach(x => list.append(el('button', { class: 'gs-item', role: 'listitem', type: 'button', onclick: () => take(x) }, [
      el('span', { class: 'gs-spine', style: `background:${/^#[0-9a-f]{3,8}$/i.test(x.color || '') ? x.color : '#8a2a1e'}` }),
      el('span', { class: 'gs-main' }, [el('b', { html: mathHTML(x.title || 'Untitled', 'label') }), el('span', { class: 'dim small', text: [x.by ? 'by ' + x.by : x.mine ? 'shared by you' : '', x.shelf, `${x.parts || 0} chapter scroll${x.parts === 1 ? '' : 's'}`, `${x.steps || 0} steps`, x.dioramas ? `${x.dioramas} diorama${x.dioramas > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ') }),
        el('span', { class: 'gs-itags' }, (x.tags || []).map(t => el('i', { text: t })))]),
      el('span', { class: 'gs-go', text: 'Add…' })])));
  };
  q.oninput = show; show();
  async function take(x) {
    let room; try { status.textContent = `Fetching “${x.title}”…`; room = await fetchShared(x); } catch (e) { status.textContent = e.message || String(e); return; }
    close(); app.addBookCopy({ title: x.title, color: x.color, icon: x.icon, room, from: { owner: x.owner, id: x.id }, verb: 'Put it there', heading: `Where should “${x.title}” go?` });
  }
}

// ---------- visibility of one of your scrolls ----------
export async function openVisibility(app, book) {
  const room = await app.loadRoom(book.id), sh = app.lib.shelves.find(s => s.id === book.shelf), can = await shareAvailable();
  const tags = el('input', { class: 'field', value: (book.tags || autoTags(book, room, sh ? sh.name : '')).join(', '), 'aria-label': 'Tags, separated by commas' });
  const vis = book.visibility === 'public', veil = el('div', { class: 'modal-veil' }), close = () => veil.remove();
  const go = async pub => { const T = tags.value.split(',').map(s => s.trim()).filter(Boolean); close();
    try { if (pub) { await publishBook(book, room, { tags: T, shelfName: sh ? sh.name : '' }); book.visibility = 'public'; book.tags = T; toast(`“${book.title}” is visible to everyone; your later changes follow it`); }
      else { await unpublishBook(book.id); book.visibility = 'private'; toast(`“${book.title}” is private again`); } app.saveLib(); }
    catch (e) { toast('Could not change its visibility: ' + (e.message || e.code || e), 6000); } };
  veil.append(el('div', { class: 'modal glass', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Visibility' }, [
    el('h3', { html: 'Visibility of “' + esc(book.title) + '”' }),
    el('p', { class: 'dim small', text: vis ? 'Visible to everyone who opens this page: they can find it under “Get scroll” and keep a copy. Its PDF is never shared, only the scrolls made from it.' : 'Private: only you have it. Making it visible puts a copy of its chapter scrolls (not the PDF) on the shared shelf, found by its tags.' }),
    can.write ? null : el('p', { class: 'warn small', text: 'Sharing needs this page open in Claude, signed in, with permission to add to it (the owner, an editor or a contributor).' }),
    el('label', { text: 'Tags (comma-separated: they speed up the search)' }), tags,
    el('div', { class: 'row end' }, [el('button', { class: 'btn', text: 'Cancel', onclick: close }), vis ? el('button', { class: 'btn', text: 'Update the shared copy', disabled: !can.write, onclick: () => go(true) }) : null, el('button', { class: 'btn primary', text: vis ? 'Make it private' : 'Make it visible to everyone', disabled: !can.write, onclick: () => go(!vis) })])]));
  document.body.append(veil); veil.onclick = e => { if (e.target === veil) close(); };
}
// a shared scroll follows its owner's changes (debounced: a burst of edits is one upload)
const timers = new Map();
export function republishLater(app, book) {
  if (!book || book.visibility !== 'public') return; clearTimeout(timers.get(book.id));
  timers.set(book.id, setTimeout(async () => { try { const room = await app.loadRoom(book.id), sh = app.lib.shelves.find(s => s.id === book.shelf); await publishBook(book, room, { tags: book.tags || [], shelfName: sh ? sh.name : '' }); } catch (e) { console.warn('republish', e); } }, 8000));
}

