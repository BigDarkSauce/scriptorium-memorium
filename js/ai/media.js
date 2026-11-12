// Pictures and speech from the free models (through FreeLLMAPI on your computer), admitted only past a strict check.
//
// WHY A GATE. An image model draws what looks right, not what is right: an insect with eight legs, a pendulum hanging
// sideways, a label in invented letters. A speech model can skip a line, mispronounce a symbol, clip or fall silent.
// In a study tool a wrong picture or a misread formula teaches the wrong thing, so nothing generated reaches a scroll
// unless it passes every check below; a failed attempt is retried with the reviewers' objections, and after the last
// attempt the step simply keeps no picture or no reading (the reasons are shown, nothing is used).
//
// PICTURES (illustrate)
//   0. picturable?  a writer model first decides whether the step can be shown truthfully as a picture at all (an
//                   abstract theorem usually cannot: then nothing is drawn) and writes the brief: what must be seen,
//                   what must not, and the image prompt (no text, letters or numbers in the picture: generators garble
//                   them; a sober scientific-plate style).
//   1. technical    the file decodes; at least 512 px a side; not blank, not washed out, not a flat field (contrast and
//                   detail measured on the pixels; set to catch broken output only: a sparse ink drawing on parchment,
//                   the asked-for style, measures contrast 0.07 and detail 0.007 and passes; a blank square measures 0).
//   2. two judges   two independent vision models of different families (Claude inside the Claude app, and a free
//                   vision model; or two free ones) each score the picture against the step: faithful, accurate,
//                   clean (no text, letters, watermarks), coherent (no melted shapes, extra limbs), helpful, style.
//                   Admitted only if EVERY judge gives accurate = 5, clean = 5 and every other score >= 4. The app
//                   decides from the scores, not from a judge's own "pass". With fewer than two judges available
//                   nothing is admitted.
// SPEECH (narrate)
//   0. script       the step's words; any formula is first written out as spoken English by a writer model (a speech
//                   model cannot read TeX), and that script is checked to hold no symbols.
//   1. technical    each piece decodes; speaking rate 1.6–4.2 words a second; no clipping (< 0.2 % of samples at full
//                   scale); no silence longer than 2 s inside; not too quiet; one voice (one provider) throughout.
//   2. listened back  each piece is transcribed by a speech-to-text model (Whisper) and compared word by word with the
//                   script: word error rate <= 8 % per piece and <= 5 % over the reading, and no piece longer or
//                   shorter than the script by more than 15 %.
// What passed is kept in this browser (IndexedDB) with its report: the reviewers, their scores, the error rates.
import * as FREE from './free.js';
import * as store from '../store.js';
import { bridgeFetchBytes, bridgeReady, bridgeBinary } from './bridge.js';
import { askJSON, parseJSONLoose, claudeSample, claudeImageCount } from './claude.js';

export const RULES = { imgMin: 512, judges: 2, minScore: 4, strictKeys: ['accurate', 'clean'], imgTries: 3, wps: [1.6, 4.2], clip: 0.002, gap: 2.0, werPiece: 0.08, werAll: 0.05, lenTol: 0.15, speechTries: 3, pieceChars: 1100 };
const SCORE_KEYS = ['faithful', 'accurate', 'clean', 'coherent', 'helpful', 'style'];

// ---------------------------------------------------------------- reaching FreeLLMAPI's media endpoints
function fla() { const S = FREE.settings(), p = FREE.PROVIDERS.find(x => x.id === 'freellmapi'); return { base: FREE.baseOf(p, S), key: FREE.keyOf(p, S), on: FREE.isOn(p, S) }; }
async function req(url, { method = 'GET', headers = {}, body, signal, media } = {}) {
  await FREE.netReady();
  const v = FREE.via();
  if (v === 'bridge') return bridgeFetchBytes(url, { method, headers, body, signal, media });
  if (v === 'relay') return fetch('/__relay/fetch?u=' + encodeURIComponent(url) + (media ? '&media=' + media : ''), { method, headers, body, signal });
  return fetch(url, { method, headers, body, signal });
}
const errOf = async (r, what) => { const t = await r.text().catch(() => ''); let m = t; try { const j = JSON.parse(t); m = (j.error && (j.error.message || j.error)) || t; } catch (e) { } return { code: r.status === 429 ? 'rate' : r.status === 401 || r.status === 403 ? 'key' : r.status === 503 ? 'none' : 'media', status: r.status, message: what + ': ' + String(m).slice(0, 300) }; };
// can pictures and speech be made from here? (what is missing, in words, when not)
export async function mediaStatus() {
  const F = fla();
  if (!F.on || !F.base) return { ok: false, why: 'FreeLLMAPI is not connected (AI panel: FreeLLMAPI row).' };
  if (!F.key) return { ok: false, why: 'FreeLLMAPI\'s unified key is missing (AI panel: FreeLLMAPI row, or its dashboard: Keys → Unified API key).' };
  await FREE.netReady();
  if (FREE.via() === 'bridge') { if (!(await bridgeReady())) return { ok: false, why: 'The Scriptorium extension is not running.' }; if (!bridgeBinary()) return { ok: false, why: 'The Scriptorium extension is older than 1.2 (pictures and sound need 1.2): install the new one from the AI panel.' }; }
  if (FREE.via() === 'direct') return { ok: false, why: 'From a web address the page cannot reach FreeLLMAPI on your computer: open it in the Claude app (with the extension) or with Launch Scriptorium.bat.' };
  return { ok: true };
}
export const bridgeBinaryOK = () => FREE.via() !== 'bridge' || bridgeBinary();
export const mediaUsable = () => { const F = fla(); return !!(F.on && F.base && F.key && FREE.via() !== 'direct'); };

// ---------------------------------------------------------------- small helpers
const b64ToBlob = (b, type) => { const bin = atob(b), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type }); };
const sniff = u8 => u8[0] === 0x89 && u8[1] === 0x50 ? 'image/png' : u8[0] === 0xff && u8[1] === 0xd8 ? 'image/jpeg' : u8[0] === 0x52 && u8[8] === 0x57 ? 'image/webp' : 'image/png';
export const hashKey = s => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36) + '.' + s.length; };
const plain = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const hasMath = s => /\$|\\\(|\\\[|\\[a-zA-Z]+|[_^{}]|[=<>±×÷√∑∫∂∞≤≥≠≈→←↔∝∇πσμλθαβγδΔΩ]/.test(s);
function stepText(st) {
  const parts = [st.title, st.statement, ...(st.explain || []).map(p => typeof p === 'string' ? p : p && p.text), st.math ? '$$' + st.math + '$$' : '', st.intuition ? 'Picture it. ' + st.intuition : ''].filter(Boolean).map(plain);
  return parts.join('\n\n');
}

// ---------------------------------------------------------------- PICTURES
async function genImage(prompt, signal) {
  const F = fla();
  const r = await req(F.base + '/images/generations', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + F.key }, body: JSON.stringify({ model: 'auto', prompt, n: 1, size: '1024x1024', response_format: 'b64_json' }), signal });
  if (!r.ok) throw await errOf(r, 'image generation');
  const j = await r.json(), d = j.data && j.data[0]; if (!d) throw { code: 'media', message: 'image generation: empty answer' };
  let blob;
  if (d.b64_json) { const raw = d.b64_json.replace(/^data:[^,]+,/, ''); const bin = atob(raw.slice(0, 16)); blob = b64ToBlob(raw, sniff([...bin].map(c => c.charCodeAt(0)))); }
  else if (/^data:/.test(d.url || '')) { const [h, b] = d.url.split(','); blob = b64ToBlob(b, (h.match(/data:([^;]+)/) || [])[1] || 'image/png'); }
  else if (d.url) { const r2 = await req(d.url, { media: 'image', signal }); if (!r2.ok) throw await errOf(r2, 'fetching the picture'); blob = await r2.blob(); }
  else throw { code: 'media', message: 'image generation: no picture in the answer' };
  return { blob, model: j.model || 'auto', provider: j.provider || '' };
}
// the pixels: size, contrast, exposure, detail
export async function imageStats(blob) {
  const bm = await createImageBitmap(blob); const W = bm.width, H = bm.height, N = 96;
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(N, N) : Object.assign(document.createElement('canvas'), { width: N, height: N });
  const g = c.getContext('2d'); g.drawImage(bm, 0, 0, N, N); const px = g.getImageData(0, 0, N, N).data; bm.close && bm.close();
  const L = new Float32Array(N * N); let sum = 0, black = 0, white = 0;
  for (let i = 0; i < N * N; i++) { const l = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255; L[i] = l; sum += l; if (l < 0.03) black++; if (l > 0.97) white++; }
  const mean = sum / (N * N); let v = 0, grad = 0; for (let i = 0; i < N * N; i++) { v += (L[i] - mean) ** 2; if (i % N < N - 1) grad += Math.abs(L[i + 1] - L[i]); if (i < N * (N - 1)) grad += Math.abs(L[i + N] - L[i]); }
  return { width: W, height: H, mean, std: Math.sqrt(v / (N * N)), black: black / (N * N), white: white / (N * N), detail: grad / (2 * N * (N - 1)) };
}
export function imageTechnical(s) {
  const bad = [];
  if (Math.min(s.width, s.height) < RULES.imgMin) bad.push(`too small (${s.width}×${s.height}; at least ${RULES.imgMin} px a side)`);
  if (s.std < 0.03) bad.push('almost no contrast (a flat or blank picture)');
  if (s.black > 0.6) bad.push('mostly black'); if (s.white > 0.85) bad.push('mostly white (washed out)');
  if (s.detail < 0.003) bad.push('almost no detail (blurred or empty)');
  return bad;
}
// a smaller JPEG for the reviewers (the same picture; less to send)
async function forJudge(blob) {
  const bm = await createImageBitmap(blob), k = Math.min(1, 768 / Math.max(bm.width, bm.height)), w = Math.round(bm.width * k), h = Math.round(bm.height * k);
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  c.getContext('2d').drawImage(bm, 0, 0, w, h); bm.close && bm.close();
  return c.convertToBlob ? c.convertToBlob({ type: 'image/jpeg', quality: 0.9 }) : new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
}
const judgePrompt = (st, brief) => `You are a strict reviewer for a scholarly study app. An image model drew a picture meant to illustrate one step of a textbook chapter. Reject anything a careful teacher would not put in front of a student. Judge only what you actually see in the picture.

THE STEP: ${plain(st.title)}
${plain(st.statement || '').slice(0, 900)}

WHAT THE PICTURE MUST SHOW: ${brief.must}
WHAT IT MUST NOT SHOW: ${brief.mustNot || 'anything contradicting the step'}

Score each from 0 to 5 (5 = flawless):
- faithful: it shows the intended subject, and nothing in it contradicts the step
- accurate: no factual, scientific, anatomical, physical or geometric error is visible (wrong count of parts, impossible structure, wrong arrangement, wrong direction of a force or flow)
- clean: no text, letters, numbers, labels, watermarks, signatures or logos at all (any visible writing scores 0)
- coherent: no rendering faults (melted or merged shapes, extra or missing limbs, duplicated objects, broken perspective)
- helpful: a learner understands the step better from it; it is not merely decorative
- style: sober and precise, like a scientific plate or engraving; not cartoonish, not sensational

Return ONE JSON object only:
{"describe":"one sentence: what the picture actually shows","scores":{"faithful":0,"accurate":0,"clean":0,"coherent":0,"helpful":0,"style":0},"issues":["each concrete problem you see"]}`;
const family = id => { const s = String(id).toLowerCase().replace(/^[\w-]+\//, ''); const m = s.match(/gemini|gemma|qwen|llama|mistral|pixtral|gpt|glm|nemotron|kimi|deepseek|phi|internvl|minicpm|command|aya|grok|claude/); return m ? m[0].replace('gemma', 'gemini').replace('pixtral', 'mistral') : s.split(/[-:]/)[0]; };
function scoreOK(J) { const s = J && J.scores; if (!s) return ['no scores']; const bad = []; SCORE_KEYS.forEach(k => { const v = +s[k]; if (!(v >= 0)) bad.push(k + ' missing'); else if (RULES.strictKeys.includes(k) ? v < 5 : v < RULES.minScore) bad.push(`${k} ${v}/5`); }); return bad; }
// the reviewers: Claude (inside the Claude app) and free vision models, at most one per model family
async function judges() {
  const out = [];
  if (claudeImageCount() > 0) out.push({ id: 'claude', name: 'Claude', fam: 'claude' });
  const C = await FREE.candidates({ images: 1, minRank: 55 }).catch(() => []);
  for (const c of C) { const f = family(c.m); if (out.some(j => j.fam === f) || /^auto/.test(c.m)) continue; out.push({ id: c.p.id + '|' + c.m, name: c.p.name + ' · ' + c.m, fam: f, c }); }
  return out;
}
async function runJudge(j, prompt, img, signal) {
  if (j.id === 'claude') { const { text } = await claudeSample(prompt, { images: [img], modelTier: 'default', cache: false, signal }); return parseJSONLoose(text); }
  const r = await FREE.call(j.c.p, j.c.m, prompt, { images: [img], signal, maxTokens: 1500, timeoutMs: 120000 }); return parseJSONLoose(r.text);
}
async function review(st, brief, blob, signal, onStatus) {
  const img = await forJudge(blob), prompt = judgePrompt(st, brief), pool = await judges(), done = [];
  for (const j of pool) {
    if (done.length >= RULES.judges) break;
    onStatus && onStatus(`Reviewing the picture: ${j.name}…`);
    try { const v = await runJudge(j, prompt, img, signal); if (!v || !v.scores) continue; done.push({ judge: j.name, family: j.fam, describe: String(v.describe || '').slice(0, 300), scores: v.scores, issues: (v.issues || []).map(String).slice(0, 8), failed: scoreOK(v) }); }
    catch (e) { if (e && e.code === 'cancelled') throw e; /* that reviewer is busy or broken: the next family */ }
  }
  return done;
}
const BRIEF = (st, A, avoid) => `Decide whether this step of a textbook chapter can be shown truthfully as ONE picture without any writing in it, and if so write the brief for an image model.

CHAPTER: ${plain(A && A.title)}
STEP: ${plain(st.title)}
${stepText(st).slice(0, 2500)}
${avoid.length ? '\nEARLIER ATTEMPTS WERE REJECTED BY REVIEWERS FOR: ' + avoid.join('; ') + '\nWrite a brief that prevents these problems (simpler composition, fewer elements, clearer subject).' : ''}
Rules: a picture is suitable only if it shows a concrete object, organism, apparatus, scene, process stage or spatial arrangement that the step is about. A pure definition, an equation, a proof or an argument is NOT suitable (answer suitable: false). The picture may contain NO text, letters, numbers, labels, arrows with words, or equations. Prefer one clear subject on a plain background.

Return ONE JSON object:
{"suitable":true,"why":"one sentence","must":"what must be clearly visible, concretely (counts, arrangement, proportions)","mustNot":"what would be wrong (common errors to avoid)","prompt":"the image prompt in English, at most 70 words: the subject described concretely, then: scientific illustration plate, fine ink linework with muted watercolour, plain parchment-coloured background, accurate proportions, no text, no letters, no labels, no numbers, no watermark"}`;
const briefOK = v => !v || typeof v !== 'object' ? 'not an object' : v.suitable === false ? null : !v.must || !v.prompt ? 'must and prompt are required' : String(v.prompt).length > 900 ? 'prompt too long' : null;
// illustrate one step: the admitted picture, or { code: 'rejected' | 'unsuitable', report }
export async function illustrate(st, A, { signal, onStatus } = {}) {
  const ms = await mediaStatus(); if (!ms.ok) throw { code: 'media_off', message: ms.why };
  const report = { kind: 'image', step: st.id, at: Date.now(), attempts: [], rules: { judges: RULES.judges, strict: RULES.strictKeys, min: RULES.minScore } }; const avoid = [];
  for (let k = 0; k < RULES.imgTries; k++) {
    onStatus && onStatus(k ? `Attempt ${k + 1} of ${RULES.imgTries}: a new brief that avoids the reviewers' objections…` : 'Deciding whether this step can be pictured truthfully…');
    const brief = await askJSON(BRIEF(st, A, avoid), { signal, onStatus, role: 'worker', tier: 'default', validate: briefOK });
    if (brief.suitable === false) { report.unsuitable = String(brief.why || 'not picturable'); throw { code: 'unsuitable', message: 'Not illustrated: ' + report.unsuitable, report }; }
    const att = { brief: { must: brief.must, mustNot: brief.mustNot, prompt: brief.prompt } }; report.attempts.push(att);
    onStatus && onStatus('Drawing…');
    let g; try { g = await genImage(String(brief.prompt), signal); } catch (e) { if (e && e.code === 'cancelled') throw e; att.error = e.message || e.code; if (e.code === 'none' || e.code === 'key') throw { code: 'media_off', message: e.message + ' (pictures need a Cloudflare key in FreeLLMAPI: Keys → Add key → Cloudflare, as account_id:token)', report }; avoid.push('the generator failed'); continue; }
    att.model = g.model; att.provider = g.provider;
    const s = await imageStats(g.blob); att.pixels = s; const tech = imageTechnical(s); att.technical = tech;
    if (tech.length) { avoid.push(...tech); continue; }
    const R = await review(st, brief, g.blob, signal, onStatus); att.reviews = R;
    if (R.length < RULES.judges) { att.verdict = `only ${R.length} independent reviewer${R.length === 1 ? '' : 's'} could look at it (two are required)`; throw { code: 'rejected', message: 'Not admitted: ' + att.verdict + '. Add a vision model (a Google or another free vision key) and try again.', report }; }
    const failed = R.filter(r => r.failed.length);
    if (!failed.length) { att.verdict = 'admitted'; report.admitted = { model: g.model, provider: g.provider, judges: R.map(r => r.judge) }; return { blob: g.blob, report }; }
    att.verdict = 'rejected: ' + failed.map(r => r.judge + ' (' + r.failed.join(', ') + ')').join('; ');
    failed.forEach(r => avoid.push(...r.issues.slice(0, 3), ...r.failed));
  }
  throw { code: 'rejected', message: `Not admitted after ${RULES.imgTries} attempts: the reviewers found problems each time (see the report).`, report };
}

// ---------------------------------------------------------------- SPEECH
const ONES = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' '), TENS = ' ten twenty thirty forty fifty sixty seventy eighty ninety'.split(' ');
function numWords(n) { n = Math.floor(n); if (n < 20) return ONES[n]; if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''); if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + numWords(n % 100) : ''); if (n < 1e6) return numWords(n / 1000) + ' thousand' + (n % 1000 ? ' ' + numWords(n % 1000) : ''); return String(n); }
export function normWords(s) {
  return String(s || '').toLowerCase().replace(/(\d),(\d{3})/g, '$1$2').replace(/(\d+)\.(\d+)/g, (m, a, b) => numWords(+a) + ' point ' + [...b].map(d => ONES[+d]).join(' ')).replace(/\d+/g, m => ' ' + numWords(+m) + ' ').replace(/%/g, ' percent ').replace(/&/g, ' and ')
    .replace(/[‐-―-]/g, ' ').replace(/['’]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
}
// word error rate: (substitutions + deletions + insertions) / words in the script
export function wer(ref, hyp) {
  const R = normWords(ref), H = normWords(hyp); if (!R.length) return H.length ? 1 : 0;
  let prev = Array.from({ length: H.length + 1 }, (_, j) => j);
  for (let i = 1; i <= R.length; i++) { const cur = [i]; for (let j = 1; j <= H.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (R[i - 1] === H[j - 1] ? 0 : 1)); prev = cur; }
  return prev[H.length] / R.length;
}
export function pieces(text, max = RULES.pieceChars) {
  const sents = String(text).replace(/\s+\n/g, '\n').split(/(?<=[.!?;:])\s+|\n{2,}/).map(s => s.trim()).filter(Boolean), out = []; let cur = '';
  for (const s of sents) { if (s.length > max) { if (cur) { out.push(cur); cur = ''; } for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max)); continue; } if ((cur + ' ' + s).trim().length > max) { out.push(cur); cur = s; } else cur = (cur + ' ' + s).trim(); }
  if (cur) out.push(cur); return out;
}
const SCRIPT = text => `Rewrite this passage from a study text as a script to be read aloud by a speech synthesiser. Keep every sentence and every idea, in the same order, nearly word for word. Change only what cannot be spoken: write every formula, symbol, Greek letter, subscript, superscript, fraction and unit out in plain spoken English the way a careful lecturer would say it (for example "F equals m times a", "x squared", "the integral from zero to one of f of x, d x", "theta", "per cent"). Remove markup. Use no symbols at all except ordinary punctuation, and write numbers as digits only where they are plain quantities.

PASSAGE:
${text}

Return ONE JSON object: {"script":"the whole spoken text"}`;
const scriptOK = (src) => v => { if (!v || typeof v.script !== 'string') return 'script is required'; const s = v.script; if (/[\\$^_{}=<>±×÷√∑∫∂∞≤≥≠≈→∝∇]/.test(s)) return 'the script still holds symbols: write them out in words'; const r = s.length / Math.max(1, src.length); if (r < 0.6 || r > 2.6) return 'the script must keep every sentence (its length is far from the passage\'s)'; return null; };
async function genSpeech(input, signal) {
  const F = fla();
  const r = await req(F.base + '/audio/speech', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + F.key }, body: JSON.stringify({ model: 'auto', input, response_format: 'mp3' }), signal });
  if (!r.ok) throw await errOf(r, 'speech');
  const type = (r.headers.get('content-type') || 'audio/mpeg').split(';')[0]; const blob = new Blob([await r.arrayBuffer()], { type });
  if (!/^audio\//.test(type) || blob.size < 1000) throw { code: 'media', message: 'speech: the answer is not audio' };
  return { blob, provider: r.headers.get('x-provider') || '' };
}
async function transcribe(blob, signal) {
  const F = fla(), B = '----sm' + Math.random().toString(36).slice(2), enc = new TextEncoder();
  const field = (n, v) => enc.encode(`--${B}\r\nContent-Disposition: form-data; name="${n}"\r\n\r\n${v}\r\n`);
  const head = enc.encode(`--${B}\r\nContent-Disposition: form-data; name="file"; filename="piece.${/wav/.test(blob.type) ? 'wav' : /ogg|opus/.test(blob.type) ? 'ogg' : 'mp3'}"\r\nContent-Type: ${blob.type}\r\n\r\n`);
  const parts = [field('model', 'auto'), field('response_format', 'json'), head, new Uint8Array(await blob.arrayBuffer()), enc.encode(`\r\n--${B}--\r\n`)];
  const body = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; parts.forEach(p => { body.set(p, o); o += p.length; });
  const r = await req(F.base + '/audio/transcriptions', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=' + B, Authorization: 'Bearer ' + F.key }, body, signal });
  if (!r.ok) throw await errOf(r, 'transcription');
  const j = await r.json(); return { text: String(j.text || ''), provider: r.headers.get('x-provider') || '', model: r.headers.get('x-model') || '' };
}
// the samples: duration, speaking rate, clipping, silences, loudness
export async function audioStats(blob) {
  const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext; const ctx = new AC(1, 16000, 16000);
  const buf = await ctx.decodeAudioData(await blob.arrayBuffer()); const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate;
  const x = new Float32Array(n); for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) x[i] += d[i] / ch; }
  let clip = 0, peak = 0, ss = 0; for (let i = 0; i < n; i++) { const a = Math.abs(x[i]); if (a > peak) peak = a; if (a > 0.999) clip++; ss += x[i] * x[i]; }
  const win = Math.round(sr * 0.05), rms = []; for (let i = 0; i + win <= n; i += win) { let s = 0; for (let k = i; k < i + win; k++) s += x[k] * x[k]; rms.push(Math.sqrt(s / win)); }
  const voiced = rms.map(v => v > 0.006); const first = voiced.indexOf(true), last = voiced.lastIndexOf(true); let gap = 0, run = 0;
  for (let i = Math.max(0, first); i <= last; i++) { if (!voiced[i]) { run++; gap = Math.max(gap, run); } else run = 0; }
  return { seconds: n / sr, sampleRate: sr, peak, clip: clip / Math.max(1, n), rms: Math.sqrt(ss / Math.max(1, n)), lead: Math.max(0, first) * 0.05, span: first < 0 ? 0 : (last - first + 1) * 0.05, longestGap: gap * 0.05, voicedSeconds: voiced.filter(Boolean).length * 0.05 };
}
export function speechTechnical(s, words) {
  const bad = [], wps = words / Math.max(0.1, s.span || (s.seconds - s.lead));   // over the voiced span: silence before and after does not count
  if (s.voicedSeconds < 0.5) bad.push('almost silent');
  if (wps < RULES.wps[0]) bad.push(`too slow or padded (${wps.toFixed(1)} words a second)`); if (wps > RULES.wps[1]) bad.push(`too fast or words missing (${wps.toFixed(1)} words a second)`);
  if (s.clip > RULES.clip) bad.push(`clipped (${(s.clip * 100).toFixed(2)} % of samples at full scale)`);
  if (s.longestGap > RULES.gap) bad.push(`a ${s.longestGap.toFixed(1)} s silence inside the reading`);
  if (s.rms < 0.015) bad.push('too quiet'); if (s.lead > 2) bad.push(`${s.lead.toFixed(1)} s of silence before it starts`);
  return { bad, wps };
}
// read one step aloud: the admitted pieces, or { code: 'rejected', report }
export async function narrate(st, A, { signal, onStatus } = {}) {
  const ms = await mediaStatus(); if (!ms.ok) throw { code: 'media_off', message: ms.why };
  const src = stepText(st), report = { kind: 'speech', step: st.id, at: Date.now(), pieces: [], rules: { wps: RULES.wps, werPiece: RULES.werPiece, werAll: RULES.werAll } };
  let script = src;
  if (hasMath(src)) { onStatus && onStatus('Writing the formulas out as spoken words…'); const v = await askJSON(SCRIPT(src), { signal, onStatus, role: 'worker', tier: 'default', validate: scriptOK(src) }); script = v.script; report.spokenScript = true; }
  const P = pieces(script); let voice = null; const out = []; let errs = 0, words = 0;
  for (let i = 0; i < P.length; i++) {
    const text = P[i], rec = { text, tries: [] }; report.pieces.push(rec); let ok = null;
    for (let k = 0; k < RULES.speechTries && !ok; k++) {
      onStatus && onStatus(`Reading piece ${i + 1} of ${P.length}${k ? ` (attempt ${k + 1})` : ''}…`); const t = {}; rec.tries.push(t);
      let g; try { g = await genSpeech(text, signal); } catch (e) { if (e && e.code === 'cancelled') throw e; t.error = e.message || e.code; if (e.code === 'none' || e.code === 'key') throw { code: 'media_off', message: e.message + ' (speech needs a text-to-speech key in FreeLLMAPI: Cloudflare, Google, Speechify or Free.ai)', report }; continue; }
      t.provider = g.provider; if (voice && g.provider && g.provider !== voice) { t.verdict = `a different voice (${g.provider}, the reading began with ${voice})`; continue; }
      let s; try { s = await audioStats(g.blob); } catch (e) { t.verdict = 'the audio does not decode'; continue; }
      const nW = normWords(text).length, T = speechTechnical(s, nW); t.audio = { seconds: +s.seconds.toFixed(2), wps: +T.wps.toFixed(2), clip: s.clip, longestGap: +s.longestGap.toFixed(2), rms: +s.rms.toFixed(3) };
      if (T.bad.length) { t.verdict = T.bad.join('; '); continue; }
      onStatus && onStatus(`Listening back to piece ${i + 1} of ${P.length}…`);
      let h; try { h = await transcribe(g.blob, signal); } catch (e) { if (e && e.code === 'cancelled') throw e; t.verdict = 'could not be listened back (' + (e.message || e.code) + ')'; if (e.code === 'none' || e.code === 'key') throw { code: 'media_off', message: e.message + ' (the check needs speech-to-text in FreeLLMAPI: a Groq or Cloudflare key)', report }; continue; }
      const w = wer(text, h.text), hl = normWords(h.text).length / Math.max(1, nW); t.heard = h.text.slice(0, 2000); t.wer = +w.toFixed(4); t.lengthRatio = +hl.toFixed(3); t.listener = h.provider + (h.model ? ' · ' + h.model : '');
      if (w > RULES.werPiece) { t.verdict = `heard back with ${(w * 100).toFixed(1)} % of words wrong (at most ${RULES.werPiece * 100} %)`; continue; }
      if (Math.abs(hl - 1) > RULES.lenTol) { t.verdict = `heard back ${(hl * 100).toFixed(0)} % as long as the script`; continue; }
      t.verdict = 'passed'; ok = g; voice = voice || g.provider; errs += w * nW; words += nW; rec.wer = t.wer;
    }
    if (!ok) throw { code: 'rejected', message: `Not admitted: piece ${i + 1} of ${P.length} failed the check ${RULES.speechTries} times (${rec.tries.map(t => t.verdict || t.error).filter(Boolean).slice(-1)[0] || 'no audio'}).`, report };
    out.push(ok.blob);
  }
  const W = errs / Math.max(1, words); report.wer = +W.toFixed(4);
  if (W > RULES.werAll) throw { code: 'rejected', message: `Not admitted: ${(W * 100).toFixed(1)} % of words heard wrong over the reading (at most ${RULES.werAll * 100} %).`, report };
  report.admitted = { voice, pieces: out.length, wer: report.wer };
  return { blobs: out, report };
}

// ---------------------------------------------------------------- keeping what passed
const KEY = (part, st, kind) => 'media:' + kind + ':' + (part && part.id || 'p') + ':' + st.id;
export async function keep(part, st, kind, val) { const k = KEY(part, st, kind); await store.setGlobal(k, { ...val, at: Date.now() }); return k; }
export async function kept(part, st, kind) { return store.getGlobal(KEY(part, st, kind)).catch(() => null); }
export async function drop(part, st, kind) { return store.setGlobal(KEY(part, st, kind), null); }
// the last report (passed or not), for the step's "why" link
const LAST = new Map(); export const lastReport = (part, st, kind) => LAST.get(KEY(part, st, kind)); export const noteReport = (part, st, kind, r) => LAST.set(KEY(part, st, kind), r);
