// The free-model bridge: how the page reaches free LLM APIs from inside the Claude app.
//
// Inside the Claude app this page is an Artifact, and an Artifact's page may not contact outside addresses: the free
// providers (js/ai/free.js) were out of reach there, so "Claude + free models" could not work in the one place where
// Claude itself is available. An Artifact can, however, call an MCP server running on the viewer's own computer
// (the `mcp` capability, a manifest entry "host:<name>"). The Scriptorium free-models extension (bridge/, packed as
// "Scriptorium free models.mcpb": one double-click installs it in Claude Desktop, which runs it with its own Node) is
// such a server: it makes the request from your computer and hands the answer back as it streams in.
//
// bridgeFetch(url, init) behaves like fetch() for what free.js needs (status, headers, a streamed body, abort), so the
// router does not care which way a request travels. Requests run on in the server between polls (http_start, then
// http_poll every few seconds), so an answer that takes minutes never meets the app's ~130 s limit per call.
// Only the Artifact's owner can use a server on their computer (the platform's rule); it is the owner's own machine.
export const HOST_NAMES = ['host:scriptorium-free', 'host:Scriptorium_free_models'];
let MCP = null, NAME = null, INFO = null, probe = null;

async function mcp() { if (MCP) return MCP; try { if (window.claude && claude.use) MCP = await claude.use('mcp'); } catch (e) { MCP = null; } return MCP; }
const payload = r => { const p = r && (r.payload !== undefined ? r.payload : r.structuredContent); if (typeof p === 'string') { try { return JSON.parse(p); } catch (e) { return p; } } return p; };
// THE APP'S LIMIT ON CALLS TO THE EXTENSION. The Claude app refuses calls past a rate ("Host tool rate limit
// exceeded"): that refusal is the app's, not the provider's, so it must never count as a model failing. Calls are
// therefore (1) queued, at most a few at once and spaced a little apart, and (2) on that refusal, retried after a
// growing pause (up to ~40 s) instead of failing.
const HOSTLIMIT = /host tool rate limit|rate.?limit|too many/i;
let inFlight = 0, lastAt = 0; const waiting = [];
const GAP = 120, MAXPAR = 4;
function slot() { return new Promise(res => { const go = () => { const w = Math.max(0, lastAt + GAP - Date.now()); setTimeout(() => { lastAt = Date.now(); inFlight++; res(); }, w); }; if (inFlight < MAXPAR) go(); else waiting.push(go); }); }
function free1() { inFlight--; const n = waiting.shift(); if (n) n(); }
const nap = (ms, signal) => new Promise((res, rej) => { const t = setTimeout(res, ms); if (signal) signal.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('Aborted', 'AbortError')); }, { once: true }); });
async function tool(name, args, signal) {
  const M = await mcp(); if (!M || !NAME) throw { code: 'no_bridge' };
  for (let k = 0; ; k++) {
    await slot();
    let r, err; try { r = await M.callTool(NAME, name, args, signal ? { signal } : undefined); } catch (e) { err = e; } finally { free1(); }
    if (!err) return payload(r);
    const msg = (err && (err.message || err.code)) || String(err);
    if (k < 7 && !(signal && signal.aborted) && ((err && err.code === 'rate_limited') || HOSTLIMIT.test(msg))) { await nap(Math.min(40000, 1500 * 2 ** k), signal); continue; }
    throw err;
  }
}

// is the extension installed and running? A "yes" is kept; a "no" is asked again after 15 s (the extension may have
// been starting or restarting when the page loaded: a page must not stay without it for the whole visit)
let probeAt = 0, probeOK = false;
export function bridgeReady({ fresh = false } = {}) {
  if (probe && !fresh && (probeOK || Date.now() - probeAt < 15000)) return probe;
  probeAt = Date.now();
  return (probe = (async () => {
    const M = await mcp(); if (!M) return (probeOK = false);
    for (const n of HOST_NAMES) {
      try { const r = payload(await M.callTool(n, 'bridge_info', {}, { signal: AbortSignal.timeout(12000) })); if (r && r.name === 'scriptorium-free') { NAME = n; INFO = r; return (probeOK = true); } }
      catch (e) { /* server_not_connected: not installed, not running, or not inside the Claude app */ }
    }
    NAME = null; return (probeOK = false);
  })());
}
export const bridgeInfo = () => INFO;
export const inClaudeApp = () => !!(window.claude && claude.use);

// fetch() through the bridge: resolves once the status is known, with a body that streams as the answer arrives
export async function bridgeFetch(url, { method = 'GET', headers = {}, body, signal } = {}) {
  if (!(await bridgeReady())) throw new TypeError('bridge not available');
  if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const H = {}; new Headers(headers).forEach((v, k) => { H[k] = v; });
  const { id } = await tool('http_start', { url, method, headers: H, ...(body != null ? { body: String(body) } : {}) });
  let from = 0, closed = false; const detach = () => { if (signal) signal.removeEventListener('abort', cancel); }, cancel = () => { detach(); if (closed) return; closed = true; tool('http_cancel', { id }).catch(() => { }); }, end = () => { closed = true; detach(); };
  if (signal) signal.addEventListener('abort', cancel, { once: true });
  // the status first (an error answer arrives whole: wait for it, so its body and headers are complete); a poll that
  // fails here stops the request on the server too
  let r;
  try {
    r = await tool('http_poll', { id, from, wait_ms: 20000 }, signal);
    while (!r.done && !(r.status > 0)) { if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError'); r = await tool('http_poll', { id, from, wait_ms: 20000 }, signal); }
  } catch (e) { cancel(); throw e; }
  if (r.error && !(r.status > 0)) { end(); throw new TypeError('bridge: ' + r.error); }
  const enc = new TextEncoder(); let first = r, pulls = 0;
  const stream = new ReadableStream({
    async pull(ctl) {
      try {
        for (;;) {
          const x = first || await tool('http_poll', { id, from, wait_ms: 15000, have_status: true }, signal); first = null;
          if (x.text) { from = x.next; ctl.enqueue(enc.encode(x.text)); }
          if (x.done) { end(); if (x.error && x.error !== 'cancelled') ctl.error(new TypeError('bridge: ' + x.error)); else ctl.close(); return; }
          if (x.text) { pulls++; if (pulls > 2) await nap(700, signal).catch(() => { }); return; }   // one piece per pull; after the first pieces, a short pause lets the next ones gather into one call
        }
      } catch (e) { cancel(); ctl.error(signal && signal.aborted ? new DOMException('Aborted', 'AbortError') : e); }
    },
    cancel
  });
  return new Response(stream, { status: r.status >= 200 && r.status <= 599 && r.status !== 204 ? r.status : 502, headers: r.headers || {} });
}

// bytes through the bridge (1.2+): a generated image or spoken reading back, an audio file up (transcription). The
// answer arrives whole (base64, in slices), then is handed over as an ordinary Response.
const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = t => { const bin = atob(t), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; };
export const bridgeBinary = () => !!(INFO && INFO.version && INFO.version.localeCompare('1.2.0', undefined, { numeric: true }) >= 0);
export async function bridgeFetchBytes(url, { method = 'GET', headers = {}, body, signal, media } = {}) {
  if (!(await bridgeReady())) throw new TypeError('bridge not available');
  if (!bridgeBinary()) throw { code: 'old_bridge', message: 'the Scriptorium extension is older than 1.2: install the new one (AI panel → Download the extension)' };
  const H = {}; new Headers(headers).forEach((v, k) => { H[k] = v; });
  const a = { url, method, headers: H, binary: true, ...(media ? { media } : {}) };
  if (body != null) { if (typeof body === 'string') a.body = body; else a.body_b64 = b64(new Uint8Array(body instanceof Blob ? await body.arrayBuffer() : body)); }
  const { id } = await tool('http_start', a); let from = 0, text = '', r;
  const stop = () => tool('http_cancel', { id }).catch(() => { }); if (signal) signal.addEventListener('abort', stop, { once: true });
  try {
    for (;;) { if (signal && signal.aborted) throw { code: 'cancelled' }; r = await tool('http_poll', { id, from, wait_ms: 20000, have_status: true }, signal); text += r.text || ''; from = r.next; if (r.done) break; }
  } finally { if (signal) signal.removeEventListener('abort', stop); }
  if (r.error && !(r.status > 0)) throw new TypeError('bridge: ' + r.error);
  if (r.error) throw { code: 'network', message: r.error };
  return new Response(r.encoding === 'base64' ? unb64(text) : text, { status: r.status >= 200 && r.status <= 599 && r.status !== 204 ? r.status : 502, headers: r.headers || {} });
}

// the AI settings kept on this computer (the vault), and FreeLLMAPI found on it (extension 1.1+)
export async function bridgeVault(op, data) { if (!(await bridgeReady())) return null; if (!INFO || !(INFO.tools || []).includes('vault_get')) return null; return op === 'set' ? tool('vault_set', { data }) : tool('vault_get', {}); }
export async function bridgeDetect() { if (!(await bridgeReady())) return null; if (!INFO || !(INFO.tools || []).includes('freellmapi_detect')) return { found: false, why: 'the extension is older than 1.1: install the new one' }; return tool('freellmapi_detect', {}); }
