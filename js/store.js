// Persistence: IndexedDB key-value store (library meta, per-book rooms, PDF blobs, sketch cache)
// Falls back to memory when IndexedDB is unavailable (private windows, previews, blocked storage), when opening it
// hangs, and for values that could not be written (quota exceeded): this session keeps working, and the viewer is told
// once that changes will not survive a reload.
const DB = 'scriptorium-memorium', OS = 'kv';
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
// values written in this session win (they are the newest, and they survive a failed write)
export async function get(key) {
  if (mem.has(key)) return mem.get(key);
  const d = await db(); if (!d) return undefined;
  return new Promise(res => { try { const r = d.transaction(OS).objectStore(OS).get(key); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); } catch (e) { res(undefined); } });
}
export async function set(key, val) { mem.set(key, val); return tx('readwrite', s => s.put(val, key)); }
export async function del(key) { mem.delete(key); deleted.add(key); return tx('readwrite', s => s.delete(key)); }
const deleted = new Set();
export async function keys(prefix = '') {
  const d = await db(); const local = [...mem.keys()].filter(k => String(k).startsWith(prefix));
  if (!d) return local;
  return new Promise(res => { try { const r = d.transaction(OS).objectStore(OS).getAllKeys(); r.onsuccess = () => res([...new Set([...r.result.filter(k => String(k).startsWith(prefix) && !deleted.has(k)), ...local])]); r.onerror = () => res(local); } catch (e) { res(local); } });
}
// Debounced savers keyed by name
const timers = {};
export function saveLater(key, getVal, ms = 500) { clearTimeout(timers[key]); timers[key] = setTimeout(() => { try { set(key, structuredCloneSafe(getVal())); } catch (e) { console.warn('save', key, e); } }, ms); }
export function structuredCloneSafe(v) { try { return structuredClone(v); } catch (e) { return JSON.parse(JSON.stringify(v)); } }
export function lsGet(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
export function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
// Per-part caches, so nothing is re-derived from the PDF or re-asked of an AI once stored:
//   sections:<bookId>:<partId>  the part's text split per subsection, with inventories (ingest.partSections)
//   figs:<bookId>:<partId>      the PDF's own figures cut from the pages: JPEG data URLs + label, caption, page
export const partKey = (kind, bookId, partId) => `${kind}:${bookId}:${partId}`;
export async function cached(key, make) { const v = await get(key); if (v != null) return v; const n = await make(); if (n != null) await set(key, n); return n; }
