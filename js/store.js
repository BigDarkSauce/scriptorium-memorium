// Persistence: IndexedDB key-value store (library meta, per-book rooms, PDF blobs, sketch cache)
// Falls back to memory when IndexedDB is unavailable (private windows, previews, blocked storage), when opening it
// hangs, and for values that could not be written (quota exceeded): this session keeps working, and the viewer is told
// once that changes will not survive a reload.
const DB = 'scriptorium-memorium', OS = 'kv';   // (the database keeps the project's first name: renaming it would orphan every saved library)
let dbp = null, warned = false; const mem = new Map();
export const status = { persistent: null, error: null };
function warn(msg) { status.error = msg; if (warned) return; warned = true; try { import('./util.js').then(u => u.toast(msg, 6000)); } catch (e) { } console.warn(msg); }
function db() {
  if (dbp) return dbp;
  dbp = new Promise(res => {
    let done = false;
    const fin = (v, why) => {
      if (done) { if (v) try { v.close(); } catch (e) { } return; }   // too late: this session already runs in memory (never overwrite stored data with it)
      done = true; status.persistent = !!v; res(v);
      if (!v) warn(why === 'slow' ? 'The browser storage did not answer: changes made now are kept only until this page is closed.' : 'This browser is not keeping data for this page (private window or blocked storage): your library lasts until the page is closed.');
    };
    setTimeout(() => fin(null, 'slow'), 15000);   // some private modes never answer open()
    try {
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => { try { rq.result.createObjectStore(OS); } catch (e) { } };
      rq.onsuccess = () => { const d = rq.result; d.onversionchange = () => { try { d.close(); } catch (e) { } }; fin(d); };
      rq.onerror = () => fin(null);
    } catch (e) { fin(null); }
  });
  return dbp;
}
const quota = e => { const n = e && (e.name || (e.target && e.target.error && e.target.error.name)); return n === 'QuotaExceededError' || /quota/i.test(String(n || (e && e.message) || '')); };
async function tx(mode, fn) {
  const d = await db(); if (!d) return undefined;
  return new Promise((res) => {
    try {
      const t = d.transaction(OS, mode), s = t.objectStore(OS); const r = fn(s);
      t.oncomplete = () => res(r && 'result' in r ? r.result : undefined);
      const fail = ev => { const err = (ev && ev.target && ev.target.error) || t.error; if (quota(err)) warn('Storage is full: new changes are kept only until this page is closed. Export your library (Import / export) and free some space.'); res(undefined); };
      t.onerror = fail; t.onabort = fail;
    } catch (e) { if (quota(e)) warn('Storage is full: new changes are kept only until this page is closed.'); res(undefined); }
  });
}
// Save slots: each private scriptorium is its own set of keys. The first ("main") keeps the unprefixed keys every
// library before slots used; the others live under "slot:<id>/". Global keys (the slot list itself) bypass the prefix.
let P = '';
export let slot = 'main';
// (in memory-only mode the map IS the storage, every slot's keys prefixed: it is cleared only when IndexedDB holds the data)
export function useSlot(id) { flushSaves(); slot = id || 'main'; P = slot === 'main' ? '' : 'slot:' + slot + '/'; if (status.persistent) mem.clear(); }
const K = k => P + k;
export async function getGlobal(key) { const d = await db(); if (!d) return mem.get('§' + key); return new Promise(res => { try { const r = d.transaction(OS).objectStore(OS).get(key); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); } catch (e) { res(undefined); } }); }
export async function setGlobal(key, val) { mem.set('§' + key, val); return tx('readwrite', s => s.put(val, key)); }
export async function delGlobal(key) { mem.delete('§' + key); return tx('readwrite', s => s.delete(key)); }
// the global keys (outside every slot's prefix) that start with `prefix`
export async function globalKeys(prefix = '') {
  const local = [...mem.keys()].filter(k => String(k).startsWith('§' + prefix)).map(k => String(k).slice(1)), d = await db(); if (!d) return local;
  return new Promise(res => { try { const r = d.transaction(OS).objectStore(OS).getAllKeys(); r.onsuccess = () => res([...new Set([...r.result.map(String).filter(k => k.startsWith(prefix)), ...local])]); r.onerror = () => res(local); } catch (e) { res(local); } });
}
// delete a whole slot's keys (never the main slot's)
export async function dropSlot(id) { if (!id || id === 'main') return; const pre = 'slot:' + id + '/', d = await db(); if (!d) return; const all = await new Promise(res => { try { const r = d.transaction(OS).objectStore(OS).getAllKeys(); r.onsuccess = () => res(r.result); r.onerror = () => res([]); } catch (e) { res([]); } }); for (const k of all) if (String(k).startsWith(pre)) await tx('readwrite', s => s.delete(k)); }
// values written in this session win (they are the newest, and they survive a failed write)
export async function get(key) { return getRaw(K(key)); }
async function getRaw(key) {
  if (mem.has(key)) return mem.get(key);
  const d = await db(); if (!d) return undefined;
  return new Promise(res => { try { const r = d.transaction(OS).objectStore(OS).get(key); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); } catch (e) { res(undefined); } });
}
export async function set(key, val) { key = K(key); mem.set(key, val); return tx('readwrite', s => s.put(val, key)); }
export async function del(key) { key = K(key); mem.delete(key); deleted.add(key); return tx('readwrite', s => s.delete(key)); }
const deleted = new Set();
export async function keys(prefix = '') {
  const raw = await keysRaw(P + prefix); return raw.map(k => String(k).slice(P.length));
}
async function keysRaw(prefix) {
  const d = await db(); const local = [...mem.keys()].filter(k => String(k).startsWith(prefix));
  if (!d) return local;
  return new Promise(res => { try { const r = d.transaction(OS).objectStore(OS).getAllKeys(); r.onsuccess = () => res([...new Set([...r.result.filter(k => String(k).startsWith(prefix) && !deleted.has(k)), ...local])]); r.onerror = () => res(local); } catch (e) { res(local); } });
}
// Debounced savers keyed by name
const timers = {}, pending = new Map();
export function saveLater(key, getVal, ms = 500) { key = K(key); clearTimeout(timers[key]); pending.set(key, getVal); timers[key] = setTimeout(() => flushOne(key), ms); lastChange = Date.now(); }
function flushOne(key) { clearTimeout(timers[key]); delete timers[key]; const f = pending.get(key); pending.delete(key); if (!f) return; try { const v = structuredCloneSafe(f()); mem.set(key, v); tx('readwrite', s => s.put(v, key)).then(() => { savedAt = Date.now(); }); } catch (e) { console.warn('save', key, e); } }
let lastChange = 0, savedAt = 0;
export const saveState = () => ({ pending: pending.size, lastChange, savedAt });
// the page is going away (tab closed, switched away on a phone): write what is still waiting instead of losing it
export function flushSaves() { [...pending.keys()].forEach(flushOne); }
// autosave: whatever is still waiting is written every 2 s as well (a crash or a frozen tab loses at most that), and the
// browser is asked to keep this site's storage rather than evict it under pressure
if (typeof window !== 'undefined' && typeof setInterval === 'function') setInterval(() => { if (pending.size) flushSaves(); }, 2000);   // in the page only (a test importing this module must still exit)
try { if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) navigator.storage.persisted().then(p => p || navigator.storage.persist()).catch(() => { }); } catch (e) { }
if (typeof addEventListener === 'function') { addEventListener('pagehide', flushSaves); addEventListener('beforeunload', flushSaves); if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSaves(); }); }
export function structuredCloneSafe(v) { try { return structuredClone(v); } catch (e) { return JSON.parse(JSON.stringify(v)); } }
export function lsGet(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
export function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
// Per-part caches, so nothing is re-derived from the PDF or re-asked of an AI once stored:
//   sections:<bookId>:<partId>  the part's text split per subsection, with inventories (ingest.partSections)
//   figs:<bookId>:<partId>      the PDF's own figures cut from the pages: JPEG data URLs + label, caption, page
export const partKey = (kind, bookId, partId) => `${kind}:${bookId}:${partId}`;
export async function cached(key, make) { const v = await get(key); if (v != null) return v; const n = await make(); if (n != null) await set(key, n); return n; }
