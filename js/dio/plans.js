// Didactic plans of the built-in 3D models (docs/PEDAGOGY.md, "The didactic planner"; the format is PLAN_FORMAT in
// js/ai/prompts.js). A plan is the storyboard in black and white: the question the demo answers, the KIND of knowledge,
// the levels of its multiscale scene graph, the Owen sequence of beats (stage → operation → camera mode, each with its
// purpose, the sub-question it settles and the one it opens, and which motion explains and which is only background),
// one analogy with its limit, and the comprehension check the demo is judged by. `lesson` = the index of the lesson
// that plays the beat. Pure data (no three.js): tools/verify-chain.mjs --builtins checks these plans offline.
export const PLANS = {
  lever: {
    question: 'Why does a light weight far out balance a heavy weight close in?',
    knowledgeKind: ['structural', 'causal'],
    levels: ['Lever', 'Part'],
    sequence: [
      { stage: 'curiosity', technique: 'establish', cameraMode: 'object', lesson: 0, purpose: 'show the whole lever at rest before anything is named', answers: 'What are we looking at?', opens: 'What is it made of?' },
      { stage: 'decomposition', technique: 'explode', cameraMode: 'object', lesson: 0, on: ['fulcrum', 'beam', 'mass 1', 'mass 2'], purpose: 'separate the four parts along the vertical, numbered, then reassemble', answers: 'What is a lever made of, and which part does what?', opens: 'Which way will the lever tip?' },
      { stage: 'mechanism', technique: 'chain', cameraMode: 'mechanism', lesson: 1, purpose: 'follow weight × distance on each side to the turn of the beam', answers: 'Which way will the lever tip?', opens: 'Where must the 2 kg go to balance?', motion: { explanatory: ['beam turns toward the larger moment'], background: ['trees sway'] } },
      { stage: 'mechanism', technique: 'isolate', cameraMode: 'mechanism', lesson: 2, purpose: 'one change, one result: the light weight moved out until the beam holds', answers: 'Where must the right weight go to balance?', opens: 'Can a heavier weight balance closer in?', motion: { explanatory: ['the beam stays level'], background: [] } },
      { stage: 'intuition', technique: 'analogy', cameraMode: 'object', lesson: 3, purpose: 'the seesaw and the crowbar: double the weight, half the distance', answers: 'Can a heavier weight balance closer in?', opens: 'Can moving the pivot balance the original weights?' },
      { stage: 'reconstruction', technique: 'isolate', cameraMode: 'object', lesson: 4, purpose: 'the whole lever again, with the beam\'s own weight counted at its middle', answers: 'Can moving the pivot balance the original weights?', opens: 'Explore: a heavy beam' }
    ],
    analogy: { familiar: 'a seesaw with a child far out and an adult close in', maps: 'child and adult = the two weights; their distances from the middle = r₁ and r₂', limit: 'a seesaw\'s plank bends and children push with their legs; the model\'s beam is rigid and only gravity acts' },
    comprehensionCheck: { explainBack: 'Explain why 2 kg at 3.75 m balances 3 kg at 2.5 m, without the word "torque".', misconceptionToAvoid: 'The heavier side always goes down.', answer: 'Each weight turns the beam in proportion to weight times distance from the fulcrum: 2 × 3.75 = 3 × 2.5 = 7.5, so the two turnings cancel.' }
  },
  circuit: {
    question: 'How does a capacitor charge through a resistor, and what sets how long it takes?',
    knowledgeKind: ['internal', 'causal', 'movement'],
    levels: ['Circuit', 'Component', 'Plates', 'Electron'],
    sequence: [
      { stage: 'orientation', technique: 'establish', cameraMode: 'global', lesson: 0, purpose: 'the whole loop on the breadboard', answers: 'What are we looking at?', opens: 'What does each part do?' },
      { stage: 'inspection', technique: 'inspect', cameraMode: 'component', lesson: 0, on: ['battery', 'switch', 'resistor', 'capacitor', 'voltmeter'], purpose: 'visit each component, name its job, return to the loop', answers: 'What does each part of the circuit do?', opens: 'How fast does a capacitor charge?' },
      { stage: 'mechanism', technique: 'chain', cameraMode: 'mechanism', lesson: 1, purpose: 'battery → switch → resistor → capacitor → voltmeter, in the order of cause', answers: 'How fast does a capacitor charge?', opens: 'Where does the charge go?', motion: { explanatory: ['electrons drift along the wire', 'the voltmeter needle rises'], background: [] },
        sub: [{ stage: 'inspection', technique: 'section', cameraMode: 'object', lesson: 2, on: ['capacitor'], purpose: 'cut the capacitor open while the loop stays in view: two plates, an insulating gap', answers: 'Where does the charge actually go inside the capacitor?', opens: 'What does an electron do meanwhile?' }] },
      { stage: 'mechanism', technique: 'pov', cameraMode: 'frame', lesson: 3, purpose: 'ride one electron: fast at first, then almost still', answers: 'How long until it is full, and what does an electron do meanwhile?', opens: 'What does a bigger resistor do?', motion: { explanatory: ['the tracked electron slows down'], background: ['the other electrons drift'] } },
      { stage: 'intuition', technique: 'isolate', cameraMode: 'mechanism', lesson: 4, purpose: 'double R, double the time: τ = RC', answers: 'What does a bigger resistor do?', opens: 'What happens when the battery is switched out?', motion: { explanatory: ['the voltmeter rises half as fast'], background: [] } },
      { stage: 'reconstruction', technique: 'track', cameraMode: 'frame', lesson: 5, purpose: 'the stored charge drives the current back round the whole loop', answers: 'What happens when the battery is switched out?', opens: 'Explore: change C', motion: { explanatory: ['the discharge current along the wire'], background: [] } }
    ],
    analogy: { familiar: 'filling a balloon through a thin straw', maps: 'straw = resistor, balloon = capacitor, lung pressure = battery', limit: 'a balloon\'s stretch is not linear and air does cross into it; no charge ever crosses the capacitor\'s gap' },
    comprehensionCheck: { explainBack: 'Why does the capacitor charge quickly at first and ever more slowly later?', misconceptionToAvoid: 'Current flows through the capacitor from one plate to the other.', answer: 'The current is driven by the difference between the battery and the capacitor voltage; as charge piles up on the plates that difference shrinks, so the current and the charging slow down, with time scale τ = RC.' }
  },
  weatherglass: {
    question: 'What do the barometer, the Goethe weather glass and the storm glass actually measure?',
    knowledgeKind: ['internal', 'scale', 'causal'],
    levels: ['Room', 'Instrument', 'Crystals', 'Seed bed'],
    sequence: [
      { stage: 'orientation', technique: 'establish', cameraMode: 'object', lesson: 0, purpose: 'the three instruments under one sky', answers: 'What are we looking at?', opens: 'What holds the mercury up?' },
      { stage: 'inspection', technique: 'section', cameraMode: 'object', lesson: 0, on: ['mercury barometer'], purpose: 'cut the walnut case open: the tube, the vacuum, the cistern', answers: 'What holds the mercury column up?', opens: 'What does the Goethe glass do when the pressure falls?' },
      { stage: 'mechanism', technique: 'chain', cameraMode: 'component', lesson: 1, purpose: 'trapped air → flask water → spout column', answers: 'What does the Goethe glass do when the outside pressure falls?', opens: 'Is a high spout always a low?', motion: { explanatory: ['the spout water climbs'], background: ['clouds drift'] } },
      { stage: 'mechanism', technique: 'isolate', cameraMode: 'object', lesson: 2, purpose: 'the same reading from a different cause: warmth', answers: 'Is a high spout always a sign of low pressure?', opens: 'What makes crystals appear?', motion: { explanatory: ['the spout rises with no change of pressure'], background: [] } },
      { stage: 'mechanism', technique: 'zoom', cameraMode: 'component', lesson: 3, purpose: 'glass → crystals → seed bed, the tube kept as a ghost landmark', answers: 'What makes crystals appear in the sealed storm glass?', opens: 'Do they vanish when it warms?', motion: { explanatory: ['fern crystals grow from the bed'], background: ['the Goethe glass bubbles'] } },
      { stage: 'reconstruction', technique: 'isolate', cameraMode: 'object', lesson: 4, purpose: 'back to the instrument: crystals follow temperature, not the storm', answers: 'Do the crystals vanish again when it warms?', opens: 'Explore: auto weather' }
    ],
    analogy: { familiar: 'a drinking straw held shut at the top', maps: 'the trapped air holds the water up as your finger does', limit: 'the trapped air also expands and changes with temperature; a finger does not' },
    comprehensionCheck: { explainBack: 'Which instrument follows the storm and which follows the temperature, and why?', misconceptionToAvoid: 'Storm-glass crystals forecast storms.', answer: 'The barometer and the Goethe glass respond to outside air pressure (open to it); the sealed storm glass only feels temperature, because camphor\'s solubility depends on temperature.' }
  },
  gas: {
    question: 'Where does a gas\'s pressure come from?',
    knowledgeKind: ['scale', 'movement', 'causal'],
    levels: ['Room', 'Vessel', 'Molecule'],
    sequence: [
      { stage: 'orientation', technique: 'establish', cameraMode: 'global', lesson: 0, purpose: 'the vessel on the bench in the room', answers: 'What are we looking at?', opens: 'What is inside?' },
      { stage: 'inspection', technique: 'zoom', cameraMode: 'component', lesson: 0, purpose: 'room → vessel → molecule, the vessel kept as a ghost landmark, the level shown', answers: 'Where does a gas\'s pressure come from?', opens: 'What does one molecule do to the wall?', motion: { explanatory: ['molecules fly in straight lines and collide'], background: [] } },
      { stage: 'mechanism', technique: 'pov', cameraMode: 'frame', lesson: 1, purpose: 'ride one molecule, knocked about at random, to a wall', answers: 'What does one molecule do to the wall it hits?', opens: 'Does the pressure match the gas law?', motion: { explanatory: ['the tracked molecule reverses at the wall'], background: ['the crowd moves at random'] } },
      { stage: 'mechanism', technique: 'isolate', cameraMode: 'object', lesson: 2, purpose: 'many tiny pushes add up to a steady gauge reading', answers: 'Does the measured pressure match the ideal gas law?', opens: 'What does heating do?', motion: { explanatory: ['the gauge needle settles'], background: ['the crowd moves at random'] } },
      { stage: 'mechanism', technique: 'chain', cameraMode: 'mechanism', lesson: 3, purpose: 'burner → molecule speeds → piston hits → gauge', answers: 'What does heating do to the pressure?', opens: 'What does squeezing do?', motion: { explanatory: ['molecules strike the piston harder and more often'], background: [] } },
      { stage: 'reconstruction', technique: 'establish', cameraMode: 'object', lesson: 4, purpose: 'the whole vessel again: Boyle\'s law', answers: 'What does halving the volume do?', opens: 'Explore: the speed histogram' }
    ],
    analogy: { familiar: 'hail drumming on a tin roof', maps: 'each hailstone = one molecule; the steady roar = the pressure', limit: 'hail falls one way; molecules move at random in every direction and bounce back' },
    comprehensionCheck: { explainBack: 'Explain where the pressure on the piston comes from and why heating raises it.', misconceptionToAvoid: 'Molecules push the walls because they repel the walls at a distance, or because they "want" to spread out.', answer: 'Each molecule that hits a wall reverses and gives it a tiny push 2mvₓ; the pressure is the sum of all pushes per second per area. Heating speeds every molecule up, so they hit harder and more often.' }
  },
  pendulum: {
    question: 'How long does a pendulum take to swing, and why does the answer depend on how far it swings?',
    knowledgeKind: ['causal', 'pathology', 'perspective'],
    levels: ['Pendulum', 'Bob'],
    sequence: [
      { stage: 'curiosity', technique: 'chain', cameraMode: 'mechanism', lesson: 0, purpose: 'time one small swing: pivot → string → bob', answers: 'How long does one swing take?', opens: 'Does a wide swing take longer?', motion: { explanatory: ['the bob swings there and back'], background: [] } },
      { stage: 'mechanism', technique: 'compare', cameraMode: 'object', lesson: 1, purpose: '8° and 150° side by side in identical framing', answers: 'Does a wide swing take longer?', opens: 'Where is the bob fastest?', motion: { explanatory: ['the wide swing lingers near the top'], background: [] } },
      { stage: 'mechanism', technique: 'pov', cameraMode: 'frame', lesson: 2, purpose: 'ride the bob: height into speed and back', answers: 'Where is the bob fastest, and where does it stop?', opens: 'What does the length do?', motion: { explanatory: ['the rush through the bottom'], background: [] } },
      { stage: 'intuition', technique: 'isolate', cameraMode: 'mechanism', lesson: 3, purpose: 'a quarter of the length, half the period', answers: 'What does the length of the string do?', opens: 'Where does the energy go?', motion: { explanatory: ['the short pendulum swings faster'], background: [] } },
      { stage: 'reconstruction', technique: 'chain', cameraMode: 'mechanism', lesson: 4, purpose: 'friction in the pivot shrinks every swing; the period hardly changes', answers: 'Where does the energy go when the swing dies away?', opens: 'Explore: the Moon', motion: { explanatory: ['the amplitude shrinks'], background: [] } }
    ],
    analogy: { familiar: 'a child on a playground swing', maps: 'the chains = the string, the child = the bob', limit: 'a child pumps the swing; the model is pushed only once, at release' },
    comprehensionCheck: { explainBack: 'Why does a 150° swing take longer than an 8° swing of the same pendulum?', misconceptionToAvoid: 'A pendulum\'s period never depends on its amplitude.', answer: 'Far out on the arc the pull back along the path grows like sin θ, more slowly than the distance, so the bob is pulled back more gently and lingers near the top; only small swings are isochronous.' }
  },
  orbit: {
    question: 'How does one law of gravity keep a planet going round its star?',
    knowledgeKind: ['causal', 'movement', 'scale'],
    levels: ['Solar System', 'Orbit', 'Planet'],
    sequence: [
      { stage: 'curiosity', technique: 'chain', cameraMode: 'global', lesson: 0, purpose: 'why the planet does not fall in: pull and sideways speed', answers: 'Why doesn\'t the planet fall into the star?', opens: 'Does it sweep space evenly?', motion: { explanatory: ['the planet falls inward and swings past'], background: [] } },
      { stage: 'mechanism', technique: 'isolate', cameraMode: 'mechanism', lesson: 1, purpose: 'equal areas in equal times', answers: 'Does the planet sweep out space evenly?', opens: 'What does the planet see?', motion: { explanatory: ['the wedges grow and shrink'], background: [] } },
      { stage: 'mechanism', technique: 'pov', cameraMode: 'frame', lesson: 2, purpose: 'ride the planet in and out', answers: 'What does the planet experience?', opens: 'What speed makes a circle?', motion: { explanatory: ['the star swells and shrinks'], background: [] } },
      { stage: 'mechanism', technique: 'establish', cameraMode: 'global', lesson: 3, purpose: 'the circle: just enough speed', answers: 'What speed makes a circle?', opens: 'How fast to escape?' },
      { stage: 'mechanism', technique: 'establish', cameraMode: 'global', lesson: 4, purpose: 'escape at √2 times the circular speed', answers: 'How fast must it go to escape?', opens: 'How big are real planets?' },
      { stage: 'intuition', technique: 'scaleTo', cameraMode: 'global', lesson: 5, purpose: 'the classroom lineup, then the true relative radii', answers: 'How big are real planets next to their star?', opens: 'Why can the star be treated as fixed?' },
      { stage: 'understanding', technique: 'answer', cameraMode: 'global', lesson: 5, purpose: 'the opening question answered: it keeps falling and keeps missing, round a star about 750 times as heavy as all its planets together', answers: 'How does one law of gravity keep a planet going round its star?', opens: 'Explore: a stretched orbit' }
    ],
    analogy: { familiar: 'a ball whirled on a string', maps: 'the string\'s pull = gravity, the ball\'s speed = the planet\'s sideways speed', limit: 'a string pulls with whatever force is needed; gravity weakens with the square of the distance, so orbits can be ellipses' },
    comprehensionCheck: { explainBack: 'Why does a planet keep missing the star instead of falling in?', misconceptionToAvoid: 'In orbit there is no gravity, or the planet is held up by its speed alone.', answer: 'Gravity pulls it inward all the time, but its sideways speed carries it past before it can reach the star; it keeps falling and keeps missing.' }
  }
};
