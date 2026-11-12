#!/usr/bin/env node
// Scriptorium free models — a tiny MCP server (stdio) that makes the app's free-model requests from your own computer.
//
// WHY. Inside the Claude app the Scriptorium page may not contact outside addresses (an Artifact's page is sandboxed), so
// the free LLM APIs it uses in "Claude + free models" and "Free models only" were out of reach there. An Artifact *can*
// call an MCP server running on the viewer's own computer (its `mcp` capability, server "host:scriptorium-free"). This
// server is that: the page hands it a request to an OpenAI-compatible endpoint (Groq, Gemini, OVHcloud, …), the
// server makes it with Node's own fetch (no browser rules: NVIDIA NIM, GitHub Models, SambaNova and Cloudflare are
// reachable too) and hands the answer back in pieces as it streams in.
//
// TOOLS (all read-only: they change nothing on this computer)
//   bridge_info                                   version, Node version, what it will call
//   http_start  {url, method?, headers?, body?}   starts one request; returns {id}
//   http_poll   {id, from?, wait_ms?}             the response so far: {status, headers, text (from `from`), done, error}
//                                                 (waits up to wait_ms, at most 20 s, for something new: few calls)
//   http_cancel {id}                              stops a request
//   vault_get                                     the AI settings kept on this computer (keys, choices) or null
//   vault_set   {data}                            keeps them (~/.scriptorium/ai-settings.json): keys survive every new
//                                                 version of the app and a cleared browser (the one tool that writes)
//   http_start also takes body_b64 (a binary upload: the audio sent for transcription) and binary: true (the answer
//   comes back base64: a generated image or a spoken reading); media: 'image' lets a GET fetch a picture a generator
//   returned as a link (https, any path; refused unless the answer really is an image)            (1.2)
//   freellmapi_detect                             finds FreeLLMAPI on this computer: its port (desktop app 31415, Docker
//                                                 or npm 3001; its own config.json) and its unified key (read from its
//                                                 local database, checked against the live server)
// The request runs on here between polls, so an answer that takes minutes never meets the Claude app's per-call time
// limit (about 130 s).
//
// WHAT IT WILL CALL. Only LLM-API-shaped addresses: https URLs whose path ends in /models or /chat/completions (any
// provider, so a new free tier or your own endpoint works), and anything on this computer (localhost, 127.0.0.1:
// FreeLLMAPI, Ollama, LM Studio). Nothing else, so it cannot be used to fetch arbitrary pages.
//
// No dependencies: Node 18+ (Claude Desktop ships its own). The MCP stdio transport is newline-delimited JSON-RPC 2.0.
import { createInterface } from 'node:readline';
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const VERSION = '1.2.0', NAME = 'scriptorium-free';
const jobs = new Map(); let seq = 0;
const MAX_TEXT = 4e6, MAX_BIN = 24e6, SLICE = 1.5e6, KEEP_MS = 10 * 60e3;

function allowed(u, media) {
  let x; try { x = new URL(u); } catch (e) { return 'not a URL'; }
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(x.hostname);
  if (local) return /^https?:$/.test(x.protocol) ? null : 'only http(s)';
  if (x.protocol !== 'https:') return 'only https outside this computer';
  if (media === 'image') return null;   // a picture a generator returned as a link: checked to be an image when it arrives
  if (!/\/(models|chat\/completions)\/?$/.test(x.pathname)) return 'only /models and /chat/completions addresses';
  return null;
}

function start({ url, method = 'GET', headers = {}, body, body_b64, binary = false, media } = {}) {
  if (media && media !== 'image') throw new Error('Refused: unknown media kind');
  if (media === 'image' && method !== 'GET') throw new Error('Refused: a picture link is only fetched');
  const why = allowed(url, media); if (why) throw new Error('Refused: ' + why);
  const id = 'r' + (++seq) + '-' + Date.now().toString(36), ctl = new AbortController();
  const J = { id, status: 0, headers: {}, text: '', done: false, error: null, at: Date.now(), ctl, waiters: [], binary: !!binary || !!media };
  const wake = () => { const w = J.waiters.splice(0); w.forEach(f => f()); };
  jobs.set(id, J);
  (async () => {
    try {
      const h = { ...headers }; delete h.Origin; delete h.origin;
      const b = body_b64 != null ? Buffer.from(String(body_b64), 'base64') : body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body);
      const r = await fetch(url, { method, headers: h, body: b, signal: ctl.signal });
      if (media === 'image' && r.ok && !/^image\//i.test(r.headers.get('content-type') || '')) { ctl.abort(); throw new Error('not an image'); }
      J.status = r.status; r.headers.forEach((v, k) => { J.headers[k] = v; }); if (!J.binary || !r.ok) wake();
      if (r.body) {
        const rd = r.body.getReader();
        if (J.binary && r.ok) {   // bytes: gathered whole, then handed over as base64 in slices
          const parts = []; let n = 0;
          for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); n += value.length; if (n > MAX_BIN) { ctl.abort(); throw new Error('answer too large'); } J.at = Date.now(); }
          J.text = Buffer.concat(parts.map(p => Buffer.from(p))).toString('base64'); J.encoding = 'base64';
        } else { const dec = new TextDecoder();
          for (;;) { const { done, value } = await rd.read(); if (done) break; J.text += dec.decode(value, { stream: true }); if (J.text.length > MAX_TEXT) { ctl.abort(); throw new Error('answer too large'); } J.at = Date.now(); wake(); } J.text += dec.decode(); }
      }
    } catch (e) { J.error = ctl.signal.aborted && !J.error ? (J.cancelled ? 'cancelled' : String(e && e.message || e)) : String(e && (e.cause && e.cause.code || e.message) || e); }
    J.done = true; J.at = Date.now(); wake();
  })();
  return { id };
}
async function poll({ id, from = 0, wait_ms = 15000, have_status = false } = {}) {
  const J = jobs.get(id); if (!J) throw new Error('No such request (it finished more than ten minutes ago, or the server restarted)');
  const ready = () => J.done || J.text.length > from || (!have_status && J.status > 0);   // the status alone is news the first time
  if (!ready()) await new Promise(res => { const t = setTimeout(res, Math.max(0, Math.min(20000, +wait_ms || 0))); J.waiters.push(() => { clearTimeout(t); res(); }); });
  const text = J.text.slice(from, from + SLICE), next = from + text.length;   // one MCP answer stays small; the page asks again
  const out = { status: J.status, headers: J.headers, text, next, done: J.done && next >= J.text.length, error: J.error, ...(J.encoding ? { encoding: J.encoding } : {}) };
  if (out.done) J.at = Date.now();
  return out;
}
function cancel({ id } = {}) { const J = jobs.get(id); if (J && !J.done) { J.cancelled = true; J.ctl.abort(); } jobs.delete(id); return { ok: true }; }
// ---------- the vault: the page's AI settings, kept on this computer ----------
const VDIR = join(homedir(), '.scriptorium'), VFILE = join(VDIR, 'ai-settings.json');
function vaultGet() { try { return JSON.parse(readFileSync(VFILE, 'utf8')); } catch (e) { return null; } }
function vaultSet({ data } = {}) {
  if (!data || typeof data !== 'object') throw new Error('data must be an object');
  const text = JSON.stringify({ ...data, savedAt: Date.now() }, null, 1); if (text.length > 200000) throw new Error('too large');
  mkdirSync(VDIR, { recursive: true }); const tmp = VFILE + '.tmp'; writeFileSync(tmp, text, { mode: 0o600 }); renameSync(tmp, VFILE);
  return { ok: true, path: VFILE };
}
// ---------- FreeLLMAPI on this computer ----------
function fdataDirs() {
  const h = homedir(), out = [];
  if (process.env.APPDATA) out.push(join(process.env.APPDATA, 'FreeLLMAPI'));
  out.push(join(h, 'Library', 'Application Support', 'FreeLLMAPI'), join(h, '.config', 'FreeLLMAPI'), join(h, 'AppData', 'Roaming', 'FreeLLMAPI'));
  return [...new Set(out)].filter(d => existsSync(d));
}
async function okJSON(url, key, ms = 4000) { try { const r = await fetch(url, { headers: key ? { Authorization: 'Bearer ' + key } : {}, signal: AbortSignal.timeout(ms) }); return { status: r.status, json: r.ok ? await r.json().catch(() => null) : null }; } catch (e) { return { status: 0 }; } }
async function freellmapiDetect() {
  const dirs = fdataDirs(), ports = [];
  for (const d of dirs) { try { const c = JSON.parse(readFileSync(join(d, 'config.json'), 'utf8')); if (c && +c.port) ports.push(+c.port); } catch (e) { } }
  ports.push(31415, 3001);
  let base = null;
  for (const p of [...new Set(ports)]) { const b = `http://127.0.0.1:${p}/v1`, r = await okJSON(b + '/models', null, 2500); if (r.status === 200 || r.status === 401) { base = b; break; } }
  if (!base) return { found: false, dataDirs: dirs, why: 'FreeLLMAPI is not running on this computer (tried ' + [...new Set(ports)].join(', ') + ')' };
  // the unified key: 'freellmapi-' + 48 hex in its SQLite settings (the WAL holds the newest); the one the server
  // accepts is the live one (a regenerated key leaves old copies in freed pages)
  const cands = new Set();
  for (const d of dirs) for (const f of ['freeapi.db-wal', 'freeapi.db']) { try { const t = readFileSync(join(d, f)).toString('latin1'); for (const m of t.matchAll(/freellmapi-[0-9a-f]{48}/g)) cands.add(m[0]); } catch (e) { } }
  let key = null; for (const k of cands) { const r = await okJSON(base + '/usage', k); if (r.status === 200) { key = k; break; } }
  const m = await okJSON(base + '/models?execution_status=ready', key), ready = m.json && Array.isArray(m.json.data) ? m.json.data.length : null;
  const all = await okJSON(base + '/models', key), total = all.json && Array.isArray(all.json.data) ? all.json.data.length : null;
  return { found: true, base, key, keyFound: !!key, candidates: cands.size, readyModels: ready, catalogModels: total, docker: !dirs.length };
}
setInterval(() => { const now = Date.now(); for (const [k, J] of jobs) if (now - J.at > KEEP_MS) { if (!J.done) J.ctl.abort(); jobs.delete(k); } }, 60e3).unref();

const RO = { readOnlyHint: true, openWorldHint: true };
const TOOLS = [
  { name: 'bridge_info', description: 'Version of the Scriptorium free-model bridge and what it may call.', inputSchema: { type: 'object', properties: {} }, annotations: { ...RO, title: 'Bridge info' } },
  { name: 'http_start', description: 'Start one request to an OpenAI-compatible LLM endpoint (https …/models or …/chat/completions, or a server on this computer). Returns {id}; read the answer with http_poll.', inputSchema: { type: 'object', properties: { url: { type: 'string' }, method: { type: 'string', enum: ['GET', 'POST'] }, headers: { type: 'object', additionalProperties: { type: 'string' } }, body: { type: 'string' }, body_b64: { type: 'string', description: 'a binary body, base64' }, binary: { type: 'boolean', description: 'return the answer as base64 (images, audio)' }, media: { type: 'string', enum: ['image'], description: 'fetch a picture link a generator returned' } }, required: ['url'] }, annotations: { ...RO, title: 'Start an LLM request' } },
  { name: 'http_poll', description: 'The response of a request started with http_start so far: status, headers, the text from offset `from`, and whether it is done. Waits up to wait_ms (≤ 20000) for new text.', inputSchema: { type: 'object', properties: { id: { type: 'string' }, from: { type: 'number' }, wait_ms: { type: 'number' }, have_status: { type: 'boolean' } }, required: ['id'] }, annotations: { ...RO, title: 'Read an LLM answer' } },
  { name: 'vault_get', description: 'The Scriptorium AI settings kept on this computer (keys and choices), or null.', inputSchema: { type: 'object', properties: {} }, annotations: { ...RO, openWorldHint: false, title: 'Read the kept AI settings' } },
  { name: 'vault_set', description: 'Keep the Scriptorium AI settings (keys and choices) on this computer, in ~/.scriptorium/ai-settings.json, so they survive new versions of the app and a cleared browser.', inputSchema: { type: 'object', properties: { data: { type: 'object' } }, required: ['data'] }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, title: 'Keep the AI settings on this computer' } },
  { name: 'freellmapi_detect', description: 'Find FreeLLMAPI running on this computer: its address, its unified key (from its local database, checked against the server) and how many models are ready.', inputSchema: { type: 'object', properties: {} }, annotations: { ...RO, title: 'Find FreeLLMAPI' } },
  { name: 'http_cancel', description: 'Stop a request started with http_start.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }, annotations: { ...RO, title: 'Stop an LLM request' } },
];
const HANDLERS = {
  bridge_info: () => ({ name: NAME, version: VERSION, node: process.version, calls: 'https …/models and …/chat/completions; anything on localhost; picture links (images only)', tools: TOOLS.map(t => t.name) }),
  http_start: start, http_poll: poll, http_cancel: cancel, vault_get: vaultGet, vault_set: vaultSet, freellmapi_detect: freellmapiDetect,
};

const send = m => process.stdout.write(JSON.stringify(m) + '\n');
async function handle(msg) {
  const { id, method, params } = msg; if (id === undefined || id === null) return;   // notifications need no answer
  try {
    if (method === 'initialize') return send({ jsonrpc: '2.0', id, result: { protocolVersion: (params && params.protocolVersion) || '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: { name: NAME, version: VERSION }, instructions: 'Used by the Scriptorium Memorialium page to reach free LLM APIs from this computer.' } });
    if (method === 'ping') return send({ jsonrpc: '2.0', id, result: {} });
    if (method === 'tools/list') return send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    if (method === 'tools/call') {
      const f = HANDLERS[params && params.name]; if (!f) return send({ jsonrpc: '2.0', id, error: { code: -32602, message: 'Unknown tool ' + (params && params.name) } });
      try { const r = await f((params && params.arguments) || {}); return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(r) }], structuredContent: r } }); }
      catch (e) { return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: String(e && e.message || e) }], isError: true } }); }
    }
    if (method === 'resources/list') return send({ jsonrpc: '2.0', id, result: { resources: [] } });
    if (method === 'prompts/list') return send({ jsonrpc: '2.0', id, result: { prompts: [] } });
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found: ' + method } });
  } catch (e) { send({ jsonrpc: '2.0', id, error: { code: -32603, message: String(e && e.message || e) } }); }
}
createInterface({ input: process.stdin }).on('line', l => { l = l.trim(); if (!l) return; let m; try { m = JSON.parse(l); } catch (e) { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); } handle(m); });
process.stdin.on('end', () => process.exit(0));
