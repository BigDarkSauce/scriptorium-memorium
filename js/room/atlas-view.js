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

export function renderAtlasView({ atlas, part, onOpenDiorama, onGenerate, onAssignMemoryPlace, onRemoveMemoryPlace, onVisitMemoryRoute, onSave }) {
  atlas.attempts = atlas.attempts || {};
  const root = el('section', { class: 'atlas-view' });
  const header = el('div', { class: 'atlas-intro' }, [
    el('div', { class: 'atlas-overline', text: 'CHAPTER CONCEPT ATLAS' }),
    el('p', { class: 'atlas-central-q', html: mathHTML(atlas.question || part.title) }),
    el('div', { class: 'atlas-meta', text: (atlas.nodes || []).length + ' concepts · ' + (atlas.audit?.linkedDioramas ?? 0) + ' linked dioramas · ' + (atlas.audit?.certainty || 'AI-generated map') })
  ]);
  root.append(header);

  // A compact orientation scan exposes the real ingested structure and validated source steps.
  // It is an index for retrieval, not a generated chapter summary or a replacement for the source trail.
  const sourceSteps = part.analysis && Array.isArray(part.analysis.chain) ? part.analysis.chain : [];
  const sourceSections = atlas.sourceIndex && Array.isArray(atlas.sourceIndex.sourceSubsections) ? atlas.sourceIndex.sourceSubsections : [];
  const nodeForStep = stepId => (atlas.nodes || []).find(n => (n.stepIds || []).some(id => String(id) === String(stepId)));
  const tagsForStep = st => {
    const tags = [];
    if (/definition|term/.test(String(st.kind || '').toLowerCase())) tags.push('definition');
    if (st.math || (st.derivation || []).length) tags.push('equation / derivation');
    if (st.examples && st.examples.length || String(st.kind || '').toLowerCase() === 'example') tags.push('worked example');
    if (st.table) tags.push('table');
    if ((st.figures || []).length || (st.figureRefs || []).length) tags.push('figure');
    if (st.code) tags.push('code');
    if ((st.terms || []).length) tags.push('terms');
    return tags;
  };
  const scanEntries = sourceSteps.map(st => {
    const section = sourceSections.find(s => String(s.id) === String(st.section));
    const searchable = [
      st.id, st.kind, st.title, st.statement, st.math,
      (st.derivation || []).map(x => x.expr || '').join(' '),
      (st.terms || []).map(x => [x.term, x.meaning].join(' ')).join(' '),
      (st.examples || []).map(x => [x.title, x.problem, x.answer].join(' ')).join(' '),
      st.table && [st.table.caption, ...(st.table.columns || []), ...(st.table.rows || []).flat()].join(' '),
      (st.figures || []).join(' '), (st.figureRefs || []).map(x => x && x.id).join(' '),
      st.code && [st.code.lang, (st.code.lines || []).map(x => x.code).join(' ')].join(' '),
      section && section.title
    ].filter(Boolean).join(' ').toLowerCase();
    return {
      step: st,
      node: nodeForStep(st.id),
      section,
      tags: tagsForStep(st),
      pages: (st.pages || []).length ? st.pages : section ? [section.startPage, section.endPage].filter(Boolean) : [],
      searchable
    };
  });
  const scan = el('details', { class: 'atlas-source-scan' });
  const sectionItems = sourceSections.map(sec => {
    const entries = scanEntries.filter(x => String(x.step.section) === String(sec.id));
    const categories = [...new Set(entries.flatMap(x => x.tags))];
    return { sec, entries, categories };
  });
  const countTags = [...new Set(scanEntries.flatMap(x => x.tags))];
  const scanSummary = [
    sourceSections.length + ' subsections',
    sourceSteps.length + ' source steps',
    countTags.length ? countTags.join(' · ') : 'source index'
  ].join(' · ');
  const scanSummaryNode = el('summary', { class: 'atlas-scan-summary' }, [
    el('span', { class: 'atlas-section-label', text: 'QUICK SOURCE SCAN' }),
    el('span', { class: 'atlas-scan-count', text: scanSummary })
  ]);
  const scanInput = el('input', {
    class: 'atlas-scan-search',
    type: 'search',
    placeholder: 'Search concepts, terms, equations, examples, tables, figures or code…',
    'aria-label': 'Search source steps'
  });
  const scanResults = el('div', { class: 'atlas-scan-results', role: 'list', 'aria-label': 'Source scan results' });
  const openNode = node => { if (node) select(node.id); };
  const paintScan = query => {
    const q = String(query || '').trim().toLowerCase();
    scanResults.innerHTML = '';
    if (!q) {
      if (!sectionItems.length) {
        scanResults.append(el('p', { class: 'atlas-scan-empty', text: 'No subsection index is available for this saved atlas.' }));
        return;
      }
      sectionItems.forEach(({ sec, entries, categories }) => {
        const first = entries.find(x => x.node);
        const pages = sec.startPage
          ? (sec.startPage === sec.endPage ? 'p. ' + sec.startPage : 'pp. ' + sec.startPage + '–' + sec.endPage)
          : '';
        const item = el('button', {
          class: 'atlas-scan-row',
          type: 'button',
          role: 'listitem',
          disabled: !first,
          onclick: () => openNode(first && first.node)
        }, [
          el('span', { class: 'atlas-scan-main' }, [
            el('b', { text: sec.title || sec.id }),
            el('small', { text: entries.length + ' source steps' + (pages ? ' · ' + pages : '') })
          ]),
          el('span', { class: 'atlas-scan-tags' }, categories.slice(0, 4).map(tag => el('span', { class: 'atlas-scan-tag', text: tag }))),
          el('span', { class: 'atlas-scan-open', text: first ? 'OPEN CONCEPT ↗' : 'NO LINKED STEP' })
        ]);
        scanResults.append(item);
      });
      return;
    }
    const matches = scanEntries.filter(x => x.searchable.includes(q)).slice(0, 40);
    if (!matches.length) {
      scanResults.append(el('p', { class: 'atlas-scan-empty', text: 'No source step matched that search. Try a term, a symbol, a step title or a figure/table ID.' }));
      return;
    }
    matches.forEach(entry => {
      const st = entry.step, pageText = entry.pages.length ? 'p. ' + entry.pages.join(', ') : 'page not indexed';
      scanResults.append(el('button', {
        class: 'atlas-scan-row',
        type: 'button',
        role: 'listitem',
        disabled: !entry.node,
        onclick: () => openNode(entry.node)
      }, [
        el('span', { class: 'atlas-scan-main' }, [
          el('b', { text: st.title || st.id }),
          el('small', { text: st.id + ' · ' + (entry.section && entry.section.title || st.section || 'unsectioned') + ' · ' + pageText })
        ]),
        el('span', { class: 'atlas-scan-tags' }, entry.tags.slice(0, 4).map(tag => el('span', { class: 'atlas-scan-tag', text: tag }))),
        el('span', { class: 'atlas-scan-open', text: entry.node ? 'OPEN CONCEPT ↗' : 'NO LINKED CONCEPT' })
      ]));
    });
    if (matches.length === 40) scanResults.append(el('p', { class: 'atlas-scan-empty', text: 'Showing the first 40 matches. Refine your search to narrow the source inventory.' }));
  };
  scanInput.addEventListener('input', () => paintScan(scanInput.value));
  paintScan('');
  scan.append(scanSummaryNode, scanInput, scanResults);
  root.append(scan);

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

  // Keyboard control is scoped to an active challenge, never to the whole app or text-editing fields.
  root.addEventListener('keydown', e => {
    const tab = e.target && e.target.closest ? e.target.closest('.atlas-branch-tab') : null;
    if (tab && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
      const tabs = [...root.querySelectorAll('.atlas-branch-tab')];
      const index = tabs.indexOf(tab);
      const nextIndex = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1
        : (index + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      if (tabs[nextIndex]) {
        e.preventDefault();
        tabs[nextIndex].click();
        const freshTabs = root.querySelectorAll('.atlas-branch-tab');
        freshTabs[nextIndex] && freshTabs[nextIndex].focus();
      }
      return;
    }
    const card = e.target && e.target.closest ? e.target.closest('.atlas-challenge-card') : null;
    if (!card || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable) return;
    if (e.code === 'Space' && !e.repeat) {
      const next = card.querySelector('.atlas-unfold-next:not(:disabled)');
      if (next) { e.preventDefault(); next.click(); }
    } else if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'z') {
      const back = card.querySelector('.atlas-unfold-back');
      if (back) { e.preventDefault(); back.click(); }
    }
  });

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

    // Loci are optional spatial retrieval cues over stable library locations. They never replace the source trail or
    // the concept's explanation, and an association is authored by the learner rather than generated as a fact.
    const memoryPlaces = Array.isArray(atlas.memoryPlaces) ? atlas.memoryPlaces : [];
    const ownLocus = memoryPlaces.find(place => place && String(place.nodeId) === String(node.id));
    const memory = el('section', { class: 'atlas-memory-locus' }, [
      el('div', { class: 'atlas-section-label', text: 'OPTIONAL LOCI MEMORY PLACE' }),
      el('p', { class: 'atlas-memory-description', text: ownLocus
        ? 'This concept has a saved location in the walkable library. The place is a retrieval cue; the source-linked explanation stays in the atlas.'
        : 'Choose a distinctive place in the library for this concept. Later, visit it and reconstruct the idea before revealing the expected explanation.' }),
      ownLocus ? el('div', { class: 'atlas-memory-cue' }, [
        el('b', { text: 'Your association' }),
        el('p', { text: ownLocus.association || 'No cue text saved' }),
        el('small', { text: (ownLocus.shelfName || ownLocus.caseId) + ' · row ' + (ownLocus.rowLabel || Number(ownLocus.row) + 1) + ' · place ' + (Number(ownLocus.slot) + 1) })
      ]) : null,
      el('div', { class: 'row wrap' }, [
        el('button', {
          class: 'btn small',
          type: 'button',
          text: ownLocus ? 'Change this memory place' : 'Assign a memory place',
          onclick: () => onAssignMemoryPlace && onAssignMemoryPlace(node)
        }),
        ownLocus ? el('button', {
          class: 'btn small',
          type: 'button',
          text: 'Remove memory place',
          onclick: () => onRemoveMemoryPlace && onRemoveMemoryPlace(node)
        }) : null,
        memoryPlaces.length ? el('button', {
          class: 'btn primary small',
          type: 'button',
          text: 'Visit memory route · ' + memoryPlaces.length + ' place' + (memoryPlaces.length === 1 ? '' : 's'),
          onclick: () => onVisitMemoryRoute && onVisitMemoryRoute(node)
        }) : null
      ])
    ]);
    detail.append(memory);

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

    // Question branches are a horizontal selector, not a vertical stack. Each branch owns its prediction
    // and reveal cursor; switching branches never advances or resets another branch.
    const challenges = node.challenges || [];
    if (challenges.length) {
      const block = el('div', { class: 'atlas-challenge' }, [
        el('div', { class: 'atlas-section-label', text: 'QUESTION BRANCHES · CHOOSE A GAP TO INVESTIGATE' })
      ]);
      const validSelected = challenges.some(ch => ch.id === atlas.selectedChallengeId);
      if (!validSelected) atlas.selectedChallengeId = challenges[0].id;
      const rail = el('div', { class: 'atlas-branch-rail', role: 'tablist', 'aria-label': 'Question branches' });
      challenges.forEach((ch, i) => {
        const saved = atlas.attempts[ch.id] || {};
        const status = saved.revealed ? 'revealed' : saved.committed ? 'prediction saved' : saved.response ? 'draft saved' : 'unopened';
        const tab = el('button', {
          class: 'atlas-branch-tab' + (ch.id === atlas.selectedChallengeId ? ' active' : ''),
          type: 'button', role: 'tab', 'aria-selected': String(ch.id === atlas.selectedChallengeId),
          'aria-controls': 'atlas-challenge-active',
          onclick: () => {
            atlas.selectedChallengeId = ch.id;
            onSave && onSave();
            renderDetail();
            const tabs = root.querySelectorAll('.atlas-branch-tab');
            const activeTab = [...tabs].find(tab => tab.getAttribute('aria-selected') === 'true');
            activeTab && activeTab.focus();
          }
        }, [
          el('span', { class: 'atlas-branch-index', text: String(i + 1).padStart(2, '0') }),
          el('span', { class: 'atlas-branch-name' }, [
            el('b', { text: titleCase(ch.type) }),
            el('small', { text: status })
          ])
        ]);
        rail.append(tab);
      });
      block.append(rail);

      const ch = challenges.find(item => item.id === atlas.selectedChallengeId) || challenges[0];
      const saved = atlas.attempts[ch.id] || {};
      const reasoning = Array.isArray(ch.reasoning) && ch.reasoning.length
        ? ch.reasoning
        : [{ title: 'Why this follows', text: ch.why || ch.answer, sourceStepIds: (node.stepIds || []).slice(0, 1) }];
      const revealedCount = Math.max(0, Math.min(reasoning.length, Number(saved.unfoldedCount) || 0));
      const body = el('div', {
        class: 'atlas-challenge-card',
        id: 'atlas-challenge-active',
        role: 'tabpanel',
        'aria-label': titleCase(ch.type) + ' question branch'
      });
      body.append(
        el('div', { class: 'atlas-challenge-type', text: titleCase(ch.type) + ' · BRANCH ' + (challenges.indexOf(ch) + 1) + ' OF ' + challenges.length }),
        el('h4', { html: mathHTML(ch.question) }),
        el('p', { class: 'atlas-challenge-stimulus', html: mathHTML(ch.stimulus || '') })
      );
      if (ch.hint) body.append(el('details', { class: 'atlas-hint' }, [
        el('summary', { text: 'A small hint' }),
        el('p', { html: mathHTML(ch.hint) })
      ]));

      const response = el('textarea', {
        class: 'field atlas-prediction',
        rows: 3,
        placeholder: 'Commit to your own reconstruction before revealing the answer…',
        'aria-label': 'Your prediction'
      });
      response.value = saved.response || '';
      response.disabled = !!saved.revealed;
      const confidence = el('select', {
        class: 'field small atlas-confidence',
        'aria-label': 'Confidence in prediction'
      }, [
        el('option', { value: '', text: 'Confidence?' }),
        ...['Low', 'Medium', 'High'].map(v => el('option', { value: v, text: v, selected: saved.confidence === v }))
      ]);
      confidence.disabled = !!saved.revealed;
      const commit = el('button', {
        class: 'btn primary small',
        type: 'button',
        text: saved.revealed ? 'Prediction locked' : saved.committed ? 'Update prediction' : 'Commit prediction',
        disabled: !!saved.revealed || !response.value.trim(),
        onclick: () => {
          const current = atlas.attempts[ch.id] || {};
          atlas.attempts[ch.id] = {
            ...current,
            response: response.value.trim(),
            confidence: confidence.value || '',
            committed: true,
            at: new Date().toISOString()
          };
          onSave && onSave();
          toast('Prediction saved. Reveal the answer when you are ready.');
          renderDetail();
          const field = detail.querySelector('.atlas-prediction');
          if (field) field.focus();
        }
      });
      response.addEventListener('input', () => {
        commit.disabled = !response.value.trim();
        const current = atlas.attempts[ch.id] || {};
        atlas.attempts[ch.id] = { ...current, response: response.value.slice(0, 1200) };
        onSave && onSave();
      });
      confidence.addEventListener('change', () => {
        const current = atlas.attempts[ch.id] || {};
        atlas.attempts[ch.id] = { ...current, confidence: confidence.value || '' };
        onSave && onSave();
      });
      body.append(response, el('div', { class: 'row wrap' }, [confidence, commit]));

      if (saved.committed) {
        if (saved.revealed) {
          body.append(el('div', { class: 'atlas-feedback' }, [
            el('b', { text: 'Your committed prediction' }),
            el('p', { html: mathHTML(saved.response || 'No written prediction was recorded.') }),
            el('b', { text: 'Expected reconstruction' }),
            el('p', { html: mathHTML(ch.answer) }),
            el('b', { text: 'Feedback' }),
            el('p', { html: mathHTML(ch.feedback || 'Compare the causal and relational structure of your prediction with the expected reconstruction.') })
          ]));

          const path = el('div', { class: 'atlas-reasoning-path' }, [
            el('div', { class: 'atlas-reasoning-head' }, [
              el('span', { class: 'atlas-section-label', text: 'REASONING PATH' }),
              el('span', { class: 'atlas-reasoning-count', text: revealedCount + ' / ' + reasoning.length + ' revealed' })
            ])
          ]);
          reasoning.slice(0, revealedCount).forEach((unit, i) => {
            const sourceIds = Array.isArray(unit.sourceStepIds) ? unit.sourceStepIds : [];
            path.append(el('article', { class: 'atlas-reasoning-unit' }, [
              el('div', { class: 'atlas-reasoning-unit-head' }, [
                el('span', { class: 'atlas-reasoning-number', text: String(i + 1).padStart(2, '0') }),
                el('b', { text: txt(unit.title || 'Reasoning move', 100) })
              ]),
              el('p', { html: mathHTML(unit.text || '') }),
              sourceIds.length ? el('div', { class: 'atlas-reasoning-sources' }, [
                el('span', { text: 'GROUNDED IN' }),
                ...sourceIds.map(id => el('span', { class: 'atlas-source-chip', text: String(id) }))
              ]) : null
            ]));
          });
          if (revealedCount < reasoning.length) {
            const next = reasoning[revealedCount];
            path.append(el('div', { class: 'atlas-unfold-preview' }, [
              el('span', { class: 'atlas-reasoning-number', text: String(revealedCount + 1).padStart(2, '0') }),
              el('span', { text: 'Next: ' + txt(next.title || 'the next reasoning move', 100) })
            ]));
          } else {
            path.append(el('p', { class: 'atlas-reasoning-complete', text: 'All reasoning units in this branch are now visible.' }));
          }
          const controls = el('div', { class: 'atlas-unfold-controls' });
          if (revealedCount > 0) controls.append(el('button', {
            class: 'btn small atlas-unfold-back',
            type: 'button',
            text: '← Back one reveal',
            title: 'Ctrl+Z',
            onclick: () => {
              const current = atlas.attempts[ch.id] || {};
              atlas.attempts[ch.id] = { ...current, unfoldedCount: Math.max(0, (Number(current.unfoldedCount) || 0) - 1) };
              onSave && onSave();
              renderDetail();
              const focus = detail.querySelector('.atlas-unfold-next') || detail.querySelector('.atlas-unfold-back');
              focus && focus.focus();
            }
          }));
          controls.append(el('button', {
            class: 'btn primary small atlas-unfold-next',
            type: 'button',
            text: revealedCount < reasoning.length ? 'UNFOLD · ' + (revealedCount + 1) + ' / ' + reasoning.length : 'UNFOLD COMPLETE',
            disabled: revealedCount >= reasoning.length,
            onclick: () => {
              const current = atlas.attempts[ch.id] || {};
              atlas.attempts[ch.id] = { ...current, unfoldedCount: Math.min(reasoning.length, (Number(current.unfoldedCount) || 0) + 1) };
              onSave && onSave();
              renderDetail();
              const focus = detail.querySelector('.atlas-unfold-next') || detail.querySelector('.atlas-unfold-back');
              focus && focus.focus();
            }
          }));
          path.append(controls);
          path.append(el('p', { class: 'atlas-keyboard-hint', text: 'Space: unfold one unit · Ctrl+Z: step back · switching branches keeps each path where you left it' }));
          body.append(path);

          const ref = (node.dioramaRefs || [])[0];
          if (ref && ch.type === 'structural' && (ch.missingBodyIds || []).length) {
            body.append(el('button', { class: 'btn small', type: 'button', text: 'Inspect the incomplete structure', onclick: () => onOpenDiorama && onOpenDiorama(ref, { challenge: ch, incomplete: true }) }));
            body.append(el('button', { class: 'btn small', type: 'button', text: 'Open the complete diorama', onclick: () => onOpenDiorama && onOpenDiorama(ref) }));
          } else if (ref) {
            body.append(el('button', { class: 'btn small', type: 'button', text: 'Open the related diorama', onclick: () => onOpenDiorama && onOpenDiorama(ref) }));
          }
        } else {
          body.append(el('button', {
            class: 'btn small',
            type: 'button',
            text: 'Reveal answer and begin unfolding',
            onclick: () => {
              const current = atlas.attempts[ch.id] || {};
              atlas.attempts[ch.id] = { ...current, revealed: true, unfoldedCount: 0 };
              onSave && onSave();
              renderDetail();
              const next = detail.querySelector('.atlas-unfold-next');
              next && next.focus();
            }
          }));
        }
      }
      block.append(body);
      detail.append(block);
    }

    const trail = el('details', { class: 'atlas-source-trail' }, [
      el('summary', { text: 'Source trail and internal indexing' }),
      el('p', { class: 'atlas-audit-line', text: 'Indexing method: ' + (atlas.sourceIndex?.method || atlas.audit?.method || 'not recorded') }),
      el('p', { class: 'atlas-audit-line', text: 'Source steps: ' + ((node.sourceRefs?.stepIds || []).join(', ')) }),
      el('p', { class: 'atlas-audit-line', text: 'Subsections: ' + ((node.sourceRefs?.subsectionIds || []).join(', ')) }),
      el('p', { class: 'atlas-audit-line', text: 'Source spans (' + (atlas.sourceIndex?.sourceUnit === 'slide' ? 'slides' : 'pages') + '): ' + ((node.sourceRefs?.pageSpans || []).map(x => x.startPage === x.endPage ? (x.subsectionId || '') + ' · ' + x.startPage : (x.subsectionId || '') + ' · ' + x.startPage + '–' + x.endPage).join('; ') || (node.sourceRefs?.pages || []).join(', ') || 'not recorded') }),
      el('p', { class: 'atlas-audit-line', text: 'Figures: ' + ((node.sourceRefs?.figureIds || []).join(', ') || 'none linked') }),
      ...((node.sourceRefs?.stepSummaries || []).map(st => el('details', { class: 'atlas-source-step' }, [
        el('summary', { text: st.stepId + ' · ' + txt(st.title, 110) }),
        el('p', { class: 'atlas-audit-line', text: txt(st.statement, 900) || 'No short statement was recorded for this source step.' }),
        st.answers ? el('p', { class: 'atlas-audit-line', text: 'Answers: ' + txt(st.answers, 260) }) : null,
        st.opens ? el('p', { class: 'atlas-audit-line', text: 'Opens: ' + txt(st.opens, 260) }) : null,
        st.pages && st.pages.length ? el('small', { text: (atlas.sourceIndex?.sourceUnit === 'slide' ? 'Slides ' : 'Pages ') + st.pages.join(', ') }) : null
      ]))),
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
