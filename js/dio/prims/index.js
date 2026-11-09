// The domain primitives: one entry point for the reader (js/room/diagrams.js renderFigure hands every primitive kind
// here), the 2.5D lectern panel and the topdown 3D diorama some of them compile to (sceneFor).
//   renderPrimitive(f, box, {small, panel}) → cleanup      f = a validated figure spec (js/room/figspec.js)
//   openLectern(f)                                          the same primitive, large, on a tilted board with parallax
//   sceneFor(f)                                             a scene spec (docs/SCENE_SPEC.md) or null
import { el, mathHTML } from '../../util.js';
import { makeStage, calm, isNarrow } from './kit.js';
import { PRIMITIVES } from '../domains.js';
import * as construct from './construct.js';
import * as signal from './signal.js';
import * as transform from './transform.js';
import * as sampler from './sampler.js';
import * as loops from './loops.js';
import * as rivals from './rivals.js';
import * as flows from './flows.js';
import * as argument from './argument.js';
import * as story from './story.js';
import * as sandbox from './sandbox.js';
import { sceneFor } from './scenes.js';
export { sceneFor };

export const MODULES = { progressive_construction: construct, state_machine: signal, transform2d: transform, distribution_lab: sampler, causal_loop: loops, competing_explanations: rivals, flow_network: flows, argument_map: argument, data_narrative: story, algorithm_sandbox: sandbox };
const LABEL = { progressive_construction: 'construction', state_machine: 'signal journey', transform2d: 'transformation', distribution_lab: 'distribution', causal_loop: 'causal loops', competing_explanations: 'competing explanations', flow_network: 'business system', argument_map: 'argument map', data_narrative: 'data story', algorithm_sandbox: 'algorithm sandbox' };

export function renderPrimitive(f, box, { small = false, panel = false } = {}) {
  const M = MODULES[f.kind]; if (!M) throw new Error('no primitive ' + f.kind);
  const narrow = panel ? innerWidth < 700 : (small || isNarrow());
  const dims = M.html ? { W: 600, H: 10 } : M.size(f, { narrow });
  box.classList.add('prim', 'prim-' + f.kind); if (narrow) box.classList.add('narrow'); if (panel) box.classList.add('in-panel');
  const S = makeStage(box, { ...dims, small, panel }); S.narrow = narrow;
  if (M.html) { S.svg.remove(); S.frame.classList.add('html'); }
  else S.svg.setAttribute('aria-label', (f.alt || f.caption || f.kind) + ' — interactive ' + LABEL[f.kind]);
  // the control row ends with a tag naming the kind of explanation, and the lectern / diorama buttons
  M.render(f, S);
  { const tools = el('span', { class: 'prim-tools' }, [el('span', { class: 'prim-kind', text: LABEL[f.kind] })]);
    if (!panel) {
    if (PRIMITIVES[f.kind].panel) tools.append(el('button', { type: 'button', class: 'pbtn ghost', title: 'Open it large on the lectern', html: '⤢ Lectern', onclick: e => { e.stopPropagation(); openLectern(f); } }));
    const sc = sceneFor(f); if (sc && typeof window !== 'undefined' && window.__scriptorium) tools.append(el('button', { type: 'button', class: 'pbtn ghost', title: 'Walk into it as a 3D diorama', html: '◫ Diorama', onclick: e => { e.stopPropagation(); openScene(sc, f); } }));
    }
    S.ctrls.append(tools);
  }
  box._prim = S;   // the test and polish harnesses drive a primitive through this
  return () => S.dispose();
}
function openScene(sc, f) {
  const app = window.__scriptorium, m = app.mode, back = m && m.book ? { room: m.book.id, part: m.reader && m.reader.part ? m.reader.part.id : null } : null;
  const lec = document.querySelector('.prim-lectern'); if (lec) lec.remove();
  app.openDiorama(JSON.parse(JSON.stringify(sc)), { title: sc.title, subtitle: f.caption, returnTo: back, skipIntro: false, autoTransition: true });
}
// ---- the lectern: a 2.5D panel. The board is tilted toward the reader and the figure's layers (wires below, nodes
// above, labels on top) shift with the pointer at different depths; under reduced motion it lies flat and still.
export function openLectern(f) {
  document.querySelectorAll('.prim-lectern').forEach(x => x.remove());
  const still = calm(), host = el('figure', { class: 'fig prim-board' });
  const close = () => { cleanup(); veil.remove(); document.removeEventListener('keydown', key); };
  const head = el('div', { class: 'lect-head' }, [el('span', { class: 'lect-kicker', text: 'on the lectern · ' + LABEL[f.kind] }), el('b', { html: mathHTML(f.title || f.caption, 'label') }), el('button', { type: 'button', class: 'pbtn', 'aria-label': 'Close the lectern', text: 'Close ✕', onclick: close })]);
  const desk = el('div', { class: 'lect-desk' + (still ? ' still' : '') }, [host]);
  const veil = el('div', { class: 'modal-veil prim-lectern', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Lectern: ' + (f.caption || f.kind) }, [el('div', { class: 'lect-wrap' }, [head, desk])]);
  veil.addEventListener('pointerdown', e => { if (e.target === veil) close(); });
  const key = e => { if (e.key === 'Escape') close(); }; document.addEventListener('keydown', key);
  document.body.append(veil);
  const cleanup = renderPrimitive(f, host, { panel: true });
  if (f.caption) host.append(el('figcaption', { class: 'fig-cap', html: mathHTML(f.caption) }));
  if (!still) desk.addEventListener('pointermove', e => { const r = desk.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5; desk.style.setProperty('--rx', (6 - y * 4).toFixed(2) + 'deg'); desk.style.setProperty('--ry', (x * 5).toFixed(2) + 'deg'); desk.style.setProperty('--px', (-x * 5).toFixed(2) + 'px'); desk.style.setProperty('--py', (-y * 4).toFixed(2) + 'px'); });   /* nodes (the lifted layer) move against the wires: css/app.css .lect-desk */
  setTimeout(() => { const b = veil.querySelector('.lect-head .pbtn'); if (b) b.focus(); }, 30);
  return veil;
}
