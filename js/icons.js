// A small set of line icons (24 × 24, drawn with the current text colour) for bookcases, scrolls and dioramas, with the
// words that call for each. iconFor(text) picks the icon whose words best match a name or a title (a bookcase called
// "Animal Behaviour" gets the paw, "Thermodynamics" the flame); the reader can always choose another for a bookcase.
// Matching is by whole word stems, the longest matching stem wins, and ties go to the icon listed first.
const I = {
  atom: { label: 'Atom', d: 'M12 12m-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0 -3.2 0 M12 3.5c4.7 0 8.5 3.8 8.5 8.5 M4.6 7.8c2.3-4 7.7-5.4 11.7-3.1 M12 3.5c-2.6 0-4.7 3.8-4.7 8.5s2.1 8.5 4.7 8.5 4.7-3.8 4.7-8.5-2.1-8.5-4.7-8.5z M3.6 9.4c-1.3 2.3 2.1 6.1 7.3 9.1s10.2 4 11.5 1.7-2.1-6.1-7.3-9.1S4.9 7.1 3.6 9.4z', words: ['physic', 'atom', 'quantum', 'nuclear', 'particle', 'mechanic', 'relativ'] },
  orbit: { label: 'Orbit', d: 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0 M2.5 12c0-2.2 4.3-4 9.5-4s9.5 1.8 9.5 4-4.3 4-9.5 4-9.5-1.8-9.5-4z M19.5 9.2m-1.1 0a1.1 1.1 0 1 0 2.2 0a1.1 1.1 0 1 0 -2.2 0', words: ['orbit', 'planet', 'astronom', 'space', 'cosmo', 'gravit', 'kepler', 'satellit', 'solar', 'stellar', 'galax'] },
  pendulum: { label: 'Pendulum', d: 'M5 3h14 M12 3l4.5 12 M16.5 17.5m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0 M7 12.5a7 7 0 0 0 3 3.6', words: ['pendul', 'oscillat', 'swing', 'harmonic', 'clock'] },
  wave: { label: 'Wave', d: 'M2 12c2.5-5 5-5 7.5 0s5 5 7.5 0 3.5-4 5-2 M2 18c2.5-3 5-3 7.5 0s5 3 7.5 0', words: ['wave', 'sound', 'acoust', 'vibrat', 'signal', 'frequen', 'ocean', 'light'] },
  lens: { label: 'Lens', d: 'M12 3c2.2 2.4 2.2 15.6 0 18-2.2-2.4-2.2-15.6 0-18z M2 9l10 3 10-3 M2 15l10-3 10 3', words: ['optic', 'lens', 'mirror', 'refract', 'telescop', 'microscop', 'vision', 'eye'] },
  bolt: { label: 'Lightning', d: 'M13.5 2.5 5 13.5h6l-1.5 8 8.5-11h-6z', words: ['electr', 'circuit', 'current', 'voltag', 'charge', 'power', 'energy', 'battery', 'arduino', 'esp32'] },
  magnet: { label: 'Magnet', d: 'M6 3v8a6 6 0 0 0 12 0V3 M6 3h4v8a2 2 0 0 0 4 0V3h4 M6 7h4 M14 7h4', words: ['magnet', 'field', 'induct', 'electromagn'] },
  flame: { label: 'Flame', d: 'M12 21.5c-3.9 0-6.5-2.6-6.5-6.2 0-3.6 2.8-5.4 3.7-9.3 2.3 1.6 3 3.7 3 5.3 1-.6 1.8-1.8 2-3.3 2.3 2 4.3 4.6 4.3 7.3 0 3.6-2.6 6.2-6.5 6.2z', words: ['thermo', 'heat', 'fire', 'combust', 'temperat', 'entropy', 'engine'] },
  flask: { label: 'Flask', d: 'M9 3h6 M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2.2h12.4a1.5 1.5 0 0 0 1.3-2.2L14 9V3 M7 15h10', words: ['chemi', 'reaction', 'molecul', 'acid', 'compound', 'element', 'laborat', 'bond', 'solution'] },
  dna: { label: 'DNA', d: 'M7 2.5c0 5 10 7 10 9.5s-10 4.5-10 9.5 M17 2.5c0 5-10 7-10 9.5s10 4.5 10 9.5 M8.5 6h7 M8.5 18h7 M10 9.2h4 M10 14.8h4', words: ['genet', 'dna', 'gene', 'heredit', 'evolut', 'molecular biol', 'genom', 'biolog'] },
  cell: { label: 'Cell', d: 'M12 12m-9 0a9 7.5 0 1 0 18 0a9 7.5 0 1 0 -18 0 M12 12m-3 0a3 2.5 0 1 0 6 0a3 2.5 0 1 0 -6 0 M6.5 9.5h.01 M17 15h.01 M7.5 15.5h.01', words: ['cell', 'membran', 'osmos', 'tissue', 'microb', 'bacteri', 'organel'] },
  leaf: { label: 'Leaf', d: 'M5 19c0-9 6-14 15-15-1 9-6 15-15 15z M5 19 13 11', words: ['plant', 'botan', 'ecolog', 'leaf', 'forest', 'photosynth', 'environment', 'nature', 'garden'] },
  paw: { label: 'Paw', d: 'M12 14c-3 0-5.5 2.7-5.5 4.8 0 1.5 1.3 2.2 2.6 2.2 1.2 0 1.9-.6 2.9-.6s1.7.6 2.9.6c1.3 0 2.6-.7 2.6-2.2 0-2.1-2.5-4.8-5.5-4.8z M5 10.5m-2 0a2 2.5 0 1 0 4 0a2 2.5 0 1 0 -4 0 M9.3 6m-2 0a2 2.5 0 1 0 4 0a2 2.5 0 1 0 -4 0 M14.7 6m-2 0a2 2.5 0 1 0 4 0a2 2.5 0 1 0 -4 0 M19 10.5m-2 0a2 2.5 0 1 0 4 0a2 2.5 0 1 0 -4 0', words: ['animal', 'behavio', 'zoolog', 'ethol', 'mammal', 'insect', 'bird', 'wildlife'] },
  heart: { label: 'Heart', d: 'M12 20.5s-8-4.9-8-11A4.6 4.6 0 0 1 12 6.8a4.6 4.6 0 0 1 8 2.7c0 6.1-8 11-8 11z M3.5 12h4l1.5-3 3 6 1.5-3h7', words: ['medic', 'health', 'anatom', 'physiolog', 'cardio', 'clinic', 'disease', 'nurs', 'pharma', 'body'] },
  brain: { label: 'Brain', d: 'M9 4.5a3 3 0 0 0-5 2.3 3 3 0 0 0-1 5.2 3 3 0 0 0 2 4.8 3.2 3.2 0 0 0 5 2.7V4.5z M15 4.5a3 3 0 0 1 5 2.3 3 3 0 0 1 1 5.2 3 3 0 0 1-2 4.8 3.2 3.2 0 0 1-5 2.7V4.5z M9 4.5a2.5 2.5 0 0 1 6 0', words: ['psycholog', 'neuro', 'brain', 'mind', 'cognit', 'learn', 'memory', 'emotion', 'percept', 'think'] },
  sigma: { label: 'Sigma', d: 'M18 4H6l6.5 8L6 20h12', words: ['math', 'algebra', 'calcul', 'equation', 'proof', 'theorem', 'number', 'arithm', 'invarian', 'operation'] },
  triangle: { label: 'Geometry', d: 'M12 3 21.5 20h-19z M12 3v17 M7.2 11.5h9.6', words: ['geometr', 'trigonom', 'angle', 'shape', 'topolog', 'vector'] },
  chart: { label: 'Chart', d: 'M3 21h18 M5 21V11h3v10 M10.5 21V6h3v15 M16 21v-7h3v7', words: ['statist', 'data', 'probabil', 'chart', 'graph', 'distribut', 'evidence', 'galton', 'measur', 'survey'] },
  coin: { label: 'Coins', d: 'M9 8.5m-6 0a6 2.5 0 1 0 12 0a6 2.5 0 1 0 -12 0 M3 8.5v4c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4 M9 15v3.5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-7c0-1.4-2.7-2.5-6-2.5', words: ['econom', 'market', 'price', 'money', 'financ', 'trade', 'supply', 'demand', 'bank', 'invest', 'accounting'] },
  briefcase: { label: 'Briefcase', d: 'M3 8h18v12H3z M8.5 8V5.5h7V8 M3 13h18', words: ['business', 'manag', 'strateg', 'organiz', 'marketing', 'entrepren', 'startup', 'leadership'] },
  globe: { label: 'Globe', d: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M3 12h18 M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z', words: ['geograph', 'earth', 'world', 'climat', 'global', 'countr', 'map'] },
  mountain: { label: 'Mountain', d: 'M2.5 20 9 8l4 7 2.5-4 6 9z M7.5 11l1.5 1.5 1.5-1.5', words: ['geolog', 'mountain', 'rock', 'volcan', 'tecton', 'landscap', 'valley', 'erosion'] },
  cloud: { label: 'Cloud', d: 'M7 18.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.5 1.5 3.8 3.8 0 0 1 .1 7.5z M8 21l1-1.5 M12 21l1-1.5 M16 21l1-1.5', words: ['weather', 'meteor', 'cloud', 'rain', 'water cycle', 'atmosph', 'humid', 'storm'] },
  gear: { label: 'Gear', d: 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0 M12 2.5v3 M12 18.5v3 M2.5 12h3 M18.5 12h3 M5.3 5.3l2.1 2.1 M16.6 16.6l2.1 2.1 M5.3 18.7l2.1-2.1 M16.6 7.4l2.1-2.1 M12 6a6 6 0 1 0 0 12 6 6 0 1 0 0-12z', words: ['engineer', 'machine', 'mechan', 'system', 'robot', 'lever', 'tool', 'technolog', 'build'] },
  code: { label: 'Code', d: 'M8 7 3 12l5 5 M16 7l5 5-5 5 M14 4l-4 16', words: ['program', 'code', 'comput', 'software', 'algorithm', 'javascript', 'python', 'web', 'coding', 'developer'] },
  chip: { label: 'Chip', d: 'M7 7h10v10H7z M10 10h4v4h-4z M9.5 3v4 M14.5 3v4 M9.5 17v4 M14.5 17v4 M3 9.5h4 M3 14.5h4 M17 9.5h4 M17 14.5h4', words: ['electron', 'hardware', 'chip', 'microcontr', 'artificial', 'machine learn', 'neural net', 'transformer'] },
  scales: { label: 'Scales', d: 'M12 3v18 M8 21h8 M4 7h16 M4 7l-2.5 6a2.5 2.5 0 0 0 5 0z M20 7l-2.5 6a2.5 2.5 0 0 0 5 0z', words: ['law', 'legal', 'justice', 'ethic', 'moral', 'right', 'constitut', 'court', 'politic', 'govern'] },
  column: { label: 'Column', d: 'M3 21h18 M4 18h16 M5 8h14 M12 3 3.5 8h17z M7 8v10 M12 8v10 M17 8v10', words: ['histor', 'ancient', 'classic', 'civiliz', 'empire', 'archaeolog', 'warfare', 'battle', 'revolut'] },
  people: { label: 'People', d: 'M8 8m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0 M16.5 9m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0 M2.5 20c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5 M14 15c3.6-.6 7.5 1 7.5 5', words: ['sociolog', 'society', 'social', 'anthropolog', 'communit', 'culture', 'population', 'communicat', 'educat', 'teach'] },
  quill: { label: 'Quill', d: 'M20 3c-7 1-12 6-13.5 13.5L5 21 M20 3c-1 4-3 6.5-6 8 M20 3c-3.5 1-6 2.5-7.5 5 M6.5 16.5c3 0 6-1 7.5-5.5', words: ['literat', 'writ', 'poet', 'novel', 'story', 'narrat', 'author', 'essay', 'rhetoric', 'explain'] },
  speech: { label: 'Language', d: 'M4 5h16v11H11l-5 4v-4H4z M8 9.5h8 M8 12.5h5', words: ['language', 'linguist', 'grammar', 'vocabul', 'english', 'french', 'spanish', 'translat', 'argument', 'dialog'] },
  owl: { label: 'Owl', d: 'M6 4l2.5 2h7L18 4v9a6 6 0 0 1-12 0z M9.5 11m-1.8 0a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0 M14.5 11m-1.8 0a1.8 1.8 0 1 0 3.6 0a1.8 1.8 0 1 0 -3.6 0 M11.2 14.5 12 16l.8-1.5', words: ['philosoph', 'logic', 'wisdom', 'metaphys', 'epistem', 'reason'] },
  palette: { label: 'Palette', d: 'M12 3a9 9 0 0 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.4-1.3-1.7-1.3-3s1-2.3 2.3-2.3H17a4 4 0 0 0 4-4C21 6.4 17 3 12 3z M7.5 11.5h.01 M9 7.5h.01 M14 6.5h.01 M17 10h.01', words: ['art', 'paint', 'design', 'colour', 'color', 'draw', 'visual', 'architect', 'photograph'] },
  music: { label: 'Music', d: 'M9 18V5l11-2v13 M9 18m-3 0a3 2.5 0 1 0 6 0a3 2.5 0 1 0 -6 0 M17 16m-3 0a3 2.5 0 1 0 6 0a3 2.5 0 1 0 -6 0', words: ['music', 'song', 'harmony', 'rhythm', 'compos', 'instrument'] },
  compass: { label: 'Compass', d: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0 M15.5 8.5l-2 5-5 2 2-5z', words: ['navigat', 'explor', 'travel', 'outdoor', 'backcountry', 'survival', 'hik', 'discovery'] },
  bulb: { label: 'Idea', d: 'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.1 2.2h5c0-.9.5-1.7 1.1-2.2A6 6 0 0 0 12 3z', words: ['idea', 'invent', 'innovat', 'creativ', 'insight', 'predict'] },
  dice: { label: 'Dice', d: 'M4 4h16v16H4z M8.5 8.5h.01 M15.5 8.5h.01 M12 12h.01 M8.5 15.5h.01 M15.5 15.5h.01', words: ['chance', 'random', 'game', 'gambl', 'coin flip', 'bead'] },
  hourglass: { label: 'Hourglass', d: 'M6 3h12 M6 21h12 M7 3c0 5 10 5 10 9s-10 4-10 9 M17 3c0 5-10 5-10 9s10 4 10 9', words: ['time', 'chronolog', 'period', 'decay', 'rate', 'kinetic'] },
  ball: { label: 'Ball', d: 'M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0 -16 0 M4 12c3-1 5-4 5-8 M20 12c-3 1-5 4-5 8', words: ['projectil', 'collision', 'motion', 'momentum', 'kinemat', 'velocity', 'force', 'cannon', 'bounce', 'sport'] },
  book: { label: 'Book', d: 'M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5z M4 19.5A1.5 1.5 0 0 0 5.5 21H20 M8 7h8', words: ['book', 'read', 'study', 'general', 'misc', 'library'] },
  scroll: { label: 'Scroll', d: 'M6 4h11a2 2 0 0 1 2 2v12 M6 4a2 2 0 0 0-2 2v1h4 M6 4a2 2 0 0 1 2 2v12a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-1H10 M11 9h5 M11 12h5', words: ['scroll', 'manuscript', 'chapter', 'part'] },
  cube: { label: 'Model', d: 'M12 2.5 21 7.5v9l-9 5-9-5v-9z M3 7.5l9 5 9-5 M12 12.5v9', words: ['model', 'diorama', 'custom', 'scene', 'simulat'] },
};
export const ICONS = I;
export const ICON_NAMES = Object.keys(I);
// the dioramas' own models have a fixed icon
const BY_TYPE = { pendulum: 'pendulum', doublependulum: 'pendulum', spring: 'wave', projectile: 'ball', orbit: 'orbit', collision: 'ball', incline: 'triangle', wave: 'wave', gas: 'flame', surface: 'chart', weatherglass: 'cloud', lever: 'gear', reaction: 'flask', efield: 'magnet', circuit: 'bolt', lens: 'lens', custom3d: 'cube' };
const norm = t => ' ' + String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ') + ' ';
// the icon a name or title calls for ('' when no word matches and no fallback is given)
export function iconFor(text, fallback = 'book') {
  const s = norm(text); let best = '', len = 0;
  for (const k of ICON_NAMES) for (const w of I[k].words) if (w.length > len && s.includes(' ' + w)) { best = k; len = w.length; }
  return best || fallback;
}
// a diorama: its model's icon, else what its title (or the step's) is about
export function dioramaIcon(spec) { const d = spec || {}; return BY_TYPE[d.type] || iconFor([d.title, d.sceneTitle].filter(Boolean).join(' '), 'cube'); }
// markup: an inline SVG, for HTML (size in px)
export function iconSVG(name, size = 18, cls = 'ico') {
  const ic = I[name] || EXTRA[name] || I.book;
  return `<svg class="${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${ic.d}"/></svg>`;
}
// the path data alone (for drawing inside another SVG)
export const iconPath = name => (I[name] || EXTRA[name] || I.book).d;
export const iconLabel = name => (I[name] || EXTRA[name] || I.book).label;
// Symbols chosen from the library (js/symbols.js, 'lu:<name>'): their drawing is kept with what wears it (iconD on a
// bookcase or a scroll, so an exported library carries it) and in this browser, so it draws at once, before the
// library itself is loaded. Unknown names draw as the book.
const EXTRA = {}, XKEY = 'sm-icons';
try { Object.assign(EXTRA, JSON.parse(localStorage.getItem(XKEY) || '{}')); } catch (e) { }
export function rememberIcon(name, label, d) { if (!name || !d || I[name]) return; if (EXTRA[name] && EXTRA[name].d === d) return; EXTRA[name] = { label: label || name, d, words: [] }; try { localStorage.setItem(XKEY, JSON.stringify(EXTRA)); } catch (e) { } }
export const knownIcon = name => !!(I[name] || EXTRA[name]);
export const iconD = name => (I[name] || EXTRA[name] || {}).d || '';
