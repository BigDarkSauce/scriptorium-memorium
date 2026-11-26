// Storyboard media: one externally sourced image per pair of sentences, SVG diagrams,
// and optional GeoGebra applets. No image-generation service is called here.
const commonsCache = new Map();
const cleanText = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const licenseAllowed = name => {
  const s = String(name || '').toLowerCase();
  if (/non.?commercial|no.?derivatives|nc\b|nd\b/.test(s)) return false;
  return /public domain|cc0|creative commons zero|cc by(?:-sa)?(?:\s|$|-)/i.test(s);
};
function commonsSearchUrl(query) {
  return 'https://commons.wikimedia.org/w/index.php?search=' + encodeURIComponent(query);
}
async function findCommonsImage(query) {
  const key = String(query || '').trim().toLowerCase();
  if (!key) return null;
  if (commonsCache.has(key)) return commonsCache.get(key);
  const task = (async () => {
    const params = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: 'filetype:bitmap ' + key,
      gsrnamespace: '6',
      gsrlimit: '10',
      prop: 'imageinfo',
      iiprop: 'url|extmetadata',
      iiurlwidth: '1000',
      format: 'json',
      origin: '*'
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    try {
      const response = await fetch('https://commons.wikimedia.org/w/api.php?' + params.toString(), { signal: controller.signal, mode: 'cors', cache: 'force-cache' });
      if (!response.ok) throw new Error('Image search returned ' + response.status);
      const data = await response.json();
      const pages = Object.values((data.query && data.query.pages) || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
      for (const page of pages) {
        const info = page.imageinfo && page.imageinfo[0];
        if (!info || !info.thumburl || !info.extmetadata) continue;
        let parsed;
        try { parsed = new URL(info.thumburl); } catch (e) { continue; }
        if (parsed.protocol !== 'https:' || parsed.hostname !== 'upload.wikimedia.org') continue;
        const meta = info.extmetadata;
        const license = cleanText(meta.LicenseShortName && meta.LicenseShortName.value);
        if (!licenseAllowed(license)) continue;
        const licenseUrl = cleanText(meta.LicenseUrl && meta.LicenseUrl.value);
        const artist = cleanText(meta.Artist && meta.Artist.value).slice(0, 170);
        const fileTitle = String(page.title || '').replace(/^File:/, '');
        return {
          url: info.thumburl,
          title: fileTitle,
          license,
          licenseUrl: /^https?:\/\//i.test(licenseUrl) ? licenseUrl : '',
          artist,
          pageUrl: 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(String(page.title || '').replace(/ /g, '_'))
        };
      }
      return null;
    } finally { clearTimeout(timer); }
  })();
  commonsCache.set(key, task);
  try { return await task; } catch (e) { commonsCache.delete(key); return null; }
}
export async function fillImageFrame(frame) {
  if (!frame || frame.dataset.imageState === 'done' || frame.dataset.imageState === 'loading') return;
  const query = frame.dataset.query || '';
  const alt = frame.dataset.alt || query || 'Illustrative image';
  frame.dataset.imageState = 'loading';
  const fallback = () => {
    frame.dataset.imageState = 'done';
    const box = document.createElement('div');
    box.className = 'image-fallback';
    const note = document.createElement('span');
    note.textContent = 'No fast, suitably licensed image found';
    const link = document.createElement('a');
    link.href = commonsSearchUrl(query); link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Search Commons ↗';
    box.append(note, link); frame.replaceChildren(box);
  };
  const meta = frame.parentElement && frame.parentElement.querySelector('.image-caption');
  try {
    const result = await findCommonsImage(query);
    if (!result) { fallback(); return; }
    const probe = new Image();
    const loaded = await new Promise(resolve => {
      let settled = false;
      const done = value => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
      const timer = setTimeout(() => { probe.src = ''; done(false); }, 2500);
      probe.onload = () => done(true);
      probe.onerror = () => done(false);
      probe.decoding = 'async';
      probe.src = result.url;
    });
    if (!loaded) { fallback(); return; }
    const img = probe;
    img.alt = alt; img.loading = 'lazy'; img.decoding = 'async'; img.className = 'loaded';
    frame.replaceChildren(img);
    if (meta) {
      meta.replaceChildren();
      const name = document.createElement('span');
      name.textContent = result.license + (result.artist ? ' · ' + result.artist : '');
      const source = document.createElement('a');
      source.href = result.pageUrl; source.target = '_blank'; source.rel = 'noopener noreferrer'; source.textContent = 'Wikimedia Commons ↗';
      meta.append(name, document.createTextNode(' · '), source);
      if (result.licenseUrl) {
        const licenseLink = document.createElement('a');
        licenseLink.href = result.licenseUrl; licenseLink.target = '_blank'; licenseLink.rel = 'noopener noreferrer'; licenseLink.textContent = 'Licence';
        meta.append(document.createTextNode(' · '), licenseLink);
      }
    }
  } catch (e) { fallback(); }
  frame.dataset.imageState = 'done';
}
function svgEl(name, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', name);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
  return el;
}
function labelLines(label, limit = 18) {
  const words = String(label || '').split(/\s+/), out = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > limit && line) { out.push(line); line = word; }
    else line = (line + ' ' + word).trim();
  }
  if (line) out.push(line);
  return out.slice(0, 3);
}
export function renderDiagram(spec) {
  if (!spec || typeof spec !== 'object') return null;
  const svg = svgEl('svg', { viewBox: '0 0 720 300', class: 'diagram-svg', role: 'img', 'aria-label': spec.title || 'Explanatory diagram' });
  const defs = svgEl('defs');
  const marker = svgEl('marker', { id: 'story-arrow', markerWidth: 9, markerHeight: 9, refX: 7, refY: 3, orient: 'auto', markerUnits: 'strokeWidth' });
  marker.append(svgEl('path', { d: 'M0,0 L0,6 L8,3 z', fill: '#9eb9df' })); defs.append(marker); svg.append(defs);
  svg.append(svgEl('rect', { x: 0, y: 0, width: 720, height: 300, rx: 12, fill: '#14161a' }));
  const title = svgEl('text', { x: 22, y: 27, fill: '#c6d9f4', 'font-size': 13, 'font-weight': 600 });
  title.textContent = String(spec.title || 'Concept structure').slice(0, 95); svg.append(title);
  const type = String(spec.type || spec.kind || '').toLowerCase();
  const rawPoints = Array.isArray(spec.points) ? spec.points : [];
  if ((type.includes('chart') || type.includes('plot') || type.includes('graph')) && rawPoints.length > 1) {
    const pts = rawPoints.map(p => Array.isArray(p) ? { x: Number(p[0]), y: Number(p[1]), label: p[2] || '' } : { x: Number(p.x), y: Number(p.y), label: p.label || '' }).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (pts.length > 1) {
      let xmin = Math.min(...pts.map(p => p.x)), xmax = Math.max(...pts.map(p => p.x)), ymin = Math.min(...pts.map(p => p.y)), ymax = Math.max(...pts.map(p => p.y));
      if (xmin === xmax) xmax = xmin + 1; if (ymin === ymax) ymax = ymin + 1;
      const x = v => 70 + (v - xmin) / (xmax - xmin) * 590, y = v => 248 - (v - ymin) / (ymax - ymin) * 186;
      svg.append(svgEl('path', { d: 'M70 52 V248 H664', fill: 'none', stroke: '#77879f', 'stroke-width': 1.5 }));
      svg.append(svgEl('polyline', { points: pts.map(p => x(p.x) + ',' + y(p.y)).join(' '), fill: 'none', stroke: '#a9c8f2', 'stroke-width': 4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
      pts.forEach(p => {
        svg.append(svgEl('circle', { cx: x(p.x), cy: y(p.y), r: 5, fill: '#d9e8ff', stroke: '#526b8b', 'stroke-width': 2 }));
        if (p.label) { const t = svgEl('text', { x: x(p.x), y: y(p.y) - 12, fill: '#d0d6df', 'font-size': 10, 'text-anchor': 'middle' }); t.textContent = String(p.label).slice(0, 22); svg.append(t); }
      });
      const xl = svgEl('text', { x: 360, y: 282, fill: '#9199a6', 'font-size': 10, 'text-anchor': 'middle' }); xl.textContent = String(spec.xLabel || 'x'); svg.append(xl);
      const yl = svgEl('text', { x: 23, y: 150, fill: '#9199a6', 'font-size': 10, 'text-anchor': 'middle' }); yl.setAttribute('transform', 'rotate(-90 23 150)'); yl.textContent = String(spec.yLabel || 'y'); svg.append(yl);
      return svg;
    }
  }
  const nodes = Array.isArray(spec.nodes) ? spec.nodes.map((n, i) => typeof n === 'string' ? { id: String(i), label: n } : { id: String(n.id ?? i), label: String(n.label || n.title || n.id || ('Concept ' + (i + 1))) }) : [];
  if (nodes.length) {
    const ring = /network|causal|cycle|loop|mind.?map|concept.?map/.test(type), cx = 360, cy = 166, radius = 108;
    const positions = nodes.map((n, i) => {
      if (spec.nodes[i] && typeof spec.nodes[i] === 'object' && Number.isFinite(Number(spec.nodes[i].x)) && Number.isFinite(Number(spec.nodes[i].y))) return { x: 85 + Number(spec.nodes[i].x) * 550, y: 58 + Number(spec.nodes[i].y) * 210 };
      if (ring) { const a = -Math.PI / 2 + i * Math.PI * 2 / nodes.length; return { x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius }; }
      return { x: nodes.length === 1 ? cx : 95 + i * 530 / (nodes.length - 1), y: 160 + (i % 2 ? 10 : -10) };
    });
    const index = new Map(nodes.map((n, i) => [n.id, i]));
    const edges = Array.isArray(spec.edges) ? spec.edges : [];
    edges.forEach(edge => {
      const a = index.get(String(edge.from)), b = index.get(String(edge.to));
      if (a == null || b == null) return;
      const p1 = positions[a], p2 = positions[b];
      svg.append(svgEl('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, stroke: '#8198ba', 'stroke-width': 2, 'marker-end': 'url(#story-arrow)', opacity: .9 }));
      if (edge.label) { const t = svgEl('text', { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 - 7, fill: '#9ca7b8', 'font-size': 9, 'text-anchor': 'middle' }); t.textContent = String(edge.label).slice(0, 24); svg.append(t); }
    });
    nodes.forEach((node, i) => {
      const p = positions[i], lines = labelLines(node.label);
      svg.append(svgEl('rect', { x: p.x - 57, y: p.y - 27, width: 114, height: 54, rx: 9, fill: '#252d38', stroke: '#617896', 'stroke-width': 1.4 }));
      lines.forEach((line, j) => { const t = svgEl('text', { x: p.x, y: p.y + (j - (lines.length - 1) / 2) * 13 + 4, fill: '#e1eaf7', 'font-size': 10, 'text-anchor': 'middle' }); t.textContent = line; svg.append(t); });
    });
  } else {
    const note = svgEl('text', { x: 360, y: 158, fill: '#9ca4b0', 'font-size': 13, 'text-anchor': 'middle' });
    note.textContent = 'Diagram data was not supplied'; svg.append(note);
  }
  return svg;
}
let geoGebraPromise = null;
export function loadGeoGebra() {
  if (window.GGBApplet) return Promise.resolve(true);
  if (!geoGebraPromise) geoGebraPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://www.geogebra.org/apps/deployggb.js'; script.async = true;
    script.onload = () => window.GGBApplet ? resolve(true) : reject(new Error('GeoGebra loaded without its applet API.'));
    script.onerror = () => reject(new Error('GeoGebra could not be reached.'));
    document.head.append(script);
  });
  return geoGebraPromise;
}
export async function mountGeoGebra(target, spec) {
  target.replaceChildren();
  const app = document.createElement('div'); app.className = 'geogebra-mount'; target.append(app);
  try {
    await loadGeoGebra();
    const allowed = ['graphing', 'geometry', '3d', 'classic', 'cas'];
    const appName = allowed.includes(String(spec.appName || '').toLowerCase()) ? String(spec.appName).toLowerCase() : 'graphing';
    const commands = Array.isArray(spec.commands) ? spec.commands.map(x => String(x).trim()).filter(x => x && x.length < 400) : [];
    const params = {
      appName,
      width: 900,
      height: 440,
      showToolBar: false,
      showMenuBar: false,
      showAlgebraInput: true,
      showResetIcon: true,
      enableRightClick: true,
      showFullscreenButton: true,
      appletOnLoad: function(api) {
        commands.forEach(command => { try { api.evalCommand(command); } catch (e) { /* an invalid command should not break the rest */ } });
      }
    };
    if (/^[A-Za-z0-9]{5,16}$/.test(String(spec.materialId || ''))) params.material_id = String(spec.materialId);
    const applet = new window.GGBApplet(params, true);
    applet.inject(app);
    return true;
  } catch (error) {
    const note = document.createElement('p'); note.className = 'geogebra-fallback';
    note.textContent = 'The interactive applet did not load. You can still open the GeoGebra workspace and enter the generated construction there. ';
    const link = document.createElement('a'); link.href = 'https://www.geogebra.org/classic'; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Open GeoGebra ↗';
    note.append(link); target.replaceChildren(note); return false;
  }
}