// Save a motion figure (js/room/motion.js) as an animated GIF, entirely in the browser: each frame's SVG stages are
// drawn onto one canvas on parchment, mapped to a fixed 256-colour palette (the ink colours, a 6×6×6 cube and a warm
// grey ramp) and LZW-compressed (GIF89a, looping). 12 frames a second, 480 px wide.
const FPS = 12;
function palette() {
  const P = [];
  for (let r = 0; r < 6; r++) for (let g = 0; g < 6; g++) for (let b = 0; b < 6; b++) P.push([r * 51, g * 51, b * 51]);
  ['#2a1e15', '#5b4532', '#2d5b8e', '#9c3a28', '#3f7d6e', '#8f733a', '#6a4a8a', '#fbf6ea', '#dce7ef', '#8fb3d3', '#e6d6b0', '#b3a385', '#f4ead2'].forEach(h => P.push([parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]));
  for (let i = 0; P.length < 256; i++) { const t = i / 26; P.push([Math.round(42 + t * 209), Math.round(30 + t * 216), Math.round(21 + t * 213)]); }   /* ink → parchment */
  return P;
}
function quantizer(P) { const cache = new Int16Array(32768).fill(-1);
  return (r, g, b) => { const k = (r >> 3) << 10 | (g >> 3) << 5 | (b >> 3); let v = cache[k]; if (v >= 0) return v; let best = 0, bd = 1e9; for (let i = 0; i < P.length; i++) { const dr = P[i][0] - r, dg = P[i][1] - g, db = P[i][2] - b, d = dr * dr * 2 + dg * dg * 4 + db * db * 3; if (d < bd) { bd = d; best = i; } } cache[k] = best; return best; }; }
function lzw(idx, out) {   // GIF LZW with 8-bit minimum code size, codes packed into sub-blocks of at most 255 bytes
  const min = 8, clear = 256, eoi = 257; let size = 9, next = 258, dict = new Map(), cur = 0, bits = 0, buf = [];
  const emit = c => { cur |= c << bits; bits += size; while (bits >= 8) { buf.push(cur & 255); cur >>>= 8; bits -= 8; } };
  out.push(min); emit(clear); let w = idx[0];
  for (let i = 1; i < idx.length; i++) { const k = idx[i], key = w * 256 + k + 1; const v = dict.get(key);
    if (v !== undefined) { w = v; continue; } emit(w); if (next < 4096) { dict.set(key, next++); if (next > (1 << size) && size < 12) size++; } else { emit(clear); dict = new Map(); size = 9; next = 258; } w = k; }
  emit(w); emit(eoi); if (bits) buf.push(cur & 255);
  for (let i = 0; i < buf.length; i += 255) { const n = Math.min(255, buf.length - i); out.push(n); for (let j = 0; j < n; j++) out.push(buf[i + j]); } out.push(0);
}
const svgImage = svg => new Promise((res, rej) => { const s = svg.cloneNode(true), vb = svg.viewBox.baseVal; s.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); s.setAttribute('width', vb.width * 4); s.setAttribute('height', vb.height * 4);
  const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(s)); });
export async function saveGif(stages, dur, frame, name, onProgress) {
  const W = 480, gap = 8, aspect = stages.reduce((a, s) => a + s.svg.viewBox.baseVal.width / s.svg.viewBox.baseVal.height, 0), H = Math.round((W - gap * (stages.length + 1)) / aspect) + gap * 2 + (stages.length > 1 ? 16 : 0);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d', { willReadFrequently: true });
  const P = palette(), q = quantizer(P), bytes = [], n = Math.max(2, Math.round(dur * FPS)) + 1, delay = Math.round(100 / FPS);
  const push = (...a) => a.forEach(v => bytes.push(v)), u16 = v => push(v & 255, v >> 8);
  push(...[...'GIF89a'].map(c => c.charCodeAt(0))); u16(W); u16(H); push(0xF7, 0, 0); P.forEach(c => push(...c));
  push(0x21, 0xFF, 11, ...[...'NETSCAPE2.0'].map(c => c.charCodeAt(0)), 3, 1, 0, 0, 0);
  for (let f = 0; f < n; f++) {
    frame(f / (n - 1)); g.fillStyle = '#fbf6ea'; g.fillRect(0, 0, W, H); let x = gap;
    for (const s of stages) { const vb = s.svg.viewBox.baseVal, h = H - gap * 2 - (stages.length > 1 ? 16 : 0), w = h * vb.width / vb.height, im = await svgImage(s.svg);
      if (stages.length > 1) { const t = s.box.querySelector('.mo-title'); g.fillStyle = s.box.classList.contains('wrong') ? '#9c3a28' : '#3f7d6e'; g.font = '600 12px Georgia, serif'; g.fillText(t ? t.textContent : '', x, gap + 11); }
      g.drawImage(im, x, gap + (stages.length > 1 ? 16 : 0), w, h); x += w + gap; }
    const d = g.getImageData(0, 0, W, H).data, idx = new Uint8Array(W * H); for (let i = 0, j = 0; i < d.length; i += 4, j++) idx[j] = q(d[i], d[i + 1], d[i + 2]);
    push(0x21, 0xF9, 4, 0, ...[f === n - 1 ? 160 : delay].flatMap(v => [v & 255, v >> 8]), 0, 0); push(0x2C); u16(0); u16(0); u16(W); u16(H); push(0); lzw(idx, bytes);
    if (onProgress) onProgress((f + 1) / n); if (f % 6 === 5) await new Promise(r => setTimeout(r, 0));
  }
  push(0x3B);
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'image/gif' })), a = document.createElement('a'); a.href = url; a.download = (name || 'animation') + '.gif'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
}
