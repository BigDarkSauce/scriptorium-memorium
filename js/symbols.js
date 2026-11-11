// "Select symbol": the searchable symbol library, opened from the wide map (top right) of the hall and of a room, and
// from a bookcase's or a scroll's own icon in the map's legend. Pick what gets a symbol (a bookcase in the hall, a
// scroll in a room), search by name or by meaning ("chemistry", "planet", "law", "money"), click a symbol: it is
// assigned at once and stays on the map; the window stays open for the next one.
//
// The library: the app's own 40 symbols first, then Lucide's 2,020 (lucide.dev, ISC licence), shipped with the app as
// assets/symbols.json (built by tools/build-symbols.mjs; loaded the first time the window opens, ~150 KB compressed).
// A chosen library symbol is named 'lu:<name>' and its drawing is kept with what wears it (iconD), so the map draws it
// at once on the next visit, and on another computer after Import / export.
import { el, toast, esc } from './util.js';
import { ICONS, ICON_NAMES, iconSVG, rememberIcon, iconLabel } from './icons.js';

let LIB = null, libP = null;
const pretty = n => n.replace(/-/g, ' ').replace(/\b(\w)/, c => c.toUpperCase());
function loadLibrary() {
  return libP || (libP = fetch('assets/symbols.json').then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(j => {
    LIB = j.icons.map(([n, d, tags]) => ({ name: 'lu:' + n, label: pretty(n), d, hay: n.replace(/-/g, ' ') + ' ' + tags, key: n })); return LIB;
  }).catch(e => { libP = null; throw e; }));
}
const OWN = () => ICON_NAMES.map(n => ({ name: n, label: ICONS[n].label, d: ICONS[n].d, hay: (ICONS[n].label + ' ' + n + ' ' + ICONS[n].words.join(' ')).toLowerCase(), stems: ICONS[n].words.map(w => w.toLowerCase()), key: n, own: true }));

// ranking: every word of the query must match the name or a tag; a match in the name counts most, a whole word more
// than a beginning, a beginning more than a middle; the app's own symbols win ties
function search(list, q) {
  const words = q.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean); if (!words.length) return list;
  const out = [];
  for (const it of list) {
    let score = 0, all = true; const name = ' ' + it.key.replace(/-/g, ' ').toLowerCase() + ' ', hay = ' ' + it.hay.toLowerCase() + ' ';
    for (const w of words) {
      let s = 0;
      if (name.includes(' ' + w + ' ')) s = 100; else if (name.includes(' ' + w)) s = 70; else if (name.includes(w)) s = 45;
      else if (hay.includes(' ' + w + ' ') || (it.stems && it.stems.some(t => t.length > 3 && w.startsWith(t)))) s = 35;   /* the app's own words are stems: 'chemi' answers 'chemistry' */ else if (hay.includes(' ' + w)) s = 22; else if (w.length > 3 && hay.includes(w)) s = 10;
      if (!s) { all = false; break; } score += s;
    }
    // glyphs (letters, headings) carry many subject tags (the chemical elements' symbols): after real pictures unless asked for by name
    const glyph = /^(letter|heading|circle-letter|square-letter|a-|case-|type|text-|whole-word|superscript|subscript)/.test(it.key) && !words.some(w => name.includes(' ' + w));
    if (all) out.push({ it, score: score + (it.own ? 5 : 0) - it.key.length * .05 - (glyph ? 30 : 0) });
  }
  return out.sort((a, b) => b.score - a.score).map(x => x.it);
}

// targets: [{ id, label, sub, icon, auto }] (auto: the symbol it has when none is chosen); onSet(target, name|'', d, label)
export function openSymbolPicker({ title = 'Select a symbol', kind = 'bookcase', targets, current, onSet }) {
  if (!targets || !targets.length) { toast('There is nothing on this map to give a symbol to yet.'); return; }
  document.querySelector('.sym-veil') && document.querySelector('.sym-veil').remove();
  let T = targets.find(t => t.id === current) || targets[0], q = '', shown = 0, results = [];
  const veil = el('div', { class: 'modal-veil sym-veil' }), box = el('div', { class: 'modal glass wide sym-dlg', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  const close = () => { veil.remove(); removeEventListener('keydown', onK, true); }, onK = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const pick = el('select', { class: 'field sym-target', 'aria-label': 'Which ' + kind + ' gets the symbol' }, targets.map(t => el('option', { value: t.id, text: t.label + (t.sub ? ' — ' + t.sub : ''), selected: t === T })));
  const now = el('div', { class: 'sym-now' }), input = el('input', { class: 'field sym-q', type: 'search', placeholder: 'Search 2,000+ symbols by name or meaning: chemistry, planet, law, money, brain…', 'aria-label': 'Search symbols', autocomplete: 'off', spellcheck: 'false' });
  const status = el('div', { class: 'dim small sym-status', role: 'status' }), grid = el('div', { class: 'sym-grid', role: 'listbox', 'aria-label': 'Symbols' }), more = el('button', { class: 'btn small sym-more', type: 'button', text: 'Show more', hidden: true, onclick: () => draw(true) });
  const drawNow = () => { now.innerHTML = ''; const cur = T.icon || ''; now.append(el('span', { class: 'sym-now-ico', html: iconSVG(cur || T.auto || 'book', 30) }), el('span', {}, [el('b', { text: T.label }), el('span', { class: 'dim small', text: cur ? ' · ' + iconLabel(cur) : ' · automatic (' + iconLabel(T.auto || 'book') + ', from its name)' })]),
    ...(cur ? [el('button', { class: 'btn small ghost', type: 'button', text: 'Back to automatic', onclick: () => assign(null) })] : [])); grid.querySelectorAll('.sym-cell').forEach(b => b.setAttribute('aria-selected', String(b.dataset.name === cur))); };
  function assign(it) {
    const name = it ? it.name : ''; if (it && !it.own) rememberIcon(it.name, it.label, it.d);
    onSet(T, name, it && !it.own ? it.d : '', it ? it.label : ''); T.icon = name || '';
    toast(it ? `${T.label}: ${it.label}` : `${T.label}: its symbol follows its name again`); drawNow();
  }
  function draw(append) {
    if (!append) { grid.innerHTML = ''; shown = 0; grid.scrollTop = 0; }
    const page = results.slice(shown, shown + 240); shown += page.length;
    page.forEach(it => grid.append(el('button', { class: 'sym-cell' + (it.own ? ' own' : ''), type: 'button', role: 'option', 'data-name': it.name, 'aria-selected': String(it.name === (T.icon || '')), title: it.label + (it.own ? ' (the app\'s own)' : ''),
      html: `<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${esc(it.d)}"/></svg><span>${esc(it.label)}</span>`, onclick: () => assign(it) })));
    more.hidden = shown >= results.length;
    status.textContent = q ? `${results.length.toLocaleString()} symbol${results.length === 1 ? '' : 's'} for “${q}”${results.length ? '' : ': try another word (a subject, an object, an action)'}` : `${results.length.toLocaleString()} symbols: the app's own first, then the library`;
  }
  const all = () => OWN().concat(LIB || []);
  let t0 = 0; input.oninput = () => { clearTimeout(t0); t0 = setTimeout(() => { q = input.value.trim(); results = search(all(), q); draw(false); }, 90); };
  input.onkeydown = e => { if (e.key === 'Enter' && results[0]) { e.preventDefault(); assign(results[0]); } };
  pick.onchange = () => { T = targets.find(t => t.id === pick.value) || T; drawNow(); };
  box.append(el('div', { class: 'row between' }, [el('h3', { text: title }), el('button', { class: 'ibtn', type: 'button', 'aria-label': 'Close', text: '✕', onclick: close })]),
    el('div', { class: 'sym-for' }, [el('label', { text: 'For' }), pick]), now, input, status, grid, more,
    el('div', { class: 'row between sym-foot' }, [el('span', { class: 'dim small', html: 'Click a symbol to give it to the chosen ' + esc(kind) + '; choose another ' + esc(kind) + ' above to go on. Library symbols: <a href="https://lucide.dev" target="_blank" rel="noopener">Lucide</a> (ISC licence).' }), el('button', { class: 'btn', type: 'button', text: 'Done', onclick: close })]));
  veil.append(box); document.body.append(veil); veil.addEventListener('pointerdown', e => { if (e.target === veil) close(); }); addEventListener('keydown', onK, true);
  results = OWN(); draw(false); drawNow(); input.focus();
  status.textContent = 'Loading the symbol library…';
  loadLibrary().then(() => { if (!veil.isConnected) return; results = search(all(), q); draw(false); }).catch(e => { status.textContent = 'The library could not be loaded here (' + (e.message || e) + '): the app\'s own symbols are shown.'; });
}
