// Read a PowerPoint .pptx in the browser. Text, slide order and embedded picture assets are
// extracted from the package; the original slide layout is not rasterised.
function parseXml(source) {
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('The PowerPoint package contains invalid XML.');
  return doc;
}
function attrByLocalName(node, name) {
  if (!node || !node.attributes) return '';
  for (const a of Array.from(node.attributes)) if (a.localName === name) return a.value;
  return '';
}
function resolveZipPath(basePath, target) {
  if (!target) return '';
  if (target[0] === '/') return target.slice(1);
  const stack = basePath.split('/').slice(0, -1);
  for (const part of target.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') stack.pop(); else stack.push(part);
  }
  return stack.join('/');
}
function relMap(doc, basePath) {
  const out = new Map();
  for (const r of Array.from(doc.getElementsByTagNameNS('*', 'Relationship'))) {
    if (r.getAttribute('TargetMode') === 'External') continue;
    out.set(r.getAttribute('Id'), resolveZipPath(basePath, r.getAttribute('Target')));
  }
  return out;
}
function slideParagraphs(doc) {
  return Array.from(doc.getElementsByTagNameNS('*', 'p')).map(p =>
    Array.from(p.getElementsByTagNameNS('*', 't')).map(t => t.textContent || '').join('')
  ).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}
function mediaType(path) {
  const ext = (path.split('.').pop() || '').toLowerCase();
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', tif: 'image/tiff', tiff: 'image/tiff', bmp: 'image/bmp' })[ext] || 'application/octet-stream';
}
function keepUrl(url, state) {
  state.objectUrls.push(url);
  return url;
}
export async function parsePptx(file, state) {
  if (!window.JSZip) throw new Error('The PowerPoint reader did not load. Check your internet connection and reload.');
  if (file.size > 250 * 1024 * 1024) throw new Error('This presentation is over the 250 MB import limit.');
  const zip = await window.JSZip.loadAsync(file);
  const pXml = zip.file('ppt/presentation.xml'), pRels = zip.file('ppt/_rels/presentation.xml.rels');
  if (!pXml || !pRels) throw new Error('This file is not a readable .pptx presentation.');
  const presentation = parseXml(await pXml.async('text'));
  const presentationRels = relMap(parseXml(await pRels.async('text')), 'ppt/presentation.xml');
  const ids = Array.from(presentation.getElementsByTagNameNS('*', 'sldId'));
  if (!ids.length) throw new Error('No slides were found in this presentation.');
  let title = file.name.replace(/\.pptx$/i, '').replace(/[_-]+/g, ' ').trim();
  const core = zip.file('docProps/core.xml');
  if (core) {
    try {
      const cd = parseXml(await core.async('text'));
      const t = Array.from(cd.getElementsByTagNameNS('*', 'title'))[0];
      if (t && t.textContent.trim()) title = t.textContent.trim();
    } catch (e) { /* filename is a safe fallback */ }
  }
  const parts = [];
  for (let i = 0; i < ids.length; i++) {
    const relId = attrByLocalName(ids[i], 'id');
    const slidePath = presentationRels.get(relId);
    if (!slidePath || !zip.file(slidePath)) continue;
    const slideDoc = parseXml(await zip.file(slidePath).async('text'));
    const paragraphs = slideParagraphs(slideDoc);
    const heading = paragraphs[0] || ('Slide ' + (i + 1));
    const text = paragraphs.join('\n');
    const fileName = slidePath.split('/').pop();
    const relsPath = slidePath.split('/').slice(0, -1).concat('_rels', fileName + '.rels').join('/');
    const relsFile = zip.file(relsPath);
    const rels = relsFile ? relMap(parseXml(await relsFile.async('text')), slidePath) : new Map();
    const pictures = [];
    const picNodes = Array.from(slideDoc.getElementsByTagNameNS('*', 'pic'));
    for (let j = 0; j < picNodes.length; j++) {
      const pic = picNodes[j];
      const blip = Array.from(pic.getElementsByTagNameNS('*', 'blip'))[0];
      const rid = attrByLocalName(blip, 'embed');
      const path = rels.get(rid);
      if (!path || !zip.file(path)) continue;
      try {
        const blob = await zip.file(path).async('blob');
        if (!mediaType(path).startsWith('image/')) continue;
        const nv = Array.from(pic.getElementsByTagNameNS('*', 'cNvPr'))[0];
        const description = nv && (nv.getAttribute('descr') || nv.getAttribute('name')) || 'Embedded image ' + (j + 1);
        const src = keepUrl(URL.createObjectURL(new Blob([blob], { type: mediaType(path) })), state);
        pictures.push({
          id: 'slide-' + (i + 1) + '-image-' + (j + 1),
          label: description,
          caption: description,
          page: i + 1,
          src,
          origin: 'pptx'
        });
      } catch (e) { /* one corrupt image must not discard the slide */ }
    }
    const slideNumber = i + 1;
    const section = { id: 'slide-' + slideNumber, title: heading, startPage: slideNumber, endPage: slideNumber, text };
    parts.push({
      id: 'pptx-' + slideNumber,
      title: 'Slide ' + slideNumber + ' · ' + heading,
      num: String(slideNumber),
      level: 1,
      startPage: slideNumber,
      endPage: slideNumber,
      subsections: [section],
      sections: [section],
      text,
      pictures,
      front: false,
      slide: true
    });
  }
  if (!parts.length) throw new Error('The presentation could not be read: no slide content was found.');
  return { title, pages: parts.length, parts, method: 'pptx', type: 'pptx' };
}