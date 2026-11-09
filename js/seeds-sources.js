// Grounding for the example library. Every reference below was checked against OpenAlex on 2026-11-03
// (resolve_references: "exact" match by DOI or title), so the seed rooms show what a grounded chain looks like.
// The teaching fields (terms, intuition, misconception, check) follow docs/PEDAGOGY.md; their figures and the steps'
// explanatory paragraphs are in seeds-figures.js.
import { figureChain } from './seeds-figures.js';
const W = (id, doi, authors, year, title, venue, note, cited) => ({ title, authors, year, doi, venue, note, url: doi ? 'https://doi.org/' + doi : 'https://openalex.org/' + id, openalex: 'https://openalex.org/' + id, verified: true, check: 'exact', cited_by: cited });
export const REF = {
  nelson: W('W2043069373', '10.1119/1.14703', 'Nelson R A; Olsson M G', 1986, 'The pendulum—Rich physics from a simple system', 'American Journal of Physics', '', 205),
  shinbrot: W('W2039671349', '10.1119/1.16860', 'Shinbrot T; Grebogi C; Wisdom J; Yorke J A', 1992, 'Chaos in a double pendulum', 'American Journal of Physics', '', 195),
  lenz: W('W2067320877', '10.1119/1.9745', 'Goldstein H', 1975, 'Prehistory of the “Runge–Lenz” vector', 'American Journal of Physics', '', 111),
  codata: W('W4285421256', '10.1103/RevModPhys.93.025010', 'Tiesinga E; Mohr P J; Newell D B; Taylor B N', 2021, 'CODATA recommended values of the fundamental physical constants: 2018', 'Reviews of Modern Physics', '', 954),
  lecam: W('W2014957836', '10.1214/ss/1177013818', 'Le Cam L', 1986, 'The Central Limit Theorem Around 1935', 'Statistical Science', '', 167),
  galton: W('W2502459556', '10.5962/bhl.title.32181', 'Galton F', 1889, 'Natural Inheritance', 'Macmillan', 'where the quincunx (Galton board) is described', 607),
  gibbs: W('W2006763798', '10.1007/BF00330404', 'Hewitt E; Hewitt R E', 1979, 'The Gibbs-Wilbraham phenomenon: An episode in Fourier analysis', 'Archive for History of Exact Sciences', '', 355),
  lighthill: W('W1988591348', '10.1017/cbo9781139171427', 'Lighthill M J', 1958, 'An Introduction to Fourier Analysis and Generalised Functions', 'Cambridge University Press', '', 1296),
  arrhenius: W('W4253789658', '10.1515/zpch-1889-0416', 'Arrhenius S', 1889, 'Über die Reaktionsgeschwindigkeit bei der Inversion von Rohrzucker durch Säuren', 'Zeitschrift für Physikalische Chemie', 'the original rate–temperature law', 1621),
  laidler: W('W2052953969', '10.1021/ed061p494', 'Laidler K J', 1984, 'The development of the Arrhenius equation', 'Journal of Chemical Education', '', 1708),
  storm: W('W4410340714', '10.1021/acs.jchemed.5c00131', 'Williams H D', 2025, 'The Storm Glass Thermometer: Temperature Dependence of Camphor Crystal Formation in Ethanol', 'Journal of Chemical Education', 'crystal growth tracks temperature, not coming weather', 1),
  trenberth: W('W2032993224', '10.1175/JHM600.1', 'Trenberth K E; Smith L; Qian T; Dai A; Fasullo J', 2007, 'Estimates of the Global Water Budget and Its Annual Cycle Using Observational and Model Data', 'Journal of Hydrometeorology', 'reservoirs and fluxes of the global water cycle', 953),
  oki: W('W2166186402', '10.1126/science.1128845', 'Oki T; Kanae S', 2006, 'Global Hydrological Cycles and World Water Resources', 'Science', '', 4373),
  jasechko: W('W2018043145', '10.1038/nature11983', 'Jasechko S; Sharp Z D; Gibson J J; Birks S J; Yi Y', 2013, 'Terrestrial water fluxes dominated by transpiration', 'Nature', 'plants, not open water, return most land water to the air (isotope estimate 80–90 %; other methods give lower shares)', 1412),
  koutsoyiannis: W('W1975518602', '10.1088/0143-0807/33/2/295', 'Koutsoyiannis D', 2012, 'Clausius–Clapeyron equation and saturation vapour pressure: simple theory reconciled with practice', 'European Journal of Physics', '', 189),
  roe: W('W4240717376', '10.1146/annurev.earth.33.092203.122541', 'Roe G H', 2005, 'Orographic precipitation', 'Annual Review of Earth and Planetary Sciences', '', 810),
  smith62: W('W4246756863', '10.1086/258609', 'Smith V L', 1962, 'An Experimental Study of Competitive Market Behavior', 'Journal of Political Economy', 'classroom double auctions converge to the supply–demand price', 1081),
  gode: W('W2018567859', '10.1086/261868', 'Gode D K; Sunder S', 1993, 'Allocative Efficiency of Markets with Zero-Intelligence Traders', 'Journal of Political Economy', 'the market rules, not trader cleverness, do much of the work', 1656),
  vanthoff: W('W2581845315', '10.1515/zpch-1887-0151', "van 't Hoff J H", 1887, 'Die Rolle des osmotischen Druckes in der Analogie zwischen Lösungen und Gasen', 'Zeitschrift für Physikalische Chemie', 'π = cRT for dilute solutions', 266),
  kedem: W('W2107618142', '10.1016/0006-3002(58)90330-5', 'Kedem O; Katchalsky A', 1958, 'Thermodynamic analysis of the permeability of biological membranes to non-electrolytes', 'Biochimica et Biophysica Acta', 'flow J = Lp(ΔP − σΔπ)', 2234),
  kramer: W('W1986283716', '10.1016/j.tplants.2012.12.001', 'Kramer E M; Myers D R', 2013, 'Osmosis is not driven by water dilution', 'Trends in Plant Science', 'corrects the “water diffuses down its own concentration gradient” picture', 37),
  agre: W('W2052922251', '10.1126/science.256.5055.385', 'Preston G M; Carroll T P; Guggino W B; Agre P', 1992, 'Appearance of Water Channels in Xenopus Oocytes Expressing Red Cell CHIP28 Protein', 'Science', 'discovery of aquaporin water channels', 2060),
};

// keyed by chain title, then step id
const G = {
  'The simple pendulum': {
    S5: { intuition: 'For small swings the restoring push is almost exactly proportional to how far the bob is from the bottom, like a spring.', misconception: 'That the period depends on the mass. It does not: mass cancels from both sides of Newton’s law.', check: { q: 'You double the release angle from 4° to 8°. Does the period change noticeably?', a: 'No: the first correction is (1/16)θ₀², about 0.12 % at 8°, so the small-angle period still holds.' }, basis: 'derived', sources: [REF.nelson] },
    S8: { intuition: 'Big swings spend longer near the top, where the bob moves slowly, so the period grows with amplitude.', misconception: 'That the pendulum is isochronous at every amplitude (Galileo’s claim). It is only for small angles.', check: { q: 'Released from 90°, is the period longer or shorter than 2π√(L/g), and by about how much?', a: 'Longer, by about 18 % (K(sin 45°)·2/π ≈ 1.18).' }, basis: 'derived', sources: [REF.nelson] },
  },
  'From thrown stones to orbits': {
    S4: { intuition: 'A planet sweeps equal areas in equal times because a central pull can change its speed but never its twisting motion about the Sun.', misconception: 'That planets move at constant speed. They speed up near the Sun and slow down far from it.', check: { q: 'Why does a central force exert no torque?', a: 'Torque is r × F, and F is parallel to r, so the cross product is zero.' }, basis: 'derived', sources: [REF.lenz] },
  },
  'Five laboratories': {
    S2: { intuition: 'Chaos is not randomness: the motion is fully determined, but tiny differences in the start grow exponentially fast.', misconception: 'That a deterministic law always gives predictable long-term behaviour.', check: { q: 'Two releases differ by 0.001 rad. Why do the swings soon look unrelated?', a: 'The separation grows like e^{λt} with a positive Lyapunov exponent λ, so after a few seconds it is as large as the motion itself.' }, basis: 'standard', sources: [REF.shinbrot] },
    S3: { terms: [{ term: 'k', meaning: 'Coulomb constant, 1/(4πε₀) ≈ 8.988×10⁹ N m² C⁻²' }], misconception: 'That field lines are paths charges follow. They give the force direction, not the trajectory, once a charge is moving.', basis: 'standard', sources: [REF.codata] },
  },
  'Linear maps, complex numbers and harmonics': {
    S4: { intuition: 'Any repeating shape can be built by stacking circles turning at whole-number speeds.', misconception: 'That adding more terms removes the overshoot at a jump. The overshoot (about 9 % of the jump) stays; it only gets narrower (Gibbs phenomenon).', check: { q: 'A square wave contains which harmonics?', a: 'Only odd ones, with amplitudes 4/(πk).' }, basis: 'standard', sources: [REF.lighthill, REF.gibbs] },
    S5: { intuition: 'Adding up many small independent nudges smooths out every peculiarity of the individual nudges, leaving a bell curve.', misconception: 'That the data themselves become normal for large samples. It is the distribution of the mean (or sum) that becomes normal.', check: { q: 'The spread of the mean of n draws shrinks how fast?', a: 'Like σ/√n: quadrupling n halves it.' }, basis: 'standard', sources: [REF.lecam] },
  },
  'Collision theory and chemical equilibrium': {
    S2: { terms: [{ term: 'E_a', meaning: 'activation energy, J mol⁻¹' }, { term: 'R', meaning: 'molar gas constant, 8.314 J mol⁻¹ K⁻¹' }, { term: 'A', meaning: 'pre-exponential factor: collision frequency × orientation factor' }], intuition: 'Heating does not make every collision a little better; it makes the rare, energetic ones much more common.', misconception: 'That reactions double in rate for every 10 K everywhere. That rule of thumb holds only for E_a near 50 kJ/mol around room temperature.', check: { q: 'Plot ln k against 1/T. What is the slope?', a: '−E_a/R, a straight line if the Arrhenius law holds.' }, basis: 'empirical', sources: [REF.arrhenius, REF.laidler] },
  },
  'Weather glass, storm glass and barometer': {
    S8: { misconception: 'That a storm glass forecasts storms. Controlled measurements show its crystals respond to temperature, not to pressure or approaching weather.', basis: 'empirical', sources: [REF.storm] },
  },
  'The water cycle': {
    S1: { terms: [{ term: 'evaporation', meaning: 'liquid → vapour at the surface; needs about 2.45 MJ per kg of water (latent heat at 20 °C)' }], intuition: 'The sun is the pump: its energy lifts water as vapour; gravity brings it back down.', misconception: 'That most water reaching the air over land comes from lakes and rivers. Most comes through plants (transpiration).', check: { q: 'Why does a lake cool on a windy, dry day?', a: 'Evaporation takes latent heat from the water, and wind and dry air keep it going.' }, basis: 'empirical', sources: [REF.trenberth, REF.oki, REF.jasechko] },
    S2: { statement: 'Above water at temperature $T$, vapour accumulates until its partial pressure reaches the saturation vapour pressure $e_s(T)$; $e_s$ rises about 7 % per kelvin (Clausius–Clapeyron), so cooler air reaches saturation sooner.', terms: [{ term: '$e_s(T)$', meaning: 'saturation vapour pressure, about 2.34 kPa at 20 °C' }], intuition: 'Cooling, not squeezing, is what wrings water out of air.', misconception: '“Air holds water like a sponge.” Saturation is a property of water at a temperature, not of the air; it would be the same with no air present.', check: { q: 'Air at 20 °C and 50 % relative humidity is cooled. At about what temperature does dew form?', a: 'Near 9 °C, where e_s has fallen to half of its 20 °C value (about 1.17 kPa).' }, basis: 'standard', sources: [REF.koutsoyiannis] },
    S3: { intuition: 'A mountain is a lift: rising air expands, cools, and drops its water on the windward side, leaving a rain shadow behind.', misconception: 'That clouds “run into” mountains. The air is forced upward and cools by expansion; the cloud forms there.', check: { q: 'Which side of the range is drier, and why?', a: 'The lee side: the descending air warms by compression and has already lost water.' }, basis: 'standard', sources: [REF.roe] },
  },
  'Galton board': {
    S1: { terms: [{ term: '$p$', meaning: 'probability of a right bounce at one peg (0.5 for a symmetric peg)' }], check: { q: 'Is the bounce at one peg affected by the previous one?', a: 'In the model, no: independence is an assumption the board approximates.' }, basis: 'standard', sources: [REF.galton] },
    S2: { intuition: 'Many paths lead to the middle bins and only one leads to each edge; counting paths is the binomial coefficient.', check: { q: 'With 10 rows and p = 0.5, how many paths end in the centre bin?', a: 'C(10,5) = 252 of 1024.' }, basis: 'derived', sources: [REF.galton] },
    S3: { misconception: 'That each ball “aims” for the centre. Each bounce is fair; the hump comes only from counting paths.', check: { q: 'Doubling the number of rows makes the spread of the pile grow by what factor?', a: '√2: the standard deviation is √(Np(1−p)).' }, basis: 'standard', sources: [REF.lecam, REF.galton] },
  },
  'Supply and demand': {
    S3: { intuition: 'Shortages bid prices up and surpluses push them down, until neither side is left waiting.', misconception: 'That equilibrium needs well-informed, rational traders. Experiments find convergence even with random-bidding robots under double-auction rules.', check: { q: 'If a tax raises sellers’ costs, which curve shifts, and which way does p* move?', a: 'Supply shifts left (up), so p* rises and the quantity traded falls.' }, basis: 'empirical', sources: [REF.smith62, REF.gode] },
  },
  'Osmosis': {
    S1: { sources: [REF.agre], intuition: 'Real cell membranes let water through mainly by aquaporin channels, single-file water pores.' },
    S2: { statement: 'Solute that cannot pass lowers the water’s chemical potential on its side; water flows across the membrane towards the solute until the pressure built up there balances it.', intuition: 'The solute side “pulls” water by lowering its free energy, and a pressure head pushes back.', misconception: 'That water simply diffuses down its own concentration gradient. In pores the flow is largely bulk flow driven by the difference in water chemical potential.', check: { q: 'Will water flow if both sides have equal concentrations of a solute the membrane passes freely?', a: 'No: a freely passing solute (σ = 0) creates no osmotic driving force.' }, basis: 'standard', sources: [REF.kedem, REF.kramer] },
    S3: { terms: [{ term: '$\\pi$', meaning: 'osmotic pressure, Pa' }, { term: '$c$', meaning: 'molar concentration of solute particles (osmolarity), mol m⁻³' }], misconception: 'Forgetting dissociation: NaCl gives about two particles per formula unit, so π ≈ 2cRT (the van ’t Hoff factor i).', check: { q: 'Estimate π for 0.15 mol/L NaCl at 37 °C.', a: 'π ≈ 2 × 150 mol m⁻³ × 8.314 × 310 K ≈ 7.7 × 10⁵ Pa, about 7.6 atm.' }, basis: 'standard', sources: [REF.vanthoff, REF.kedem] },
  },
};
const PART_REFS = { 'The water cycle': ['trenberth', 'oki', 'jasechko', 'koutsoyiannis', 'roe'], 'Galton board': ['galton', 'lecam'], 'Supply and demand': ['smith62', 'gode'], 'Osmosis': ['vanthoff', 'kedem', 'kramer', 'agre'] };

// sources and teaching text (G), then the explanatory paragraphs and the figures of every teaching box (seeds-figures.js)
// The Revelation Engine's loops (js/room/reveal.js) for the example library: what the reader predicts, the rule that
// is revealed, the case where that rule stops working (every rule ships with its edge), and a new situation that comes
// back days later. Numbers checked: 8° → (1/16)θ² ≈ 0.12 %; T(90°)/T₀ = 2K(sin 45°)/π ≈ 1.180, T(60°)/T₀ ≈ 1.073;
// a clock decaying 4° → 3° shortens its period by ≈ 0.0134 %, ≈ 11.6 s a day; √(g_E/g_M) = √(9.81/1.62) ≈ 2.46.
const RV = {
  'The simple pendulum': {
    S5: { type: 'quantitative', hook: 'You double the release angle from 4° to 8°. What happens to the time of one swing?',
      predict: { options: [
        { text: 'About twice as long: the bob travels twice as far.', why: 'It also moves about twice as fast: for small angles the restoring push grows in proportion to the distance, so the two cancel.' },
        { text: 'Noticeably longer, by roughly a tenth.', why: 'That happens only for big swings (about 7 % at 60°).' },
        { text: 'The same, to about a tenth of a percent.', correct: true, why: 'The first correction is (1/16)θ₀², about 0.12 % at 8°.' }] },
      rule: 'For small swings the period does not depend on the amplitude: $T_0 = 2\pi\sqrt{L/g}$.',
      misconception: 'That a wider swing must take longer because its path is longer. For small angles the bob also moves proportionally faster.',
      boundary: { case: 'Large swings: the period is about 7 % longer at 60° and about 18 % longer at 90°.', why: 'The restoring push grows like sin θ, not θ, so near the top it is weaker than the straight-line rule assumes.' },
      transfer: { q: 'The same 1 m pendulum is taken to the Moon, where g ≈ 1.62 m/s² (about 1/6 of Earth’s). Its period becomes…', options: [{ text: 'About 6 times longer.' }, { text: 'About 2.5 times longer.', correct: true }, { text: 'Unchanged: the length is the same.' }], why: 'T₀ ∝ 1/√g, and √(9.81/1.62) ≈ 2.46.' } },
    S8: { type: 'quantitative', hook: 'Released from 90°, is one swing longer or shorter than $2\pi\sqrt{L/g}$, and by about how much?',
      predict: { options: [{ text: 'Shorter, by about 18 %.' }, { text: 'The same: amplitude never matters.', why: 'True only for small swings.' }, { text: 'Longer, by about 18 %.', correct: true, why: 'T/T₀ = (2/π)·K(sin 45°) ≈ 1.18.' }, { text: 'About twice as long.' }] },
      rule: 'The period grows with amplitude: $T = T_0\cdot\frac{2}{\pi}K\!\left(\sin\frac{\theta_0}{2}\right)$.',
      misconception: 'That a pendulum is isochronous at every amplitude (Galileo’s claim). It is only for small angles.',
      boundary: { case: 'Towards 180° the period grows without limit (the bob balances at the top), and a bob on a string released from rest above 90° does not follow the circle at all: the string goes slack.', why: 'The formula assumes a rigid rod, or a string that stays taut.' },
      transfer: { q: 'A pendulum clock’s swing slowly dies down from 4° to 3° over a week. What happens to the time it keeps?', options: [{ text: 'Nothing: the period does not depend on amplitude.' }, { text: 'It runs fast, by roughly ten seconds a day.', correct: true }, { text: 'It runs slow, by minutes a day.' }], why: 'A smaller swing has a slightly shorter period: (1/16)(θ₁² − θ₂²) ≈ 0.013 %, about 12 s a day. Tiny for a swing, large for a clock, which is why clocks hold their amplitude constant.' } },
  },
  'The water cycle': {
    S3: { type: 'causal', hook: 'Moist wind blows over a mountain range. Which side ends up drier?',
      predict: { options: [{ text: 'The windward side, which the wind hits first.', why: 'That is where it rains: the air is forced up and cools there.' }, { text: 'The lee side, beyond the crest.', correct: true, why: 'The air arrives there already wrung out, and warms as it sinks.' }, { text: 'Neither: the wind carries the same water over both.' }] },
      rule: 'Air forced up a slope cools by expansion (about 10 °C per km while clear, about 6 °C per km once cloudy) and rains out on the windward side; the sinking air beyond is warm and dry: a rain shadow.',
      misconception: 'That clouds “run into” mountains. The air is forced upward and cools by expansion; the cloud forms in it.',
      boundary: { case: 'Air too dry to reach saturation before the crest gives little rain and only a weak shadow; and where drops form and drift slowly, much of the rain spills over onto the lee side.', why: 'Roe (2005) reviews both.' },
      transfer: { q: 'Seattle lies west of the Cascade Range, Yakima just east of it; the moist winds come mostly off the Pacific. Which city is drier?', options: [{ text: 'Seattle' }, { text: 'Yakima', correct: true }, { text: 'About the same' }], why: 'Yakima is in the Cascades’ rain shadow: about 20 cm of precipitation a year against Seattle’s nearly a metre.' } },
  },
  'Galton board': {
    S3: { type: 'quantitative', hook: 'Doubling the number of rows makes the spread of the pile grow by what factor?',
      predict: { options: [{ text: 'It doubles.', why: 'That would need every bounce to push the same way.' }, { text: 'By about √2 ≈ 1.41.', correct: true, why: 'σ = √(Np(1−p)): twice N, √2 times σ.' }, { text: 'It stays the same.' }, { text: 'It quadruples.' }] },
      rule: 'Independent nudges add their variances, so the spread grows as the square root of their number: $\sigma = \sqrt{Np(1-p)}$.',
      misconception: 'That each ball “aims” for the centre. Each bounce is fair; the hump comes only from counting paths.',
      boundary: { case: 'Correlated bounces (a ball that went right tends to go right again) spread faster than √N.', why: 'Variances add only for independent steps.' },
      transfer: { q: 'You average 4 times as many measurements of the same quantity. The random error of the average…', options: [{ text: 'Halves.', correct: true }, { text: 'Falls to a quarter.' }, { text: 'Does not change.' }], why: 'The error of a mean falls as 1/√N: four times the data, half the error.' } },
  },
  'Supply and demand': {
    S3: { type: 'causal', hook: 'A tax raises sellers’ costs. Which curve shifts, and which way does the price $p^*$ move?',
      predict: { options: [{ text: 'Demand shifts left, so $p^*$ falls.', why: 'Buyers’ willingness to pay has not changed; sellers’ costs have.' }, { text: 'Supply shifts left (up), so $p^*$ rises and less is traded.', correct: true }, { text: 'Both shift and $p^*$ stays put.' }] },
      rule: 'A cost on sellers lifts the supply curve by the tax; buyers pay part through a higher price, sellers absorb the rest, and the quantity traded falls.',
      misconception: 'That whoever the law says pays the tax bears it. Who bears it depends on the slopes of the curves, not on the law.',
      boundary: { case: 'If demand is perfectly inelastic (people buy the same amount at any price), the quantity does not fall and buyers bear all of the tax.', why: 'The burden falls on the side less able to walk away.' },
      transfer: { q: 'A tax of $1 a pack is put on cigarettes, whose demand barely responds to price. Who ends up paying most of it?', options: [{ text: 'Smokers, through higher prices.', correct: true }, { text: 'Tobacco companies, through lower margins.' }, { text: 'It splits evenly, whatever the curves.' }], why: 'Inelastic demand: buyers cannot easily walk away, so most of the tax shows up in the price.' } },
  },
};
// the example scrolls in libraries seeded before the loops existed get them on first open (reader.js); a step that
// already has one (or that the reader edited) keeps it. Returns whether anything was added.
export function addReveals(A) { const rv = A && RV[A.title]; let n = 0; if (rv) for (const st of A.chain || []) if (rv[st.id] && !st.reveal) { st.reveal = JSON.parse(JSON.stringify(rv[st.id])); n++; } return n > 0; }
export function groundChain(A) {
  const g = G[A.title];
  if (g) for (const st of A.chain || []) { const x = g[st.id]; if (x) Object.assign(st, JSON.parse(JSON.stringify(x))); }
  const rv = RV[A.title]; if (rv) for (const st of A.chain || []) if (rv[st.id] && !st.reveal) st.reveal = JSON.parse(JSON.stringify(rv[st.id]));
  if (PART_REFS[A.title]) A.references = PART_REFS[A.title].map(k => ({ ...REF[k] }));
  return figureChain(A);
}
