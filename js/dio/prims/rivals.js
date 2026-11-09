// competing_explanations (Unlearning Economics; inference to the best explanation): rival accounts of the same facts
// side by side, what each predicts, and an evidence matrix. Rows where the accounts disagree are the ones that can
// tell them apart; mark a row as observed and the accounts it contradicts are struck through.
// Spec: {question, hypotheses:[{id,label,claim,predicts:[str]}], evidence:[{id,label,fits:{hid:'+'|'-'|'0'},note?,observed?}]}
import { el } from '../../util.js';
import { FC, mathHTML } from './kit.js';

export const html = true;
export function render(f, S) {
  const L = 'ABCD', H = f.hypotheses, obs = new Set(f.evidence.filter(e => e.observed).map(e => e.id));
  const telling = e => new Set(H.map(h => e.fits[h.id] || '0')).size > 1;
  const wrap = el('div', { class: 'rivals' + (S.narrow ? ' narrow' : '') }); S.frame.append(wrap);
  const draw = () => {
    const out = new Set(H.filter(h => [...obs].some(id => (f.evidence.find(e => e.id === id).fits[h.id] || '0') === '-')).map(h => h.id));
    wrap.innerHTML = '';
    if (f.question) wrap.append(el('div', { class: 'rv-q', html: '<span class="q-mark">Q</span> ' + mathHTML(f.question) }));
    wrap.append(el('div', { class: 'rv-cols', style: { gridTemplateColumns: S.narrow ? '1fr' : `repeat(${H.length}, 1fr)` } }, H.map((h, i) => el('div', { class: 'rv-h' + (out.has(h.id) ? ' out' : '') }, [
      el('div', { class: 'rv-head' }, [el('span', { class: 'rv-tag', text: L[i] }), el('b', { html: mathHTML(h.label) })]),
      el('p', { class: 'rv-claim', html: mathHTML(h.claim) }),
      h.predicts.length ? el('div', { class: 'rv-pred' }, [el('span', { class: 'rv-lab', text: 'predicts' }), el('ul', {}, h.predicts.map(p => el('li', { html: mathHTML(p) })))]) : null,
      out.has(h.id) ? el('div', { class: 'rv-verdict', text: 'contradicted by what was observed' }) : null]))));
    const tbl = el('table', { class: 'rv-matrix' }, [el('thead', {}, [el('tr', {}, [el('th', { text: 'Evidence (press a row: observed?)' }), ...H.map((h, i) => el('th', { title: h.label }, [el('span', { class: 'rv-tag', text: L[i] })]))])]),
      el('tbody', {}, f.evidence.map(e => { const tr = el('tr', { class: (obs.has(e.id) ? 'obs ' : '') + (telling(e) ? 'tells' : 'same'), tabindex: 0, role: 'button', 'aria-pressed': String(obs.has(e.id)) }, [el('td', {}, [el('span', { class: 'rv-box', text: obs.has(e.id) ? '☑' : '☐' }), ' ', el('span', { html: mathHTML(e.label) }), telling(e) ? el('span', { class: 'rv-badge', text: 'tells them apart' }) : el('span', { class: 'rv-badge dim', text: 'fits all alike' }), e.note && obs.has(e.id) ? el('div', { class: 'rv-note', html: mathHTML(e.note) }) : null]), ...H.map(h => { const v = e.fits[h.id] || '0'; return el('td', { class: 'rv-cell v' + (v === '+' ? 'p' : v === '-' ? 'm' : 'z'), title: v === '+' ? 'expected by ' + h.label : v === '-' ? 'contradicts ' + h.label : 'says nothing either way', text: v === '+' ? '✓' : v === '-' ? '✗' : '–' }); })]);
        const tog = () => { if (obs.has(e.id)) obs.delete(e.id); else obs.add(e.id); draw(); }; tr.onclick = tog; tr.onkeydown = ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); tog(); } }; return tr; }))]);
    wrap.append(el('div', { class: 'rv-scroll' }, [tbl]));
    const left = H.filter(h => !out.has(h.id));
    S.read([['observed', obs.size + ' of ' + f.evidence.length], ['still standing', left.map(h => L[H.indexOf(h)] + ' ' + h.label).join(', ') || 'none'], ['rows that discriminate', f.evidence.filter(telling).length]]);
    S.say(obs.size ? '' : `<p>A row with the same mark in every column cannot decide between the accounts; mark a row that <b style="color:${FC.rubric}">tells them apart</b> as observed.</p>`);
  };
  S.btn('Clear observations', () => { obs.clear(); draw(); });
  draw(); S.redraw = draw; S.observe = id => { obs.add(id); draw(); };
  return { draw };
}
