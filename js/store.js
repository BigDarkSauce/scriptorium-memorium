// Persistence: IndexedDB key-value store (library meta, per-book rooms, PDF blobs, sketch cache)
// Falls back to memory when IndexedDB is unavailable (private windows, previews).
const DB = 'scriptorium-memorium', OS = 'kv';
let dbp = null; const mem = new Map();
function db() {
  if (dbp) return dbp;
  dbp = new Promise(res => {
    try {
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore(OS);
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => res(null);
      rq.onblocked = () => res(null);
    } catch (e) { res(null); }
  });
  return dbp;
}
async function tx(mode, fn) {
  const d = await db(); if (!d) return fn(null);
  return new Promise((res) => {
    try { const t = d.transaction(OS, mode), s = t.objectStore(OS); const r = fn(s); t.oncomplete = () => res(r && 'result' in r ? r.result : undefined); t.onerror = () => res(undefined); }
    catch (e) { res(fn(null)); }
  });
}
export async function get(key) {
  const d = await db(); if (!d) return mem.get(key);
  return new Promise(res => { try { const r = d.transaction(OS).objectStore(OS).get(key); r.onsuccess = () => res(r.result); r.onerror = () => res(mem.get(key)); } catch (e) { res(mem.get(key)); } });
}
export async function set(key, val) { mem.set(key, val); return tx('readwrite', s => s && s.put(val, key)); }
export async function del(key) { mem.delete(key); return tx('readwrite', s => s && s.delete(key)); }
export async function keys(prefix = '') {
  const d = await db(); if (!d) return [...mem.keys()].filter(k => k.startsWith(prefix));
  return new Promise(res => { try { const r = d.transaction(OS).objectStore(OS).getAllKeys(); r.onsuccess = () => res(r.result.filter(k => String(k).startsWith(prefix))); r.onerror = () => res([]); } catch (e) { res([]); } });
}
// Debounced savers keyed by name
const timers = {};
export function saveLater(key, getVal, ms = 500) { clearTimeout(timers[key]); timers[key] = setTimeout(() => set(key, structuredCloneSafe(getVal())), ms); }
export function structuredCloneSafe(v) { try { return structuredClone(v); } catch (e) { return JSON.parse(JSON.stringify(v)); } }
export function lsGet(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
export function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
