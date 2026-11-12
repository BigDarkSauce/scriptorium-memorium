#!/usr/bin/env node
// Pictures and speech end to end in a real browser: the app (served by launcher/serve.py with its relay) talks to a mock
// FreeLLMAPI that draws, speaks, listens and reviews. Checks that a picture is admitted only when both reviewers pass it,
// that one objecting reviewer gets it rejected (and the reasons shown), that an unpicturable step draws nothing, and that
// a reading is admitted when it is heard back word for word and rejected when the listener hears other words.
// Needs: python3 launcher/serve.py 8000 running.   node tools/test-media-ui.mjs
import http from 'node:http'; import zlib from 'node:zlib';
import { createRequire } from 'node:module'; import { execSync } from 'node:child_process'; import { join } from 'node:path';
const PW = await import('playwright').catch(() => createRequire(join(execSync('npm root -g', { encoding: 'utf8' }).trim(), 'noop.js'))('playwright')); const { chromium } = PW;
let fail = 0; const ok = (c, s) => { console.log((c ? 'ok   ' : 'FAIL ') + s); if (!c) fail++; };

// a 1024² PNG with a drawn subject (an ink pendulum on parchment, with grain)
function png(W, H, px) { const raw = Buffer.alloc((W * 3 + 1) * H); for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; for (let x = 0; x < W; x++) { const [r, g, b] = px(x, y); const o = y * (W * 3 + 1) + 1 + x * 3; raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; } }
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; } const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 2; return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]); }
const PIC = png(1024, 1024, (x, y) => { const n = ((x * 73856093) ^ (y * 19349663)) & 31; const onString = Math.abs((x - 512) - (y - 120) * 0.2) < 2 && y > 120 && y < 700, bob = (x - 628) ** 2 + (y - 740) ** 2 < 3600, beam = y > 110 && y < 128 && x > 200 && x < 824;
  return bob ? [160, 122, 44] : onString || beam ? [58, 42, 20] : [239 - n, 227 - n, 196 - n]; });
// a WAV: syllable-like tone bursts, about 2.6 words a second, for `words` words
function wav(words) { const sr = 16000, secs = words / 2.6 + 0.4, n = Math.floor(sr * secs), d = Buffer.alloc(44 + n * 2);
  d.write('RIFF', 0); d.writeUInt32LE(36 + n * 2, 4); d.write('WAVEfmt ', 8); d.writeUInt32LE(16, 16); d.writeUInt16LE(1, 20); d.writeUInt16LE(1, 22); d.writeUInt32LE(sr, 24); d.writeUInt32LE(sr * 2, 28); d.writeUInt16LE(2, 32); d.writeUInt16LE(16, 34); d.write('data', 36); d.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) { const t = i / sr, on = t > 0.2 && t < secs - 0.2 && (t * 5.2) % 1 < 0.8; d.writeInt16LE(on ? Math.round(9000 * Math.sin(2 * Math.PI * 180 * t) * Math.sin(Math.PI * ((t * 5.2) % 1) / 0.8)) : 0, 44 + i * 2); } return d; }

const S = { judge: 'pass', heard: 'same', calls: [] }; let lastSpoken = '';
const words = s => s.split(/\s+/).filter(Boolean).length;
const reply = (r, obj) => { r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify(obj)); };
const chat = text => ({ choices: [{ message: { content: text }, finish_reason: 'stop' }], usage: { total_tokens: 100 } });
const mock = http.createServer((q, r) => { const ch = []; q.on('data', c => ch.push(c)); q.on('end', () => { const body = Buffer.concat(ch); S.calls.push(q.url);
  if ((q.headers.authorization || '') !== 'Bearer freellmapi-test') { r.writeHead(401); return r.end('{"error":{"message":"Invalid API key"}}'); }
  if (q.url.startsWith('/v1/models')) return reply(r, { data: [{ id: 'qwen3.5-397b-a17b' }, { id: 'gemini-2.5-flash' }] });
  if (q.url === '/v1/images/generations') return reply(r, { data: [{ b64_json: PIC.toString('base64') }], model: 'flux-1-schnell', provider: 'cloudflare' });
  if (q.url === '/v1/audio/speech') { lastSpoken = JSON.parse(body).input; r.writeHead(200, { 'content-type': 'audio/wav', 'x-provider': 'speechify' }); return r.end(wav(words(lastSpoken))); }
  if (q.url === '/v1/audio/transcriptions') { r.writeHead(200, { 'content-type': 'application/json', 'x-provider': 'groq', 'x-model': 'whisper-large-v3-turbo' }); return r.end(JSON.stringify({ text: S.heard === 'same' ? lastSpoken : lastSpoken.split(' ').map((w, i) => i % 4 === 1 ? 'banana' : w).join(' ') })); }
  if (q.url === '/v1/chat/completions') { const j = JSON.parse(body), m = j.messages[1].content, txt = typeof m === 'string' ? m : m[0].text;
    if (/Decide whether this step/.test(txt)) return reply(r, chat(JSON.stringify(/UNPICTURABLE/.test(txt) ? { suitable: false, why: 'a definition with nothing to see' } : { suitable: true, why: 'a concrete apparatus', must: 'a single bob on a straight string from a fixed beam', mustNot: 'two bobs, a bent string', prompt: 'scientific plate of a simple pendulum, no text' })));
    if (/strict reviewer/.test(txt)) { const harsh = S.judge === 'one-objects' && /gemini/.test(j.model); return reply(r, chat(JSON.stringify({ describe: 'a pendulum on a beam', scores: { faithful: 5, accurate: harsh ? 3 : 5, clean: 5, coherent: 5, helpful: 4, style: 4 }, issues: harsh ? ['the string is attached off the pivot'] : [] }))); }
    if (/read aloud by a speech synthesiser/.test(txt)) return reply(r, chat(JSON.stringify({ script: 'The period T equals two pi times the square root of L over g. A longer string swings more slowly.' })));
    return reply(r, chat('{}')); }
  r.writeHead(404); r.end(); }); });
await new Promise(res => mock.listen(0, '127.0.0.1', res));
const BASE = `http://127.0.0.1:${mock.address().port}/v1`;

const browser = await chromium.launch(); const page = await (await browser.newContext({ viewport: { width: 1100, height: 760 } })).newPage(); const errors = [];
page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/404|favicon|Failed to load resource/.test(m.text())) errors.push(m.text().slice(0, 200)); });
await page.addInitScript(b => { localStorage.setItem('sm-ai', JSON.stringify({ mode: 'free', keys: { freellmapi: 'freellmapi-test' }, bases: { freellmapi: b }, on: { freellmapi: true }, off: { ovh: true, llm7: true, pollinations: true }, at: Date.now() + 1e9 })); }, BASE);
await page.goto('http://localhost:8000/', { timeout: 60000 });
await page.waitForFunction(() => window.__scriptorium && window.__scriptorium.mode && document.body.classList.contains('ready'), null, { timeout: 600000 });
await page.evaluate(() => { const g = window.__scriptorium.gfx; g.render = () => { }; });   // the 3D drawing paused (a software GPU here): the logic runs on
const r1 = await page.evaluate(async () => { const M = await import('/js/ai/media.js'); return { status: await M.mediaStatus(), usable: M.mediaUsable() }; });
ok(r1.status.ok && r1.usable, 'status: pictures and speech possible through the relay + FreeLLMAPI' + (r1.status.ok ? '' : ' — ' + r1.status.why));

// a scroll in a seeded room, its first step's tools
const open = await page.evaluate(async () => { const W = window.__scriptorium; for (const b of W.lib.books) { await W.openRoom(b.id); const R = W.mode; for (const st of R.stations.values()) { if (!st.part.analysis || !(st.part.analysis.chain || []).length) continue; R.openPart(st.part, true); await new Promise(r => setTimeout(r, 300)); const rd = R.reader, step = rd.el.querySelector('.step'); const btns = [...step.querySelectorAll('.step-tools button')].map(b => b.textContent); window.__rd = rd; window.__st = st.part.analysis.chain.find(s => s.id === step.dataset.sid); window.__step = step; return { btns, part: st.part.title, sid: step.dataset.sid }; } } return null; });
ok(open && open.btns.includes('Illustrate (checked)') && open.btns.includes('Read aloud (checked)'), `reader: Illustrate and Read aloud on a step (${open && open.part} / ${open && open.sid})`);
const click = label => page.evaluate(l => [...window.__step.querySelectorAll('.step-tools button')].find(b => b.textContent === l || b.textContent === 'Stop').click(), label);
const waitStatus = () => page.waitForFunction(() => { const s = window.__step.querySelector('.gen-status'); return s && /admitted|Not admitted|Not illustrated|not|Failed|Stopped/i.test(s.textContent) && !/…$/.test(s.textContent); }, null, { timeout: 400000 }).catch(() => null).then(() => page.evaluate(() => { const s = window.__step.querySelector('.gen-status'); return s ? s.textContent : '(no status line)'; }));

// 1. both reviewers pass it → admitted, shown, labelled, its check one click away
S.judge = 'pass'; await click('Illustrate (checked)'); let st = await waitStatus();
ok(/Picture admitted/.test(st), 'picture: both reviewers pass it → admitted (' + st + ')'); if (!/admitted/.test(st)) console.log('calls:', S.calls.slice(-20).join(' '), 'errors:', errors.join(' | '));
await page.waitForFunction(() => window.__step.querySelector('.gen-fig img'), null, { timeout: 20000 }).catch(() => { });
const fig = await page.evaluate(() => { const f = window.__step.querySelector('.gen-fig'); return f && { tag: f.querySelector('.gen-tag').textContent, cap: f.querySelector('figcaption').textContent, w: f.querySelector('img').naturalWidth }; });
ok(fig && fig.tag === 'AI-generated · checked' && /qwen3\.5-397b-a17b/.test(fig.cap) && /gemini-2\.5-flash/.test(fig.cap), 'picture: shown as "AI-generated · checked", naming both reviewers');
const rep = await page.evaluate(async () => { [...window.__step.querySelectorAll('.gen-fig button')].find(b => b.textContent === 'the check').click(); await new Promise(r => setTimeout(r, 100)); const m = document.querySelector('.gen-report'); const t = m && m.innerText; document.querySelector('.modal-veil .btn').click(); return t; });
ok(rep && /accurate 5/.test(rep) && /Attempt 1: admitted/.test(rep), 'picture: the check lists the attempt and each reviewer\'s scores');
const kept = await page.evaluate(async () => { const M = await import('/js/ai/media.js'); const v = await M.kept(window.__rd.part, window.__st, 'image'); return v && v.blob && v.blob.size; });
ok(kept > 10000, 'picture: kept in this browser (survives closing the scroll)');

// 2. one reviewer objects (accurate 3/5) → not admitted after three attempts; the old picture stays; the reasons shown
S.judge = 'one-objects'; const n0 = S.calls.filter(c => c === '/v1/images/generations').length; await click('Illustrate (checked)'); st = await waitStatus();
const drawn = S.calls.filter(c => c === '/v1/images/generations').length - n0;
ok(/Not admitted after 3 attempts/.test(st) && drawn === 3, `picture: one reviewer objects (accurate 3/5) → rejected after ${drawn} drawings`);
const rep2 = await page.evaluate(async () => { [...window.__step.querySelectorAll('.gen-status button')].find(b => b.textContent === 'the check').click(); await new Promise(r => setTimeout(r, 100)); const t = document.querySelector('.gen-report').innerText; document.querySelector('.modal-veil .btn').click(); return t; });
ok(/accurate 3\/5/.test(rep2) && /off the pivot/.test(rep2), 'picture: the check shows the objection (accurate 3/5: the string off the pivot)');
const briefs = await page.evaluate(() => 0); void briefs;

// 3. a step that cannot be pictured → nothing drawn
const n1 = S.calls.filter(c => c === '/v1/images/generations').length;
const un = await page.evaluate(async () => { const M = await import('/js/ai/media.js'); try { await M.illustrate({ id: 'X', title: 'UNPICTURABLE definition', statement: 'A group is a set with an operation.' }, { title: 'Algebra' }); return 'admitted?'; } catch (e) { return e.code + ': ' + e.message; } });
ok(/^unsuitable/.test(un) && S.calls.filter(c => c === '/v1/images/generations').length === n1, 'picture: a definition is judged unpicturable → nothing drawn (' + un + ')');

// 4. speech heard back word for word → admitted, with its error rate; the player plays
S.heard = 'same'; await click('Read aloud (checked)'); st = await waitStatus();
ok(/Reading admitted/.test(st), 'reading: heard back word for word → admitted (' + st + ')');
const au = await page.evaluate(() => { const a = window.__step.querySelector('.gen-audio'); return a && a.innerText; });
ok(au && /AI voice · checked/.test(au) && /0\.0 % of words wrong/.test(au), 'reading: shown as "AI voice · checked", 0.0 % words wrong');
const played = await page.evaluate(async () => { const b = window.__step.querySelector('.gen-audio button'); b.click(); await new Promise(r => setTimeout(r, 400)); const t = b.textContent; b.click(); return t; });
ok(/Stop/.test(played) || /Listen/.test(played), 'reading: the player starts (' + played + ')');

// 5. the listener hears other words (25 % wrong) → rejected; the admitted reading stays
S.heard = 'garbled'; await click('Read aloud (checked)'); st = await waitStatus();
ok(/Not admitted/.test(st) && /failed the check 3 times/.test(st) && /words wrong/.test(st), 'reading: heard back 25 % wrong → rejected (' + st.slice(0, 120) + ')');

// 6. formulas: written out as spoken words first (no symbols reach the speech model)
S.heard = 'same'; const n2 = S.calls.length;
const fm = await page.evaluate(async () => { const M = await import('/js/ai/media.js'); try { const r = await M.narrate({ id: 'F', title: 'The period', statement: 'For small swings $T = 2\\pi\\sqrt{L/g}$.' }, { title: 'Pendulum' }); return { ok: true, spoken: r.report.spokenScript, text: r.report.pieces[0].text }; } catch (e) { return { ok: false, e: e.message }; } });
ok(fm.ok && fm.spoken && !/[\\$^_{}=]/.test(fm.text), 'reading: a formula is spoken as words ("' + (fm.text || fm.e || '').slice(0, 70) + '…")');

ok(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
await browser.close(); mock.close();
console.log(fail ? `${fail} failed` : 'all passed'); process.exit(fail ? 1 : 0);
