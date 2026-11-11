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
async function tool(name, args, signal) { const M = await mcp(); if (!M || !NAME) throw { code: 'no_bridge' }; return payload(await M.callTool(NAME, name, args, signal ? { signal } : undefined)); }

// is the extension installed and running? (asked once; again after `fresh`, e.g. from the AI panel after installing)
export function bridgeReady({ fresh = false } = {}) {
  if (probe && !fresh) return probe;
  return (probe = (async () => {
    const M = await mcp(); if (!M) return false;
    for (const n of HOST_NAMES) {
      try { const r = payload(await M.callTool(n, 'bridge_info', {}, { signal: AbortSignal.timeout(12000) })); if (r && r.name === 'scriptorium-free') { NAME = n; INFO = r; return true; } }
      catch (e) { /* server_not_connected: not installed, not running, or not inside the Claude app */ }
    }
    NAME = null; return false;
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
  let from = 0, closed = false; const cancel = () => { if (closed) return; closed = true; tool('http_cancel', { id }).catch(() => { }); };
  if (signal) signal.addEventListener('abort', cancel, { once: true });
  // the status first (an error answer arrives whole: wait for it, so its body and headers are complete)
  let r = await tool('http_poll', { id, from, wait_ms: 20000 }, signal);
  while (!r.done && !(r.status > 0)) { if (signal && signal.aborted) throw new DOMException('Aborted', 'AbortError'); r = await tool('http_poll', { id, from, wait_ms: 20000 }, signal); }
  if (r.error && !(r.status > 0)) { closed = true; throw new TypeError('bridge: ' + r.error); }
  const enc = new TextEncoder(); let first = r;
  const stream = new ReadableStream({
    async pull(ctl) {
      try {
        for (;;) {
          const x = first || await tool('http_poll', { id, from, wait_ms: 15000, have_status: true }, signal); first = null;
          if (x.text) { from = x.next; ctl.enqueue(enc.encode(x.text)); }
          if (x.done) { closed = true; if (x.error && x.error !== 'cancelled') ctl.error(new TypeError('bridge: ' + x.error)); else ctl.close(); return; }
          if (x.text) return;   // one piece per pull: the reader decides the pace
        }
      } catch (e) { cancel(); ctl.error(signal && signal.aborted ? new DOMException('Aborted', 'AbortError') : e); }
    },
    cancel
  });
  return new Response(stream, { status: r.status >= 200 && r.status <= 599 && r.status !== 204 ? r.status : 502, headers: r.headers || {} });
}

// the AI settings kept on this computer (the vault), and FreeLLMAPI found on it (extension 1.1+)
export async function bridgeVault(op, data) { if (!(await bridgeReady())) return null; if (!INFO || !(INFO.tools || []).includes('vault_get')) return null; return op === 'set' ? tool('vault_set', { data }) : tool('vault_get', {}); }
export async function bridgeDetect() { if (!(await bridgeReady())) return null; if (!INFO || !(INFO.tools || []).includes('freellmapi_detect')) return { found: false, why: 'the extension is older than 1.1: install the new one' }; return tool('freellmapi_detect', {}); }
