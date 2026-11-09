# The Revelation Engine: the "Aha" as a procedural, compelling and honest learning primitive

Status: built (round 9, 2026-11-09). Code: `js/room/reveal.js` (the loop in scrolls, the transfer deck),
`js/dio/engine.js` + `js/dio/predicts.js` (predict-then-play in dioramas), `js/dio/prims/{bayes,emergence,control,analogy}.js`
(the new primitives), `js/room/glyphs.js` (pictures of what labels refer to), `tools/test-reveal.mjs` (the checks).

Every reference below was resolved in OpenAlex on 2026-11-09 (exact match by title, year and authors). The one
reference that could not be verified (Schwartz & Bransford 1998, "A time for telling") is **not** cited for any claim.

## 1. What the engine does

An explanation is usually shown as a finished paragraph. The engine turns the central idea of a step into a loop the
reader runs:

| Phase | What happens on screen | Why (evidence) |
|---|---|---|
| **Hook** | The step's question, shown before its explanation; also printed on the rod of the *next* fold ("Next: …") | Curiosity about a question improves memory for its answer, through the reward circuit (Kang et al. 2009, doi:10.1111/j.1467-9280.2009.02402.x; Gruber, Gelman & Ranganath 2014, doi:10.1016/j.neuron.2014.08.060). An information gap is what makes curiosity (Loewenstein 1994, doi:10.1037/0033-2909.116.1.75). |
| **Predict + confidence** | The reader commits to an option (or writes one line) and says *a guess / fairly sure / certain* | Predicting a demonstration's outcome first makes observing it correctly about 20 % likelier, whether the prediction was right or wrong (Miller, Lasry, Chu & Mazur 2013, doi:10.1103/physrevstper.9.020113; Crouch et al. 2004, doi:10.1119/1.1707018). A failed attempt before the answer improves learning (Kornell, Hays & Bjork 2009, doi:10.1037/a0015729; Richland, Kornell & Kao 2009, doi:10.1037/a0016496). |
| **Reveal** | The right option lights; the rule appears in one line; a confident error is named as such | Errors made with high confidence are corrected best (hypercorrection: Butterfield & Metcalfe 2001, doi:10.1037/0278-7393.27.6.1491; Metcalfe 2017, doi:10.1146/annurev-psych-010416-044022). The reward-prediction-error account (Schultz, Dayan & Montague 1997, doi:10.1126/science.275.5306.1593) is why the surprise is staged, with a larger reveal for a larger error. |
| **Refutation** | On a wrong prediction: "the tempting model", what it gets wrong | Texts that state and refute the misconception change it better than texts that only state the right idea (Tippett 2010, doi:10.1007/s10763-010-9203-x). |
| **Boundary** | "Find the edge of this rule": the case the rule fails on | The truth constraint (§3). A second, smaller "aha" (where it breaks) that keeps the first one from becoming a misconception. |
| **Explain back** | One line in the reader's own words, kept with the step, never graded by a machine | Prompted self-explanation helps (Chi et al. 1994, doi:10.1207/s15516709cog1803_3; Bisra et al. 2018, meta-analysis, doi:10.1007/s10648-018-9434-x). |
| **Transfer** | A *new* situation using the same rule, back days later in the ◆ deck, interleaved with other scrolls' | Retrieval spaced over days beats massed review (Cepeda et al. 2006, doi:10.1037/0033-2909.132.3.354; Roediger & Karpicke 2006, doi:10.1111/j.1467-9280.2006.01693.x; Adesope et al. 2017, doi:10.3102/0034654316689306); interleaving similar material helps telling them apart (Brunmair & Richter 2019, doi:10.1037/bul0000209). |

In dioramas the same loop is "Predict, then play": a step with options asks before it plays, and says afterwards
whether the model did what the reader expected.

## 2. Why it should be compelling, and why it is not a slot machine

The user asked for the pull of short-form video or gambling. The research says to take that pull seriously and to not
copy its mechanism:

* Heavy short-form video use is associated with poorer attention and inhibitory control (Nguyen et al. 2025,
  meta-analysis of 71 studies, r ≈ −.34 for cognition, doi:10.1037/bul0000498). The studies are mostly correlational,
  so this is association, not proof of harm; but nothing in it suggests the format is good for learning.
* Gamification's average effect on learning is positive but small, and depends on design (Sailer & Homner 2020,
  doi:10.1007/s10648-019-09498-w).
* Unguided discovery does not help; guided discovery does (Alfieri et al. 2011, doi:10.1037/a0021017). Problem-solving
  *before* instruction does help when it is designed for it (productive failure: Kapur 2008, doi:10.1080/07370000802212669;
  Sinha & Kapur 2021, doi:10.3102/00346543211019105).

So the engine keeps what is real in that pull, an open question and a reward that depends on what you did, and rejects
the rest:

| Kept | Rejected |
|---|---|
| A gap at every fold edge ("Next: …"): the pull of an unresolved question | Infinite feed, autoplay |
| Reward tied to a *model update*: the bigger your prediction error, the bigger the reveal | Random rewards unrelated to understanding |
| Progress counted in **closed loops and transfer accuracy** | Streaks, time-on-app, points for opening |
| A pacing note after six loops in one sitting ("the ones due tomorrow will mean more then") | Pressure to continue |
| Free choice to skip ("No idea yet: show me"): the pretest effect works for a failed guess too | Locks or punishment for skipping |

The honest measure is the deck's "transfer, first try": the share of new situations answered right the first time.

## 3. The truth constraint

A felt insight that is false is worse than no insight: it installs a misconception that later has to be unlearned.
So **no compression ships without the case it fails on**:

* every `reveal` with a `rule` must have a `boundary.case` (the quality gate in `js/ai/prompts.js`, check 10, and
  `tools/test-reveal.mjs` on all built-in content);
* every prediction and transfer question has exactly one correct option;
* an `analogy_map` must list where the likeness breaks (validation refuses it otherwise; Gentner, Loewenstein & Thompson
  2003, doi:10.1037/0022-0663.95.2.393; bridging analogies: Clement 1993, doi:10.1002/tea.3660301007);
* the Schelling and control primitives say in their note what the model leaves out.

## 4. Routing by kind of knowledge

The loop fits mechanisms, causes, formal results and quantitative relations. It does not fit everything
(`epistemicType` in `reveal.js`):

| Epistemic type | Treatment |
|---|---|
| mechanism, causal, formal, quantitative | predict → reveal → boundary → transfer |
| taxonomy (types of, classified as…) | no "aha" loop; the existing *Check yourself* (retrieval), spaced |
| narrative (dates, chronology) | no loop; the story's order and its causes |
| skill (how to…) | practice, not revelation |

A vocabulary list turned into a series of "insights" would produce invented connections.

## 5. The uncertainty conventions

One meaning per line style, used the same way everywhere it appears (first in `causal_loop`, with a legend under the
figure):

| Style | Meaning |
|---|---|
| solid line | an established relation, within the chosen model |
| dotted line | a hypothesised relation |
| faded line | weak evidence |
| ⚠ on a link | a simplification the model makes knowingly |
| dashed bracket (bars of `bayes_update`) | the belief before the evidence |
| torn rubric edge (`analogy_map`) | where an analogy stops holding |

## 6. The new primitives

| Primitive | Structure | What the reader predicts, then sees |
|---|---|---|
| `bayes_update` | inference | which explanation a piece of evidence favours; bars and 100 natural-frequency dots move (natural frequencies improve Bayesian reasoning: Gigerenzer & Hoffrage 1995, doi:10.1037/0033-295x.102.4.684; McDowell & Jacobs 2017, doi:10.1037/bul0000126) |
| `emergence` | emergence | how sorted a town ends up under a mild preference (Schelling 1971, doi:10.1080/0022250x.1971.9989794); 34 % → about 75 % like neighbours in our runs |
| `control_loop` | control | what delay plus a strong gain does: overshoot and ringing; the steady-state offset of a purely proportional controller is shown as its edge |
| `analogy_map` | analogy | which parts correspond, what relation carries over, and the torn edge where it breaks |

The book *Ways of Explaining* has a seventh part, "Discovery: predict, then see", with one step for each, all with
reveals, boundaries and transfer questions (numbers worked in `js/seeds-domains.js`).

## 7. Pictures of what the words name (`glyphs.js`)

Diagrams, tables, arrow-linked boxes and the reader's terms used to be words alone. Each label now gets an ink picture
of its referent when one of about 80 glyphs matches it (sun, rain, vapour, pendulum, gear, coin, bank, register, cell,
argument parts…), moving only as the referent moves (heat rises, rain falls, a gear turns), never under reduced motion.
A symbol in a figure ("m", "L") is pictured as what the step's terms say it means, and under each figure a *cast* strip
lists the step's symbols that appear in it, each with its picture. Pictures are added only when their keyword is in
the label, because a decorative or wrong picture hurts (the seductive-detail effect: Rey 2012,
doi:10.1016/j.edurev.2012.05.003; the multimedia principle: Mayer 2009); a figure or the AI can set `icon` or turn
pictures off (`icons: false`). In tables, pictures appear only when most rows have one, so a lone icon is never read as a
highlight.

## 8. Considered and left for later

| Idea (from the brief) | Decision |
|---|---|
| Sonification of data | Later, behind a switch: the mapping must be documented and it must never imply causation (the brief's own caution). |
| Portals between representations (2D graph point → 3D scene) | The lectern and the diorama buttons already open the same spec in another projection; a true "walk through the point" transition is a later round. |
| Foldit / EteRNA-style open problems | Out of scope: this is a learning tool; an "open problem" mode would need validation by real experiments. |
| Semantic cut types (match, scale, cause-effect cuts) | Partly present (the director's dips and pushes); naming every cut by type is planned for the director. |
| Learner model inferring misconceptions from predictions | Kept to what is honest: the ledger stores predictions, confidence and transfer results for the reader; it does not claim to diagnose them. |
