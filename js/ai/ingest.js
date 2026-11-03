// PDF ingestion in the browser (pdf.js). Splits a book into parts with page ranges, cheaply and without AI:
//  1. the PDF's own outline (bookmarks) → exact start pages;          [book-to-skill does not keep pages; we add them]
//  2. headings detected per page: chapter patterns (multilingual, from book-to-skill's detect_structure) + a font-size test;
//  3. a printed contents page ("Title ...... 123") mapped through page labels;
//  4. fixed windows (flagged low confidence).
// Running headers/footers and bare page numbers are stripped (book-to-skill's cleaning rules), hyphenated breaks rejoined.
const CHAPTER_RE = /^\s*(chapter|unit|lesson|part|section|lecture|capítulo|capitulo|kapitel|chapitre|capitolo|hoofdstuk|rozdział|глава|розділ|часть|частина|第\s*[0-9一二三四五六七八九十百]+\s*[章节部]|제\s*\d+\s*장)\s*([0-9]{1,2}|[ivxlcdm]{1,6})?\b[.:\-–—]?\s*(.{0,90})$/i;
const NUM_TITLE_RE = /^\s*(\d{1,2})(\.|\s)\s+([A-ZА-ЯЁІЇЄ][^.!?]{2,80})$/;
const FRONT_BACK = /^(contents|table of contents|preface|foreword|acknowledg|index|bibliography|references|appendix|glossary|содержание|предисловие|зміст)/i;

function lib() { const L = window.pdfjsLib; if (!L) throw new Error('The PDF reader did not load. Reload the page and try again.'); return L; }
export async function openPDF(blob) { const L = lib(); const data = new Uint8Array(await blob.arrayBuffer()); return L.getDocument({ data, isEvalSupported: false }).promise; }
export async function pageCount(blob) { try { const d = await openPDF(blob); return d.numPages; } catch (e) { return 0; } }

export async function pageLines(doc, i) {
  const pg = await doc.getPage(i), tc = await pg.getTextContent(); const lines = []; let cur = null;
  for (const it of tc.items) {
    if (!it.str) { if (it.hasEOL && cur) { lines.push(cur); cur = null; } continue; }
    const size = Math.abs(it.transform[3]) || Math.abs(it.transform[0]) || 10, y = it.transform[5];
    if (cur && Math.abs(cur.y - y) < size * .5) { cur.text += (cur.text.endsWith(' ') ? '' : ' ') + it.str; cur.size = Math.max(cur.size, size); }
    else { if (cur) lines.push(cur); cur = { text: it.str, size, y }; }
    if (it.hasEOL) { lines.push(cur); cur = null; }
  }
  if (cur) lines.push(cur);
  return lines.map(l => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() })).filter(l => l.text);
}
async function outlineParts(doc) {
  const ol = await doc.getOutline().catch(() => null); if (!ol || !ol.length) return null;
  const items = []; const walk = async (arr, depth) => { for (const o of arr) { let page = null; try { const dest = typeof o.dest === 'string' ? await doc.getDestination(o.dest) : o.dest; if (dest && dest[0]) page = (await doc.getPageIndex(dest[0])) + 1; } catch (e) { } items.push({ title: (o.title || '').trim(), page, depth }); if (o.items && o.items.length && depth < 2) await walk(o.items, depth + 1); } };
  await walk(ol, 0);
  const valid = items.filter(i => i.page && i.title); if (valid.length < 2) return null;
  // choose the shallowest depth with ≥3 entries (or ≥2) excluding front/back matter
  for (const d of [0, 1, 2]) { const L = valid.filter(i => i.depth === d && !FRONT_BACK.test(i.title)); if (L.length >= 3 || (d === 2 && L.length >= 2) || (d === 0 && L.length >= 2 && valid.filter(i => i.depth === 1).length < 3)) return L; }
  return valid.filter(i => i.depth === 0);
}
function stripFurniture(pages) {
  // remove lines that recur at the top or bottom of more than half the pages (running headers/footers), and bare page numbers
  const edge = new Map(); const norm = s => s.replace(/\d+/g, '#').toLowerCase();
  pages.forEach(L => { [L[0], L[1], L[L.length - 1], L[L.length - 2]].filter(Boolean).forEach(l => { const k = norm(l.text); edge.set(k, (edge.get(k) || 0) + 1); }); });
  const lim = Math.max(3, pages.length * .5);
  return pages.map(L => L.filter((l, i) => { const atEdge = i < 2 || i >= L.length - 2; if (atEdge && (edge.get(norm(l.text)) || 0) > lim) return false; if (/^(\d{1,4}|[ivxlcdm]{1,7})$/i.test(l.text)) return false; return true; }));
}
export async function splitBook(blob, { onProgress } = {}) {
  const doc = await openPDF(blob), n = doc.numPages;
  const result = { pages: n, parts: [], method: 'none' };
  const ol = await outlineParts(doc);
  if (ol) { result.method = 'outline'; ol.sort((a, b) => a.page - b.page); ol.forEach((o, i) => result.parts.push({ title: o.title, startPage: o.page, endPage: i + 1 < ol.length ? Math.max(o.page, ol[i + 1].page - 1) : n })); return result; }
  // scan pages for headings (bounded for very long books)
  const scanN = Math.min(n, 900), pages = [];
  for (let i = 1; i <= scanN; i++) { pages.push(await pageLines(doc, i)); if (onProgress && i % 20 === 0) onProgress(i / scanN); }
  const clean = stripFurniture(pages); const sizes = []; clean.forEach(L => L.forEach(l => sizes.push(l.size))); sizes.sort((a, b) => a - b);
  const body = sizes[Math.floor(sizes.length * .5)] || 10;
  const heads = []; const seen = new Set();
  clean.forEach((L, pi) => L.slice(0, 6).forEach((l, li) => {
    const t = l.text; if (t.length > 110 || FRONT_BACK.test(t)) return;
    const m = t.match(CHAPTER_RE), big = l.size > body * 1.45 && t.length < 80 && /[A-Za-zА-Яа-я]/.test(t) && !/[.,;]$/.test(t);
    if (m) { const key = (m[2] || '').toLowerCase() || t.toLowerCase(); if (seen.has(key)) return; seen.add(key); heads.push({ title: t.length < 6 && L[li + 1] ? t + ' ' + L[li + 1].text : t, page: pi + 1, strong: true }); }
    else if (big && li < 3) heads.push({ title: t, page: pi + 1, strong: false, size: l.size });
  }));
  let chosen = heads.filter(h => h.strong);
  if (chosen.length < 2) { const bigs = heads.filter(h => !h.strong); const top = Math.max(...bigs.map(h => h.size || 0)); chosen = bigs.filter(h => h.size >= top * .92); if (chosen.length > 60 || chosen.length < 2) chosen = []; }
  if (chosen.length >= 2) {
    result.method = 'headings'; const uniq = []; chosen.forEach(h => { if (!uniq.length || uniq[uniq.length - 1].page !== h.page) uniq.push(h); });
    if (uniq[0].page > 3) uniq.unshift({ title: 'Front matter', page: 1 });
    uniq.forEach((h, i) => result.parts.push({ title: h.title, startPage: h.page, endPage: i + 1 < uniq.length ? Math.max(h.page, uniq[i + 1].page - 1) : n }));
    return result;
  }
  // printed contents page: "Title ..... 123"
  const toc = []; clean.slice(0, 20).forEach(L => L.forEach(l => { const m = l.text.match(/^(.{4,90}?)[\s.·…]{3,}(\d{1,4})$/); if (m && !FRONT_BACK.test(m[1])) toc.push({ title: m[1].trim(), printed: +m[2] }); }));
  if (toc.length >= 3) {
    let labels = null; try { labels = await doc.getPageLabels(); } catch (e) { }
    const offsetGuess = (() => { for (let i = 0; i < clean.length; i++) if (clean[i].some(l => l.text.toLowerCase().startsWith(toc[0].title.toLowerCase().slice(0, 24)))) { if (i + 1 > 20) return i + 1 - toc[0].printed; } return 0; })();
    const phys = p => { if (labels) { const k = labels.indexOf(String(p)); if (k >= 0) return k + 1; } return clamp(p + offsetGuess, 1, n); };
    result.method = 'contents'; toc.sort((a, b) => a.printed - b.printed);
    toc.forEach((t, i) => { const s = phys(t.printed), e = i + 1 < toc.length ? Math.max(s, phys(toc[i + 1].printed) - 1) : n; result.parts.push({ title: t.title, startPage: s, endPage: e }); });
    return result;
  }
  result.method = 'windows'; const W = n <= 30 ? Math.max(4, Math.ceil(n / 4)) : 20;
  for (let s = 1; s <= n; s += W) result.parts.push({ title: `Pages ${s}–${Math.min(n, s + W - 1)}`, startPage: s, endPage: Math.min(n, s + W - 1), lowConfidence: true });
  return result;
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
export async function partText(blob, from, to, maxChars = 180000) {
  const doc = await openPDF(blob); const pages = [];
  for (let i = from; i <= Math.min(to, doc.numPages); i++) pages.push(await pageLines(doc, i));
  const clean = stripFurniture(pages); let out = '';
  clean.forEach((L, k) => { out += `\n[page ${from + k}]\n` + L.map(l => l.text).join('\n').replace(/(\w)-\n(\w)/g, '$1$2'); });
  return out.slice(0, maxChars);
}
export async function pageImages(blob, from, to, max = 4) {
  const doc = await openPDF(blob), out = [];
  for (let i = from; i <= Math.min(to, doc.numPages) && out.length < max; i++) { const pg = await doc.getPage(i), vp = pg.getViewport({ scale: 1.5 }), c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise; out.push(await new Promise(r => c.toBlob(r, 'image/jpeg', .85))); }
  return out;
}
