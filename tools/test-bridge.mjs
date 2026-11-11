#!/usr/bin/env node
// The free-model bridge (bridge/server/index.mjs + js/ai/bridge.js), end to end without the Claude app:
//   1. the MCP server over stdio: the handshake, its four read-only tools, what it refuses, a streamed answer, a 429
//      with its Retry-After, cancelling;
//   2. the page side inside a mocked Claude app: window.claude.use('mcp') is wired to the real server process, and
//      free.js routes a "Free models only" request through it to a mock OpenAI-compatible provider on localhost.
// node tools/test-bridge.mjs
import { spawn } from 'node:child_process'; import http from 'node:http'; import { fileURLToPath } from 'node:url';
const SERVER = fileURLToPath(new URL('../bridge/server/index.mjs', import.meta.url));
let fail = 0; const ok = (c, s) => { console.log((c ? 'ok   ' : 'FAIL ') + s); if (!c) fail++; };

// a provider: /models, a streamed chat answer (a JSON chain in five pieces), a busy model (429)
const srv = http.createServer((q, r) => {
  if (q.url.endsWith('/models')) { r.writeHead(200, { 'content-type': 'application/json', 'x-ratelimit-reset-requests': '2m' }); return r.end(JSON.stringify({ data: [{ id: 'm1' }] })); }
  if (!q.url.endsWith('/chat/completions')) { r.writeHead(404); return r.end(); }
  let b = ''; q.on('data', c => b += c); q.on('end', () => { const j = JSON.parse(b);
    if (j.model === 'busy') { r.writeHead(429, { 'retry-after': '7' }); return r.end('{"error":"rate"}'); }
    const parts = ['{"by":"bridge",', '"chain":[', '{"id":"S1"}', ']', '}']; r.writeHead(200, { 'content-type': 'text/event-stream' }); let k = 0;
    const t = setInterval(() => { if (k < parts.length) r.write('data: ' + JSON.stringify({ choices: [{ delta: { content: parts[k] } }] }) + '\n\n'); else { r.write('data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] }) + '\n\ndata: [DONE]\n\n'); r.end(); clearInterval(t); } k++; }, 120); });
}).listen(0);
const base = `http://localhost:${srv.address().port}/v1`;

// the server process and a JSON-RPC client for it
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path';
const HOME = mkdtempSync(join(tmpdir(), 'smb-')), APPDATA = join(HOME, 'AppData', 'Roaming'), FDIR = join(APPDATA, 'FreeLLMAPI'); mkdirSync(FDIR, { recursive: true });
// a FreeLLMAPI on this computer: its config names the port; its database holds an old key (left in a freed page) and the live one
const LIVE = 'freellmapi-' + 'a1'.repeat(24), OLD = 'freellmapi-' + 'b2'.repeat(24);
const fla = http.createServer((q, r) => { const ok = (q.headers.authorization || '') === 'Bearer ' + LIVE;
  if (q.url.startsWith('/v1/usage')) { r.writeHead(ok ? 200 : 401, { 'content-type': 'application/json' }); return r.end(ok ? '{"tokens":0}' : '{"error":"no"}'); }
  if (q.url.startsWith('/v1/models')) { r.writeHead(200, { 'content-type': 'application/json' }); return r.end(JSON.stringify({ data: q.url.includes('ready') ? [{ id: 'gemini-2.5-pro' }, { id: 'llama-3.3-70b' }] : [{ id: 'gemini-2.5-pro' }, { id: 'llama-3.3-70b' }, { id: 'x' }] })); }
  r.writeHead(404); r.end(); }).listen(0);
writeFileSync(join(FDIR, 'config.json'), JSON.stringify({ port: fla.address().port }));
writeFileSync(join(FDIR, 'freeapi.db'), Buffer.concat([Buffer.from('SQLite format 3\0 ... settings unified_api_key '), Buffer.from(OLD), Buffer.from(' ... '), Buffer.from(LIVE), Buffer.alloc(64)]));
const p = spawn(process.execPath, [SERVER], { env: { ...process.env, HOME, USERPROFILE: HOME, APPDATA } }); let buf = '', n = 0; const wait = new Map();
p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); const f = wait.get(m.id); if (f) { wait.delete(m.id); f(m); } } });
const rpc = (method, params) => new Promise(res => { const id = ++n; wait.set(id, res); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
const tool = async (name, args) => { const m = await rpc('tools/call', { name, arguments: args }); return m.result.isError ? { err: m.result.content[0].text } : m.result.structuredContent; };

// 1. the server
const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } }); ok(init.result && init.result.serverInfo.name === 'scriptorium-free', 'server: initialize');
p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
const L = await rpc('tools/list', {}); ok(L.result.tools.length === 7 && L.result.tools.filter(t => !t.annotations.readOnlyHint).map(t => t.name).join() === 'vault_set', 'server: seven tools, all read-only but vault_set (no confirm per request in the app)');
ok((await tool('vault_get', {})) === null, 'vault: empty at first');
const vs = await tool('vault_set', { data: { keys: { groq: 'gsk_x' }, mode: 'hybrid' } }); ok(vs.ok && /\.scriptorium/.test(vs.path), 'vault: keeps the settings in ~/.scriptorium');
const vg = await tool('vault_get', {}); ok(vg && vg.keys.groq === 'gsk_x' && vg.mode === 'hybrid' && vg.savedAt > 0, 'vault: reads them back (they survive any new version of the app)');
const fd = await tool('freellmapi_detect', {}); ok(fd.found && fd.key === LIVE && fd.candidates === 2 && fd.readyModels === 2 && fd.catalogModels === 3 && fd.base.endsWith(':' + fla.address().port + '/v1'), 'FreeLLMAPI: found by its config\'s port, the live unified key picked out of two, 2 of 3 models ready');
ok((await tool('http_start', { url: 'https://example.com/' })).err, 'server: refuses an address that is not an LLM endpoint');
ok((await tool('http_start', { url: 'http://example.com/v1/models' })).err, 'server: refuses plain http outside this computer');
let s = await tool('http_start', { url: base + '/models' }), r = await tool('http_poll', { id: s.id, wait_ms: 5000 }); while (!r.done) r = await tool('http_poll', { id: s.id, wait_ms: 5000, have_status: true });
ok(r.status === 200 && JSON.parse(r.text).data[0].id === 'm1' && r.headers['x-ratelimit-reset-requests'] === '2m', 'server: GET /models with the provider\'s headers');
s = await tool('http_start', { url: base + '/chat/completions', method: 'POST', body: JSON.stringify({ model: 'busy' }) }); r = await tool('http_poll', { id: s.id, wait_ms: 5000 }); while (!r.done) r = await tool('http_poll', { id: s.id, from: r.next, wait_ms: 5000, have_status: true });
ok(r.status === 429 && r.headers['retry-after'] === '7', 'server: a 429 comes back with its Retry-After');
s = await tool('http_start', { url: base + '/chat/completions', method: 'POST', body: JSON.stringify({ model: 'x' }) }); await tool('http_cancel', { id: s.id }); ok((await tool('http_poll', { id: s.id })).err, 'server: cancel stops and forgets a request');

// 2. the page inside a mocked Claude app
const LS = new Map(); globalThis.localStorage = { getItem: k => LS.has(k) ? LS.get(k) : null, setItem: (k, v) => LS.set(k, String(v)), removeItem: k => LS.delete(k) };
globalThis.indexedDB = { open() { const rq = {}; setTimeout(() => rq.onerror && rq.onerror(new Error('none')), 0); return rq; } };
globalThis.document = { createElement: () => ({ style: {}, children: [], append() { }, remove() { }, addEventListener() { }, classList: { add() { }, remove() { } }, setAttribute() { } }), body: { append() { } }, querySelector: () => null, getElementById: () => ({}), head: { append() { } } };
globalThis.location = { origin: 'https://artifact.test' }; globalThis.requestAnimationFrame = f => setTimeout(f, 0);
let calls = 0, direct = 0; const realFetch = globalThis.fetch; globalThis.fetch = (...a) => { direct++; return Promise.reject(new TypeError('blocked by the Artifact\'s rules')); };
const MCP = { async callTool(server, name, args) { calls++; if (server !== 'host:scriptorium-free') throw { code: 'server_not_connected' }; const m = await rpc('tools/call', { name, arguments: args }); if (m.result.isError) throw { code: 'tool_error', message: m.result.content[0].text }; return { payload: m.result.structuredContent }; } };
globalThis.window = { claude: { use: async k => k === 'mcp' ? MCP : null } }; globalThis.claude = globalThis.window.claude;
const F = await import('../js/ai/free.js'), C = await import('../js/ai/claude.js'); await C.initAI();
F.saveSettings({ mode: 'free', on: { custom: true }, bases: { custom: base }, models: { custom: 'm1' }, off: { ovh: true, llm7: true, pollinations: true } });
ok(F.via() === 'bridge', 'page: inside the Claude app requests go through the bridge');
ok(await F.reachable({ fresh: true }), 'page: the installed extension is found (bridge_info)');
{ await tool('vault_set', { data: { keys: { groq: 'gsk_x' }, mode: 'free', on: { custom: true }, bases: { custom: base }, models: { custom: 'm1' }, off: { ovh: true, llm7: true, pollinations: true }, at: Date.now() + 5000 } });   /* the newest copy is the one on this computer (the browser's were cleared) */
  const keep = LS.get('sm-ai'); LS.delete('sm-ai'); const r = await F.restoreSettings(); const S = F.settings(); ok(r === 'restored' && S.keys.groq === 'gsk_x', 'page: keys come back from the file on this computer when the browser kept none (a cleared browser, a new version)'); if (keep) LS.set('sm-ai', keep); }
{ const d = await F.autoFreeLLMAPI(); const S = F.settings(); ok(d && d.found && S.on.freellmapi && S.keys.freellmapi === LIVE, 'page: FreeLLMAPI connected by itself (switched on, its address and unified key set)');
  const L = await F.models(F.PROVIDERS.find(p => p.id === 'freellmapi'), { fresh: true }); ok(L[0].id === 'gemini-2.5-pro' && L.some(m => m.id === 'auto:smart'), 'page: FreeLLMAPI\'s ready models, best first, then its own auto:smart (' + L.map(m => m.id).join(', ') + ')');
  F.saveSettings({ on: { custom: true }, off: { ovh: true, llm7: true, pollinations: true } }); }
let seen = ''; const v = await C.askJSON('a request ' + Math.random(), { onText: t => { seen = t; } });
ok(v && v.by === 'bridge' && v.chain && v.chain.length === 1 && direct === 0, `page: "Free models only" answered through the bridge, streamed (${calls} tool calls, no direct fetch)`);
ok(seen.length > 20, 'page: the answer streamed into onText as it arrived');
// the hybrid with no extension: the free side is out of reach, so Claude takes the worker's request
MCP.callTool = async () => { throw { code: 'server_not_connected' }; }; await F.reachable({ fresh: true });
F.saveSettings({ mode: 'hybrid' }); const SAMPLE = async () => ({ text: '{"by":"claude","chain":[{"id":"S1"}]}' }); SAMPLE.limits = async () => ({}); window.claude.use = async k => k === 'sample' ? SAMPLE : k === 'mcp' ? MCP : null;
ok(!F.hasAny(), 'page: without the extension the free models count as out of reach');
console.log(fail ? fail + ' failed' : 'all passed'); p.kill(); srv.close(); fla.close(); process.exit(fail ? 1 : 0);
