// The AI settings: which engine writes (Claude / Claude + free models / free models only), the free providers with
// their keys, today's use, and the live test. Opened from the round "AI" button under the graphics button, on every
// screen. Everything here is kept in this browser only (js/ai/free.js).
import { el, toast } from '../util.js';
import * as FREE from './free.js';
import { claudeAvailable } from './claude.js';

const MODE_TEXT = {
  claude: ['Claude directs', 'Your Claude reads every chapter, plans and writes every scroll and diorama. The best quality; uses your Claude plan\'s limits.'],
  hybrid: ['Claude + free models', 'Claude reads each chapter and plans and checks each diorama; the free models write the volume (coverage, repairs, figures, diorama code). Either stands in when the other is at its limit, so a job never stops.'],
  free: ['Free models only', 'No Claude at all: the pool of free models writes everything, the best free one first. When all are at their limits the job waits for the next reset instead of failing.'],
};
export function aiButton(app) {
  const btn = el('button', { class: 'ai-btn glass', type: 'button', title: 'AI engine', 'aria-label': 'AI engine settings', html: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 3l1.8 4.6L18.5 9l-4.7 1.6L12 15l-1.8-4.4L5.5 9l4.7-1.4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M18 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" fill="currentColor"/></svg>' });
  btn.onclick = () => openAIPanel(app);
  const sync = () => { btn.dataset.mode = FREE.mode(); btn.title = 'AI engine: ' + FREE.MODES[FREE.mode()]; };
  FREE.onSettings(sync); sync(); document.body.append(btn); return btn;
}
export function openAIPanel(app) {
  if (document.querySelector('.ai-panel')) return;
  let S = FREE.settings(); const close = () => { veil.remove(); document.removeEventListener('keydown', esc); }, esc = e => { if (e.key === 'Escape') close(); };
  const modes = el('div', { class: 'ai-modes', role: 'radiogroup', 'aria-label': 'AI engine' });
  const drawModes = () => { modes.innerHTML = ''; Object.keys(MODE_TEXT).forEach(k => { const [t, d] = MODE_TEXT[k], on = S.mode === k;
    const warn = k !== 'free' && !claudeAvailable() ? el('span', { class: 'ai-warn', text: 'Claude is not reachable from this page' + (k === 'hybrid' ? ': the free models do all of it here.' : ': requests are shown for you to paste into any AI.') }) : null;
    modes.append(el('button', { type: 'button', role: 'radio', 'aria-checked': String(on), class: 'ai-mode' + (on ? ' on' : ''), onclick: () => { S = FREE.saveSettings({ mode: k }); drawModes(); drawProviders(); } }, [el('b', { text: t }), el('span', { text: d }), warn])); }); };
  const plist = el('div', { class: 'ai-providers' }), out = el('div', { class: 'ai-test' });
  const use = FREE.usageToday();
  const drawProviders = () => { plist.innerHTML = ''; plist.hidden = S.mode === 'claude';
    FREE.PROVIDERS.forEach(p => {
      const on = FREE.isOn(p, S), key = el('input', { class: 'field mono', type: 'password', placeholder: p.key === 'required' ? 'API key (required)' : p.key === 'optional' ? 'key (optional)' : '', value: S.keys[p.id] || '', autocomplete: 'off', spellcheck: 'false', 'aria-label': p.name + ' key', hidden: p.key === 'none' });
      key.onchange = () => { S = FREE.saveSettings({ keys: { ...S.keys, [p.id]: key.value.trim() } }); drawProviders(); };
      const base = p.editableBase ? el('input', { class: 'field mono', value: S.bases[p.id] || p.base, placeholder: 'https://…/v1', 'aria-label': p.name + ' address', onchange: e => { S = FREE.saveSettings({ bases: { ...S.bases, [p.id]: e.target.value.trim() } }); } }) : null;
      const model = p.editableModel || p.id === 'ollama' ? el('input', { class: 'field mono', value: S.models[p.id] || '', placeholder: p.id === 'ollama' ? 'model, e.g. qwen3:8b' : 'model id', 'aria-label': p.name + ' model', onchange: e => { S = FREE.saveSettings({ models: { ...S.models, [p.id]: e.target.value.trim() } }); } }) : null;
      const tog = el('input', { type: 'checkbox', checked: on, 'aria-label': 'Use ' + p.name, onchange: e => { const v = e.target.checked; S = p.local || p.editableModel ? FREE.saveSettings({ on: { ...S.on, [p.id]: v } }) : FREE.saveSettings({ off: { ...S.off, [p.id]: !v } }); drawProviders(); } });
      const n = Object.entries(use.requests).filter(([k]) => k.startsWith(p.id + '|')).reduce((a, [, v]) => a + v, 0);
      const ready = on && (p.key !== 'required' || (S.keys[p.id] || '').trim());
      plist.append(el('div', { class: 'ai-prov' + (ready ? ' ready' : '') }, [
        el('label', { class: 'ai-pname' }, [tog, el('b', { text: p.name }), el('span', { class: 'ai-chip', text: p.key === 'none' || p.key === 'optional' && !p.local ? 'no key needed' : p.local ? 'your computer' : 'free key' }), n ? el('span', { class: 'ai-used', text: n + ' today' }) : null]),
        el('div', { class: 'ai-pnote', text: p.note }),
        el('div', { class: 'ai-pkeys' }, [base, key, model, p.keyUrl ? el('a', { href: p.keyUrl, target: '_blank', rel: 'noopener', class: 'ai-get', text: p.key === 'required' ? 'Get a free key ↗' : 'Site ↗' }) : null].filter(Boolean))]));
    });
  };
  const testBtn = el('button', { class: 'btn primary', type: 'button', text: 'Test the free models', onclick: async () => {
    testBtn.disabled = true; out.innerHTML = ''; const rows = new Map(), table = el('div', { class: 'ai-rows' }); out.append(el('p', { class: 'dim small', text: 'Each provider: its model list, a tiny exact answer, then this app\'s real chapter request on a short passage, checked by the app\'s own quality gate. A minute or two.' }), table);
    const row = r => { let e = rows.get(r.id); if (!e) { e = el('div', { class: 'ai-row' }); rows.set(r.id, e); table.append(e); } e.className = 'ai-row ' + (r.verdict === 'writes scrolls' ? 'good' : r.verdict === 'fail' && r.step === 'done' ? 'bad' : r.step === 'done' ? 'mid' : '');
      const c = r.chain, txt = r.step && r.step !== 'done' ? r.step : r.reach && !r.reach.ok ? r.reach.why : c ? (c.ok ? `${c.steps} steps, ${c.issues} issue${c.issues === 1 ? '' : 's'} in ${(c.ms / 1000).toFixed(0)} s` : c.why || `${c.steps} steps, ${c.issues} issues: too weak`) : r.ping ? (r.ping.ok ? 'alive (' + r.ping.ms + ' ms)' : r.ping.why) : '…';
      e.innerHTML = ''; e.append(el('b', { text: r.name }), el('span', { class: 'mono', text: r.model || '' }), el('span', { text: txt }), el('i', { text: r.step === 'done' ? r.verdict : '' })); };
    const ac = new AbortController(); stopBtn.hidden = false; stopBtn.onclick = () => ac.abort();
    try { const { testAll } = await import('./freetest.js'); const res = await testAll({ signal: ac.signal, onStep: row }); res.forEach(r => row({ ...r, step: 'done' }));
      const good = res.filter(r => r.verdict === 'writes scrolls').length; out.prepend(el('p', { class: 'ai-sum', text: good ? `${good} of ${res.length} providers write scrolls from here.` : 'None of the providers wrote a usable scroll from here. Add a free key (Gemini or Groq first), or check the reach column.' }));
      try { localStorage.setItem('sm-ai-test', JSON.stringify({ at: Date.now(), res })); } catch (e) { } }
    catch (e) { if (!(e && e.code === 'cancelled')) toast('The test stopped: ' + (e && (e.message || e.code) || e)); }
    finally { testBtn.disabled = false; stopBtn.hidden = true; }
  } });
  const stopBtn = el('button', { class: 'btn', type: 'button', text: 'Stop', hidden: true });
  const forget = el('button', { class: 'btn ghost', type: 'button', text: 'Forget today\'s limits', title: 'Clear the counted requests and cool-downs kept in this browser (after a provider raised its limits, or a new key)', onclick: () => { FREE.resetUsage(); toast('Limits forgotten: every model is tried again.'); } });
  const veil = el('div', { class: 'modal-veil' }, [el('div', { class: 'modal glass wide ai-panel', role: 'dialog', 'aria-label': 'AI engine' }, [
    el('div', { class: 'row between' }, [el('h3', { text: 'AI engine' }), el('button', { class: 'ibtn', type: 'button', 'aria-label': 'Close', text: '✕', onclick: close })]),
    modes, plist,
    el('p', { class: 'dim small', text: 'Keys stay in this browser only and go only to the provider they belong to. Free tiers have limits per minute and per day; the router moves to the next free model, and when every one is busy it waits for the earliest reset. A model on your own computer (Ollama, LM Studio, FreeLLMAPI) has no limit at all.' }),
    el('div', { class: 'row' }, [testBtn, stopBtn, forget]), out])]);
  veil.addEventListener('pointerdown', e => { if (e.target === veil) close(); }); document.addEventListener('keydown', esc);
  drawModes(); drawProviders(); document.body.append(veil);
  try { const last = JSON.parse(localStorage.getItem('sm-ai-test') || 'null'); if (last && last.res) out.append(el('p', { class: 'dim small', text: `Last test ${new Date(last.at).toLocaleString()}: ` + last.res.map(r => `${r.name} — ${r.verdict}`).join(' · ') })); } catch (e) { }
}
