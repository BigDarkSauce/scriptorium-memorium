# Motion figures: the process, played out

Every "Picture it" and "Common mistake" box in a scroll now carries a short animation of what its paragraph
describes: an event, a process or a change. A mistake is shown as two worlds running side by side, the one the
mistake predicts and the real one. Code: `js/room/motion.js` (player), `js/seeds-motion.js` (the 123 animations of the
example library), `js/room/gif.js` (save as GIF), `tools/test-motion.mjs` (coverage and drawing test).

## Why animate, and how (all references checked in OpenAlex)

| Finding | What it decided |
|---|---|
| Instructional animations beat static pictures on average, more so when they represent the change itself (Höffler & Leutner 2007, *Learning and Instruction*, doi:10.1016/j.learninstruc.2007.09.013; Berney & Bétrancourt 2016, *Computers & Education*, doi:10.1016/j.compedu.2016.06.005). | Animate only what changes; every moving mark stands for a quantity or an object the paragraph names. The keyword-guessed decorative pictures in the contrast cards were removed. |
| Congruence and apprehension: an animation helps when it shows exactly the change in question, schematically and slowly enough to follow (Tversky, Morrison & Bétrancourt 2002, *IJHCS*, doi:10.1006/ijhc.2002.1017). | Ink-on-parchment schematics, not realism; 6–22 s, about the paragraph's reading time. |
| Learner control and segmentation help (Mayer & Chandler 2001, *J. Educ. Psychol.*, doi:10.1037/0022-0663.93.2.390). | Captioned beats with tick marks on the scrub bar; pause, scrub, replay. |
| Learners look at what is salient, not at what matters, unless cued (Lowe 2003, doi:10.1016/s0959-4752(02)00018-x; de Koning et al. 2009, doi:10.1007/s10648-009-9098-7). | Colour and motion go to the relevant part (the force arrow, the crossing molecule, the red gap of a shortage). |
| Simulations work by making the invisible visible and responsive (Podolefsky, Perkins & Adams 2010, doi:10.1103/physrevstper.6.020117). | Molecules, wall hits, forces, field lines and flows are drawn; gases are real (seeded) simulations, not loops. |
| Robust misconceptions are wrong process models, not wrong facts (Chi 2005, *J. Learning Sciences*, doi:10.1207/s15327809jls1402_1). | A mistake is played as its own world ("If the mistake were true") beside what happens, and fails visibly. |
| Auditory graphs can carry the shape of data (Flowers 2005; Nees & Walker 2007). | ♪ plays the changing quantity as pitch, or a gas's wall hits as clicks, so a rise in pressure is heard as a denser crackle. |
| Viewers segment films at changes of situation, and cuts follow a grammar (Zacks, Speer & Reynolds 2009, doi:10.1037/a0015305; Cutting 2016, doi:10.3758/s13423-016-1051-4). | Dioramas name each step's opening shot with Guides on ("push in · towards the part that matters"). |

## Style by field

Chosen from the conventions each field's best explainers use (textbook vector diagrams, PhET-style particle
simulations, 3Blue1Brown-style continuous transformations, the staircase-and-water-level picture of a market):

- mechanics: ink line drawings; forces in rubric, velocities in brass, tension in lapis; real equations of motion
  (the 150° pendulum and the double pendulum are integrated, not faked);
- gases and solutions: seeded hard-sphere particles, wall-hit flashes, membranes that pass only what they pass;
- calculus and linear algebra: curves that draw in, zooms that straighten a curve into its tangent, a grid that is
  sheared and turned;
- probability: falling beads through pegs, histograms becoming bells;
- markets: buyers' and sellers' staircases under a price "water level"; trades from a zero-intelligence double auction;
- computing: values hopping between registers; four searches on one grid.

## Honesty rules

Numbers are the step's own. Where a rate is slowed (reactions), a count reduced (1 collision in 25 instead of 2 in
10⁹) or a curve smoothed (CO₂), the animation says so on screen. A written scroll's animation (`intuitionMotion`,
`misconceptionMotion`) that fails `motionIssues` is dropped, never half drawn.

## Portals

When a step has a 3D diorama, its animations carry a "3D ▸" button that opens it: the same process, stepped into.
