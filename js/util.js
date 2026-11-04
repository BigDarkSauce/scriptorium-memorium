// Scriptorium Memorium — shared utilities (no dependencies)
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const mod = (n, m) => ((n % m) + m) % m;
export const smooth = t => t * t * (3 - 2 * t);
export const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOut = t => 1 - Math.pow(1 - t, 3);
export const easeInOutQuint = t => (t < .5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2);
export const uid = () => Math.random().toString(36).slice(2, 10);
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const fmt = (v, d = 3) => {
  if (typeof v !== 'number') return String(v);
  if (!isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e5)) return v.toExponential(2);
  // d = the most decimals wanted; readouts also stop at about 4 significant figures (1018.3 hPa, 33.06 mm, 0.028)
  const ints = a === 0 ? 1 : Math.floor(Math.log10(a)) + 1, dec = Math.min(d, Math.max(a >= 100 && d > 0 ? 1 : 0, 4 - ints));
  return (+v.toFixed(Math.max(0, dec))).toString();
};
export function el(tag, attrs = {}, kids = []) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    const v = attrs[k];
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(kids)) if (c != null && c !== false) e.append(c);
  return e;
}
export function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

// Value noise (2D/3D) for terrain, clouds, dissolve masks
export function makeNoise(seed = 1) {
  const r = mulberry(seed), p = new Uint8Array(512), g = [];
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 256; i++) p[i + 256] = p[i];
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  const grad = (h, x, y, z) => { const u = (h & 15) < 8 ? x : y, v = (h & 15) < 4 ? y : (h & 15) === 12 || (h & 15) === 14 ? x : z; return ((h & 1) ? -u : u) + ((h & 2) ? -v : v); };
  function n3(x, y, z = 0) {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z, B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
    return lerp(lerp(lerp(grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z), u), lerp(grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z), u), v),
      lerp(lerp(grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1), u), lerp(grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1), u), v), w);
  }
  n3.fbm = (x, y, z = 0, oct = 5) => { let a = 0, f = 1, s = 0, m = 0; for (let i = 0; i < oct; i++) { s += a = (1 / f) * n3(x * f, y * f, z * f); m += 1 / f; f *= 2; } return s / m; };
  return n3;
}

// Safe maths expression compiler for AI-written formulas
export const MATHNAMES = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh', 'exp', 'log', 'log10', 'log2', 'sqrt', 'cbrt', 'abs', 'sign', 'floor', 'ceil', 'round', 'min', 'max', 'pow', 'hypot', 'PI', 'E'];
export function compile(expr, vars) {
  let s = String(expr ?? '0').replace(/\^/g, '**').replace(/π/g, 'PI').replace(/\bpi\b/g, 'PI').replace(/\bln\b/g, 'log').replace(/\be\b(?!\w)/g, 'E');
  s = s.replace(/(^|[(,=+\-*/?:])(\s*)-(\s*)(?=[A-Za-z_0-9.(][^+\-,)]*\*\*)/g, '$1$2-1*');
  if (/[^0-9a-zA-Z_+\-*/().,\s<>=?:!&|%]/.test(s)) throw new Error('Unsupported characters in ' + expr);
  const ids = s.match(/[A-Za-z_]\w*/g) || [];
  for (const id of ids) if (!MATHNAMES.includes(id) && !vars.includes(id)) throw new Error('Unknown name "' + id + '" in ' + expr);
  const f = new Function(...vars, 'const {' + MATHNAMES.join(',') + '}=Math;return (' + s + ');');
  return (...a) => { try { const v = f(...a); return typeof v === 'number' ? v : (typeof v === 'boolean' ? +v : NaN); } catch (e) { return NaN; } };
}

// Toasts (glass pills, bottom-centre)
let toastHost;
export function toast(msg, ms = 2800) {
  if (!toastHost) { toastHost = el('div', { class: 'toasts', role: 'status' }); document.body.append(toastHost); }
  const t = el('div', { class: 'toast', text: msg }); toastHost.append(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
  while (toastHost.children.length > 3) toastHost.firstChild.remove();
}

// Simple in-page confirm (the viewer frame blocks window.confirm)
export function confirmBox(text, okLabel = 'Confirm') {
  return new Promise(res => {
    const box = el('div', { class: 'modal-veil' }, [el('div', { class: 'modal glass' }, [
      el('p', { text }),
      el('div', { class: 'row end' }, [
        el('button', { class: 'btn', text: 'Cancel', onclick: () => { box.remove(); res(false); } }),
        el('button', { class: 'btn primary', text: okLabel, onclick: () => { box.remove(); res(true); } })])])]);
    document.body.append(box);
  });
}
export function promptBox(text, value = '', okLabel = 'Save') {
  return new Promise(res => {
    const inp = el('input', { type: 'text', value, class: 'field', 'aria-label': text });
    const done = v => { box.remove(); res(v); };
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') done(inp.value.trim()); if (e.key === 'Escape') done(null); });
    const box = el('div', { class: 'modal-veil' }, [el('div', { class: 'modal glass' }, [
      el('label', { text }), inp,
      el('div', { class: 'row end' }, [
        el('button', { class: 'btn', text: 'Cancel', onclick: () => done(null) }),
        el('button', { class: 'btn primary', text: okLabel, onclick: () => done(inp.value.trim()) })])])]);
    document.body.append(box); setTimeout(() => { inp.focus(); inp.select(); }, 30);
  });
}

// MathJax helper (loaded async from CDN)
export function typeset(node) {
  const go = () => window.MathJax.typesetPromise([node]).catch(() => {});
  if (window.MathJax && window.MathJax.typesetPromise) return go();
  return new Promise(r => { const iv = setInterval(() => { if (window.MathJax && window.MathJax.typesetPromise) { clearInterval(iv); go().then(r); } }, 300); setTimeout(() => { clearInterval(iv); r(); }, 15000); });
}

// ---------- GPU resource disposal (duck-typed: no three.js import here) ----------
// Collects the geometries, materials and textures an object tree uses.
export function gpuSet(roots, set = new Set()) {
  const addMat = m => { if (!m || set.has(m)) return; set.add(m); for (const k in m) { const v = m[k]; if (v && v.isTexture) set.add(v); } if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k] && m.uniforms[k].value; if (v && v.isTexture) set.add(v); } };
  [].concat(roots).forEach(r => { if (!r || !r.traverse) return; r.traverse(o => { if (o.isLight && o.shadow) set.add(o);   /* a shadow-casting light owns its shadow-map render target */ if (o.geometry) set.add(o.geometry); if (o.material) [].concat(o.material).forEach(addMat); });
    if (r.isScene) { if (r.background && r.background.isTexture) set.add(r.background); if (r.environment && r.environment.isTexture) set.add(r.environment); } });
  return set;
}
// Frees what `roots` use (object trees, or a Set from gpuSet), except what `keep` (object trees still on screen, or a Set from gpuSet) uses and anything
// marked userData.shared (module caches: textures.js originals, baroque.js materials, renderer environments).
// texture.clone() copies userData, so a clone of a cached texture also says `shared`: only the first texture object seen
// for an image (its Source) counts as the cached one; other clones are freed (the image's GPU copy stays while in use)
const CANON = new WeakMap();
const sharedRes = x => { if (!(x.userData && x.userData.shared)) return false; if (!x.isTexture || !x.source) return true; const c = CANON.get(x.source); if (!c) { CANON.set(x.source, x); return true; } return c === x; };
export function disposeTree(roots, keep = null) {
  const K = keep instanceof Set ? keep : gpuSet(keep || []);
  const S = roots instanceof Set ? roots : gpuSet(roots);
  const shared = sharedRes;
  S.forEach(x => { if (x.isMaterial && shared(x)) gpuSet({ traverse: f => f({ material: x }) }, K); });   // a cached material keeps its textures
  S.forEach(x => { if (K.has(x) || shared(x) || typeof x.dispose !== 'function') return; try { x.dispose(); } catch (e) { } });
}

// Tiny event bus
export const bus = { m: new Map(), on(k, f) { (this.m.get(k) || this.m.set(k, []).get(k)).push(f); return () => this.off(k, f); }, off(k, f) { const a = this.m.get(k); if (a) a.splice(a.indexOf(f) >>> 0, 1); }, emit(k, ...a) { (this.m.get(k) || []).slice().forEach(f => { try { f(...a); } catch (e) { console.error(e); } }); } };
