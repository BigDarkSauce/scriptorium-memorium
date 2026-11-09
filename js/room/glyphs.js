// Glyphs: small ink pictures of what a label refers to, drawn beside the words in a scroll's figures (boxes of a
// flowchart, nodes of a tree, rows of a table, the two cards of a "Common mistake", events on a timeline) and in the
// explanatory primitives (actors of a flow network, parts of a construction, nodes of a causal loop).
//
// Why pictures at all, and why these rules:
// - A picture of the referent next to its word helps (the multimedia principle: words + relevant pictures beat words
//   alone), but a picture that is merely decorative or slightly wrong hurts (the seductive-detail effect, Rey 2012,
//   doi:10.1016/j.edurev.2012.05.003). So a glyph is drawn only when its keyword is literally in the label, and a figure
//   (or the AI that wrote it) can name one (icon: "gear") or refuse them (icon: false).
// - Motion only where the referent itself moves (heat rises, rain falls, a gear turns, money flows), never as decoration;
//   and none at all under prefers-reduced-motion or the reader's Calm setting (css: .glyph.anim).
// Each glyph is a few strokes on a 24 × 24 grid in the scroll's ink, so it reads at 14–28 px.
const NS = 'http://www.w3.org/2000/svg';

// id: [keywords (regex source, matched on word starts), path data on the 24 grid, animation]
const G = {
  sun: ['sun|sunlight|solar|daylight|insolation', 'M12 7.5a4.5 4.5 0 1 0 0.01 0z M12 1.5v2.5 M12 20v2.5 M1.5 12h2.5 M20 12h2.5 M4.6 4.6l1.8 1.8 M17.6 17.6l1.8 1.8 M4.6 19.4l1.8-1.8 M17.6 6.4l1.8-1.8', 'spin'],
  cloud: ['cloud|condensation|condens', 'M7 18h10.5a4 4 0 0 0 .6-8 5.5 5.5 0 0 0-10.6-1.2A4.6 4.6 0 0 0 7 18z', 'drift'],
  rain: ['rain|precipitation|rainfall|shower', 'M7 13h10a3.4 3.4 0 0 0 .4-6.8 4.6 4.6 0 0 0-8.9-1A3.9 3.9 0 0 0 7 13z M8 16l-1 3 M12 16l-1 3 M16 16l-1 3 M10 20l-.6 1.8 M14 20l-.6 1.8', 'fall'],
  snow: ['snow|ice|frozen|freez', 'M12 3v18 M4.2 7.5l15.6 9 M4.2 16.5l15.6-9 M9.5 4.5L12 6l2.5-1.5 M9.5 19.5L12 18l2.5 1.5'],
  drop: ['water|liquid|droplet|drop|moisture|humid', 'M12 3c3 4.5 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 3-6.5 6-11z M9 14.5a3 3 0 0 0 3 3'],
  vapour: ['vapour|vapor|evaporat|steam|gas\\b|gases|transpir', 'M8 20c-2-2 2-3.5 0-5.5s2-3.5 0-5.5 M12 20c-2-2 2-3.5 0-5.5s2-3.5 0-5.5s2-3 0-5 M16 20c-2-2 2-3.5 0-5.5s2-3.5 0-5.5', 'rise'],
  heat: ['heat|hot|warm|thermal|temperature|thermometer|latent', 'M10 4a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z M12 9v8 M12 17.3a1.2 1.2 0 1 0 .01 0z', 'pulse'],
  fire: ['fire|flame|burn|combust|candle', 'M12 21a6 6 0 0 0 6-6c0-4-3-5.5-4-10-2 2.5-2 4.5-2 6-1-1-2-2-2-4-2 2.5-4 5-4 8a6 6 0 0 0 6 6z M12 21a2.6 2.6 0 0 1-2.6-2.6c0-1.8 1.5-2.6 2.6-4.4 1.1 1.8 2.6 2.6 2.6 4.4A2.6 2.6 0 0 1 12 21z', 'flicker'],
  wind: ['wind|breeze|air flow|airflow|advection|draught', 'M3 9h11a3 3 0 1 0-3-3 M3 13h15a3 3 0 1 1-3 3 M3 17h7', 'drift'],
  mountain: ['mountain|hill|peak|ridge|orograph|terrain|slope', 'M2 20l7-12 4 6 3-4 6 10z M7.2 11l1.8 1.4 1.4-1.6'],
  sea: ['sea|ocean|lake|reservoir|river', 'M2 12c2.5-2.5 5-2.5 7.5 0s5 2.5 7.5 0 5-2.5 5-2.5 M2 17c2.5-2.5 5-2.5 7.5 0s5 2.5 7.5 0 5-2.5 5-2.5 M2 7c2.5-2.5 5-2.5 7.5 0s5 2.5 7.5 0', 'drift'],
  plant: ['plant|leaf|leaves|photosynth|vegetation|crop|seed', 'M12 21v-9 M12 12c0-5 3-8 8-8 0 5-3 8-8 8z M12 15c0-3.5-2.5-6-7-6 0 3.5 2.5 6 7 6z', 'sway'],
  tree: ['tree|forest|wood\\b|branch', 'M12 21v-6 M12 15c-4.5 0-7-2.5-7-5.5S7.5 4 12 3c4.5 1 7 3.5 7 6.5S16.5 15 12 15z M9 21h6', 'sway'],
  earth: ['earth|planet|globe|world|global|orbit', 'M12 3a9 9 0 1 0 .01 0z M3 12h18 M12 3c3 3 3 15 0 18 M12 3c-3 3-3 15 0 18'],
  moon: ['moon|lunar|satellite', 'M15 3.5a8.5 8.5 0 1 0 5.5 13.5A7 7 0 0 1 15 3.5z'],
  star: ['star|stellar|galaxy', 'M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6-4.5-4.2 6.1-.7z'],
  atom: ['atom|nucleus|nuclear|proton|neutron', 'M12 10.6a1.4 1.4 0 1 0 .01 0z M12 3c4 0 7 4 7 9s-3 9-7 9-7-4-7-9 3-9 7-9z M4.2 7.5c2-3.5 7-3.5 11.5-1s7.6 6.5 5.6 10-7 3.5-11.5 1-7.6-6.5-5.6-10z M4.2 16.5c-2-3.5 1-7.5 5.6-10s9.5-2.5 11.5 1-1 7.5-5.6 10-9.5 2.5-11.5-1z', 'spin'],
  molecule: ['molecule|molecular|compound|bond|chemical|reaction|reactant|ion\\b|ions\\b', 'M7 8a3 3 0 1 0 .01 0z M17 6a2.5 2.5 0 1 0 .01 0z M15 17a3 3 0 1 0 .01 0z M9.6 9.6l3.2 5.2 M9.8 10.2l4.8-3 M16.3 8.4l-.6 5.6'],
  electron: ['electron|charge|electric|current|voltage|circuit|wire', 'M13 2L5 13h6l-1 9 9-12h-6z', 'pulse'],
  battery: ['battery|cell voltage|capacitor|energy store|store energy', 'M3 8h16v8H3z M19 10.5h2v3h-2 M6 10.5v3 M9 10.5v3'],
  bulb: ['bulb|lamp|light\\b|illuminat', 'M9 17h6 M10 20h4 M12 3a6 6 0 0 0-3.6 10.8c.5.4.8 1 .8 1.6V17h5.6v-1.6c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3z', 'pulse'],
  magnet: ['magnet|magnetic|field line', 'M6 3v9a6 6 0 0 0 12 0V3h-4v9a2 2 0 0 1-4 0V3z M6 7h4 M14 7h4'],
  force: ['force|push|pull|thrust|newton|tension|weight\\b|load', 'M3 12h14 M13 7l5 5-5 5 M3 9v6'],
  mass: ['mass|kilogram|weight of|heavy|bob\\b', 'M8 8h8l3 12H5z M10 8a2 2 0 1 1 4 0'],
  spring: ['spring|elastic|hooke|stiffness|oscillat', 'M12 2v3 M12 19v3 M7 5h10L7 8h10L7 11h10L7 14h10L7 17h10l-5 2', 'bounce'],
  pendulum: ['pendulum|swing|pivot', 'M5 3h14 M12 3l4.5 13 M16.5 18a2.4 2.4 0 1 0 .01 0z', 'swingP'],
  gear: ['gear|machine|mechanism|engine|motor|turbine|rotat', 'M12 8.5a3.5 3.5 0 1 0 .01 0z M12 2.5v3 M12 18.5v3 M2.5 12h3 M18.5 12h3 M5.3 5.3l2.1 2.1 M16.6 16.6l2.1 2.1 M5.3 18.7l2.1-2.1 M16.6 7.4l2.1-2.1 M12 5.5a6.5 6.5 0 1 0 .01 0z', 'spin'],
  wheel: ['wheel|cycle\\b|loop|circulat|recycl|feedback', 'M20 12a8 8 0 1 1-2.3-5.7 M20 4v4h-4', 'spin'],
  clock: ['time|clock|period|minute|hour|duration|delay', 'M12 3a9 9 0 1 0 .01 0z M12 7v5l3.5 2', 'tick'],
  speed: ['speed|velocity|fast|accelerat|momentum|motion|moving|projectile|trajector|launch', 'M3 16a9 9 0 0 1 18 0 M12 16l5-6 M6 16h.01 M18 16h.01'],
  scale: ['balance|equilibrium|equal|scale\\b|weigh\\b|conserv', 'M12 3v18 M7 21h10 M4 7h16 M4 7l-2.5 6h5z M20 7l-2.5 6h5z', 'tilt'],
  ruler: ['length|distance|height|width|measure|metre|meter|size', 'M3 16L16 3l5 5L8 21z M7 12l2 2 M10 9l2 2 M13 6l2 2'],
  angle: ['angle|theta|degree|radian|incline', 'M4 20h16 M4 20L17 6 M10 20a6 6 0 0 0-1.8-4.3'],
  graph: ['graph|plot|chart|curve|trend|data|statistic', 'M3 3v18h18 M7 15l4-5 3 3 5-7'],
  bell: ['distribution|normal|gaussian|bell curve|probability|density|variance|softmax', 'M2 20h20 M3 19.5c3 0 4-12 9-12s6 12 9 12 M12 7.5V20'],
  die: ['dice|die\\b|random|chance|sample|odds|luck', 'M4 4h16v16H4z M8.5 8.5h.01 M15.5 8.5h.01 M12 12h.01 M8.5 15.5h.01 M15.5 15.5h.01'],
  coin: ['money|price|cost|revenue|profit|margin|pay|cash|coin|dollar|wage|income|fee|tax|spend|budget|saving|invest', 'M12 3a9 9 0 1 0 .01 0z M14.5 8.5c-.6-1-1.5-1.5-2.5-1.5-1.6 0-2.8.9-2.8 2.2 0 3 5.6 1.6 5.6 4.6 0 1.3-1.2 2.2-2.8 2.2-1.1 0-2-.5-2.6-1.5 M12 5.5V7 M12 16v1.5'],
  bank: ['bank|central bank|interest|credit|loan|debt|finance', 'M3 10h18L12 4z M5 10v8 M9.5 10v8 M14.5 10v8 M19 10v8 M3 20h18'],
  shop: ['shop|store|market|retail|seller|firm|business|company|cafe|coffee shop|restaurant', 'M3 9l1.5-5h15L21 9 M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0 M5 11v9h14v-9 M10 20v-5h4v5'],
  factory: ['factory|produc|manufactur|supplier|roaster|industry|output', 'M3 21V11l5 3v-3l5 3v-3l5 3V4h3v17z M7 18h2 M12 18h2'],
  truck: ['truck|shipping|deliver|transport|logistic|freight|goods|supply chain', 'M2 6h11v10H2z M13 9h4.5l3.5 3.5V16h-8 M6 18.5a1.8 1.8 0 1 0 .01 0z M17 18.5a1.8 1.8 0 1 0 .01 0z', 'drive'],
  person: ['person|customer|consumer|user|worker|student|learner|reader|buyer|individual|agent\\b|citizen', 'M12 4a3.5 3.5 0 1 0 .01 0z M5 21a7 7 0 0 1 14 0'],
  people: ['people|population|society|group|crowd|team|demand|households|community|voters|labour|labor', 'M9 5a3 3 0 1 0 .01 0z M3 20a6 6 0 0 1 12 0 M16.5 6.5a2.5 2.5 0 1 0 .01 0z M15 13.2A5 5 0 0 1 21 18'],
  government: ['government|policy|regulat|legislat|court|institution|minimum-wage|minimum wage', 'M12 3l9 4H3z M5 9v9 M9.5 9v9 M14.5 9v9 M19 9v9 M3 20h18 M2 22h20'],
  brain: ['brain|mind|neuron|neural|memory|think|cognit|belief|knowledge|know\\b', 'M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V4.5A2.5 2.5 0 0 0 9 4z M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1'],
  eye: ['observ|see\\b|seen|visible|vision|eye|perceiv|perception|evidence', 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 .01 0z'],
  idea: ['idea|insight|hypothes|theory|explain|explanation|reason', 'M9 17h6 M10 20h4 M12 3a6 6 0 0 0-3.6 10.8c.5.4.8 1 .8 1.6V17h5.6v-1.6c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3z M12 7v4 M10 9h4', 'pulse'],
  question: ['question|why\\b|unknown|puzzle|problem', 'M9 9a3 3 0 1 1 4.2 2.7c-.8.4-1.2 1.1-1.2 1.9V15 M12 18.5h.01 M12 2.5a9.5 9.5 0 1 0 .01 0z'],
  claim: ['claim|thesis|conclusion|therefore|so\\b', 'M5 3h10l4 4v14H5z M15 3v4h4 M8 11h8 M8 14h8 M8 17h5'],
  premise: ['premise|assum|given|axiom|definition|condition', 'M4 18h16 M6 18V9 M12 18V6 M18 18V9 M3 21h18'],
  objection: ['objection|counterexample|counter-argument|refut|against|reject', 'M12 3l9.5 16.5H2.5z M12 9v5 M12 17h.01'],
  check: ['correct|true\\b|valid|confirm|verified|holds|right\\b', 'M4 12.5l5 5L20 6.5'],
  cross: ['wrong|false\\b|invalid|mistake|error|fail|misconception', 'M5 5l14 14 M19 5L5 19'],
  code: ['code|program|function|algorithm|script|software|compute|compil|syntax|python|javascript|\\br\\b', 'M8 7l-5 5 5 5 M16 7l5 5-5 5 M14 4l-4 16'],
  cpu: ['cpu|processor|register|instruction|clock pulse|adder|alu|chip', 'M6 6h12v12H6z M9 9h6v6H9z M9 2v4 M15 2v4 M9 18v4 M15 18v4 M2 9h4 M2 15h4 M18 9h4 M18 15h4'],
  database: ['database|ram\\b|memory address|storage|stored|record|table\\b|dataset', 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6 M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3'],
  network: ['network|graph node|node|link|connect|internet|web\\b|hub', 'M12 4a2 2 0 1 0 .01 0z M5 17a2 2 0 1 0 .01 0z M19 17a2 2 0 1 0 .01 0z M11 7.5l-5 7.8 M13 7.5l5 7.8 M7 19h10'],
  token: ['token|word|text|character|letter|vocab', 'M4 6h16 M12 6v13 M8 19h8'],
  layers: ['layer|stack|level|tier|hierarch|block\\b|transformer', 'M12 3l9 5-9 5-9-5z M3 12l9 5 9-5 M3 16l9 5 9-5'],
  lock: ['secure|security|encrypt|password|private', 'M6 11h12v10H6z M8 11V7a4 4 0 0 1 8 0v4 M12 15v2'],
  cell: ['cell\\b|cells|membrane|osmos|diffus|organism|bacteri|virus|tissue', 'M12 3c5 0 9 4 9 9s-4 9-9 9-9-4-9-9 4-9 9-9z M12 9a3 3 0 1 0 .01 0z M7 15h.01 M16.5 7.5h.01 M17 15.5h.01'],
  heart: ['heart|blood|cardi|circulation', 'M12 20s-8-4.6-8-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 8 2.8C20 15.4 12 20 12 20z', 'beat'],
  dna: ['dna|gene|genetic|inherit|chromosom|rna\\b|mutation', 'M7 3c0 6 10 6 10 12s-10 6-10 6 M17 3c0 6-10 6-10 12s10 6 10 6 M8.5 7h7 M8.5 17h7'],
  book: ['book|scroll|text\\b|source|paper|study|read', 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z M4 19a2 2 0 0 1 2-2h13'],
  map: ['map|route|geograph|region|country|territory', 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z M9 3v15 M15 6v15'],
  target: ['goal|target|aim|setpoint|desired|optimi', 'M12 3a9 9 0 1 0 .01 0z M12 7a5 5 0 1 0 .01 0z M12 11a1 1 0 1 0 .01 0z'],
  up: ['increase|rise|grow|more\\b|higher|gain|inflation|boom', 'M12 20V5 M6 11l6-6 6 6', 'riseA'],
  down: ['decrease|fall\\b|falls|drop\\b|decline|less\\b|lower|loss|recession|shrink', 'M12 4v15 M6 13l6 6 6-6', 'fallA'],
  sound: ['sound|wave|frequency|pitch|acoustic|vibrat|echo', 'M4 9v6h4l5 4V5L8 9z M16 9a4 4 0 0 1 0 6 M18.5 6.5a7.5 7.5 0 0 1 0 11', 'pulse'],
  lens: ['lens|optic|refract|focus|telescope|microscope|zoom', 'M11 4a7 7 0 1 0 .01 0z M16 16l5 5'],
  ladder: ['step\\b|stage|progress|phase|sequence|procedure|method', 'M7 3v18 M17 3v18 M7 7h10 M7 12h10 M7 17h10'],
  scissors: ['cut\\b|section|split|divide|separat', 'M6 6a2.5 2.5 0 1 0 .01 0z M6 18a2.5 2.5 0 1 0 .01 0z M8 7.5L20 18 M8 16.5L20 6'],
  pyramid: ['pyramid|trophic|food chain|predator|prey|ecosystem', 'M12 3l10 17H2z M6 13.5h12 M9 8.5h6'],
};
const ANIM = new Set(['spin', 'drift', 'fall', 'rise', 'pulse', 'flicker', 'sway', 'bounce', 'swingP', 'tick', 'tilt', 'drive', 'riseA', 'fallA', 'beat']);

// a regex per glyph, matched at word starts (so "rain" finds "Rainfall" but not "train", "cell" not "excellent")
const RX = Object.fromEntries(Object.entries(G).map(([id, [kw]]) => [id, new RegExp('(^|[^a-z])(' + kw + ')', 'i')]));
// a few words would pull in the wrong picture when they appear in passing; they only count as the label's first word
const WEAK = new Set(['up', 'down', 'check', 'cross', 'claim', 'question', 'idea', 'book', 'ladder', 'eye', 'brain', 'clock']);

// The glyph for a label: the keyword found earliest in it (a label's head noun usually comes first), weak ones only
// when nothing else matches. An explicit icon wins; icon === false (or 'none') means no picture.
export function glyphFor(label, icon) {
  if (icon === false || icon === 'none') return null;
  if (icon && G[icon]) return icon;
  const all = String(label || '').replace(/\$[^$]*\$|\\\([^)]*\\\)/g, ' ').toLowerCase(); if (!all.trim()) return null;
  // the head phrase is what comes before a "·", ":" or " — " ("Lake · source of vapour" is a lake); inside it the LAST
  // keyword wins, English compounds being head-final ("water vapour" is vapour, "clock pulse" a pulse)
  const pick = s => { let best = null, at = -1, weak = null, wat = 1e9;
    for (const id in RX) { const re = new RegExp(RX[id].source, 'gi'); let m, last = -1; while ((m = re.exec(s))) { last = m.index + m[1].length; if (re.lastIndex === m.index) re.lastIndex++; } if (last < 0) continue; if (WEAK.has(id)) { const f = s.search(RX[id]); if (f < wat) { wat = f; weak = id; } } else if (last > at) { at = last; best = id; } }
    return best || (weak && wat <= 0 ? weak : null); };
  // a sentence (more than six words) is pictured by the first thing it names: its subject
  if (all.trim().split(/\s+/).length > 6) { let best = null, at = 1e9; for (const id in RX) { if (WEAK.has(id)) continue; const m = RX[id].exec(all); if (m && m.index < at) { at = m.index; best = id; } } return best; }
  const head = all.split(/\s*[·:—]\s*|\s-\s/)[0];
  return (head.trim() && pick(head)) || pick(all);
}
export const glyphIds = () => Object.keys(G);

// Draw glyph `id` into an SVG parent, centred on (x, y), `size` px across, in colour `color`. Returns the <g> or null.
export function drawGlyph(parent, id, x, y, size = 18, color = '#5a4632', opts = {}) {
  const g0 = G[id]; if (!g0) return null; const s = size / 24;
  const g = document.createElementNS(NS, 'g'); g.setAttribute('transform', `translate(${(x - size / 2).toFixed(1)} ${(y - size / 2).toFixed(1)}) scale(${s.toFixed(3)})`); g.setAttribute('class', 'glyph-wrap'); g.setAttribute('aria-hidden', 'true');
  const inner = document.createElementNS(NS, 'g'); const a = g0[2]; inner.setAttribute('class', 'glyph' + (a && ANIM.has(a) && opts.animate !== false ? ' anim g-' + a : ''));
  const p = document.createElementNS(NS, 'path'); p.setAttribute('d', g0[1]); p.setAttribute('fill', 'none'); p.setAttribute('stroke', color); p.setAttribute('stroke-width', String(opts.weight || 1.6)); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round'); p.setAttribute('vector-effect', 'non-scaling-stroke');
  if (opts.halo) { const h = p.cloneNode(); h.setAttribute('stroke', opts.halo); h.setAttribute('stroke-width', String((opts.weight || 1.6) + 3)); inner.append(h); }
  inner.append(p); g.append(inner); parent.append(g); return g;
}
// the same as an inline HTML <svg> (for cards and lists outside a figure)
export function glyphSVG(id, size = 18, color = 'currentColor') {
  const g0 = G[id]; if (!g0) return ''; const a = g0[2];
  return `<svg class="glyph-inline" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><g class="glyph${a && ANIM.has(a) ? ' anim g-' + a : ''}"><path d="${g0[1]}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`;
}
