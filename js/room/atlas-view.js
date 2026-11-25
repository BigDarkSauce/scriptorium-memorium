// Chapter atlas UI: a transitionable 2D concept graph whose nodes lead to linked diorama sets.
// The validated reasoning chain remains the source of truth, but is not rendered as a long text scroll here.
import { el, mathHTML, toast } from '../util.js';
import { renderFigure } from './diagrams.js';

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag);
  Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, String(v)));
  return n;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const txt = (v, n = 240) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
const titleCase = s => String(s || '').replace(/-/g, ' ');

function coordinates(nodes) {
  const W = 1100, H = Math.max(660, 190 * Math.ceil(nodes.length / 4));
  const P = nodes.map((n, i) => ({
    id: n.id, node: n,
    x: 130 + (clamp(+((n.position || {}).x) || ((i % 4) * 24 + 14), 0, 100) / 100) * 840,
    y: 110 + (clamp(+((n.position || {}).y) || (Math.floor(i / 4) * 22 + 10), 0, 100) / 100) * (H - 220)
  }));
  // Deterministic repulsion keeps approximate AI positions from placing cards on top of one another.
  for (let k = 0; k < 48; k++) {
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const a = P[i], b = P[j], dx = b.x - a.x, dy = b.y - a.y;
      const ox = 216 - Math.abs(dx), oy = 124 - Math.abs(dy);
      if (ox > 0 && oy > 0) {
        if (ox < oy) { const q = Math.max(1, ox * .12) * (dx < 0 ? -1 : 1); a.x -= q; b.x += q; }
        else { const q = Math.max(1, oy * .12) * (dy < 0 ? -1 : 1); a.y -= q; b.y += q; }
      }
    }
    P.forEach(p => { p.x = clamp(p.x, 120, W - 120); p.y = clamp(p.y, 84, H - 84); });
  }
  return { points: P, width: W, height: H };
}
function svgText(text, x, y, cls, max = 27) {
  const el0 = svgEl('text', { x, y, class: cls });
  const words = txt(text, 160).split(' '); let line = '', row = 0;
  for (const word of words) {
    const candidate = line ? line + ' ' + word : word;
    if (candidate.length > max && line) {
      const t = svgEl('tspan', { x, dy: row === 0 ? 0 : 18 }); t.textContent = line; el0.append(t);
      row++; line = word; if (row >= 2) break;
    } else line = candidate;
  }
  if (line && row < 2) { const t = svgEl('tspan', { x, dy: row === 0 ? 0 : 18 }); t.textContent = line; el0.append(t); }
  return el0;
}

export function renderAtlasView({ atlas, part, onOpenDiorama, onGenerate, onSave }) {
  atlas.attempts = atlas.attempts || {};
  const root = el('section', { class: 'atlas-view' });
  const header = el('div', { class: 'atlas-intro' }, [
    el('div', { class: 'atlas-overline', text: 'CHAPTER CONCEPT ATLAS' }),
    el('p', { class: 'atlas-central-q', html: mathHTML(atlas.question || part.title) }),
    el('div', { class: 'atlas-meta', text: (atlas.nodes || []).length + ' concepts · ' + (atlas.audit?.linkedDioramas ?? 0) + ' linked dioramas · ' + (atlas.audit?.certainty || 'AI-generated map') })
  ]);
  root.append(header);
  const graphData = coordinates(atlas.nodes || []), svg = svgEl('svg', { class: 'atlas-svg', viewBox: '0 0 ' + graphData.width + ' ' + graphData.height, role: 'group', 'aria-label': 'Interactive concept mind map' });
  const defs = svgEl('defs'), marker = svgEl('marker', { id: 'atlas-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto-start-reverse' });
  marker.append(svgEl('path', { d: 'M0 0 L10 5 L0 10 z', class: 'atlas-arrowhead' })); defs.append(marker); svg.append(defs);
  const byId = new Map(graphData.points.map(p => [p.id, p]));
  const edgeLayer = svgEl('g', { class: 'atlas-edges' });
  (atlas.edges || []).forEach(edge => {
    const a = byId.get(edge.from), b = byId.get(edge.to); if (!a || !b) return;
    const mid = (a.x + b.x) / 2 + (b.y - a.y) * .12;
    const d = 'M ' + a.x + ' ' + a.y + ' C ' + mid + ' ' + a.y + ', ' + mid + ' ' + b.y + ', ' + b.x + ' ' + b.y;
    const path = svgEl('path', { d, class: 'atlas-edge edge-' + String(edge.type || 'related').replace(/[^a-z-]/g, ''), 'marker-end': 'url(#atlas-arrow)' });
    path.append(svgEl('title')); path.firstChild.textContent = txt(edge.label || edge.type, 120); edgeLayer.append(path);
    const label = svgEl('text', { x: mid, y: (a.y + b.y) / 2 - 7, class: 'atlas-edge-label' }); label.textContent = txt(edge.label || edge.type, 22); edgeLayer.append(label);
  });
  svg.append(edgeLayer);
  const nodesLayer = svgEl('g', { class: 'atlas-nodes' });
  const nodeEls = new Map();
  let activeId = atlas.selectedNodeId && byId.has(atlas.selectedNodeId) ? atlas.selectedNodeId : (graphData.points[0] || {}).id;
  graphData.points.forEach(p => {
    const g = svgEl('g', { class: 'atlas-node', tabindex: 0, role: 'button', 'aria-label': p.node.title + ': ' + p.node.question, 'data-id': p.id });
    g.append(svgEl('rect', { x: p.x - 100, y: p.y - 45, width: 200, height: 90, rx: 18, class: 'atlas-node-card' }));
    g.append(svgText(p.node.title || 'Concept', p.x - 82, p.y - 12, 'atlas-node-title', 23));
    g.append(svgText(p.node.question || '', p.x - 82, p.y + 12, 'atlas-node-question', 25));
    const count = svgEl('text', { x: p.x + 78, y: p.y + 31, class: 'atlas-node-count' }); count.textContent = String((p.node.dioramaRefs || []).length) + ' ◇'; g.append(count);
    g.addEventListener('click', () => select(p.id));
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(p.id); } });
    nodesLayer.append(g); nodeEls.set(p.id, g);
  });
  svg.append(nodesLayer);
  const mapWrap = el('div', { class: 'atlas-map-wrap' }, [svg, el('div', { class: 'atlas-map-hint', text: 'Select a concept node to explore its dioramas, predictions and source trail.' })]);
  root.append(mapWrap);
  const detail = el('div', { class: 'atlas-detail' }); root.append(detail);

  function select(id) {
    if (!byId.has(id)) return;
    activeId = id; atlas.selectedNodeId = id;
    nodeEls.forEach((g, k) => { g.classList.toggle('selected', k === id); g.setAttribute('aria-pressed', String(k === id)); });
    renderDetail();
  }
  function renderDetail() {
    const node = (byId.get(activeId) || {}).node; detail.innerHTML = ''; if (!node) return;
    const top = el('div', { class: 'atlas-detail-head' }, [
      el('div', { class: 'atlas-overline', text: 'CONCEPT NODE' }),
      el('h3', { html: mathHTML(node.title) }),
      el('p', { class: 'atlas-node-lede', html: mathHTML(node.summary || node.question) }),
      el('div', { class: 'atlas-node-tags' }, (node.knowledgeKinds || []).slice(0, 5).map(k => el('span', { class: 'atlas-tag', text: titleCase(k) })))
    ]);
    detail.append(top);

    const set = el('div', { class: 'atlas-dioramas' }, [el('div', { class: 'atlas-section-label', text: 'DIORAMA SEQUENCE' })]);
    (node.dioramaSet || []).forEach((d, i) => set.append(el('div', { class: 'atlas-view-intent' }, [
      el('b', { text: (i + 1) + '. ' + txt(d.title, 90) }),
      el('span', { text: txt(d.purpose, 180) }),
      el('small', { text: (d.medium || '3d').toUpperCase() + ((d.manipulations || []).length ? ' · ' + d.manipulations.join(' · ') : '') })
    ])));
    const refs = node.dioramaRefs || [];
    if (refs.length) refs.forEach((ref, i) => {
      const b = el('button', { class: 'atlas-open-diorama', type: 'button', onclick: () => onOpenDiorama && onOpenDiorama(ref) }, [
        el('span', { class: 'atlas-dio-n', text: String(i + 1).padStart(2, '0') }),
        el('span', { class: 'atlas-dio-main' }, [el('b', { html: mathHTML(ref.title || 'Open diorama') }), el('small', { text: txt(ref.purpose || node.question, 150) })]),
        el('span', { class: 'atlas-dio-go', text: 'ENTER ↗' })
      ]);
      set.append(b);
    });
    else if (node.visualKind === 'diagram' || (node.dioramaSet || []).some(d => d.medium === '2d')) {
      set.append(el('div', { class: 'atlas-empty-visual', text: 'This concept is best represented through explanatory diagrams rather than an artificial 3D simulation. The related figures are shown below.' }));
    } else {
      set.append(el('div', { class: 'atlas-empty-visual', text: 'No authored 3D scene is linked to this node yet. Add a diorama request below.' }));
    }
    detail.append(set);

    // Carry source-linked explanatory visuals into the atlas. A node can have both 3D dioramas and 2D diagrams;
    // these are complementary views rather than mutually exclusive display modes.
    const figures = (node.explanatoryFigures && node.explanatoryFigures.length)
      ? node.explanatoryFigures
      : (node.generatedFigure ? [{ stepId: (node.stepIds || [])[0] || '', title: node.title, purpose: node.question, figure: node.generatedFigure }] : []);
    if (figures.length) {
      const figureSet = el('div', { class: 'atlas-explanatory-figures' }, [
        el('div', { class: 'atlas-section-label', text: 'RELATED EXPLANATORY FIGURES' })
      ]);
      figures.forEach((item, i) => {
        const host = el('div', { class: 'atlas-generated-figure' });
        renderFigure(item.figure, host);
        figureSet.append(el('div', { class: 'atlas-figure-entry' }, [
          el('b', { text: txt(item.title || 'Source explanation', 90) }),
          el('p', { text: txt(item.purpose || '', 240) }),
          host,
          el('small', { text: 'Linked to source step ' + String(item.stepId || '') })
        ]));
      });
      detail.append(figureSet);
    }

    const customTa = el('textarea', { class: 'field atlas-custom-input', rows: 2, placeholder: 'Describe a particular diorama to add to this concept: viewpoint, mechanisms, objects, variables, events or comparison…' });
    const status = el('div', { class: 'atlas-action-status', role: 'status' });
    const add = el('button', { class: 'btn primary small', type: 'button', text: 'Generate an additional diorama', onclick: async () => {
      const request = customTa.value.trim();
      if (!request) { status.textContent = 'Describe the particular diorama you want added.'; customTa.focus(); return; }
      add.disabled = true; status.textContent = 'Preparing the diorama…';
      try { await (onGenerate && onGenerate(request, node.id, t => { status.textContent = t; })); status.textContent = 'The new diorama is linked to this concept.'; }
      catch (e) { status.textContent = String(e && (e.message || e.code) || e); add.disabled = false; }
    } });
    detail.append(el('div', { class: 'atlas-custom' }, [
      el('div', { class: 'atlas-section-label', text: 'ADD A DIORAMA YOU DESCRIBE' }),
      customTa, el('div', { class: 'row wrap' }, [add, status])
    ]));

    // Controlled incompleteness: commit a prediction before showing the worked answer and feedback.
    const challenges = node.challenges || [];
    if (challenges.length) {
      const block = el('div', { class: 'atlas-challenge' }, [el('div', { class: 'atlas-section-label', text: 'PREDICT BEFORE REVEALING' })]);
      challenges.forEach(ch => {
        const saved = atlas.attempts[ch.id] || {};
        const body = el('div', { class: 'atlas-challenge-card' });
        body.append(
          el('div', { class: 'atlas-challenge-type', text: titleCase(ch.type) + ' incompleteness' }),
          el('h4', { html: mathHTML(ch.question) }),
          el('p', { class: 'atlas-challenge-stimulus', html: mathHTML(ch.stimulus || '') })
        );
        if (ch.hint) body.append(el('details', { class: 'atlas-hint' }, [el('summary', { text: 'A small hint' }), el('p', { html: mathHTML(ch.hint) })]));
        const response = el('textarea', { class: 'field atlas-prediction', rows: 3, placeholder: 'Generate your own answer before revealing the explanation…' });
        response.value = saved.response || '';
        const confidence = el('select', { class: 'field small atlas-confidence', 'aria-label': 'Confidence in prediction' }, [
          el('option', { value: '', text: 'Confidence?' }),
          ...['Low', 'Medium', 'High'].map(v => el('option', { value: v, text: v, selected: saved.confidence === v }))
        ]);
        const commit = el('button', { class: 'btn primary small', type: 'button', text: saved.committed ? 'Update prediction' : 'Commit prediction', disabled: !response.value.trim(), onclick: () => {
          atlas.attempts[ch.id] = { ...saved, response: response.value.trim(), confidence: confidence.value || '', committed: true, at: new Date().toISOString() };
          onSave && onSave(); toast('Prediction committed. Now compare it with the explanation.');
          renderDetail();
        } });
        response.addEventListener('input', () => { commit.disabled = !response.value.trim(); });
        body.append(response, el('div', { class: 'row wrap' }, [confidence, commit]));
        if (saved.committed) {
          if (saved.revealed) {
            body.append(el('div', { class: 'atlas-feedback' }, [
              el('b', { text: 'Expected reconstruction' }), el('p', { html: mathHTML(ch.answer) }),
              el('b', { text: 'Why this follows' }), el('p', { html: mathHTML(ch.why) }),
              el('b', { text: 'Feedback' }), el('p', { html: mathHTML(ch.feedback || 'Compare the causal and relational structure of your answer with the explanation.') })
            ]));
            const ref = (node.dioramaRefs || [])[0];
            if (ref) body.append(el('button', { class: 'btn small', type: 'button', text: ch.type === 'structural' ? 'Inspect the incomplete structure' : 'Inspect the related diorama', onclick: () => onOpenDiorama && onOpenDiorama(ref, { challenge: ch, incomplete: true }) }));
            if (ref) body.append(el('button', { class: 'btn small', type: 'button', text: 'Open the complete diorama', onclick: () => onOpenDiorama && onOpenDiorama(ref) }));
          } else {
            body.append(el('button', { class: 'btn small', type: 'button', text: 'Reveal answer and feedback', onclick: () => { atlas.attempts[ch.id] = { ...saved, revealed: true }; onSave && onSave(); renderDetail(); } }));
          }
        }
        block.append(body);
      });
      detail.append(block);
    }

    const trail = el('details', { class: 'atlas-source-trail' }, [
      el('summary', { text: 'Source trail and internal indexing' }),
      el('p', { class: 'atlas-audit-line', text: 'Indexing method: ' + (atlas.sourceIndex?.method || atlas.audit?.method || 'not recorded') }),
      el('p', { class: 'atlas-audit-line', text: 'Source steps: ' + ((node.sourceRefs?.stepIds || []).join(', ')) }),
      el('p', { class: 'atlas-audit-line', text: 'Subsections: ' + ((node.sourceRefs?.subsectionIds || []).join(', ')) }),
      el('p', { class: 'atlas-audit-line', text: 'Source spans: ' + ((node.sourceRefs?.pageSpans || []).map(x => x.startPage === x.endPage ? (x.subsectionId || '') + ' · ' + x.startPage : (x.subsectionId || '') + ' · ' + x.startPage + '–' + x.endPage).join('; ') || (node.sourceRefs?.pages || []).join(', ') || 'not recorded') }),
      el('p', { class: 'atlas-audit-line', text: 'Figures: ' + ((node.sourceRefs?.figureIds || []).join(', ') || 'none linked') }),
      atlas.audit?.fallbackReason ? el('p', { class: 'atlas-audit-warning', text: 'AI semantic mapping failed; this is a deterministic subsection grouping. Reason: ' + atlas.audit.fallbackReason }) : null
    ]);
    detail.append(trail);
    const research = atlas.sourceIndex && atlas.sourceIndex.webResearch;
    const citations = research && Array.isArray(research.citations) ? research.citations : [];
    const web = el('div', { class: 'atlas-web-sources' }, [
      el('div', { class: 'atlas-section-label', text: 'EXTERNAL RESEARCH' }),
      el('p', { class: 'atlas-audit-line', text: research ? (research.searched || 0) + ' live web-search tool calls recorded · ' + citations.length + ' unique source citations captured' : 'No web-search audit data was returned for this chapter.' }),
      ...(research && (research.tasks || []).length ? [el('p', { class: 'atlas-audit-line', text: 'Used during: ' + [...new Set(research.tasks)].join('; ') })] : []),
      el('p', { class: 'atlas-audit-line', text: 'These are chapter-level citations. They are not automatically assigned to individual concepts unless a chain step also names the source.' }),
      ...(citations.length ? citations.map(c => el('a', { class: 'atlas-web-link', href: c.url, target: '_blank', rel: 'noopener noreferrer', text: c.title || c.url })) : [el('span', { class: 'atlas-audit-line', text: 'No external URLs were captured in the structured response.' })])
    ]);
    detail.append(web);
  }

  if (activeId) select(activeId);
  return root;
}
