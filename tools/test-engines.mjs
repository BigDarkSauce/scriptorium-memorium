#!/usr/bin/env node
// The three AI engines (js/ai/claude.js askJSON + js/ai/free.js router), with Claude and the free providers mocked:
// who answers in each mode and role, the stand-ins when one is at its limit, waiting for a reset, the validator, the
// cache. node tools/test-engines.mjs
const LS = new Map(); globalThis.localStorage = { getItem: k => LS.has(k) ? LS.get(k) : null, setItem: (k, v) => LS.set(k, String(v)), removeItem: k => LS.delete(k) };
globalThis.indexedDB = { open() { const rq = {}; setTimeout(() => rq.onerror && rq.onerror(new Error('none')), 0); return rq; } };
globalThis.document = { createElement: () => ({ style: {}, children: [], append() { }, remove() { }, addEventListener() { }, classList: { add() { }, remove() { } }, setAttribute() { } }), body: { append() { } }, querySelector: () => null, getElementById: () => ({}), head: { append() { } } };
globalThis.location = { origin: 'http://test' }; globalThis.requestAnimationFrame = f => setTimeout(f, 0);

let claudeMode = 'ok', claudeCalls = 0;
const SAMPLE = async (prompt, o) => { claudeCalls++; if (claudeMode === 'rate') throw { code: 'rate_limited' }; return { text: JSON.stringify({ by: 'claude', chain: [{ id: 'S1' }] }) }; };
SAMPLE.limits = async () => ({ images: { maxCount: 5 } });
// inside the Claude app the free providers are reached through the free-models extension (js/ai/bridge.js): an
// in-process stand-in for it serves the scripted providers below (tools/test-bridge.mjs runs the real one)
const jobs = new Map(); let jn = 0;
const BRIDGE = { async callTool(server, name, a) {
  if (server !== 'host:scriptorium-free') throw { code: 'server_not_connected' };
  if (name === 'bridge_info') return { payload: { name: 'scriptorium-free', version: 'test' } };
  if (name === 'http_start') { const id = 'j' + (++jn), J = { status: 0, headers: {}, text: '', done: false }; jobs.set(id, J);
    (async () => { try { const r = await globalThis.fetch(a.url, { method: a.method, headers: a.headers, body: a.body }); J.status = r.status; r.headers.forEach((v, k) => { J.headers[k] = v; }); J.text = await r.text(); } catch (e) { J.error = String(e); } J.done = true; })(); return { payload: { id } }; }
  if (name === 'http_poll') { const J = jobs.get(a.id); while (!J.done) await new Promise(r => setTimeout(r, 1)); return { payload: { status: J.status, headers: J.headers, text: J.text.slice(a.from || 0), next: J.text.length, done: true, error: J.error || null } }; }
  if (name === 'http_cancel') { jobs.delete(a.id); return { payload: { ok: true } }; }
} };
globalThis.window = { claude: { use: async n => n === 'sample' ? SAMPLE : n === 'mcp' ? BRIDGE : null } }; globalThis.claude = globalThis.window.claude;

// the free providers: OVH (no key) and Groq (key); behaviour per (provider, model) scripted by `script`
const script = {}; let fetches = 0;
const sse = (obj, raw) => new Response(new ReadableStream({ start(c) { const e = new TextEncoder(); c.enqueue(e.encode('data: ' + JSON.stringify({ choices: [{ delta: { content: raw ? obj : JSON.stringify(obj) } }] }) + '\n\n')); c.enqueue(e.encode('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n')); c.close(); } }), { status: 200, headers: { 'content-type': 'text/event-stream' } });
globalThis.fetch = async (url, o = {}) => {
  fetches++; const u = String(url);
  if (u.endsWith('/models')) { if (u.includes('ovh')) return Response.json({ data: [{ id: 'gpt-oss-120b' }, { id: 'Meta-Llama-3_3-70B-Instruct' }, { id: 'bge-m3' }] }); if (u.includes('groq')) return Response.json({ data: [{ id: 'openai/gpt-oss-120b' }, { id: 'llama-3.3-70b-versatile' }] }); return new Response('no', { status: 404 }); }
  const body = JSON.parse(o.body), who = (u.includes('ovh') ? 'ovh' : u.includes('groq') ? 'groq' : 'x') + '|' + body.model, s = script[who] || 'ok';
  if (s === 'rate') return new Response('{"error":"rate"}', { status: 429, headers: { 'retry-after': '1' } });
  if (s === 'day') return new Response('{"error":"Rate limit reached for requests per day (RPD)"}', { status: 429 });
  if (s === 'junk') return sse('Sure! Here is the answer you asked for.', true);
  if (s === 'nochain') return sse({ by: who });
  return sse({ by: who, chain: [{ id: 'S1' }] });
};
const C = await import('../js/ai/claude.js'), F = await import('../js/ai/free.js');
await C.initAI();
let fail = 0; const ok = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) fail++; };
const reset = () => { F.resetUsage(); Object.keys(script).forEach(k => delete script[k]); claudeMode = 'ok'; };
const P = n => 'request ' + n + ' ' + Math.random();   // never cached unless asked

// 1. Claude directs
F.saveSettings({ mode: 'claude', off: { llm7: true, pollinations: true } }); reset();
let v = await C.askJSON(P(1)); ok(v.by === 'claude', 'claude mode: Claude answers');
// 2. free only: the best free model (Groq not set up: OVH gpt-oss-120b)
F.saveSettings({ mode: 'free' });
v = await C.askJSON(P(2)); ok(v.by === 'ovh|gpt-oss-120b', 'free mode: the best free model answers (' + v.by + ')');
ok(F.candidates && (await F.candidates()).every(c => !/bge/.test(c.m)), 'embedding models are never candidates');
// 3. a key adds Groq; a 429 moves on to the next model
F.saveSettings({ keys: { groq: 'gsk_test' } }); script['ovh|gpt-oss-120b'] = 'rate'; script['groq|openai/gpt-oss-120b'] = 'rate';
v = await C.askJSON(P(3)); ok(/llama/i.test(v.by), 'free mode: models at their limit are skipped (' + v.by + ')');
// 4. a daily cap is remembered until midnight UTC
reset(); script['ovh|gpt-oss-120b'] = 'rate'; script['groq|openai/gpt-oss-120b'] = 'day'; await C.askJSON(P(4)); const u = JSON.parse(LS.get('sm-ai-use')); if (!Object.entries(u.cool).some(([k, t]) => k.startsWith('groq|openai/gpt-oss-120b') && new Date(t).getUTCHours() === 0 && t > Date.now())) console.log(JSON.stringify(u.cool)); ok(Object.entries(u.cool).some(([k, t]) => k.startsWith('groq|openai/gpt-oss-120b') && new Date(t).getUTCHours() === 0 && t > Date.now()), 'a per-day 429 cools the model until 00:00 UTC');
// 5. junk JSON → next model; a failed check is named once to the same model, then the next
reset(); script['ovh|gpt-oss-120b'] = 'junk'; script['groq|openai/gpt-oss-120b'] = 'junk';
v = await C.askJSON(P(5)); ok(v && v.chain, 'an answer that is not JSON goes to the next model (' + v.by + ')');
reset(); script['ovh|gpt-oss-120b'] = 'nochain'; script['groq|openai/gpt-oss-120b'] = 'nochain';
v = await C.askJSON(P(6), { validate: x => x.chain ? null : 'no chain' }); ok(v && v.chain, 'a validator failure moves on until a model passes (' + v.by + ')');
// 6. hybrid: director → Claude; Claude at its limit → free
F.saveSettings({ mode: 'hybrid' }); reset(); claudeCalls = 0;
v = await C.askJSON(P(7), { role: 'director' }); ok(v.by === 'claude', 'hybrid: the director\'s request goes to Claude');
claudeMode = 'rate'; v = await C.askJSON(P(8), { role: 'director' }); ok(v.by !== 'claude', 'hybrid: Claude at its limit → the free models take it (' + v.by + ')');
// 7. hybrid: worker → free; every free model at its limit → Claude
reset(); claudeCalls = 0; v = await C.askJSON(P(9), { role: 'worker' }); ok(v.by !== 'claude' && claudeCalls === 0, 'hybrid: the worker\'s request goes to the free models (' + v.by + ')');
for (const k of ['ovh|gpt-oss-120b', 'ovh|Meta-Llama-3_3-70B-Instruct', 'groq|openai/gpt-oss-120b', 'groq|llama-3.3-70b-versatile']) script[k] = 'day';
v = await C.askJSON(P(10), { role: 'worker' }); ok(v.by === 'claude', 'hybrid: every free model at its limit → Claude takes it');
// 8. free mode, all busy for a moment: it waits for the reset and then answers (never fails)
F.saveSettings({ mode: 'free' }); reset(); LS.delete('sm-ai-use');
for (const k of ['ovh|gpt-oss-120b', 'ovh|Meta-Llama-3_3-70B-Instruct', 'groq|openai/gpt-oss-120b', 'groq|llama-3.3-70b-versatile']) script[k] = 'rate';
let waited = ''; setTimeout(() => { Object.keys(script).forEach(k => delete script[k]); }, 1500);
const t0 = Date.now(); v = await C.askJSON(P(11), { onStatus: s => { if (/Waiting/.test(s)) waited = s; } }); ok(v && v.chain && waited, `free mode: all at their limit → waits for the reset, then answers (${((Date.now() - t0) / 1000).toFixed(1)} s; "${waited.slice(0, 70)}…")`);
// 9. cache: the same request twice costs one call
reset(); const q = 'the same request'; await C.askJSON(q); const f0 = fetches; v = await C.askJSON(q); ok(fetches === f0 && v.chain, 'an answer that passed is cached: the same request costs nothing the second time');
// 10. the engine's words and limits
F.saveSettings({ mode: 'free' }); ok(C.imageLimit() === 0, 'free mode without a vision model sends no images'); F.saveSettings({ mode: 'claude' }); ok(C.imageLimit() === 5, 'claude mode keeps Claude\'s image limit');
console.log(fail ? `${fail} failed` : 'all passed'); process.exit(fail ? 1 : 0);
