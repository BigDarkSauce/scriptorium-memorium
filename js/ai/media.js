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

export const RULES = { imgMin: 512, judges: 2, minScore: 4, styleMin: 3, strictKeys: ['accurate', 'clean'], imgTries: 3, wps: [1.6, 4.2], clip: 0.002, gap: 2.0, werPiece: 0.08, werAll: 0.05, lenTol: 0.15, speechTries: 3, pieceChars: 1100 };
const SCORE_KEYS = ['faithful', 'accurate', 'clean', 'coherent', 'helpful', 'style'];

// ---------------------------------------------------------------- reaching FreeLLMAPI's media endpoints
function fla() { const S = FREE.settings(), p = FREE.PROVIDERS.find(x => x.id === 'freellmapi'); return { base: FREE.baseOf(p, S), key: FREE.keyOf(p, S), on: FREE.isOn(p, S) }; }
async function req(url, { method = 'GET', headers = {}, body, signal, media } = {}) {
  await FREE.netReady();
  const v = FREE.via();
  if (signal && signal.aborted) throw { code: 'cancelled' };
  try {
    if (v === 'bridge') return await bridgeFetchBytes(url, { method, headers, body, signal, media });
    if (v === 'relay') return await fetch('/__relay/fetch?u=' + encodeURIComponent(url) + (media ? '&media=' + media : ''), { method, headers, body, signal });
    return await fetch(url, { method, headers, body, signal });
  } catch (e) { if (signal && signal.aborted) throw { code: 'cancelled' }; throw e && e.code ? e : { code: 'network', message: String(e && e.message || e) }; }   /* a stop is a stop, whichever way the request went */
}
const pause = (ms, signal) => new Promise((res, rej) => { if (signal && signal.aborted) return rej({ code: 'cancelled' }); const t = setTimeout(res, ms); if (signal) signal.addEventListener('abort', () => { clearTimeout(t); rej({ code: 'cancelled' }); }, { once: true }); });
const stopped = signal => { if (signal && signal.aborted) throw { code: 'cancelled' }; };
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
const hasMath = s => /\$|\\\(|\\\[|\\[a-zA-Z]+|[_^{}]|[=<>±×÷√∑∫∂∞≤≥≠≈→←↔∝∇πσμλθαβγδεζηκνξρτφχψωΔΓΘΛΞΠΣΦΨΩ²³°−]|\d\s*[+*/:]\s*\d/.test(s);   /* anything a speech model would read wrongly or skip: TeX, symbols, Greek, "3:1", "a/b" between numbers, a minus sign */
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
  if (s.black > 0.6) bad.push('mostly black'); if (s.white > 0.93) bad.push('mostly white (washed out)');
  if (s.detail < 0.003) bad.push('almost no detail (blurred or empty)');
  return bad;
}
// the picture as the reviewers get it: full size (small faint writing must stay visible), as a high-quality JPEG
async function forJudge(blob, size = 1024) {
  const bm = await createImageBitmap(blob), k = Math.min(1, size / Math.max(bm.width, bm.height)), w = Math.round(bm.width * k), h = Math.round(bm.height * k);
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
  c.getContext('2d').drawImage(bm, 0, 0, w, h); bm.close && bm.close();
  return c.convertToBlob ? c.convertToBlob({ type: 'image/jpeg', quality: 0.92 }) : new Promise(r => c.toBlob(r, 'image/jpeg', 0.92));
}
// REVIEW IN TWO STEPS, so a reviewer cannot see what it is told to see.
//   1. blind: the picture alone, no step, no brief: "describe exactly what is there, count things, transcribe any
//      writing". A model that cannot see answers from nothing; a canary (a blank page) catches it first.
//   2. comparison, text only: the step, the brief, and that description: scores and issues. A judge that "sees" the
//      intended answer is thereby impossible: it never had the intended answer while looking.
const BLIND = `Describe this picture exactly and literally, for someone who cannot see it. Do not guess what it is meant to show.
List every object you see with its count, its parts and their arrangement (what is attached to what, what is above or below what, directions), and any rendering fault (melted or merged shapes, extra or missing parts, impossible geometry). Look carefully, also in corners and small areas, for ANY writing: letters, numbers, labels, signatures, watermarks, logos, pseudo-text scribbles.
Return ONE JSON object only:
{"describe":"three to six sentences, literal","objects":[{"what":"…","count":1,"details":"…"}],"text_seen":"NONE, or exactly what writing you see and where","faults":["each rendering fault, or none"]}`;
const COMPARE = (st, brief, D) => `You are a strict reviewer for a scholarly study app. A picture was drawn to illustrate one step of a textbook chapter. You cannot see the picture: you get a careful literal description of it, written by someone who did NOT know what it was meant to show. Judge the picture from that description only. Reject anything a careful teacher would not put in front of a student.

THE STEP: ${plain(st.title)}
${stepText(st).slice(0, 2500)}

WHAT THE PICTURE WAS MEANT TO SHOW: ${brief.must}
WHAT WOULD BE WRONG: ${brief.mustNot || 'anything contradicting the step'}

THE DESCRIPTION OF THE PICTURE (literal, by an independent observer):
${D.describe}
Objects: ${JSON.stringify(D.objects || []).slice(0, 1500)}
Writing seen: ${D.text_seen || 'NONE'}
Rendering faults seen: ${JSON.stringify(D.faults || [])}

Score each from 0 to 5 (integers; 5 = flawless). If the description does not establish something the step needs, that counts against the picture.
- faithful: the described picture shows the intended subject; nothing described contradicts the step
- accurate: no factual, scientific, anatomical, physical or geometric error in what is described (counts, structure, arrangement, directions)
- clean: no writing of any kind was seen (any writing scores 0)
- coherent: no rendering faults were seen
- helpful: a learner would understand the step better from this picture
- style: sober and precise, like a scientific plate; not cartoonish
Return ONE JSON object only:
{"scores":{"faithful":0,"accurate":0,"clean":0,"coherent":0,"helpful":0,"style":0},"issues":["each concrete problem; an empty list only if there is none"]}`;
const family = id => { const s = String(id).toLowerCase().replace(/^[\w.-]+\//, ''); const m = s.match(/^(gemini|gemma|qwen|llama|mistral|pixtral|gpt|glm|nemotron|kimi|deepseek|phi|internvl|minicpm|command|aya|grok|claude)/) || s.match(/(gemini|gemma|qwen|llama|mistral|pixtral|nemotron|internvl|minicpm)/); return m ? m[1].replace('gemma', 'gemini').replace('pixtral', 'mistral') : s.split(/[-:]/)[0]; };
// the app decides from the scores: integers 0–5 only (a 0–10 answer is refused, not passed); accurate and clean 5;
// style ≥ 3 (taste); the rest ≥ 4; and a reviewer that lists any issue does not pass, whatever its numbers say
export function scoreOK(J) {
  const s = J && J.scores; if (!s || typeof s !== 'object') return ['no scores']; const bad = [];
  SCORE_KEYS.forEach(k => { const v = Number(s[k]); if (!(Number.isInteger(v) && v >= 0 && v <= 5)) bad.push(`${k} invalid (${s[k]})`); else if (RULES.strictKeys.includes(k) ? v !== 5 : v < (k === 'style' ? RULES.styleMin : RULES.minScore)) bad.push(`${k} ${v}/5`); });
  const iss = [].concat(J.issues || []).map(String).filter(x => x.trim() && !/^(none|no issues?|n\/a)\.?$/i.test(x.trim())); if (iss.length) bad.push('lists issues');
  return bad;
}
// the reviewers: Claude (inside the Claude app) and free vision models, at most one per model family
async function judges() {
  const out = [];
  if (claudeImageCount() > 0) out.push({ id: 'claude', name: 'Claude', fam: 'claude' });
  const C = await FREE.candidates({ images: 1, minRank: 55 }).catch(() => []);
  for (const c of C) { const f = family(c.m); if (out.some(j => j.fam === f) || /^auto/.test(c.m)) continue; out.push({ id: c.p.id + '|' + c.m, name: c.p.name + ' · ' + c.m, fam: f, c }); }
  return out;
}
async function ask1(j, prompt, img, signal) {
  if (j.id === 'claude') { const { text } = await claudeSample(prompt, { ...(img ? { images: [img] } : {}), modelTier: 'default', cache: false, signal }); return parseJSONLoose(text); }
  const r = await FREE.call(j.c.p, j.c.m, prompt, { images: img ? [img] : [], signal, maxTokens: 1500, timeoutMs: 120000 }); return parseJSONLoose(r.text);
}
// does this reviewer really see pictures? A blank page must be described as blank (once per reviewer per session)
const SIGHT = new Map();
async function canary(j, signal) {
  if (SIGHT.has(j.id)) return SIGHT.get(j.id);
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(512, 512) : Object.assign(document.createElement('canvas'), { width: 512, height: 512 });
  const g = c.getContext('2d'); g.fillStyle = '#efe6cf'; g.fillRect(0, 0, 512, 512);
  const blank = await (c.convertToBlob ? c.convertToBlob({ type: 'image/jpeg', quality: 0.9 }) : new Promise(r => c.toBlob(r, 'image/jpeg', 0.9)));
  let sees = false; try { const D = await ask1(j, BLIND, blank, signal); const objs = [].concat(D && D.objects || []).filter(o => o && o.what && !/blank|empty|plain|background|nothing|paper|parchment|texture|colou?r/i.test(o.what)); sees = !!D && objs.length === 0 && /blank|empty|plain|uniform|solid|nothing|no (visible )?objects?/i.test(String(D.describe || '')); } catch (e) { if (e && e.code === 'cancelled') throw e; return null; }   // busy: unknown, ask again later
  SIGHT.set(j.id, sees); return sees;
}
async function judgeOne(j, st, brief, img, signal) {
  const sees = await canary(j, signal); if (sees === false) return { judge: j.name, family: j.fam, blind: true };
  if (sees === null) return null;
  const D = await ask1(j, BLIND, img, signal); if (!D || !D.describe) return null;
  const textSeen = String(D.text_seen || 'NONE'); const v = await ask1(j, COMPARE(st, brief, D), null, signal); if (!v) return null;
  const failed = scoreOK(v); if (!/^\s*none\.?\s*$/i.test(textSeen)) failed.push('writing seen: ' + textSeen.slice(0, 120));
  return { judge: j.name, family: j.fam, describe: String(D.describe).slice(0, 600), textSeen: textSeen.slice(0, 200), scores: v.scores, issues: [].concat(v.issues || []).map(String).slice(0, 8), failed };
}
// the first `need` reviewers at once; any failure ends the review (no need to pay for more); missing ones are filled
// from the next families
async function review(st, brief, blob, signal, onStatus, need = RULES.judges) {
  const img = await forJudge(blob), pool = await judges(), done = [], skipped = [];
  let i = 0;
  while (done.length < need && i < pool.length) {
    const batch = pool.slice(i, i + (need - done.length)); i += batch.length;
    onStatus && onStatus(`Reviewing the picture blind, then against the step: ${batch.map(j => j.name).join(' and ')}…`);
    const R = await Promise.allSettled(batch.map(j => judgeOne(j, st, brief, img, signal)));
    for (const r of R) { if (r.status === 'rejected') { if (r.reason && r.reason.code === 'cancelled') throw r.reason; continue; } if (!r.value) continue; if (r.value.blind) { skipped.push(r.value.judge + ' (cannot see pictures)'); continue; } done.push(r.value); }
    if (done.some(d => d.failed.length)) break;
  }
  return { done, skipped };
}
// is every claim of the brief in the step? (an invented count or arrangement would make the judges grade against it)
const BRIEFCHECK = (st, brief) => `A picture brief was written for this step of a textbook. Check it against the step.

THE STEP: ${plain(st.title)}
${stepText(st).slice(0, 2500)}

THE BRIEF — must show: ${brief.must}
must not show: ${brief.mustNot || ''}

List every claim in the brief (a count, a part, an arrangement, a direction, a property) that the step does NOT state or directly imply and that is not basic, uncontested textbook knowledge about the step's subject.
Return ONE JSON object: {"unsupported":["each unsupported claim; empty list if none"]}`;
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
  const report = { kind: 'image', step: st.id, src: hashKey(stepText(st)), at: Date.now(), attempts: [], rules: { judges: RULES.judges, strict: RULES.strictKeys, min: RULES.minScore, style: RULES.styleMin } }; const avoid = [];
  for (let k = 0; k < RULES.imgTries; k++) {
    stopped(signal);
    onStatus && onStatus(k ? `Attempt ${k + 1} of ${RULES.imgTries}: a new brief that avoids the reviewers' objections…` : 'Deciding whether this step can be pictured truthfully…');
    let brief = await askJSON(BRIEF(st, A, avoid), { signal, onStatus, role: 'worker', tier: 'default', validate: briefOK });
    if (brief.suitable === false) { report.unsuitable = String(brief.why || 'not picturable'); throw { code: 'unsuitable', message: 'Not illustrated: ' + report.unsuitable, report }; }
    const bc = await askJSON(BRIEFCHECK(st, brief), { signal, role: 'worker', tier: 'default', validate: v => v && Array.isArray(v.unsupported) ? null : 'unsupported must be a list' }).catch(e => { if (e && e.code === 'cancelled') throw e; return { unsupported: [] }; });
    const att = { brief: { must: brief.must, mustNot: brief.mustNot, prompt: brief.prompt } }; report.attempts.push(att);
    if (bc.unsupported.length) { att.verdict = 'brief rejected before drawing: it claims what the step does not say (' + bc.unsupported.slice(0, 3).join('; ') + ')'; avoid.push('do not add details the step does not state: ' + bc.unsupported.slice(0, 3).join('; ')); continue; }
    onStatus && onStatus('Drawing…');
    let g; try { g = await genImage(String(brief.prompt), signal); } catch (e) { if (e && e.code === 'cancelled') throw e; att.error = e.message || e.code; if (e.code === 'none' || e.code === 'key') throw { code: 'media_off', message: e.message + ' (pictures need a Cloudflare key in FreeLLMAPI: Keys → Add key → Cloudflare, as account_id:token)', report }; if (e.code === 'rate') await pause(8000 * (k + 1), signal); avoid.push('the generator failed'); continue; }
    att.model = g.model; att.provider = g.provider;
    let s; try { s = await imageStats(g.blob); } catch (e) { att.technical = ['the picture does not decode']; continue; }
    att.pixels = s; const tech = imageTechnical(s); att.technical = tech;
    if (tech.length) { avoid.push(...tech); continue; }
    const need = RULES.judges + (k > 0 ? 1 : 0);   // a second or third draw meets one more reviewer: best-of-three must not become luck
    const { done: R, skipped } = await review(st, brief, g.blob, signal, onStatus, need); att.reviews = R; if (skipped.length) att.skipped = skipped;
    const failed = R.filter(r => r.failed.length);
    if (!failed.length && R.length < need) { att.verdict = `only ${R.length} independent reviewer${R.length === 1 ? '' : 's'} could look at it (${need} are required)${skipped.length ? '; ' + skipped.join(', ') : ''}`; throw { code: 'rejected', message: 'Not admitted: ' + att.verdict + '. Add a vision model (a Google or another free vision key), or try again when the reviewers are free.', report }; }
    if (!failed.length) { att.verdict = 'admitted'; report.admitted = { model: g.model, provider: g.provider, judges: R.map(r => r.judge) }; return { blob: await compact(g.blob), report }; }
    att.verdict = 'rejected: ' + failed.map(r => r.judge + ' (' + r.failed.join(', ') + ')').join('; ');
    failed.forEach(r => avoid.push(...r.issues.slice(0, 3)));
  }
  throw { code: 'rejected', message: `Not admitted after ${RULES.imgTries} attempts: the reviewers found problems each time (see the report).`, report };
}
// an admitted picture is kept as WebP (a 2–3 MB PNG becomes ~150 kB at the same look)
async function compact(blob) { try { const bm = await createImageBitmap(blob); const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(bm.width, bm.height) : Object.assign(document.createElement('canvas'), { width: bm.width, height: bm.height }); c.getContext('2d').drawImage(bm, 0, 0); bm.close && bm.close(); const w = await (c.convertToBlob ? c.convertToBlob({ type: 'image/webp', quality: 0.9 }) : new Promise(r => c.toBlob(r, 'image/webp', 0.9))); return w && w.type === 'image/webp' && w.size < blob.size ? w : blob; } catch (e) { return blob; } }

// ---------------------------------------------------------------- SPEECH
const ONES = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' '), TENS = ' ten twenty thirty forty fifty sixty seventy eighty ninety'.split(' ');
function numWords(n) { n = Math.floor(n); if (n < 20) return ONES[n]; if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''); if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + numWords(n % 100) : ''); if (n < 1e6) return numWords(n / 1000) + ' thousand' + (n % 1000 ? ' ' + numWords(n % 1000) : ''); if (n < 1e9) return numWords(n / 1e6) + ' million' + (n % 1e6 ? ' ' + numWords(n % 1e6) : ''); return String(n); }
const GREEK = { α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'epsilon', ζ: 'zeta', η: 'eta', θ: 'theta', κ: 'kappa', λ: 'lambda', μ: 'mu', ν: 'nu', ξ: 'xi', π: 'pi', ρ: 'rho', σ: 'sigma', τ: 'tau', φ: 'phi', χ: 'chi', ψ: 'psi', ω: 'omega', Δ: 'delta', Γ: 'gamma', Θ: 'theta', Λ: 'lambda', Π: 'pi', Σ: 'sigma', Φ: 'phi', Ψ: 'psi', Ω: 'omega' };
// the same spoken words, however each side wrote them: symbols a transcriber writes for spoken maths become the words,
// spelling variants become one; then lower case, numbers as words, punctuation gone
const EQUIV = [[/\bper cent\b/g, 'percent'], [/\bcolour/g, 'color'], [/\bbehaviour/g, 'behavior'], [/\bcentre/g, 'center'], [/\bmetre/g, 'meter'], [/\blitre/g, 'liter'], [/\b(\w+)ise(s|d)?\b/g, '$1ize$2'], [/\bgrey\b/g, 'gray'], [/\bokay\b/g, 'ok']];
const ORD = { '1st': 'first', '2nd': 'second', '3rd': 'third', '4th': 'fourth', '5th': 'fifth', '6th': 'sixth', '7th': 'seventh', '8th': 'eighth', '9th': 'ninth', '10th': 'tenth' };
export function normWords(s) {
  let t = String(s || '').toLowerCase();
  t = t.replace(/\b(\d+)(st|nd|rd|th)\b/g, m => ORD[m] || m).replace(/(?<=\d),(?=\d{3})/g, '')
    .replace(/[αβγδεζηθκλμνξπρστφχψωΔΓΘΛΠΣΦΨΩ]/g, c => ' ' + GREEK[c] + ' ')
    .replace(/²/g, ' squared ').replace(/³/g, ' cubed ').replace(/°\s*c\b/g, ' degrees celsius ').replace(/°/g, ' degrees ')
    .replace(/[−–](?=\s*\d)/g, ' minus ').replace(/\s=\s|=/g, ' equals ').replace(/\+/g, ' plus ').replace(/×/g, ' times ').replace(/(?<=\d)\s*\/\s*(?=\d)/g, ' over ')
    .replace(/(\d+)\.(\d+)/g, (m, a, b) => numWords(+a) + ' point ' + [...b].map(d => ONES[+d]).join(' ')).replace(/\d+/g, m => ' ' + numWords(+m) + ' ').replace(/%/g, ' percent ').replace(/&/g, ' and ');
  for (const [re, to] of EQUIV) t = t.replace(re, to);
  return t.replace(/[‐-―-]/g, ' ').replace(/['’]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
}
// words whose loss or change reverses or falsifies the meaning: one such error rejects a piece whatever the rate
const CRIT = /^(not|no|never|none|neither|nor|cannot|cant|dont|doesnt|isnt|arent|wasnt|werent|wont|without|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|point|minus|plus|times|over|equals|squared|cubed|half|double|increase\w*|decrease\w*|rise\w*|fall\w*|more|less|fewer|greater|smaller|larger|higher|lower|above|below|before|after|positive|negative|maximum|minimum|always|only)$/;
const isCritical = w => CRIT.test(w) || (w.length >= 9 && /^\p{L}+$/u.test(w));   /* long words: the technical terms of a study text */
// word error rate, and the critical words lost, changed or inserted (the alignment's substitutions and deletions)
export function werDetail(ref, hyp) {
  const R = normWords(ref), H = normWords(hyp), n = R.length, m = H.length; if (!n) return { wer: m ? 1 : 0, critical: [] };
  const D = Array.from({ length: n + 1 }, (_, i) => { const a = new Uint32Array(m + 1); a[0] = i; return a; }); for (let j = 0; j <= m; j++) D[0][j] = j;
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) D[i][j] = Math.min(D[i - 1][j] + 1, D[i][j - 1] + 1, D[i - 1][j - 1] + (R[i - 1] === H[j - 1] ? 0 : 1));
  const crit = []; let i = n, j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && D[i][j] === D[i - 1][j - 1] + (R[i - 1] === H[j - 1] ? 0 : 1)) { if (R[i - 1] !== H[j - 1] && (isCritical(R[i - 1]) || isCritical(H[j - 1]))) crit.push(`“${R[i - 1]}” heard as “${H[j - 1]}”`); i--; j--; }
    else if (i > 0 && D[i][j] === D[i - 1][j] + 1) { if (isCritical(R[i - 1])) crit.push(`“${R[i - 1]}” missing`); i--; }
    else { if (/^(not|no|never|without)$/.test(H[j - 1])) crit.push(`“${H[j - 1]}” added`); j--; }
  }
  return { wer: D[n][m] / n, critical: crit.reverse() };
}
export const wer = (ref, hyp) => werDetail(ref, hyp).wer;
// pieces of at most `max` characters at sentence ends; a sentence longer than that is cut between words; a tail
// under 12 words joins the piece before it (a 2-word piece would fail on one slip)
export function pieces(text, max = RULES.pieceChars) {
  const sents = String(text).replace(/\s+\n/g, '\n').split(/(?<=[.!?;:])\s+|\n{2,}/).map(s => s.trim()).filter(Boolean), out = []; let cur = '';
  const cut = s => { const o = []; while (s.length > max) { let k = s.lastIndexOf(' ', max); if (k < max * 0.5) k = max; o.push(s.slice(0, k).trim()); s = s.slice(k).trim(); } if (s) o.push(s); return o; };
  for (const s of sents) { if (s.length > max) { if (cur) { out.push(cur); cur = ''; } out.push(...cut(s)); continue; } if ((cur + ' ' + s).trim().length > max) { out.push(cur); cur = s; } else cur = (cur + ' ' + s).trim(); }
  if (cur) out.push(cur);
  for (let i = out.length - 1; i > 0; i--) if (out[i].split(/\s+/).length < 12 && (out[i - 1] + ' ' + out[i]).length <= max * 1.3) { out[i - 1] += ' ' + out[i]; out.splice(i, 1); }
  return out;
}
const SCRIPT = text => `Rewrite this passage from a study text as a script to be read aloud by a speech synthesiser. Keep every sentence and every idea, in the same order, nearly word for word. Change only what cannot be spoken: write every formula, symbol, Greek letter, subscript, superscript, fraction, sign and unit out in plain spoken English the way a careful lecturer would say it (for example "F equals m times a", "x squared", "minus five degrees Celsius", "a over b", "the integral from zero to one of f of x, d x", "theta", "percent"). Remove markup. Use no symbols at all except ordinary punctuation, and write numbers as digits only where they are plain quantities.

PASSAGE:
${text}

Return ONE JSON object: {"script":"the whole spoken text"}`;
const scriptOK = (src) => v => { if (!v || typeof v.script !== 'string') return 'script is required'; const s = v.script; if (/[\\$^_{}=<>±×÷√∑∫∂∞≤≥≠≈→∝∇αβγδεζηθκλμνξπρστφχψωΔΓΘΛΞΠΣΦΨΩ²³°−]|\d\s*[+*/]\s*\d/.test(s)) return 'the script still holds symbols: write them out in words'; const r = s.length / Math.max(1, src.length); if (r < 0.6 || r > 2.6) return 'the script must keep every sentence (its length is far from the passage\'s)'; return null; };
// the spoken formulas checked by a second model: the script read back into notation must say what the step says
const SCRIPTCHECK = (src, script) => `A study text was rewritten as a script for a speech synthesiser, with every formula written out in words. Check that the spoken version says exactly the same as the original: every formula, number, sign, unit and statement.

ORIGINAL:
${src.slice(0, 3000)}

SPOKEN SCRIPT:
${script.slice(0, 4000)}

Return ONE JSON object: {"differences":["each place where the script says something different from the original (a wrong or missing term, sign, power, number, unit, or a changed statement); an empty list if none"]}`;
async function genSpeech(input, signal, pin) {
  const F = fla();
  const r = await req(F.base + '/audio/speech', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + F.key }, body: JSON.stringify({ model: pin && pin.model || 'auto', input, response_format: 'mp3', ...(pin && pin.voice ? { voice: pin.voice } : {}) }), signal });
  if (!r.ok) throw await errOf(r, 'speech');
  const type = (r.headers.get('content-type') || 'audio/mpeg').split(';')[0]; const blob = new Blob([await r.arrayBuffer()], { type });
  if (!/^audio\//.test(type) || blob.size < 1000) throw { code: 'media', message: 'speech: the answer is not audio' };
  return { blob, provider: r.headers.get('x-provider') || '', model: r.headers.get('x-model') || '' };
}
async function transcribe(blob, signal) {
  const F = fla(), B = '----sm' + Math.random().toString(36).slice(2), enc = new TextEncoder();
  const field = (n, v) => enc.encode(`--${B}\r\nContent-Disposition: form-data; name="${n}"\r\n\r\n${v}\r\n`);
  const head = enc.encode(`--${B}\r\nContent-Disposition: form-data; name="file"; filename="piece.${/wav/.test(blob.type) ? 'wav' : /ogg|opus/.test(blob.type) ? 'ogg' : 'mp3'}"\r\nContent-Type: ${blob.type}\r\n\r\n`);
  const parts = [field('model', 'auto'), field('response_format', 'verbose_json'), field('temperature', '0'), head, new Uint8Array(await blob.arrayBuffer()), enc.encode(`\r\n--${B}--\r\n`)];
  const body = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; parts.forEach(p => { body.set(p, o); o += p.length; });
  const r = await req(F.base + '/audio/transcriptions', { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=' + B, Authorization: 'Bearer ' + F.key }, body, signal });
  if (!r.ok) throw await errOf(r, 'transcription');
  const j = await r.json(); const seg = Array.isArray(j.segments) ? j.segments : [];
  // where the listener itself was unsure (low confidence, or the repetition a transcriber produces when it invents)
  const unsure = seg.filter(x => (typeof x.avg_logprob === 'number' && x.avg_logprob < -0.6) || (typeof x.compression_ratio === 'number' && x.compression_ratio > 2.4)).map(x => String(x.text || '').trim()).filter(Boolean);
  return { text: String(j.text || ''), unsure, provider: r.headers.get('x-provider') || '', model: r.headers.get('x-model') || '' };
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
// one piece, up to RULES.speechTries times: spoken, measured, listened back
async function onePiece(text, i, total, signal, onStatus, voice, report) {
  const rec = { text, tries: [] }; report.pieces[i] = rec;
  for (let k = 0; k < RULES.speechTries; k++) {
    stopped(signal); onStatus && onStatus(`Reading piece ${i + 1} of ${total}${k ? ` (attempt ${k + 1})` : ''}…`); const t = {}; rec.tries.push(t);
    let g; try { g = await genSpeech(text, signal, voice.pin); } catch (e) { if (e && e.code === 'cancelled') throw e; t.error = e.message || e.code; if (e.code === 'none' || e.code === 'key') throw { code: 'media_off', message: e.message + ' (speech needs a text-to-speech key in FreeLLMAPI: Cloudflare, Google, Speechify or Free.ai)', report }; if (e.code === 'rate') await pause(6000 * (k + 1), signal); continue; }
    t.provider = g.provider + (g.model ? ' · ' + g.model : '');
    if (!g.provider) { t.verdict = 'the voice did not say who spoke (one voice throughout cannot be checked)'; continue; }
    if (voice.id && t.provider !== voice.id) { t.verdict = `a different voice (${t.provider}; the reading began with ${voice.id})`; continue; }
    let s; try { s = await audioStats(g.blob); } catch (e) { t.verdict = 'the audio does not decode'; continue; }
    const nW = normWords(text).length, T = speechTechnical(s, nW); t.audio = { seconds: +s.seconds.toFixed(2), wps: +T.wps.toFixed(2), clip: s.clip, longestGap: +s.longestGap.toFixed(2), rms: +s.rms.toFixed(3) };
    if (T.bad.length) { t.verdict = T.bad.join('; '); continue; }
    onStatus && onStatus(`Listening back to piece ${i + 1} of ${total}…`);
    let h; try { h = await transcribe(g.blob, signal); } catch (e) { if (e && e.code === 'cancelled') throw e; t.verdict = 'could not be listened back (' + (e.message || e.code) + ')'; if (e.code === 'none' || e.code === 'key') throw { code: 'media_off', message: e.message + ' (the check needs speech-to-text in FreeLLMAPI: a Groq or Cloudflare key)', report }; if (e.code === 'rate') await pause(6000 * (k + 1), signal); continue; }
    const W = werDetail(text, h.text), hl = normWords(h.text).length / Math.max(1, nW); t.heard = h.text.slice(0, 2000); t.wer = +W.wer.toFixed(4); t.lengthRatio = +hl.toFixed(3); t.listener = h.provider + (h.model ? ' · ' + h.model : ''); if (W.critical.length) t.critical = W.critical.slice(0, 6); if (h.unsure.length) t.unsure = h.unsure.slice(0, 4);
    if (W.critical.length) { t.verdict = 'a word that carries the meaning was lost or changed: ' + W.critical.slice(0, 3).join(', '); continue; }
    if (W.wer > RULES.werPiece) { t.verdict = `heard back with ${(W.wer * 100).toFixed(1)} % of words wrong (at most ${RULES.werPiece * 100} %)`; continue; }
    if (Math.abs(hl - 1) > RULES.lenTol) { t.verdict = `heard back ${(hl * 100).toFixed(0)} % as long as the script`; continue; }
    if (h.unsure.length) { t.verdict = 'the listener was unsure of: ' + h.unsure.slice(0, 2).join(' / '); continue; }
    t.verdict = 'passed'; rec.wer = t.wer; if (!voice.id) { voice.id = t.provider; voice.pin = g.model ? { model: g.model } : null; }
    return { blob: g.blob, errs: W.wer * nW, words: nW };
  }
  throw { code: 'rejected', message: `Not admitted: piece ${i + 1} of ${total} failed the check ${RULES.speechTries} times (${rec.tries.map(t => t.verdict || t.error).filter(Boolean).slice(-1)[0] || 'no audio'}).`, report };
}
// read one step aloud: the admitted pieces, or { code: 'rejected', report }
export async function narrate(st, A, { signal, onStatus } = {}) {
  const ms = await mediaStatus(); if (!ms.ok) throw { code: 'media_off', message: ms.why };
  const src = stepText(st), report = { kind: 'speech', step: st.id, src: hashKey(src), at: Date.now(), pieces: [], rules: { wps: RULES.wps, werPiece: RULES.werPiece, werAll: RULES.werAll } };
  let script = src;
  if (hasMath(src)) {
    onStatus && onStatus('Writing the formulas out as spoken words…');
    let note = '';
    for (let k = 0; k < 2; k++) {
      const v = await askJSON(SCRIPT(src) + note, { signal, onStatus, role: 'worker', tier: 'default', validate: scriptOK(src) });
      onStatus && onStatus('A second model checks the spoken formulas against the original…');
      const c = await askJSON(SCRIPTCHECK(src, v.script), { signal, role: 'worker', tier: 'default', validate: x => x && Array.isArray(x.differences) ? null : 'differences must be a list' });
      if (!c.differences.length) { script = v.script; break; }
      report.scriptDifferences = c.differences.slice(0, 6); note = '\n\nAN EARLIER SCRIPT WAS WRONG HERE: ' + c.differences.slice(0, 4).join('; ') + '\nSay these exactly as the original does.';
      if (k === 1) throw { code: 'rejected', message: 'Not admitted: the spoken formulas did not match the original twice (' + c.differences.slice(0, 2).join('; ') + ').', report };
    }
    report.spokenScript = true;
  }
  const P = pieces(script), voice = { id: null, pin: null };
  // the first piece fixes the voice; the rest run three at a time in that voice
  const first = await onePiece(P[0], 0, P.length, signal, onStatus, voice, report), got = [first];
  for (let i = 1; i < P.length; i += 3) got.push(...await Promise.all(P.slice(i, i + 3).map((t, k) => onePiece(t, i + k, P.length, signal, onStatus, voice, report))));
  const errs = got.reduce((a, g) => a + g.errs, 0), words = got.reduce((a, g) => a + g.words, 0), W = errs / Math.max(1, words); report.wer = +W.toFixed(4);
  if (W > RULES.werAll) throw { code: 'rejected', message: `Not admitted: ${(W * 100).toFixed(1)} % of words heard wrong over the reading (at most ${RULES.werAll * 100} %).`, report };
  report.admitted = { voice: voice.id, pieces: got.length, wer: report.wer };
  return { blobs: got.map(g => g.blob), report };
}

// ---------------------------------------------------------------- keeping what passed
// (each kept with the hash of the step's text it was made for: a rewritten step shows no stale picture or reading)
const KEY = (part, st, kind) => 'media:' + kind + ':' + (part && part.id || 'p') + ':' + st.id;
export async function keep(part, st, kind, val) { const k = KEY(part, st, kind); await store.setGlobal(k, { ...val, src: hashKey(stepText(st)), at: Date.now() }); const back = await store.getGlobal(k).catch(() => null); if (!back) throw { code: 'storage', message: 'Admitted, but this browser could not keep it (storage full?).' }; return k; }
export async function kept(part, st, kind) { const v = await store.getGlobal(KEY(part, st, kind)).catch(() => null); return v && v.src === hashKey(stepText(st)) ? v : null; }
export async function drop(part, st, kind) { return store.setGlobal(KEY(part, st, kind), null); }
