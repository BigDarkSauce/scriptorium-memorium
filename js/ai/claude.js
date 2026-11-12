// AI connector. Three engines, chosen in the AI settings (js/ai/free.js, js/ai/aipanel.js):
//   claude   Claude directs: inside claude.ai the page asks the viewer's own Claude (sample capability);
//   hybrid   Claude + free models: Claude takes the director's requests (reading a chapter into its chain, planning
//            and checking each diorama: role 'director'), the pool of free models the volume work (coverage, repairs,
//            figures, diorama authoring, expansions: role 'worker'). Each stands in for the other when it is at its
//            limit or unreachable, so a job never stops for want of an engine;
//   free     free models only (the router in free.js: many providers, budgets, waits for the next reset, never fails).
// With no engine reachable, every request can be exported as a prompt and the JSON answer pasted back — see
// docs/PROTOCOL.md. The prompts and the JSON formats are the same whichever engine answers.
import { el, toast } from '../util.js';
import * as FREE from './free.js';
import { startJob, currentJob, anyOf } from './activity.js';
import { forFreeModels } from './prompts.js';
let SAMPLE = null, LIMITS = null, ready;
export function initAI() {
  ready = (async () => { try { if (window.claude && claude.use) { SAMPLE = await claude.use('sample'); if (SAMPLE) LIMITS = await SAMPLE.limits().catch(() => null); } } catch (e) { } })();
  return ready;
}
export const claudeAvailable = () => !!SAMPLE;
// Claude asked directly (the picture reviewer in js/ai/media.js): pictures go only where this page may send them
export const claudeImageCount = () => (SAMPLE && LIMITS && LIMITS.images ? LIMITS.images.maxCount || 0 : 0);
export async function claudeSample(prompt, opts) { await ready; if (!SAMPLE) throw { code: 'unavailable' }; return SAMPLE(prompt, opts); }
export const engine = () => FREE.mode();
export const aiAvailable = () => { const m = FREE.mode(); return m === 'claude' ? !!SAMPLE : m === 'hybrid' ? !!SAMPLE || FREE.hasAny() : FREE.hasAny(); };
// pictures go with a request only where the engine that answers it can see them (the chapter's reading: Claude in the
// hybrid mode; a free vision model, Gemini, otherwise)
export const imageLimit = () => { const c = LIMITS && LIMITS.images ? LIMITS.images.maxCount : 0, m = FREE.mode(), fv = FREE.hasVision() ? 6 : 0; return m === 'claude' ? c : m === 'hybrid' ? (SAMPLE ? c : fv) : fv; };
// who writes, in words, for the status lines
export const writer = (role = 'worker') => { const m = FREE.mode(); return m === 'claude' || (m === 'hybrid' && role === 'director' && SAMPLE) ? 'Claude' : 'The free models'; };
export function errCopy(err) {
  const code = err && err.code;
  return ({ cancelled: 'Stopped.', not_granted: 'Claude access was declined for this page.', rate_limited: 'Too many requests right now. Wait a minute and try again.', prompt_too_large: 'The request is too long. Analyse a smaller part.', invalid_json: 'The answer did not come back in the expected format. Try again.', refused: 'Claude declined this request.', session_expired: 'Your session expired. Sign in again on claude.ai.', unavailable: 'Claude is not reachable from this view. Use "Copy prompt" to run it in any AI, then paste the answer back.', images_unavailable: 'This view cannot send images to Claude.' }[code]) || (err && err.message) || 'Something went wrong. Try again.';
}
export function parseJSONLoose(text) {
  let s = String(text || '').trim(); const fence = s.match(/```(?:json)?\s*([\s\S]*?)(```|$)/); if (fence && fence[1].trim()) s = fence[1];
  const a = Math.min(...['{', '['].map(c => { const i = s.indexOf(c); return i < 0 ? 1e9 : i; })); const b = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (a === 1e9) throw { code: 'invalid_json', text };
  const tryParse = t => { try { return JSON.parse(t); } catch (e) { try { return JSON.parse(t.replace(/\\(?!["\\/bfnrtu])/g, '\\\\')); } catch (e2) { return undefined; } } };
  if (b > a) { const v = tryParse(s.slice(a, b + 1)); if (v !== undefined) return v; }
  // an answer cut off by the output limit: keep every complete value and close the brackets (credits already spent are not wasted)
  const r = repairTruncatedJSON(s.slice(a)); if (r) { const v = tryParse(r); if (v !== undefined) { if (v && typeof v === 'object') v._truncated = true; return v; } }
  throw { code: 'invalid_json', text };
}
// Cut a truncated JSON text back to its last complete element and close the open brackets.
export function repairTruncatedJSON(s) {
  const stack = []; let inStr = false, esc = false, cut = -1, cutStack = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') stack.push(c);
    else if (c === '}' || c === ']') { stack.pop(); if (!stack.length) return s.slice(0, i + 1); cut = i + 1; cutStack = stack.slice(); }
    else if (c === ',' && stack.length) { cut = i; cutStack = stack.slice(); }
  }
  if (cut < 0 || !cutStack) return null;
  let out = s.slice(0, cut).replace(/,\s*$/, '');
  for (let k = cutStack.length - 1; k >= 0; k--) out += cutStack[k] === '{' ? '}' : ']';
  return out;
}
// Ask for JSON. onText streams progress; onStatus says which engine and model is at work, and any wait. role: 'director'
// or 'worker' (see the top). validate(v) → null | what is wrong: a free model's answer that fails it goes to the next.
// minRank: the free models' strength floor (free.js ask; by default 80 for the director's requests, 55 for a worker's);
// acceptTruncated: a free model's cut-off answer may be used when validate accepts it; fresh: skip the free cache.
// A free model has no search tools: its prompt is stripped of the rules that ask for outside sources (forFreeModels).
// every request shows in the activity panel (js/ai/activity.js) with a Stop: inside the job that asked for it (an
// analysis, a sub-scroll, a diorama), or as a small job of its own
export async function askJSON(prompt, o = {}) {
  const own = currentJob() ? null : startJob(o.label || 'AI request'), J = own || currentJob();
  const signal = anyOf([o.signal, J.signal]), onStatus = t => { J.status(t); o.onStatus && o.onStatus(t); };
  try { return await askJSON0(prompt, { ...o, signal, onStatus }); }
  catch (e) { if (J.signal.aborted && !(e && e.code === 'cancelled')) throw { code: 'cancelled', message: 'Stopped.' }; throw e; }
  finally { if (own) own.end(); }
}
async function askJSON0(prompt, { onText, onTool, onStatus, images, signal, tools, tier = 'complex', role = 'worker', validate, manualTitle = 'Run this request in any AI', minRank, acceptTruncated = false, fresh = false } = {}) {
  await ready;
  const m = FREE.mode();
  const viaClaude = async () => {
    const opts = { modelTier: tier, cache: false, signal, onText: ({ text }) => onText && onText(text) };
    if (images && images.length) opts.images = images;
    // research tools (js/ai/evidence.js): each execute is wrapped so the UI can show what is being looked up
    if (tools && tools.length) opts.tools = tools.map(t => ({ ...t, execute: async input => { onTool && onTool(t.name, input); try { return await t.execute(input); } catch (e) { return { error: (e && (e.code || e.message)) || 'failed' }; } } }));
    const { text, truncated } = await SAMPLE(prompt, opts);
    const v = parseJSONLoose(text); if (truncated && v && typeof v === 'object') v._truncated = true; return v;
  };
  const viaFree = exhausted => FREE.ask(forFreeModels(prompt), { images: images && FREE.hasVision() ? images : [], signal, onText, onStatus, validate, exhausted, minRank: minRank != null ? minRank : role === 'director' ? 80 : 55, acceptTruncated, fresh });
  if (m === 'claude' || (!FREE.hasAny() && m === 'hybrid')) { if (!SAMPLE) return manualRelay(prompt, manualTitle); return viaClaude(); }
  if (m === 'free' || !SAMPLE) { if (!FREE.hasAny()) return manualRelay(prompt, manualTitle); return viaFree(false); }
  // hybrid: the director's requests to Claude first, the worker's to the free pool first; each falls back to the other
  const STANDIN = /rate_limited|unavailable|not_granted|session_expired|invalid_json|refused|timeout|overloaded|server/;
  if (role === 'director') {
    try { return await viaClaude(); } catch (e) { if (e && e.code === 'cancelled') throw e; if (!(e && STANDIN.test(e.code || ''))) throw e; onStatus && onStatus('Claude is not available for this one (' + (errCopy(e) || e.code) + '): the free models take it.'); return viaFree(false); }
  }
  try { return await viaFree(true); } catch (e) {
    if (e && e.code === 'cancelled') throw e;
    onStatus && onStatus(e && e.code === 'free_exhausted' ? 'Every free model is at its limit: Claude takes this one.' : 'The free models could not do this one: Claude takes it.');
    try { return await viaClaude(); } catch (e2) { if (e2 && e2.code === 'cancelled') throw e2; if (e2 && STANDIN.test(e2.code || '')) return viaFree(false); throw e2; }
  }
}
// Manual relay: show the prompt to copy into any AI, accept the pasted JSON answer.
export function manualRelay(prompt, title) {
  return new Promise((res, rej) => {
    const ta = el('textarea', { class: 'field mono', rows: 8, 'aria-label': 'Paste the JSON answer here', placeholder: 'Paste the JSON answer here' });
    const pre = el('textarea', { class: 'field mono', rows: 6, readonly: true, 'aria-label': 'Prompt to copy' }); pre.value = prompt;
    const close = (fn, v) => { box.remove(); fn(v); };
    const copy = el('button', { class: 'btn', text: 'Copy prompt', onclick: async () => { try { await navigator.clipboard.writeText(prompt); toast('Prompt copied'); } catch (e) { pre.select(); toast('Select the text and copy it'); } } });
    const box = el('div', { class: 'modal-veil' }, [el('div', { class: 'modal glass wide' }, [
      el('h3', { text: title }),
      el('p', { class: 'dim', text: 'Copy the prompt into Claude (any account), ChatGPT, Gemini or another AI together with your file, then paste the JSON it returns.' }),
      pre, el('div', { class: 'row' }, [copy]), ta,
      el('div', { class: 'row end' }, [el('button', { class: 'btn', text: 'Cancel', onclick: () => close(rej, { code: 'cancelled' }) }),
        el('button', { class: 'btn primary', text: 'Use this answer', onclick: () => { try { close(res, parseJSONLoose(ta.value)); } catch (e) { toast('That is not valid JSON yet'); } } })])])]);
    document.body.append(box);
  });
}
