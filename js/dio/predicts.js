// Predictions for the built-in dioramas' steps (engine.js, "Predict, then play"), merged in at run time by the step's
// title, so libraries saved before they existed get them too, and a step the reader rewrote (other title) is left alone.
// Each has one correct option; the wrong ones are the common misconceptions. Sources: Clausius–Clapeyron ≈ 7 %/K
// (Koutsoyiannis 2012); rain shadow (Roe 2005); budget constraint (Gode & Sunder 1993); binomial spread √(Np(1−p)).
const O = (text, correct, why) => ({ text, ...(correct ? { correct: true } : {}), ...(why ? { why } : {}) });
export const LESSON_PREDICT = {
  'Heat the lake': [O('Evaporation falls: warm air holds the water in.'), O('Evaporation rises: more molecules have the energy to leave.', true, 'The saturation vapour pressure rises about 7 % per kelvin, so warmer water evaporates faster.'), O('Nothing changes until the lake boils.')],
  'Over the crest': [O('It cools again and rains on the far side too.'), O('It warms as it sinks and arrives dry: a rain shadow.', true, 'Sinking air is compressed and warms; it has already lost its water on the windward slope.'), O('It stays as cold as it was at the crest.')],
  'Costs rise': [O('The price settles higher, and fewer trades happen.', true, 'Supply shifts up: buyers pay more and some trades are no longer worth making.'), O('The price falls: sellers must compete harder.'), O('The price stays put; only the number of trades falls.')],
  'Drop the budget rule': [O('Yes: a market always finds the crossing.'), O('No: without the rule the prices scatter and much of the gain from trade is lost.', true, 'Gode & Sunder (1993): the budget rule, not the traders’ intelligence, does most of the work.')],
  'Bias the pegs': [O('The pile stays centred and only gets narrower.'), O('The hump moves towards the favoured side and keeps its bell shape.', true, 'Each bounce is still independent, so the sum is still binomial: its centre moves to Np.'), O('All the beads pile up against one edge.')],
  'More rows': [O('About twice as wide.'), O('About 1.4 times as wide (√2).', true, 'The spread is √(Np(1−p)): twice the rows, √2 times the width.'), O('The same width: the pegs are the same.')],
  'More solute': [O('The column on the solute side rises higher.', true, 'More solute, more osmotic pressure: a taller column is needed to balance it.'), O('It falls: the solute takes up the room.'), O('Nothing changes once it was at equilibrium.')],
  'Push back: reverse osmosis': [O('Water flows from the salty side to the fresh side.', true, 'Push harder than the osmotic pressure and the flow reverses: that is how desalination works.'), O('All flow stops for good.'), O('Water rushes into the salty side faster.')],
};
export function withPredict(l) { if (!l || l.predict || !LESSON_PREDICT[l.title]) return l; return { ...l, predict: { options: LESSON_PREDICT[l.title] } }; }
