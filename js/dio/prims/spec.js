// Pure helpers shared by the figure specs and their validators (no DOM, no imports: js/dio/domains.js, js/room/figspec.js
// and js/room/reveal.js use them in node as well as in the page).
//   clipSentence(s, n)  explanatory text kept whole: if it is longer than n characters it is cut at the last sentence end
//                       before n, and when there is none it is kept as it is (never cut mid-sentence, never an ellipsis)
//   normDepict(d)       a depiction spec ({kind, params}, js/dio/prims/depict.js) kept to known kinds and fields, or null
export function clipSentence(s, n = 600) {
  s = String(s ?? '').replace(/\s+/g, ' ').trim(); if (s.length <= n) return s;
  for (let i = n - 1; i >= n * .35; i--) { if (!/[.!?…]/.test(s[i])) continue; let j = i + 1; while (j < n && /["'”’)\]]/.test(s[j])) j++; if (j >= s.length || s[j] === ' ') return s.slice(0, j); }
  return s;
}
export const DEPICT_KINDS = ['agents', 'barrier', 'collision', 'tail', 'meter', 'thermometer', 'container', 'flow', 'spring', 'pendulum', 'wave', 'sound', 'cell', 'stall', 'gear', 'body', 'exchange', 'balance', 'glyph'];
// what each kind shows (the prompt lists these so the AI can name one)
export const DEPICT_USES = {
  agents: 'people or particles moving (mode random | aim; agent person | dot; heat: they speed up)',
  barrier: 'agents running at a barrier / threshold, only the energetic ones clearing it (height, focus one | speed | barrier | count, heat)',
  collision: 'two particles meeting: most bounce apart, a few react (react: the share that reacts; focus speed)',
  tail: 'a distribution of energies with the tail above a threshold shaded (cut; heat: the tail grows)',
  meter: 'a rate or amount on a dial (value, rising)', thermometer: 'a temperature rising or falling (from, to)',
  container: 'a stock filling or draining (level, inflow/outflow)', flow: 'a flow through a pipe (rate, narrow, spill: it pours out of a cut, stopped: a cut halts it)',
  spring: 'a spring and mass oscillating', pendulum: 'a pendulum swinging', wave: 'a travelling wave (rate, amp)',
  sound: 'sound pulsing from a source in rhythm (rate, rising)', cell: 'a cell with its membrane and particles crossing',
  stall: 'a market stall: price and buyers (trend up | down | flat)', gear: 'meshing gears turning (a mechanism)',
  body: 'an organism warming or cooling (creature cricket | person | animal; heat)', exchange: 'two-way traffic between two sides at equal rates (an equilibrium)',
  balance: 'a seesaw or balance tipping (tilt)', glyph: 'a still picture of the thing named (icon, label)'
};
const KEYS = { n: [2, 30, 'int'], speed: [0, 1], height: [0, 1], react: [0, 1], cut: [.1, .95], value: [0, 1], from: [0, 1], to: [0, 1], level: [0, 1], rate: [0, 1], amp: [0, 1], tilt: [-1, 1] };
const ENUMS = { trend: ['up', 'down', 'flat'], mode: ['random', 'aim'], agent: ['person', 'dot'], focus: ['one', 'speed', 'barrier', 'count'], creature: ['cricket', 'person', 'animal'], flowDir: ['in', 'out', 'both'] };
const BOOLS = ['heat', 'rising', 'narrow', 'falling', 'spill', 'stopped'];
// a depiction written by an AI (or by hand), kept to known kinds and fields; anything else is dropped
export function normDepict(d) {
  if (!d) return null; if (typeof d === 'string') d = { kind: d };
  if (typeof d !== 'object') return null; const kind = String(d.kind || '').toLowerCase(); if (!DEPICT_KINDS.includes(kind)) return null;
  const P = d.params && typeof d.params === 'object' ? d.params : {}, out = {};
  for (const k in KEYS) if (P[k] != null && isFinite(+P[k])) { const [lo, hi, t] = KEYS[k]; let v = Math.max(lo, Math.min(hi, +P[k])); if (t === 'int') v = Math.round(v); out[k] = v; }
  for (const k in ENUMS) if (ENUMS[k].includes(P[k])) out[k] = P[k];
  BOOLS.forEach(k => { if (typeof P[k] === 'boolean') out[k] = P[k]; });
  if (P.label) out.label = String(P.label).replace(/\s+/g, ' ').trim().slice(0, 24);
  if (P.icon && /^[a-z][\w-]{0,19}$/.test(P.icon)) out.icon = P.icon;
  return { kind, params: out };
}

