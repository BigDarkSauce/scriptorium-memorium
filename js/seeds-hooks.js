// Curiosity hooks for the example library (js/room/hooks.js): each scroll opens with one, BEFORE its question, and a few
// turning points carry their own. Keyed by chain title → 'open' or a step id. Every number here is checked in the
// comment beside it; every hook names the step that settles it and the sentence that does.
export const SCROLL_HOOKS = {
  'The simple pendulum': {
    // Galileo, Two New Sciences (1638), First Day: lead and cork bobs on equal threads keep step for many swings
    open: { technique: 'anomaly', text: 'Hang a lead ball and a cork ball on threads of equal length, pull both aside and let go. The lead is many times heavier, yet the two swing in step, there and back, swing after swing, until the cork’s swings die away.', resolvedIn: 'S4', payoff: 'The mass cancels: it sits on both sides of Newton’s law, so θ̈ = −(g/L) sin θ holds for lead and cork alike. Only the length and gravity set the beat.' },
    // T/T₀ at 90°: 2K(sin 45°)/π = 1.1803 (complete elliptic integral)
    S8: { technique: 'predict', text: 'Release the same pendulum from 90° instead of 10°. How much longer does one swing take?', options: [{ text: 'no longer: a pendulum keeps time', why: 'That is the small-swing rule, and 90° is far outside it.' }, { text: 'about 18 % longer', correct: true }, { text: 'about 9 times longer, as the arc is 9 times wider', why: 'A wider arc is also swept faster: the two nearly cancel.' }], resolvedIn: 'S8', payoff: 'The exact period at 90° is 1.18 T₀: the restoring force sin θ grows more slowly than θ, so wide swings run a little slow.' },
  },
  'Weather glass, storm glass and barometer': {
    open: { technique: 'consequence', text: 'A storm glass on a window sill fills with feathery white crystals overnight. By noon they have melted away, though the sky never changed and no storm came.', resolvedIn: 'S8', payoff: 'The crystals follow temperature, not weather: camphor dissolves less in the cold, so a cold night grows crystals and a warm morning dissolves them.' },
    S9: { technique: 'predict', text: 'Two barometers both read 1000 hPa. Three hours ago one read 1012 hPa, the other 990 hPa. Which one warns of worse weather?', options: [{ text: 'the one that read 990 hPa', why: 'It is rising: a low is filling or moving away.' }, { text: 'the one that read 1012 hPa', correct: true }, { text: 'neither: they read the same now', why: 'The same reading, but the trend is what forecasts.' }], resolvedIn: 'S9', payoff: 'A fall of 12 hPa in three hours is a fast fall, the sign of a deepening low; the level alone says little.' },
  },
  'From thrown stones to orbits': {
    // Moon: v ≈ 1.022 km/s, r ≈ 3.844e8 m → a = v²/r ≈ 2.72 mm/s²; in 1 s it falls ½at² ≈ 1.36 mm below a straight line
    open: { technique: 'impossible', text: 'The Moon is falling towards the Earth right now: about 1.4 mm every second, below the straight line it would otherwise follow. It has been falling for billions of years, and it has not come down.', resolvedIn: 'S3', payoff: 'It falls with the same gravity as a stone, weakened by distance: 9.81 m/s² ÷ 60² ≈ 2.7 mm/s² at 60 Earth radii. Its sideways speed carries it past the Earth as fast as it falls.' },
    // circular low-orbit speed ≈ 7.9 km/s; escape speed = √2 × 7.9 ≈ 11.2 km/s < 1.5 × 7.9 ≈ 11.9 km/s
    S5: { technique: 'predict', text: 'A cannonball fired sideways at 7.9 km/s circles the Earth just above the ground. Fire it 1.5 times faster. What happens?', options: [{ text: 'a bigger circle', why: 'A circle needs exactly the circular speed for its radius.' }, { text: 'a long ellipse that comes back', why: 'That happens between 1 and √2 ≈ 1.41 times the circular speed.' }, { text: 'it leaves for good', correct: true }], resolvedIn: 'S5', payoff: 'Above √2 times the circular speed the energy is positive: the path opens into a curve that never returns.' },
  },
  'Five laboratories': {
    open: { technique: 'partial', text: 'Two double pendulums are released from angles that differ by one billionth of a radian.', parts: ['For a few seconds they swing as one. Then ', { hide: 'they part and do entirely different things, and no measurement of the start could have told you how' }, '.'], resolvedIn: 'S2', payoff: 'The gap between them grows exponentially: each doubling takes the same time, so 10⁻⁹ rad reaches a whole radian within seconds. The law is exact; the prediction is not.' },
  },
  'The derivative and its two faces': {
    open: { technique: 'impossible', text: 'How fast is a thrown ball moving at one instant? In an instant it covers no distance in no time, and 0 ÷ 0 means nothing. Yet the speedometer shows a number.', resolvedIn: 'S2', payoff: 'The speed at an instant is not 0 ÷ 0 but the value that the average speed Δy/Δx approaches as the interval h shrinks: a limit, and it has a definite value.' },
  },
  'Linear maps, complex numbers and harmonics': {
    // sin x + sin 3x/3 + sin 5x/5 + … = π/4 · sign(sin x) on (−π, π) (Fourier series of the square wave)
    open: { technique: 'predict', text: 'Add up smooth waves only: sin x + sin 3x/3 + sin 5x/5 + sin 7x/7 + … What does the sum approach?', options: [{ text: 'an ever smoother wave', why: 'Each term is smooth, but infinitely many of them need not be.' }, { text: 'a square wave, with flat tops and vertical jumps', correct: true }, { text: 'it grows without limit', why: 'The terms shrink like 1/k, and their signs balance.' }], resolvedIn: 'S4', payoff: 'The sum is π/4 on (0, π) and −π/4 on (−π, 0): smooth rotations at whole-number speeds add up to a shape with corners.' },
  },
  'Collision theory and chemical equilibrium': {
    // √(308/298) = 1.017: mean speed +1.7 %; rate ×2 for Ea ≈ 53 kJ/mol (Arrhenius)
    open: { technique: 'anomaly', text: 'Warm a reaction by 10 °C, from 25 °C to 35 °C, and it often runs twice as fast. Yet the molecules move only about 1.7 % faster, and collide only about 1.7 % more often.', resolvedIn: 'S2', payoff: 'Only the collisions above the activation energy react, and that share sits in the steep tail of the energy distribution: e^(−Ea/RT) doubles for Ea ≈ 53 kJ/mol when T goes from 298 K to 308 K.' },
    S4: { technique: 'predict', text: 'An equilibrium gives off heat as it makes its products. You warm it. What happens to the amount of product?', options: [{ text: 'more product: everything speeds up', why: 'Both directions speed up, but not equally.' }, { text: 'less product', correct: true }, { text: 'no change: the equilibrium constant is a constant', why: 'It is constant only at a fixed temperature.' }], resolvedIn: 'S4', payoff: 'The backward reaction has the higher barrier, so heating speeds it up more: K falls, and the mixture shifts back towards the reactants.' },
  },
  'The water cycle': {
    // Hoh Rain Forest > 3 m/yr; Sequim ≈ 0.4 m/yr (Olympic rain shadow), < 100 km apart
    open: { technique: 'consequence', text: 'On the western slopes of the Olympic Mountains more than 3 m of rain falls in a year. Less than 100 km to the north-east, beyond the crest, the town of Sequim gets about 0.4 m. The same wind blows over both.', resolvedIn: 'S3', payoff: 'Air forced up the windward slope cools, saturates and rains its water out; coming down the far side it warms and dries: a rain shadow.' },
  },
  'Galton board': {
    // P(K=0)+P(K=12) = 2/2¹² = 1/2048; × 1000 beads ≈ 0.49
    open: { technique: 'predict', text: 'Drop 1000 beads through 12 rows of pegs; at each peg a bead goes left or right with even chances. How many land in the two outermost bins together?', options: [{ text: 'about 150: 13 bins, so about 77 each', why: 'That would be true if every bin were equally likely.' }, { text: 'about 20', why: 'Still far too many.' }, { text: 'most likely none: about 0.5 on average', correct: true }], resolvedIn: 'S2', payoff: 'An outermost bin needs 12 bounces the same way: one path of 4096, so P = 2/4096 for both, about 0.5 beads in 1000. The middle bin has 924 paths.' },
    // spread √(Np(1−p)): N × 4 → spread × 2
    S3: { technique: 'predict', text: 'Make the board four times as deep, 48 rows instead of 12. How much wider is the pile?', options: [{ text: '4 times wider', why: 'The left and right bounces largely cancel.' }, { text: '2 times wider', correct: true }, { text: 'no wider', why: 'More rows do add spread, just less than in proportion.' }], resolvedIn: 'S3', payoff: 'The spread grows like √N: √(48 × ¼) = 3.5 bins against √(12 × ¼) ≈ 1.7.' },
  },
  'Supply and demand': {
    open: { technique: 'impossible', text: 'Fill a market with traders who name prices at random, bound by one rule only: never sell below your cost, never buy above your value. Trade after trade, their prices close in on the same price careful traders would reach.', resolvedIn: 'S3', payoff: 'The rule alone does it: random offers outside the crossing of the two staircases can never be accepted, so trades pile up near p* (Gode & Sunder 1993).' },
  },
  'Osmosis': {
    open: { technique: 'partial', text: 'Put a red blood cell into pure water, and another into seawater.', parts: ['Within a minute the first ', { hide: 'swells and bursts' }, ', and the second ', { hide: 'shrivels' }, '.'], resolvedIn: 'S2', payoff: 'Water crosses the membrane towards the side with more dissolved particles: into the cell from pure water, out of it into seawater.' },
    // seawater π ≈ 27 bar; 27 bar ≈ ρgh with h ≈ 270 m
    S3: { technique: 'predict', text: 'How hard must you push on seawater to squeeze fresh water out of it through a membrane?', options: [{ text: 'about 1 bar, one atmosphere', why: 'Far too little: the water would still flow in.' }, { text: 'about 3 bar, like a bicycle tyre' }, { text: 'about 27 bar, the pressure 270 m under the sea', correct: true }], resolvedIn: 'S3', payoff: 'π = cRT for about 1.1 mol/L of dissolved ions gives roughly 27 bar: that is the pressure reverse-osmosis plants must exceed.' },
  },
};
export const seedHook = (title, where) => { const T = SCROLL_HOOKS[title]; return T && T[where] ? JSON.parse(JSON.stringify(T[where])) : null; };

// diorama openings (shown over the drawing, before it turns real): keyed by model type or by scene title; "lesson" is the
// step that settles it (its title), and its payoff comes with that step's explanation
export const DIO_HOOKS = {
  // brass expands ~19 µm per metre per kelvin: a longer pendulum swings more slowly
  pendulum: { technique: 'consequence', text: 'Pendulum clocks run slow in summer and fast in winter, though nobody touches them.', lesson: 'A shorter string', payoff: 'The rod is a little longer when warm, and a longer pendulum swings more slowly: T grows like √L.' },
  weatherglass: { technique: 'consequence', text: 'The storm glass grows crystals on cold nights, whatever the weather does next.', lesson: 'A cold night', payoff: 'Camphor dissolves less when cold: the crystals read the temperature, not the coming weather.' },
  projectile: { technique: 'anomaly', text: 'Thrown at 30° or at 60°, at the same speed, the ball lands on exactly the same spot.', lesson: 'The twin angle', payoff: 'The range is v²·sin(2θ)/g, and sin 60° = sin 120°: angles that add up to 90° pair up.' },
  orbit: { technique: 'impossible', text: 'The planet is pulled towards the star at every moment, and still it never falls in.', lesson: 'Why it does not fall in', payoff: 'Its sideways speed carries it past as fast as it falls: it falls around the star.' },
  doublependulum: { technique: 'partial', text: 'Two twins start a thousandth of a radian apart.', parts: ['For a while they move as one; then ', { hide: 'they split and never agree again' }, '.'], lesson: 'Can we predict it?', payoff: 'A tiny difference doubles again and again: the law is exact, the forecast fails.' },
  lever: { technique: 'impossible', text: 'A light weight can hold up a heavy one, without any pulley or spring.', lesson: 'Balance it', payoff: 'What balances is mass × distance from the fulcrum: the light weight just sits farther out.' },
  reaction: { technique: 'anomaly', text: 'The molecules collide millions of times; most of the collisions change nothing.', lesson: 'Why not every collision reacts', payoff: 'Only a collision with energy above the barrier Ea breaks bonds; the rest bounce apart unchanged.' },
  efield: { technique: 'impossible', text: 'The small charge is pushed by charges it never touches, across empty space.', lesson: 'Which way does it go?', payoff: 'Each charge fills the space around it with a field; the test charge feels the field where it sits.' },
  circuit: { technique: 'anomaly', text: 'The current is largest at the first instant, when the capacitor holds nothing at all.', lesson: 'How fast does it charge?', payoff: 'An empty capacitor pushes back with no voltage, so the battery drives the full V/R; the current falls as the charge builds up.' },
  lens: { technique: 'anomaly', text: 'Bring the object closer to the lens, and its image runs away from the lens, growing as it goes.', lesson: 'Sweep through F', payoff: 'As the object nears the focal point, 1/dᵢ = 1/f − 1/dₒ goes to zero: the image runs to infinity, ever larger.' },
  spring: { technique: 'anomaly', text: 'Pull the mass twice as far before letting go: one bounce takes exactly as long.', lesson: 'One bounce', payoff: 'Twice the stretch, twice the force: the mass moves twice as far twice as fast, so the period 2π√(m/k) does not change.' },
  wave: { technique: 'anomaly', text: 'Every bead on the rope only moves up and down, yet the wave runs along it.', lesson: 'Ride a bead', payoff: 'What travels is the pattern, each bead passing its motion to the next a moment later.' },
  gas: { technique: 'impossible', text: 'Each molecule flies in straight lines and bangs into the walls at random moments, yet the piston feels a perfectly steady push.', lesson: 'The gas law', payoff: 'So many hits arrive each instant that their average is steady: pressure is that average.' },
  incline: { technique: 'anomaly', text: 'Make the block heavier: on the same rough slope it slides no faster.', lesson: 'A heavier block', payoff: 'Gravity along the slope and friction both grow in proportion to the mass, so the acceleration g(sin θ − μ cos θ) does not depend on it.' },
  'The water cycle in a glass valley': { technique: 'consequence', text: 'One wind, one mountain: rain on this side, dry land on the other.', lesson: 'Over the crest', payoff: 'The air rains out as it rises and cools; descending the far side it warms and dries.' },
  'A market finds its price': { technique: 'impossible', text: 'Random traders, bound only by never trading at a loss, find the market price.', lesson: 'Close to the crossing', payoff: 'Offers beyond the crossing of the two staircases are never accepted: the rule alone herds prices to p*.' },
  'Galton board: many coin flips make a bell': { technique: 'partial', text: 'Every bead bounces left or right at random.', parts: ['Yet a thousand of them always build ', { hide: 'the same bell-shaped pile' }, '.'], lesson: 'Let the beads fall', payoff: 'There are many more paths to the middle than to the edges: the pile follows the number of paths.' },
  'Osmosis across a semi-permeable membrane': { technique: 'impossible', text: 'Water climbs up the column on the solution side, with no pump.', lesson: 'Equilibrium', payoff: 'Water diffuses towards the side with more solute until the weight of the column pushes back as hard as osmosis pulls.' },
};
export const dioHook = spec => { if (!spec) return null; const h = spec.hook || DIO_HOOKS[spec.title] || DIO_HOOKS[spec.type]; return h ? JSON.parse(JSON.stringify(h)) : null; };
