#!/usr/bin/env node
// Builds assets/symbols.json, the searchable symbol library behind "Select symbol" (js/symbols.js), from Lucide's
// icon nodes and tags (lucide-static 1.68.0, ISC licence: tools/symbols/LICENSE-lucide.txt). Every icon becomes ONE
// path (circles, rects, lines, polylines converted), so the app draws it like its own icons: [name, d, "tag tag …"].
// node tools/build-symbols.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const N = JSON.parse(readFileSync(new URL('./symbols/lucide-icon-nodes-1.68.0.json', import.meta.url))), T = JSON.parse(readFileSync(new URL('./symbols/lucide-tags-1.68.0.json', import.meta.url)));
const f = v => +(+v).toFixed(3) + '';
const toD = ([tag, a]) => {
  if (tag === 'path') { const d = a.d.trim(); return /^m/.test(d) ? 'M0 0' + d : d; }   // a path's first 'm' counts from the origin (and the pairs after it are relative line-tos): joined into one path, 'M0 0' before it keeps both true (a lone moveto draws nothing)
  if (tag === 'circle') { const r = +a.r; return `M${f(+a.cx - r)} ${f(a.cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0`; }
  if (tag === 'ellipse') { const rx = +a.rx, ry = +a.ry; return `M${f(+a.cx - rx)} ${f(a.cy)}a${f(rx)} ${f(ry)} 0 1 0 ${f(2 * rx)} 0a${f(rx)} ${f(ry)} 0 1 0 ${f(-2 * rx)} 0`; }
  if (tag === 'line') return `M${f(a.x1)} ${f(a.y1)}L${f(a.x2)} ${f(a.y2)}`;
  if (tag === 'polyline' || tag === 'polygon') { const p = String(a.points).trim().split(/[\s,]+/).map(Number); let d = `M${f(p[0])} ${f(p[1])}`; for (let i = 2; i < p.length; i += 2) d += `L${f(p[i])} ${f(p[i + 1])}`; return tag === 'polygon' ? d + 'Z' : d; }
  if (tag === 'rect') { const x = +(a.x || 0), y = +(a.y || 0), w = +a.width, h = +a.height; let rx = +(a.rx ?? a.ry ?? 0), ry = +(a.ry ?? a.rx ?? 0); rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
    if (!rx) return `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}Z`;
    return `M${f(x + rx)} ${f(y)}h${f(w - 2 * rx)}a${f(rx)} ${f(ry)} 0 0 1 ${f(rx)} ${f(ry)}v${f(h - 2 * ry)}a${f(rx)} ${f(ry)} 0 0 1 ${f(-rx)} ${f(ry)}h${f(-(w - 2 * rx))}a${f(rx)} ${f(ry)} 0 0 1 ${f(-rx)} ${f(-ry)}v${f(-(h - 2 * ry))}a${f(rx)} ${f(ry)} 0 0 1 ${f(rx)} ${f(-ry)}Z`; }
  throw new Error('unknown element ' + tag);
};
const icons = Object.entries(N).map(([name, nodes]) => [name, nodes.map(toD).join(' '), (T[name] || []).join(' ')]);
writeFileSync(new URL('../assets/symbols.json', import.meta.url), JSON.stringify({ source: 'Lucide 1.68.0 (lucide.dev), ISC licence', count: icons.length, icons }));
console.log(icons.length + ' symbols → assets/symbols.json');
