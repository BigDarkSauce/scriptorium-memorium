// Free models: a router over many free-tier LLM APIs, run in the page (no server needed).
//
// WHY THIS SHAPE. No single free tier is large or steady enough to write a whole book: each caps requests per minute
// and per day, changes its model list every few weeks, and some days is down. Pooled, they are large: a dozen free
// tiers give thousands of requests a day (FreeLLMAPI, github.com/tashfeenahmed/freellmapi, counts ~7.4 billion tokens a
// month across 34 of them). So every request goes to the best model that is free *now*, and the router keeps going:
//   1. discover   each provider's live model list (GET /models), so retired models drop out and new ones come in;
//   2. rank       the models by how well they write long, exact JSON (RANK below; a tested ordering, not a guess);
//   3. budget     per model: requests this minute and today (learned from the 429s it meets) and cool-downs taken from
//                 the provider's own reset headers; a daily cap waits for 00:00 UTC, a minute cap for the minute;
//   4. validate   the answer is parsed (and checked by the caller's validate()); a broken or cut-off answer goes to the
//                 next model instead of into the scroll;
//   5. cache      an answer that passed is kept (IndexedDB, 30 days): the same request again costs nothing;
//   6. wait, never fail   when every model is busy the job waits for the earliest reset, saying for what and how long
//                 (and can be stopped); a model on your own computer (Ollama, LM Studio, FreeLLMAPI) has no quota at all.
// Keys are the viewer's own, kept only in this browser (localStorage 'sm-ai'), sent only to the provider they belong to.
//
// Browser reach (measured from a page, Nov 2026): Groq, Google Gemini, Cerebras, Mistral, OpenRouter, Cohere, Z.ai,
// Chutes, Hugging Face, OVHcloud, LLM7 and Pollinations answer cross-origin requests; NVIDIA NIM, GitHub Models,
// SambaNova, Cloudflare and Kilo do not (they are reachable through FreeLLMAPI, which runs as a local server).
import * as store from '../store.js';
import { parseJSONLoose } from './claude.js';
import { bridgeReady, bridgeFetch, inClaudeApp, bridgeVault, bridgeDetect } from './bridge.js';

// How a request leaves this page: inside the Claude app (an Artifact may not contact outside addresses) through the
// Scriptorium free-models extension on your computer (js/ai/bridge.js); anywhere else straight from the page.
// Opened from this computer with Launch Scriptorium.bat, the local server carries an AI relay (launcher/serve.py): then
// every request goes through it (no browser rules: FreeLLMAPI, NVIDIA NIM, GitHub Models, Cloudflare all reachable).
let RELAY = null; const relayP = (typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && typeof fetch === 'function' && !inClaudeApp())
  ? fetch(location.pathname || '/', { method: 'HEAD', cache: 'no-store' }).then(r => (RELAY = !!r.headers.get('x-scriptorium-relay'))).catch(() => (RELAY = false)) : Promise.resolve(RELAY = false);   /* the launcher marks every answer (a probe of a missing path would log a 404 on a plain server) */
export const via = () => inClaudeApp() ? 'bridge' : RELAY ? 'relay' : 'direct';
const net = async (url, init) => { if (!inClaudeApp()) await relayP; return via() === 'bridge' ? bridgeFetch(url, init) : via() === 'relay' ? fetch('/__relay/fetch?u=' + encodeURIComponent(url), init) : fetch(url, init); };

export const PROVIDERS = [
  // no key needed: work from the first minute (slow: small per-IP limits)
  { id: 'ovh', name: 'OVHcloud AI Endpoints', base: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1', key: 'optional', keyUrl: 'https://endpoints.ai.cloud.ovh.net/', rpm: 2, rpd: 2000, perModel: true, note: 'No key: 2 requests a minute per model, from EU data centres.' },
  { id: 'llm7', name: 'LLM7.io', base: 'https://api.llm7.io/v1', key: 'optional', keyUrl: 'https://token.llm7.io/', rpm: 20, rpd: 250, anon: ['mistral-Nemo-Instruct-2407', 'default'], note: 'No key: two small models (Mistral Nemo, Codestral). A free token (100k tokens a day) opens gpt-oss and others.' },
  { id: 'pollinations', name: 'Pollinations', base: 'https://text.pollinations.ai/openai', key: 'optional', keyUrl: 'https://enter.pollinations.ai/', rpm: 1, rpd: 1000, gapMs: 46000, fixed: ['openai-fast'], json: false, note: 'No key: one reply every 45 s per address (gpt-oss-20b). A pollen key removes the wait.' },
  // a free key (sign-up, no card): the large daily capacity
  { id: 'gemini', name: 'Google AI Studio (Gemini)', base: 'https://generativelanguage.googleapis.com/v1beta/openai', key: 'required', keyUrl: 'https://aistudio.google.com/apikey', rpm: 10, rpd: 250, perModel: true, json: true, vision: true, out: 65536, note: 'The strongest free models; free-tier prompts may be used by Google outside the EEA/UK/Switzerland.' },
  { id: 'groq', name: 'Groq', base: 'https://api.groq.com/openai/v1', key: 'required', keyUrl: 'https://console.groq.com/keys', rpm: 30, rpd: 1000, perModel: true, json: true, out: 32768, note: 'Very fast; 1,000 requests a day per model.' },
  { id: 'cerebras', name: 'Cerebras', base: 'https://api.cerebras.ai/v1', key: 'required', keyUrl: 'https://cloud.cerebras.ai/', rpm: 30, rpd: 14400, perModel: true, json: true, out: 32768, note: 'Very fast; about a million tokens a day.' },
  { id: 'mistral', name: 'Mistral', base: 'https://api.mistral.ai/v1', key: 'required', keyUrl: 'https://console.mistral.ai/api-keys', rpm: 50, rpd: 20000, json: true, out: 32768, note: 'Free "Experiment" plan; inputs may train models unless you opt out.' },
  { id: 'openrouter', name: 'OpenRouter (free models)', base: 'https://openrouter.ai/api/v1', key: 'required', keyUrl: 'https://openrouter.ai/keys', rpm: 20, rpd: 50, onlyFree: true, json: true, note: '50 free requests a day (1,000 after a one-time $10 top-up).' },
  { id: 'cohere', name: 'Cohere', base: 'https://api.cohere.ai/compatibility/v1', key: 'required', keyUrl: 'https://dashboard.cohere.com/api-keys', rpm: 20, rpd: 33, note: 'Trial key: 1,000 calls a month, non-commercial.' },
  { id: 'zai', name: 'Z.ai (GLM Flash)', base: 'https://api.z.ai/api/paas/v4', key: 'required', keyUrl: 'https://z.ai/manage-apikey/apikey-list', rpm: 10, rpd: 5000, onlyMatch: /flash/i, note: 'GLM Flash models are free; one request at a time.' },
  { id: 'hf', name: 'Hugging Face router', base: 'https://router.huggingface.co/v1', key: 'required', keyUrl: 'https://huggingface.co/settings/tokens', rpm: 10, rpd: 100, note: 'Small monthly free credit; a last reserve.' },
  // your own computer: no quota at all (and the router of routers)
  { id: 'freellmapi', name: 'FreeLLMAPI (34 providers, one key)', base: 'http://127.0.0.1:31415/v1', key: 'optional', keyUrl: 'https://github.com/tashfeenahmed/freellmapi/releases/latest', rpm: 600, rpd: 1e6, discover: 'freellmapi', extra: ['auto:smart'], local: true, editableBase: true, json: true, note: 'The router of routers on your computer: 34 free providers, 635 model endpoints, ~7.4 billion tokens a month once each provider has its free key (added in its own dashboard, Keys page). Found and connected by itself when the Scriptorium extension is installed; otherwise paste its address (desktop app :31415, Docker or npm :3001) and its unified freellmapi-… key.' },
  { id: 'ollama', name: 'Ollama / LM Studio (local)', base: 'http://localhost:11434/v1', key: 'none', rpm: 600, rpd: 1e6, local: true, editableBase: true, note: 'A model on this computer: unlimited, private, slow on a laptop GPU. Ollama needs OLLAMA_ORIGINS=* to answer a web page.' },
  { id: 'custom', name: 'Any OpenAI-compatible endpoint', base: '', key: 'optional', rpm: 60, rpd: 1e5, editableBase: true, editableModel: true, note: 'Base URL ending in /v1, its key and model.' },
];

// How well a model family writes long, exact JSON in this app's formats (higher is better). Ordered from the live tests
// (js/ai/freetest.js) and the public leaderboards; unknown names get 40, so a new model is tried but after the known.
const RANK = [
  [/gemini-[3-9][\d.]*-pro|gemini-2\.5-pro/i, 97], [/gemini-[3-9][\d.]*-flash(?!-lite)/i, 95], [/qwen3[\d.]*-(397|235)b|qwen3\.\d-max/i, 91], [/deepseek-v4(\.\d)?-pro|deepseek-v4(?![\w.-]*flash)/i, 90],
  [/gpt-oss-120b/i, 88], [/glm-5/i, 88], [/kimi-k2/i, 86], [/deepseek-v4[\w.:-]*flash|deepseek-v3/i, 85], [/gemini-2\.5-flash(?!-lite)/i, 85], [/nemotron-3-ultra/i, 84],
  [/mistral-(medium|large)|magistral-medium/i, 82], [/llama-4-maverick/i, 80], [/command-a(?![\w-]*(vision|reasoning))/i, 76], [/llama-3[._]3-70b/i, 75], [/gemma-4-(31|26)b/i, 74],
  [/glm-4\.[5-9]/i, 72], [/qwen3[\d.]*-(27|32|35)b|qwen3-32b/i, 72], [/gemini[\w.-]*flash-lite/i, 70], [/auto$/i, 70], [/llama-4-scout|mistral-small|gpt-oss-20b|nemotron[\w.-]*(super|nano)/i, 55], [/openai-fast/i, 45],
];
// not for writing: speech, images, embeddings, guards; and proprietary models some resellers relist (not free tiers)
const EXCLUDE = /embed|whisper|tts|speech|transcri|guard|image|banana|diffusion|voxtral|audio|ocr|rerank|moderat|safety|claude|anthropic|opus|sonnet|haiku|fable|gpt-5|gpt-4|\bo[134]\b|grok|-live|lunaris|krea|chroma|inkling|bge-|e5-|clip|vision-instruct|distill|-1b\b|-3b\b|-7b\b|-8b\b|0\.6b|1\.5b|4b-/i;
const VISION = /gemini|-vl-|vl-|qwen3\.[5-9]|gemma-4|llama-4|vision/i;
export const rankOf = id => { for (const [re, s] of RANK) if (re.test(id)) return s; return 40; };

// ---------------------------------------------------------------- settings (this browser only)
const SKEY = 'sm-ai', UKEY = 'sm-ai-use';
const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
export const MODES = { claude: 'Claude directs', hybrid: 'Claude + free models', free: 'Free models only' };
export function settings() { const s = read(SKEY, {}); return { mode: s.mode || 'claude', keys: s.keys || {}, bases: s.bases || {}, models: s.models || {}, off: s.off || {}, on: s.on || {} }; }
export function saveSettings(patch, { quiet = false } = {}) { const s = { ...settings(), ...patch, at: Date.now() }; write(SKEY, s); persist(s); if (!quiet) listeners.forEach(f => { try { f(s); } catch (e) { } }); return s; }
// Keys and choices survive every new version of the app: kept in this browser (localStorage), mirrored in its
// IndexedDB, and (with the Scriptorium extension) in a file on this computer (~/.scriptorium/ai-settings.json). At start
// the newest of the three is used, so a change you make is never undone by an older copy; nothing else changes them.
let vaultT = 0;
function persist(s) {
  store.setGlobal('sm-ai-settings', s).catch(() => { });
  clearTimeout(vaultT); vaultT = setTimeout(async () => { try { if (via() === 'bridge' && await bridgeReady()) { const v = await bridgeVault('get'); const same = v && JSON.stringify({ ...v, savedAt: 0 }) === JSON.stringify({ ...s, savedAt: 0 }); if (!same) await bridgeVault('set', s); } } catch (e) { console.warn('vault', e); } }, 1500);
}
export async function restoreSettings() {
  const cur = read(SKEY, null), cands = [cur];
  try { cands.push(await store.getGlobal('sm-ai-settings')); } catch (e) { }
  try { if (via() === 'bridge' && await bridgeReady()) cands.push(await bridgeVault('get')); } catch (e) { }
  const best = cands.filter(x => x && typeof x === 'object' && x.keys).sort((a, b) => (b.at || 0) - (a.at || 0))[0];
  if (best && (!cur || (best.at || 0) > (cur.at || 0))) { const { savedAt, ...clean } = best; write(SKEY, clean); listeners.forEach(f => { try { f(clean); } catch (e) { } }); return 'restored'; }
  if (cur && cur.keys && Object.keys(cur.keys).length) persist(cur);   // older copies catch up with this browser's
  return cur ? 'kept' : 'none';
}
// FreeLLMAPI found by the extension: its address and unified key set and the provider switched on (once; a key you
// typed yourself is kept)
export async function autoFreeLLMAPI() {
  await relayP; let d = null;
  if (via() === 'bridge') { if (!(await bridgeReady())) return null; d = await bridgeDetect().catch(() => null); }
  else if (via() === 'relay') d = await fetch('/__relay/freellmapi', { cache: 'no-store' }).then(r => r.json()).catch(() => null);
  else return null;
  if (!d || !d.found) return d;
  const S = settings(); const patch = {};
  if (!S.on.freellmapi) patch.on = { ...S.on, freellmapi: true };
  if ((S.bases.freellmapi || '') !== d.base && !S.bases.freellmapi) patch.bases = { ...S.bases, freellmapi: d.base };
  if (d.key && !(S.keys.freellmapi || '').trim()) patch.keys = { ...S.keys, freellmapi: d.key };
  if (Object.keys(patch).length) { saveSettings(patch); try { const c = read(MKEY, {}); delete c.freellmapi; write(MKEY, c); } catch (e) { } }
  return d;
}
const listeners = new Set(); export const onSettings = f => (listeners.add(f), () => listeners.delete(f));
export const mode = () => settings().mode;
const baseOf = (p, S = settings()) => (S.bases[p.id] || p.base || '').replace(/\/+$/, '');
const keyOf = (p, S = settings()) => (S.keys[p.id] || '').trim();
// a provider is in play when it is switched on (a server on your own computer or a custom endpoint: once you turn it on;
// the others: unless you turn them off), has an address, and has a key if it needs one
export const isOn = (p, S = settings()) => p.local || p.editableModel ? !!S.on[p.id] : !S.off[p.id];
export const active = (S = settings()) => PROVIDERS.filter(p => isOn(p, S) && baseOf(p, S) && (p.key !== 'required' || keyOf(p, S)));
export { baseOf, keyOf };

// ---------------------------------------------------------------- usage, limits and cool-downs (this browser)
const today = () => new Date().toISOString().slice(0, 10);
const nextMidnight = () => { const d = new Date(); d.setUTCHours(24, 0, 30, 0); return d.getTime(); };
let U = null; const use = () => { if (!U || U.day !== today()) { const u = read(UKEY, null); U = u && u.day === today() ? u : { day: today(), n: {}, tok: {}, cool: {}, lim: {}, bad: (u && u.bad) || {} }; } return U; };
const saveUse = () => write(UKEY, U);
const recent = new Map();   // key -> timestamps this minute (not stored: a reload starts a fresh minute)
const keyFor = (p, m) => p.id + '|' + (p.perModel ? m : '*');
function budget(p, m) {
  const u = use(), k = keyFor(p, m), now = Date.now(), lim = u.lim[k] || {}, rpm = lim.rpm || p.rpm || 10, rpd = lim.rpd || p.rpd || 500;
  const c = Math.max(u.cool[k] || 0, u.cool[p.id + '|*'] || 0, (u.bad[p.id + '|' + m] || 0)); if (c > now) return { ok: false, until: c };
  const r = (recent.get(k) || []).filter(t => now - t < 60000); recent.set(k, r);
  if ((u.n[k] || 0) >= rpd) return { ok: false, until: nextMidnight() };
  if (r.length >= rpm) return { ok: false, until: r[0] + 60000 };
  if (p.gapMs && !keyOf(p) && r.length && now - r[r.length - 1] < p.gapMs) return { ok: false, until: r[r.length - 1] + p.gapMs };
  return { ok: true };
}
function spend(p, m, tokens) { const u = use(), k = keyFor(p, m); u.n[k] = (u.n[k] || 0) + 1; u.tok[p.id] = (u.tok[p.id] || 0) + (tokens || 0); (recent.get(k) || recent.set(k, []).get(k)).push(Date.now()); saveUse(); }
function cool(p, m, ms, why, all) { const u = use(), k = all ? p.id + '|*' : keyFor(p, m); u.cool[k] = Math.max(u.cool[k] || 0, Date.now() + ms); if (why === 'day') { u.lim[k] = { ...(u.lim[k] || {}), rpd: Math.max(1, u.n[k] || 1) }; } saveUse(); }
function banModel(p, m, ms) { const u = use(); u.bad[p.id + '|' + m] = Date.now() + ms; saveUse(); }
// the reset a 429 names: Retry-After (s or date), x-ratelimit-reset-* ("2m59.5s", "0.5s", seconds, epoch), or the text
function resetOf(res, body) {
  const h = n => res.headers.get(n); const ra = h('retry-after');
  if (ra) { const s = +ra; if (isFinite(s)) return { ms: s * 1000 }; const d = Date.parse(ra); if (d) return { ms: d - Date.now() }; }
  for (const n of ['x-ratelimit-reset-requests', 'x-ratelimit-reset', 'x-ratelimit-reset-tokens', 'ratelimit-reset']) { const v = h(n); if (!v) continue; const m = String(v).match(/(?:(\d+)h)?(?:(\d+)m(?!s))?(?:([\d.]+)s)?(?:([\d.]+)ms)?/); if (m && m[0]) { const ms = ((+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0)) * 1000 + (+m[4] || 0); if (ms > 0) return { ms }; } const x = +v; if (isFinite(x)) return { ms: x > 1e9 ? x * 1000 - Date.now() : x * 1000 }; }
  const t = String(body || ''); { const m = t.match(/retry[_ ]after"?:?\s*(\d+)|Retry after (\d+)s/i); if (m) return { ms: (+(m[1] || m[2]) + 1) * 1000 }; } if (/per[ -]?day|daily|\bRPD\b|requests per day|quota|exceeded your current|free-models-per-day|limit: 0/i.test(t)) return { ms: nextMidnight() - Date.now(), day: true };
  return { ms: 60000 };
}

// ---------------------------------------------------------------- models: discovered, filtered, ranked
const MKEY = 'sm-ai-models';
export async function models(p, { fresh = false } = {}) {
  const S = settings(); if (p.editableModel || S.models[p.id]) { const m = (S.models[p.id] || '').trim(); return m ? m.split(/\s*,\s*/).map(id => ({ id, rank: rankOf(id), vision: VISION.test(id) })) : []; }
  if (p.fixed) return p.fixed.map(id => ({ id, rank: rankOf(id), vision: !!p.vision }));
  if (p.anon && !keyOf(p, S)) return p.anon.map(id => ({ id, rank: rankOf(id) - 8, vision: false }));   // without a key only these answer
  const cache = read(MKEY, {}), c = cache[p.id]; if (!fresh && c && Date.now() - c.at < (p.discover ? 6e5 : 864e5) && c.base === baseOf(p, S)) return c.list;   /* FreeLLMAPI's ready list changes with its keys: kept 10 min */
  const r = await net(baseOf(p, S) + (p.discover === 'freellmapi' ? '/models?execution_status=ready' : '/models'), { headers: keyOf(p, S) ? { Authorization: 'Bearer ' + keyOf(p, S) } : {}, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw { code: r.status === 401 || r.status === 403 ? 'key' : 'models', status: r.status };
  const j = await r.json(); let ids = (j.data || j.models || []).map(m => String(m.id || m.name || '').replace(/^models\//, '')).filter(Boolean);
  if (p.onlyFree) ids = ids.filter(id => /:free$|^openrouter\/free$/.test(id)); if (p.onlyMatch) ids = ids.filter(id => p.onlyMatch.test(id));
  let list = ids.filter(id => !EXCLUDE.test(id)).map(id => ({ id, rank: rankOf(id), vision: !!p.vision || VISION.test(id) })).sort((a, b) => b.rank - a.rank).slice(0, p.discover ? 24 : 12);
  // FreeLLMAPI: its ready models, best first by this app's own table, then its own smart routing over all of them
  if (p.extra) list = list.concat(p.extra.filter(x => !list.some(m => m.id === x)).map(id => ({ id, rank: 84, vision: false })));
  cache[p.id] = { at: Date.now(), base: baseOf(p, S), list }; write(MKEY, cache); return list;
}

// ---------------------------------------------------------------- one call
const SYSTEM = 'You write content for Scriptorium Memorialium, a study app that turns textbook chapters into logical chains of steps, figures and interactive 3D dioramas. Follow the request exactly. Answer with ONE JSON value in exactly the requested format: no prose before or after it, no markdown fences, no comments. Use only facts supported by the given text or well established knowledge.';
async function blobToDataUrl(b) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); }); }
export async function call(p, model, prompt, { images = [], signal, onText, onThink, maxTokens, json = true, timeoutMs = 420000 } = {}) {
  const S = settings(), key = keyOf(p, S), H = { 'Content-Type': 'application/json' }; if (key) H.Authorization = 'Bearer ' + key;
  if (p.id === 'openrouter') { H['HTTP-Referer'] = location.origin; H['X-Title'] = 'Scriptorium Memorialium'; }
  const content = images.length ? [{ type: 'text', text: prompt }, ...(await Promise.all(images.map(async b => ({ type: 'image_url', image_url: { url: typeof b === 'string' ? b : await blobToDataUrl(b) } }))))] : prompt;
  const body = { model, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content }], temperature: .3, stream: true, max_tokens: maxTokens || p.out || 16384 };
  if (json && p.json) body.response_format = { type: 'json_object' };
  // reasoning models think before they write: gpt-oss at 'medium' is ~3x faster than its default 'high' on long JSON
  // and keeps the structure right (measured: a chapter's chain 250 s at the default on OVHcloud)
  if (/gpt-oss/i.test(model) && p.id !== 'pollinations') body.reasoning_effort = 'medium';
  const ctl = new AbortController(), stop = () => ctl.abort(); if (signal) { if (signal.aborted) throw { code: 'cancelled' }; signal.addEventListener('abort', stop, { once: true }); }
  let idle = setTimeout(stop, 90000); const hard = setTimeout(stop, timeoutMs); const t0 = performance.now();
  try {
    let res; try { res = await net(baseOf(p, S) + '/chat/completions', { method: 'POST', headers: H, body: JSON.stringify(body), signal: ctl.signal }); }
    catch (e) { if (signal && signal.aborted) throw { code: 'cancelled' }; throw { code: 'network', message: String(e && e.message || e) }; }
    if (!res.ok) { const t = await res.text().catch(() => ''); throw { code: res.status === 429 || res.status === 402 && /limit/i.test(t) ? 'rate' : res.status === 401 || res.status === 403 ? 'key' : res.status === 404 ? 'model' : res.status === 400 || res.status === 422 ? 'request' : 'server', status: res.status, body: t.slice(0, 600), res }; }
    let text = '', finish = null, usage = null, think = 0;
    const ct = res.headers.get('content-type') || '';
    if (!/event-stream/.test(ct)) { const j = await res.json(); const c = j.choices && j.choices[0]; text = (c && c.message && c.message.content) || ''; finish = c && c.finish_reason; usage = j.usage; onText && onText(text); }
    else {
      const rd = res.body.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;) { const { done, value } = await rd.read(); if (done) break; clearTimeout(idle); idle = setTimeout(stop, 90000); buf += dec.decode(value, { stream: true }); let i;
        while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line.startsWith('data:')) continue; const d = line.slice(5).trim(); if (d === '[DONE]') continue;
          try { const j = JSON.parse(d); if (j.error) throw { code: 'server', body: JSON.stringify(j.error).slice(0, 400) }; const c = j.choices && j.choices[0]; if (c) { const piece = (c.delta && c.delta.content) || ''; if (piece) { text += piece; onText && onText(text); } else if (c.delta && (c.delta.reasoning || c.delta.reasoning_content)) { think += (c.delta.reasoning || c.delta.reasoning_content).length; onThink && onThink(think); } if (c.finish_reason) finish = c.finish_reason; } if (j.usage) usage = j.usage; } catch (e) { if (e && e.code) throw e; } } }
    }
    return { text, finish, usage, ms: performance.now() - t0, model, provider: p.id };
  } catch (e) { if (ctl.signal.aborted && !(signal && signal.aborted)) throw { code: 'timeout' }; if (signal && signal.aborted) throw { code: 'cancelled' }; throw e; }
  finally { clearTimeout(idle); clearTimeout(hard); if (signal) signal.removeEventListener('abort', stop); }
}

// ---------------------------------------------------------------- the router
const hash = s => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36) + '.' + s.length; };
const est = s => Math.ceil(String(s).length / 3.6);
export const lastRoute = { provider: null, model: null };
export const lastBad = [];   // the last answers that did not parse (for the panel's diagnostics)
// every (provider, model) that could take this request, best first
export async function candidates({ images = 0, minRank = 0 } = {}) {
  const out = [];
  await Promise.all(active().map(async p => { let L = []; try { L = await models(p); } catch (e) { return; } L.forEach(m => { if (m.rank >= minRank && (!images || m.vision)) out.push({ p, m: m.id, rank: m.rank + (p.local && !p.discover ? -6 : p.discover ? 2 : 0) })   /* through FreeLLMAPI a model has every key behind it: a little ahead of the same model direct */; }); }));
  return out.sort((a, b) => b.rank - a.rank);
}
// can this page reach the free providers? Outside the Claude app: one keyless provider's model list; inside it: is the
// free-models extension installed and running (remembered for the session; the AI panel asks again)
// (asked only once a free engine is chosen or the panel is opened: nothing is sent anywhere in the Claude mode)
let reachP = null, reachOK = null;
export const reachable = ({ fresh = false } = {}) => (!fresh && reachP) || (reachP = relayP.then(() => via() === 'bridge' ? bridgeReady({ fresh }) : via() === 'relay' ? true : fetch('https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/models', { signal: AbortSignal.timeout(8000) }).then(r => true, () => fetch('https://api.llm7.io/v1/models', { signal: AbortSignal.timeout(8000) }).then(() => true, () => false))).then(v => (reachOK = v)));
if (mode() !== 'claude') reachable(); onSettings(S => { if (S.mode !== 'claude') reachable(); });
// a provider counts only where the page can reach it (inside the Claude app without the extension it cannot: hybrid
// then uses Claude for all)
export const hasAny = () => reachOK !== false && active().length > 0;
export const hasVision = () => active().some(p => p.vision);
// ask: JSON back, or it keeps trying. o.validate(v) → null | 'what is wrong' (a wrong answer moves on to the next model,
// with the problem named once to the same model first). o.onWait(ms, why) when everything is busy; o.exhausted: throw
// { code: 'free_exhausted' } instead of waiting (the hybrid mode then asks Claude).
export async function ask(prompt, o = {}) {
  const { signal, onText, onStatus, validate, images = [] } = o, h = hash(prompt + '|' + images.length);
  const hit = await store.getGlobal('aic:' + h).catch(() => null); if (hit && hit.v && Date.now() - hit.at < 30 * 864e5) { lastRoute.provider = hit.provider + ' (cached)'; lastRoute.model = hit.model; return hit.v; }
  const tried = new Set(); let lastErr = null, fixNote = null;
  for (let round = 0; ; round++) {
    if (signal && signal.aborted) throw { code: 'cancelled' };
    const C = (await candidates({ images: images.length })).filter(c => !tried.has(c.p.id + '|' + c.m));
    let pick = null, soonest = Infinity, why = '';
    for (const c of C) { const b = budget(c.p, c.m); if (b.ok) { pick = c; break; } if (b.until < soonest) { soonest = b.until; why = c.p.name + ' · ' + c.m; } }
    if (!pick) {
      if (!C.length && tried.size) { tried.clear(); if (round > 40) throw lastErr || { code: 'free_failed' }; continue; }   // every model tried once: start again (the budgets have moved on)
      if (!C.length) throw { code: 'free_none', message: 'No free provider is set up or reachable from here.' };
      if (o.exhausted) throw { code: 'free_exhausted', until: soonest };
      const ms = Math.max(1000, soonest - Date.now()); onStatus && onStatus(`Every free model is at its limit; the next one free is ${why} in ${fmtWait(ms)}. Waiting (you can stop).`); o.onWait && o.onWait(ms, why);
      await sleepAbortable(Math.min(ms, 60000), signal); continue;
    }
    const { p, m } = pick, pin = est(prompt);
    onStatus && onStatus(`Writing with ${p.name} · ${m}…`);
    spend(p, m, 0);
    try {
      const r = await call(p, m, fixNote ? prompt + '\n\nYOUR PREVIOUS ANSWER WAS REJECTED: ' + fixNote + '\nReturn the corrected, complete JSON only.' : prompt, { images, signal, onText, onThink: n => onStatus && onStatus(`${p.name} · ${m} is thinking… ${n.toLocaleString()} characters of reasoning`) });
      use().tok[p.id] = (use().tok[p.id] || 0) + ((r.usage && r.usage.total_tokens) || pin + est(r.text)); saveUse();
      let v; try { v = parseJSONLoose(r.text); } catch (e) { lastBad.push({ at: Date.now(), provider: p.id, model: m, finish: r.finish, text: r.text.slice(0, 1500) + (r.text.length > 1500 ? ' … ' + r.text.slice(-500) : '') }); if (lastBad.length > 6) lastBad.shift(); throw { code: 'invalid_json' }; }
      if (r.finish === 'length' || (v && v._truncated)) throw { code: 'truncated' };
      const bad = validate ? validate(v) : null; if (bad) { if (!fixNote) { fixNote = bad; continue; } throw { code: 'invalid', message: bad }; }
      fixNote = null; lastRoute.provider = p.name; lastRoute.model = m;
      store.setGlobal('aic:' + h, { v, at: Date.now(), provider: p.name, model: m }).catch(() => { });
      return v;
    } catch (e) {
      if (e && e.code === 'cancelled') throw e; lastErr = e; fixNote = null; tried.add(p.id + '|' + m);
      if (e.code === 'rate') { const r = resetOf(e.res, e.body); cool(p, m, r.ms, r.day ? 'day' : 'min'); }
      else if (e.code === 'key') cool(p, m, 6 * 3600e3, 'key', true);
      else if (e.code === 'model') banModel(p, m, 864e5);
      else if (e.code === 'request' && /response_format|json/i.test(e.body || '')) { p.json = false; tried.delete(p.id + '|' + m); }
      else if (e.code === 'request' && /max_tokens|max_completion|too large|context/i.test(e.body || '')) { banModel(p, m, 3600e3); }
      else if (e.code === 'network' || e.code === 'server' || e.code === 'timeout') cool(p, m, 90000, 'min', e.code === 'network');
      onStatus && onStatus(`${p.name} · ${m}: ${errText(e)}. Trying the next model…`);
    }
  }
}
export const errText = e => ({ rate: 'at its limit', key: 'key rejected', model: 'model not available', request: 'request refused', server: 'server error', network: 'not reachable from here', timeout: 'too slow', invalid_json: 'answer was not JSON', truncated: 'answer cut off', invalid: 'answer failed the check' }[e && e.code] || (e && (e.message || e.code)) || 'failed');
export const fmtWait = ms => ms < 90000 ? Math.ceil(ms / 1000) + ' s' : ms < 5400e3 ? Math.ceil(ms / 60000) + ' min' : (ms / 3600e3).toFixed(1) + ' h';
const sleepAbortable = (ms, signal) => new Promise((res, rej) => { const t = setTimeout(res, ms); if (signal) signal.addEventListener('abort', () => { clearTimeout(t); rej({ code: 'cancelled' }); }, { once: true }); });
export function resetUsage() { U = null; recent.clear(); try { localStorage.removeItem(UKEY); } catch (e) { } }   // the panel's "Forget today's limits" (and the tests)
export function usageToday() { const u = use(); return { day: u.day, requests: u.n, tokens: u.tok, cool: u.cool }; }
