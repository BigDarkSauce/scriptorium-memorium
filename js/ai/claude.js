// AI connector. Inside claude.ai the page asks the viewer's own Claude (sample capability).
// Everywhere else (or when the viewer prefers another AI), every request can be exported as a prompt
// and the JSON answer pasted back — see docs/PROTOCOL.md. The JSON formats are identical either way.
import { el, toast } from '../util.js';
let SAMPLE = null, LIMITS = null, ready;
export function initAI() {
  ready = (async () => { try { if (window.claude && claude.use) { SAMPLE = await claude.use('sample'); if (SAMPLE) LIMITS = await SAMPLE.limits().catch(() => null); } } catch (e) { } })();
  return ready;
}
export const aiAvailable = () => !!SAMPLE;
export const imageLimit = () => (LIMITS && LIMITS.images ? LIMITS.images.maxCount : 0);
export function errCopy(err) {
  const code = err && err.code;
  return ({ cancelled: 'Stopped.', not_granted: 'Claude access was declined for this page.', rate_limited: 'Too many requests right now. Wait a minute and try again.', prompt_too_large: 'The request is too long. Analyse a smaller part.', invalid_json: 'The answer did not come back in the expected format. Try again.', refused: 'Claude declined this request.', session_expired: 'Your session expired. Sign in again on claude.ai.', unavailable: 'Claude is not reachable from this view. Use "Copy prompt" to run it in any AI, then paste the answer back.', images_unavailable: 'This view cannot send images to Claude.' }[code]) || (err && err.message) || 'Something went wrong. Try again.';
}
export function parseJSONLoose(text) {
  let s = String(text || '').trim(); const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/); if (fence) s = fence[1];
  const a = Math.min(...['{', '['].map(c => { const i = s.indexOf(c); return i < 0 ? 1e9 : i; })); const b = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
  if (a === 1e9 || b < a) throw { code: 'invalid_json', text };
  s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch (e) { try { return JSON.parse(s.replace(/\\(?!["\\/bfnrtu])/g, '\\\\')); } catch (e2) { throw { code: 'invalid_json', text }; } }
}
// Ask for JSON. onText streams progress. Falls back to the manual relay dialog when Claude is unavailable.
export async function askJSON(prompt, { onText, onTool, images, signal, tools, tier = 'complex', manualTitle = 'Run this request in any AI' } = {}) {
  await ready;
  if (!SAMPLE) return manualRelay(prompt, manualTitle);
  const opts = { modelTier: tier, cache: false, signal, onText: ({ text }) => onText && onText(text) };
  if (images && images.length) opts.images = images;
  // research tools (js/ai/evidence.js): each execute is wrapped so the UI can show what is being looked up
  if (tools && tools.length) opts.tools = tools.map(t => ({ ...t, execute: async input => { onTool && onTool(t.name, input); try { return await t.execute(input); } catch (e) { return { error: (e && (e.code || e.message)) || 'failed' }; } } }));
  const { text, truncated } = await SAMPLE(prompt, opts);
  const v = parseJSONLoose(text); if (truncated && v && typeof v === 'object') v._truncated = true; return v;
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
