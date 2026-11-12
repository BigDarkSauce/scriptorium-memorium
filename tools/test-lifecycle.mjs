#!/usr/bin/env node
// Lifecycle bugs found in review, checked with fakes (no browser): node tools/test-lifecycle.mjs
//   store.js   memory-only mode (no IndexedDB): switching slots keeps the other library; global keys can be listed
//              and deleted (purgeBook sweeps a deleted book's AI pictures and readings, media:<kind>:<partId>:<step>)
//   share.js   a deleted book's pending re-upload is dropped, and never runs once the book left the library
//   bridge.js  a failing first poll cancels the request on the server; the abort listener is removed once it ends
let fail = 0; const ok = (c, s) => { console.log((c ? 'ok   ' : 'FAIL ') + s); if (!c) fail++; };

// ---- store.js without IndexedDB
const LS = new Map(); globalThis.localStorage = { getItem: k => LS.has(k) ? LS.get(k) : null, setItem: (k, v) => LS.set(k, String(v)), removeItem: k => LS.delete(k) };
globalThis.document = { createElement: () => ({ style: {}, children: [], append() { }, remove() { }, addEventListener() { }, classList: { add() { }, remove() { } }, setAttribute() { } }), body: { append() { } }, querySelector: () => null, getElementById: () => ({}), head: { append() { } } };
globalThis.requestAnimationFrame = f => setTimeout(f, 0);
globalThis.indexedDB = { open() { const rq = {}; setTimeout(() => rq.onerror && rq.onerror(new Error('none')), 0); return rq; } };
const store = await import('../js/store.js');
await store.set('library.v3', { books: ['main-book'] });
ok(store.status.persistent === false, 'store: runs in memory when IndexedDB fails');
store.useSlot('s2'); await store.set('library.v3', { books: ['other-book'] });
store.useSlot('main'); const back = await store.get('library.v3');
ok(back && back.books[0] === 'main-book', 'store: switching slots in memory-only mode keeps the main library');
store.useSlot('s2'); ok(((await store.get('library.v3')) || {}).books?.[0] === 'other-book', 'store: and the second slot keeps its own');
store.useSlot('main');
await store.setGlobal('media:image:p-1:S1', { b: 1 }); await store.setGlobal('media:audio:p-2:S1', { b: 2 }); await store.setGlobal('aic:x', 1);
const mk = await store.globalKeys('media:'); ok(mk.length === 2 && mk.includes('media:image:p-1:S1'), 'store: globalKeys lists the media keys only');
await store.delGlobal('media:image:p-1:S1'); ok((await store.getGlobal('media:image:p-1:S1')) === undefined && (await store.globalKeys('media:')).length === 1, 'store: delGlobal removes one global key');

// ---- share.js: republish timers
globalThis.window = { claude: null };
const S = await import('../js/share.js');
const realST = globalThis.setTimeout, realCT = globalThis.clearTimeout; let queued = null, cleared = [];
globalThis.setTimeout = (f, ms) => { if (ms === 8000) { queued = f; return 4242; } return realST(f, ms); };
globalThis.clearTimeout = h => { cleared.push(h); return realCT(h); };
let loads = 0; const book = { id: 'bk-pub', visibility: 'public', title: 'Shared' }, app = { lib: { books: [book], shelves: [] }, loadRoom: async () => { loads++; return { parts: [] }; } };
S.republishLater(app, book); ok(typeof queued === 'function', 'share: a public book queues a re-upload');
app.lib.books = []; await queued(); ok(loads === 0, 'share: the queued re-upload of a deleted book does nothing');
queued = null; app.lib.books = [book]; S.republishLater(app, book); cleared = []; S.cancelRepublish(book.id); ok(cleared.includes(4242), 'share: cancelRepublish clears the pending timer');
globalThis.setTimeout = realST; globalThis.clearTimeout = realCT;

// ---- bridge.js
const calls = []; let mode = 'throw';
const M = { async callTool(server, name, args) {
  calls.push(name);
  if (name === 'bridge_info') return { structuredContent: { name: 'scriptorium-free', version: '1.2.0', tools: [] } };
  if (name === 'http_start') return { structuredContent: { id: 'r1' } };
  if (name === 'http_cancel') return { structuredContent: { ok: true } };
  if (name === 'http_poll') { if (mode === 'throw') throw new Error('server went away'); return { structuredContent: { status: 200, done: true, text: 'hello', next: 5, headers: {} } }; }
} };
globalThis.window = { claude: { use: async k => k === 'mcp' ? M : null } }; globalThis.claude = globalThis.window.claude;
const B = await import('../js/ai/bridge.js');
const fakeSignal = () => { const L = new Set(); return { aborted: false, L, addEventListener: (t, f) => L.add(f), removeEventListener: (t, f) => L.delete(f) }; };
let sig = fakeSignal(), threw = false;
try { await B.bridgeFetch('https://api.example/v1/chat/completions', { method: 'POST', body: '{}', signal: sig }); } catch (e) { threw = true; }
await new Promise(r => realST(r, 10));
await new Promise(r => setTimeout(r, 400));   // calls to the extension are queued and spaced (the app's rate limit)
ok(threw && calls.includes('http_cancel'), 'bridge: a failing first poll cancels the upstream request');
ok(sig.L.size === 0, 'bridge: and its abort listener is gone');
mode = 'ok'; calls.length = 0; sig = fakeSignal();
const res = await B.bridgeFetch('https://api.example/v1/models', { signal: sig }); const txt = await res.text();
ok(res.status === 200 && txt === 'hello' && !calls.includes('http_cancel'), 'bridge: a normal answer streams through');
ok(sig.L.size === 0, 'bridge: the abort listener is removed once the answer has ended');

console.log(fail ? fail + ' failed' : 'all passed'); process.exit(fail ? 1 : 0);
