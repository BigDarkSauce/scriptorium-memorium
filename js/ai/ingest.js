// PDF ingestion in the browser (pdf.js), without AI. It finds the book's hierarchy, keeps every subsection's text
// with its pages, and cuts the book's own figures out of the pages.
//
//  splitBook(blob)            → { pages, method, title, parts:[{ title, num, level, chapter?, startPage, endPage,
//                                  subsections:[{ id, num, title, level, startPage, endPage, chars }] }] }
//     The hierarchy (level 1 = chapter, 2 = section, 3 = subsection, 4 = sub-subsection) comes from, in order:
//       1. the PDF's own outline (bookmarks), at every depth;
//       2. headings found on the pages: numbered (1. / 1.2 / 1.2.3 / A.1 / roman / §), "Chapter n" patterns
//          (multilingual, from book-to-skill's detect_structure), and font cues (size, bold, space above);
//       3. a printed contents page ("1.2 Title ...... 123"), mapped through page labels;
//       4. fixed windows (flagged low confidence).
//     Outline and headings are merged: the outline is authoritative for the levels it has, headings add the
//     deeper levels. A part (one scroll) is a chapter, or a section when its chapter is longer than
//     MAX_PART_PAGES. Every subsection of a part is listed; nothing is merged away. A part with no detected
//     subsections is cut into synthetic page windows (≤ 2 pages) so coverage can still be checked.
//  partSections(blob, part)   → { sections:[{ id, num, title, level, startPage, endPage, text, inventory }], text }
//     The part's text split at each subsection heading, with an inventory of what each one contains
//     (equations, worked examples, definitions, figures, tables, quantities). The prompt uses it as a checklist.
//  extractFigures(blob, from, to) → [{ id, label, kind, caption, page, bbox, w, h, src, dataUrl }]
//     Figure regions from image XObjects (with their transforms), vector-drawing clusters, and "Figure n" captions;
//     the page is rendered and the region (with its caption) cropped to a JPEG data URL (≤ 1200 px, q 0.82).
//     title = the PDF's Title metadata when it is a real title, else the file name (pdfTitle).
// Running headers/footers (short lines recurring on the top or bottom baselines of more than half the pages) and bare
// page numbers are stripped, hyphenated breaks rejoined, and the cells of a table row joined into one line ("0 | 2.0 | 1.5").
// The pure helpers (parseHeading, detectHeadings, buildParts, stripFurniture, joinRows, segmentSections, inventory,
// opRegions, findCaptions, pairFigures, figureId, cleanTitle) take plain arrays, so they run in node for tests.

const CHAPTER_RE = /^\s*(chapter|unit|lesson|part|lecture|capítulo|capitulo|kapitel|chapitre|capitolo|hoofdstuk|rozdział|глава|розділ|часть|частина|第\s*[0-9一二三四五六七八九十百]+\s*[章节部]|제\s*\d+\s*장)\s*([0-9]{1,2}|[ivxlcdm]{1,6})?\b[.:\-–—]?\s*(.{0,90})$/i;
const NUM_HEAD_RE = /^\s*((?:\d{1,2}|[A-Z])(?:\.\d{1,2}){0,3})(\.?)\s+(\S.{0,118})$/;
const ROMAN_HEAD_RE = /^\s*([IVXLC]{1,6})\.\s+(\S.{1,100})$/;
const SECT_RE = /^\s*§\s*(\d{1,3}(?:\.\d{1,3}){0,3})\.?\s*(\S.{1,110})$/;
const APPENDIX_RE = /^\s*(appendix|anhang|annexe|приложение)\s+([A-Z]|\d{1,2})\b[.:\-–—]?\s*(.{0,90})$/i;
export const CAPTION_RE = /^\s*(Figure|Fig\.?|FIGURE|FIG\.?|Table|TABLE|Tab\.|Abbildung|Abb\.|Tabelle|Figura|Tabla|Рис\.?|Рисунок|Таблица|Plate|Exhibit|Scheme|Chart|Diagram)\s*([A-Z]?\d{1,3}(?:[.\-–]\d{1,3}){0,2}[a-z]?)\s*([.:\-–—|]|\s|$)\s*(.*)$/;
const FRONT_BACK = /^(contents|table of contents|preface|foreword|acknowledg|index|bibliography|references|glossary|содержание|предисловие|зміст|inhalt|sommaire|índice)/i;
export const MAX_PART_PAGES = 30;     // a chapter longer than this is hung as one scroll per section
const SYNTH_PAGES = 2;                // synthetic subsection windows when a part has no headings

// ---------------------------------------------------------------- pdf.js access
function lib() { const L = (typeof window !== 'undefined' && window.pdfjsLib) || globalThis.pdfjsLib; if (!L) throw new Error('The PDF reader did not load. Reload the page and try again.'); return L; }
// One parsed document per book (re-opening a 500-page PDF costs seconds). A blob read again from IndexedDB is a new
// object, so blobs from the store are keyed by their book (keyPDF(blob, bookId)); others (a file being added) by the
// blob itself. At most DOC_MAX stay open; the oldest is destroyed (pdf.js keeps its data in the worker until then),
// and closePDF(bookId) frees a book's document when its job or room ends.
const DOCS = new Map(), DOC_MAX = 2, PDFKEY = Symbol('pdfKey');
export function keyPDF(blob, bookId) { if (blob && typeof blob === 'object' && bookId != null) { try { blob[PDFKEY] = 'book:' + bookId; } catch (e) { } } return blob; }
const docKey = blob => (blob && blob[PDFKEY]) || blob;
const destroyDoc = p => { Promise.resolve(p).then(d => d && d.destroy && d.destroy()).catch(() => {}); };
export function closePDF(bookId) { const k = 'book:' + bookId, p = DOCS.get(k); if (!p) return; DOCS.delete(k); destroyDoc(p); }
export async function openPDF(blob) {
  const key = docKey(blob);
  if (key && typeof key !== 'number' && DOCS.has(key)) { const p = DOCS.get(key); DOCS.delete(key); DOCS.set(key, p); return p; }   // most recently used last
  const L = lib(); const data = new Uint8Array(await blob.arrayBuffer());
  if (DOCS.has(key)) return DOCS.get(key);   // another caller opened it meanwhile
  const p = L.getDocument({ data, isEvalSupported: false, verbosity: 0 }).promise;
  if (blob && typeof blob === 'object') {
    DOCS.set(key, p); p.catch(() => { if (DOCS.get(key) === p) DOCS.delete(key); });
    while (DOCS.size > DOC_MAX) { const [k0, p0] = DOCS.entries().next().value; DOCS.delete(k0); destroyDoc(p0); }
  }
  return p;
}
export async function pageCount(blob) { try { const d = await openPDF(blob); return d.numPages; } catch (e) { return 0; } }
// The book's title: the PDF's Title metadata when it is a real title, else the file name (without .pdf).
export function cleanTitle(t) {
  t = String(t || '').replace(/\s+/g, ' ').trim().replace(/^microsoft (word|powerpoint|excel) - /i, '');
  if (/^[\w.-]+\.\w{2,4}$/.test(t)) return '';          // a bare file name ("chapter3.pdf", "main.dvi") is not a title
  t = t.replace(/\.(docx?|pptx?|odt|tex|dvi|pdf|indd|qxd|ps)$/i, '').trim();
  if (t.length < 3 || /^(untitled|unknown|anonymous|title|document\s*\d*|none|null|\(?untitled\)?|print|slides?)$/i.test(t) || !/\p{L}{2}/u.test(t)) return '';
  return t;
}
export const fileTitle = blob => blob && blob.name ? String(blob.name).replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim() : '';
export async function pdfTitle(blob) {
  try { const m = await (await openPDF(blob)).getMetadata(); let x = m && m.info && m.info.Title; if (!cleanTitle(x) && m && m.metadata && typeof m.metadata.get === 'function') x = m.metadata.get('dc:title'); return cleanTitle(x) || fileTitle(blob); }
  catch (e) { return fileTitle(blob); }
}

// Lines of one page: { text, size, x, x1, y, bold, gap } in PDF user space (y up). `gap` = space above the line
// in units of its own size. With fonts:true the operator list is loaded first, so font names (…-Bold) are known.
export async function pageLines(doc, i, { fonts = false } = {}) {
  const pg = await doc.getPage(i);
  if (fonts) { try { await pg.getOperatorList(); } catch (e) { } }
  const tc = await pg.getTextContent();
  const fontOf = new Map(); const font = fn => { if (!fonts || !fn) return null; if (!fontOf.has(fn)) { let f = null; try { f = pg.commonObjs.get(fn); } catch (e) { } fontOf.set(fn, f); } return fontOf.get(fn); };
  const isBold = fn => { const f = font(fn); return !!(f && (f.bold || f.black || /bold|black|heavy|semibold|demi/i.test(f.name || ''))); };
  // monospace faces carry code (R/Python listings, console output): Courier, Consolas, *Mono*, cmtt/lmmono (TeX)
  const isMono = fn => { const st = tc.styles && tc.styles[fn]; if (st && st.fontFamily === 'monospace') return true; const f = font(fn); return !!(f && (f.isMonospace || MONO_RE.test(f.name || ''))); };
  return linesFromItems(tc.items, isBold, isMono);
}
export const MONO_RE = /mono|courier|consol|menlo|inconsolata|typewriter|cmtt|lmmono|sourcecode|firacode|jetbrains|lucidaconsole|andale/i;
export function linesFromItems(items, isBold = () => false, isMono = () => false) {
  const lines = []; let cur = null;
  const push = () => { if (cur) { lines.push(cur); cur = null; } };
  for (const it of items) {
    if (!it.str) { if (it.hasEOL) push(); continue; }
    // pdf.js fills column gaps with one wide whitespace item: treat it as a break between cells/columns
    if (!it.str.trim()) { const sz = Math.abs(it.transform[3]) || 10; if ((it.width || 0) > sz * 2.5 || it.hasEOL) push(); else if (cur) { cur.text += ' '; if (cur.leadOpen) cur.lead += ' '; } continue; }
    const size = Math.abs(it.transform[3]) || Math.abs(it.transform[0]) || 10, y = it.transform[5], x = it.transform[4], w = it.width || it.str.length * size * .5;
    const b = isBold(it.fontName), mo = isMono(it.fontName), n = it.str.replace(/\s/g, '').length;
    // same baseline and no column-sized gap → same line
    if (cur && Math.abs(cur.y - y) < size * .5 && x - cur.x1 < size * 2.5 && x >= cur.x - size) {
      const sep = (cur.text.endsWith(' ') || it.str.startsWith(' ') ? '' : ' ');
      cur.text += sep + it.str; cur.size = Math.max(cur.size, size); cur.x1 = Math.max(cur.x1, x + w); cur.nb += b ? n : 0; cur.nm += mo ? n : 0; cur.n += n;
      // the lead: the opening run in the line's first face and size ("Write your own" before "A function is…")
      if (cur.leadOpen && Math.abs(size - cur.s0) < cur.s0 * .05 && b === cur.b0) cur.lead += sep + it.str; else cur.leadOpen = false;
    } else { push(); cur = { text: it.str, size, y, x, x1: x + w, nb: b ? n : 0, nm: mo ? n : 0, n, lead: it.str, leadOpen: true, s0: size, b0: b }; }
    if (it.hasEOL) push();
  }
  push();
  const out = lines.map(l => { const o = { text: l.text.replace(/\s+/g, ' ').trim(), size: +l.size.toFixed(2), x: +l.x.toFixed(1), x1: +l.x1.toFixed(1), y: +l.y.toFixed(1), bold: l.n > 0 && l.nb / l.n >= .8 }; if (l.n > 0 && l.nm / l.n >= .8) o.mono = true; const ld = l.lead.replace(/\s+/g, ' ').trim(); if (ld && ld.length < o.text.length - 2 && l.s0 >= l.size * .98) o.lead = ld; return o; }).filter(l => l.text);
  out.forEach((l, k) => { l.gap = gapAbove(out[k - 1], l); });
  return out;
}
// space above a line in units of its size: 0 for a cell on the same baseline, 9 for a page or column start
const gapAbove = (p, l) => !p ? 9 : Math.abs(p.y - l.y) < 2 ? 0 : p.y > l.y ? +((p.y - l.y) / Math.max(l.size, 1)).toFixed(2) : 9;
async function readPages(doc, from, to, { fonts = false, onProgress } = {}) {
  const pages = [];
  for (let i = from; i <= to; i++) { pages.push(await pageLines(doc, i, { fonts })); if (onProgress && (i - from) % 20 === 19) onProgress((i - from + 1) / (to - from + 1)); }
  return pages;
}

// ---------------------------------------------------------------- pure helpers: headings
const ROMAN = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
export function romanToInt(s) { s = String(s || '').toLowerCase(); let n = 0; for (let i = 0; i < s.length; i++) { const a = ROMAN[s[i]], b = ROMAN[s[i + 1]] || 0; if (!a) return NaN; n += a < b ? -a : a; } return n; }
const okTitle = t => t && t.length >= 2 && /^[\p{Lu}\p{Lt}\p{Lo}"“'(«\[]/u.test(t) && /\p{L}{2}/u.test(t) && !/^(m|s|kg|cm|mm|km|g|N|J|W|Pa|K|Hz|mol|%)\b/.test(t) && !/[=<>≤≥]/.test(t) && !(t.length > 50 && /[.,;:]$/.test(t)) && !/[,;]$/.test(t);
// Classify one line of text as a heading candidate. Returns { kind, num, level, title } or null.
// level: 1 chapter, 2 section, 3 subsection, 4 sub-subsection. `strong` = the pattern alone is convincing.
export function parseHeading(text) {
  const t = String(text || '').trim(); if (!t || t.length > 130) return null;
  if (CAPTION_RE.test(t)) return null;
  let m = t.match(CHAPTER_RE);
  if (m && (m[2] || /^第|^제/.test(m[1]))) { const num = m[2] ? (/^\d+$/.test(m[2]) ? m[2] : String(romanToInt(m[2]))) : ''; const lvl = /^part$/i.test(m[1]) ? 0 : 1; return { kind: 'chapter', num, level: lvl, title: t, strong: true }; }
  m = t.match(APPENDIX_RE); if (m) return { kind: 'appendix', num: m[2].toUpperCase(), level: 1, title: t, strong: true };
  m = t.match(SECT_RE); if (m) return { kind: 'section-sign', num: m[1], level: m[1].split('.').length + 1, title: t, strong: true };
  m = t.match(NUM_HEAD_RE);
  if (m) {
    const num = m[1], comps = num.split('.'), title = m[3].trim();
    if (/^[A-Z]$/.test(num) && !m[2]) return null;                       // "A Title" is not a heading number
    if (comps.slice(1).some(c => +c > 60) || +comps[0] > 60) return null;
    if (!okTitle(title) || /^\d/.test(title)) return null;
    if (/\.\s*\d{1,4}$/.test(title) || /\s\d{1,4}$/.test(title) && /\.{3,}|…/.test(title)) return null;  // contents entry
    return { kind: 'numbered', num, level: comps.length, title: t, strong: comps.length > 1 };
  }
  m = t.match(ROMAN_HEAD_RE); if (m && okTitle(m[2]) && romanToInt(m[1]) <= 40) return { kind: 'roman', num: String(romanToInt(m[1])), level: 1, title: t, strong: false };
  return null;
}
// numeric comparison of heading numbers ("1.10" > "1.9"; letters after digits: appendices come last)
export function cmpNum(a, b) {
  const A = String(a).split('.'), B = String(b).split('.');
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    if (A[i] == null) return -1; if (B[i] == null) return 1;
    const x = /^\d+$/.test(A[i]) ? +A[i] : 1000 + A[i].charCodeAt(0), y = /^\d+$/.test(B[i]) ? +B[i] : 1000 + B[i].charCodeAt(0);
    if (x !== y) return x - y;
  }
  return 0;
}
export function bodySize(pages) {
  const w = new Map(); let total = 0;
  pages.forEach(L => L.forEach(l => { const k = Math.round(l.size * 2) / 2; w.set(k, (w.get(k) || 0) + l.text.length); total += l.text.length; }));
  let acc = 0; for (const [k, v] of [...w.entries()].sort((a, b) => a[0] - b[0])) { acc += v; if (acc >= total / 2) return k; }
  return 10;
}
// A printed contents page: many lines ending in a page number (or dot leaders), or a "Contents" title on top.
export function isContentsPage(L) {
  if (!L || !L.length) return false;
  const top = L.slice(0, 4).some(l => /^(contents|table of contents|inhalt|sommaire|índice|indice|содержание|зміст|目录|目次)$/i.test(l.text));
  const tail = L.filter(l => /(\.{3,}|…|·{3,}|\s)\d{1,4}$/.test(l.text) || /^\d{1,4}$/.test(l.text)).length;
  return top || (tail >= 6 && tail >= L.length * .35);
}
// Find headings in cleaned pages (array of line arrays, page 1 = index 0 unless `first` is given).
export function detectHeadings(pages, { first = 1, body } = {}) {
  body = body || bodySize(pages);
  const anyBold = pages.some(L => L.some(l => l.bold));
  const allBoldShare = (() => { let b = 0, n = 0; pages.forEach(L => L.forEach(l => { n++; if (l.bold) b++; })); return n ? b / n : 0; })();
  const boldCue = anyBold && allBoldShare < .35;
  const cands = [];
  pages.forEach((L, pi) => {
    if (isContentsPage(L)) return;
    L.forEach((l, li) => {
      const t = l.text; if (t.length > 120) return;
      const big = l.size >= body * 1.12, huge = l.size >= body * 1.4, bold = boldCue && l.bold, spaced = l.gap >= 1.9 || li === 0;
      // back matter (References, Index…): a boundary that ends the part before it, never a part of its own
      if (FRONT_BACK.test(t) && t.length < 40 && (big || bold) && !/^contents/i.test(t)) { cands.push({ kind: 'matter', num: '', level: 1, title: t, matter: true, page: first + pi, line: li, size: l.size, bold: l.bold, y: l.y }); return; }
      const h = parseHeading(t);
      let accept = null;
      if (h) {
        if (h.kind === 'chapter' || h.kind === 'appendix') accept = (big || bold || li < 4) ? h : null;
        else if (h.kind === 'section-sign') accept = (big || bold || spaced) ? h : null;
        else if (h.kind === 'numbered' && h.level >= 2) accept = (big || bold || (spaced && t.length <= 90 && !/[.:]$/.test(t))) ? h : null;
        else accept = (big || bold) && t.length <= 90 ? h : null;          // "1 Introduction", "IV. Results": need a font cue
      } else if ((huge || (big && spaced) || (bold && spaced && t.length <= 70)) && t.length <= 90 && /\p{L}{3}/u.test(t) && !/[.,;:]$/.test(t) && !/^[\p{Ll}]/u.test(t) && !/[=<>]/.test(t)) {
        accept = { kind: 'font', num: '', level: 0, title: t, strong: false };
      }
      if (!accept) return;
      // "Chapter 3" alone on a line: take the title from the next line
      let title = accept.title; const nx = L[li + 1];
      if (accept.kind === 'chapter' && title.length < 14 && nx && nx.text.length < 90 && nx.size >= body * 1.05) title = title + ' ' + nx.text;
      cands.push({ ...accept, title, page: first + pi, line: li, size: l.size, bold: l.bold, y: l.y });
    });
  });
  // monotonic numbering: drop duplicates and backward jumps (running heads that escaped stripping, cross references)
  const out = []; let lastNum = null; const seen = new Set();
  for (const c of cands) {
    if (c.num && (c.kind === 'numbered' || c.kind === 'section-sign' || c.kind === 'chapter' || c.kind === 'roman' || c.kind === 'appendix')) {
      // parts ("Part I") and appendices number on their own; they never block or reorder chapters and sections
      if (c.level === 0 || c.kind === 'appendix') { const key = (c.kind === 'appendix' ? 'A:' : 'P:') + c.num; if (seen.has(key)) continue; seen.add(key); out.push(c); continue; }
      const key = c.num;
      if (seen.has(key)) continue;
      if (lastNum && !/^[A-Z]/.test(c.num) && !/^[A-Z]/.test(lastNum) && cmpNum(c.num, lastNum) <= 0) continue;
      seen.add(key); lastNum = c.num;
    }
    out.push(c);
  }
  // fold "font" headings into levels: match the size of numbered headings when there are some, else rank sizes
  const numbered = out.filter(c => c.level > 0), bySize = {};
  numbered.forEach(c => { (bySize[c.level] = bySize[c.level] || []).push(c.size); });
  const med = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const levelSize = Object.entries(bySize).map(([lv, a]) => [+lv, med(a)]).sort((a, b) => a[0] - b[0]);
  const fonts = out.filter(c => c.kind === 'font');
  out.filter(c => c.matter).forEach(c => { c.level = levelSize.length ? levelSize[0][0] : 1; });
  if (fonts.length) {
    // bigger than every numbered level: a book or part title when chapters exist, else the chapter level
    if (levelSize.length) fonts.forEach(c => { let best = null; levelSize.forEach(([lv, s]) => { const d = Math.abs(s - c.size) / s; if (d < .1 && (!best || d < best.d)) best = { lv, d }; }); c.level = best ? best.lv : c.size > levelSize[0][1] * 1.1 && levelSize[0][0] > 1 ? levelSize[0][0] - 1 : 0; });
    else { const tiers = [...new Set(fonts.map(c => Math.round(c.size * 2) / 2 + (c.bold ? .01 : 0)))].sort((a, b) => b - a).slice(0, 4); fonts.forEach(c => { const k = tiers.indexOf(Math.round(c.size * 2) / 2 + (c.bold ? .01 : 0)); c.level = k >= 0 ? k + 1 : 0; }); }
  }
  // too many unnumbered font headings on one page means it is a slide, a poster or a form: keep the biggest
  return out.filter(c => c.level > 0 || c.kind === 'chapter' || c.matter);
}

// Turn a flat, ordered list of nodes {title, num, level, page, line} into parts with subsections.
// line = index of the heading among the page's cleaned lines (null when unknown, e.g. from a contents page).
export function buildParts(nodes, nPages, { maxPartPages = MAX_PART_PAGES } = {}) {
  nodes = nodes.filter(n => n.page >= 1 && n.page <= nPages).map((n, i) => ({ ...n, i }));
  if (!nodes.length) return [];
  const atTop = n => n.line != null && n.line <= 1;
  const endBefore = nx => nx ? (atTop(nx) ? nx.page - 1 : nx.page) : nPages;
  nodes.forEach((n, k) => {
    let j = k + 1; while (j < nodes.length && nodes[j].level > n.level) j++;
    n.endPage = Math.max(n.page, endBefore(nodes[j])); n.subEnd = Math.max(n.page, endBefore(nodes[k + 1]));
    n.kids = nodes.slice(k + 1, j);
  });
  const levels = [...new Set(nodes.filter(n => !n.matter).map(n => n.level))].sort((a, b) => a - b);
  // the part level: chapters (level 1) when there are at least two, else the shallowest level with two entries
  const count = lv => nodes.filter(n => n.level === lv && !n.matter).length;
  let partLevel = levels.filter(lv => lv >= 1).find(lv => count(lv) >= 2); if (partLevel == null) partLevel = levels.find(lv => count(lv) >= 2) ?? levels[0];
  const mkSub = (n, extra = {}) => ({ id: n.num || '', num: n.num || '', title: n.title, level: n.level, startPage: n.page, endPage: n.subEnd, line: n.line ?? null, ...extra });
  // subsections of node X: X's own opening text (when it has any before its first child), then every descendant
  const subsOf = X => {
    const kids = X.kids.filter(n => !n.matter);
    // no headings inside: a short node is one subsection; a long one is cut into page windows so coverage stays fine-grained
    if (!kids.length) return X.endPage - X.page + 1 > SYNTH_PAGES ? windows({ ...X, startPage: X.page, num: X.num }) : [mkSub(X, { endPage: X.endPage })];
    const f = kids[0], hasIntro = f.page > X.page || (f.line != null && X.line != null && f.line > X.line + 2);
    return [...(hasIntro ? [mkSub(X, { id: (X.num || 'p' + X.page) + '.0', num: '', title: X.title + ' (opening)', level: X.level + 1, endPage: f.page, intro: true, head: X.title })] : []), ...kids.map(n => mkSub(n))];
  };
  const parts = [];
  const groupOf = n => { for (let j = n.i - 1; j >= 0; j--) if (nodes[j].level < partLevel && !nodes[j].matter) return nodes[j].title; return ''; };
  for (const t of nodes.filter(n => n.level === partLevel && !n.matter)) {
    const direct = t.kids.filter(n => !n.matter && n.level === Math.min(...t.kids.map(x => x.level)));
    if (t.endPage - t.page + 1 > maxPartPages && direct.length >= 2) {
      // a long chapter: one scroll per section; the chapter's opening text goes with the first section
      const own = subsOf(t), intro = own[0] && own[0].intro ? own[0] : null;
      direct.forEach((d, j) => parts.push({ title: d.title, num: d.num || '', level: d.level, chapter: t.title, startPage: j === 0 ? t.page : d.page, endPage: d.endPage, subsections: [...(j === 0 && intro ? [intro] : []), ...subsOf(d)] }));
    } else {
      const g = groupOf(t);
      parts.push({ title: t.title, num: t.num || '', level: t.level, ...(g ? { chapter: g } : {}), startPage: t.page, endPage: t.endPage, subsections: subsOf(t) });
    }
  }
  if (parts.length && parts[0].startPage > 3) parts.unshift({ title: 'Front matter', num: '', level: partLevel, startPage: 1, endPage: parts[0].startPage - 1, subsections: [], front: true });
  parts.forEach(p => ensureSubsections(p));
  return parts;
}
// every subsection gets a stable, unique id ("1.2.3", else "p<page>-<k>"); a part with none gets synthetic page windows
function windows(p) {
  const out = [];
  for (let s = p.startPage, k = 1; s <= p.endPage; s += SYNTH_PAGES, k++) { const e = Math.min(p.endPage, s + SYNTH_PAGES - 1); out.push({ id: `${p.num || 'p' + p.startPage}-w${k}`, num: '', title: `${p.title ? p.title + ', ' : ''}pages ${s}–${e}`, level: (p.level || 1) + 1, startPage: s, endPage: e, synthetic: true }); }
  return out;
}
export function ensureSubsections(p) {
  if (!p.subsections || !p.subsections.length) p.subsections = windows(p);
  const used = new Set();
  p.subsections.forEach((s, k) => { let id = s.id || (s.num ? s.num : `p${s.startPage}-${k + 1}`); while (used.has(id)) id += "'"; used.add(id); s.id = id; s.endPage = Math.max(s.startPage, Math.min(s.endPage || p.endPage, p.endPage)); });
  return p;
}
// Lines that can be running furniture on a page: the first and last two lines in reading order, plus every line on the
// two highest and the two lowest baselines (a header drawn last in the content stream is still at the top of the page).
export function edgeLines(L) {
  const idx = new Set([0, 1, L.length - 2, L.length - 1].filter(i => i >= 0 && i < L.length));
  const base = [...new Set(L.map(l => Math.round(l.y / 2) * 2).filter(isFinite))].sort((a, b) => b - a);
  const keep = new Set([...base.slice(0, 2), ...base.slice(-2)]);
  L.forEach((l, i) => { if (keep.has(Math.round(l.y / 2) * 2)) idx.add(i); });
  return idx;
}
export function stripFurniture(pages) {
  // remove short lines whose text (digits ignored) recurs on the edges of more than half the pages (running
  // headers/footers, wherever they sit in the content stream), and bare page numbers on the edges
  const norm = s => s.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();
  const E = pages.map(edgeLines), count = new Map();
  pages.forEach((L, p) => { const seen = new Set(); E[p].forEach(i => { const t = L[i].text; if (t.length > 100) return; const k = norm(t); if (/^[#\W]*$/.test(k)) return; /* bare numbers: see below */ if (!seen.has(k)) { seen.add(k); count.set(k, (count.get(k) || 0) + 1); } }); });
  const lim = Math.max(3, pages.length * .5);
  return pages.map((L, p) => {
    // a bare number is a page number only when it is alone on its baseline (not the first cell of a table row)
    const alone = (l, i) => !L.some((o, j) => j !== i && Math.abs(o.y - l.y) < 2);
    const kept = L.filter((l, i) => { if (!E[p].has(i)) return true; if (l.text.length <= 100 && !/^[#\W]*$/.test(norm(l.text)) && (count.get(norm(l.text)) || 0) > lim) return false; if (/^(\d{1,4}|[ivxlcdm]{1,7})$/i.test(l.text) && alone(l, i)) return false; return true; });
    kept.forEach((l, k) => { l.gap = gapAbove(kept[k - 1], l); });
    return kept;
  });
}
// Cells on one baseline (a table row, an equation and its number) become one line: "0 | 2.0 | 1.5".
export function joinRows(L) {
  const out = [];
  L.forEach((l, i) => { const p = out[out.length - 1]; if (p && Math.abs(p.y - l.y) < Math.max(1.5, Math.min(p.size, l.size) * .35) && l.x >= p.x1 - 1) { p.text += (p.mono && l.mono ? '   ' : ' | ') + l.text; p.x1 = l.x1; p.cells++; p.mono = p.mono && !!l.mono; } else out.push({ text: l.text, y: l.y, x: l.x, x1: l.x1, size: l.size, li: i, cells: 1, mono: !!l.mono }); });
  return out;
}
const normT = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// ---------------------------------------------------------------- pure helpers: text per subsection
// pages: cleaned line arrays for pages [from..]; subs: the part's subsections (ordered). Returns sections with text.
export function segmentSections(pages, from, subs, { partTitle = '' } = {}) {
  const flat = []; pages.forEach((L, k) => joinRows(L).forEach(r => flat.push({ page: from + k, li: r.li, text: r.text, mono: r.mono })));   // a table row is one line
  const find = (title, page, num) => {
    const want = normT(title).slice(0, 40); if (!want) return -1;
    let idx = flat.findIndex(f => f.page === page && normT(f.text).startsWith(want));
    if (idx < 0 && num) idx = flat.findIndex(f => f.page === page && normT(f.text).startsWith(normT(num)) && normT(f.text).includes(want.split(' ').slice(1, 4).join(' ')));
    if (idx < 0) idx = flat.findIndex(f => f.page >= page && f.page <= page + 1 && want.length >= 8 && normT(f.text).includes(want.slice(0, 28)));
    return idx;
  };
  const partHead = partTitle ? find(partTitle, from, '') : -1;
  const starts = subs.map((s, k) => {
    if (s.intro) { const h = find(s.head || s.title.replace(/ \(opening\)$/, ''), s.startPage, ''); return h >= 0 ? h + 1 : -1; }
    if (s.synthetic) return k === 0 && partHead >= 0 ? partHead : -1;
    return find(s.title, s.startPage, s.num);
  });
  // not found: the first line of its first page
  subs.forEach((s, k) => { if (starts[k] < 0) starts[k] = Math.max(0, flat.findIndex(f => f.page >= s.startPage)); });
  for (let k = 1; k < starts.length; k++) if (starts[k] < starts[k - 1]) starts[k] = starts[k - 1];
  return subs.map((s, k) => {
    const a = starts[k], b = k + 1 < subs.length ? starts[k + 1] : flat.length;
    const text = linesText(flat.slice(a, b));
    const lastPage = b > a ? flat[b - 1].page : s.startPage;
    return { id: s.id, num: s.num || '', title: s.title, level: s.level, startPage: s.startPage, endPage: Math.max(s.startPage, lastPage), ...(s.intro ? { intro: true } : {}), ...(s.synthetic ? { synthetic: true } : {}), text, inventory: inventory(text) };
  });
}
// Text of a run of lines: "[page n]" markers, and code (monospace lines) fenced as ```r / ```python / ```code blocks so the
// prompt and the quality gate see code as code (explained line by line), never as prose or as a picture.
export function linesText(rows) {
  let text = '', pg = null, inCode = false;
  const close = () => { if (inCode) { text += '```\n'; inCode = false; } };
  for (const f of rows) {
    if (f.page !== pg) { close(); text += `\n[page ${f.page}]\n`; pg = f.page; }
    if (f.mono && !inCode) { text += '```code\n'; inCode = true; } else if (!f.mono) close();
    text += f.text + '\n';
  }
  close();
  text = text.replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2').trim();
  // a lone short line in a code face (a file name, a column name) is inline code, not a code block
  return text.replace(/```code\n([\s\S]*?)```\n?/g, (m, body) => { const L = body.trim().split('\n'); if (L.length === 1 && L[0].split(/\s+/).length <= 4 && !/[()<=$\[\]{}#~]|^\[1\]/.test(L[0])) return '`' + L[0].trim() + '`\n'; return '```' + codeLang(body) + '\n' + body + '```\n'; }).trim();
}
export function codeLang(body) {
  const b = String(body || '');
  // a list of function names (a cheat sheet row: "dbinom()   dpois()   dnorm()") is names, not a program
  if (b.trim().split('\n').every(l => /^(\s*[\w.]+\(\)\s*)+$/.test(l))) return 'names';
  if (/<-|\blibrary\(|\bc\(|\$\w|^\[1\]|\bna\.rm\b|\bdata\.frame\(|~|\b(t\.test|wilcox\.test|chisq\.test|shapiro\.test|lm|glm|aov|summary|coef|seq|rep|read\.csv|table|plot|hist|boxplot|[dpqr](binom|pois|norm|unif))\(/m.test(b)) return 'r';
  if (/^\s*(import|from\s+\S+\s+import|def |print\()|\bnp\.|\bpd\./m.test(b)) return 'python';
  return 'code';
}
// What a subsection contains, counted from its text. Used as the coverage checklist and to judge resolution.
const UNIT = '(?:m|cm|mm|km|nm|µm|s|ms|min|h|kg|g|mg|N|kN|J|kJ|eV|W|kW|MW|Pa|kPa|hPa|bar|atm|K|°C|°F|°|rad|Hz|kHz|V|mV|A|mA|Ω|C|F|T|mol|M|L|mL|%|m/s|m/s²|m/s2|km/h|N/m|kg/m³|J/K|dB|\\$|€|£|USD|EUR|years?|days?)';
const QTY_RE = new RegExp('(?:^|[\\s(=≈~])[−-]?\\d+(?:[.,]\\d+)?(?:\\s?[×x]\\s?10\\^?[−-]?\\d+)?\\s?' + UNIT + '(?![\\p{L}])', 'gu');
export function inventory(text) {
  const t = String(text || ''), lines = t.split('\n');
  const uniq = a => [...new Set(a)];
  // code blocks separated only by a label or two (an infographic interleaves code with its call-outs) count as one
  const codeBlocks = (() => { const parts = t.split(/```(?:r|python|code)\n[\s\S]*?```/); let n = 0; for (let i = 1; i < parts.length; i++) { const gap = parts[i - 1]; if (i === 1 || gap.replace(/\[page \d+\]/g, '').trim().length > 150 || gap.trim().split('\n').filter(Boolean).length > 3) n++; } return n; })(), codeLines = (t.match(/```(?:r|python|code)\n([\s\S]*?)```/g) || []).reduce((a, b) => a + b.split('\n').length - 2, 0);
  const figs = uniq((t.match(/\b(?:Figure|Fig\.)\s*[A-Z]?\d{1,3}(?:[.\-–]\d{1,3}){0,2}[a-z]?/g) || []).map(s => s.replace(/^Fig\.\s*/, 'Figure ').replace(/\s+/, ' ')));
  const tabs = uniq((t.match(/\bTable\s*[A-Z]?\d{1,3}(?:[.\-–]\d{1,3}){0,2}/g) || []).map(s => s.replace(/\s+/, ' ')));
  // worked examples are counted where they start (line start or after a sentence), not where they are mentioned
  const examples = uniq((t.match(/(?:^|\n|[.!?]\s+)(?:Example|Worked example|Exercise|Problem|Sample problem|Case study|Beispiel|Exemple|Пример)\s*[A-Z]?\d{1,3}(?:[.\-–]\d{1,3}){0,2}(?=[.:\s—–-])/gi) || []).map(s => s.replace(/^[\s\S]*?(?=[A-ZП])/, '').replace(/\s+/g, ' ').replace(/[.:]$/, '')));
  const defs = (t.match(/\b(?:Definition|Theorem|Lemma|Corollary|Proposition|Axiom|Postulate|Law of|Principle of|is defined as|we define|is called)\b/gi) || []).length;
  const eqs = t.replace(/```[\s\S]*?```/g, '').split('\n').filter(l => l.length < 140 && /[=≈≤≥∝]/.test(l) && (/[∑∫√∂∆Δπθλμσωαβγ²³^]|\b[a-zA-Z]\s*\(/.test(l) || l.replace(/[^=]/g, '').length >= 1 && l.split(/\s+/).length <= 14)).length;
  const qty = (t.match(QTY_RE) || []).length;
  const chars = t.replace(/\[page \d+\]/g, '').replace(/\s+/g, ' ').length;
  // the expected number of steps at equal or finer resolution: one per definition, example, table, figure,
  // a third of the equations, at least one per ~2,000 characters; capped so a long text is not over-split
  const expect = Math.max(1, Math.min(14, Math.max(Math.ceil(chars / 2000), defs + examples.length + tabs.length + codeBlocks + Math.ceil(eqs / 3) + Math.ceil(figs.length / 2))));
  return { chars, equations: eqs, definitions: defs, examples, figures: figs, tables: tabs, quantities: qty, ...(codeBlocks ? { code: codeBlocks, codeLines } : {}), expectSteps: expect };
}

// ---------------------------------------------------------------- sheets (infographics, posters, handout pages)
// A sheet is a page that stands on its own: a big title near the top (often beside a large sheet number "01"), and
// panels or cards laid out in columns, each with a heading in a bigger or bolder face. Reading order in such a PDF is the
// order of drawing, not of reading, so panel text is assigned by geometry: each line belongs to the nearest panel heading
// above it whose column holds it. sheetLayout works on one page's cleaned lines (PDF space, y up).
const letters3 = t => (String(t).match(/\p{L}/gu) || []).length >= 3, words2 = t => letters3(t) && /\p{L}{2}/u.test(t);
const firstSentence = t => { const m = String(t).match(/^(.{6,}?[.?!])\s+\S/); return (m && m[1].length < t.length - 3 ? m[1] : t).trim(); };
export function sheetLayout(L, body) {
  if (!L || !L.length) return null;
  const top = Math.max(...L.map(l => l.y + l.size));
  // the title: the largest line with words in the top band of the page (not code, not the sheet number)
  const cand = L.map((l, i) => ({ l, i })).filter(({ l }) => !l.mono && letters3(l.text) && l.text.length <= 80 && l.size >= body * 1.9 && l.y >= top - Math.max(140, l.size * 5));
  if (!cand.length) return null;
  const T = cand.sort((a, b) => b.l.size - a.l.size || b.l.y - a.l.y)[0];
  const numLine = L.find(l => /^\d{1,3}(\s+\d{1,3})?$/.test(l.text) && l.size >= body * 2.5 && Math.abs(l.y - T.l.y) < l.size * 1.5);
  const num = numLine ? String(+numLine.text.split(/\s+/)[0]) : '';
  // the subtitle: up to two lines right below the title in a smaller face
  const sub = new Set(), below = L.map((l, i) => ({ l, i })).filter(({ l }) => l.y < T.l.y && !l.mono && Math.abs(l.x - T.l.x) < 40).sort((a, b) => b.l.y - a.l.y);
  let prevY = T.l.y, s0 = null;
  for (const { l, i } of below) { if (sub.size >= 2 || prevY - l.y > Math.max(T.l.size * 1.4, l.size * 2.6) || l.size >= T.l.size * .6 || (s0 != null && Math.abs(l.size - s0) > .4)) break; sub.add(i); s0 = l.size; prevY = l.y; }
  const headText = l => (l.lead && words2(l.lead) ? l.lead : l.text);
  const isHead = (l, i) => i !== T.i && !sub.has(i) && !l.mono && l.size >= body * 1.15 && l.size <= T.l.size * .85 && words2(headText(l)) && headText(l).length <= 110 && l.y < T.l.y && !/^sources?:/i.test(l.text) && !/^[\d\s.,:%+\-−×]+$/.test(l.text);
  const heads = [];
  L.forEach((l, i) => { if (!isHead(l, i)) return; const raw = l.lead && letters3(l.lead) ? l.lead : firstSentence(l.text); const m = raw.match(/^(\d{1,2})[.)]?\s+(\S.*)$/); heads.push({ i, x: l.x, y: l.y, size: l.size, text: raw.replace(/\s+/g, ' ').trim(), num: m ? m[1] : '' }); });
  // a heading set on two lines ("Measured" / "data") is one heading
  for (let a = 0; a < heads.length; a++) for (let b = 0; b < heads.length; b++) { const A = heads[a], B = heads[b]; if (!A || !B || A === B || A.merged || B.merged) continue; if (Math.abs(A.size - B.size) < .35 && Math.abs(A.x - B.x) < 4 && A.y > B.y && A.y - B.y < A.size * 1.7 && !B.num) { A.text += ' ' + B.text; A.also = (A.also || []).concat(B.i); B.merged = true; } }
  for (let k = heads.length - 1; k >= 0; k--) if (heads[k].merged) heads.splice(k, 1);
  // the right edge of a heading's column: the next heading to its right on (about) the same band
  // a heading's column: halfway to its neighbours on the same band (card text often starts left of its heading, under an icon)
  heads.forEach(h => { const band = heads.filter(o => o !== h && Math.abs(o.y - h.y) < Math.max(h.size, o.size) * 1.6), R = band.filter(o => o.x > h.x + 20).map(o => o.x), Lx = band.filter(o => o.x < h.x - 20).map(o => o.x);
    h.right = R.length ? (h.x + Math.min(...R)) / 2 + 14 : Infinity; h.left = Lx.length ? (h.x + Math.max(...Lx)) / 2 + 14 : h.x - 70; });
  heads.sort((a, b) => (Math.abs(a.y - b.y) < 6 ? a.x - b.x : b.y - a.y));
  // numbered panels (cards 1–6, checklist groups 1–9) are read in their own order, whatever the column layout
  if (heads.filter(h => h.num).length >= 3) { const slots = heads.map((h, k) => h.num ? k : -1).filter(k => k >= 0), nums = slots.map(k => heads[k]).sort((a, b) => +a.num - +b.num); slots.forEach((k, j) => { heads[k] = nums[j]; }); }
  const assign = L.map((l, i) => {
    if (i === T.i || sub.has(i) || (numLine && l === numLine) || l.y > T.l.y + T.l.size * .3 || /^\d{1,3}\s*\/\s*\d{1,3}$/.test(l.text)) return -2;   // title block, running head, "05 / 07"
    if (/^sources?:/i.test(l.text)) return -1;                                // the sheet's own source line goes with its opening
    const k = heads.findIndex(h => h.i === i || (h.also && h.also.includes(i))); if (k >= 0) return k;
    let best = -1, bd = Infinity;
    heads.forEach((h, k2) => { const d = h.y - l.y; if (d >= -1 && d < bd && l.x >= h.left - 14 && l.x < h.right - 4) { bd = d; best = k2; } });
    return best;
  });
  return { title: T.l.text, size: T.l.size, num, subtitle: [...sub].map(i => L[i].text).join(' '), heads, assign };
}
// Is this document a set of sheets? (no outline; most pages carry their own big title; titles differ)
export function looksLikeSheets(clean, body) {
  if (!clean.length || clean.length > 80) return null;
  const lay = clean.map(L => sheetLayout(L, body));
  const titled = lay.filter(Boolean), distinct = new Set(titled.map(x => normT(x.title)));
  return titled.length >= Math.max(2, Math.ceil(clean.length * .6)) && distinct.size >= titled.length * .8 ? lay : null;
}
// One part per sheet (a page without a title continues the sheet before it); its panels are the subsections, in
// reading order (top to bottom, left to right). Ids: a numbered panel k on sheet n is "<n>.<k>", an unnumbered one
// "p<page>-<k>", the sheet's opening text (subtitle, the parts above the first panel, its source line) "<n>.0".
export function sheetParts(lay, clean, first = 1, body = 10) {
  const parts = [];
  lay.forEach((S, k) => {
    const page = first + k;
    if (!S) { if (parts.length) parts[parts.length - 1].endPage = page; return; }
    const num = S.num || '', base = num || 'p' + page;
    const intro = clean[k].some((l, i) => S.assign[i] === -1) ? [{ id: base + '.0', num: '', title: S.title + ' (opening)', level: 2, startPage: page, endPage: page, intro: true, head: S.title, sheet: true }] : [];
    const subs = S.heads.map((h, j) => ({ id: h.num && num ? `${num}.${h.num}` : `p${page}-${j + 1}`, num: h.num && num ? `${num}.${h.num}` : '', title: h.text, level: 2, startPage: page, endPage: page, sheet: true }));
    parts.push({ title: (num ? num.padStart(2, '0') + ' · ' : '') + S.title, num, level: 1, startPage: page, endPage: page, sheet: true, body, ...(S.subtitle ? { summary: S.subtitle } : {}), subsections: [...intro, ...subs] });
  });
  parts.forEach(p => ensureSubsections(p));
  return parts;
}
// The text of each panel of a sheet part: lines grouped by sheetLayout, each group read top to bottom, left to right.
// Returns the sections in the part's subsection order, with each panel's bounding box (for cutting panel figures).
export function sheetSections(pages, from, part, body) {
  const out = new Map(); const subs = part.subsections || [];
  pages.forEach((L, k) => {
    const page = from + k, S = sheetLayout(L, body); if (!S) { // a continuation page: everything goes to the last subsection
      const last = subs[subs.length - 1]; if (last) { const g = out.get(last.id) || { rows: [], box: null, page }; L.forEach(l => g.rows.push({ ...l, page })); out.set(last.id, g); } return; }
    const pick = idx => { if (idx === -1) return subs.find(s => s.intro && s.startPage === page) || subs.find(s => s.startPage === page); const h = S.heads[idx]; const want = normT(h.text); return subs.find(s => s.startPage === page && normT(s.title) === want) || subs.filter(s => s.startPage === page && !s.intro)[idx] || null; };
    L.forEach((l, i) => { const a = S.assign[i]; if (a === -2) return; const s = pick(a); if (!s) return; const g = out.get(s.id) || { rows: [], box: null, page }; g.rows.push({ ...l, page }); if (l.text.length <= 45) { const b = [l.x, l.y - l.size * .35, l.x1, l.y + l.size]; g.box = g.box ? union(g.box, b) : b; } out.set(s.id, g); });
  });
  return subs.map(s => {
    const g = out.get(s.id) || { rows: [], box: null, page: s.startPage };
    const rows = g.rows.slice().sort((a, b) => a.page - b.page || (Math.abs(a.y - b.y) < 2 ? a.x - b.x : b.y - a.y));
    const joined = []; rows.forEach(r => { const p = joined[joined.length - 1]; if (p && p.page === r.page && Math.abs(p.y - r.y) < 2) { p.text += (p.mono && r.mono ? '   ' : ' | ') + r.text; p.mono = p.mono && !!r.mono; } else joined.push({ page: r.page, y: r.y, text: r.text, mono: !!r.mono }); });
    const text = linesText(joined);
    return { id: s.id, num: s.num || '', title: s.title, level: s.level, startPage: s.startPage, endPage: s.endPage, sheet: true, ...(s.intro ? { intro: true } : {}), ...(g.box ? { box: g.box.map(v => +v.toFixed(1)), boxPage: g.page } : {}), text, inventory: inventory(text) };
  });
}

// ---------------------------------------------------------------- splitting the book
async function outlineNodes(doc) {
  const ol = await doc.getOutline().catch(() => null); if (!ol || !ol.length) return null;
  const items = [];
  const walk = async (arr, depth) => { for (const o of arr) { let page = null; try { const dest = typeof o.dest === 'string' ? await doc.getDestination(o.dest) : o.dest; if (dest && dest[0]) page = typeof dest[0] === 'number' ? dest[0] + 1 : (await doc.getPageIndex(dest[0])) + 1; } catch (e) { } const title = (o.title || '').replace(/\s+/g, ' ').trim(); if (title) items.push({ title, page, depth }); if (o.items && o.items.length && depth < 4) await walk(o.items, depth + 1); } };
  await walk(ol, 0);
  const valid = items.filter(i => i.page); if (valid.length < 2) return null;
  // depth 0 → level: chapters are the shallowest depth with ≥ 2 non-front/back entries
  const d0 = [0, 1, 2].find(d => valid.filter(i => i.depth === d && !FRONT_BACK.test(i.title)).length >= 2) ?? 0;
  return valid.map(i => { const h = parseHeading(i.title); return { title: i.title, num: h && h.num || '', level: i.depth - d0 + 1, page: i.page, line: null, from: 'outline', ...(FRONT_BACK.test(i.title) ? { matter: true } : {}) }; }).filter(n => n.level >= 1);
}
function contentsNodes(clean, n, labels) {
  const toc = [];
  clean.slice(0, 24).forEach(L => { if (!isContentsPage(L)) return; L.forEach((l, k) => {
    let m = l.text.match(/^(.{3,110}?)[\s.·…]{2,}(\d{1,4})$/);
    if (!m && L[k + 1] && /^\d{1,4}$/.test(L[k + 1].text) && Math.abs(L[k + 1].y - l.y) < 2) m = [0, l.text, L[k + 1].text];
    if (m && !FRONT_BACK.test(m[1])) { const h = parseHeading(m[1].trim()) || { num: '', level: l.x > (L[0].x + 8) ? 2 : 1 }; toc.push({ title: m[1].trim(), printed: +m[2], num: h.num, level: h.level || 1 }); }
  }); });
  if (toc.length < 3) return null;
  const offsetGuess = (() => { for (let i = 0; i < clean.length; i++) if (!isContentsPage(clean[i]) && clean[i].some(l => normT(l.text).startsWith(normT(toc[0].title).slice(0, 24)))) return i + 1 - toc[0].printed; return 0; })();
  const phys = p => { if (labels) { const k = labels.indexOf(String(p)); if (k >= 0) return k + 1; } return clamp(p + offsetGuess, 1, n); };
  return toc.map(t => ({ title: t.title, num: t.num, level: t.level, page: phys(t.printed), line: null, from: 'contents' })).sort((a, b) => a.page - b.page || cmpNum(a.num || '0', b.num || '0'));
}
export async function splitBook(blob, { onProgress, maxPartPages = MAX_PART_PAGES } = {}) {
  const doc = await openPDF(blob), n = doc.numPages;
  const result = { pages: n, parts: [], method: 'none', title: await pdfTitle(blob) };
  const ol = await outlineNodes(doc);
  const olDepth = ol ? Math.max(...ol.map(o => o.level)) : 0;
  // scan pages for headings (bounded for very long books); font names (bold) cost an operator list per page
  const scanN = Math.min(n, 900), fonts = scanN <= 300;
  const pages = await readPages(doc, 1, scanN, { fonts, onProgress });
  const clean = stripFurniture(pages);
  const heads = detectHeadings(clean);
  let nodes = null, sheets = null;
  if (ol && ol.length >= 2) {
    result.method = 'outline';
    // the outline is authoritative for its levels; headings add deeper levels inside each outline entry
    const deeper = heads.filter(h => h.level > olDepth && h.level > 0);
    const have = new Set(ol.map(o => normT(o.title)));
    nodes = [...ol, ...deeper.filter(h => !have.has(normT(h.title)))].sort((a, b) => a.page - b.page || (a.line ?? -1) - (b.line ?? -1) || a.level - b.level);
    // place outline entries before headings found on the same page (outline line unknown → first)
    nodes.forEach(nd => { if (nd.from === 'outline') { const h = heads.find(x => x.page === nd.page && normT(x.title).startsWith(normT(nd.title).slice(0, 30))); nd.line = h ? h.line : 0; } });
    nodes.sort((a, b) => a.page - b.page || a.line - b.line || a.level - b.level);
  } else if (scanN === n && (sheets = looksLikeSheets(clean, bodySize(pages)))) {
    result.method = 'sheets'; result.parts = sheetParts(sheets, clean, 1, bodySize(pages)); return result;
  } else if (heads.filter(h => h.level >= 1).length >= 2) {
    result.method = 'headings'; nodes = heads.filter(h => h.level >= 1 || h.kind === 'chapter');
  } else {
    let labels = null; try { labels = await doc.getPageLabels(); } catch (e) { }
    const toc = contentsNodes(clean, n, labels);
    if (toc) { result.method = 'contents'; nodes = toc; }
  }
  if (nodes && nodes.length >= 2) { result.parts = buildParts(nodes, n, { maxPartPages }); if (result.parts.length >= 1) return result; }
  result.method = 'windows'; const W = n <= 30 ? Math.max(4, Math.ceil(n / 4)) : 20;
  for (let s = 1; s <= n; s += W) result.parts.push(ensureSubsections({ title: `Pages ${s}–${Math.min(n, s + W - 1)}`, num: '', level: 1, startPage: s, endPage: Math.min(n, s + W - 1), lowConfidence: true }));
  return result;
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
export async function partText(blob, from, to, maxChars = 180000) {
  const doc = await openPDF(blob); const pages = [];
  for (let i = from; i <= Math.min(to, doc.numPages); i++) pages.push(await pageLines(doc, i));
  const clean = stripFurniture(pages); let out = '';
  clean.forEach((L, k) => { out += `\n[page ${from + k}]\n` + joinRows(L).map(l => l.text).join('\n').replace(/(\w)-\n(\w)/g, '$1$2'); });
  return out.slice(0, maxChars);
}
// The part's text split per subsection. Parts imported before subsections existed get their headings detected now.
export async function partSections(blob, part, { maxChars = 180000 } = {}) {
  const doc = await openPDF(blob), from = Math.max(1, part.startPage || 1), to = Math.min(doc.numPages, part.endPage || from);
  // read a little context around the part so running heads are recognised on short parts
  const ctxA = Math.max(1, from - 2), ctxB = Math.min(doc.numPages, to + 2);
  const pages = await readPages(doc, ctxA, ctxB, { fonts: to - from <= 120 });
  const clean = stripFurniture(pages).slice(from - ctxA, from - ctxA + (to - from + 1));
  if (part.sheet) {
    const sections = sheetSections(clean, from, part, part.body || bodySize(pages));
    let text = ''; sections.forEach(s => { text += `\n=== [${s.id}] ${s.title} (p. ${s.startPage}${s.endPage > s.startPage ? '–' + s.endPage : ''}) ===\n${s.text}\n`; });
    return { sections, text: text.slice(0, maxChars), truncated: text.length > maxChars };
  }
  let subs = part.subsections && part.subsections.length ? part.subsections.map(s => ({ ...s })) : null;
  if (!subs || subs.every(s => s.synthetic)) {
    const heads = detectHeadings(clean, { first: from, body: bodySize(pages) }).filter(h => h.level >= 1);
    const lv = heads.length ? Math.min(...heads.map(h => h.level)) : 0;
    // the part's own heading (first line, top level) is not one of its subsections
    const inner = heads.filter((h, k) => !(k === 0 && h.page === from && h.line <= 1 && heads.filter(x => x.level === lv).length === 1));
    if (inner.length) { const pseudo = buildParts([{ title: part.title, num: part.num || '', level: Math.max(0, Math.min(...inner.map(h => h.level)) - 1), page: from, line: 0 }, ...inner], to, { maxPartPages: 1e9 }); const p = pseudo.find(x => !x.front); subs = p ? p.subsections : null; if (subs) subs.forEach(s => { s.startPage = Math.max(from, s.startPage); }); }
    if (!subs || !subs.length) subs = ensureSubsections({ ...part, subsections: [] }).subsections;
  }
  const sections = segmentSections(clean, from, subs, { partTitle: part.title });
  let text = ''; sections.forEach(s => { text += `\n=== [${s.id}] ${s.title} (p. ${s.startPage}${s.endPage > s.startPage ? '–' + s.endPage : ''}) ===\n${s.text}\n`; });
  return { sections, text: text.slice(0, maxChars), truncated: text.length > maxChars };
}
export async function pageImages(blob, from, to, max = 4) {
  const doc = await openPDF(blob), out = [];
  for (let i = from; i <= Math.min(to, doc.numPages) && out.length < max; i++) { const pg = await doc.getPage(i), vp = pg.getViewport({ scale: 1.5 }), c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise; out.push(await new Promise(r => c.toBlob(r, 'image/jpeg', .85))); }
  return out;
}

// ---------------------------------------------------------------- figures
// "Figure 3.2" → fig-3-2, "Figure 3.2a" → fig-3-2a, "Table 1.1" → tab-1-1; unnumbered: fig-p<page>-<k> or, for a
// table, tab-p<page>-<k> (k counts the page's unnumbered figures, or tables, from 1). Same rule in the prompts.
export function figureId(label, page, k, kind) {
  const m = String(label || '').match(CAPTION_RE);
  if (m) { const kd = /^(table|tab|tabelle|tabla|таблица)/i.test(m[1]) ? 'tab' : 'fig'; return kd + '-' + m[2].toLowerCase().replace(/[^a-z0-9]+/g, '-'); }
  return `${kind === 'table' ? 'tab' : 'fig'}-p${page}-${k || 1}`;
}
const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const boxOf = (m, x0, y0, x1, y1) => { const P = [apply(m, x0, y0), apply(m, x1, y0), apply(m, x0, y1), apply(m, x1, y1)]; return [Math.min(...P.map(p => p[0])), Math.min(...P.map(p => p[1])), Math.max(...P.map(p => p[0])), Math.max(...P.map(p => p[1]))]; };
const area = b => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
const grow = (b, d) => [b[0] - d, b[1] - d, b[2] + d, b[3] + d];
const hits = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
const union = (a, b) => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
// Regions drawn by one page's operator list, in PDF user space: raster images (with the CTM they are painted
// under) and clusters of vector paths. `view` = page.view [x0,y0,x1,y1].
export function opRegions(fnArray, argsArray, OPS, view) {
  const pw = view[2] - view[0], ph = view[3] - view[1], pageA = pw * ph;
  let ctm = [1, 0, 0, 1, 0, 0]; const stack = [];
  const images = [], paths = [];
  for (let i = 0; i < fnArray.length; i++) {
    const f = fnArray[i], a = argsArray[i];
    if (f === OPS.save) stack.push(ctm);
    else if (f === OPS.restore) ctm = stack.pop() || [1, 0, 0, 1, 0, 0];
    else if (f === OPS.transform) ctm = mul(ctm, a);
    else if (f === OPS.paintFormXObjectBegin) { stack.push(ctm); if (a && a[0]) ctm = mul(ctm, a[0]); }
    else if (f === OPS.paintFormXObjectEnd) ctm = stack.pop() || ctm;
    else if (f === OPS.paintImageXObject || f === OPS.paintInlineImageXObject || f === OPS.paintImageMaskXObject || f === OPS.paintJpegXObject || f === OPS.paintSolidColorImageMask) images.push(boxOf(ctm, 0, 0, 1, 1));
    else if (f === OPS.paintImageXObjectRepeat || f === OPS.paintImageMaskXObjectRepeat) images.push(boxOf(ctm, 0, 0, 1, 1));
    else if (f === OPS.constructPath && a && a[2] && a[2].length >= 4) { const [x0, x1, y0, y1] = a[2]; if (isFinite(x0) && isFinite(y0)) paths.push(boxOf(ctm, x0, y0, x1, y1)); }
  }
  const clip = b => [Math.max(view[0], b[0]), Math.max(view[1], b[1]), Math.min(view[2], b[2]), Math.min(view[3], b[3])];
  const imgs = images.map(clip).filter(b => b[2] - b[0] >= pw * .06 && b[3] - b[1] >= ph * .03);
  const scanned = imgs.some(b => area(b) > pageA * .8);
  // vector clusters on a 5 pt occupancy grid (linear in the number of paths; a chart can have 20,000 of them):
  // mark each path's box, dilate by 2 cells (10 pt), take connected components. Page-sized frames are ignored.
  const P = paths.map(clip).filter(b => b[2] >= b[0] && b[3] >= b[1] && area(b) < pageA * .7);
  const C = 5, gw = Math.ceil(pw / C) + 1, gh = Math.ceil(ph / C) + 1, occ = new Uint8Array(gw * gh), lab = new Int32Array(gw * gh).fill(-1);
  const cell = (x, y) => [clamp(Math.floor((x - view[0]) / C), 0, gw - 1), clamp(Math.floor((y - view[1]) / C), 0, gh - 1)];
  for (const b of P) { const [i0, j0] = cell(b[0], b[1]), [i1, j1] = cell(b[2], b[3]); for (let j = Math.max(0, j0 - 2); j <= Math.min(gh - 1, j1 + 2); j++) for (let i = Math.max(0, i0 - 2); i <= Math.min(gw - 1, i1 + 2); i++) occ[j * gw + i] = 1; }
  let nl = 0; const qx = new Int32Array(gw * gh);
  for (let s0 = 0; s0 < occ.length; s0++) { if (!occ[s0] || lab[s0] >= 0) continue; let h = 0, t = 0; qx[t++] = s0; lab[s0] = nl; while (h < t) { const s1 = qx[h++], i = s1 % gw, j = (s1 / gw) | 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= gw || jj >= gh) continue; const s2 = jj * gw + ii; if (occ[s2] && lab[s2] < 0) { lab[s2] = nl; qx[t++] = s2; } } } nl++; }
  const comp = new Map();
  for (const b of P) { const [i, j] = cell((b[0] + b[2]) / 2, (b[1] + b[3]) / 2), L = lab[j * gw + i]; if (L < 0) continue; const c = comp.get(L); const thin = (b[3] - b[1] < 1.5 || b[2] - b[0] < 1.5) ? 1 : 0; if (c) { c.box = union(c.box, b); c.n++; c.thin += thin; } else comp.set(L, { box: b.slice(), n: 1, thin }); }
  const vectors = [...comp.values()].filter(c => c.n >= 6 && c.box[2] - c.box[0] >= 60 && c.box[3] - c.box[1] >= 40).map(c => ({ box: c.box, n: c.n, rules: c.thin / c.n > .9 }));
  return { images: scanned ? [] : imgs, vectors, scanned, paths: P };
}
// Caption lines ("Figure 2.1: …") with their continuation lines. lines: one page's lines (PDF space).
export function findCaptions(lines) {
  const out = [];
  lines.forEach((l, k) => {
    const m = l.text.match(CAPTION_RE); if (!m) return;
    // a caption starts a line and is followed by text (or is short); a mention inside a sentence is not a caption
    if (k > 0 && Math.abs(lines[k - 1].y - l.y) < 2) return;
    const rest = m[4] || ''; if (!rest && m[3] !== '.' && m[3] !== ':') return;
    if (/^(shows|show|illustrates|gives|lists|summari[sz]es|compares|reports|contains|presents|displays|plots|depicts|is|are|and|in|of|on|we|the\s+\w+\s+(?:shows|gives))\b/i.test(rest) && !/[:.]/.test(m[3])) return;
    let text = l.text, box = [l.x, l.y - l.size * .3, l.x1, l.y + l.size], j = k + 1;
    // continuation lines: close below, same size, not a row of table cells, not after a finished short caption
    const rowOfCells = q => lines.some((o, i) => i !== q && Math.abs(o.y - lines[q].y) < 2);
    while (j < lines.length && j <= k + 5) { const n = lines[j]; if (n.gap > 1.9 || CAPTION_RE.test(n.text) || n.size > l.size * 1.15 || n.size < l.size * .8 || rowOfCells(j) || Math.abs(n.x - l.x) > 60 && n.x > l.x1 || /[.!?]$/.test(text) && (n.x1 - n.x) < (l.x1 - l.x) * .4) break; text += ' ' + n.text; box = union(box, [n.x, n.y - n.size * .3, n.x1, n.y + n.size]); j++; }
    const kind = /^(table|tab|tabelle|tabla|таблица)/i.test(m[1]) ? 'table' : 'figure';
    const label = (kind === 'table' ? 'Table ' : 'Figure ') + m[2];
    out.push({ kind, label, num: m[2], caption: text.replace(/\s+/g, ' ').trim(), box, line: k, lastLine: j - 1 });
  });
  return out;
}
// Pair caption ↔ region; fall back to the gap above a caption; keep large uncaptioned images.
export function pairFigures({ images, vectors }, captions, lines, view, page) {
  const pw = view[2] - view[0], ph = view[3] - view[1];
  const regions = [...images.map(b => ({ box: b, src: 'image' })), ...vectors.map(v => ({ box: v.box, src: v.rules ? 'rules' : 'vector', n: v.n }))];
  // merge regions that overlap or nearly touch (sub-figures a, b, c)
  let again = true; while (again) { again = false; for (let i = 0; i < regions.length && !again; i++) for (let j = i + 1; j < regions.length; j++) if (hits(grow(regions[i].box, 8), regions[j].box)) { regions[i] = { box: union(regions[i].box, regions[j].box), src: regions[i].src === 'image' || regions[j].src === 'image' ? 'image' : regions[i].src === 'rules' && regions[j].src === 'rules' ? 'rules' : 'vector' }; regions.splice(j, 1); again = true; break; } }
  // short text lines inside or right beside a vector region are its labels: include them
  regions.forEach(r => { if (r.src === 'image') return; lines.forEach(l => { const b = [l.x, l.y - l.size * .3, l.x1, l.y + l.size]; if (l.text.length <= 40 && !CAPTION_RE.test(l.text) && hits(grow(r.box, 14), b)) r.box = union(r.box, b); }); });
  // frames and sidebars hold running text; tables are rules with many text cells; a graph grid has few labels
  regions.forEach(r => { if (r.src === 'image') return; const inside = lines.filter(l => !CAPTION_RE.test(l.text) && hits(r.box, [l.x, l.y, l.x1, l.y + l.size * .7])); r.texty = inside.filter(l => l.text.length >= 50).length >= 3; r.cells = inside.length; if (r.src === 'rules' && r.cells < 4) r.src = 'vector'; });
  const used = new Set(), figs = [];
  const colX0 = lines.length ? Math.min(...lines.map(l => l.x)) : view[0] + 50, colX1 = lines.length ? Math.max(...lines.map(l => l.x1)) : view[2] - 50;
  for (const c of captions) {
    let best = null;
    regions.forEach((r, i) => {
      if (used.has(i)) return; if (c.kind === 'figure' && (r.src === 'rules' || r.texty)) return;
      const ov = Math.min(r.box[2], c.box[2]) - Math.max(r.box[0], c.box[0]), narrow = Math.min(r.box[2] - r.box[0], c.box[2] - c.box[0]);
      if (ov < narrow * .25 && !(c.kind === 'table')) return;
      const above = r.box[1] - c.box[3], below = c.box[1] - r.box[3];  // >0: region above / below the caption
      const d = above >= -4 ? above : below >= -4 ? below * (c.kind === 'table' ? .8 : 1.6) : 1e9;
      if (d < ph * .3 && (!best || d < best.d)) best = { i, d };
    });
    if (best) { used.add(best.i); const r = regions[best.i]; figs.push({ ...c, box: union(r.box, c.box), src: r.src }); continue; }
    // no drawn region: figure → the empty gap above the caption; table → the rows below its caption
    if (c.kind === 'figure') {
      const above = lines.filter((l, k) => k < c.line && l.y > c.box[3] + 2); const prev = above.length ? above[above.length - 1] : null;
      const top = prev ? prev.y - prev.size * .4 : view[3] - 40;
      if (top - c.box[3] >= 50) figs.push({ ...c, box: union([colX0, c.box[3], colX1, top], c.box), src: 'gap' });
      else figs.push({ ...c, box: null, src: 'caption-only' });
    } else {
      let bot = c.box[1], k = c.lastLine + 1, rows = 0; while (k < lines.length && rows < 30) { const l = lines[k]; if (l.gap > 2.4 || CAPTION_RE.test(l.text) || parseHeading(l.text) && l.size > lines[c.line].size) break; bot = l.y - l.size * .4; k++; rows++; }
      figs.push({ ...c, box: rows ? union([colX0, bot, colX1, c.box[3]], c.box) : null, src: rows ? 'table-text' : 'caption-only' });
    }
  }
  // large uncaptioned images and drawings are figures too (their label says so)
  // ruled grids with many text cells are uncaptioned tables (tab-p<page>-<k>)
  // A page-sized drawing is the page, not a figure: an uncaptioned region over 40 % of the page (an infographic's merged
  // cards, a slide template, a shaded code box) is never cut out, nor one holding many text lines (a framed text or code
  // panel; its text is already in the text layer, where it is explained, not pasted).
  const pageA = pw * ph, textIn = r => lines.filter(l => hits(r.box, [l.x, l.y, l.x1, l.y + l.size * .7]));
  let k = 0, kt = 0; regions.forEach((r, i) => {
    if (used.has(i) || r.texty) return;
    if (area(r.box) > pageA * .4) return;
    { const T = textIn(r); if (T.length >= 8 || T.reduce((a, l) => a + l.text.length, 0) >= 350 || T.filter(l => l.mono).length >= 2) return; }
    if (r.src === 'rules') { if ((r.cells || 0) >= 6 && area(r.box) >= pw * ph * .04) { kt++; figs.push({ kind: 'table', label: `Unlabelled table on p. ${page}`, num: '', caption: '', box: r.box, src: r.src, uncaptioned: true, k: kt }); } return; }
    const big = area(r.box) >= pw * ph * (r.src === 'image' ? .1 : .14); if (!big) return; k++; figs.push({ kind: 'figure', label: `Unlabelled figure on p. ${page}`, num: '', caption: '', box: r.box, src: r.src, uncaptioned: true, k });
  });
  return figs.map((f, j) => ({ ...f, page, id: f.uncaptioned ? figureId('', page, f.k, f.kind) : figureId(f.label, page, j + 1, f.kind) }));
}
// Browser: cut the figures of pages from..to out of the rendered pages. Returns records with JPEG data URLs.
export async function extractFigures(blob, from, to, { maxW = 1200, quality = .82, maxPerPart = 60, onProgress, panels = null } = {}) {
  const L = lib(), doc = await openPDF(blob), out = [], seen = new Set(), hashes = [];
  to = Math.min(to, doc.numPages);
  // pass 1: the figure regions of every page (cheap: operator lists and text, no rendering)
  const plan = [];
  for (let p = from; p <= to; p++) {
    const pg = await doc.getPage(p), view = pg.view; let ops;
    try { ops = await pg.getOperatorList(); } catch (e) { continue; }
    const tc = await pg.getTextContent(); const lines = linesFromItems(tc.items, () => false, fn => !!(tc.styles && tc.styles[fn] && tc.styles[fn].fontFamily === 'monospace'));
    const regions = opRegions(ops.fnArray, ops.argsArray, L.OPS, view);
    const figs = pairFigures(regions, findCaptions(lines), lines, view, p).filter(f => f.box);
    // panels of a sheet (an infographic page) that are drawings (a chart, a curve, a diagram), not text cards
    (panels || []).filter(q => q.page === p && q.box).forEach((q, j) => {
      const b = grow(q.box, 6), pageA = (view[2] - view[0]) * (view[3] - view[1]); if (area(b) > pageA * .4 || area(b) < pageA * .02) return;
      const inside = regions.paths.filter(r => r[0] >= b[0] - 2 && r[2] <= b[2] + 2 && r[1] >= b[1] - 2 && r[3] <= b[3] + 2).length;
      const words = lines.filter(l => hits(b, [l.x, l.y, l.x1, l.y + l.size * .7])).reduce((a, l) => a + l.text.split(/\s+/).length, 0);
      if (inside >= 25 && words <= area(b) / 900) figs.push({ kind: 'figure', label: `Panel “${String(q.title).slice(0, 60)}” on p. ${p}`, num: '', caption: q.title, box: b, src: 'panel', panel: q.id, page: p, id: `fig-p${p}-${figs.filter(f => f.uncaptioned || f.src === 'panel').length + 1}` });
    });
    plan.push({ p, pg, figs });
    if (onProgress) onProgress((p - from + 1) / (to - from + 1) * .5);
  }
  // a template graphic (a header bar, a logo) sits at the same place on many pages: furniture, never a figure
  const boxKey = f => f.box.map(v => Math.round(v / 12)).join(',');
  const boxCount = new Map(); plan.forEach(({ figs }) => new Set(figs.filter(f => f.uncaptioned).map(boxKey)).forEach(k => boxCount.set(k, (boxCount.get(k) || 0) + 1)));
  const nP = plan.length;
  // pass 2: render the pages that keep figures and cut them out; identical crops (the same picture twice) are kept once
  for (const { p, pg, figs: all } of plan) {
    if (out.length >= maxPerPart) break;
    const figs = all.filter(f => !(f.uncaptioned && nP >= 3 && boxCount.get(boxKey(f)) >= Math.max(3, nP * .4)));
    if (!figs.length) continue;
    const widest = Math.max(...figs.map(f => f.box[2] - f.box[0]));
    const scale = clamp(maxW / Math.max(widest + 16, 100), 1.4, 3.2), vp = pg.getViewport({ scale });
    const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    try { await pg.render({ canvasContext: g, viewport: vp }).promise; } catch (e) { continue; }
    for (const f of figs) {
      let id = f.id; while (seen.has(id)) id += '-b';
      const [x0, y0, x1, y1] = vp.convertToViewportRectangle(grow(f.box, 6));
      const sx = Math.max(0, Math.floor(Math.min(x0, x1))), sy = Math.max(0, Math.floor(Math.min(y0, y1))), sw = Math.min(c.width - sx, Math.ceil(Math.abs(x1 - x0))), sh = Math.min(c.height - sy, Math.ceil(Math.abs(y1 - y0)));
      if (sw < 24 || sh < 24) continue;
      const k = Math.min(1, maxW / sw), o = document.createElement('canvas'); o.width = Math.round(sw * k); o.height = Math.round(sh * k);
      o.getContext('2d').drawImage(c, sx, sy, sw, sh, 0, 0, o.width, o.height);
      const hash = aHash(o), dup = hashes.find(h => hamming(h.hash, hash) <= 3 && Math.abs(h.ar - sw / sh) < .08);
      if (dup) continue;
      seen.add(id); hashes.push({ hash, ar: sw / sh, id });
      out.push({ id, label: f.label, kind: f.kind, caption: f.caption, page: p, bbox: [sx / c.width, sy / c.height, (sx + sw) / c.width, (sy + sh) / c.height].map(v => +v.toFixed(4)), w: o.width, h: o.height, src: f.src, ...(f.panel ? { panel: f.panel } : {}), hash, dataUrl: o.toDataURL('image/jpeg', quality) });
    }
    c.width = c.height = 0;
    if (onProgress) onProgress(.5 + (p - from + 1) / (to - from + 1) * .5);
  }
  return out;
}
// 64-bit average hash of a canvas (16 hex digits), for spotting the same picture cut twice
function aHash(cv) {
  const s = document.createElement('canvas'); s.width = 8; s.height = 8; const x = s.getContext('2d'); x.drawImage(cv, 0, 0, 8, 8);
  const d = x.getImageData(0, 0, 8, 8).data, v = []; for (let i = 0; i < 64; i++) v.push(d[i * 4] * .3 + d[i * 4 + 1] * .59 + d[i * 4 + 2] * .11);
  const m = v.reduce((a, b) => a + b, 0) / 64; let h = ''; for (let i = 0; i < 64; i += 4) h += ((v[i] > m) << 3 | (v[i + 1] > m) << 2 | (v[i + 2] > m) << 1 | (v[i + 3] > m)).toString(16); return h;
}
export function hamming(a, b) { let n = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) { let x = parseInt(a[i], 16) ^ parseInt(b[i], 16); while (x) { n += x & 1; x >>= 1; } } return n; }
// Parts restricted to a page range (the Add-PDF dialog's "pages from–to"): parts outside are dropped, the others are
// clipped, and so are their subsections (a subsection outside the range is dropped; nothing inside is merged).
export function restrictParts(parts, from, to, only = null) {
  return (parts || []).filter(p => !p.front && p.endPage >= from && p.startPage <= to && (!only || only.includes(p.id || p.title))).map(p => {
    const q = { ...p, startPage: Math.max(p.startPage, from), endPage: Math.min(p.endPage, to) };
    q.subsections = (p.subsections || []).filter(s => s.endPage >= from && s.startPage <= to).map(s => ({ ...s, startPage: Math.max(s.startPage, from), endPage: Math.min(s.endPage, to) }));
    if (!q.subsections.length) delete q.subsections;
    return ensureSubsections(q);
  });
}
// metadata only (what the prompt and the room file carry; images stay in IndexedDB)
export const figureMeta = figs => (figs || []).map(f => ({ id: f.id, label: f.label, kind: f.kind, caption: f.caption, page: f.page }));
