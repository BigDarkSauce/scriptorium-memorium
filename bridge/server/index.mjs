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
// The request runs on here between polls, so an answer that takes minutes never meets the Claude app's per-call time
// limit (about 130 s).
//
// WHAT IT WILL CALL. Only LLM-API-shaped addresses: https URLs whose path ends in /models or /chat/completions (any
// provider, so a new free tier or your own endpoint works), and anything on this computer (localhost, 127.0.0.1:
// FreeLLMAPI, Ollama, LM Studio). Nothing else, so it cannot be used to fetch arbitrary pages.
//
// No dependencies: Node 18+ (Claude Desktop ships its own). The MCP stdio transport is newline-delimited JSON-RPC 2.0.
import { createInterface } from 'node:readline';

const VERSION = '1.0.0', NAME = 'scriptorium-free';
const jobs = new Map(); let seq = 0;
const MAX_TEXT = 4e6, KEEP_MS = 10 * 60e3;

function allowed(u) {
  let x; try { x = new URL(u); } catch (e) { return 'not a URL'; }
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(x.hostname);
  if (local) return /^https?:$/.test(x.protocol) ? null : 'only http(s)';
  if (x.protocol !== 'https:') return 'only https outside this computer';
  if (!/\/(models|chat\/completions)\/?$/.test(x.pathname)) return 'only /models and /chat/completions addresses';
  return null;
}

function start({ url, method = 'GET', headers = {}, body } = {}) {
  const why = allowed(url); if (why) throw new Error('Refused: ' + why);
  const id = 'r' + (++seq) + '-' + Date.now().toString(36), ctl = new AbortController();
  const J = { id, status: 0, headers: {}, text: '', done: false, error: null, at: Date.now(), ctl, waiters: [] };
  const wake = () => { const w = J.waiters.splice(0); w.forEach(f => f()); };
  jobs.set(id, J);
  (async () => {
    try {
      const h = { ...headers }; delete h.Origin; delete h.origin;
      const r = await fetch(url, { method, headers: h, body: body == null ? undefined : typeof body === 'string' ? body : JSON.stringify(body), signal: ctl.signal });
      J.status = r.status; r.headers.forEach((v, k) => { J.headers[k] = v; }); wake();
      if (r.body) { const rd = r.body.getReader(), dec = new TextDecoder();
        for (;;) { const { done, value } = await rd.read(); if (done) break; J.text += dec.decode(value, { stream: true }); if (J.text.length > MAX_TEXT) { ctl.abort(); throw new Error('answer too large'); } J.at = Date.now(); wake(); } J.text += dec.decode(); }
    } catch (e) { J.error = ctl.signal.aborted && !J.error ? (J.cancelled ? 'cancelled' : String(e && e.message || e)) : String(e && (e.cause && e.cause.code || e.message) || e); }
    J.done = true; J.at = Date.now(); wake();
  })();
  return { id };
}
async function poll({ id, from = 0, wait_ms = 15000, have_status = false } = {}) {
  const J = jobs.get(id); if (!J) throw new Error('No such request (it finished more than ten minutes ago, or the server restarted)');
  const ready = () => J.done || J.text.length > from || (!have_status && J.status > 0);   // the status alone is news the first time
  if (!ready()) await new Promise(res => { const t = setTimeout(res, Math.max(0, Math.min(20000, +wait_ms || 0))); J.waiters.push(() => { clearTimeout(t); res(); }); });
  const out = { status: J.status, headers: J.headers, text: J.text.slice(from), next: J.text.length, done: J.done, error: J.error };
  if (J.done && out.next >= J.text.length) J.at = Date.now();
  return out;
}
function cancel({ id } = {}) { const J = jobs.get(id); if (J && !J.done) { J.cancelled = true; J.ctl.abort(); } jobs.delete(id); return { ok: true }; }
setInterval(() => { const now = Date.now(); for (const [k, J] of jobs) if (now - J.at > KEEP_MS) { if (!J.done) J.ctl.abort(); jobs.delete(k); } }, 60e3).unref();

const RO = { readOnlyHint: true, openWorldHint: true };
const TOOLS = [
  { name: 'bridge_info', description: 'Version of the Scriptorium free-model bridge and what it may call.', inputSchema: { type: 'object', properties: {} }, annotations: { ...RO, title: 'Bridge info' } },
  { name: 'http_start', description: 'Start one request to an OpenAI-compatible LLM endpoint (https …/models or …/chat/completions, or a server on this computer). Returns {id}; read the answer with http_poll.', inputSchema: { type: 'object', properties: { url: { type: 'string' }, method: { type: 'string', enum: ['GET', 'POST'] }, headers: { type: 'object', additionalProperties: { type: 'string' } }, body: { type: 'string' } }, required: ['url'] }, annotations: { ...RO, title: 'Start an LLM request' } },
  { name: 'http_poll', description: 'The response of a request started with http_start so far: status, headers, the text from offset `from`, and whether it is done. Waits up to wait_ms (≤ 20000) for new text.', inputSchema: { type: 'object', properties: { id: { type: 'string' }, from: { type: 'number' }, wait_ms: { type: 'number' }, have_status: { type: 'boolean' } }, required: ['id'] }, annotations: { ...RO, title: 'Read an LLM answer' } },
  { name: 'http_cancel', description: 'Stop a request started with http_start.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] }, annotations: { ...RO, title: 'Stop an LLM request' } },
];
const HANDLERS = {
  bridge_info: () => ({ name: NAME, version: VERSION, node: process.version, calls: 'https …/models and …/chat/completions; anything on localhost' }),
  http_start: start, http_poll: poll, http_cancel: cancel,
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
