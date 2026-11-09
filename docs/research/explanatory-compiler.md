# The domain-aware explanatory compiler

Status: implemented in round 11 (`js/dio/domains.js`, `js/dio/prims/*.js`, `prompts/12-domain-compiler.md`).
This note is the design basis. It reads the user's brief ("different disciplines have different visual languages") against
the primary sources it cites, says where the brief is right, where it overreaches, and turns it into a routing table
that code can execute.

## 1. Thesis, checked

The brief claims that a mechanical engineer, a programmer, a mathematician, an economist and a philosopher all explain
*systems*, but systems of different **structure**, and that each discipline has evolved a visual grammar fitted to its
structure. Two corrections make the claim usable:

1. **Structure, not discipline, decides the picture.** A causal loop is the right picture for inflation (economics), for
   predator–prey cycles (ecology) and for a thermostat (engineering). A state machine fits a CPU and a vending machine and
   a legal procedure. So the compiler classifies twice: a *domain* (which sets defaults, vocabulary and the didactic
   sequence) and a *structure* (which selects the primitive). The routing table below goes structure-first; domain only
   breaks ties and sets the plan.
2. **Animation is not automatically better than a good still.** Tversky, Morrison and Bétrancourt's review found that
   most studies claiming an advantage for animation compared it with *worse* static graphics, and that animation helps
   when it is congruent with the change it shows and slow and controllable enough to be apprehended [T02]. Mayer and
   Moreno's load-reduction principles point the same way: segment the material, let the learner set the pace, do not add
   decoration [MM03]. Therefore every primitive here is **step-controlled** (the learner advances it) or
   **learner-driven** (a slider, a drag), never a free-running movie, and every one has a correct, complete still state
   for reduced motion. And the compiler has an explicit **plain analytic slide** mode (the Perun lesson in the brief):
   when the content is a dense table of evidence, a clean chart with annotations beats a diorama.

## 2. Sources and what each one contributes

| Source | What we checked | What it gives the compiler |
|---|---|---|
| PhET, *implicit scaffolding* [PMP13] | The design strategies: a bounded *range of interactions*, *affordances*, *productive constraints* ("constraints are productive when the limitations they place increase the likelihood of intended usage"), *immediate feedback*, coordinated *multiple representations* with matching colour codes; tested by think-aloud interviews (the framework from 125 sims and 600+ interviews). | The control budget: at most **two** live controls per primitive plus a step bar; slider ranges chosen so every value is meaningful; every control updates the picture and a number at once; colour codes shared between the picture, the equation and the readout. Wieman et al. [WAP08] for the programme's evidence base. |
| Red Blob Games, *Introduction to A\** [RBG] | The page teaches BFS → early exit → Dijkstra → greedy → A\* as a progression where each algorithm fixes the previous one's weakness; the reader drags the start and the goal and opens holes in walls; the frontier is drawn growing, `came_from` as arrows ("flow field"), cost as a distance field; an admissible heuristic keeps A\* optimal (Hart, Nilsson, Raphael [HNR68]). | `algorithm_sandbox`: movable start/goal, paintable walls, the frontier, visited set and path in three distinct inks, an algorithm switch (BFS, Dijkstra, greedy, A\*) so the *difference* is observable, step-by-step or run. |
| LOOPY (Nicky Case) [LOOPY] | Systems are drawn as "circles & arrows"; a learner perturbs a node and watches signals travel; public domain (CC0). System dynamics fixes the semantics: an edge has a polarity (+ same direction, − opposite), a loop's polarity is the product of its edges; an even number of − edges makes it reinforcing (R), an odd number balancing (B) [S00]. | `causal_loop`: signed edges, a pulse the learner launches from any node, loops found automatically and labelled R/B by the product of signs (not by hand, so the label can never contradict the edges). |
| Seeing Theory (Kunin, Guo, Devlin, Xiang; Brown) [ST] | Six chapters from basic probability to regression; explorable visualisations meant as "an additional resource", used "in both a prescribed … and exploratory ways". | `distribution_lab`: samples arrive one at a time into a histogram, the density is drawn on top, μ and σ sliders move both, and the formula's symbols are colour-linked to the picture (μ = the dashed centre line, σ = the bracket). |
| The Pudding [SB18]; Segel & Heer [SH10]; Hullman & Diakopoulos [HD11] | Pudding pieces move through distinct visual states as the reader advances, the graphic narrowing and widening ("it wasn't just a flat line"); visual stories need "clear, hard, underlying conclusions". Segel & Heer's genres and the *martini glass* (author-driven steps, then reader-driven exploration). Hullman & Diakopoulos: the framing choices in a narrative chart are rhetoric and must be disclosed. | `data_narrative`: an ordered list of chart states driven by the step bar (author-driven), each with its annotation, then free exploration; the **provenance line** (source, year, what was done to the data) is always visible, never in a tooltip, because the framing is part of the claim. A `slides` mode drops the transitions for dense analytic slides. |
| Carneades [GPW07]; Toulmin | Arguments as graphs of statements and argument nodes; premises, assumptions and exceptions carry different burdens; acceptability propagates from premises to conclusions. | `argument_map`: claim, premises, objections, counterexamples, responses and revised claims as typed nodes; *challenging* a premise marks it rejected and propagates: a conclusion supported only through rejected premises turns doubtful, an objection's target is weakened until a response answers it. |
| Nicky Case, *The Evolution of Trust*; Axelrod & Hamilton [AH81] | Repeated prisoner's dilemma with strategies the learner pits against each other. | Agent systems are routed to the existing 3D model host (`MARKET` is already a zero-intelligence double auction, Gode & Sunder) or to `causal_loop` when the question is about feedback rather than strategy; a full tournament primitive is noted as future work (§7). |
| Karpathy, Ben Eater, Sebastian Lague (from the brief) | Not re-checked here beyond the brief's description; the pattern is well documented in their public material. | `progressive_construction` (simplest version first; each part added because the previous version fails a stated test) and `state_machine` (a clock edge moves a packet along a wire and latches a register; the state is always visible). |
| 3Blue1Brown, Mathologer (from the brief) | As above. | `transform2d` (the grid, î and ĵ under a matrix, the unit square → a parallelogram whose signed area *is* the determinant, the equation's entries colour-linked to the basis vectors, an interpolation slider so the transformation is continuous). |

Not every claim in the brief survived checking: the PhET paper does not use the phrase "make the invisible visible"
(its closest material is energy bars and speed meters exposing unobservable quantities), and the LOOPY page itself says
nothing about R/B loops (that semantics comes from system dynamics, which LOOPY implements informally).

## 3. Domain taxonomy

| Domain | Typical questions | Default didactic sequence (the plan's beats) |
|---|---|---|
| `cs` (programming, computation) | How does this program/machine get from input to output? What state does it keep? | problem → simplest version → why it fails → add the needed part → run it → inspect state |
| `maths` | What does this operation *do*? What is preserved? Why must it be true? | object → operation (continuous) → invariant → formal statement → test a case |
| `economics` | What causes what, with what feedback? Which explanation fits the evidence? | situation → mechanism (chain/loop) → intervention → predict → reveal → competing account |
| `business` | How does this company make money? Where is the bottleneck? | actors → flows of goods and money → unit economics → decision → consequence |
| `philosophy` | Is this claim justified? What follows if a premise fails? | question → claim → premises → objection → response → revised claim |
| `data` | What does the evidence show, and how sure are we? | question → first chart state → comparison → annotation of the key point → provenance → explore |
| `physical` (physics, chemistry, biology, earth) | How does this mechanism work in space and time? | the existing Owen sequence (curiosity → orientation → decomposition → inspection → mechanism → intuition → reconstruction) |

## 4. Structures and their primitives

| Structure | What it is | Primitive | Medium (first choice → fallback) |
|---|---|---|---|
| `construction` | a system built up part by part, each part justified by a failure of the previous version | `progressive_construction` | 2D figure (staged) → 3D diorama (parts drop in) |
| `state_machine` | discrete states advanced by a clock or events; values held in registers | `state_machine` | 2D figure (signal journey) → 2.5D panel |
| `transformation` | a map that moves every point; what is preserved | `transform2d` | interactive simulation |
| `distribution` | a population of outcomes and its parameters | `distribution_lab` | interactive simulation |
| `causal_graph` / feedback | variables linked by signed influence, with loops | `causal_loop` | interactive simulation → 3D diorama |
| `competing` | two or more accounts of the same observations | `competing_explanations` | 2D figure (side by side) |
| `flow_network` | actors exchanging goods, money, information | `flow_network` | 2.5D panel → 3D diorama |
| `argument_graph` | claims supported and attacked by other claims | `argument_map` | interactive 2D |
| `taxonomy` | a classification that orients the learner | `tree` (existing figure) | 2D figure |
| `data_narrative` | evidence shown as a sequence of chart states | `data_narrative` (or its `slides` mode) | 2D figure / analytic slides |
| `algorithm` | a procedure over a structure whose internal state can be shown | `algorithm_sandbox` | interactive simulation |
| `mechanism` | physical parts moving in space | built-in 3D model or authored scene | 3D diorama |
| `agent_system` | many agents following local rules | built-in agent model (market, Galton) or authored scene | 3D diorama |

## 5. Choosing the medium

The rule the classifier applies (`js/dio/domains.js`, `mediumFor`), in order:

1. **3D diorama** when the idea is *spatial*: parts with positions, a mechanism, a physical process, or agents moving
   in space (the existing grammar: explode, section, zoom, POV). Never for an abstract structure just to look rich.
2. **2.5D panel** (the lectern: the primitive set on a raised, tilted board with its parts on lifted layers) when the
   structure is a *network* (flows, loops, state machines) that benefits from size, focus and a calm full-screen view
   but has no meaningful third spatial dimension.
3. **Interactive simulation** (an in-scroll figure with ≤ 2 controls) when the learning comes from *manipulating a
   parameter and seeing the consequence at once*: transformations, distributions, algorithms, feedback.
4. **2D figure** (step-controlled) for arguments, competing explanations, constructions and narratives: the structure is
   logical, and depth would add nothing.
5. **Plain analytic slide** when the step is mainly a table or many numbers to compare: a clean chart, its annotation and
   its source, no animation.

Every primitive renders in the scroll (interactive inside its fold) and can be opened on the lectern; four
(`progressive_construction`, `state_machine`, `causal_loop`, `flow_network`) also compile to a 3D scene spec for a
topdown diorama where a spatial reading helps.

## 6. Interaction budget (PhET, applied)

- At most two continuous controls; the rest are a step bar (◂ step k of n ▸) and one primary action (Pulse, Run, Draw 100).
- Every control gives feedback in the same frame: the picture, a readout, and the linked symbol of the equation.
- Ranges are bounded to meaningful values (σ > 0; matrix entries in [−2, 2]; walls cannot cover the start or goal).
- Calm / `prefers-reduced-motion`: nothing moves by itself; steps change instantly; a pulse shows its end state.
- Labels are typeset with the app's maths typesetter (`svgMath`, `mathHTML`), measured after layout and kept inside the
  frame; a label that does not fit is wrapped, then shrunk, never clipped.

## 7. Limits and future work

- Agent-based repeated games (Evolution of Trust) are routed to existing agent models, not yet a primitive.
- Fields and flows (vector fields, streamlines) use the existing `phase` diagram.
- Visual proof by dissection is approximated by `progressive_construction` with geometric parts; a dedicated dissection
  primitive (rigid pieces sliding between two arrangements with area preserved) is the next one worth building.
- The heuristic classifier is keyword- and shape-based; the AI field (`step.visual`) overrides it, and the quality gate
  flags disagreements so they can be reviewed.

## References

Verified against OpenAlex on 2026-11-09 where marked ✓.

- [AH81] Axelrod R., Hamilton W. D. (1981). The evolution of cooperation. *Science* 211, 1390–1396. doi:10.1126/science.7466396 (not found by OpenAlex title search).
- [GPW07] ✓ Gordon T. F., Prakken H., Walton D. (2007). The Carneades model of argument and burden of proof. *Artificial Intelligence*. doi:10.1016/j.artint.2007.04.010
- [HD11] ✓ Hullman J., Diakopoulos N. (2011). Visualization rhetoric: framing effects in narrative visualization. *IEEE TVCG*. doi:10.1109/TVCG.2011.255
- [HNR68] ✓ Hart P. E., Nilsson N. J., Raphael B. (1968). A formal basis for the heuristic determination of minimum cost paths. *IEEE Trans. Systems Science and Cybernetics*. doi:10.1109/TSSC.1968.300136
- [LOOPY] Case N. (2017). LOOPY: a tool for thinking in systems. https://ncase.me/loopy/ (source: https://github.com/ncase/loopy, CC0).
- [MM03] ✓ Mayer R. E., Moreno R. (2003). Nine ways to reduce cognitive load in multimedia learning. *Educational Psychologist*. doi:10.1207/S15326985EP3801_6
- [PMP13] ✓ Podolefsky N. S., Moore E. B., Perkins K. K. (2013). Implicit scaffolding in interactive simulations: design strategies to support multiple educational goals. arXiv:1306.6544
- [RBG] Patel A. Introduction to the A\* algorithm. Red Blob Games. https://www.redblobgames.com/pathfinding/a-star/introduction.html
- [S00] ✓ Sterman J. D. (2000). *Business Dynamics: Systems Thinking and Modeling for a Complex World*. Irwin/McGraw-Hill.
- [SB18] Merten P. (2018). How The Pudding structures stories as visual essays. *Storybench*, 2 March 2018.
- [SH10] ✓ Segel E., Heer J. (2010). Narrative visualization: telling stories with data. *IEEE TVCG* 16(6). doi:10.1109/TVCG.2010.179
- [ST] Kunin D., Guo J., Devlin T., Xiang D. *Seeing Theory*. Brown University. https://seeing-theory.brown.edu/ ; Kunin D. (2018), Brown CS blog, 22 January 2018.
- [T02] ✓ Tversky B., Morrison J. B., Bétrancourt M. (2002). Animation: can it facilitate? *International Journal of Human-Computer Studies* 57, 247–262. doi:10.1006/ijhc.2002.1017
- [WAP08] Wieman C. E., Adams W. K., Perkins K. K. (2008). PhET: simulations that enhance learning. *Science* 322, 682–683. doi:10.1126/science.1161948 (not found by OpenAlex title search).
