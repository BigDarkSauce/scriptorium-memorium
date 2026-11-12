// Pictures from the free models (through FreeLLMAPI on your computer), admitted only past a strict check.
//
// WHY A GATE. An image model draws what looks right, not what is right: an insect with eight legs, a pendulum hanging
// sideways, a label in invented letters. In a study tool a wrong picture teaches the wrong thing, so nothing generated reaches a scroll
// unless it passes every check below; a failed attempt is retried with the reviewers' objections, and after the last
// attempt the step simply keeps no picture (the reasons are shown, nothing is used).
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
// What passed is kept in this browser (IndexedDB) with its report: the reviewers, their scores, the error rates.
import * as FREE from './free.js';
import * as store from '../store.js';
import { bridgeFetchBytes, bridgeReady, bridgeBinary } from './bridge.js';
import { askJSON, parseJSONLoose, claudeSample, claudeImageCount } from './claude.js';

export const RULES = { imgMin: 512, judges: 2, minScore: 4, styleMin: 3, strictKeys: ['accurate', 'clean'], imgTries: 3 };
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
// can pictures be made from here? (what is missing, in words, when not)
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

// ---------------------------------------------------------------- keeping what passed
// (each kept with the hash of the step's text it was made for: a rewritten step shows no stale picture)
const KEY = (part, st, kind) => 'media:' + kind + ':' + (part && part.id || 'p') + ':' + st.id;
export async function keep(part, st, kind, val) { const k = KEY(part, st, kind); await store.setGlobal(k, { ...val, src: hashKey(stepText(st)), at: Date.now() }); const back = await store.getGlobal(k).catch(() => null); if (!back) throw { code: 'storage', message: 'Admitted, but this browser could not keep it (storage full?).' }; return k; }
export async function kept(part, st, kind) { const v = await store.getGlobal(KEY(part, st, kind)).catch(() => null); return v && v.src === hashKey(stepText(st)) ? v : null; }
export async function drop(part, st, kind) { return store.setGlobal(KEY(part, st, kind), null); }
