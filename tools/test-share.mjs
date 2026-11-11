#!/usr/bin/env node
// "Make it visible to everyone" (js/share.js) against a mock of the Artifact database that, like the real one, hands
// back frozen documents: publishing, updating and making private again must copy before they change anything (the
// bug: "Cannot add property bk-…, object is not extensible"). node tools/test-share.mjs
const freeze = o => { if (o && typeof o === 'object') { Object.values(o).forEach(freeze); Object.freeze(o); } return o; };
const D = new Map();
const doc = path => ({ async get() { const v = D.get(path); return { exists: v !== undefined, data: () => freeze(JSON.parse(JSON.stringify(v ?? null))) }; }, async set(v) { D.set(path, JSON.parse(JSON.stringify(v))); }, async delete() { D.delete(path); } });
const db = { doc, collection: p => ({ async get() { return { docs: [...D.keys()].filter(k => k.startsWith(p + '/') && k.split('/').length === 2).map(k => ({ id: k.split('/')[1], data: () => freeze(JSON.parse(JSON.stringify(D.get(k)))) })) }; } }) };
const user = { id: async () => 'me', can: async () => true, profiles: async ids => Object.fromEntries(ids.map(i => [i, { name: i === 'me' ? 'Me' : 'Other' }])) };
globalThis.window = { claude: { use: async k => k === 'db' ? db : k === 'user' ? user : null } };
globalThis.document = { createElement: () => ({ style: {}, children: [], append() { }, remove() { }, addEventListener() { }, classList: { add() { }, remove() { } }, setAttribute() { } }), body: { append() { } } };
const S = await import('../js/share.js');
let fail = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };
const room = { parts: [{ id: 'p1', title: 'Supply and demand', analysis: { chain: [{ id: 'S1' }, { id: 'S2' }] } }] };
try { await S.publishBook({ id: 'bk-a', title: 'Markets', color: '#123456' }, room, { tags: ['economics'] }); ok(true, 'first scroll made visible'); } catch (e) { ok(false, 'first scroll made visible: ' + e.message); }
try { await S.publishBook({ id: 'bk-b', title: 'Optics' }, room, { tags: ['physics'] }); ok(true, 'a second scroll made visible (the index came back frozen)'); } catch (e) { ok(false, 'a second scroll: ' + e.message); }
try { await S.publishBook({ id: 'bk-a', title: 'Markets (revised)' }, room, { tags: ['economics'] }); ok(true, 'the shared copy updated'); } catch (e) { ok(false, 'update: ' + e.message); }
const L = await S.listShared(); ok(L.length === 2 && L.some(x => x.title === 'Markets (revised)' && x.steps === 2), 'both are listed on the shared shelf, with their stats');
const got = await S.fetchShared(L.find(x => x.id === 'bk-b')); ok(got.parts && got.parts[0].title === 'Supply and demand', 'a shared scroll can be fetched');
try { await S.unpublishBook('bk-a'); ok(true, 'made private again'); } catch (e) { ok(false, 'unpublish: ' + e.message); }
ok((await S.listShared()).length === 1 && ![...D.keys()].some(k => k.includes('bk-a')), 'its copy and chunks are gone');
console.log(fail ? fail + ' failed' : 'all passed'); process.exit(fail ? 1 : 0);
