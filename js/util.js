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
    else if (k === 'math' || k === 'mathLabel') typeset(e, v, k === 'math' ? 'html' : 'label');   // text that may hold maths
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
  const t = el('div', { class: 'toast', mathLabel: msg }); toastHost.append(t);
  requestAnimationFrame(() => t.classList.add('in'));
  setTimeout(() => { t.classList.remove('in'); t.classList.add('out'); setTimeout(() => t.remove(), 400); }, ms);
  while (toastHost.children.length > 3) toastHost.firstChild.remove();
}

// Simple in-page confirm (the viewer frame blocks window.confirm)
// The app's own confirm dialog (never the browser's): Enter confirms, Esc or a click on the dimmed backdrop cancels, the
// focus starts on Cancel. opts: { danger: the confirm button styled as destructive, title: a heading }
export function confirmBox(text, okLabel = 'Confirm', opts = {}) {
  return new Promise(res => {
    const done = v => { box.remove(); removeEventListener('keydown', onKey, true); res(v); };
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } else if (e.key === 'Enter' && document.activeElement !== cancel) { e.preventDefault(); e.stopPropagation(); done(true); } };
    const cancel = el('button', { class: 'btn', text: 'Cancel', onclick: () => done(false) });
    const box = el('div', { class: 'modal-veil' }, [el('div', { class: 'modal glass', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': opts.title || okLabel }, [
      opts.title ? el('h3', { text: opts.title }) : null,
      el('p', { text }),
      el('div', { class: 'row end' }, [cancel, el('button', { class: 'btn ' + (opts.danger ? 'danger solid' : 'primary'), text: okLabel, onclick: () => done(true) })])])]);
    box.addEventListener('pointerdown', e => { if (e.target === box) done(false); });
    addEventListener('keydown', onKey, true);
    document.body.append(box); try { cancel.focus({ preventScroll: true }); } catch (e) { }
  });
}
// a toast with one action (e.g. "Undo"), clickable for its whole life (ms); the action runs at most once
export function toastAction(msg, label, fn, ms = 8000) {
  if (!toastHost) { toastHost = el('div', { class: 'toasts', role: 'status' }); document.body.append(toastHost); }
  let used = false; const close = () => { t.classList.remove('in'); t.classList.add('out'); setTimeout(() => t.remove(), 400); };
  const t = el('div', { class: 'toast act' }, [el('span', { mathLabel: msg }), el('button', { class: 'toast-btn', type: 'button', text: label, onclick: () => { if (used) return; used = true; close(); fn(); } })]);
  toastHost.append(t); requestAnimationFrame(() => t.classList.add('in')); setTimeout(close, ms);
  while (toastHost.children.length > 3) toastHost.firstChild.remove();
  return t;
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

// ---------- GPU resource disposal (duck-typed: no three.js import here) ----------
// Collects the geometries, materials and textures an object tree uses.
export function gpuSet(roots, set = new Set()) {
  const addMat = m => { if (!m || set.has(m)) return; set.add(m); for (const k in m) { const v = m[k]; if (v && v.isTexture) set.add(v); } if (m.uniforms) for (const k in m.uniforms) { const v = m.uniforms[k] && m.uniforms[k].value; if (v && v.isTexture) set.add(v); } };
  [].concat(roots).forEach(r => { if (!r || !r.traverse) return; r.traverse(o => { if (o.isLight && o.shadow) set.add(o);   /* a shadow-casting light owns its shadow-map render target */ if (o.isReflector) set.add(o);   /* Reflector.dispose() frees its render target (framebuffer, MSAA) and material */ if (o.userData && o.userData.gpu) o.userData.gpu.forEach(x => { if (x) set.add(x); });   /* textures an object holds outside its materials (cabin.js vitrine backdrop) */ if (o.geometry) set.add(o.geometry); if (o.material) [].concat(o.material).forEach(addMat); });
    if (r.isScene) { if (r.userData.__trt) r.userData.__trt.forEach(t => set.add(t)); if (r.background && r.background.isTexture) set.add(r.background); if (r.environment && r.environment.isTexture) set.add(r.environment); } });
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

// ---------- maths typesetter ----------
// Labels, readouts, lessons, scroll text and AI answers are written as plain text, often in programmer syntax
// ("a*sin(x)*cos(y) + 0.05*(x^2+y^2)", "1.5·e^(−Eb/kT)", "sqrt(L/g)", "x <= 2", "1.2e-3") or loose notation
// ("m1r1 = m2r2", "P_in", "H2O", "Ca2+"). The typesetter finds the expression-like spans in mixed prose (words such
// as "as", "is", step ids such as S9, URLs, file names and `code` are left alone), parses each span into a small
// syntax tree and lays it out the way a printed book would:
//   italic single-letter variables, upright function names, units, constants (π, e) and multi-letter words;
//   implicit multiplication (a sin x cos y, 0.05(x² + y²), 2πr), × only between two numbers, · between units;
//   powers as superscripts (grouped exponents too: e^(−E_b/kT) → e with a raised −E_b/kT), indices as subscripts;
//   radicals with a vinculum; fractions stacked in running text, with a solidus in compact labels and in exponents;
//   the proper minus sign and ± ≤ ≥ ≠ → ⇌ ≈ ∝; scientific notation 1.2e-3 → 1.2 × 10⁻³; chemistry (H₂O, Ca²⁺).
// Text inside $…$ / $$…$$ is LaTeX for MathJax (HTML) or is converted to plain notation first (SVG, canvas).
// Entry points: typeset(el, s[, target]) writes s into an HTML element or an SVG <text> (and runs MathJax when s holds
// $…$); mathHTML(s, target) gives the HTML; mathRuns(s) gives styled runs; svgMath / canvasMath / measureMath draw.
// target: 'html' (running text, the default: fractions with a solidus), 'display' (a line of its own: fractions stacked)
// or 'label' (one compact line, no MathJax: fractions slashed, TeX converted to plain notation).

const GREEK = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω', pi: 'π', PI: 'π' };
const FN = new Set('sin cos tan sec csc cot asin acos atan atan2 arcsin arccos arctan sinh cosh tanh arsinh arcosh artanh exp ln log log10 log2 lg sqrt cbrt abs sign sgn floor ceil round min max pow hypot det erf gcd lcm mod lim Re Im arg tr'.split(' '));
const TRIG = new Set('sin cos tan sec csc cot asin acos atan arcsin arccos arctan sinh cosh tanh arsinh arcosh artanh ln log lg exp det arg'.split(' '));   // may take an argument without brackets (sin x)
const FN_SHOW = { asin: 'arcsin', acos: 'arccos', atan: 'arctan', sign: 'sgn', log10: 'log₁₀', log2: 'log₂' };
const UNITS = new Set('m s kg g mg µg km cm mm µm um nm pm Å mol mmol K Pa kPa MPa GPa hPa bar mbar atm N kN mN J kJ MJ mJ eV keV MeV GeV W kW MW mW V mV kV µV A mA µA Ω kΩ MΩ ohm Hz kHz MHz GHz C mC µC F mF µF nF pF H mH T mT L mL l h min ms µs ns ps yr rad mrad sr deg °C °F lx cd lm Wb S Gy Sv Bq M mM µM cal kcal Da kDa dB ppm ppb au ly pc'.split(' '));
// a text that is a unit (J, s⁻², m/s², %/K, kg·m²) or ends with one in brackets ("height (m)", "T (s)"): set upright
export const unitish = s => { const u = t => { const w = String(t).split(/[\s()\/·*^⁻⁺⁰-⁹¹²³\d.]+/).filter(Boolean); return w.length > 0 && w.every(x => UNITS.has(x) || /^[%‰°]$|^°[CFK]$/.test(x)); }; const m = /\(([^()]+)\)\s*$/.exec(String(s)); return u(s) || !!(m && u(m[1])); };
const MULTI_UNITS = new Set([...UNITS].filter(u => u.length > 1 && !['ms', 'min', 'au', 'pc', 'ly', 'cd', 'lm', 'rad', 'deg', 'bar', 'atm', 'yr'].includes(u)).concat(['m/s']));
const ELEMENTS = new Set('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pt Au Hg Tl Pb Bi Po Rn Ra U Pu'.split(' '));
const UPRIGHT_WORDS = new Set('pH pKa pOH max min const avg rms tot net eff ext int sup inf lim mod Re Im Ma Nu Pr Sc'.split(' '));
const STOP2 = new Set('as is it in at an on or of to be by we if do so no up us me my go he ok am oh vs eg ie id ad ah ha hi lo pa re'.split(' '));
const STOP3 = new Set('the and for are was has had not but its one two can our all any may new now see use who why how let get set put via per off out own few too yet far she him her his did does was were been sum'.split(' '));
const RELS = { '=': '=', '==': '=', '<': '<', '>': '>', '<=': '≤', '>=': '≥', '≤': '≤', '≥': '≥', '!=': '≠', '≠': '≠', '~=': '≈', '≈': '≈', '~': '∼', '∝': '∝', '->': '→', '→': '→', '=>': '⇒', '⇒': '⇒', '<->': '↔', '<=>': '⇌', '⇌': '⇌', '↔': '↔', '<-': '←', '≡': '≡', '≪': '≪', '≫': '≫', '<<': '≪', '>>': '≫' };
const SUBCH = '₀₁₂₃₄₅₆₇₈₉', SUPCH = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '−': '⁻' };
const isChem = f => { const parts = f.match(/[A-Z][a-z]?\d*/g) || []; return parts.join('') === f && parts.length >= 1 && parts.every(p => ELEMENTS.has(p.replace(/\d+/, ''))); };
const chemOk = f => isChem(f) && /\d/.test(f) && (f.match(/[A-Z]/g).length >= 2 || /^(H|O|N|Cl|F|Br|I)[2-9]$/.test(f));

// ---- tokens: {k, v, ws (space before)}; k: num word op open close bar comma sym punct
const TOK = new RegExp([
  /(?<ion>(?:[A-Z][a-z]?\d*){1,6}(?:\^?\d{0,2}[+\-−](?![\w(+\-])))/.source,    // Ca2+, SO4^2-, Na+, Cl-
  /(?<num>(?:\d+\.?\d*|\.\d+)(?:[eE][+\-−]?\d+)?)/.source,
  /(?<word>[A-Za-zα-ωΑ-ΩϑϕϵℓÅµ∂∇ΔΣΠ][A-Za-z0-9α-ωΑ-ΩϑϕϵµΔ₀-₉ᵢⱼₐₑₒₓₙₘᵧₕₖₗₚₛₜᵣᵤᵥ]*'*[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]*)/.source,
  /(?<op>\*\*|<=>|<->|<=|>=|!=|==|->|=>|<-|~=|\+\/-|\+-|<<|>>|[-−+*\/^=<>~×·÷±∓≤≥≠≈∝→⇒⇌↔←≡≪≫_√∛!%‰°′])/.source,
  /(?<tex>\\[A-Za-z]+|\\.)/.source,
  /(?<open>[(\[{])/.source, /(?<close>[)\]}])/.source, /(?<bar>\|)/.source, /(?<comma>,)/.source,
  /(?<ws>\s+)/.source, /(?<other>[\s\S])/.source].join('|'), 'gu');
function tokenize(s) {
  const out = []; let ws = '', m; TOK.lastIndex = 0;
  while ((m = TOK.exec(s))) {
    const g = m.groups, k = Object.keys(g).find(x => g[x] !== undefined);
    if (k === 'ws') { ws += m[0]; continue; }
    let kk = k === 'tex' ? 'other' : k, v = m[0];
    if (k === 'ion' && !/^(?:[A-Z][a-z]?\d*)+(?:\^?\d{0,2}[+\-−])$/.test(v)) kk = 'word';
    if (k === 'ion') { const base = v.replace(/\^?\d{0,2}[+\-−]$/, ''); const ch = v.slice(base.length); const prev = s[m.index - 1];
      if (!isChem(base) || (prev && /[\w)]/.test(prev)) || (base.length === 1 && !/\d/.test(ch) && !/^[HKNOFIC]$/.test(base)) || (/^[A-Z]$/.test(base) && ch === '-')) { TOK.lastIndex = m.index + base.length; kk = 'word'; v = base; } }
    out.push({ k: kk, v, ws, i: m.index }); ws = '';
  }
  out.end = ws;
  // digit groups: 101 325 Pa, 13 595 kg/m³ are one number each (never 13 × 595)
  for (let i = 0; i < out.length - 1; i++) { const t = out[i], n = out[i + 1]; if (t.k === 'num' && n.k === 'num' && /^\d{1,3}(?:[\u2009\u202F\u00A0 ]\d{3})*$/.test(t.v) && /^\d{3}$/.test(n.v) && /^[ \u2009\u202F\u00A0]$/.test(n.ws) && !(out[i - 1] && out[i - 1].k === 'op' && /[*×·\/]/.test(out[i - 1].v))) { t.v += '\u2009' + n.v; out.splice(i + 1, 1); i--; } }
  // merge x_i, P_in, T_{max}, x_(i+1) into one word; "Delta T" into ΔT
  for (let i = 1; i < out.length - 1; i++) {
    const t = out[i], b = out[i - 1], n = out[i + 1];
    if (t.k === 'op' && t.v === '_' && !t.ws && b.k === 'word' && !n.ws) {
      if (n.k === 'word' || n.k === 'num') { b.v += '_' + n.v; out.splice(i, 2); i--; continue; }
      if (n.k === 'open') { let d = 0, j = i + 1; for (; j < out.length; j++) { if (out[j].k === 'open') d++; else if (out[j].k === 'close' && --d === 0) break; } if (j < out.length) { b.v += '_' + out.slice(i + 1, j + 1).map((x, q) => (q ? x.ws : '') + x.v).join(''); out.splice(i, j - i + 1); i--; continue; } }
    }
  }
  for (let i = 0; i < out.length - 1; i++) { const t = out[i], n = out[i + 1]; if (t.k === 'op' && t.v === '°' && n.k === 'word' && /^[CFK]$/.test(n.v) && !n.ws) { t.k = 'word'; t.v = '°' + n.v; out.splice(i + 1, 1); } }
  for (let i = 0; i < out.length - 1; i++) { const t = out[i], n = out[i + 1], nn = out[i + 2]; if (t.k === 'word' && /^[A-Za-zα-ω]$/.test(t.v) && n.k === 'op' && n.v === '*' && !n.ws && (!nn || nn.ws || /^(close|comma|other)$/.test(nn.k))) { t.v += '*'; out.splice(i + 1, 1); } }   // p* (p-star)
  for (let i = 0; i < out.length - 1; i++) { const t = out[i], n = out[i + 1]; if (t.k === 'word' && (t.v === 'Delta' || t.v === 'Δ') && n.k === 'word' && n.ws === ' ' && /^[A-Za-zα-ω][A-Za-z0-9_α-ω]{0,3}$/.test(n.v) && !STOP2.has(n.v)) { t.v = 'Δ' + n.v; out.splice(i + 1, 1); } }
  return out;
}

// ---- classification
const greekOf = w => GREEK[w] || null;
function splitWord(w) {   // the parts of a word token: {base, sub, prime, sup, usub}
  let sup = ''; const um = /^([^_]+)_(.+)$/.exec(w); let usub = null; if (um) { w = um[1]; usub = um[2]; }
  const qm = /([⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+)$/.exec(w); if (qm) { sup = qm[1]; w = w.slice(0, -sup.length); }
  const pm = /('+)$/.exec(w), prime = pm ? pm[1].length : 0; if (pm) w = w.slice(0, -prime);
  const sm = /^(.*?)([₀-₉ᵢⱼₐₑₒₓₙₘᵧₕₖₗₚₛₜᵣᵤᵥ]+)$/.exec(w); let sub = null; if (sm && sm[1]) { w = sm[1]; sub = sm[2].replace(/[₀-₉]/g, c => String(SUBCH.indexOf(c))).replace(/[ᵢⱼₐₑₒₓₙₘᵧₕₖₗₚₛₜᵣᵤᵥ]/g, c => 'ijaeoxnmyhklpstruv'['ᵢⱼₐₑₒₓₙₘᵧₕₖₗₚₛₜᵣᵤᵥ'.indexOf(c)]); }
  return { w, sub, prime, sup, usub };
}
function mathyWord(w, strict) {   // a word that is surely maths on its own (not prose)
  const { w: b, usub, sup } = splitWord(w);
  if (usub != null) return b.length <= 3 || !!GREEK[b];
  if (sup && /^[A-Za-zα-ω]{1,3}$/.test(b)) return true;
  if (/^([A-Za-zα-ω]\d{1,2}){2,4}$/.test(b) && !chemOk(b)) return true;
  if (FN.has(b) || GREEK[b] || UPRIGHT_WORDS.has(b)) return true;
  if (/^[A-Za-zα-ωΑ-Ωϑϕℓ∂∇Δ]$/.test(b)) return !(strict && (b === 'a' || b === 'A' || b === 'I'));
  if (/^[A-Za-zα-ωΔ]{1,3}\d{1,3}$/.test(b) || /^(alpha|beta|gamma|delta|theta|lambda|omega|phi|psi|sigma|tau|mu|rho)\d{1,2}$/i.test(b)) return true;
  if (/^[A-Za-z]{2}$/.test(b)) return !STOP2.has(b.toLowerCase());
  if (/^(Delta|delta|Δ)[A-Za-zα-ω]{1,2}\d?$/.test(b)) return true;
  if (/^[α-ωΑ-Ω][A-Za-zα-ω]?$/.test(b)) return true;
  return false;
}
const isOperand = t => t && (t.k === 'num' || t.k === 'word' || t.k === 'ion');
const BINOP = new Set(['+', '-', '−', '*', '**', '/', '^', '×', '÷', '±', '∓', '+-', '+/-']);
const isRel = v => v in RELS;

// ---- find expression spans in a token list → [{a, b}] (inclusive token indices)
function matchBrackets(T) {
  const st = [], m = new Map();
  T.forEach((t, i) => { if (t.k === 'open') st.push(i); else if (t.k === 'close' && st.length) { const j = st.pop(); m.set(i, j); m.set(j, i); } });
  return m;
}
function findSpans(T) {
  const M = matchBrackets(T), n = T.length, anchor = new Array(n).fill(false);
  const tight = i => !T[i].ws;   // no space before token i
  const groupMathy = (a, b) => { for (let i = a + 1; i < b; i++) { const t = T[i]; if (t.k === 'other' && !/[′°'.]/.test(t.v)) return false; if (t.k === 'word' && !mathyWord(t.v) && !FN.has(t.v) && !(UNITS.has(t.v) && T[i - 1] && T[i - 1].k === 'num') && !(T[i - 1] && T[i - 1].k === 'op' && tight(i)) && !(T[i + 1] && T[i + 1].k === 'op' && tight(i + 1))) return false; } return b > a + 1; };
  const operandL = i => { const t = T[i]; return t && (isOperand(t) || t.k === 'close' || t.k === 'bar' || (t.k === 'op' && /^[!%°′]$/.test(t.v))); };
  const operandR = i => { const t = T[i]; return t && (isOperand(t) || t.k === 'open' || t.k === 'bar' || (t.k === 'op' && /[-−√∛]/.test(t.v))); };
  const mathyL = i => { const t = T[i]; if (!t) return false; if (t.k === 'num' || t.k === 'ion') return true; if (t.k === 'close') return M.has(i) && groupMathy(M.get(i), i); if (t.k === 'word') return mathyWord(t.v); return t.k === 'op' && /^[!%°′]$/.test(t.v); };
  const mathyR = i => { const t = T[i]; if (!t) return false; if (t.k === 'num' || t.k === 'ion') return true; if (t.k === 'open') return M.has(i) && groupMathy(i, M.get(i)); if (t.k === 'word') return mathyWord(t.v) || (T[i + 1] && T[i + 1].k === 'open' && FN.has(t.v)); if (t.k === 'op' && /[-−]/.test(t.v)) return mathyR(i + 1); return t.k === 'op' && /[√∛]/.test(t.v); };
  for (let i = 0; i < n; i++) {
    const t = T[i];
    if (t.k === 'word' && FN.has(t.v) && T[i + 1] && T[i + 1].k === 'open' && tight(i + 1) && M.has(i + 1) && (groupMathy(i + 1, M.get(i + 1)) || /^(sqrt|exp|abs|cbrt|log10|log2|sin|cos|tan)$/.test(t.v))) anchor[i] = true;
    if (t.k === 'word' && /_/.test(t.v) && mathyWord(t.v)) anchor[i] = true;
    if (t.k === 'word' && /^[A-Za-zα-ωΦΨΩ]$/.test(t.v) && t.v !== 'a' && T[i + 1] && T[i + 1].k === 'open' && T[i + 1].v === '(' && tight(i + 1) && M.has(i + 1)) { const c = M.get(i + 1), inner = T.slice(i + 2, c); if (inner.length && inner.length <= 7 && inner.every((x, q) => q % 2 ? x.k === 'comma' : (x.k === 'word' && mathyWord(x.v, true) || x.k === 'num'))) anchor[i] = true; }
    if (t.k === 'word' && /[⁰¹²³⁴⁵⁶⁷⁸⁹]/.test(t.v) && mathyWord(t.v) && T[i + 1] && T[i + 1].k === 'op' && BINOP.has(T[i + 1].v)) anchor[i] = true;
    if (t.k !== 'op') { if (t.k === 'num' && /[eE]/.test(t.v) && !(T[i + 1] && T[i + 1].k === 'word' && tight(i + 1))) anchor[i] = true; continue; }
    const v = t.v, L = i - 1, R = i + 1, sp = !!t.ws, spR = !!(T[R] && T[R].ws);
    if (v === '^' || v === '**') { if (operandL(L) && operandR(R) && !sp) anchor[i] = true; }
    else if (v === '_') { const b = T[L]; if (b && b.k === 'word' && !sp && !spR && T[R] && (T[R].k === 'word' || T[R].k === 'num' || T[R].k === 'open') && (splitWord(b.v).w.length <= 3 || GREEK[b.v])) anchor[i] = true; }
    else if (v === '*' || v === '×' || v === '÷') { if (operandL(L) && operandR(R) && sp === spR && (v !== '*' || !sp || mathyL(L) || mathyR(R))) anchor[i] = true; }
    else if (v === '/' && T[L] && T[L].k === 'op' && /^[%‰]$/.test(T[L].v) && !sp && !spR && T[R] && T[R].k === 'word' && (UNITS.has(T[R].v) || /^°[CFK]$/.test(T[R].v))) { /* %/K, ‰/°C: a unit, upright */ }
    else if (v === '/') { const date = T[L] && T[R] && T[L].k === 'num' && T[R].k === 'num' && ((T[R + 1] && T[R + 1].v === '/' && tight(R + 1)) || (T[L - 1] && T[L - 1].v === '/' && tight(L)) || /^0\d/.test(T[R].v) || /^\d{4}$/.test(T[L].v));
      if (mathyL(L) && mathyR(R) && sp === spR && !date) anchor[i] = true;
      else if (T[L] && T[L].k === 'word' && T[R] && T[R].k === 'word' && !sp && !spR && UNITS.has(T[L].v) && UNITS.has(T[R].v)) anchor[i] = true;
      else if (T[L] && T[L].k === 'num' && sp && !spR && T[R] && T[R].k === 'word' && UNITS.has(T[R].v)) anchor[i] = true; }
    else if (v === '·') { if (!sp && !spR && operandL(L) && operandR(R)) anchor[i] = true; }
    else if (v === '+' || v === '±' || v === '∓' || v === '+-' || v === '+/-') { if (mathyL(L) && mathyR(R) && sp === spR) anchor[i] = true; }
    else if (v === '-' || v === '−') {
      if (mathyL(L) && mathyR(R) && sp && spR) anchor[i] = true;
      else if (mathyL(L) && mathyR(R) && !sp && !spR && !(T[L].k === 'word' && T[R].k === 'word' && !(mathyWord(T[L].v, true) && mathyWord(T[R].v, true))) && !(T[L].k === 'num' && T[R].k === 'num')) anchor[i] = true;
      else if ((sp || !T[L] || (T[L].k === 'open') || (T[L].k === 'op' && isRel(T[L].v))) && !spR && T[R] && (T[R].k === 'num' || (T[R].k === 'word' && mathyWord(T[R].v, true) && !(T[R + 1] && T[R + 1].k === 'op' && T[R + 1].v === '-')))) anchor[i] = true;
    }
    else if (isRel(v)) { if ((mathyL(L) || (T[L] && T[L].k === 'close')) && (mathyR(R) || (T[R] && (T[R].k === 'open' || T[R].k === 'word' && FN.has(T[R].v)))) || /^(<=|>=|!=|->|=>|~=|<->|<=>)$/.test(v)) anchor[i] = true; }
    else if (v === '√' || v === '∛') { if (operandR(R)) anchor[i] = true; }
  }
  // expand anchors over the expression around them
  const spans = []; const used = new Array(n).fill(false);
  const contR = (j) => {   // may the span continue from token j-1 into token j?
    const p = T[j - 1], t = T[j]; if (!t) return false;
    if (t.k === 'comma' || t.k === 'other' && !/[′°']/.test(t.v)) return false;
    if (t.k === 'close') return false;
    const pOp = p.k === 'op' && !/^[!%°′]$/.test(p.v) && p.v !== '·', tOp = t.k === 'op' && !/[√∛]/.test(t.v);
    if (t.k === 'op' && t.v === '·' && t.ws) return false;
    if (t.k === 'op' && t.v === '_' ) return !t.ws;
    if (tOp && t.v === '/' && t.ws && !(T[j + 1] && T[j + 1].ws) && (p.k === 'num' || p.k === 'word' && UNITS.has(p.v)) && T[j + 1] && T[j + 1].k === 'word' && UNITS.has(T[j + 1].v)) return true;
    if (tOp) { if (/^[!%°′]$/.test(t.v)) return !t.ws; return (t.ws === (T[j + 1] && T[j + 1].ws) || !t.ws) && (operandR(j + 1) || isRel(t.v)) && (isRel(t.v) || BINOP.has(t.v) || t.v === '·') && (t.ws ? (mathyR(j + 1) || T[j + 1].k === 'word' && FN.has(T[j + 1].v) || T[j + 1].k === 'open' || T[j + 1].k === 'word' && !STOP3.has(T[j + 1].v) && !STOP2.has(T[j + 1].v)) : true); }
    if (pOp) return t.k !== 'comma' && (t.k !== 'word' || mathyWord(t.v) || FN.has(t.v) || !t.ws || (!STOP3.has(t.v) && !STOP2.has(t.v.toLowerCase()) && !(T[j + 1] && T[j + 1].k === 'word' && T[j + 1].ws)));
    if (t.k === 'open') return M.has(j) && (groupMathy(j, M.get(j)) || !t.ws && p.k === 'word' && FN.has(p.v));
    if (t.k === 'bar') return !t.ws || true;
    // juxtaposition
    if (!t.ws) return t.k === 'word' ? (p.k !== 'word') : true;
    if (p.k === 'word' && TRIG.has(p.v) && isOperand(t)) return true;
    if (t.k === 'word' && (TRIG.has(t.v) || FN.has(t.v) && T[j + 1] && T[j + 1].k === 'open' && !T[j + 1].ws) && (p.k === 'num' || p.k === 'close' || (p.k === 'word' && mathyWord(p.v, true)))) return true;
    if (p.k === 'num' && t.k === 'word' && (UNITS.has(t.v) || /^[A-Za-zΩµ°]{1,4}$/.test(t.v) && UNITS.has(t.v.split(/[\/^·*]/)[0]))) return true;
    if (p.k === 'word' && UNITS.has(p.v) && t.k === 'word' && UNITS.has(t.v) && T[j + 1] && T[j + 1].k === 'op' && /[\^*\/·]/.test(T[j + 1].v) && !T[j + 1].ws) return true;
    return false;
  };
  for (let i = 0; i < n; i++) {
    if (!anchor[i]) continue;
    let a = i, b = i;
    if (T[i].k === 'op' && (T[i].v === '-' || T[i].v === '−' || T[i].v === '√' || T[i].v === '∛') && !operandL(i - 1)) a = i;
    // left: the operand(s) before the anchor
    const growL = () => { while (a > 0) { const j = a - 1, t = T[j], nx = T[a];
      if (t.k === 'close' && M.has(j)) { const o = M.get(j); if (o < a && (groupMathy(o, j) || nx.k === 'op')) { a = o; if (o > 0 && T[o - 1].k === 'word' && !T[o].ws && (FN.has(T[o - 1].v) || mathyWord(T[o - 1].v) || T[o - 1].v.length <= 4)) a = o - 1; continue; } break; }
      if (t.k === 'open' || t.k === 'comma') break;
      // T[j] then T[a]: is the join an expression?
      if (contR.call(null, a) && (() => { const save = a; return true; })()) {
        if (t.k === 'op' && t.v === '·' && t.ws) break;
        if (t.k === 'word' && nx.ws && !(TRIG.has(t.v) && isOperand(nx)) && !(nx.k === 'op') && !(nx.k === 'word' && TRIG.has(nx.v))) break;
        if (t.k === 'word' && nx.k === 'op' && !mathyWord(t.v) && !FN.has(t.v) && (nx.ws || STOP3.has(t.v) || STOP2.has(t.v.toLowerCase()) || t.v.length > 12)) break;
        if (t.k === 'op' && !operandL(j - 1) && !/[-−√∛]/.test(t.v)) break;
        if (t.k === 'op' && /[-−]/.test(t.v) && operandL(j - 1) && !mathyL(j - 1) && T[j - 1].k === 'word' && (t.ws || !nx.ws)) { a = j; break; }
        a = j; continue;
      }
      break; } };
    const growR = () => { while (b < n - 1) { const j = b + 1, t = T[j];
      if (t.k === 'open' && M.has(j) && M.get(j) > j) { const c = M.get(j); const p = T[b]; if (groupMathy(j, c) || (p.k === 'op' && !t.ws) || (p.k === 'word' && FN.has(p.v) && !t.ws)) { if (t.ws && !(p.k === 'op') && !(p.k === 'num') && !(p.k === 'word' && FN.has(p.v))) break; b = c; continue; } break; }
      if (!contR(j)) break;
      if (t.k === 'word' && T[b].k === 'op' && !mathyWord(t.v) && !FN.has(t.v) && !(!t.ws && !T[b].ws && T[b].v !== '·' && /^[A-Za-z]{1,3}$/.test(t.v) && !STOP3.has(t.v)) && (t.ws || STOP3.has(t.v) || STOP2.has(t.v.toLowerCase()) || t.v.length > 12) && !(T[j + 1] && T[j + 1].k === 'op' && !T[j + 1].ws && T[j + 1].v !== '·')) { if (!t.ws && !STOP3.has(t.v) && !STOP2.has(t.v.toLowerCase())) { b = j; } break; }
      if (t.k === 'op' && !/^[!%°′]$/.test(t.v)) { if (!operandR(j + 1)) break; }
      b = j; } };
    growL(); growR();
    // a lone '-' anchor (unary) or a group-only span stays as is; trailing operators are dropped
    while (b > a && T[b].k === 'op' && !/^[!%°′]$/.test(T[b].v)) b--;
    while (a < b && T[a].k === 'op' && !/[-−√∛]/.test(T[a].v)) a++;
    // balance brackets inside the span
    for (let j = a; j <= b; j++) { if ((T[j].k === 'open' || T[j].k === 'close') && (!M.has(j) || M.get(j) < a || M.get(j) > b)) { if (j < i) a = j + 1; else { b = j - 1; break; } } }
    if (b < a) continue;
    spans.push({ a, b });
  }
  spans.sort((x, y) => x.a - y.a || y.b - x.b);
  const out = [];
  for (const q of spans) { const l = out[out.length - 1]; if (l && (q.a <= l.b || (q.a === l.b + 1 && !T[q.a].ws && !(T[q.a].k === 'op' && T[q.a].v === '·')))) l.b = Math.max(l.b, q.b); else out.push({ ...q }); }
  // a merged span must still have balanced brackets
  for (const q of out) { let d = 0; for (let j = q.a; j <= q.b; j++) { if (T[j].k === 'open') d++; else if (T[j].k === 'close') d--; } if (d !== 0) { while (q.b > q.a && d < 0 && T[q.b].k === 'close') { q.b--; d++; } while (q.a < q.b && d > 0 && T[q.a].k === 'open') { q.a++; d--; } } }
  return out;
}

// ---- parser: tokens → tree
function parseSpan(T, a, b) {
  let p = a; const peek = (o = 0) => (p + o <= b ? T[p + o] : null), next = () => T[p++];
  const M = new Map(); { const st = []; for (let i = a; i <= b; i++) { if (T[i].k === 'open') st.push(i); else if (T[i].k === 'close' && st.length) M.set(st.pop(), i); } }
  const isOp = (t, ...vs) => t && t.k === 'op' && vs.includes(t.v);
  function rel() {
    const items = [add()], ops = [];
    while (peek() && peek().k === 'op' && isRel(peek().v)) { ops.push(RELS[next().v]); items.push(peek() ? add() : { t: 'raw', v: '' }); }
    return ops.length ? { t: 'rel', items, ops } : items[0];
  }
  function add() {
    let x = peek() && isOp(peek(), '-', '−', '+', '±', '∓', '+-', '+/-') ? null : mul();
    if (!x) { const o = next().v; x = { t: 'neg', op: o === '+' ? '+' : /[±]|\+-|\+\/-/.test(o) ? '±' : o === '∓' ? '∓' : '−', a: mul() }; }
    while (peek() && isOp(peek(), '+', '-', '−', '±', '∓', '+-', '+/-')) { const o = next().v; const y = mul(); x = { t: 'bin', op: o === '+' ? '+' : o === '∓' ? '∓' : /[±]|\+-|\+\/-/.test(o) ? '±' : '−', a: x, b: y }; }
    return x;
  }
  function mul() {
    let x = imp();
    while (peek() && (isOp(peek(), '*', '×', '÷', '/') || (isOp(peek(), '·') && !peek().ws))) {
      const o = next().v; const y = imp();
      if (o === '/' || o === '÷') x = { t: 'frac', n: x, d: y, op: o };
      else x = { t: 'mul', items: [x, y], ex: o === '*' ? '*' : o };
    }
    return x;
  }
  const startsFactor = t => t && (t.k === 'num' || t.k === 'word' || t.k === 'ion' || t.k === 'open' || (t.k === 'bar' && !inBar) || isOp(t, '√', '∛'));
  let inBar = 0;
  function imp() {
    let x = unary();
    while (startsFactor(peek()) && !(peek().k === 'bar' && inBar)) { const y = unary(); x = { t: 'mul', items: [x, y], ex: '' }; }
    return x;
  }
  function unary() {
    if (peek() && isOp(peek(), '-', '−')) { next(); return { t: 'neg', op: '−', a: unary() }; }
    if (peek() && isOp(peek(), '+')) { next(); return { t: 'neg', op: '+', a: unary() }; }
    return pow();
  }
  function pow() {
    let x = post();
    if (peek() && isOp(peek(), '^', '**')) { next(); const e = (peek() && isOp(peek(), '-', '−', '+')) ? (next().v === '+' ? { t: 'neg', op: '+', a: pow() } : { t: 'neg', op: '−', a: pow() }) : pow(); return { t: 'pow', b: x, e: ungroup(e) }; }
    return x;
  }
  function post() {
    let x = prim();
    for (;;) {
      const t = peek(); if (!t) break;
      if (isOp(t, '_') && !t.ws) { next(); const s = peek() && peek().k === 'open' ? ungroup(prim()) : sub1(); x = attachSub(x, s); continue; }
      if (t.k === 'op' && /^[!%°′]$/.test(t.v) && !t.ws) { next(); x = { t: 'post', a: x, s: t.v === '′' ? '′' : t.v }; continue; }
      break;
    }
    return x;
  }
  function sub1() { const t = next(); if (!t) return { t: 'raw', v: '' }; if (t.k === 'num') return { t: 'num', v: t.v }; if (t.k === 'word') return { t: 'subw', v: t.v }; return { t: 'raw', v: t.v }; }
  function group() {
    const o = next(), end = M.get(p - 1); const save = b; b = end - 1; const inner = p <= b ? list() : { t: 'raw', v: '' }; b = save; p = end + 1;
    return { t: 'group', o: o.v, c: T[end].v, a: inner };
  }
  function list() { const items = [rel()]; while (peek() && peek().k === 'comma') { next(); items.push(peek() ? rel() : { t: 'raw', v: '' }); } let rest = ''; while (p <= b) { const t = next(); rest += (rest && t.ws ? ' ' : '') + (t.k === 'op' ? (RELS[t.v] || t.v) : t.v); } const L = items.length > 1 ? { t: 'list', items } : items[0]; return rest ? { t: 'seq', items: [L, { t: 'raw', v: ' ' + rest }] } : L; }
  function prim() {
    const t = peek(); if (!t) return { t: 'raw', v: '' };
    if (t.k === 'num') { next(); return numNode(t.v); }
    if (t.k === 'ion') { next(); return { t: 'chem', v: t.v }; }
    if (t.k === 'open' && M.has(p)) return group();
    if (t.k === 'bar' && !inBar) { next(); inBar++; const x = rel(); inBar--; if (peek() && peek().k === 'bar') next(); return { t: 'group', o: '|', c: '|', a: x }; }
    if (isOp(t, '√', '∛')) { next(); const x = peek() && peek().k === 'open' ? ungroup(group()) : post(); return { t: 'sqrt', a: x, idx: t.v === '∛' ? '3' : null }; }
    if (t.k === 'word') {
      next(); const w = t.v;
      if (FN.has(w)) {
        if (peek() && peek().k === 'open' && !peek().ws) { const g = group(); return fnNode(w, g); }
        if (TRIG.has(w) && peek() && startsFactor(peek())) { const arg = trigArg(); return { t: 'fn', f: w, a: arg, bare: true }; }
        if (peek() && isOp(peek(), '^') && TRIG.has(w)) { next(); const e = pow(); const arg = startsFactor(peek()) ? trigArg() : null; return { t: 'fn', f: w, a: arg, bare: true, pw: ungroup(e) }; }
      }
      return wordNode(w);
    }
    next(); return { t: 'raw', v: t.k === 'op' ? (RELS[t.v] || t.v) : t.v };
  }
  function trigArg() {   // sin x, sin 2x, sin ωt: the factors up to the next operator or function
    let x = pow(); while (startsFactor(peek()) && !(peek().k === 'word' && FN.has(peek().v)) && peek().k !== 'open' && !peek().ws) { x = { t: 'mul', items: [x, pow()], ex: '' }; } return x;
  }
  const out = list();
  return out;
}
function ungroup(x) { return x && x.t === 'group' && (x.o === '(' || x.o === '{') ? x.a : x; }
function attachSub(x, s) { if (x.t === 'id' && !x.sub) return { ...x, sub: s }; if (x.t === 'pow') return { ...x, b: attachSub(x.b, s) }; return { t: 'sub', b: x, s }; }
function numNode(v) {
  const m = /^(\d+\.?\d*|\.\d+)[eE]([+\-−]?)(\d+)$/.exec(v);
  if (m) { const e = (m[2] === '-' || m[2] === '−' ? '−' : '') + String(+m[3]); return { t: 'sci', m: m[1].replace(/\.$/, ''), e }; }
  return { t: 'num', v };
}
function fnNode(w, g) {
  const inner = g.a;
  const args = inner && inner.t === 'list' ? inner.items : [inner];
  if (w === 'sqrt') return { t: 'sqrt', a: inner };
  if (w === 'cbrt') return { t: 'sqrt', a: inner, idx: '3' };
  if (w === 'abs') return { t: 'group', o: '|', c: '|', a: inner };
  if (w === 'floor') return { t: 'group', o: '⌊', c: '⌋', a: inner };
  if (w === 'ceil') return { t: 'group', o: '⌈', c: '⌉', a: inner };
  if (w === 'exp') return { t: 'pow', b: { t: 'const', v: 'e' }, e: inner };
  if (w === 'pow' && args.length === 2) return { t: 'pow', b: wrapIfNeeded(args[0]), e: args[1] };
  if (w === 'hypot' && args.length >= 2) return { t: 'sqrt', a: args.slice(1).reduce((s, x) => ({ t: 'bin', op: '+', a: s, b: { t: 'pow', b: wrapIfNeeded(x), e: { t: 'num', v: '2' } } }), { t: 'pow', b: wrapIfNeeded(args[0]), e: { t: 'num', v: '2' } }) };
  const simple = x => x && (x.t === 'id' || x.t === 'num' || x.t === 'const' || (x.t === 'mul' && !x.ex && x.items.every(y => y.t === 'id' || y.t === 'num' || y.t === 'const')) || (x.t === 'pow' && (x.b.t === 'id')));
  if (TRIG.has(w) && w !== 'exp' && args.length === 1 && simple(inner)) return { t: 'fn', f: w, a: inner, bare: true };
  return { t: 'fn', f: w, a: g };
}
function wrapIfNeeded(x) { return x && (x.t === 'bin' || x.t === 'neg' || x.t === 'mul' || x.t === 'frac') ? { t: 'group', o: '(', c: ')', a: x } : x; }
function subNode(t) {   // the subscript text of x_t
  t = t.replace(/^[{(](.*)[})]$/, '$1');
  if (/^\d+$/.test(t)) return { t: 'num', v: t };
  if (/^[A-Za-zα-ω]+$/.test(t) && !GREEK[t]) return { t: 'subw', v: t };
  const T = tokenize(t); if (!T.length) return { t: 'raw', v: t };
  try { return parseSpan(T, 0, T.length - 1); } catch (e) { return { t: 'raw', v: t }; }
}
function wordNode(w) {
  if (/^[A-Za-zα-ω]\*$/.test(w)) return { t: 'sup', b: wordNode(w[0]), s: { t: 'raw', v: '∗' } };
  const { w: b, sub, prime, sup, usub } = splitWord(w);
  if (usub != null) { let x = wordNode(b); x = attachSub(x, subNode(usub)); return sup ? { t: 'post', a: x, s: sup } : x; }
  if (sup) return { t: 'post', a: wordNode(b + (sub ? '' : '')), s: sup };
  if (/^([A-Za-zα-ω]\d{1,2}){2,4}$/.test(b) && !chemOk(b)) return b.match(/[A-Za-zα-ω]\d{1,2}/g).map(wordNode).reduce((s, y) => s ? { t: 'mul', items: [s, y], ex: '' } : y, null);
  const subN = sub ? { t: /^\d+$/.test(sub) ? 'num' : 'subw', v: sub } : null;
  const P = x => prime ? { t: 'post', a: x, s: '′'.repeat(prime) } : x;
  let x;
  if (GREEK[b]) x = { t: 'id', v: GREEK[b], up: b === 'pi' || b === 'PI' || /^[A-Z]/.test(b) };
  else if (/^[A-Za-zϑϕℓ∂∇]$/.test(b)) x = { t: 'id', v: b, up: b === '∂' || b === '∇' };
  else if (/^[α-ω]$/.test(b)) x = { t: 'id', v: b, up: b === 'π' };
  else if (/^[Α-ΩΔΣΠ]$/.test(b)) x = { t: 'id', v: b, up: true };
  else if (/^(Delta|delta|Δ)/.test(b) && b.length > (b[0] === 'Δ' ? 1 : 5)) { const rest = b.replace(/^(Delta|delta|Δ)/, ''); x = { t: 'mul', items: [{ t: 'id', v: b[0] === 'd' ? 'δ' : 'Δ', up: true }, wordNode(rest)], ex: '' }; }
  else if (/^(alpha|beta|gamma|delta|epsilon|theta|lambda|omega|phi|psi|sigma|tau|mu|rho|nu|eta|kappa|chi|xi|zeta|Omega|Theta|Phi|Psi|Sigma|Gamma|Lambda)(\d+)$/.test(b)) { const m = /^([A-Za-z]+)(\d+)$/.exec(b); x = { t: 'id', v: GREEK[m[1]], up: /^[A-Z]/.test(m[1]), sub: { t: 'num', v: m[2] } }; }
  else if (/^[A-Za-zα-ω]\d{1,3}$/.test(b)) { x = { t: 'id', v: b[0], sub: { t: 'num', v: b.slice(1) } }; if (chemOk(b)) x = { t: 'chem', v: b }; }
  else if (chemOk(b)) x = { t: 'chem', v: b };
  else if (UPRIGHT_WORDS.has(b) || FN.has(b)) x = { t: 'word', v: FN_SHOW[b] || b };
  else if (/^d[xyztrsuvwθφqmAVpEWQSN]$/.test(b)) x = { t: 'mul', items: [{ t: 'id', v: 'd', up: true }, wordNode(b[1])], ex: '' };
  else if (/^[A-Z][a-z]$/.test(b) && !ELEMENTS.has(b) && !UNITS.has(b)) x = { t: 'id', v: b[0], sub: { t: 'subw', v: b[1] } };   // Ea → E_a
  else if (/^[A-Za-z]{2,3}$/.test(b) && !UNITS.has(b) && !ELEMENTS.has(b) && !/^[A-Z][a-z]{2}$/.test(b) && !/^[a-z]{3}$/.test(b)) x = { t: 'mul', items: b.split('').map(c => ({ t: 'id', v: c })), ex: '' };   // kT, RC
  else if (/^[A-Za-zα-ω]{2,3}$/.test(b) && /[α-ω]/.test(b)) x = { t: 'mul', items: [...b].map(c => wordNode(c)), ex: '' };   // ωt, λt
  else if (UNITS.has(b)) x = { t: 'unitw', v: b };
  else if (/^[A-Za-z]+\d+$/.test(b)) { const m = /^([A-Za-z]+)(\d+)$/.exec(b); x = { t: 'word', v: m[1], sub: { t: 'num', v: m[2] } }; }
  else x = { t: 'word', v: b };
  if (subN) x = attachSub(x, subN);
  return P(x);
}

// ---- unit and chemistry context
const UNITY = x => x && ((x.t === 'post' && /^[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+$/.test(x.s) && UNITY(x.a)) || x.t === 'unitw' || (x.t === 'id' && !x.sub && UNITS.has(x.v)) || (x.t === 'word' && UNITS.has(x.v) && !x.sub) || (x.t === 'mul' && x.items.length && x.items.every(UNITY)) || (x.t === 'pow' && UNITY(x.b) && isIntExp(x.e)) || (x.t === 'frac' && (UNITY(x.n) || (x.n.t === 'num' && x.n.v === '1')) && UNITY(x.d)) || (x.t === 'group' && x.o === '(' && UNITY(x.a)));
const isIntExp = e => e && ((e.t === 'num' && /^\d+$/.test(e.v)) || (e.t === 'neg' && e.a.t === 'num' && /^\d+$/.test(e.a.v)));
const mulAsUnits = x => { x.unit = true; return x; };
function unitize(x) {   // mark a units subtree: identifiers become upright, products use ·
  if (!x) return x;
  if (x.t === 'id' || x.t === 'unitw' || x.t === 'word') return { t: 'unit', v: x.t === 'id' && x.v === 'u' ? 'µ' : x.v };
  if (x.t === 'mul') return { ...x, items: x.items.map(unitize), unit: true };
  if (x.t === 'pow') return { ...x, b: unitize(x.b) };
  if (x.t === 'frac') return { ...x, n: unitize(x.n), d: unitize(x.d), unit: true };
  if (x.t === 'group' || x.t === 'post') return { ...x, a: unitize(x.a) };
  return x;
}
// flatten nested products into one list of factors with the operator written before each
function factors(x, out = [], ex = '', u = !!x.unit) { if (x.t === 'mul' && !!x.unit === u) { factors(x.items[0], out, ex, u); factors(x.items[1], out, x.ex, u); } else out.push({ f: x, ex }); return out; }
function contextualize(x) {   // after a number: a run of unit factors is a unit (9.81 m/s², 5 kg·m²); the whole span may be units
  if (!x || typeof x !== 'object') return x;
  const kids = o => { for (const k of ['a', 'b', 'n', 'd', 'e', 's']) if (o[k] && typeof o[k] === 'object') o[k] = contextualize(o[k]); if (o.items) o.items = o.items.map(contextualize); return o; };
  if (x.t === 'mul' && !x.unit) {
    const F = factors(x);
    for (let i = 1; i < F.length; i++) {
      if ((F[i - 1].f.t === 'num' || F[i - 1].f.t === 'sci') && UNITY(F[i].f) && F[i].ex === '') {
        let j = i; while (j + 1 < F.length && UNITY(F[j + 1].f) && F[j + 1].ex !== '×') j++;
        const u = F.slice(i, j + 1).reduce((s, q) => s ? { t: 'mul', items: [s, q.f], ex: q.ex || '·', unit: true } : q.f, null);
        F.splice(i, j - i + 1, { f: { t: 'qty', u: unitize(u) }, ex: '' }); }
    }
    const rebuilt = F.reduce((s, q) => s ? { t: 'mul', items: [s, contextualize(q.f)], ex: q.ex } : contextualize(q.f), null);
    return rebuilt;
  }
  if (x.t === 'frac' && (x.n.t === 'num' || x.n.t === 'sci' || (x.n.t === 'mul' && (() => { const F = factors(x.n); return F[F.length - 1].f.t === 'qty'; })())) && UNITY(x.d) && x.d.t !== 'group') {   // 0.2 /s, 3 m/s
    return { t: 'frac', n: contextualize(x.n), d: unitize(x.d), unit: true, inline: true };
  }
  if (x.t === 'frac' && x.n.t === 'mul') { const F = factors(x.n); const last = F[F.length - 1]; const pre = F.length > 1 && (F[F.length - 2].f.t === 'num' || F[F.length - 2].f.t === 'sci'); if (pre && UNITY(last.f) && UNITY(x.d)) { return contextualize({ t: 'mul', items: [F.slice(0, -1).reduce((s, q) => s ? { t: 'mul', items: [s, q.f], ex: q.ex } : q.f, null), { t: 'frac', n: last.f, d: x.d }], ex: '' }); } }
  return kids({ ...x });
}
function allUnits(x) { return UNITY(x) && (() => { let multi = false; const walk = y => { if (!y) return; if ((y.t === 'unitw' || y.t === 'word') && MULTI_UNITS.has(y.v)) multi = true; if (y.t === 'frac') { if (y.n.t === 'id' && y.n.v === 'm' && y.d && (y.d.t === 'id' && y.d.v === 's' || y.d.t === 'pow' && y.d.b.v === 's')) multi = true; } ['a', 'b', 'n', 'd'].forEach(k => walk(y[k])); (y.items || []).forEach(walk); }; walk(x); return multi; })(); }
function chemistry(x) {   // A + B → C, 2H2 + O2 → 2H2O: species are upright
  if (!(x.t === 'rel' && x.ops.some(o => o === '→' || o === '⇌' || o === '↔' || o === '←'))) return x;
  const species = y => y.t === 'chem' || (y.t === 'id' && /^[A-Z]$/.test(y.v) && !y.sub) || (y.t === 'mul' && !y.ex && y.items.every(z => z.t === 'num' || species(z))) || (y.t === 'bin' && y.op === '+' && species(y.a) && species(y.b)) || (y.t === 'group' && species(y.a));
  if (!x.items.every(species)) return x;
  const up = y => { if (y.t === 'id') return { t: 'chem', v: y.v }; const o = { ...y }; ['a', 'b'].forEach(k => o[k] && (o[k] = up(o[k]))); if (o.items) o.items = o.items.map(up); return o; };
  return { ...x, items: x.items.map(up), chem: true };
}

// ---- layout: tree → boxes  {k:'t', v, f:'it'|'up'|'op'} | {k:'h', c} | {k:'sup'|'sub', b, s} | {k:'ss', b, sb, sp} | {k:'frac', n, d} | {k:'sqrt', a, idx}
const T_ = (v, f = 'up') => ({ k: 't', v, f }), H = (...c) => ({ k: 'h', c: c.flat(Infinity).filter(Boolean) });
const SP = { thin: ' ', nb: ' ' };
const chemBox = v => { const m = /^((?:[A-Z][a-z]?\d*)+?)(\^?)(\d{0,2})([+\-−]?)$/.exec(v) || [v, v, '', '', ''];
  if (!m[2] && m[4]) { const q = /^([A-Z][a-z]?)(\d+)$/.exec(m[1]); if (q) { m[1] = q[1]; m[3] = q[2]; } }   // Ca2+ → Ca²⁺ (one element: the digits are the charge)
  const parts = []; m[1].replace(/([A-Z][a-z]?)(\d*)/g, (_, e, d) => { parts.push(d ? { k: 'sub', b: T_(e), s: T_(d) } : T_(e)); });
  const ch = (m[3] || '') + (m[4] === '-' || m[4] === '−' ? '−' : m[4]);
  if (ch) { const last = parts.pop(); if (last.k === 'sub') parts.push({ k: 'ss', b: last.b, sb: last.s, sp: T_(ch) }); else parts.push({ k: 'sup', b: last, s: T_(ch) }); }
  return H(parts); };
const endsBareFn = x => x && ((x.t === 'fn' && x.bare) || (x.t === 'mul' && endsBareFn(x.items[1])));
const needParens = (x, side) => { if (!x) return false; if ((side === 'num' || side === 'den') && endsBareFn(x)) return true; if (x.t === 'bin' || x.t === 'rel' || x.t === 'list') return true; if (x.t === 'neg' && side === 'pow') return true; if (side === 'den' && (x.t === 'frac' || (x.t === 'mul' && x.ex && x.ex !== ''))) return true; if (side === 'pow' && (x.t === 'mul' || x.t === 'frac' || x.t === 'neg' || x.t === 'fn' || x.t === 'sqrt' && false || x.t === 'post')) return true; return false; };
const paren = b => H(T_('('), b, T_(')'));
function lay(x, C) {   // C: {stack: bool, lvl: 0 (base) / 1 (script)}
  if (!x) return H();
  switch (x.t) {
    case 'num': return T_(x.v);
    case 'sci': { const p = { k: 'sup', b: T_('10'), s: T_(x.e) }; return x.m === '1' ? p : H(T_(x.m), T_(SP.thin + '×' + SP.thin, 'op'), p); }
    case 'id': { const b = T_(x.v, x.up ? 'up' : 'it'); return x.sub ? { k: 'sub', b, s: lay(x.sub, { ...C, lvl: 1, sub: true }) } : b; }
    case 'const': return T_(x.v);
    case 'subw': return T_(x.v, x.v.length === 1 && /[a-zα-ω]/.test(x.v) && !C.word ? 'it' : 'up');
    case 'word': { const b = T_(x.v); return x.sub ? { k: 'sub', b, s: lay(x.sub, { ...C, lvl: 1 }) } : b; }
    case 'unitw': case 'unit': return T_(x.v === 'um' ? 'µm' : x.v === 'ohm' ? 'Ω' : x.v === 'deg' ? '°' : x.v);
    case 'qty': return lay(x.u, C);
    case 'chem': return chemBox(x.v);
    case 'raw': return T_(x.v);
    case 'sub': { const s = lay(x.s, { ...C, lvl: 1 }); const b = lay(x.b, C); return { k: 'sub', b, s }; }
    case 'sup': return { k: 'sup', b: lay(x.b, C), s: lay(x.s, { ...C, lvl: 1 }) };
    case 'post': return H(lay(x.a, C), T_(x.s));
    case 'neg': return H(T_(x.op), lay(x.a, C));
    case 'bin': return H(lay(x.a, C), T_(' ' + x.op + ' ', 'op'), lay(x.b, C));
    case 'rel': return H(x.items.map((y, i) => [i ? T_(' ' + x.ops[i - 1] + ' ', 'op') : null, lay(y, C)]));
    case 'list': return H(x.items.map((y, i) => [i ? T_(', ') : null, lay(y, C)]));
    case 'seq': return H(x.items.map(y => lay(y, C)));
    case 'group': { const inner = lay(x.a, { ...C, stack: false }); return H(T_(x.o), inner, T_(x.c)); }   // inside brackets a fraction keeps the solidus (a small stacked one would crowd the line)
    case 'sqrt': return { k: 'sqrt', a: lay(ungroup(x.a), { ...C, stack: false }), idx: x.idx };
    case 'pow': {
      let base = x.b.t === 'id' && x.b.v === 'e' && !x.b.sub ? { t: 'const', v: 'e' } : x.b; const bb = needParens(base, 'pow') ? paren(lay(base, C)) : lay(base, C);
      const s = lay(ungroup(x.e), { ...C, lvl: 1, stack: false });
      if (x.b.t === 'fn' && x.b.bare) return lay({ ...x.b, pw: x.e }, C);
      if (bb.k === 'sub') return { k: 'ss', b: bb.b, sb: bb.s, sp: s };
      return { k: 'sup', b: bb, s };
    }
    case 'fn': {
      let name = T_(FN_SHOW[x.f] || x.f); if (x.pw) name = { k: 'sup', b: name, s: lay(x.pw, { ...C, lvl: 1, stack: false }) };
      if (!x.a) return name;
      if (x.bare) return H(name, T_(SP.thin), lay(x.a, C));
      return H(name, lay(x.a, C));
    }
    case 'frac': {
      if (x.op === '÷') return H(lay(x.n, C), T_(' ÷ ', 'op'), lay(x.d, C));   // an explicit ÷ is the author's arithmetic: kept
      if (x.n && x.n.t === 'num' && x.d && x.d.t === 'num') { const v = { '1/2': '½', '1/3': '⅓', '2/3': '⅔', '1/4': '¼', '3/4': '¾', '1/8': '⅛' }[x.n.v + '/' + x.d.v]; if (v) return T_(v); }
      if (C.stack && !x.unit && !x.inline && C.lvl === 0) return { k: 'frac', n: lay(ungroup(x.n), C), d: lay(ungroup(x.d), C) };
      const n = needParens(x.n, 'num') ? paren(lay(x.n, C)) : lay(x.n, C), d = needParens(x.d, 'den') ? paren(lay(x.d, C)) : lay(x.d, C);
      if (x.inline && x.n.t !== 'mul') return H(n, T_(SP.nb + '/'), d);
      return H(n, T_('/'), d);
    }
    case 'mul': {
      const F = factors(x); const out = [];
      F.forEach((q, i) => {
        const f = q.f, b = lay(f, C);
        if (i) {
          const prev = F[i - 1].f, num = y => y.t === 'num' || y.t === 'sci' || (y.t === 'frac' && y.n.t === 'num' && y.d.t === 'num') || (y.t === 'neg' && num(y.a)),
            startsNum = y => num(y) || (y.t === 'pow' && startsNum(y.b)) || (y.t === 'mul' && startsNum(factors(y)[0].f)) || (y.t === 'sub' && startsNum(y.b)) || y.t === 'neg',
            word = y => y.t === 'word' || (y.t === 'sub' && word(y.b)) || (y.t === 'pow' && word(y.b));
          if (f.t === 'qty') out.push(T_(SP.nb));
          else if (f.t === 'pow' && (f.b.t === 'const' || f.b.t === 'id' && f.b.v === 'e' && !f.b.sub) && num(prev)) out.push(T_(SP.thin));
          else if (x.unit || (UNITY(prev) && UNITY(f) && q.ex === '·')) out.push(T_('·', 'op'));
          else if (q.ex === '×' || q.ex === '÷') out.push(T_(' × ', 'op'));
          else if (startsNum(f) && f.t !== 'neg' && (num(prev) || prev.t === 'qty')) out.push(T_(SP.thin + '×' + SP.thin, 'op'));
          else if (startsNum(f)) out.push(T_('·', 'op'));
          else if (f.t === 'neg') out.push(T_('·', 'op'));
          else if (word(f) || word(prev)) out.push(T_(SP.thin + '·' + SP.thin, 'op'));
          else if (f.t === 'fn' || (prev.t === 'fn' && prev.bare) || (f.t === 'pow' && f.b.t === 'fn') || (prev.t === 'pow' && prev.b.t === 'fn' && prev.b.bare)) out.push(T_(SP.thin));
          else if (q.ex === '·' && !x.unit) out.push(T_('·', 'op'));
        }
        out.push(b);
      });
      return H(out);
    }
    default: return T_(String(x.v || ''));
  }
}

// ---- emitters
const STY = 'mtyp-css';
function ensureCSS() {
  if (typeof document === 'undefined' || document.getElementById(STY)) return;
  const st = document.createElement('style'); st.id = STY;
  st.textContent = `.mx{white-space:nowrap}.mx.mw{white-space:normal}.mx i{font-style:italic}
.mx sup,.mx sub{font-size:.7em;line-height:0;position:relative;vertical-align:baseline}.mx sup{top:-.6em}.mx sub{top:.3em}.mx sup sup{top:-.5em}.mx sup sub,.mx sub sub{top:.25em}
.m-ss{display:inline-block;vertical-align:-.25em;font-size:.7em;line-height:.95;margin-left:.03em;text-align:left}.m-ss>span{display:block}.m-ss sub,.m-ss sup{font-size:1em;top:0}
.mx .m-sqrt{white-space:nowrap;display:inline-flex;align-items:baseline}.m-sqrt>.m-idx{font-size:.6em;margin-right:-.45em;margin-top:-.1em}.mx .m-rad{border-top:.07em solid currentColor;padding:.04em .1em 0 .05em;display:inline-block;line-height:1.1}
.mx .m-frac{display:inline-flex;flex-direction:column;vertical-align:middle;text-align:center;font-size:.86em;line-height:1.25;margin:0 .12em}.mx .m-frac>span:first-child{border-bottom:.07em solid currentColor;padding:0 .15em .06em}.mx .m-frac>span:last-child{padding:.06em .15em 0}
.m-ang{display:inline-block;width:.32em;height:1.1em;margin:0 .04em;vertical-align:-.22em;overflow:hidden;line-height:1;-webkit-text-fill-color:transparent;background:currentColor;-webkit-mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 30'%3E%3Cpath d='M8 1.5L2.2 15L8 28.5' fill='none' stroke='%23000' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/100% 100% no-repeat;mask:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 30'%3E%3Cpath d='M8 1.5L2.2 15L8 28.5' fill='none' stroke='%23000' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/100% 100% no-repeat}.m-ang.r{-webkit-mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 30'%3E%3Cpath d='M2 1.5L7.8 15L2 28.5' fill='none' stroke='%23000' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");mask-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 30'%3E%3Cpath d='M2 1.5L7.8 15L2 28.5' fill='none' stroke='%23000' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")}`;
  document.head.append(st);
}
function toHTML(b) { return toHTML0(b).replace(/<\/i><i>/g, ''); }
function toHTML0(b) {
  const toHTML = toHTML0;
  if (b.k === 't') { const v = esc(b.v); return b.f === 'it' ? `<i>${v}</i>` : v; }
  if (b.k === 'h') return b.c.map(toHTML).join('');
  if (b.k === 'sup') return toHTML(b.b) + '<sup>' + toHTML(b.s) + '</sup>';
  if (b.k === 'sub') return toHTML(b.b) + '<sub>' + toHTML(b.s) + '</sub>';
  if (b.k === 'ss') return toHTML(b.b) + `<span class="m-ss"><span>${toHTML(b.sp)}</span><span>${toHTML(b.sb)}</span></span>`;
  if (b.k === 'frac') return `<span class="m-frac"><span>${toHTML(b.n)}</span><span>${toHTML(b.d)}</span></span>`;
  if (b.k === 'sqrt') return `<span class="m-sqrt">${b.idx === '3' ? '∛' : b.idx ? `<span class="m-idx">${esc(b.idx)}</span>√` : '√'}<span class="m-rad">${toHTML(b.a)}</span></span>`;
  return '';
}
// runs: [{t, it, sz (relative size), sh (baseline shift, base em, + is up), ov (under a vinculum: radical depth)}]
function toRuns(b, st = { sz: 1, sh: 0, ov: 0 }, out = []) {
  if (b.k === 't') { if (b.v) out.push({ t: b.v, it: b.f === 'it', sz: st.sz, sh: st.sh, ov: st.ov, s: st.sh > 0 ? 'sup' : st.sh < 0 ? 'sub' : '' }); return out; }
  if (b.k === 'h') { b.c.forEach(c => toRuns(c, st, out)); return out; }
  const scr = (sh) => ({ ...st, sz: st.sz * (st.sz < 1 ? .85 : .72), sh: st.sh + sh * st.sz });
  if (b.k === 'sup') { toRuns(b.b, st, out); toRuns(b.s, scr(.42), out); return out; }
  if (b.k === 'sub') { toRuns(b.b, st, out); toRuns(b.s, scr(-.24), out); return out; }
  if (b.k === 'ss') { toRuns(b.b, st, out); toRuns(b.sb, scr(-.24), out); toRuns(b.sp, scr(.42), out); return out; }
  if (b.k === 'frac') { const comp = y => y.k === 'h' && y.c.some(z => z.k === 't' && /^ .* $/.test(z.v)); const n = comp(b.n) ? H(T_('('), b.n, T_(')')) : b.n, d = comp(b.d) || (b.d.k === 'h' && b.d.c.length > 1) ? H(T_('('), b.d, T_(')')) : b.d; toRuns(n, st, out); toRuns(T_('/'), st, out); toRuns(d, st, out); return out; }
  if (b.k === 'sqrt') { if (b.idx && b.idx !== '3') toRuns(T_(b.idx), scr(.5), out); toRuns(T_(b.idx === '3' ? '∛' : '√'), st, out); toRuns(b.a, { ...st, ov: st.ov + 1 }, out); return out; }
  return out;
}

// ---- LaTeX → plain notation (for SVG / canvas, where MathJax does not run)
const TEXSYM = { cdot: '·', times: '×', pm: '±', mp: '∓', le: '≤', leq: '≤', ge: '≥', geq: '≥', neq: '≠', ne: '≠', approx: '≈', propto: '∝', to: '→', rightarrow: '→', Rightarrow: '⇒', rightleftharpoons: '⇌', infty: '∞', partial: '∂', nabla: '∇', degree: '°', ll: '≪', gg: '≫', sim: '∼', equiv: '≡', hbar: 'ℏ', ell: 'ℓ' };
const texCmds = t => t.replace(/\\([A-Za-z]+)(?![A-Za-z])/g, (m, w, i, all) => { if (FN.has(w)) return (/[A-Za-z0-9_)]$/.test(all.slice(0, i)) ? ' ' : '') + w + ' '; const r = GREEK[w] || TEXSYM[w]; return r ? r + (/^[A-Za-z0-9\\]/.test(all.slice(i + m.length)) && GREEK[w] ? ' ' : '') : m; });
function texPlain(s) {
  let t = texCmds(String(s));
  const w = x => /^[\w.]+$/.test(x.trim()) ? x.trim() : '(' + x + ')';
  for (let k = 0; k < 4; k++) t = t.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, (m, a, b) => w(a) + '/' + w(b)).replace(/\\sqrt\{([^{}]*)\}/g, 'sqrt($1)').replace(/\^\{([^{}]*)\}/g, '^($1)').replace(/_\{([^{}]*)\}/g, '_($1)');
  t = t.replace(/\\(left|right|,|;|!|quad|qquad)/g, ' ').replace(/\\(mathrm|text|mathbf|mathit|operatorname)\{([^{}]*)\}/g, '$2')
    .replace(/\\cdot/g, '·').replace(/\\times/g, '×').replace(/\\pm/g, '±').replace(/\\leq?/g, '≤').replace(/\\geq?/g, '≥').replace(/\\neq/g, '≠').replace(/\\approx/g, '≈').replace(/\\propto/g, '∝')
    .replace(/\\(to|rightarrow)/g, '→').replace(/\\rightleftharpoons/g, '⇌').replace(/\\infty/g, '∞').replace(/\\partial/g, '∂').replace(/\\nabla/g, '∇').replace(/\\degree/g, '°')
    .replace(/\\([A-Za-z]+)/g, (m, w) => GREEK[w] || (FN.has(w) ? w : w)).replace(/[{}]/g, '');
  return t.replace(/\s+/g, ' ').trim();
}

// ---- public: typeset a text into boxes per segment
const PROTECT = /(\$\$[^$]+\$\$|\$[^$\n]+\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|`[^`\n]+`|\bhttps?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+|[\w.+-]+@[\w-]+\.[\w.]+|\b[\w-]+(?:\/[\w.-]+)*\.(?:js|mjs|json|md|pdf|html?|css|py|txt|png|jpe?g|svg|gif|webp|csv|xml|zip|bat|sh|glb|gltf)\b)/g;
const CACHE = new Map();
function typesetText(str, C) {   // → [{k:'box', b} | {k:'tex', v} | {k:'code', v} | {k:'text', v}]
  const parts = String(str).split(PROTECT), out = [];
  parts.forEach((seg, i) => {
    if (!seg) return;
    if (i % 2) { if (seg[0] === '$' || /^\\[[(]/.test(seg)) out.push(C.tex ? { k: 'tex', v: seg } : { k: 'box', b: plainBox(texPlain(seg.replace(/^\$+|\$+$|^\\[[(]|\\[\])]$/g, '')), C) }); else if (seg[0] === '`') out.push({ k: 'code', v: seg.slice(1, -1) }); else out.push({ k: 'text', v: seg }); return; }
    out.push({ k: 'box', b: plainBox(seg, C) });
  });
  return out;
}
function plainBox(seg, C) {
  if (seg.includes('\\')) seg = texCmds(seg);   // a stray \theta outside $…$ (no MathJax pass there): the symbol itself
  const T = tokenize(seg); if (!T.length) return T_(seg);
  const spans = findSpans(T); const c = []; let k = 0;
  const raw = (t, i) => { const ws = t.ws ? (/\n/.test(t.ws) ? t.ws : ' '.repeat(Math.min(t.ws.length, 1))) : ''; return ws; };
  const lit = t => {   // a token outside any expression
    if (t.k === 'ion') return chemBox(t.v);
    if (t.k === 'num' && /[eE]/.test(t.v)) return lay(numNode(t.v), C);
    if (t.k === 'word') { const b = splitWord(t.v).w;
      if (chemOk(b) && t.v === b) return chemBox(b);
      if (/^[A-FH-RT-Za-zα-ω]\d{1,2}$/.test(b) && t.v === b && !/^[A-Z]\d$/.test(b) || /^[A-FH-RT-Z]\d$/.test(b) && t.v === b && !/^[A-FH-RT-Z]\d$/.test('') ) return /^(H|O|N|F|I)2$/.test(b) ? chemBox(b) : lay(wordNode(b), C);
      if (/^(alpha|beta|gamma|delta|theta|lambda|omega|phi|psi|sigma|tau|mu|rho|Delta|Omega)(\d{1,2}|_\w+)$/.test(t.v) || /^[A-Za-zα-ω]\*$/.test(t.v) || /^[A-Za-zα-ω][₀-₉ᵢⱼₐₑₒₓₙₘᵧₕₖₗₚₛₜᵣᵤᵥ]+$/.test(t.v)) return lay(wordNode(t.v), C);   // vₓ, vᵧ, θ₀ written with Unicode subscripts
      return T_(t.v); }
    if (t.k === 'op') return T_(RELS[t.v] && /^(<=|>=|!=|->|=>|~=|<->|<=>|<-)$/.test(t.v) ? RELS[t.v] : t.v === '+-' || t.v === '+/-' ? '±' : t.v);
    return T_(t.v);
  };
  for (let i = 0; i < T.length;) {
    const sp = spans[k];
    if (sp && sp.a === i) {
      c.push(T_(raw(T[i])));
      let tree; try { tree = parseSpan(T, sp.a, sp.b); tree = contextualize(tree); tree = chemistry(tree); if (allUnits(tree)) tree = unitize(tree); }
      catch (e) { tree = { t: 'raw', v: T.slice(sp.a, sp.b + 1).map((t, j) => (j ? t.ws : '') + t.v).join('') }; }
      c.push({ k: 'h', c: [lay(tree, C)], math: true });
      i = sp.b + 1; k++; continue;
    }
    c.push(T_(raw(T[i]))); c.push(lit(T[i])); i++;
  }
  if (T.end) c.push(T_(/\n/.test(T.end) ? T.end : ' '));
  // keep leading/trailing whitespace of the segment as in the source
  const lead = /^\s*/.exec(seg)[0]; if (lead && c[0] && c[0].k === 't' && c[0].v === ' ') c[0] = T_(lead);
  return H(c);
}
// labels have no MathJax pass: $…$ becomes plain notation. Running text ('html') keeps fractions on one line with a
// solidus (θ³/6, L/g), so a fraction never opens the line spacing of a paragraph; 'display' (a line of its own) stacks them.
const mathTarget = t => (t === 'label' || t === 'compact' || t === 'svg' || t === 'canvas') ? { stack: false, lvl: 0, tex: false } : t === 'display' ? { stack: true, lvl: 0, tex: true } : { stack: false, lvl: 0, tex: true };
export function mathHTML(s, target = 'html') {
  const str = String(s ?? ''); if (!str) return '';
  ensureCSS();
  const key = target + '\u0000' + str; if (CACHE.has(key)) return CACHE.get(key);
  const C = mathTarget(target);
  const html = typesetText(str, C).map(p => p.k === 'tex' ? esc(p.v) : p.k === 'code' ? `<code>${esc(p.v)}</code>` : angles(p.k === 'text' ? esc(p.v) : boxHTML(p.b))).join('');
  if (CACHE.size > 4000) CACHE.clear(); CACHE.set(key, html); return html;
}
// ⟨ ⟩ (mean values, ⟨KE⟩) are drawn as a masked stroke in the text colour: many text faces (the mono readouts among
// them) have no glyph for them and fall back to one that looks like ( ). The character stays in the DOM for copy and
// screen readers; only its ink is replaced.
const angles = h => h.indexOf('⟨') < 0 && h.indexOf('⟩') < 0 ? h : h.replace(/[⟨⟩]/g, c => `<span class="m-ang${c === '⟩' ? ' r' : ''}">${c}</span>`);
function boxHTML(b) {   // math parts get a no-wrap wrapper so an expression never breaks inside a script or fraction
  if (b.k === 'h' && !b.math) return b.c.map(boxHTML).join('');
  if (b.k === 'h' && b.math) { const inner = toHTML(b), vis = inner.replace(/<[^>]+>/g, '').replace(/&\w+;/g, '_'); return /<|[\u2009·×−=]/.test(inner) ? `<span class="mx${vis.length > 30 ? ' mw' : ''}">${inner}</span>` : inner; }   // a short expression never breaks; a long one may break at its spaces
  return toHTML(b);
}
// a plain-Unicode rendering for places without markup (tooltips, aria-labels, wrapped canvas text, document titles):
// scripts become Unicode super/subscript characters where those exist (x², E_b → E_b stays readable), a vinculum is dropped
const USUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '−': '⁻', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ', x: 'ˣ', y: 'ʸ', a: 'ᵃ', b: 'ᵇ', c: 'ᶜ', d: 'ᵈ', e: 'ᵉ', k: 'ᵏ', m: 'ᵐ', t: 'ᵗ', T: 'ᵀ', ' ': '' };
const USUB = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '−': '₋', '-': '₋', '=': '₌', '(': '₍', ')': '₎', a: 'ₐ', e: 'ₑ', o: 'ₒ', x: 'ₓ', h: 'ₕ', k: 'ₖ', l: 'ₗ', m: 'ₘ', n: 'ₙ', p: 'ₚ', s: 'ₛ', t: 'ₜ', i: 'ᵢ', j: 'ⱼ', r: 'ᵣ', u: 'ᵤ', v: 'ᵥ', ' ': '' };
export function mathText(s) {
  const R = mathRuns(s), out = []; let i = 0;
  const conv = (t, M) => [...t].every(c => c in M) ? [...t].map(c => M[c]).join('') : null;
  while (i < R.length) {
    const r = R[i];
    if (r.ov && !(i && R[i - 1].ov)) { let j = i, t = ''; while (j < R.length && R[j].ov) t += R[j++].t; out.push(t.length > 1 ? '(' + t + ')' : t); i = j; continue; }
    if (!r.sh) { out.push(r.t); i++; continue; }
    const sg = Math.sign(r.sh); let j = i, t = '', plain = '';
    while (j < R.length && Math.sign(R[j].sh) === sg) { const x = R[j].t.replace(/[\u2009\u202F]/g, ''); t += x; plain += (Math.abs(R[j].sh) < Math.abs(r.sh) - .01 || (sg > 0 && R[j].sh < r.sh - .01) ? '_' : '') + x; j++; }
    const u = conv(t, sg > 0 ? USUP : USUB), last = out[out.length - 1] || '';
    if (u == null && sg > 0 && /(^|[^A-Za-z])e$/.test(last)) out[out.length - 1] = last.slice(0, -1) + (/[A-Za-zα-ω0-9)]$/.test(last.length > 1 ? last.slice(0, -1) : out[out.length - 2] || '') ? ' ' : '') + 'exp(' + plain + ')';   // e^(…) that has no superscript characters reads as exp(…)
    else out.push(u != null ? u : (sg > 0 ? '^' : '_') + (plain.length > 1 ? '(' + plain + ')' : plain)); i = j;
  }
  return out.join('');
}
export function mathRuns(s) {
  const C = mathTarget('svg'); const runs = [];
  typesetText(String(s ?? ''), C).forEach(p => { if (p.k === 'box') toRuns(p.b, undefined, runs); else runs.push({ t: p.v, it: false, sz: 1, sh: 0, ov: 0, s: '' }); });
  const out = []; for (const r of runs) { const l = out[out.length - 1]; if (l && l.it === r.it && l.sz === r.sz && l.sh === r.sh && l.ov === r.ov) l.t += r.t; else out.push({ ...r }); }
  return out;
}
// write maths into an SVG <text> element as tspans: italic variables, scaled and shifted scripts, an overline vinculum
export function svgMath(textEl, s) {
  const NS = 'http://www.w3.org/2000/svg'; while (textEl.firstChild) textEl.firstChild.remove();
  const runs = mathRuns(s);
  if (runs.length <= 1 && !(runs[0] && (runs[0].it || runs[0].sh || runs[0].ov))) { textEl.append(document.createTextNode(runs[0] ? runs[0].t : '')); return; }
  let sh = 0;
  for (const r of runs) {
    const t = document.createElementNS(NS, 'tspan'); t.textContent = r.t;
    if (r.it) t.setAttribute('font-style', 'italic');
    if (r.sz !== 1) t.setAttribute('font-size', (r.sz * 100).toFixed(0) + '%');
    if (r.sh !== sh) { t.setAttribute('dy', (-(r.sh - sh) / r.sz).toFixed(3) + 'em'); sh = r.sh; }
    if (r.ov) t.setAttribute('text-decoration', 'overline');
    textEl.append(t);
  }
  if (sh) { const t = document.createElementNS(NS, 'tspan'); t.setAttribute('dy', (sh).toFixed(3) + 'em'); t.textContent = '​'; textEl.append(t); }
}
// canvas: measure / draw maths with the current font; honours textAlign (left/start, center, right/end); returns the width
const fontAt = (base, sz, it) => { const m = /(\d+(?:\.\d+)?)px/.exec(base), px = m ? +m[1] : 14; let f = base.replace(/(\d+(?:\.\d+)?)px/, (px * sz).toFixed(1) + 'px'); if (it && !/italic|oblique/.test(f)) f = 'italic ' + f.replace(/^normal\s+/, ''); return f; };
export function measureMath(g, s) { const base = g.font; let w = 0; for (const r of mathRuns(s)) { g.font = fontAt(base, r.sz, r.it); w += g.measureText(r.t).width; } g.font = base; return w; }
export function canvasMath(g, s, x, y, maxW) {
  const base = g.font, al = g.textAlign, m = /(\d+(?:\.\d+)?)px/.exec(base), px = m ? +m[1] : 14, runs = mathRuns(s);
  let W = 0; for (const r of runs) { g.font = fontAt(base, r.sz, r.it); W += g.measureText(r.t).width; }
  const k = maxW && W > maxW ? maxW / W : 1;
  let cx = al === 'center' ? x - W * k / 2 : al === 'right' || al === 'end' ? x - W * k : x;
  g.textAlign = 'left'; const ovs = [];
  for (const r of runs) {
    g.font = fontAt(base, r.sz * (k < 1 ? 1 : 1), r.it); const w = g.measureText(r.t).width;
    if (k < 1) { g.save(); g.translate(cx, 0); g.scale(k, 1); g.fillText(r.t, 0, y - r.sh * px); g.restore(); } else g.fillText(r.t, cx, y - r.sh * px);
    if (r.ov) ovs.push([cx, cx + w * k, y - r.sh * px - px * r.sz * .78]);
    cx += w * k;
  }
  if (ovs.length) { g.save(); g.lineWidth = Math.max(1, px * .06); g.strokeStyle = g.fillStyle; g.beginPath(); let s0 = null; ovs.forEach(([a, b, yy], i) => { if (s0 && Math.abs(s0[2] - yy) < 1 && Math.abs(s0[1] - a) < 1) s0[1] = b; else { if (s0) { g.moveTo(s0[0], s0[2]); g.lineTo(s0[1], s0[2]); } s0 = [a, b, yy]; } }); if (s0) { g.moveTo(s0[0], s0[2]); g.lineTo(s0[1], s0[2]); } g.stroke(); g.restore(); }
  g.font = base; g.textAlign = al; return W * k;
}
// the one entry point for text that may hold maths: typeset(el, s[, target]); typeset(el) alone runs MathJax on el
export function typeset(node, s, target) {
  if (arguments.length >= 2) {
    if (!node) return node; const str = String(s ?? '');
    if (typeof SVGElement !== 'undefined' && node instanceof SVGElement && node.tagName.toLowerCase() !== 'foreignobject') { svgMath(node, str); return node; }
    node.innerHTML = mathHTML(str, target || 'html');
    if (/\$[^$]+\$/.test(str) && (target || 'html') === 'html') mathJax(node);
    return node;
  }
  return mathJax(node);
}
function mathJax(node) {
  const go = () => window.MathJax.typesetPromise([].concat(node)).catch(() => {});   // one node or a list
  if (window.MathJax && window.MathJax.typesetPromise) return go();
  return new Promise(r => { const iv = setInterval(() => { if (window.MathJax && window.MathJax.typesetPromise) { clearInterval(iv); go().then(r); } }, 300); setTimeout(() => { clearInterval(iv); r(); }, 15000); });
}
export const _math = { tokenize, findSpans, parseSpan, texPlain, typesetText, plainBox };
