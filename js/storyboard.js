import { splitBook, partSections, extractFigures, pageImages } from './ai/ingest.js';
import { parsePptx } from './storyboard/pptx.js';
import { fillImageFrame, renderDiagram, mountGeoGebra } from './storyboard/media.js';
import { initAI, askJSON } from './ai/claude.js';
import { restoreSettings, autoFreeLLMAPI, settings as aiSettings } from './ai/free.js';

const $ = id => document.getElementById(id);
const state = {
  file: null,
  source: null,
  parts: [],
  selected: new Set(),
  boards: [],
  cards: [],
  objectUrls: [],
  pageUrls: new Map(),
  busy: false,
  imageObserver: null,
  presentationIndex: 0,
  presentationCards: []
};
const engineReady = (async () => {
  const ready = initAI();
  try { await restoreSettings(); } catch (e) { /* saved settings may not be available in a private window */ }
  await ready;
  try { await autoFreeLLMAPI(); } catch (e) { /* a missing local bridge is not fatal */ }
})();
function toast(message) {
  const node = $('toast');
  node.textContent = String(message || '');
  node.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove('show'), 2600);
}
function setStatus(message) {
  $('parse-status').textContent = String(message || '');
  $('engine-status').textContent = String(message || 'Ready');
}
function safeName(value) {
  return String(value || 'storyboard').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'storyboard';
}
function downloadFile(filename, content, type) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: type || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
}
function revokeAssets() {
  state.objectUrls.forEach(url => { try { URL.revokeObjectURL(url); } catch (e) { } });
  state.objectUrls = [];
  state.pageUrls.clear();
}
function resetBoard() {
  state.boards = [];
  state.cards = [];
  $('storyboard').replaceChildren();
  $('board-viewport').hidden = true;
  $('workspace-footer').hidden = true;
  $('layout-tools').hidden = true;
  $('empty-state').hidden = false;
  $('export-board').disabled = true;
  $('present-board').disabled = true;
}
function engineLabel() {
  const s = aiSettings();
  const names = { claude: 'Claude', hybrid: 'Claude + free models', free: 'configured model providers' };
  return 'AI: ' + (names[s.mode] || 'configured Scriptorium engine') + ' · source-based generation';
}
function updateEngineLabel() {
  try { $('engine-status').textContent = engineLabel(); } catch (e) { $('engine-status').textContent = 'AI engine ready'; }
}
function normalisePartTitle(part) {
  return String(part.title || ('Pages ' + part.startPage + '–' + part.endPage)).replace(/\s+/g, ' ').trim();
}

async function loadSource(file) {
  if (!file) return;
  if (state.busy) return;
  const extension = file.name.split('.').pop().toLowerCase();
  if (!['pdf', 'pptx'].includes(extension)) {
    toast('Choose a PDF or PPTX file.');
    return;
  }
  if (file.size > 250 * 1024 * 1024) {
    toast('The selected file is over the 250 MB import limit.');
    return;
  }
  revokeAssets();
  resetBoard();
  state.file = file;
  state.source = null;
  state.parts = [];
  state.selected.clear();
  $('outline-panel').hidden = true;
  $('source-meta').hidden = false;
  $('source-meta').textContent = 'Reading ' + file.name + '…';
  $('parse-status').textContent = 'Opening the source document…';
  $('generate-board').disabled = true;
  try {
    let parsed;
    if (extension === 'pdf') {
      parsed = await splitBook(file, {
        onProgress: value => { $('parse-status').textContent = 'Reading PDF outline · ' + Math.round(value * 100) + '%'; }
      });
      state.source = { type: 'pdf', title: parsed.title || file.name, pages: parsed.pages, method: parsed.method };
    } else {
      parsed = await parsePptx(file, state);
      state.source = { type: 'pptx', title: parsed.title || file.name, pages: parsed.pages, method: parsed.method };
    }
    state.parts = (parsed.parts || []).filter(part => !part.front);
    if (!state.parts.length) throw new Error('No chapters or slides were found in this file.');
    state.parts.forEach(part => state.selected.add(part.id));
    $('source-meta').replaceChildren();
    const name = document.createElement('strong'); name.textContent = state.source.title;
    const desc = document.createElement('span');
    desc.textContent = file.name + ' · ' + (state.source.type === 'pdf' ? state.source.pages + ' PDF pages · ' + state.source.method + ' outline' : state.source.pages + ' PowerPoint slides');
    $('source-meta').append(name, desc);
    $('outline-panel').hidden = false;
    $('source-range').hidden = state.source.type !== 'pdf';
    if (state.source.type === 'pdf') {
      $('page-from').value = '1';
      $('page-to').value = String(state.source.pages);
      $('page-from').max = String(state.source.pages);
      $('page-to').max = String(state.source.pages);
    }
    renderOutline();
    $('generate-board').disabled = false;
    $('parse-status').textContent = state.parts.length + ' selectable ' + (state.source.type === 'pdf' ? 'chapter / section groups' : 'slides') + '. Review your selection, then generate.';
    updateEngineLabel();
  } catch (error) {
    $('source-meta').textContent = 'Could not open this source: ' + (error && error.message || error);
    $('parse-status').textContent = 'Import failed. Check that the file is a valid PDF or PPTX.';
    $('generate-board').disabled = true;
    toast('Could not read the file.');
  }
}
function renderOutline() {
  const list = $('outline-list');
  list.replaceChildren();
  state.parts.forEach((part, index) => {
    const label = document.createElement('label');
    label.className = 'outline-item';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox'; checkbox.checked = state.selected.has(part.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) state.selected.add(part.id); else state.selected.delete(part.id);
      updateSelection();
    });
    const copy = document.createElement('span'); copy.className = 'outline-copy';
    const title = document.createElement('b'); title.textContent = normalisePartTitle(part);
    const meta = document.createElement('small');
    meta.textContent = state.source.type === 'pdf'
      ? 'Pages ' + part.startPage + '–' + part.endPage + (part.lowConfidence ? ' · estimated range' : '') + (part.subsections ? ' · ' + part.subsections.length + ' subtopics' : '')
      : 'Slide ' + (index + 1) + (part.pictures && part.pictures.length ? ' · ' + part.pictures.length + ' embedded image(s)' : '');
    copy.append(title, meta);
    label.append(checkbox, copy);
    list.append(label);
  });
  updateSelection();
}
function updateSelection() {
  const selected = selectedParts();
  $('selected-count').textContent = selected.length + ' selected';
  $('generate-board').disabled = !state.file || !selected.length || state.busy;
}
function selectedParts() {
  let parts = state.parts.filter(part => state.selected.has(part.id));
  if (state.source && state.source.type === 'pdf') {
    const from = Math.max(1, Number($('page-from').value) || 1);
    const to = Math.max(from, Number($('page-to').value) || state.source.pages);
    parts = parts.filter(part => Number(part.endPage) >= from && Number(part.startPage) <= to);
  }
  return parts;
}
function selectAll(value) {
  state.selected.clear();
  if (value) state.parts.forEach(part => state.selected.add(part.id));
  renderOutline();
}
function safeList(value) {
  return Array.isArray(value) ? value : [];
}
function buildPrompt(part, sections, figures) {
  const detail = $('detail-level').value;
  const exact = Number($('exact-count').value) || 12;
  const sectionData = sections.map(section => ({
    id: section.id,
    title: section.title,
    level: section.level,
    startPage: section.startPage,
    endPage: section.endPage,
    text: String(section.text || '')
  }));
  const figureData = figures.map(figure => ({
    id: figure.id,
    label: figure.label || figure.kind || 'Figure',
    caption: figure.caption || '',
    page: figure.page,
    kind: figure.kind || 'figure'
  }));
  return [
    'ROLE: You are the explanatory director and storyboard architect for a rigorous university-level learning environment.',
    'TASK: Build a deep, source-faithful visual storyboard from this ONE selected chapter or slide. Explain the concepts in the source in detail, including their foundations, mechanisms, dependencies, equations, examples, evidence, assumptions, limitations and consequences where these occur in the supplied material.',
    'SOURCE TITLE: ' + state.source.title,
    'SELECTED PART: ' + normalisePartTitle(part),
    'SOURCE TYPE: ' + state.source.type + ' · pages/slides ' + part.startPage + '–' + part.endPage,
    'DETAIL LEVEL: ' + (detail === 'complete' ? 'COMPLETE. Resolve every distinct concept and each subsection; do not compress a chain of reasoning into a vague summary.' : detail === 'essential' ? 'ESSENTIAL. Keep the main explanatory chain and the most important supporting mechanisms.' : 'EXACT. Aim for ' + exact + ' cards, but do not erase important source concepts merely to hit the count.'),
    'SOURCE BOUNDARY: Treat the supplied material as canonical. Do not silently import outside claims or correct the source. When the source is ambiguous, incomplete or internally inconsistent, state that explicitly instead of guessing. Preserve its terminology, ordering, notation and numerical values. Cite the section id and page/slide for every card.',
    'CONCEPTUAL RESOLUTION: Make cards for distinct ideas, not arbitrary equal-sized chunks. Explain prerequisite ideas before dependent ones. Split mechanisms, derivations, equations, worked examples, comparisons, taxonomies, figures and tables when they need separate explanation. For equations show what each symbol means, the units and each logical step in a derivation. For a graph or table explain the axes/columns, actual values, pattern and inference. Identify what the source says versus a cautious inference.',
    'VISUAL BEATS: Every card must contain beats. Each beat MUST have exactly two substantive sentences in its sentences array. Those two sentences form one coherent explanatory unit and are followed by exactly one imageQuery for one real image from a free image source. Image queries must name concrete visual subjects that can be found as photographs or illustrations; avoid queries that ask for text in an image, diagrams with labels, watermarks or generated art. The application retrieves real files and displays the licence and attribution. Do not return image URLs.',
    'DEPTH LAYOUT: Give each card a depth of core, above, below, deep-above or deep-below. Use above/below for prerequisites, evidence, exceptions or explanatory side branches that deepen a main concept without breaking the core sequence. The user can later change how these lanes are placed.',
    'SOURCE FIGURES: Available source figures are listed below. When a figure or table in the source is especially useful, attach its exact id in sourceFigureIds and say what it explains in sourceFigureReason. Never invent ids. Use sourcePages for pages whose original page image is particularly important; do not request every page.',
    'CUSTOM VISUALS: Where relationships, data, processes or structure are clearer as a bespoke illustration, return diagram with type, title, nodes and edges, or points for a chart. Use a diagram only when it adds explanatory value; avoid decorative visuals. Labels must be short and accurate to the source.',
    'GEOGEBRA: If a mathematically interactive construction would genuinely improve understanding, return geogebra with appName (graphing, geometry or 3d), commands (valid GeoGebra command strings) and purpose. Otherwise omit it.',
    'MANIM: If a mathematical derivation, causal sequence, spatial structure or transformation benefits from professional animation, return manim with className, dimension (2D or 3D), and complete runnable Python code for Manim Community. The code must define a single Scene or ThreeDScene with construct(), use only Manim Community primitives, avoid network/file access, and be self-contained. Do not produce code just for decoration. Otherwise omit it.',
    'OUTPUT JSON SHAPE: {"title":"...","question":"the central question this part answers","summary":"...","cards":[{"id":"C1","title":"...","subtitle":"...","sectionId":"exact section id","sourcePages":[1],"depth":"core","kind":"concept|mechanism|derivation|example|evidence|comparison|limitation","answers":"...","opens":"...","beats":[{"sentences":["Sentence one.","Sentence two."],"imageQuery":"...","imageAlt":"..."}],"sourceFigureIds":["exact-id"],"sourceFigureReason":"...","diagram":{"type":"flow|causal|network|chart|timeline|comparison","title":"...","nodes":[{"id":"a","label":"..."},{"id":"b","label":"..."}],"edges":[{"from":"a","to":"b","label":"..."}],"points":[[0,0,"optional label"],[1,2,"optional label"]],"xLabel":"...","yLabel":"...","caption":"..."},"geogebra":{"appName":"graphing","commands":["f(x)=x^2"],"purpose":"..."},"manim":{"className":"ExplainConcept","dimension":"2D","code":"from manim import ..."} }]}',
    'Only include optional objects when relevant. Every card must have one or more two-sentence beats. Cards must follow the source order and form a question thread: each card answers the question opened by the preceding card, and its opens field sets up the next card. If the selected part contains multiple subsections, cover all of them at the resolution requested.',
    'SECTION TEXT (use only as source evidence):',
    JSON.stringify(sectionData),
    'SOURCE FIGURE INDEX:',
    JSON.stringify(figureData),
    'Return only valid JSON with no markdown fence and no explanatory preamble.'
  ].join('\n\n');
}
function splitSentences(text) {
  return String(text || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+(?=[A-Z0-9“"'(])/).filter(Boolean);
}
function normaliseBeats(card) {
  const raw = Array.isArray(card.beats) ? card.beats : Array.isArray(card.explain) ? card.explain : [];
  const out = [];
  let pending = [], query = '', alt = '';
  for (const beat of raw) {
    let sentences = Array.isArray(beat.sentences) ? beat.sentences.map(x => String(x).trim()).filter(Boolean) : splitSentences(beat.text || beat.explanation || '');
    if (!sentences.length && beat.sentence) sentences = [String(beat.sentence)];
    for (const sentence of sentences) {
      if (!pending.length) { query = String(beat.imageQuery || beat.image || card.title || ''); alt = String(beat.imageAlt || beat.alt || card.title || ''); }
      pending.push(sentence);
      if (pending.length === 2) {
        out.push({ sentences: pending, imageQuery: query, imageAlt: alt });
        pending = []; query = ''; alt = '';
      }
    }
  }
  if (pending.length) out.push({ sentences: pending, imageQuery: query || String(card.title || ''), imageAlt: alt || String(card.title || '') });
  if (!out.length && card.statement) {
    const s = splitSentences(card.statement);
    if (s.length) out.push({ sentences: s.slice(0, 2), imageQuery: String(card.title || ''), imageAlt: String(card.title || '') });
  }
  return out;
}
function normaliseBoard(result, part, figures, boardIndex) {
  const board = result.storyboard || result.board || result;
  if (!board || !Array.isArray(board.cards) || !board.cards.length) throw new Error('The AI answer did not contain a storyboard cards array.');
  const figureMap = new Map(figures.map(figure => [String(figure.id), figure]));
  const cards = board.cards.map((raw, index) => {
    const ids = safeList(raw.sourceFigureIds || raw.figureIds).map(String);
    let linkedFigures = ids.map(id => figureMap.get(id)).filter(Boolean);
    if (!linkedFigures.length && part.slide && board.cards.length === 1) linkedFigures = figures.slice(0, 6);
    const pageList = safeList(raw.sourcePages).map(Number).filter(n => Number.isFinite(n) && n >= part.startPage && n <= part.endPage);
    if (raw.sourcePage && Number.isFinite(Number(raw.sourcePage))) pageList.push(Number(raw.sourcePage));
    return {
      ...raw,
      key: 'b' + boardIndex + '-c' + index,
      id: String(raw.id || ('C' + (index + 1))),
      title: String(raw.title || ('Concept ' + (index + 1))),
      subtitle: String(raw.subtitle || ''),
      sectionId: String(raw.sectionId || raw.section || ''),
      depth: String(raw.depth || 'core').toLowerCase(),
      beats: normaliseBeats(raw),
      sourceFigureIds: ids,
      sourceFigures: linkedFigures,
      sourcePages: Array.from(new Set(pageList)),
      diagram: raw.diagram && typeof raw.diagram === 'object' ? raw.diagram : null,
      geogebra: raw.geogebra && typeof raw.geogebra === 'object' ? raw.geogebra : null,
      manim: raw.manim && typeof raw.manim === 'object' ? raw.manim : null,
      sourceTitle: normalisePartTitle(part),
      sourceRange: state.source.type === 'pdf' ? 'pp. ' + part.startPage + '–' + part.endPage : 'slide ' + part.startPage
    };
  });
  return { title: String(board.title || normalisePartTitle(part)), question: String(board.question || ''), summary: String(board.summary || ''), cards };
}
async function prepareSourcePages(file, cards, part) {
  if (!$('include-source-pages').checked || state.source.type !== 'pdf') return;
  const pages = Array.from(new Set(cards.flatMap(card => card.sourcePages))).filter(page => page >= part.startPage && page <= part.endPage).slice(0, 5);
  for (const page of pages) {
    try {
      const blobs = await pageImages(file, page, page, 1);
      if (blobs && blobs[0]) {
        const url = URL.createObjectURL(blobs[0]);
        state.objectUrls.push(url);
        state.pageUrls.set(page, url);
      }
    } catch (e) { /* source text and figures remain usable if page rendering fails */ }
  }
}
function figureCaption(figure) {
  return String(figure.caption || figure.label || figure.kind || 'Source figure') + (figure.page ? ' · p. ' + figure.page : '');
}
function addText(parent, tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.textContent = String(value || '');
  parent.append(node);
  return node;
}
function renderCard(card, index) {
  const article = document.createElement('article');
  article.className = 'story-card';
  article.dataset.cardId = card.key;
  const head = document.createElement('div'); head.className = 'card-head';
  addText(head, 'span', 'card-index', String(index + 1).padStart(2, '0'));
  const copy = document.createElement('div'); copy.className = 'card-head-copy';
  addText(copy, 'div', 'card-kicker', card.kind || card.sectionId || 'EXPLANATION');
  addText(copy, 'h3', '', card.title);
  if (card.subtitle) addText(copy, 'p', '', card.subtitle);
  if (card.answers) addText(copy, 'p', 'card-question', 'SETTLES · ' + card.answers);
  head.append(copy);
  addText(head, 'span', 'depth-chip', card.depth.replace('-', ' '));
  article.append(head);
  const body = document.createElement('div'); body.className = 'card-body';
  card.beats.forEach((beat, beatIndex) => {
    const beatNode = document.createElement('section'); beatNode.className = 'beat';
    const text = document.createElement('div'); text.className = 'beat-copy';
    addText(text, 'span', 'beat-number', 'BEAT ' + String(beatIndex + 1).padStart(2, '0'));
    beat.sentences.forEach(sentence => addText(text, 'p', '', sentence));
    const visual = document.createElement('div'); visual.className = 'beat-visual';
    const frame = document.createElement('div'); frame.className = 'image-frame';
    frame.dataset.query = beat.imageQuery || card.title;
    frame.dataset.alt = beat.imageAlt || card.title;
    addText(frame, 'span', 'image-loading', 'Finding a real image…');
    const caption = document.createElement('div'); caption.className = 'image-caption'; caption.textContent = 'Wikimedia Commons · licence checked';
    visual.append(frame, caption);
    beatNode.append(text, visual);
    body.append(beatNode);
    if (state.imageObserver) state.imageObserver.observe(frame);
    else fillImageFrame(frame);
  });
  const usefulFigures = card.sourceFigures.filter(figure => figure.dataUrl || figure.src);
  if (usefulFigures.length) {
    const source = document.createElement('div'); source.className = 'card-sources';
    addText(source, 'div', 'source-label', state.source.type === 'pdf' ? 'Original figure / table from PDF' : 'Original embedded image from slide');
    const gallery = document.createElement('div'); gallery.className = 'source-figures';
    usefulFigures.forEach(figure => {
      const tile = document.createElement('div'); tile.className = 'source-figure';
      const img = document.createElement('img'); img.src = figure.dataUrl || figure.src; img.alt = figure.caption || figure.label || 'Source figure'; img.loading = 'lazy'; img.decoding = 'async';
      addText(tile, 'small', '', figureCaption(figure));
      tile.prepend(img); gallery.append(tile);
    });
    source.append(gallery); body.append(source);
  }
  const pages = card.sourcePages.filter(page => state.pageUrls.has(page));
  if (pages.length) {
    pages.forEach(page => {
      const row = document.createElement('div'); row.className = 'source-page';
      const img = document.createElement('img'); img.src = state.pageUrls.get(page); img.alt = 'Original PDF page ' + page; img.loading = 'lazy';
      row.append(img, addText(document.createElement('span'), 'span', '', 'Original source page ' + page));
      body.append(row);
    });
  }
  if (card.diagram) {
    const wrap = document.createElement('section'); wrap.className = 'diagram-wrap';
    addText(wrap, 'h4', '', card.diagram.title || 'Custom explanatory diagram');
    const svg = renderDiagram(card.diagram);
    if (svg) wrap.append(svg);
    if (card.diagram.caption) addText(wrap, 'div', 'diagram-note', card.diagram.caption);
    body.append(wrap);
  }
  if (card.geogebra) {
    const wrap = document.createElement('section'); wrap.className = 'embed-wrap';
    addText(wrap, 'h4', 'embed-title', 'INTERACTIVE GEOGEBRA · ' + (card.geogebra.purpose || 'Explore the construction'));
    const button = document.createElement('button'); button.className = 'tiny-btn load-geogebra'; button.dataset.cardId = card.key; button.textContent = 'Load interactive model';
    const target = document.createElement('div'); target.className = 'geogebra-target'; target.hidden = true;
    wrap.append(button, target); body.append(wrap);
  }
  if (card.manim && card.manim.code) {
    const wrap = document.createElement('section'); wrap.className = 'embed-wrap';
    addText(wrap, 'h4', 'embed-title', 'MANIM COMMUNITY · ' + (card.manim.dimension || '2D') + ' animation scene');
    const pre = document.createElement('pre'); pre.className = 'manim-code'; pre.textContent = String(card.manim.code).slice(0, 26000);
    const actions = document.createElement('div'); actions.className = 'manim-actions';
    const className = String(card.manim.className || 'ExplainConcept');
    addText(actions, 'small', '', 'Render locally: manim -pql scene.py ' + className);
    const download = document.createElement('button'); download.className = 'tiny-btn'; download.dataset.manimId = card.key; download.textContent = 'Download .py';
    actions.append(download); wrap.append(pre, actions); body.append(wrap);
  }
  article.append(body);
  const footer = document.createElement('footer'); footer.className = 'card-footer';
  addText(footer, 'span', '', card.sourceTitle);
  addText(footer, 'b', '', card.sectionId + (card.sourceRange ? ' · ' + card.sourceRange : ''));
  article.append(footer);
  return article;
}
function applyLayout() {
  const rows = Math.max(1, Math.min(5, Number($('row-count').value) || 3));
  const mode = $('depth-mode').value;
  const size = $('card-size').value;
  $('storyboard').style.setProperty('--lanes', String(rows));
  $('storyboard').style.setProperty('--card-width', size === 'compact' ? '300px' : size === 'wide' ? '430px' : '360px');
  const centre = Math.ceil(rows / 2);
  Array.from($('storyboard').children).forEach((element, index) => {
    const card = state.cards[index];
    let lane = centre;
    const depth = String(card && card.depth || 'core').toLowerCase();
    if (mode === 'above') lane = 1;
    else if (mode === 'below') lane = rows;
    else if (mode === 'alternate') lane = index % 2 ? rows : 1;
    else if (mode === 'centre') lane = centre;
    else if (depth.includes('above')) lane = depth.includes('deep') ? Math.max(1, centre - 1) : Math.max(1, centre - 1);
    else if (depth.includes('below')) lane = depth.includes('deep') ? rows : Math.min(rows, centre + 1);
    element.style.gridColumn = String(index + 1);
    element.style.gridRow = String(lane);
  });
}
function renderStoryboard() {
  const board = $('storyboard');
  board.replaceChildren();
  state.cards.forEach((card, index) => board.append(renderCard(card, index)));
  $('empty-state').hidden = state.cards.length > 0;
  $('board-viewport').hidden = state.cards.length === 0;
  $('workspace-footer').hidden = state.cards.length === 0;
  $('layout-tools').hidden = state.cards.length === 0;
  $('export-board').disabled = state.cards.length === 0;
  $('present-board').disabled = state.cards.length === 0;
  $('board-title').textContent = state.boards.length ? state.source.title + ' · visual storyboard' : 'Your storyboard';
  $('board-subtitle').textContent = state.boards.map(board => board.question || board.summary || board.title).join('  ·  ');
  $('board-stats').textContent = state.cards.length + ' concept cards · ' + state.boards.length + ' selected source part(s)';
  applyLayout();
}
async function generateBoard() {
  if (state.busy) return;
  const parts = selectedParts();
  if (!parts.length) { toast('Select at least one chapter or slide.'); return; }
  state.busy = true;
  $('generate-board').disabled = true;
  $('progress-wrap').hidden = false;
  $('progress-bar').style.width = '0%';
  $('progress-label').textContent = 'Preparing source material';
  $('progress-step').textContent = '0 / ' + parts.length;
  state.boards = []; state.cards = [];
  $('storyboard').replaceChildren();
  $('board-viewport').hidden = true; $('workspace-footer').hidden = true; $('layout-tools').hidden = true;
  $('empty-state').hidden = true;
  let failures = 0;
  try {
    await engineReady;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      $('progress-label').textContent = 'Explaining ' + normalisePartTitle(part);
      $('progress-step').textContent = (i + 1) + ' / ' + parts.length;
      $('progress-bar').style.width = Math.round(i / parts.length * 100) + '%';
      setStatus('Analysing ' + normalisePartTitle(part) + '…');
      let sectionData, figures = [];
      if (state.source.type === 'pdf') {
        sectionData = await partSections(state.file, part, { maxChars: 110000 });
        if ($('include-figures').checked) {
          try {
            figures = await extractFigures(state.file, part.startPage, part.endPage, { maxPerPart: 22, maxW: 1200 });
          } catch (e) { console.warn('PDF figure extraction', e); }
        }
      } else {
        sectionData = { sections: part.sections || part.subsections || [], text: part.text || '' };
        figures = part.pictures || [];
      }
      if (!sectionData.sections || !sectionData.sections.length) {
        sectionData.sections = [{ id: part.id, title: part.title, level: 1, startPage: part.startPage, endPage: part.endPage, text: sectionData.text || part.text || '' }];
      }
      const prompt = buildPrompt(part, sectionData.sections, figures);
      let result;
      try {
        result = await askJSON(prompt, {
          label: 'Storyboard · ' + normalisePartTitle(part),
          role: 'director',
          tier: 'complex',
          minRank: 76,
          acceptTruncated: true,
          manualTitle: 'Create a storyboard for ' + normalisePartTitle(part),
          validate: value => {
            const v = value && (value.storyboard || value.board || value);
            return v && Array.isArray(v.cards) && v.cards.length ? null : 'The answer must contain a non-empty cards array.';
          }
        });
      } catch (error) {
        failures++;
        console.warn('Storyboard part failed', part.title, error);
        toast('Could not generate ' + normalisePartTitle(part) + ': ' + (error && error.message || error.code || 'request failed'));
        continue;
      }
      let parsed;
      try { parsed = normaliseBoard(result, part, figures, i); }
      catch (error) { failures++; toast('The returned storyboard for ' + normalisePartTitle(part) + ' was incomplete.'); continue; }
      await prepareSourcePages(state.file, parsed.cards, part);
      state.boards.push(parsed);
      state.cards.push(...parsed.cards);
      renderStoryboard();
    }
    $('progress-bar').style.width = '100%';
    $('progress-label').textContent = failures ? 'Completed with ' + failures + ' issue(s)' : 'Storyboard complete';
    $('progress-step').textContent = state.cards.length + ' cards';
    if (state.cards.length) {
      $('board-viewport').hidden = false;
      $('workspace-footer').hidden = false;
      $('layout-tools').hidden = false;
      $('empty-state').hidden = true;
      toast('Storyboard ready · ' + state.cards.length + ' concept cards');
      $('board-viewport').scrollLeft = 0;
      updateEngineLabel();
    } else {
      $('empty-state').hidden = false;
      $('board-title').textContent = 'No storyboard was produced';
    }
    setTimeout(() => { $('progress-wrap').hidden = true; }, 2500);
  } catch (error) {
    console.error(error);
    $('progress-label').textContent = 'Generation stopped';
    toast('Generation stopped: ' + (error && error.message || error));
  } finally {
    state.busy = false;
    updateSelection();
    $('generate-board').disabled = !state.file || !selectedParts().length;
  }
}
function exportBoard() {
  if (!state.cards.length) return;
  const payload = {
    format: 'scriptorium-storyboard/1',
    created: new Date().toISOString(),
    source: { name: state.file && state.file.name, title: state.source && state.source.title, type: state.source && state.source.type },
    boards: state.boards.map(board => ({
      title: board.title,
      question: board.question,
      summary: board.summary,
      cards: board.cards.map(card => ({
        id: card.id, title: card.title, subtitle: card.subtitle, sectionId: card.sectionId,
        depth: card.depth, kind: card.kind, answers: card.answers, opens: card.opens,
        beats: card.beats, sourceFigureIds: card.sourceFigureIds, sourcePages: card.sourcePages,
        diagram: card.diagram, geogebra: card.geogebra, manim: card.manim
      }))
    }))
  };
  downloadFile(safeName(state.source.title) + '-storyboard.json', JSON.stringify(payload, null, 2), 'application/json');
  toast('Storyboard JSON exported.');
}
function downloadManim(key) {
  const card = state.cards.find(item => item.key === key);
  if (!card || !card.manim || !card.manim.code) return;
  const className = String(card.manim.className || 'ExplainConcept').replace(/[^\w]/g, '') || 'ExplainConcept';
  downloadFile(safeName(card.title) + '.py', String(card.manim.code), 'text/x-python');
  toast('Manim scene downloaded. Inspect it before running.');
}
async function loadGeogebraFor(button) {
  const card = state.cards.find(item => item.key === button.dataset.cardId);
  const target = button.parentElement.querySelector('.geogebra-target');
  if (!card || !target || !card.geogebra) return;
  target.hidden = false;
  button.disabled = true;
  button.textContent = 'Loading GeoGebra…';
  const ok = await mountGeoGebra(target, card.geogebra);
  button.hidden = ok;
  button.disabled = false;
  if (!ok) button.textContent = 'Try GeoGebra again';
}
function openPresentation() {
  if (!state.cards.length) return;
  state.presentationCards = Array.from($('storyboard').querySelectorAll('.story-card'));
  state.presentationIndex = 0;
  $('presentation').hidden = false;
  document.body.classList.add('presenting');
  renderPresentationCard();
}
function renderPresentationCard() {
  const cards = state.presentationCards;
  if (!cards.length) return;
  const index = state.presentationIndex;
  $('presentation-content').replaceChildren(cards[index].cloneNode(true));
  $('presentation-progress').textContent = String(index + 1).padStart(2, '0') + ' / ' + String(cards.length).padStart(2, '0');
  $('presentation-prev').disabled = index === 0;
  $('presentation-next').textContent = index === cards.length - 1 ? 'Finish story ✓' : 'Next concept →';
  const dots = $('presentation-dots'); dots.replaceChildren();
  cards.forEach((card, i) => {
    const dot = document.createElement('button'); dot.type = 'button'; dot.className = i === index ? 'on' : '';
    dot.setAttribute('aria-label', 'Go to concept ' + (i + 1));
    dot.addEventListener('click', () => { state.presentationIndex = i; renderPresentationCard(); });
    dots.append(dot);
  });
  $('presentation-content').querySelectorAll('.image-frame[data-query]').forEach(frame => fillImageFrame(frame));
  $('presentation-content').querySelector('.story-card')?.scrollTo(0, 0);
}
function stepPresentation(delta) {
  if ($('presentation').hidden) return;
  const next = state.presentationIndex + delta;
  if (next < 0) return;
  if (next >= state.presentationCards.length) { closePresentation(); return; }
  state.presentationIndex = next;
  renderPresentationCard();
}
function closePresentation() {
  $('presentation').hidden = true;
  document.body.classList.remove('presenting');
  state.presentationCards = [];
}
function initObservers() {
  if ('IntersectionObserver' in window) {
    state.imageObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          state.imageObserver.unobserve(entry.target);
          fillImageFrame(entry.target);
        }
      });
    }, { root: $('board-viewport'), rootMargin: '420px 500px', threshold: .01 });
  }
}
function bindUI() {
  $('source-file').addEventListener('change', event => loadSource(event.target.files && event.target.files[0]));
  $('select-all').addEventListener('click', () => selectAll(true));
  $('select-none').addEventListener('click', () => selectAll(false));
  $('generate-board').addEventListener('click', generateBoard);
  $('page-from').addEventListener('change', updateSelection);
  $('page-to').addEventListener('change', updateSelection);
  $('detail-level').addEventListener('change', () => { $('exact-count-wrap').hidden = $('detail-level').value !== 'exact'; });
  ['row-count', 'depth-mode', 'card-size'].forEach(id => $(id).addEventListener('change', applyLayout));
  $('export-board').addEventListener('click', exportBoard);
  $('present-board').addEventListener('click', openPresentation);
  $('close-presentation').addEventListener('click', closePresentation);
  $('presentation-prev').addEventListener('click', () => stepPresentation(-1));
  $('presentation-next').addEventListener('click', () => stepPresentation(1));
  document.addEventListener('click', event => {
    const geo = event.target.closest('.load-geogebra');
    if (geo) loadGeogebraFor(geo);
    const manim = event.target.closest('[data-manim-id]');
    if (manim) downloadManim(manim.dataset.manimId);
  });
  document.addEventListener('keydown', event => {
    if ($('presentation').hidden) return;
    if (event.key === 'Escape') { closePresentation(); return; }
    if (event.key === 'ArrowRight' || event.code === 'Space') { event.preventDefault(); stepPresentation(1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); stepPresentation(-1); }
  });
  window.addEventListener('beforeunload', revokeAssets);
}
bindUI();
initObservers();
engineReady.then(updateEngineLabel).catch(() => { $('engine-status').textContent = 'AI can still run through the copy-prompt fallback'; });
