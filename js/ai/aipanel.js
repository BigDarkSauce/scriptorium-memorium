// The AI settings: which engine writes (Claude / Claude + free models / free models only), the free providers with
// their keys, today's use, and the live test. Opened from the round "AI" button under the graphics button, on every
// screen. Everything here is kept in this browser only (js/ai/free.js).
import { el, toast } from '../util.js';
import * as FREE from './free.js';
import { claudeAvailable } from './claude.js';
import { bridgeReady, bridgeInfo, inClaudeApp, bridgeVault } from './bridge.js';
import * as MEDIA from './media.js';

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
  let S = FREE.settings(), reachState = null, offS = null; const close = () => { if (offS) offS(); veil.remove(); document.removeEventListener('keydown', esc); }, esc = e => { if (e.key === 'Escape') close(); };
  const modes = el('div', { class: 'ai-modes', role: 'radiogroup', 'aria-label': 'AI engine' });
  const drawModes = () => { modes.innerHTML = ''; Object.keys(MODE_TEXT).forEach(k => { const [t, d] = MODE_TEXT[k], on = S.mode === k;
    const warn = k !== 'free' && !claudeAvailable() ? el('span', { class: 'ai-warn', text: k === 'hybrid' ? 'Claude is only available inside the Claude app: here the free models do all of it.' : 'Claude is only available inside the Claude app: here each request is shown for you to paste into any AI.' })
      : k !== 'claude' && inClaudeApp() && FREE.reachable && reachState === false ? el('span', { class: 'ai-warn', text: k === 'hybrid' ? 'Needs the free-models extension (below): until it is installed, Claude does all of it.' : 'Needs the free-models extension (below).' }) : null;
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
        el('label', { class: 'ai-pname' }, [tog, el('b', { text: p.name }), el('span', { class: 'ai-chip', text: p.editableModel ? 'your endpoint' : p.local ? 'your computer' : p.key === 'required' ? 'free key' : 'no key needed' }), n ? el('span', { class: 'ai-used', text: n + ' today' }) : null]),
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
  // how the free models are reached from here. Inside the Claude app the page may not contact outside addresses: the
  // Scriptorium free-models extension on this computer makes the requests for it (js/ai/bridge.js), so Claude and the
  // free models work together in the same window. Outside the app (the standalone page) they are called directly.
  const reach = el('div', { class: 'ai-reach' }); modes.after(reach);
  // the extension's file, saved through the Claude app (the bundle is published as base64 text: an artifact serves no
  // archives). It says what happened: saved, declined, or where to find the same file instead.
  const dlBtn = label => { const b = el('button', { class: 'btn small primary', type: 'button', text: label, onclick: async () => { b.disabled = true; const was = b.textContent; b.textContent = 'Preparing…';
    try { const b64 = (await (await fetch('bridge/scriptorium-free-models.mcpb.b64.txt', { cache: 'no-store' })).text()).trim(), bin = atob(b64), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const D = window.claude && claude.use ? await claude.use('downloads') : null;
      if (D) { await D.save({ filename: 'Scriptorium free models.mcpb', data: new Blob([bytes], { type: 'application/octet-stream' }) }); toast('Saved. Open your Downloads folder and double-click “Scriptorium free models.mcpb”; Claude Desktop installs it.', 9000); }
      else { const a = el('a', { href: URL.createObjectURL(new Blob([bytes])), download: 'Scriptorium free models.mcpb' }); document.body.append(a); a.click(); a.remove(); toast('If nothing was saved: the same file is in your Scriptorium Memorium folder, bridge\\Scriptorium free models.mcpb.', 9000); } }
    catch (e) { toast(e && e.code === 'declined' ? 'Not saved. The same file is in your Scriptorium Memorium folder: bridge\\Scriptorium free models.mcpb' : 'This view could not save it (' + ((e && (e.message || e.code)) || e) + '). The same file is in your Scriptorium Memorium folder: bridge\\Scriptorium free models.mcpb', 10000); }
    finally { b.disabled = false; b.textContent = was; } } }); return b; };
  // FreeLLMAPI's line: connected (with how many models are ready now and in its catalogue), running but its key is
  // needed, or not running; and when the page could not ask, why (never "not running" for a failure of the asking)
  const fillFla = fl => { fl.textContent = 'FreeLLMAPI: looking…';
    const again = () => el('button', { class: 'linkbtn', type: 'button', text: 'find it again', onclick: () => fillFla(fl) });
    FREE.autoFreeLLMAPI().then(d => { fl.innerHTML = ''; S = FREE.settings(); drawProviders();
      if (d && d.found) { const dash = el('a', { href: d.base.replace('/v1', '') + '/keys', target: '_blank', rel: 'noopener', text: 'its dashboard ↗' });
        if (d.keyRejected) fl.append(el('b', { text: 'FreeLLMAPI is running' }), ` at ${d.base.replace('/v1', '')}, but it refuses the unified key this page holds: copy it again from `, dash, ' (Keys → Unified API key) into the FreeLLMAPI row below. ', again());
        else if (!d.keyFound && !(S.keys.freellmapi || '').trim()) fl.append(el('b', { text: 'FreeLLMAPI is running' }), ` at ${d.base.replace('/v1', '')}; its unified key was not found${d.detectError ? ' (' + d.detectError + ')' : ''}: copy it from `, dash, ' (Keys → Unified API key) into the FreeLLMAPI row below. ', again());
        else fl.append(el('b', { text: '✓ FreeLLMAPI connected' }), ` at ${d.base.replace('/v1', '')}: `, el('b', { text: `${d.readyModels ?? '?'} text models ready now` }), d.catalogModels ? ` (of ${d.catalogModels} in its catalogue; the rest open as you add keys in ` : ' (more open as you add keys in ', dash, '). ', again()); }
      else if (d && d.error) fl.append('FreeLLMAPI: this page could not ask the extension (' + d.error + ') and found no server on ports 31415 or 3001. ', again());
      else fl.append('FreeLLMAPI: not running on this computer. ', el('a', { href: 'https://github.com/tashfeenahmed/freellmapi/releases/latest', target: '_blank', rel: 'noopener', text: 'Install it ↗' }), ' (the Windows .exe), open it once, then ', again(), '.');
    }).catch(e => { fl.textContent = 'FreeLLMAPI: could not ask (' + ((e && (e.message || e.code)) || e) + ').'; }); };
  // pictures and speech: possible from here, or what is missing
  const mediaLine = () => { const p = el('p', { class: 'small ai-media' }, ['Pictures and speech: checking…']);
    MEDIA.mediaStatus().then(m => { p.innerHTML = ''; if (m.ok) p.append(el('b', { text: '✓ Pictures and speech' }), ' through FreeLLMAPI, each admitted only after a strict check (two independent reviewers for a picture; a listen-back word check for speech): the Illustrate and Read aloud buttons on every step.'); else p.append(el('b', { text: 'Pictures and speech: ' }), m.why); }).catch(() => { p.textContent = ''; }); return p; };
  // the keys kept on this computer: said only once the page has really read that file (the page must be allowed to)
  const vaultNote = () => { const sp = el('span', { text: '' }); bridgeVault('get').then(v => { if (v === null && !((bridgeInfo() || {}).tools || []).includes('vault_get')) return; sp.textContent = ' Your keys are also kept on this computer, so every new version of the app has them.'; }).catch(e => { sp.textContent = ' (Your keys could not be kept on this computer: ' + ((e && (e.code || e.message)) || e) + '. They stay in this browser.)'; }); return sp; };
  const drawReach = ok => { reachState = ok; reach.innerHTML = ''; drawModes();
    if (!inClaudeApp()) { reach.className = 'ai-reach' + (ok ? ' good' : '');
      reach.append(el('b', { text: !ok ? 'This page cannot reach the free models (offline?).' : FREE.via() === 'relay' ? '✓ Free models through this computer’s launcher' : 'Free models: called straight from this page.' }), FREE.via() === 'relay' ? ' (its AI relay: FreeLLMAPI, NVIDIA, GitHub Models and the rest all reachable).' : ' Open the app with “Launch Scriptorium.bat” for the AI relay (FreeLLMAPI and the providers a web page may not call).', ' Claude itself is only available inside the Claude app (with the Scriptorium extension the free models work there too).');
      if (FREE.via() === 'relay') { const fl = el('p', { class: 'small ai-fla' }); reach.append(fl, mediaLine()); fillFla(fl); }
      return; }
    if (ok) { const I = bridgeInfo() || {}; reach.className = 'ai-reach good'; reach.append(el('b', { text: '✓ Free models connected' }), ` through the Scriptorium extension on this computer${I.version ? ' (v' + I.version + ')' : ''}: Claude and the free models work together here.`, vaultNote());
      if (!(I.tools || []).includes('freellmapi_detect')) reach.append(el('p', { class: 'small' }, [el('b', { text: 'A newer extension (1.1) is ready: ' }), 'it keeps your keys on this computer and connects FreeLLMAPI by itself. ', dlBtn('Download the new one'), ' then double-click it (Claude Desktop replaces the old one).']));
      else { if (!MEDIA.bridgeBinaryOK()) reach.append(el('p', { class: 'small' }, [el('b', { text: 'A newer extension (1.2) is ready: ' }), 'it carries pictures and speech (checked before use). ', dlBtn('Download the new one'), ' then double-click it; Claude Desktop replaces the old one.'])); const fl = el('p', { class: 'small ai-fla' }); reach.append(fl, mediaLine()); fillFla(fl); }
      return; }
    reach.className = 'ai-reach';
    const dl = dlBtn('Download the extension');
    const again = el('button', { class: 'btn small', type: 'button', text: 'Check again', onclick: async () => { again.disabled = true; again.textContent = 'Checking…'; const v = await FREE.reachable({ fresh: true }); again.disabled = false; again.textContent = 'Check again'; drawReach(v); if (v) toast('Free models connected'); } });
    reach.append(el('b', { text: 'To use free models inside the Claude app, add the Scriptorium free-models extension.' }),
      el('ol', { class: 'ai-steps' }, [el('li', { text: 'Download it (or take “Scriptorium free models.mcpb” from your Scriptorium Memorium folder).' }), el('li', { text: 'Double-click the file: Claude Desktop opens it; press Install. (Or Settings → Extensions → drag the file in.)' }), el('li', { text: 'Come back here and press Check again.' })]),
      el('p', { class: 'dim small', text: 'Why: inside the Claude app this page may not contact outside addresses; the extension makes the free-model requests from your computer (only to LLM addresses; nothing else) and passes the answers back. It is yours alone: only the page’s owner can use it.' }),
      el('div', { class: 'row' }, [dl, again])); };
  if (S.mode !== 'claude' || !inClaudeApp()) FREE.reachable().then(drawReach); else { reach.append(el('span', { class: 'dim small', text: 'Choose a free mode to connect the free models.' })); }
  offS = FREE.onSettings(Sx => { if (Sx.mode !== 'claude' && reachState == null && document.body.contains(reach)) FREE.reachable().then(drawReach); });
  try { const last = JSON.parse(localStorage.getItem('sm-ai-test') || 'null'); if (last && last.res) out.append(el('p', { class: 'dim small', text: `Last test ${new Date(last.at).toLocaleString()}: ` + last.res.map(r => `${r.name} — ${r.verdict}`).join(' · ') })); } catch (e) { }
}
