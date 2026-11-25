// Pure PowerPoint Open XML helpers. Kept separate from the browser ZIP reader so relationship and
// chart/SmartArt extraction can be regression-tested without a browser or an Office installation.
const TAG_PREFIX = '(?:[A-Za-z_][\\w.-]*:)?';
const attrMap = tag => {
  const out = {};
  for (const m of String(tag || '').matchAll(/([^\\s=]+)\\s*=\\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1]] = m[2] ?? m[3] ?? '';
  return out;
};
const localTags = (xml, local) => {
  const q = TAG_PREFIX + local;
  const re = new RegExp('<' + q + '\\b[^>]*>[\\s\\S]*?<\\/' + q + '\\s*>|<' + q + '\\b[^>]*/>', 'gi');
  return [...String(xml || '').matchAll(re)].map(m => m[0]);
};
const openTag = block => (String(block || '').match(/^<[^>]+>/) || [''])[0];
const decodeXml = value => String(value || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
const textValues = (xml, local = 't') => localTags(xml, local).map(x => decodeXml(x.replace(/^<[^>]*>/, '').replace(/<\\/[^>]+>$/i, '').replace(/<[^>]+>/g, ''))).filter(Boolean);
const relMap = xml => {
  const out = new Map();
  localTags(xml, 'Relationship').forEach(tag => {
    const a = attrMap(tag);
    if (a.Id && a.Type && a.Target) out.set(a.Id, a);
  });
  return out;
};

export function resolvePptTarget(sourcePart, target) {
  if (!target) return '';
  const raw = String(target).replace(/\\\\/g, '/');
  const stack = raw.startsWith('/') ? [] : String(sourcePart || '').split('/').slice(0, -1);
  for (const part of raw.replace(/^\\/+/, '').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/');
}

const relationshipFor = (rels, id, suffix, sourcePart) => {
  const r = rels.get(id);
  if (!r || !String(r.Type || '').endsWith('/' + suffix) || /^external$/i.test(r.TargetMode || '')) return null;
  const path = resolvePptTarget(sourcePart, r.Target);
  return path ? { relId: id, path } : null;
};
const shapeDescription = block => {
  const tag = localTags(block, 'cNvPr')[0];
  const a = attrMap(openTag(tag));
  return { name: a.name || '', title: a.title || '', caption: a.descr || a.title || '' };
};

// Resolve only assets actually referenced by a slide; unrelated images bundled in the package are not source evidence.
export function pptxSlideAssets(slideXml, relationshipXml, slidePath, slideNumber = 1) {
  const rels = relMap(relationshipXml), images = [], charts = [], diagrams = [], seen = new Set();
  let imageNumber = 0;
  for (const pic of localTags(slideXml, 'pic')) {
    const desc = shapeDescription(pic);
    for (const blip of localTags(pic, 'blip')) {
      const attrs = attrMap(openTag(blip));
      const rid = attrs['r:embed'] || attrs.embed || Object.entries(attrs).find(([k]) => /:embed$/.test(k))?.[1];
      const ref = relationshipFor(rels, rid, 'image', slidePath);
      if (!ref || seen.has(ref.path)) continue;
      seen.add(ref.path);
      imageNumber++;
      const caption = desc.caption || '';
      const label = caption || desc.name || 'Picture ' + imageNumber + ' on slide ' + slideNumber;
      images.push({ ...ref, slide: slideNumber, label, caption, title: desc.title, name: desc.name });
    }
  }
  for (const chart of localTags(slideXml, 'chart')) {
    const attrs = attrMap(openTag(chart));
    const rid = attrs['r:id'] || attrs.id || Object.entries(attrs).find(([k]) => /:id$/.test(k))?.[1];
    const ref = relationshipFor(rels, rid, 'chart', slidePath);
    if (!ref || charts.some(x => x.path === ref.path)) continue;
    const frame = localTags(slideXml, 'graphicFrame').find(x => x.includes(chart));
    charts.push({ ...ref, slide: slideNumber, ...shapeDescription(frame || chart) });
  }
  for (const ids of localTags(slideXml, 'relIds')) {
    const attrs = attrMap(openTag(ids));
    const rid = attrs['r:dm'] || attrs.dm || Object.entries(attrs).find(([k]) => /:dm$/.test(k))?.[1];
    const ref = relationshipFor(rels, rid, 'diagramData', slidePath);
    if (!ref || diagrams.some(x => x.path === ref.path)) continue;
    const frame = localTags(slideXml, 'graphicFrame').find(x => x.includes(ids));
    diagrams.push({ ...ref, slide: slideNumber, ...shapeDescription(frame || ids) });
  }
  return { images, charts, diagrams };
}

const blockFor = (xml, local) => localTags(xml, local)[0] || '';
const valuesIn = xml => {
  const pts = localTags(xml, 'pt').map(tag => {
    const a = attrMap(openTag(tag));
    const v = localTags(tag, 'v')[0];
    const value = v ? decodeXml(v.replace(/^<[^>]*>/, '').replace(/<\\/[^>]+>$/i, '').replace(/<[^>]+>/g, '')) : '';
    return { index: Number.isFinite(Number(a.idx)) ? Number(a.idx) : 0, value };
  }).filter(x => x.value !== '').sort((a, b) => a.index - b.index);
  return pts.map(x => x.value);
};

// Extract cached series values rather than guessing a chart from its screenshot or inventing absent workbook data.
export function pptxChartSummary(chartXml, fallbackTitle = 'Chart') {
  const title = textValues(blockFor(chartXml, 'title')).join(' ').trim() || fallbackTitle;
  const series = localTags(chartXml, 'ser').map((ser, i) => {
    const tx = blockFor(ser, 'tx');
    const rawName = textValues(tx, 'v')[0] || textValues(tx, 't')[0] || '';
    const name = rawName || 'Series ' + (i + 1);
    const cat = valuesIn(blockFor(ser, 'cat') || blockFor(ser, 'xVal'));
    const val = valuesIn(blockFor(ser, 'val') || blockFor(ser, 'yVal'));
    const pairs = val.map((v, k) => (cat[k] != null ? cat[k] : String(k + 1)) + ' = ' + v);
    return { name, pairs };
  });
  const details = series.map(s => s.name + (s.pairs.length ? ': ' + s.pairs.slice(0, 40).join('; ') : ': no cached point values')).join('\\n');
  return 'PowerPoint chart — ' + title + (details ? '\\n' + details : '\\nNo cached series data was found in the chart XML.');
}

// SmartArt labels and directed connections are taken from the diagram data part, not inferred from a decorative image.
export function pptxDiagramSummary(diagramXml, fallbackTitle = 'SmartArt') {
  const nodes = localTags(diagramXml, 'pt').map(tag => {
    const a = attrMap(openTag(tag));
    return { id: a.modelId || a.id || '', label: textValues(tag).join(' ').trim(), type: a.type || '' };
  }).filter(x => x.label);
  const links = localTags(diagramXml, 'cxn').map(tag => {
    const a = attrMap(openTag(tag));
    return { from: a.srcId || '', to: a.destId || '', type: a.type || '' };
  }).filter(x => x.from && x.to);
  const nodeText = nodes.slice(0, 100).map(n => (n.id ? '[' + n.id + '] ' : '') + n.label).join('\\n');
  const linkText = links.slice(0, 150).map(x => x.from + ' → ' + x.to + (x.type ? ' (' + x.type + ')' : '')).join('\\n');
  return 'PowerPoint SmartArt — ' + fallbackTitle +
    (nodeText ? '\\nLabels:\\n' + nodeText : '\\nNo accessible node labels were found.') +
    (linkText ? '\\nConnections:\\n' + linkText : '');
}
