#!/usr/bin/env node
// Pictures and speech (js/ai/media.js, bridge 1.2): the checks themselves and the bytes' journey, without the Claude app.
//   1. the gates' arithmetic: word error rate, number words, pieces, the picture and audio thresholds
//   2. the extension over stdio: a 3 MB picture and an audio answer come back byte-exact (base64, in slices), an audio
//      upload (multipart, body_b64) arrives byte-exact, a "picture link" that is not a picture is refused, and the
//      address rules still refuse anything else
//   3. the page side: bridgeFetchBytes inside a mocked Claude app, wired to the real server process
// node tools/test-media.mjs
import { spawn } from 'node:child_process'; import http from 'node:http'; import { fileURLToPath } from 'node:url';
import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path'; import { createHash } from 'node:crypto';
const SERVER = fileURLToPath(new URL('../bridge/server/index.mjs', import.meta.url));
let fail = 0; const ok = (c, s) => { console.log((c ? 'ok   ' : 'FAIL ') + s); if (!c) fail++; };
const sha = b => createHash('sha256').update(b).digest('hex');

// ---- 1. the arithmetic
globalThis.localStorage = { getItem: () => null, setItem() { }, removeItem() { } };
const M = await import('../js/ai/media.js');
ok(M.wer('The cat sat on the mat.', 'the cat sat on the mat') === 0, 'wer: punctuation and case do not count');
ok(Math.abs(M.wer('one two three four five six seven eight nine ten', 'one two three four five six seven eight nine') - 0.1) < 1e-9, 'wer: one word dropped of ten = 10 %');
ok(M.wer('It weighs 25 kg', 'it weighs twenty five kg') === 0, 'wer: 25 and "twenty five" are the same words');
ok(M.wer('a 3.5 % rise', 'a three point five percent rise') === 0, 'wer: 3.5 % = three point five percent');
ok(M.wer('Newton’s second law', "newtons second law") === 0, 'wer: apostrophes');
ok(M.wer('force equals mass times acceleration', 'force equals mass times deceleration') === 0.2, 'wer: one wrong word of five = 20 % (rejected at 8 %)');
const P = M.pieces('A. '.repeat(10) + 'x'.repeat(2500), 1100); ok(P.every(p => p.length <= 1100) && P.join('').replace(/\s/g, '').length === ('A.'.repeat(10) + 'x'.repeat(2500)).length, 'pieces: at most 1100 characters each, nothing lost');
ok(M.imageTechnical({ width: 1024, height: 1024, std: .2, black: .1, white: .1, detail: .05 }).length === 0, 'picture: a normal one passes the pixel check');
ok(M.imageTechnical({ width: 256, height: 256, std: .2, black: .1, white: .1, detail: .05 }).some(x => /small/.test(x)), 'picture: 256 px is refused');
ok(M.imageTechnical({ width: 1024, height: 1024, std: .01, black: 0, white: .99, detail: .001 }).length >= 3, 'picture: a blank white square is refused (contrast, white, detail)');
const A0 = { seconds: 10, lead: .2, sampleRate: 24000, clip: 0, longestGap: .6, rms: .08, voicedSeconds: 8 };
ok(M.speechTechnical(A0, 25).bad.length === 0, 'speech: 25 words in 10 s, clean, passes');
ok(M.speechTechnical({ ...A0, clip: .01 }, 25).bad.some(x => /clipped/.test(x)), 'speech: 1 % clipped samples is refused');
ok(M.speechTechnical({ ...A0, longestGap: 3.2 }, 25).bad.some(x => /silence/.test(x)), 'speech: a 3.2 s silence inside is refused');
ok(M.speechTechnical(A0, 60).bad.some(x => /fast/.test(x)), 'speech: 60 words in 10 s (words skipped) is refused');
ok(M.speechTechnical(A0, 10).bad.some(x => /slow/.test(x)), 'speech: 10 words in 10 s (padded) is refused');

// ---- 2. the extension
const PIC = Buffer.alloc(3_000_000); for (let i = 0; i < PIC.length; i++) PIC[i] = (i * 2654435761) >>> 24; PIC.set([0x89, 0x50, 0x4e, 0x47], 0);
const MP3 = Buffer.alloc(48_000); for (let i = 0; i < MP3.length; i++) MP3[i] = (i * 40503) & 255; MP3.set([0x49, 0x44, 0x33], 0);
let upload = null;
const srv = http.createServer((q, r) => {
  const chunks = []; q.on('data', c => chunks.push(c)); q.on('end', () => { const body = Buffer.concat(chunks);
    if (q.url === '/v1/images/generations') { r.writeHead(200, { 'content-type': 'application/json' }); return r.end(JSON.stringify({ data: [{ b64_json: PIC.toString('base64') }], model: 'flux-1-schnell', provider: 'cloudflare' })); }
    if (q.url === '/v1/audio/speech') { r.writeHead(200, { 'content-type': 'audio/mpeg', 'x-provider': 'cloudflare' }); return r.end(MP3); }
    if (q.url === '/v1/audio/transcriptions') { upload = body; r.writeHead(200, { 'content-type': 'application/json' }); return r.end('{"text":"heard"}'); }
    if (q.url === '/pic.png') { r.writeHead(200, { 'content-type': 'image/png' }); return r.end(PIC.subarray(0, 5000)); }
    if (q.url === '/page.html') { r.writeHead(200, { 'content-type': 'text/html' }); return r.end('<html>'); }
    r.writeHead(404); r.end(); }); }).listen(0);
const base = `http://127.0.0.1:${srv.address().port}`;
const HOME = mkdtempSync(join(tmpdir(), 'smm-'));
const p = spawn(process.execPath, [SERVER], { env: { ...process.env, HOME, USERPROFILE: HOME, APPDATA: join(HOME, 'AppData') } }); let buf = '', n = 0; const wait = new Map();
p.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); const f = wait.get(m.id); if (f) { wait.delete(m.id); f(m); } } });
const rpc = (method, params) => new Promise(res => { const id = ++n; wait.set(id, res); p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n'); });
const tool = async (name, args) => { const m = await rpc('tools/call', { name, arguments: args }); return m.result.isError ? { err: m.result.content[0].text } : m.result.structuredContent; };
await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
const info = await tool('bridge_info', {}); ok(info.version === '1.2.0', 'extension: version 1.2.0');
const L = await rpc('tools/list', {}); ok(L.result.tools.find(t => t.name === 'http_start').inputSchema.properties.binary, 'extension: http_start takes binary');
async function pull(id) { let from = 0, text = '', r, polls = 0; for (;;) { r = await tool('http_poll', { id, from, wait_ms: 5000, have_status: true }); polls++; text += r.text || ''; from = r.next; if (r.done) break; } return { r, text, polls }; }
{ const { id } = await tool('http_start', { url: base + '/v1/audio/speech', method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"input":"x"}', binary: true });
  const { r, text } = await pull(id); ok(r.status === 200 && r.encoding === 'base64' && sha(Buffer.from(text, 'base64')) === sha(MP3), 'extension: an audio answer comes back byte-exact (base64)'); }
{ const { id } = await tool('http_start', { url: base + '/v1/images/generations', method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"prompt":"x"}', binary: true });
  const { r, text, polls } = await pull(id); const j = JSON.parse(Buffer.from(text, 'base64').toString()); ok(sha(Buffer.from(j.data[0].b64_json, 'base64')) === sha(PIC), 'extension: a 3 MB picture comes back byte-exact'); ok(polls >= 3, `extension: …in slices (${polls} polls of at most 1.5 MB)`); }
{ const AUD = Buffer.from([0, 1, 2, 250, 251, 252, 255, 13, 10, 0]); const { id } = await tool('http_start', { url: base + '/v1/audio/transcriptions', method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=B' }, body_b64: AUD.toString('base64') });
  const { r } = await pull(id); ok(r.status === 200 && upload && sha(upload) === sha(AUD), 'extension: an upload (body_b64) arrives byte-exact'); }
{ const { id } = await tool('http_start', { url: base + '/page.html', media: 'image' }); const { r } = await pull(id); ok(r.error === 'not an image', 'extension: a "picture link" that answers with a page is refused'); }
{ const { id } = await tool('http_start', { url: base + '/pic.png', media: 'image' }); const { r, text } = await pull(id); ok(r.status === 200 && Buffer.from(text, 'base64').length === 5000, 'extension: a picture link that is a picture is fetched'); }
ok(/Refused/.test((await tool('http_start', { url: 'https://example.com/index.html' })).err || ''), 'extension: an ordinary web page is still refused');
ok(/Refused/.test((await tool('http_start', { url: 'http://example.com/a.png', media: 'image' })).err || ''), 'extension: a picture link over plain http (not this computer) is refused');
ok(/Refused/.test((await tool('http_start', { url: 'https://example.com/a.png', media: 'image', method: 'POST' })).err || ''), 'extension: a picture link may only be fetched (GET)');

// ---- 3. the page side, inside a mocked Claude app
globalThis.window = globalThis; globalThis.claude = { use: async name => name === 'mcp' ? { callTool: async (server, name, args) => { if (server !== 'host:scriptorium-free') throw { code: 'server_not_connected' }; const m = await rpc('tools/call', { name, arguments: args }); if (m.result.isError) throw { code: 'tool_error', message: m.result.content[0].text }; return { payload: m.result.structuredContent }; } } : null };
const B = await import('../js/ai/bridge.js');
ok(await B.bridgeReady({ fresh: true }) && B.bridgeBinary(), 'page: the extension is found and carries bytes');
{ const r = await B.bridgeFetchBytes(base + '/v1/audio/speech', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"input":"x"}' }); ok(r.status === 200 && r.headers.get('x-provider') === 'cloudflare' && sha(Buffer.from(await r.arrayBuffer())) === sha(MP3), 'page: bridgeFetchBytes returns the audio as a Response, headers kept'); }
{ const U = new Uint8Array([9, 8, 7, 0, 255]); upload = null; await B.bridgeFetchBytes(base + '/v1/audio/transcriptions', { method: 'POST', body: U }); ok(upload && sha(upload) === sha(Buffer.from(U)), 'page: bytes go up byte-exact'); }

p.kill(); srv.close();
console.log(fail ? `${fail} failed` : 'all passed'); process.exit(fail ? 1 : 0);
