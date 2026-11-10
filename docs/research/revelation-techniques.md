# Revelation techniques and the laboratory

A library of ways to **reveal knowledge**, kept apart from the carriers (camera moves, transitions, animation effects)
that only deliver it. Code: `js/room/hooks.js` (taxonomy, curiosity family, rendering, gate), `js/seeds-hooks.js` (the
example library's hooks), `js/dio/lab.js` (guided discovery and the open laboratory). All references below were
checked in OpenAlex (November 2026).

## The taxonomy

| Family | Aim | Techniques | Where it lives |
|---|---|---|---|
| Curiosity and anticipation | create the desire to discover | partial revelation, anomaly introduction, apparent impossibility, prediction invitation, unexplained consequence | `hooks.js`, `engine.js`, `lab.js` |
| Contrast and surprise | make the right idea visible against the wrong one | wrong beside right, staged misconception then refuted, contrasting cases, near miss | `motion.js`, `reveal.js`, compare in `grammar.js` |
| Progressive disclosure | one layer of the answer at a time | peel, section cut, zoom through scales, explode and reassemble, unroll fold by fold | `grammar.js`, `focus.js`, the scroll folds |
| Construction | the learner assembles the knowledge | build up from the simplest version, productive failure, one justified move at a time | `prims/construct.js`, derivations |
| Perspective | see it from where it happens | ride the subject, true relative scale, slowed or sped time, counterfactual run | POV, `scaleTo`, the laboratory |
| Closure and consolidation | pay the debt and keep the answer | payoff callback, explain it back, transfer on a later day | payoffs (`hooks.js`), `reveal.js` |

## The curiosity family

All five open an **information gap**: a felt difference between what one knows and what one wants to know
(Loewenstein 1994). Curiosity raised before an answer improves memory for that answer, and even for incidental material
around it (Kang et al. 2009; Gruber, Gelman & Ranganath 2014). The gap must look closable: curiosity peaks for
questions one is close to answering (Metcalfe, Schwartz & Eich 2020). Hence the one rule every hook obeys: **it names
where it is settled, and the scroll pays it there**, with the reader's own prediction recalled. A hook without a payoff
is clickbait; the gate (`hookIssues`) refuses it.

| Technique | Move | Mechanism and evidence | Honesty rule |
|---|---|---|---|
| Partial revelation | the result with its decisive piece veiled (the reader may peek) | an incomplete pattern of known size pulls towards completion (Loewenstein 1994; Metcalfe et al. 2020) | the veiled piece is true and shown in full at the payoff |
| Anomaly introduction | an observation the reader's current idea cannot explain | credible anomalous data that cannot be dismissed drives conceptual change (Chinn & Brewer 1993; Posner et al. 1982); surprise feeds curiosity and exploration (Vogl et al. 2019) | a real, checkable observation with its numbers |
| Apparent impossibility | something true that sounds as if it cannot be | conceptual conflict between two held beliefs (Berlyne 1954) | true as stated; the payoff names which belief was wrong |
| Prediction invitation | commit to an outcome; the answer is kept for the step that explains it | generating a prediction boosts learning through the surprise of an error (Brod, Hasselhorn & Bunge 2018) | 2–4 options, exactly one correct, the wrong ones real misconceptions |
| Unexplained consequence | an effect in full, its cause held back | uncertainty before instruction raises curiosity and learning (Lamnina & Chase 2019) | the cause is given at the payoff |

### Where they are placed (architecture)

- **Scroll opening**, *before* the part's question (it used to open with the question): the AI's `hook`, the example
  library's, or, when neither exists, a partial revelation of the scroll's own conclusion (true by construction).
- **Turning-point steps**: a step's `hook` sits before its question.
- **Fold teaser**: the "Next:" line under a fold quotes the next hook rather than the next question (a veiled piece
  never leaks into it).
- **Payoff**: at the step named by `resolvedIn`, after the explanation, the gap is named again and closed; a prediction
  is recalled when the payoff scrolls into view.
- **Diorama opening**: over the drawing, kept up while it turns real, then above the steps until the step that settles
  it has played, whose card carries the payoff.
- **Diorama steps and experiments**: prediction invitations before a step plays (`predicts.js`) and before a guided
  experiment runs (`lab.js`).

The example library uses all five: anomaly (pendulum, collision theory), apparent impossibility (orbits, derivative,
supply and demand), unexplained consequence (weather glass, water cycle), prediction invitation (Fourier series, Galton
board, and six step hooks), partial revelation (five laboratories, osmosis).

## The laboratory: guided discovery and the open laboratory

Kölmel et al. (2026; *Computers in Human Behavior Reports* 22, 101050; N = 64, between subjects) compared fixed,
system-randomised and user-controlled parameters for interactive counterfactual explanations. System-randomised
parameters gave the deepest exploration and the longest time per data point; user control gave the broadest
exploration but the highest mental demand and frustration; objective understanding and satisfaction did not differ.
Discovery helps when guided, not when unassisted (Alfieri et al. 2011). The guide's first rule is the control of
variables, one change against a reference (Chen & Klahr 1999), and "informative" follows active learning: the run whose
outcome the learner's runs so far cannot yet tell (Gureckis & Markant 2012).

**Guided discovery** (the default): the guide proposes one experiment at a time, with its reasons listed and a score
bar; the learner predicts (rise, fall, unchanged), accepts, skips or draws another. The first run is a reference.
Candidates are scored by visible terms: an untested variable (+1), the variable the step's common mistake is about
(+0.8, a control run that can refute it), distance from every run so far, a second level of a variable that moved the
watched readout (+0.5), the range ends (+0.1); authored experiments (`experiments` in a scene spec or model) rank
first. The offer is drawn at random from the three best, with chances in proportion to the score squared: system
variation within what is worth doing. "What else the guide weighed" lists the runners-up.

**Open laboratory**: every permitted variable is the learner's; "Record a run" restarts the model with those settings
and records it. The guide's next choice and its first reason stay visible in one line, with "Run it".

**The notebook** (both modes): each run's finding in words, computed from the numbers only: a readout that settles is
compared by its final value, one that oscillates by the size of its swing; "unchanged" means within 2 % (6 % for
oscillating readouts); the learner's prediction is marked right or wrong.

## References

- Alfieri, L., Brooks, P. J., Aldrich, N. J., & Tenenbaum, H. R. (2011). Does discovery-based instruction enhance learning? *Journal of Educational Psychology*, 103(1), 1–18. doi:10.1037/a0021017
- Berlyne, D. E. (1954). A theory of human curiosity. *British Journal of Psychology*, 45(3), 180–191. doi:10.1111/j.2044-8295.1954.tb01243.x
- Brod, G., Hasselhorn, M., & Bunge, S. A. (2018). When generating a prediction boosts learning: The element of surprise. *Learning and Instruction*, 55, 22–31. doi:10.1016/j.learninstruc.2018.01.013
- Chen, Z., & Klahr, D. (1999). All other things being equal: Acquisition and transfer of the control of variables strategy. *Child Development*, 70(5), 1098–1120. doi:10.1111/1467-8624.00081
- Chinn, C. A., & Brewer, W. F. (1993). The role of anomalous data in knowledge acquisition. *Review of Educational Research*, 63(1), 1–49. doi:10.3102/00346543063001001
- Gruber, M. J., Gelman, B. D., & Ranganath, C. (2014). States of curiosity modulate hippocampus-dependent learning via the dopaminergic circuit. *Neuron*, 84(2), 486–496. doi:10.1016/j.neuron.2014.08.060
- Gureckis, T. M., & Markant, D. B. (2012). Self-directed learning: A cognitive and computational perspective. *Perspectives on Psychological Science*, 7(5), 464–481. doi:10.1177/1745691612454304
- Kang, M. J., Hsu, M., Krajbich, I. M., Loewenstein, G., McClure, S. M., Wang, J. T., & Camerer, C. F. (2009). The wick in the candle of learning. *Psychological Science*, 20(8), 963–973. doi:10.1111/j.1467-9280.2009.02402.x
- Kölmel, L., Becker, M., Schwall, F., Hild, J., Birnstill, P., Deml, B., & Beyerer, J. (2026). Counterfactual explanations with varying parameter control: Effects on mental-model formation and explanation satisfaction. *Computers in Human Behavior Reports*, 22, 101050. doi:10.1016/j.chbr.2026.101050
- Lamnina, M., & Chase, C. C. (2019). Developing a thirst for knowledge: How uncertainty in the classroom influences curiosity, affect, learning, and transfer. *Contemporary Educational Psychology*, 59, 101785. doi:10.1016/j.cedpsych.2019.101785
- Loewenstein, G. (1994). The psychology of curiosity: A review and reinterpretation. *Psychological Bulletin*, 116(1), 75–98. doi:10.1037/0033-2909.116.1.75
- Metcalfe, J., Schwartz, B. L., & Eich, T. S. (2020). Epistemic curiosity and the region of proximal learning. *Current Opinion in Behavioral Sciences*, 35, 40–47. doi:10.1016/j.cobeha.2020.06.007
- Posner, G. J., Strike, K. A., Hewson, P. W., & Gertzog, W. A. (1982). Accommodation of a scientific conception. *Science Education*, 66(2), 211–227. doi:10.1002/sce.3730660207
- Vogl, E., Pekrun, R., Murayama, K., et al. (2020; online 2019). Surprised–curious–confused: Epistemic emotions and knowledge exploration. *Emotion*, 20(4), 625–641. doi:10.1037/emo0000578

## What the reference projects contributed

Backcountry 101, Electronics 101, Learn Arduino and Learn ESP32 (one author, dilum.dev) share a pattern this round
borrows: a lesson is a 3D bench plus tabs (instructions, explanation, tips; overview, components, circuit, maths) and a
progress count, on a warm cream ground. Anatomy Atelier contributes the organ page's "key facts, then Animate, Quiz,
Compare" sequence; its build notes (skills.wheresryan.sh) contribute the motion rules already used here (time-based
steps with clamped dt, idle motion that pauses offscreen, precomputed static geometry) and the frame-budget idea below.
None of them reveals in the sense above: their lessons start from instructions, not from a gap.
