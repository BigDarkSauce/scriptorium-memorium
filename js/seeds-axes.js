// Axis titles for the example library's graphs: every axis names its quantity and gives its unit ONCE, in the title
// ("release angle θ (°)"), and the tick or category labels carry bare numbers ("10", "20" …), never "10°", "20°" ….
// Keyed like seeds-figures.js: chain title → "step id/slot" → [x title, y title, category labels (optional)].
// slot: explain0…, statement, intuition, misconception, check, demo0…. A dimensionless quantity says so ("(ratio)",
// "(count)", "(share)") rather than leaving the reader to wonder whether a unit was forgotten.
// Applied by applyAxes (seeds-sources.js groundChain for new rooms; main.js threadFromSeeds v5 for saved ones): it
// fills a missing title, replaces a title that is only a bare unit ("N"), and replaces categories only when they are
// still the seed's own (same count), so nothing the learner wrote is overwritten.
export const AXES = {
  'The simple pendulum': {
    'S2/check': ['arc length s from the bottom (m)'],
    'S3/check': ['angle θ (°)', 'restoring force mg sin θ (N)', ['10', '20', '30', '40']],
    'S4/intuition': ['bob mass m (kg)', 'angular acceleration θ̈ (rad/s²)', ['0.1', '1', '10']],
    'S4/check': ['', 'g/L (s⁻²)'],
    'S5/explain0': ['release angle θ (°)', 'relative error of sin θ ≈ θ (%)', ['5', '10', '20', '30', '40']],
    'S5/intuition': ['θ (rad)', 'θ and sin θ (rad)'],
    'S5/misconception': ['bob mass m (kg)', 'small-swing period T₀ (s)', ['0.1', '1', '10']],
    'S5/check': ['amplitude θ₀ (°)', 'period ratio T/T₀ (ratio)'],
    'S5/demo0': ['θ (rad)', 'sin θ and θ (rad)'],
    'S6/check': ['string length L (m)'],
    'S7/intuition': ['bob position', 'energy (J)', ['at 40°', 'at 20°', 'at 0°']],
    'S8/misconception': ['amplitude θ₀ (°)', 'exact period T (s)', ['10', '40', '90', '150']],
    'S8/check': ['period ratio T/T₀ (ratio)'],
  },
  'Weather glass, storm glass and barometer': {
    'S2/check': ['depth under water h (m)'],
    'S3/intuition': ['liquid', 'column height h (m)'],
    'S4/check': ['pressure in the sealed flask (hPa)'],
    'S5/check': ['outside pressure fall (hPa)', 'spout rise (cm)', ['5', '10', '20']],
    'S6/explain0': ['warming of the glass (K)', 'apparent pressure fall (hPa)', ['1', '2', '5', '10']],
    'S7/explain0': ['T (°C)', 'solubility S(T)/S(16 °C) (ratio)'],
    'S7/intuition': ['T (°C)', 'solubility relative to 16 °C (ratio)', ['0', '10', '20', '30']],
    'S7/check': ['T (°C)', 'supersaturation σ (ratio)'],
    'S8/explain0': ['T (°C)', 'camphor in crystals (share)'],
    'S8/misconception': ['condition of the glass', 'camphor in crystals (share)'],
    'S8/check': ['temperature of the glass (°C)'],
    'S9/explain0': ['pressure change in 3 h (hPa)'],
  },
  'From thrown stones to orbits': {
    'S3/intuition': ['distance from the centre (Earth radii R_E)', 'gravity g (m/s²)', ['1', '2', '3', '4']],
    'S4/misconception': ['body and point of the orbit', 'orbital speed v (km/s)'],
    'S5/explain0': ['launch speed v / v_circ (ratio)', 'specific energy ε (GM/r units)'],
    'S5/intuition': ['distance r / r₀ (ratio)', 'potential −GM/r (GM/r₀ units)'],
    'S5/check': ['launch speed from the surface (km/s)'],
  },
  'Five laboratories': {
    'S1/check': ['position on the beam (m)'],
    'S2/explain0': ['t (s)', 'log₁₀ of the gap |δ| (δ in rad)'],
    'S2/intuition': ['starting error δ₀ (rad)', 'time until the error reaches 1 rad (s)', ['10⁻³', '10⁻⁶', '10⁻⁹']],
    'S2/check': ['t (s)', 'gap δ (rad)'],
    'S3/intuition': ['distance from the charge r (cm)', 'field strength E (N/C)', ['1', '2', '3']],
    'S4/explain0': ['t (s)', 'charge q (C)'],
    'S4/intuition': ['time (time constants τ)', 'share of the final charge (%)', ['1', '2', '3', '4', '5']],
    'S4/check': ['t (s)', 'q / q_final (share)'],
    'S5/check': ['position on the axis (focal-length units)'],
    'S6/explain0': ['bounce number', 'bounce height (m)'],
    'S6/intuition': ['bounce number n (count)', 'bounce height hₙ / h₀ (ratio)'],
    'S6/check': ['coefficient of restitution e (ratio)'],
  },
  'The derivative and its two faces': {
    'S1/explain0': ['x', 'y'],
    'S1/check': ['step h', 'secant slope (Δy/Δx)', ['1', '0.5', '0.1', '0.01']],
    'S1/demo0': ['x', 'y'],
    'S2/explain0': ['x', 'y'], 'S2/intuition': ['x', 'y'], 'S2/misconception': ['x', 'y'], 'S2/check': ['x', 'y'],
    'S3/explain0': ['x', 'y'], 'S3/check': ['x', 'y'], 'S3/demo0': ['x', 'y'],
    'S4/intuition': ['direction from (1, 2)', 'slope of f (per unit step)'],
    'S5/explain0': ['x', 'y'],
    'S5/intuition': ['number of strips n', 'Riemann sum (area units)', ['10', '100', '1000', 'exact']],
    'S5/misconception': ['x (rad)', 'sin x'], 'S5/check': ['x', 'y'], 'S5/demo0': ['x', 'f(x)'],
  },
  'Linear maps, complex numbers and harmonics': {
    'S2/intuition': ['shape', 'area (square units)'],
    'S4/explain0': ['x (rad)', 'partial sum'],
    'S4/intuition': ['harmonic k', 'amplitude b_k'],
    'S4/misconception': ['x (rad)', 'partial sum'],
    'S5/explain0': ['mean of 30 throws', 'probability density'],
    'S5/intuition': ['sum of two dice', 'number of pairs (count)'],
    'S5/check': ['sample size n (count)', 'spread of the mean σ/√n'],
    'S5/demo0': ['value', 'probability density'],
  },
  'Collision theory and chemical equilibrium': {
    'S1/explain0': ['energy E / kT (ratio)', 'share of molecules (per unit E/kT)'],
    'S1/check': ['change made', 'rate factor (ratio)'],
    'S2/explain0': ['T (K)', 'k / k(298 K) (ratio)'],
    'S2/intuition': ['T (K)', 'share above E_a (10⁻⁹)', ['298', '308', '348']],
    'S2/misconception': ['activation energy E_a (kJ/mol)', 'rate factor, 298 → 308 K (ratio)', ['20', '50', '100']],
    'S2/check': ['1000 / T (K⁻¹)', 'ln(k/A)'],
    'S3/intuition': ['moment', 'rate ((mol/L)/time unit)'],
    'S3/check': ['reaction quotient Q (L/mol)'],
    'S4/explain0': ['T (model units)', 'rate constant (model units)'],
    'S4/check': ['T (model units)', 'equilibrium constant K'],
  },
  'The water cycle': {
    'S1/explain0': ['flux', 'yearly amount (10³ km³/yr)'],
    'S1/misconception': ['source', 'share of land evaporation (%)'],
    'S2/intuition': ['air temperature (°C)', 'vapour at saturation (g per kg of air)', ['0', '10', '20', '30']],
    'S3/check': ['place', 'air temperature (°C)'],
  },
  'Galton board': {
    'S1/explain0': ['probability of right p', 'variance p(1 − p)', ['0.1', '0.3', '0.5', '0.7', '0.9']],
    'S2/explain0': ['bin k (right bounces)', 'probability P(K = k)'],
    'S2/intuition': ['bin k (right bounces)', 'paths to the bin (count)'],
    'S3/explain0': ['bin (right bounces)', 'probability density'],
    'S3/intuition': ['bin k (right bounces)', 'probability P(K = k)'],
    'S3/check': ['rows N (count)', 'spread √(Np(1 − p)) (bins)'],
  },
  'Supply and demand': {
    'S1/intuition': ['buyer, highest value first', 'value to the buyer ($)'],
    'S2/intuition': ['seller, cheapest first', 'cost to the seller ($)'],
    'S3/intuition': ['price p ($)', 'excess demand D − S (units)'],
  },
  'Osmosis': {
    'S1/explain0': ['particle or pore', 'diameter (nm)'],
    'S2/explain0': ['ΔP / Δπ (ratio)', 'volume flow J (relative)'],
    'S2/check': ['membrane reflection σ', 'driving pressure σΔπ (bar)', ['1', '0.5', '0']],
    'S3/misconception': ['solute, 0.1 mol/L', 'osmotic pressure π (bar)'],
    'S3/check': ['osmotic pressure (bar)'],
  },
};

const slotsOf = st => [...(st.explain || []).map((p, i) => ['explain' + i, p && p.figure]), ['statement', st.statementFigure], ['intuition', st.intuitionFigure], ['misconception', st.misconceptionFigure], ['check', st.check && st.check.figure], ...(st.demos || []).map((d, i) => ['demo' + i, d && (d.figure || d)])];
const bareUnit = s => /^\s*\(?[^\s()]{1,9}\)?\s*$/.test(String(s || '')) && !/^[a-zα-ω]$/.test(String(s).trim());   // "N", "rad/s²", "%" (not a single variable letter such as "x")
// fill the axis titles (and, once, the bare category labels) of a chain from AXES; returns the number of figures changed
export function applyAxes(A) {
  const T = A && AXES[A.title]; if (!T) return 0; let n = 0;
  for (const st of A.chain || []) for (const [slot, f] of slotsOf(st)) { const a = f && T[st.id + '/' + slot]; if (!a) continue; const [x, y, cats] = a; let ch = false;
    if (x && (!f.xlabel || bareUnit(f.xlabel))) { f.xlabel = x; ch = true; }
    if (y && (!f.ylabel || bareUnit(f.ylabel))) { f.ylabel = y; ch = true; }
    if (cats && Array.isArray(f.categories) && f.categories.length === cats.length && !f.axesV) { f.categories = cats.slice(); ch = true; }
    if (ch) { f.axesV = 1; n++; } }
  return n;
}
