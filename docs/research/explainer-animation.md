# Explainer animation: what Jared Owen, Hybrid and Nucleus do, what the research says, and what Scriptorium should build

Written 4 November 2026. This study is the companion to `presentation-craft.md`. That note took the *shot grammar* (wide, push, medium, close, pov) from architectural film. This one asks a narrower question. How do the best mechanism and biomedical explainers move the viewer between scales and into a "subject-eye view"? How do they peel back layers, and how do they label what is happening? Which of those habits help a learner, which only look impressive, and what exactly should `js/dio/director.js`, `js/dio/engine.js` and the lesson data gain?

The document has four parts:
1. what was studied and how (§1);
2. the sources, analysed one by one (§2–3);
3. the research evidence (§4) and a critical judgement of each technique (§5);
4. implementable specs in priority order (§6), guidance for lesson authors (§7), how to verify (§8), and sources (§9).

---

## 0. Terms used in this document

| Term | Meaning here |
|---|---|
| **Macro → micro** | Moving the viewer from a large scale (a body, a clock case) to a much smaller one (a cell, an escapement tooth). A **decade** is one factor of ten in scale. |
| **Continuous zoom** | Crossing scales in one unbroken camera move, as opposed to a **cut** (an instant change of view). A **matched dissolve** is a cross-fade between two shots framed so that the same shape sits in the same place. |
| **Dolly** | Moving the camera physically toward the subject, which changes perspective and parallax. **Zoom (lens)** narrows the field of view (FOV) without moving, which magnifies without parallax. A **dolly zoom** does both at once. |
| **Subject-eye view / POV** | The camera placed at a moving part or particle, looking where it goes. In our engine this is `setPOV`. |
| **Egocentric / allocentric frame** | An egocentric frame codes locations relative to the viewer ("on my left"). An allocentric frame codes them relative to the world or the object ("the pallet is above the escape wheel") (Klatzky 1998). |
| **Establishing shot** | A wide view that shows where everything is before the detail. A **bracketed POV** is a POV ride preceded by an establishing shot and followed by a pull-out that shows where the rider has been. |
| **Cutaway** | Part of an occluding surface is cut away (by a plane, wedge or box) to show the inside. **Poché** is the solid fill drawn on the cut face. |
| **Ghosting / x-ray** | Occluders are drawn semi-transparent (often only their outlines), so the hidden part shows while the occluder's shape stays readable (Feiner & Seligmann 1992). |
| **Peel-away** | Layers are removed or ghosted one at a time in a fixed order, each named as it goes. |
| **Exploded view** | The parts of an assembly are moved apart along their assembly directions, so that each one is visible together with where it belongs (Li et al. 2008). |
| **Isolate** | Every object except the subject is desaturated or dimmed (a *focus + context* technique). |
| **Signalling / cueing** | Any added cue that directs attention or shows structure: colour, arrows, highlighting, labels, numbering (Schneider et al. 2018). **Entity cues** mark one object. **Relational / progressive-path cues** mark a *sequence* of objects in causal order (Boucheix et al. 2013). |
| **Segmenting** | Splitting a continuous animation into meaningful pieces with a pause between them (Rey et al. 2019). **Pre-training** means teaching the names and characteristics of the parts before showing the process (Mayer, Mathias & Wetzell 2002). |
| **Transient information effect** | Information that disappears (speech, animation frames) must be held in working memory. Long transient segments therefore overload it, while a static display can be re-inspected (Leahy & Sweller 2011; Wong et al. 2012). |
| **Spatial / temporal contiguity** | Words placed next to the thing they describe, or presented at the same moment (Ginns 2006). |
| **Modality effect** | Narration with pictures beats on-screen text with pictures, especially when the pace is set by the system (Ginns 2005). |
| **Desert fog** | Disorientation in a zoomable space when the view contains nothing recognisable (Jul & Furnas 1998). |
| **Effect sizes** | *d* and *g* are standardised mean differences. As a rough guide, 0.2 is small, 0.5 medium and 0.8 large. |

---

## 1. What was studied, and the limits of this study

**Material examined**
- **Three full transcripts** (YouTube caption tracks, read in full, with timestamps):
  - Jared Owen, *How does a Spacesuit work? (NASA)*, 13:02, manual captions, about 2,400 words;
  - *From Weights to Chimes: The Inner Workings of a Grandfather Clock*, 27:29, auto captions, about 4,700 words;
  - Nucleus Medical Media, *Heart Attack Due to Atherosclerosis*, 3:05, auto captions, about 300 words.
- **Interviews and profiles**: BlenderNation's "Meet the Artist: Jared Owen" (2018), diginomica's 2024 profile, BlenderNation's VCR making-of, and jaredowen3d.com.
- **Studio pages**: Hybrid Medical Animation's home page, the *Sickle Cells*, *Influenza & the Heart* and *Clot removal* project pages, and its capabilities blog; Nucleus Medical Media's home page and its workflow and medical-review pages.
- **Reference anchors**: the Eames Office and the Wikipedia entry on *Powers of Ten* (1977), the canonical continuous zoom, and XVIVO's published animation pipeline.
- **About 45 research works**. Each was checked against OpenAlex (`resolve_references`) or Consensus. Effect sizes are quoted only where an abstract was read.

**Three corrections and limits you should know before reading on**

1. **The grandfather-clock video is not by Jared Owen.** The video the brief calls "Jared Owen's grandfather clock" is *From Weights to Chimes* (video id `rEa1HmCJ6Gg`). Its metadata shows it was published by the channel **Quasar-Ed** on 1 August 2025; its sponsor link is `brilliant.org/QuasarEd`. YouTube suggests it beside Jared Owen's *What's inside Big Ben?*, which is probably where the attribution came from. It is still an excellent example of the genre, so it is analysed here, but under its real author. Jared Owen's own clock-related video is *What's inside Big Ben? (Elizabeth Tower)* (`H3xgBS_kDNw`). No transcript of it was taken, because the budget of three transcripts was spent.
2. **I read the narration; I did not watch the pictures.** The tools available extract captions, not frames. So everything said below about *visual* technique comes from one of three places, marked as follows:
   - **[narr]**: what the narration itself shows ("If we take a look inside one of the joints, you can see…" tells you there is a cut into the joint at that moment);
   - **[studio]**: what the creator or studio says about its work;
   - **[gen]**: general, widely known features of the channel or studio. These were **not re-verified for this study**. Treat them as hypotheses to check by watching.
3. **The studio sites say almost nothing about camera grammar.** Hybrid's and Nucleus's pages describe their pipelines and accuracy review in detail. They describe camera work only once: Hybrid's sickle-cell piece "opens inside a blood vessel… the camera then zooms out to show damage in other microvessels". The claims in the brief about "the POV of a red blood cell through a narrowing vessel" or "a surgical tool's viewpoint" describe the *genre*, and no page found here documents them. Where §2 analyses these studios, it works from the transcripts, the pipeline pages and the published research on biomedical animation (Jenkinson & McGill 2012; Jantzen, McGill & Jenkinson 2024; Iwasa 2010; McGill 2008).

---

## 2. The sources, analysed

Each analysis follows the dimensions in the brief: content choice, sequence, camera, layering, labelling, narration and pacing, graphics, and accessibility to novices.

### 2.1 Jared Owen: *How does a Spacesuit work? (NASA)* (2025, 13 min, 7.2 M views)

**Process** [studio], from his interviews:
- He researches from books, documentaries, old NASA documents and emails to experts. He does not trust ChatGPT for facts, finding it "about as likely to get facts wrong as right".
- He models and animates first, then writes and records narration *to fit the animation*.
- He sends an OpenGL preview to family. "If she doesn't get the concept, then I need to revise the video."
- He wants to "let the visuals do a good chunk of the talking", and he "explains the basics" first (in the Titanic video, port, starboard, bow and stern).
- A video takes about two months. Renders take 20–100 h.
- He writes Python to automate repeated motion, such as the 88 hammers of a piano. The VCR's magnetic tape was a curve driven by about 18 hook modifiers.

**Sequence**, reconstructed from the timestamps [narr]:

| Time | Beat | Technique implied |
|---|---|---|
| 0:00 | "What if you want to go outside…? Well, this won't work." | **Problem first.** A counterfactual shows why the object must exist. |
| 0:40 | What space removes: air, pressure, temperature, protection | Function list *before* any part is named. |
| 1:10 | History and the IVA/EVA taxonomy; one exemplar chosen (EMU), "a good example of how the different parts… work in general" | **One representative case** instead of a survey. |
| 2:05 | Two main parts: the pressure garment and the PLSS | **Top-level split into two** before any detail. |
| 2:40–4:00 | Undergarments, then the layers *inside → out*: bladder, restraint, liner, insulation, ortho-fabric | **Layer sequence, one function per layer**, each with an everyday analogy (balloon, backpack fabric, bendy straw, tent, tinfoil, bulletproof vest). |
| 5:00 | Hard upper torso, arms; "If we take a look inside one of the joints, you can see the parts that allow this to rotate" | **A local cutaway** into one bearing. |
| 6:00 | Display module text is mirrored "because an astronaut can't see it" | A **design-reason detail**: the "why" of an odd feature. |
| 7:00 | The donning sequence (with real footage of Jared in a suit) | **Assembly order** as the second pass over the same parts. |
| 8:40 | PLSS: "There's a lot of parts in here, let me just highlight some of them" | **Explicit omission** plus selective highlighting. |
| 10:00 | Sponsor | |
| 11:00 | Operation: tethers, SAFER, what can go wrong | **The system in use**, after the structure. |
| 12:00 | The next-generation AxEMU, compared | **Contrast with a variant.** |

**Content choice**
- Each part is introduced by its job, and the job comes from the problem stated at 0:00.
- The 18 PLSS units, the costs and the history are context in one sentence each; the mechanism gets the minutes.
- The video names what it leaves out ("let me just highlight some").

**Camera and layering**
- The narration repeatedly says "let's take a closer look at the inside", "inside one of the joints" and "here's an image of the ortho-fabric on the outside and the restraint layer on the inside" [narr]. So the camera moves in steps:
  1. a whole-object hero view;
  2. a close view of one region;
  3. a section or peel of that region;
  4. back out.
- [gen] His usual idiom: the object on a neutral, uncluttered background, a slowly orbiting camera, outer shells fading or lifting away to reveal the inside, parts sliding out along their axis, then back. There is little camera shake and few fast cuts.

**Labelling and narration**
- Every new term is spoken and defined immediately, acronym first: "the LCVG or Liquid Cooling Ventilation Garment"; "the HUT or Hard Upper Torso".
- [gen] Short on-screen text labels appear next to the part as it is named.
- Narration runs at about **184 words per minute**, a brisk, conversational pace. The viewer is not expected to read; the eyes stay on the picture.

**Graphics**
- [gen] Clean, slightly stylised models with readable, saturated materials. These are not photoreal, and that suits the purpose (see §4.6 on realism).

**Accessibility to novices**: high. The video uses a problem frame, analogies, acronyms spelled out, one exemplar and a family test. He says he makes videos with young viewers in mind (diginomica).

### 2.2 Quasar-Ed: *From Weights to Chimes: The Inner Workings of a Grandfather Clock* (2025, 27 min)

This is the user's chosen example of "methodically showing what happens at every step of a mechanical sequence", and it is the best of the three for that. Its author writes that he "went with a stylized look to reflect the vintage aesthetic" and "spent a lot of time carefully detailing each part" [studio, video description].

**Sequence** [narr]:
1. **Hook**: the sound of the chime. **What you can see from outside**: three weights mean three functions (time, strike, chime).
2. **History as motivation**: verge and foliot (drifted by hours), then Galileo's isochronism, then the anchor escapement of 1670. Each step is presented as the solution to the previous step's problem.
3. **The physics that sets the form**: T depends only on length, so a 1 s swing needs about 99.4 cm, *which is why the case is tall*. The drop for an 8-day run is a second reason. **The form is explained by its function.**
4. **Overview of the movement**: it is small and made of brass. Weights, chains and sprockets. Then **three gear trains named before any of them is explained** (pre-training).
5. **The time train, traced along the power flow**: weight → sprocket → ratchet and pawl → great wheel → second → centre → third → escape wheel → anchor → pendulum. **The order of the explanation is the order of cause.**
6. **The escapement, with a counterfactual**: "Without this mechanism, the gear train would spin freely until the weight reached the bottom." Then the pallets, half a tooth per swing, and the impulse that replaces friction losses.
7. **Worked numbers**: the gear ratios 7:56 × 8:60 = 1:60, so the centre wheel turns once an hour. 192 revolutions in 8 days becomes about 9.5 turns of the great wheel, which becomes a 1.05 m drop. Overall reduction about 1:603, which is why the weights are heavy.
8. **The strike train as a counter**: rack, snail, gathering pallet, rack hook, with a **worked instance**: "if the outer pin… starts four teeth away… four strikes".
9. **A failure-mode design detail**: the flexible rack tail. If the strike train runs out of power, a rigid tail would jam the snail and stop the clock.
10. **The chime train, its coordination with the strike** ("the hour strike only begins after the final quarter chime"), and the **edge case of manual setting** with its autocorrection.
11. **Energy budget**: all three trains need about 1.05 m of drop, so "all three mechanisms are designed to run out of power at the same time".
12. The gridiron pendulum's temperature compensation, then "Now let's close everything up."

**Camera and layering** [narr]
- "Now let's take a closer look at the internal mechanism"; "let's begin with the time train"; "Now let's take a look at the strike train". The movement is opened once, and then **one train is isolated at a time**, which must mean the other two trains are hidden or recede.
- "Now let's close everything up" closes the frame: **open, explore, close**.
- The worked examples ("four teeth away") are drawn at a scale where single teeth can be counted. That implies close shots that hold while a count plays out.

**Labelling and narration**
- About **170 wpm**, dense with terms (pallet, crutch, arbor, flirt, snail).
- Every term is defined functionally the first time ("a long lever known as the strike flirt").
- [gen] The genre uses on-screen part names and ratio annotations.

**Graphics**: deliberately stylised "vintage" materials [studio].

**Weakness, for a novice**
- 27 minutes is long, and many terms arrive in a row.
- The author says the sound is "a bit off in places".
- The strike and chime sections are mechanically intricate. Without a learner-controlled pause, the **transient information effect** (§4.3) is a real risk: when a rack, a snail, a hook and a pallet all move at once, the earlier ones are already gone from memory.

### 2.3 Hybrid Medical Animation (Edina, MN; 3D since 1998)

**What the studio states** [studio]
- Its specialities are mechanism-of-action (MOA) and mechanism-of-disease (MOD) animation for clinicians and patients. Everything happens in house: concept, storyboard, animation, sound, edit, captioning.
- "Get every detail right"; "not AI-generated".
- *Sickle Cells*: "opens inside a blood vessel, where sickled red blood cells clump together and block circulation… The camera then zooms out to show damage in other microvessels." The companion post says the piece shows the disease "at the molecular, cellular, and vascular levels": HbS polymerisation → sickling and tethering → vaso-occlusion → haemolysis → anaemia.
- *Cancer's Micro World*: "an immersive, cinematic journey" through the tumour microenvironment.
- *Influenza & the Heart*: "white blood cells approaching a burgeoning plaque in a blood vessel… plaque rupture".

**Analysis**
- **Content choice.** These films are disease narratives. Each stage is a *state change* (polymer → sickle → clump → occlusion → ischaemia), and the camera's scale changes with the stage: molecular for polymerisation, cellular for sickling, vascular for occlusion, organ level for damage. **The scale of the shot is chosen by the scale at which the current cause acts.** This is the most transferable idea from biomedical work.
- **Camera.** The one documented move is **inside → zoom out**. The viewer first experiences the occlusion from within, then is pulled back to see that it happens in many vessels. That is a bracketed POV with a *generalising* pull-out: from this vessel to many vessels.
- **Graphics** [gen, genre]: cinematic lighting, depth of field, wet translucent materials, and many instances (crowds of cells). Jantzen et al. (2024) warn that some of these habits mislead at the molecular scale; see §4.6.

### 2.4 Nucleus Medical Media: *Heart Attack Due to Atherosclerosis* (3 min), and the studio's process

**Process** [studio]
- Discovery → script by medical writers with subject experts, **approved before production** → frame-by-frame storyboard → style frames → modelling, rigging, lighting, voice-over, render → at least two formal revision rounds → delivery.
- Review checkpoints at script, storyboard, rough and final.
- A **Review Board** of physicians, PhD researchers and allied health professionals reviews before release.
- Research uses journals, atlases, procedure videos, radiology and guidelines.
- The library is updated when guidelines change.

**Sequence** [narr]. The captions are auto-generated and partly garbled, but the structure is clear:
1. **21 s of pictures before any word.** The opening sets the scene silently.
2. A definition: plaque builds up in artery walls and reduces or blocks flow.
3. **Initiating cause**: damage to the endothelium, the inner wall.
4. Substances accumulate in the wall; cholesterol is oxidised.
5. Inflammatory signalling; monocytes travel to the site and become macrophages, which eat cholesterol and become foam cells.
6. Plaque grows and the wall thickens and hardens; smooth-muscle cells multiply and migrate to form a fibrous cap.
7. The lumen narrows, so less oxygen reaches the organ.
8. The cap ruptures, a clot forms, and the downstream tissue is damaged and dies.

**Analysis**
- **One causal chain, strictly linear, about 12 links, each a cell-level event with a consequence at organ level.**
- **Narration**: about **112 wpm**, with pauses between links. That is two thirds of Jared Owen's pace, which suits a patient audience.
- **Labelling** [gen, genre]: white on-screen terms with thin leader lines, appearing when the term is spoken. A longitudinal **half-section of the artery** (a cutaway tube) shows the wall's layers and lumen in one view, and the camera dollies along it.
- **Accessibility**: designed for patients (health literacy, informed consent). It uses plain causal language and one new term per beat.

### 2.5 Reference anchors used for parameters

- ***Powers of Ten*** (Charles and Ray Eames, 1977; 9 min; narrated by Philip Morrison). It opens on a **1-metre overhead square** of a picnic in Chicago, then:
  - moves out at **one power of ten every 10 seconds**, to about 10²⁴ m;
  - returns at **one power every 2 seconds**, slowing to the original rate again as it enters the man's hand;
  - goes in to about 10⁻¹⁶ m.
  The camera never turns: it travels along one axis, the subject stays at the centre, and the view is always square. That is about as clean an answer to "how to keep orientation through scale jumps" as exists. An on-screen dashboard shows the scale. (The Wikipedia text is garbled on the outer limit; the film's well-known range is 10²⁴ m.)
- **XVIVO's pipeline** (makers of Harvard's *The Inner Life of the Cell*): research → script → black-and-white storyboards that align narration, visuals, transitions and on-screen text → **animatic** (an unrendered preview to judge motion and pacing) → rough → final. The animatic stage exists because pacing is judged in motion, not on paper.

### 2.6 Cross-source summary

| Dimension | Jared Owen | Quasar-Ed | Hybrid | Nucleus | Shared pattern |
|---|---|---|---|---|---|
| Opening | Problem, by counterfactual | Sound, then visible clue (3 weights) | Inside the vessel | Silent establishing 21 s | **Start from the phenomenon, not the parts** |
| Order | Whole → 2 parts → layers → components → use | Overview → trains named → each train along power flow | Molecular → cellular → vascular → organ | Cause → 12 cell-level links → organ outcome | **The order of explanation is the order of cause** |
| Scale moves | Whole ↔ region ↔ section | Case → movement → train → teeth | In → out (generalise) | Body → artery section | **One scale per cause; move when the cause moves** |
| Layering | Peel layers in order; local joint cutaway | Isolate one train at a time | Crowds, translucency | Half-section tube | **Show only the active subsystem** |
| Labels | Acronym, then name, then function | Functional definition at first use | Not documented | Term on screen when spoken | **Name at the moment of mention, defined by its job** |
| Pace | ~184 wpm | ~170 wpm | n/a | ~112 wpm, pauses | Slower for novices |
| Numbers | Few | Worked ratios, energy budget | n/a | None | Worked numbers for mechanisms |
| Counterfactual | "This won't work" | "Without this… spin freely" | n/a | n/a | **Show why a part is needed** |

---

## 3. What these sources *don't* do (and why that matters)

- **None of them runs a long continuous first-person ride.** The POV moments in this genre are short, and they are always surrounded by external views. Hybrid's documented move is *in, then out*.
- **None leaves the learner in control** (they are films). Our app is interactive. That changes which evidence applies: for example, the modality effect is strongest when the pace is set by the system (§4.4).
- **None tests learning.** Popularity (millions of views) and studio reputation are evidence of *engagement*, not of understanding. Their methods must be judged against the learning research in §4.

---

## 4. What the research says

### 4.1 Animation helps only when the change itself is what must be learned
- **Höffler & Leutner (2007)**: 26 studies, 76 comparisons. Animation beats static pictures, d = 0.37 overall. The advantage grows when the animation is *representational* (it shows the change to be learned; d = 0.40), *highly realistic* such as video (d = 0.76), and for *procedural-motor* knowledge (d = 1.06).
- **Berney & Bétrancourt (2016)**: 61 studies, N = 7,036. The overall effect is smaller, g = 0.23. It is larger when the animation is *system-paced* (g = 0.31), when it is paired with *spoken commentary* (g = 0.34), and when there is *no accompanying text* (g = 0.88).
- **Ploetzner, Berney & Bétrancourt (2020)**: a review of 194 studies. Animations beat static pictures *when the features of the displayed change had to be learned*.
- **Tversky, Morrison & Bétrancourt (2002)**: many apparent animation advantages came from giving the animated condition more information. Their two principles:
  - **congruence**: the animation's structure should match the structure of the concept;
  - **apprehension**: the animation must be slow and clear enough to be perceived, which favours schematic, segmented, interactive animation.
- **Hegarty (1992)**: people mentally animate a pulley system **piece by piece along its causal chain**; time and errors grow with distance along the chain.
- **Hegarty, Kriz & Cate (2003)**: an external animation was not better than static diagrams that asked learners to predict motion.

**Consequence for us**: the cinematic "journey" pays off only where the *motion itself* carries the concept. That is true of escapements, valves and diffusion; it is not true of a list of parts. The camera's order should follow the causal chain.

### 4.2 Signalling works, but entity cues fade; relational, synchronised cues work better
- **Schneider et al. (2018)**: 103 studies, N = 12,201. Signalling improves retention (g = 0.53) and transfer (g = 0.33), and it lowers cognitive load. Prior knowledge did not moderate the effect. **Richter et al. (2016)**: signals of text–picture links help, especially learners with low prior knowledge (r = 0.17). **Alpizar et al. (2020)**: d = 0.38.
- **Lowe (2003)**: novices watching a dynamic weather display attended to what was *perceptually salient*, not to what was thematically relevant.
- **Boucheix & Lowe (2010)**, piano mechanism, with eye tracking:
  - *spreading-colour* cues (colour that travels through the mechanism with the action) beat arrows and no cues for both attention targeting and comprehension;
  - cues worked **only when synchronised with the onset of the relevant event**.
- **Lowe & Boucheix (2011)**: standard colour cueing lost its hold after the first viewing.
- **Boucheix et al. (2013)**: cues that mark *relations between event units* ("progressive path" and "local coordinated" cues) beat entity cues and no cues, on both a written test and a hands-on manipulation test. Initial cue engagement did not guarantee lasting attention.
- **Heiser & Tversky (2006)**: arrows in a diagram lead readers to give *functional, causal* descriptions instead of structural ones. **Kriz & Hegarty (2007)**: arrows and signals guided the eyes but did not by themselves improve comprehension; prior knowledge mattered.
- **de Koning et al. (2009)**: a framework that separates cues for *selecting* (where to look), *organising* (structure) and *relating* (integrating).

**Consequence**: our existing focus dimming and pin highlighting are *entity* cues. The research says the larger win is a **progressive cue that travels along the causal chain in step with the motion**. That is exactly the "follow the power flow" order of the clock video.

### 4.3 Segment, pre-train, and fight transience
- **Rey et al. (2019)**, segmenting: 56 investigations, 88 comparisons. Small-to-medium gains in retention and transfer, lower load, longer learning time. Learners with *high* prior knowledge gained more on retention. System-paced segmentation also works. **Spanjers et al. (2010)** explain why: segments mark event boundaries and give processing time.
- **Mayer, Mathias & Wetzell (2002)**, pre-training: learning the names and behaviour of the parts first helps people build a model of the process. **Mayer & Pilegard (2014)** summarise segmenting, pre-training and modality.
- **Leahy & Sweller (2011); Wong et al. (2012)**: transient information hurts most when segments are long and complex. Shorter segments, or static, persistent information, remove the effect.
- **Mayer, Hegarty, Mayer & Campbell (2005)**: across four experiments, *annotated static illustrations* did as well as or better than narrated animations.
- **Ayres & Paas (2007); Wouters, Paas & van Merriënboer (2008)**: reviews of how to keep animations within working memory. They recommend cueing, segmenting, learner pacing and limited realism.
- **Mayer & Chandler (2001)**: simple learner control of pacing (click to continue) improved deeper understanding.
- **Schwan & Riempp (2004)**: interactive video (pause, replay, slow motion) improved learning of nautical knots.

**Consequence**: our "read, then watch" freeze, the beat queue and Play-per-lesson are already segmenting with learner pacing. The tour stage is already pre-training. What is missing is *persistence*: once a beat is over, nothing on screen records what happened.

### 4.4 Words: next to the thing, at the moment; speech beats text when the system sets the pace
- **Ginns (2006)**: 50 studies. Spatial and temporal contiguity both give substantial gains, especially for complex material.
- **Ginns (2005)**: the modality effect (narration rather than on-screen text) is strong under *system pacing*, and it depends on the complexity of the material.
- **Mayer & Fiorella (2014)**: coherence (cut extraneous material), signalling, redundancy (do not narrate identical on-screen text), and spatial and temporal contiguity.

**Consequence**: our callouts with leader lines satisfy spatial contiguity. Because our text is mostly *learner-paced* (frozen while read), the modality disadvantage of text is reduced but not removed. Speech would be an optional addition; it would also require shrinking the on-screen text to keywords, because of the redundancy principle.

### 4.5 Frames of reference, first-person perspective and immersion: the evidence is *not* what the brief assumes
- **Fiorella, van Gog, Hoogerheide & Mayer (2017)**: a *first-person* video of a person assembling a circuit beat a *third-person* video for assembly accuracy, especially for complex tasks. Note the scope:
  - the first person is the **learner's own future viewpoint while doing the task**, not the viewpoint of a gear or a blood cell;
  - de Jonge et al. (2026) find that part of the effect comes from the recorded angle matching the angle the learner expects to work from.
- **Klatzky (1998)**: allocentric (object-centred) relations are what a mechanism's structure *is*. An egocentric view gives relations only relative to the rider, and the learner must turn them into the allocentric model.
- **Makransky, Terkildsen & Mayer (2019)**: immersive VR raised presence (d = 1.30) but *lowered learning* (d = 0.80) and raised EEG-measured cognitive load (d = 0.59), compared with the same simulation on a desktop.
- **Parong & Mayer (2018)**: immersive VR was more motivating but led to poorer learning than a slideshow, unless a generative activity (summarising) was added. **Makransky et al. (2020)**: immersive VR increased liking, not learning; enactment afterwards helped.
- **Cybersickness**: visually induced motion sickness grows with optical flow, rotation and a wide field of view (LaViola 2000). **Fernandes & Feiner (2016)**: subtly narrowing the field of view during motion reduced sickness without users noticing much.

**Consequence**:
- A subject-eye view is a strong *motivator* and a good way to show *what a part experiences*: forces, constraints, narrowing, timing.
- It is a weak way to teach *how the mechanism is laid out*.
- It should be short and bracketed by allocentric shots, and kept comfortable.
- **The research gives no support for long immersive rides as a teaching default.**

### 4.6 Realism: simplified shading beats both bare outlines and photorealism; molecules have rules of their own
- **Scheiter et al. (2009)**: a *schematic* animation of mitosis beat a realistic one. Watching the realistic one twice was worst.
- **Skulmowski (2024)**: simplified shading (basic depth cues) was rated the *least* demanding style; contour-only schematics were the *most* demanding; extra surface detail did not help retention. **Skulmowski et al. (2020)**: realism acts as a retrieval cue when the test is also realistic.
- **Höffler & Leutner (2007)**: realistic *video* helped (d = 0.76). The domains matter: procedural-motor skills benefit from realism.
- **Jenkinson & McGill (2012)**: for a ligand–receptor binding event, the *most* complex version (with crowding and random motion) produced the best understanding. Its follow-up found that students still struggled with *randomness* and gave proteins agency.
- **Jantzen, McGill & Jenkinson (2024)**, twelve design principles for molecular animation. The ones that bear on a "subject-eye view" of a molecule:
  - molecules move by **random collisions** (Brownian motion) and are always moving; they do not start and stop spontaneously;
  - attractions are **local**, so distant molecules rushing toward a target "invokes agency";
  - **unproductive collisions outnumber productive ones**;
  - many copies exist, and **not all of them react**;
  - cells are **crowded**;
  - **light effects such as caustics and god rays do not exist at the molecular scale**; they are "underwater" effects;
  - include a **timescale indicator**;
  - "arrows, glows, and labels are also indispensable for guiding attention".

**Consequence**:
- Our card → real materialisation already lands on stylised physically based materials, which is the right level.
- A POV that rides a neurotransmitter in a *straight, purposeful line* across a cleft teaches a misconception. If we ride a molecule, the ride must be a random walk among many copies, with a timescale shown.
- Our `micro` environment (teal exponential fog, a directional "sun" key, floating motes; `environments.js` line 260) reads as *underwater*. That is acceptable for a pond or a cell seen under a microscope, but wrong for a molecular scene.

### 4.7 Zooming, overview + detail, and keeping orientation across scale
- **Furnas & Bederson (1995)**, space-scale diagrams: a zoom is a path through (position × scale) space.
- **van Wijk & Nuij (2003)**: smooth, efficient zoom-and-pan paths that keep the perceived speed constant, which means moving at a constant *logarithmic* rate in scale.
- **Mackinlay, Card & Robertson (1990)**: approach a point of interest *logarithmically*, covering a fixed fraction of the remaining distance per unit time, so movement is fast when far and slow when near.
- **Cockburn, Karlson & Bederson (2009)**: a review of overview + detail, zooming and focus + context interfaces.
- **Hornbæk, Bederson & Plaisant (2002)**:
  - 80 % of users *preferred* having an overview window, saying it helped them keep track of their position;
  - but users were sometimes *faster without* it, and switching between overview and detail cost time;
  - a map organised in multiple levels (semantic zooming) made the overview unnecessary.
- **Plumlee & Ware (2006)**: zooming loses to multiple windows when a comparison needs more items than visual working memory holds (about 3 to 5).
- **Jul & Furnas (1998)**: in "desert fog" (an empty view), users get lost. Aids that keep a residue of the target visible, so you know where it is, fix this.
- **Bederson & Boltman (1999)**: animated transitions helped users reconstruct the spatial layout of what they had navigated.
- **Jones & Taylor (2009)**: a sense of scale develops through reference objects and the body; an absolute scale needs anchors.
- **Pausch et al. (1995); Stoakley, Conway & Pausch (1995)**, "worlds in miniature": a small handheld copy of the world, with "you are here", helps orientation in virtual worlds.

**Consequence**:
- A continuous zoom should change scale *exponentially* along a straight axis toward a centred target, as *Powers of Ten* does.
- The target should stay marked from the first frame (against desert fog).
- A scale bar should name the decade.
- A small *passive* inset of the macro view helps orientation, but it must not become a second thing to operate.

### 4.8 Cutaways, ghosting, exploded views and step instructions (computer-graphics literature)
- **Feiner & Seligmann (1992)**: cutaways and ghosting chosen automatically to keep important objects visible.
- **Diepstraten, Weiskopf & Ertl (2003)**: interactive cutout and breakaway illustrations.
- **Li, Ritter, Agrawala, Curless & Salesin (2007)**: cuts follow the object's geometry. Box cuts suit rectangular parts, wedge cuts suit radial ones, tube cuts suit cylinders. The cut is animated in, and the cut surfaces stay visible.
- **Viola, Kanitsar & Gröller (2005)**: each object gets an *importance*; less important occluders become sparse or transparent.
- **Li, Agrawala, Curless & Salesin (2008)**: explode parts along their *removal directions*, in an order that respects the blocking relations between parts, and only far enough to separate them. **Bruckner & Gröller (2006)** do the same for volume data.
- **Agrawala et al. (2003)**: step-by-step assembly instructions. Show one step at a time, parts move along their assembly direction, guide lines are drawn, and the viewpoint keeps all parts visible.
- **Kosara, Miksch & Hauser (2001)**: *semantic depth of field*, blurring what is irrelevant, is a cue that is found preattentively (in a single glance).

These papers establish *legibility and usability*, not learning outcomes. They tell us *how* to cut, ghost and explode well, not how much a learner gains.

### 4.9 Individual differences
- **Höffler & Leutner (2011)**, the "ability-as-compensator" hypothesis: learners with low spatial ability struggled with static pictures but did as well as others with an animation. Animation can *substitute* for mental animation.
- **Kalyuga et al. (2003)**, expertise reversal: guidance that helps novices can hinder experts. So every cue we add should be switchable off. Our `cinematic` and `guides` preferences already exist.

---

## 5. Critical assessment for Scriptorium

### 5.1 What Scriptorium already does that the evidence supports

| Existing feature | Matches |
|---|---|
| Tour stage: one actor per step, names pinned | Pre-training (§4.3); Jared's and Quasar-Ed's "name the parts first" |
| Read-then-watch freeze, beat queue, Play per lesson | Segmenting with learner pacing; counters transient information |
| Callout with leader line beside the subject | Spatial contiguity (§4.4) |
| Event slow motion (0.3× / 0.12×) | Apprehension principle (Tversky 2002) |
| Guide arrows and `flows` | Heiser & Tversky's functional arrows. Note that Kriz & Hegarty found arrows alone are not enough (§4.2) |
| Focus dimming of labels, accent light | Entity signalling |
| `sweep` / `topdown` clip planes with poché | The cutaway machinery already exists, but only for the materialisation |
| Question thread, misconception, self-check per step | Generative activity; this is what made VR work in Parong & Mayer (2018) |

### 5.2 Technique-by-technique judgement

| Technique (source) | Verdict | Why |
|---|---|---|
| **Causal-chain traversal** (Quasar-Ed's power flow; Nucleus's linear chain) | **Adopt (must)** | The strongest match between practice and evidence: Hegarty (1992), Boucheix et al. (2013), congruence. Cheap: the data is a list of actor names. |
| **Isolate the active subsystem** (Quasar-Ed's one train at a time) | **Adopt (must)** | Signalling g = 0.53 / 0.33; coherence principle. Risk: cue loyalty fades (Lowe & Boucheix 2011), so it pairs with the chain cue, and it is off during free exploration. |
| **Peel / ghost layers in order** (Jared's spacesuit) | **Adopt (must, ghost mode first)** | The direct way to show an interior while keeping where the interior sits. The legibility evidence is strong (Feiner, Li, Viola); learning evidence is indirect. |
| **Label at mention; persistent numbered markers** | **Adopt (must)** | Temporal contiguity; transient effect; working-memory limits (Plumlee & Ware). |
| **Continuous in-scene zoom with scale bar and target ring** (*Powers of Ten*, Hybrid, Nucleus) | **Adopt (must, within one scene)** | Scale is a central concept in biology and physics (Jones & Taylor). Keeping the target marked fixes desert fog. An exponential path keeps perceived speed even. |
| **POV / subject-eye view** (brief) | **Keep, but restrict (must: comfort + bracketing)** | Immersion raises presence, not learning (Makransky; Parong). First-person evidence is about the learner's own task perspective. Allocentric structure must come from other shots. Molecular POV risks agency misconceptions (Jantzen). |
| **Cutaway cuts: wedge, box** (Nucleus's half-section) | **Adopt (should)** | Reuses existing clipping and poché. Needed when a peel would remove too much. |
| **Exploded view** (Jared [gen]; Agrawala; Li) | **Adopt (should)** | Good for "what parts, how they fit". Not for "how it behaves", because exploding stops the mechanism. |
| **POV along an authored track** (vessel ride) | **Adopt (should)** | Lets a lesson show "inside the narrowing vessel" without simulating the cell. Comfort rules apply. |
| **Context inset (picture in picture)** | **Adopt (should), passive only** | Liked by users and good for orientation, but the cost of switching between views is real (Hornbæk), so it has no controls and shows only during scale jumps and POV. |
| **End-state stills and replay** | **Adopt (should)** | Mayer et al. (2005), static annotated pictures; Schwan & Riempp (2004), replay. This is the main answer to transience. |
| **Worked numbers on screen** (Quasar-Ed's ratios) | **Adopt (should)**, through the existing readouts and callouts | Mechanisms with arithmetic need the numbers next to the parts. |
| **Counterfactual "without X"** (Jared, Quasar-Ed) | **Adopt (could)** | Shows *why a part is necessary*, and pairs with our misconception field. Risk: learners may take the wrong world for the real one, so it must be marked as hypothetical. |
| **Nested multi-level zoom** (body → organ → tissue → cell) | **Could** | Educationally attractive for biology, but expensive: two scenes at once and a heavy authoring burden for the AI. Do it only after the single-scene zoom proves itself. |
| **Narration (text to speech)** | **Could, optional** | Modality evidence is good under system pacing, but our text is learner-paced; redundancy forbids reading out the callout verbatim. |
| **Photorealism, depth of field, motion blur, volumetric "bloodstream"** | **Reject as defaults** | Schematic or simplified shading wins for novices (Scheiter; Skulmowski). Blur hides the moving detail we want read. Caustics and god rays are wrong at the molecular scale (Jantzen). Use semantic depth of field only as an optional focus cue. |
| **Fast continuous journeys, long POV rides, music-driven pacing** | **Reject** | Transient information; immersion without learning; cybersickness. |
| **A 27-minute single film** | **Reject** | Segment into lessons of 3 to 6 beats (our schema already limits a diorama to 3–6 lessons). |

### 5.3 How the techniques fit the architecture
- **The director is the right owner.** Every new technique is either a *shot* (`zoom`, `track`), a *beat overlay* (`chain`, `isolate`, labels, scale bar, inset), or a *scene state applied for one beat and then undone* (`peel`, `cut`, `explode`, `contrast`).
- The last kind must be applied the way edits already are: **as offsets after the simulation's own update** (ARCHITECTURE.md, "edit tool"), and restored at the end of the beat or step.
- **The shot grammar's rule "never two moving shots in a row" extends naturally.** `zoom` and `track` are moving shots; each must be followed by a hold or a static shot.
- **Materials are patched with shared uniforms** (`materialize.js`, `onBeforeCompile`). Any per-object effect (highlight, ghost, cut) must either:
  - work in screen space through a mask pass (preferred for isolate and chain), or
  - clone the material *and re-attach* `onBeforeCompile` and the shader-define key. `Material.clone()` does not carry `onBeforeCompile` over in three.js, so forgetting this would silently drop the card → real patch.
- **The schema change is additive.** Each new lesson field is optional. Built-in models list actors by name, and the new fields reference those names, so `tools/verify-chain.mjs` can check them the same way it already checks `focus`, `pov` and `until`.

---

## 6. Specifications, in priority order

Conventions:
- *Lesson fields* go in `lessons[]` (SCENE_SPEC.md line 17).
- *Model fields* go on `DIO.<model>` or on the scene spec, as `shots` and `flows` do.
- Times are seconds; distances are world units; `R` = `ds.orb.r`.
- All new behaviour is skipped when `cinematic` is off, except labels and the scale bar.

### MUST

#### S1 · `chain`: a progressive causal-path cue with step numbers
**Data**
```json
"chain": ["weight", "sprocket wheel", "great wheel", "centre wheel", "third wheel", "escape wheel", "anchor", "pendulum"],
"chainPace": 0.9,
"chainOn": "event:tick"
```
Each entry may also be `{"a": "actor name", "note": "≤ 6 words"}`. Actor names are matched like `focus`.

**Behaviour**
1. After the instruction beat has been read (timeScale back above 0), a highlight **front** moves link by link through the chain:
   - at `chainPace` seconds per link (default 0.9 s; range 0.5–2.0 s);
   - or, with `chainOn`, one link per matching event, so the cue is synchronised with the motion (Boucheix & Lowe 2010, Experiment 2).
2. **The link the front has reached** gets the full highlight (weight 1.0) for 0.6 s and a numbered badge, `1`, `2`, …, in the pin style.
3. **Links already passed** stay at weight 0.4 and keep their badges.
4. **Links not yet reached** are at 0. Consecutive links are joined by an existing `guide flow` arrow while the front crosses them.
5. If `note` is given, it shows as the badge's caption, ≤ 6 words, for that link's dwell time.
6. The callout kicker reads `Step k of n` (n = number of links).
7. The front runs **twice**: the first pass at the authored pace, the second at 0.6× of it. After that, the badges stay and the glow ends. Two passes because cue loyalty drops after the first exposure; the second pass is a quick consolidation.
8. More than 8 links: the chain is split into consecutive beats of ≤ 8 links, each with its own `Step k of n` numbering continued.

**Rendering**
- Use a **focus-weight mask** (shared with S2). Before the grade pass, render the chain objects into a half-resolution `R8` target:
  - with an override material whose output = `object.userData.focusW`;
  - depth-tested against the main depth texture, so occluded links do not glow through; S3 handles seeing through on purpose.
- The grade pass adds an emissive tint `mix(col, col + accent * 0.55, mask)`. The accent is `#ffd98a`, the same as the arrows, so one colour means "the thing to follow".
- This avoids cloning materials.

**Evidence**:
- Boucheix et al. (2013): progressive-path relational cues beat entity cues.
- Hegarty (1992): mental animation proceeds along the causal chain.
- Schneider et al. (2018): signalling g = 0.53 retention, 0.33 transfer.
- Practice: Quasar-Ed's power-flow order; Nucleus's linear causal chain.

**Expected benefit**: the largest of all the specs for mechanisms and pathways. A plausible gain is of the order of the signalling effects, g ≈ 0.3–0.5. That figure is an inference, not tested in our app.

**Risks**:
- A wrong chain order teaches a wrong causal model. The author must give the order of *cause*, not of position, and `verify-chain` should warn when a chain has links that the step's text never names.
- Visual noise when the mechanism is already busy; S2 helps.

**Verify**:
- `SMOKE_OUT` captures at each link (n stills): exactly one object at weight 1.0, the badges show the numbers 1..k in order, and no badge overlaps another (rectangle intersection = 0).
- A timing log shows link onsets within 50 ms of `chainOn` events.

#### S2 · `isolate`: focus + context dimming
**Data**: `"isolate": true` (subject plus named actors) or `"isolate": ["anchor", "escape wheel"]`. Model default: `DIO.<m>.isolate = true`.

**Behaviour**
- During a beat with a subject, objects outside the focus set are shown at saturation × 0.25 and value × 0.65.
- Ramp in 0.4 s at the start of the shot (after the cut dip), ramp out 0.6 s at the beat's end.
- Off in free exploration, in the tour (the whole object is the subject there), and when the learner grabs the camera (`userGrab`).
- The background and environment are dimmed at value × 0.85 only, so the plates keep their three planes.
- The HTML layer (callouts, pins, legends) is never graded, so legend colours are unchanged (presentation-craft §3).

**Rendering**: the same mask as S1, with weight 1 for the focus set. The grade pass computes `col = mix(grey(col)*0.65 ... , col, mask)` with the ramp uniform `uIso`.

**Evidence**:
- Signalling and coherence (Schneider 2018; Mayer & Fiorella 2014).
- Semantic depth of field shows that de-emphasis is detected preattentively (Kosara 2001).
- Practice: Quasar-Ed isolates one train at a time.

**Risks**:
- Over-use: if every beat isolates, isolation stops meaning anything.
- When the subject is small, the dimmed context *is* the orientation. Keep value × 0.65, never black.

**Verify**:
- Extend the existing luminance check (presentation-craft §1): the mean luminance difference between the focus mask region and the rest is ≥ 0.15, and the context region keeps a luminance standard deviation ≥ 0.04, so it is still readable and not flat.
- Screenshot pairs with isolate off and on for every built-in model.

#### S3 · `peel`: ordered layer reveal (ghost, lift or clip)
**Data**
```json
"peel": {
  "layers": ["ortho-fabric", "insulation", "liner", "restraint", "bladder"],
  "mode": "ghost",
  "order": "out-in",
  "dwell": 2.2,
  "restore": "step"
}
```
`mode` is `ghost` | `lift` | `clip`. `order` is `out-in` (reveal) or `in-out` (build up, like donning). `restore` is `step` | `beat` | `never`.

**Behaviour**: for each layer in order:
1. A label beat (`Layer k of n · <name>: <describe>`, from the actor's `describe`) is anchored on that layer.
2. Then the layer changes:
   - **ghost**: opacity 1 → 0.12 over 0.8 s, `depthWrite=false`, `renderOrder` by layer index; the ink edges (already in the scene) stay at alpha 0.5, so the shape remains readable (Feiner & Seligmann's ghosting);
   - **lift**: translate along the outward direction from the assembly centre by 1.2 × that layer's bounding radius over 0.9 s, then hold;
   - **clip**: a plane sweeps across the layer only, with poché on the cut, reusing materialize's clip/poché path.
3. Wait `dwell` seconds (or the label's read time, whichever is longer), then the next layer.
4. After the last layer the inner subject gets S2 isolation.
5. Restore runs in reverse order at 2× speed.

**Implementation note**: ghosting needs per-material transparency. Clone the materials of the peeled objects *and re-attach the materialize `onBeforeCompile` patch and its program-cache key*; restore the originals afterwards. Thin-shell glass is already transparent; skip it.

**Evidence**:
- Feiner & Seligmann (1992); Viola et al. (2005), importance-driven visibility; Li et al. (2007).
- Practice: Jared Owen's layer-by-layer spacesuit, with one function per layer.

**Risks**:
- Transparency sorting artefacts between ghosted layers. Use `renderOrder` and FrontSide only.
- Performance with many transparent layers. Cap at 6 layers per peel.

**Verify**:
- One still per layer: the next inner layer is visible (≥ 60 % of its projected box unoccluded by opaque pixels, measured with the mask) and the ghosted layer's silhouette is still visible (edge pixels present).
- No z-fighting flicker across 30 frames (frame-difference energy below a threshold in a static hold).

#### S4 · `zoom`: a continuous macro → micro shot inside one scene, with scale bar and target ring
**Data**
```json
"shot": "zoom",
"zoom": {
  "to": "escape wheel",
  "from": "wide",
  "perDecade": 3.0,
  "fovEnd": 30,
  "stations": [{"at": "movement", "hold": 2.0}, {"at": "escape wheel", "hold": 2.5}],
  "back": false
}
```
`from` is `wide` | `current`. Scene field: `"scale": {"m": 0.01}` gives the metres per world unit. With no `scale`, there is **no scale bar**; never invent one.

**Behaviour**
1. **Target first.** A 2D ring (40 px, accent colour, 1.5 px stroke) appears on the target's projected position *before* any motion. It holds a constant screen size until the object becomes larger than the ring, then it fades. This prevents desert fog (Jul & Furnas 1998).
2. **Centre first, then travel.** Over the first 0.6 s the aim pans so that the target sits at frame centre, at constant distance. From then on, all travel is along **one straight axis** toward the target, which keeps the travel direction constant, as in *Powers of Ten*.
3. **Exponential distance.** With start distance `d0` and end distance `d1 = r_target / tan(fovEnd/2) × 1.4`:
   - `d(u) = d0 · (d1/d0)^e(u)`, where `e` is smootherstep and `u ∈ [0,1]`;
   - duration `T = clamp(perDecade × log10(d0/d1), 2.5, 14)`;
   - this is constant perceived speed (van Wijk & Nuij 2003; Mackinlay et al. 1990).
4. **Lens.** FOV eases from the base lens to `fovEnd` over the last 30 % of `u` only, at most 10° of change, to avoid a strong dolly-zoom distortion.
5. **Stations.** At each station (an actor), the dolly pauses: a label beat, a scale-bar update, `hold` seconds. The zoom is then segmented, which counters transience (§4.3).
6. **Clipping planes.** `near = max(1e-5, d(u) × 0.01)` and `far = max(d(u) × 100, distance to farthest visible context)`, so the near/far ratio stays ≤ 10⁴ for 24-bit depth. Logarithmic depth is *not* used, because it has to be set when the renderer is created and it interacts with the post chain.
7. **Scale bar.** At the bottom left of the free frame:
   - length = a nice number (1, 2 or 5 × 10ᵏ) of real units giving 60–140 px at the target's depth;
   - the unit switches automatically through km, m, cm, mm, µm, nm;
   - the label is e.g. `1 mm`, with the decade change briefly highlighted.
8. **`back: true`** reverses the move (micro → macro) after the step. This is Hybrid's generalising pull-out ("…and this happens in many vessels").
9. **Grammar.** `zoom` is a moving shot. The next shot must be static, and `zoom` may not follow `push`.

**Evidence**:
- Space-scale navigation (Furnas & Bederson; van Wijk & Nuij; Mackinlay et al.).
- Orientation aids (Jul & Furnas); scale cognition (Jones & Taylor).
- Practice: *Powers of Ten*; Nucleus's body → artery; Hybrid's vascular ↔ cellular.

**Risks**:
- Floating-point precision at very small near planes. Model sizes in our dioramas span ≤ 10³, so a single scene is fine; deeper journeys need S12.
- The FOV change and the dolly together can feel like vertigo. The 10° cap is there for that.

**Verify**:
- Log `d(u)`: `log10 d` should be linear in time within ±5 % outside the ease zones.
- The target's screen position stays within 3 % of frame centre after the first 0.6 s.
- The ring is visible in the first frame.
- The scale-bar label matches `spec.scale` within one nice step.
- Near/far ratio ≤ 10⁴ at every frame.
- Frame sequence at 10 fps checked for jerks: the frame-to-frame change in angular size should be smooth.

#### S5 · Label timing and persistence rules (director and pins)
These are rules, not new fields. They apply to every beat.

1. **Onset sync.** A part's pin turns "hot" and its label appears within 0.3 s of (a) the beat that first names it or (b) the event it takes part in. Temporal contiguity.
2. **At most 4 full labels** on screen at once. Older ones collapse to **numbered dot markers** (the `chain` index, or the order of introduction). The markers persist for the whole step, so the scene keeps a record of what was named. This counters transience; Plumlee & Ware (2006) put working memory at about 3–5 items.
3. **Label text on the object ≤ 4 words.** Definitions go in the callout. Jared Owen's practice: name, then function, in speech.
4. **Acronyms are always expanded at first use**: `LCVG (Liquid Cooling Ventilation Garment)`.
5. **Leader lines never cross the subject's box** (already avoided) **or each other**: sort the lines by angle around the subject and swap sides if they cross.
6. **Numbers carry units**, and worked arithmetic (gear ratios, rates) appears in the callout as one line, e.g. `7:56 × 8:60 = 1:60 → centre wheel 1 rev/h`.
7. **A label stays at least its reading time** (`readTime`), even if the event is over.
8. **Callout kicker numbering**: `Step k of n` for chains and peels; `Layer k of n`; `Station k of n` for zooms.

**Verify**:
- Count `.pin.in` elements per frame: ≤ 4 full labels.
- Measure leader-line crossings: 0.
- For every event beat, the delay between the event and its label is ≤ 0.3 s.

#### S6 · POV: comfort limits and bracketing
The current POV (`engine.js` 221–283) uses a 74° FOV, a turn rate toward the goal of 90°/s (1.57 rad/s), a position lerp of 10/s and a dip to dark on entry and exit. Changes:

1. **Turn rate.** The automatic turn is capped at **60°/s** (1.05 rad/s), with acceleration ≤ 120°/s². User drag stays fast, because self-produced motion is less nauseating. **Roll is locked to 0.**
2. **Comfort vignette.** When the camera's angular speed is above 30°/s, or its linear speed is above 3 × the actor size per second, the grade pass darkens the periphery with strength `clamp((ω − 30)/60, 0, 0.55)`, easing in over 0.2 s and out over 0.5 s (Fernandes & Feiner 2016).
3. **Reduced motion.** With `prefers-reduced-motion` or `prefs.motion = 'reduced'`:
   - POV beats become a **static POV still**: the eye placed at the actor and held, with no ride;
   - zooms (S4) become a cut + scale bar.
4. **Bracketing.** When a lesson asks for `shot: "pov"`, the director inserts:
   - **before**: a `medium` shot of the actor in context for 1.5 s, with the caption `You will see as: <actor>` and the actor's pin hot;
   - **after**, on leaving: a `medium` pull-out of 2.0 s, with a fading 2D trail of the path the actor just took (the last 4 s of positions) and the caption `You were here`.
   This puts the egocentric experience into allocentric structure (Klatzky 1998), as Hybrid does when it zooms out from inside the vessel.
5. **Off-screen subject arrow.** In POV, when the lesson's subject is outside the view, a small edge arrow points toward it.
6. **Duration.** An automatic POV ride ends after 12 s, or when the step's `until` event fires, whichever comes first; the learner may stay longer by choice.
7. **Molecular agency guard.** In scenes with `env: "micro"`, or for an actor flagged `"diffusive": true`, `verify-chain` warns when a POV lesson's text uses directed-motion verbs ("travels to", "heads for", "seeks", "finds") without the word "random" or "diffuses". The prompt rules (§7) ask for many copies and a timescale readout (Jantzen et al. 2024).

**Evidence**: Makransky et al. (2019); Parong & Mayer (2018); Fiorella et al. (2017), and its limits; LaViola (2000); Fernandes & Feiner (2016); Klatzky (1998).

**Risks**: bracketing adds about 3.5 s per POV, which is acceptable because POV is rare. The vignette can feel like a grade glitch if it is too strong; the cap is 0.55.

**Verify**:
- Log camera angular velocity during every built-in POV: the 99th percentile is ≤ 60°/s, and roll = 0.
- The smoke test asserts the establishing shot and the pull-out run for `shot: "pov"` lessons.
- Reduced-motion run: no camera translation during POV beats.

### SHOULD

#### S7 · `cut`: geometric cutaways
**Data**
```json
"cut": {"kind": "wedge", "on": ["artery"], "axis": [0, 1, 0], "angle": 90, "at": "artery", "animate": 1.2, "restore": "step"}
```
`kind` is `plane` | `wedge` | `box`. `on` is a list of parts or `all`.
- `plane`: one clipping plane with a normal.
- `wedge`: two planes through the axis at ±angle/2, with `clipIntersection = true`, so only the wedge is removed. This is the classic radial cut for cylinders, vessels and cells (Li et al. 2007).
- `box`: three planes with `clipIntersection` (a corner cut).

**Behaviour**: the cut grows from 0 over `animate` seconds. Poché fills the cut faces in ink (existing back-face path). The parts inside are untouched.

**Implementation**: per-material `clippingPlanes` on clones of the cut parts only (with the patch re-attached; see §5.3). `renderer.localClippingEnabled` must be on; materialize already relies on clipping.

**Evidence**: Li et al. (2007); Diepstraten et al. (2003); presentation-craft §2 (the "cutaway/section" format).

**Verify**: a still mid-cut and at the end. Poché is present on the cut faces (ink-coloured pixels along the cut edge), and the interior actors are visible.

#### S8 · `explode`: assembly view
**Data**
```json
"explode": {"parts": ["case", "great wheel", "centre wheel", "escape wheel", "anchor"], "dir": "radial", "dist": 0.6, "stagger": 0.25, "guides": true, "hold": 3, "collapse": true}
```
`dir` is `radial` or a vector `[x,y,z]`. `dist` is a multiple of the assembly radius.

**Behaviour**
1. The simulation is frozen (`timeScale` 0), because exploding contradicts the dynamics.
2. Each part moves along `dir` from its home position. For a stack along an axis, its offset is proportional to its rank, so the order is preserved (Li et al. 2008).
3. Parts start `stagger` seconds apart.
4. Dashed guide lines join home to the current position.
5. Labels follow S5.
6. `collapse` reassembles the parts in *assembly order* (reverse), one at a time, with each part's name: the assembly instruction of Agrawala et al. (2003). Then the simulation resumes.

**Implementation**: offsets applied after the simulation update (like edit overrides); at most 12 parts.

**Evidence**: Li et al. (2008); Agrawala et al. (2003).

**Risk**: for a mechanism, the exploded state hides how the parts *interact*. Use it for "what is it made of", then run S1 on the assembled model for "how does it work".

**Verify**: in the hold still, no two part boxes overlap on screen (overlap area < 5 %), and every part is fully inside the free frame.

#### S9 · `track`: a POV or camera ride along an authored path
**Data**
```json
"track": {"points": [[0,1,4], [0,1,1], [0.2,0.9,-2], [0,1,-5]], "dur": 8, "lookAhead": 0.08, "lookAtSubject": 0.3, "preview": true}
```
Alternatively `"track": "actor"`: follow an actor with look-ahead, as the current POV does.

**Behaviour**
- A `CatmullRomCurve3` (centripetal) parametrised by arc length.
- The eye is at `p(s)`. It looks at `p(min(1, s + lookAhead))`, blended `lookAtSubject` toward the lesson subject.
- Speed profile: ease in and out over the first and last 15 %, constant between.
- `preview: true` draws the rail as a faint ribbon for 1.0 s before departure, so the learner knows where the ride goes; this reduces disorientation.
- All S6 comfort and bracketing rules apply.
- A model may define named tracks, `DIO.<m>.tracks = {"vessel": [...]}`, which lessons reference as `"track": "vessel"`.

**Use**: "inside the narrowing vessel", "along the airflow", "along the chain path". Use it where simulating the rider as a physical actor would be overkill.

**Verify**: the angular velocity log (≤ 60°/s); the rail preview is visible in the frame before motion; the camera stays at least `near × 10` from all geometry (a raycast every 0.1 s).

#### S10 · Context inset ("you are here")
**Behaviour**
- During S4 zooms, S6/S9 POV and S12 level changes, a passive inset shows the overview camera (`ds.overviewKey()`):
  - 220 × 140 px (140 × 90 on phones);
  - a dot and a small frustum wedge for the current camera position, and the target ring;
  - placed in the free-frame corner opposite the callout.
- Rendered every 3rd frame at that resolution with a viewport and scissor second render (no post chain; ink edges on).
- It has **no controls**.
- It fades out 2 s after the shot ends.

**Evidence**: worlds in miniature (Stoakley et al. 1995); overview + detail preferred by 80 % (Hornbæk et al. 2002); the integration cost is the reason it stays passive.

**Risk**: about +10–20 % GPU time while visible. Skip it when the adaptive resolution is already reducing quality.

**Verify**: frame time stays under 22 ms with the inset on (the renderer's budget); the inset never overlaps the callout or the panels (rectangle test).

#### S11 · Persistence: end-state stills and replay
**Behaviour**
- When a lesson completes, capture a 160 × 100 still of the final frame (the same path as `renderSketch`, with the stage-plate numbering).
- Show it in the lesson's panel entry as a **before / after pair** (the still at the start of the step and at its end).
- Add a **↺ Replay** button that re-runs the step's `set` + `run` from the saved start state at 0.5× speed, with S1 and S5 active.

**Evidence**: static annotated pictures (Mayer et al. 2005); replay control (Schwan & Riempp 2004); transient information (Wong et al. 2012).

**Verify**: after each lesson, the panel holds two images, and the replay reproduces the end state (the same event texts are logged).

#### S12 · Authoring guidance in the prompts (see §7)
Add the §7 rules to `prompts.js` (the analyse and author prompts) and to `docs/SCENE_SPEC.md`. Extend `verify-chain.mjs`:
- `chain`, `peel`, `explode` and `zoom.to` names must match actors;
- warn when a `chain` link is never named in the step's text;
- warn when a POV is used in a micro scene without randomness words (S6.7);
- warn when `zoom` is used without `spec.scale` (no scale bar).

### COULD

#### S13 · `levels`: nested multi-scale scenes (*Powers of Ten* for biology)
**Data**
```json
"levels": [
  {"id": "heart", "spec": {}, "scale": {"m": 0.01}},
  {"id": "artery wall", "spec": {}, "scale": {"m": 1e-5}, "enter": {"from": "heart", "at": "coronary artery"}}
]
```
**Behaviour**
1. S4 zooms in level A until the `at` actor's projected height reaches 60 % of the frame.
2. Then a **0.6 s matched dissolve** into level B. Level B's camera is posed so that its overview silhouette lines up with the anchor in A.
3. The zoom continues in B, and the scale bar continues across the switch.
4. Level B is built in the background when A starts (scene build cost) and disposed of when the learner leaves.

**Cost and risk**: two scenes in memory, a long build time on weak GPUs, and much harder authoring for any AI. Do this only after S4 has proved itself in use.

#### S14 · `contrast`: a "what if it weren't there" counterfactual
**Data**: `"contrast": {"set": {"escapement": 0}, "run": 3, "text": "Without the anchor the train spins freely until the weight lands.", "restore": true}`

**Behaviour**: after the normal run, a **"What if…" banner** appears and a cool tint marks the frame as hypothetical. The counterfactual runs `run` seconds, then the state is restored and the normal behaviour replays for 2 s.

**Source**: Jared Owen ("this won't work") and Quasar-Ed ("without this mechanism…"). It complements the misconception field. Only for models whose parameters can switch a part off.

#### S15 · Optional narration
**Behaviour**: Web Speech API, off by default. When it is on, the callout collapses to its first 6 words plus terms (redundancy principle) and the reading timer follows the speech.

**Evidence**: modality effect (Ginns 2005; Berney & Bétrancourt g = 0.34 with commentary). **Risk**: speech quality varies by browser.

#### S16 · A `molecular` environment preset
**Behaviour**: a variant of `micro` with no directional sun, no motes and no exponential "underwater" fog. Instead: flat soft key and fill, a crowded background of instanced low-saturation shapes, and a timescale readout (e.g. `1 frame ≈ 10 ns`) when `spec.timescale` is given (Jantzen et al. 2024, principles 8 and 9).

#### S17 · Semantic depth of field
**Behaviour**: an optional focus blur outside the S2 mask, on close shots only.

**Risk**: it hides context that orientation needs. Only consider it after S2 has been evaluated.

---

## 7. Guidance for lesson authors (to put in the prompts)

Each rule comes from the analysis above.

1. **Start from the phenomenon or the problem**, not from the parts. "What happens without a suit"; "the chime you hear"; "a blocked artery". (All four sources.)
2. **Name the parts before the process.** The tour does this; each actor's `describe` gives its *job* in ≤ 10 words. (Pre-training; Quasar-Ed names the three trains first.)
3. **Order every explanation along the causal chain**, and give that order as `chain`. (Hegarty 1992; the power flow.)
4. **One scale per cause.** When the cause moves to a smaller scale, use `zoom` with `stations` named after the levels of organisation (organ, tissue, cell, molecule). (Hybrid.)
5. **Peel, cut or explode only to reveal the active part**, and then go back. (Jared's spacesuit; Quasar-Ed's "close everything up".)
6. **POV only for what a part *experiences*** (squeeze, impulse, timing). Never as the only view of the structure. Molecules move randomly, in crowds, and most collisions do nothing; say so. (Jantzen et al. 2024.)
7. **Put a worked number on every mechanism** that has one (a ratio, a period, a rate), with units. (Quasar-Ed.)
8. **Use one counterfactual per diorama at most**, and mark it as hypothetical. (Jared; Quasar-Ed.)
9. **Name what is left out.** "There are many parts; here are the three that matter." (Jared's PLSS.)
10. **Keep 3–6 lessons, each with ≤ 8 chain links**, and a self-check question per lesson. (Segmenting; generative activity.)

---

## 8. How to verify the whole package

1. **Screenshot QA** (an extension of `tools/smoke.mjs` with `SMOKE_OUT`). For every built-in model, run one lesson with each new field and save stills at:
   - every chain link;
   - every peel layer;
   - every zoom station;
   - the POV establishing shot and pull-out;
   - the explode hold.
   Check them against the measurable criteria under each spec: highlight count, badge order, luminance separation, overlap = 0, ring in the first frame, scale-bar label.
2. **Motion logs**: camera position, FOV, near/far and angular velocity at 60 Hz during every moving shot. Assert the limits: S4 log-linearity, S6 ≤ 60°/s and roll 0, near/far ≤ 10⁴.
3. **Performance**: frame time stays under 22 ms with S1+S2 masks and the S10 inset, on the software-rendered smoke run (allowing its usual slowdown factor) and on a GPU run.
4. **Regression**: existing smoke checks (memory leaks, WebGL context loss, console errors) after each feature. In particular, after material cloning in S3/S7, check that the card → real patch still compiles: the drawing look must still appear at t = 0 on a model that was peeled and then restored.
5. **Learning check (small, honest)**:
   - Use the self-check questions that every step already carries, and add 2 *transfer* questions per diorama (for example, "what would happen if the anchor had one pallet?").
   - Run a crossover with 6–10 learners: the same two dioramas, one with S1+S2+S5 on and one with them off, counterbalanced.
   - This cannot prove effect sizes, but it will reveal confusions. Ask learners to *explain* the mechanism aloud; count causal links named in the right order, Hegarty's measure.

---

## 9. Sources

All works below were checked against OpenAlex (title, year, authors, DOI) on 4 November 2026. Effect sizes come from abstracts read through Consensus.

### Explainer videos and studios
- Jared Owen, *How does a Spacesuit work? (NASA)*, YouTube: https://www.youtube.com/watch?v=VRpHuznm0j0 (transcript read in full)
- Jared Owen, *What's inside Big Ben? (Elizabeth Tower)*: https://www.youtube.com/watch?v=H3xgBS_kDNw (listed, not transcribed)
- Jared Owen channel: https://www.youtube.com/channel/UCbsfyGlrjrKQC0gbzK0-EiA · site: https://jaredowen3d.com/ · about: https://jaredowen3d.com/about
- BlenderNation, "Meet the Artist: Jared Owen" (2018): https://www.blendernation.com/2018/11/19/meet-the-artist-jared-owen/
- BlenderNation, "How Does a VCR Work" making-of (2022): https://www.blendernation.com/2022/08/26/how-does-a-vcr-work-explainer-video-made-with-blender/
- diginomica profile of Jared Owen (2024): https://diginomica.com/node/27336
- Quasar-Ed, *From Weights to Chimes: The Inner Workings of a Grandfather Clock* (2025): https://www.youtube.com/watch?v=rEa1HmCJ6Gg (transcript read in full; channel: http://www.youtube.com/@quasar-ed)
- Nucleus Medical Media, *Heart Attack Due to Atherosclerosis*: https://www.youtube.com/watch?v=wbShOXhO6p8 (transcript read in full)
- Nucleus Medical Media: https://www.nucleusmedicalmedia.com/ · workflow: https://www.nucleusmedicalmedia.com/medical-animation-illustration-production-workflow · accuracy review: https://www.nucleusmedicalmedia.com/medically-accurate-up-to-date-medical-visuals-review
- Hybrid Medical Animation: https://www.hybridmedicalanimation.com/ · Sickle Cells: https://www.hybridmedicalanimation.com/work/sickle-cell-disease-animation/ · Influenza & the Heart: https://www.hybridmedicalanimation.com/work/influenza-and-your-heart-animation/ · Clot removal: https://www.hybridmedicalanimation.com/work/clot-removal-thrombectomy-animation/ · capabilities blog: https://www.hybridmedicalanimation.com/category/blog-categories/capabilities/
- Eames Office, *Powers of Ten*: https://www.eamesoffice.com/the-work/powers-of-ten/ · Wikipedia: https://en.wikipedia.org/wiki/Powers_of_Ten_(film)
- XVIVO, scientific animation process: https://xvivo.com/about/scientific-animation-process/

### Learning from animation and multimedia
- Agrawala M, Phan D, Heiser J, et al. (2003). Designing effective step-by-step assembly instructions. *ACM TOG* 22(3). https://doi.org/10.1145/882262.882352
- Ainsworth S (2006). DeFT: a conceptual framework for considering learning with multiple representations. *Learning and Instruction* 16. https://doi.org/10.1016/j.learninstruc.2006.03.001
- Alpizar D, Adesope OO, Wong RM (2020). A meta-analysis of signaling principle in multimedia learning environments. *ETR&D*. (Found via Consensus, not resolved in OpenAlex; quoted only for d = 0.38.)
- Ayres P, Paas F (2007). Making instructional animations more effective: a cognitive load approach. *Applied Cognitive Psychology* 21. https://doi.org/10.1002/acp.1343
- Berney S, Bétrancourt M (2016). Does animation enhance learning? A meta-analysis. *Computers & Education* 101. https://doi.org/10.1016/j.compedu.2016.06.005
- Boucheix J-M, Lowe RK (2010). An eye tracking comparison of external pointing cues and internal continuous cues in learning with complex animations. *Learning and Instruction* 20. https://doi.org/10.1016/j.learninstruc.2009.02.015
- Boucheix J-M, Lowe RK, Putri DK, Groff J (2013). Cueing animations: dynamic signaling aids information extraction and comprehension. *Learning and Instruction* 25. https://doi.org/10.1016/j.learninstruc.2012.11.005
- de Koning BB, Tabbers HK, Rikers RMJP, Paas F (2009). Towards a framework for attention cueing in instructional animations. *Educational Psychology Review* 21. https://doi.org/10.1007/s10648-009-9098-7
- Fiorella L, van Gog T, Hoogerheide V, Mayer RE (2017). It's all a matter of perspective: viewing first-person video modeling examples promotes learning of an assembly task. *Journal of Educational Psychology* 109. https://doi.org/10.1037/edu0000161
- Ginns P (2005). Meta-analysis of the modality effect. *Learning and Instruction* 15. https://doi.org/10.1016/j.learninstruc.2005.07.001
- Ginns P (2006). Integrating information: a meta-analysis of the spatial contiguity and temporal contiguity effects. *Learning and Instruction* 16. https://doi.org/10.1016/j.learninstruc.2006.10.001
- Hegarty M (1992). Mental animation: inferring motion from static displays of mechanical systems. *JEP: LMC* 18. https://doi.org/10.1037/0278-7393.18.5.1084
- Hegarty M (2004). Dynamic visualizations and learning: getting to the difficult questions. *Learning and Instruction* 14. https://doi.org/10.1016/j.learninstruc.2004.06.007
- Hegarty M, Kriz S, Cate C (2003). The roles of mental animations and external animations in understanding mechanical systems. *Cognition and Instruction* 21. https://doi.org/10.1207/s1532690xci2104_1
- Heiser J, Tversky B (2006). Arrows in comprehending and producing mechanical diagrams. *Cognitive Science* 30. https://doi.org/10.1207/s15516709cog0000_70
- Höffler TN, Leutner D (2007). Instructional animation versus static pictures: a meta-analysis. *Learning and Instruction* 17. https://doi.org/10.1016/j.learninstruc.2007.09.013
- Höffler TN, Leutner D (2011; online 2010). The role of spatial ability in learning from instructional animations: evidence for an ability-as-compensator hypothesis. *Computers in Human Behavior* 27. https://doi.org/10.1016/j.chb.2010.07.042
- Jantzen SG, McGill G, Jenkinson J (2024). Design principles for molecular animation. *Frontiers in Bioinformatics* 4. https://doi.org/10.3389/fbinf.2024.1353807
- Jenkinson J, McGill G (2012). Visualizing protein interactions and dynamics: evolving a visual language for molecular animation. *CBE—Life Sciences Education* 11. https://doi.org/10.1187/cbe.11-08-0071
- Iwasa JH (2010). Animating the model figure. *Trends in Cell Biology* 20. https://doi.org/10.1016/j.tcb.2010.08.005
- Jones MG, Taylor AR (2009). Developing a sense of scale: looking backward. *JRST* 46. https://doi.org/10.1002/tea.20288
- Kalyuga S, Ayres P, Chandler P, Sweller J (2003). The expertise reversal effect. *Educational Psychologist* 38. https://doi.org/10.1207/s15326985ep3801_4
- Kriz S, Hegarty M (2007). Top-down and bottom-up influences on learning from animations. *IJHCS* 65. https://doi.org/10.1016/j.ijhcs.2007.06.005
- Leahy W, Sweller J (2011). Cognitive load theory, modality of presentation and the transient information effect. *Applied Cognitive Psychology* 25. https://doi.org/10.1002/acp.1787
- Lowe RK (2003). Animation and learning: selective processing of information in dynamic graphics. *Learning and Instruction* 13. https://doi.org/10.1016/s0959-4752(02)00018-x
- Lowe R, Boucheix J-M (2008). Learning from animated diagrams: how are mental models built? *Diagrams 2008, LNCS*. https://doi.org/10.1007/978-3-540-87730-1_25
- Lowe RK, Boucheix J-M (2011). Cueing complex animations: does direction of attention foster learning processes? *Learning and Instruction* 21. https://doi.org/10.1016/j.learninstruc.2011.02.002
- Makransky G, Terkildsen TS, Mayer RE (2019). Adding immersive virtual reality to a science lab simulation causes more presence but less learning. *Learning and Instruction* 60. https://doi.org/10.1016/j.learninstruc.2017.12.007
- Makransky G, Andreasen NK, Baceviciute S, Mayer RE (2020). Immersive virtual reality increases liking but not learning with a science simulation and generative learning strategies promote learning in immersive virtual reality. *Journal of Educational Psychology*. (Found via Consensus; supporting only.)
- Mayer RE, Chandler P (2001). When learning is just a click away. *Journal of Educational Psychology* 93. https://doi.org/10.1037/0022-0663.93.2.390
- Mayer RE, Fiorella L (2014). Principles for reducing extraneous processing in multimedia learning. *Cambridge Handbook of Multimedia Learning*. https://doi.org/10.1017/cbo9781139547369.015
- Mayer RE, Hegarty M, Mayer S, Campbell J (2005). When static media promote active learning: annotated illustrations versus narrated animations. *JEP: Applied* 11. https://doi.org/10.1037/1076-898x.11.4.256
- Mayer RE, Mathias A, Wetzell K (2002). Fostering understanding of multimedia messages through pre-training. *JEP: Applied* 8. https://doi.org/10.1037/1076-898x.8.3.147
- Mayer RE, Moreno R (2003). Nine ways to reduce cognitive load in multimedia learning. *Educational Psychologist* 38. https://doi.org/10.1207/s15326985ep3801_6
- Mayer RE, Pilegard C (2014). Principles for managing essential processing in multimedia learning: segmenting, pre-training, and modality principles. *Cambridge Handbook of Multimedia Learning*. https://doi.org/10.1017/cbo9781139547369.016
- McGill G (2008). Molecular movies… coming to a lecture near you. *Cell* 133. https://doi.org/10.1016/j.cell.2008.06.013
- Parong J, Mayer RE (2018). Learning science in immersive virtual reality. *Journal of Educational Psychology* 110. https://doi.org/10.1037/edu0000241
- Plass JL, Homer BD, Hayward EO (2009). Design factors for educationally effective animations and simulations. *J. Computing in Higher Education* 21. https://doi.org/10.1007/s12528-009-9011-x
- Ploetzner R, Berney S, Bétrancourt M (2020). A review of learning demands in instructional animations. *Journal of Computer Assisted Learning* 36. https://doi.org/10.1111/jcal.12476
- Rey GD, Beege M, Nebel S, Wirzberger M, Schmitt TH, Schneider S (2019). A meta-analysis of the segmenting effect. *Educational Psychology Review* 31. https://doi.org/10.1007/s10648-018-9456-4
- Richter J, Scheiter K, Eitel A (2016). Signaling text-picture relations in multimedia learning: a comprehensive meta-analysis. *Educational Research Review* 17. (Found via Consensus; quoted only for r = 0.17.)
- Scheiter K, Gerjets P, Huk T, Imhof B, Kammerer Y (2009). The effects of realism in learning with dynamic visualizations. *Learning and Instruction* 19. https://doi.org/10.1016/j.learninstruc.2008.08.001
- Schneider S, Beege M, Nebel S, Rey GD (2018). A meta-analysis of how signaling affects learning with media. *Educational Research Review* 23. https://doi.org/10.1016/j.edurev.2017.11.001
- Schnotz W, Lowe R (2008). A unified view of learning from animated and static graphics. In *Learning with Animation*, Cambridge UP. OpenAlex W2287675164 (book chapter, no DOI).
- Schwan S, Riempp R (2004). The cognitive benefits of interactive videos: learning to tie nautical knots. *Learning and Instruction* 14. https://doi.org/10.1016/j.learninstruc.2004.06.005
- Skulmowski A (2024). Are realistic details important for learning with visualizations or can depth cues provide sufficient guidance? *Cognitive Processing* 25. https://doi.org/10.1007/s10339-024-01183-3
- Spanjers IAE, van Gog T, van Merriënboer JJG (2010). A theoretical analysis of how segmentation of dynamic visualizations optimizes students' learning. *Educational Psychology Review* 22. https://doi.org/10.1007/s10648-010-9135-6
- Tversky B, Morrison JB, Bétrancourt M (2002). Animation: can it facilitate? *IJHCS* 57. https://doi.org/10.1006/ijhc.2002.1017
- Wong A, Leahy W, Marcus N, Sweller J (2012). Cognitive load theory, the transient information effect and e-learning. *Learning and Instruction* 22. https://doi.org/10.1016/j.learninstruc.2012.05.004
- Wouters P, Paas F, van Merriënboer JJG (2008). How to optimize learning from animated models: a review of guidelines based on cognitive load. *Review of Educational Research* 78. https://doi.org/10.3102/0034654308320320

### Spatial cognition, navigation, zooming and comfort
- Bederson BB, Boltman A (1999). Does animation help users build mental maps of spatial information? *IEEE InfoVis*. https://doi.org/10.1109/infvis.1999.801854
- Cockburn A, Karlson A, Bederson BB (2009). A review of overview+detail, zooming, and focus+context interfaces. *ACM Computing Surveys* 41. https://doi.org/10.1145/1456650.1456652
- Fernandes AS, Feiner SK (2016). Combating VR sickness through subtle dynamic field-of-view modification. *IEEE 3DUI*. https://doi.org/10.1109/3dui.2016.7460053
- Furnas GW, Bederson BB (1995). Space-scale diagrams: understanding multiscale interfaces. *CHI '95*. https://doi.org/10.1145/223904.223934
- Hornbæk K, Bederson BB, Plaisant C (2002). Navigation patterns and usability of zoomable user interfaces with and without an overview. *ACM TOCHI* 9. https://doi.org/10.1145/586081.586086
- Jul S, Furnas GW (1998). Critical zones in desert fog: aids to multiscale navigation. *UIST '98*. https://doi.org/10.1145/288392.288578
- Klatzky RL (1998). Allocentric and egocentric spatial representations: definitions, distinctions, and interconnections. *Spatial Cognition, LNCS 1404*. https://doi.org/10.1007/3-540-69342-4_1
- LaViola JJ (2000). A discussion of cybersickness in virtual environments. *ACM SIGCHI Bulletin* 32. https://doi.org/10.1145/333329.333344
- Mackinlay JD, Card SK, Robertson GG (1990). Rapid controlled movement through a virtual 3D workspace. *SIGGRAPH '90*. https://doi.org/10.1145/97879.97898
- Pausch R, Burnette T, Brockway D, Weiblen ME (1995). Navigation and locomotion in virtual worlds via flight into hand-held miniatures. *SIGGRAPH '95*. https://doi.org/10.1145/218380.218495
- Plumlee MD, Ware C (2006). Zooming versus multiple window interfaces: cognitive costs of visual comparisons. *ACM TOCHI* 13. https://doi.org/10.1145/1165734.1165736
- Stoakley R, Conway MJ, Pausch R (1995). Virtual reality on a WIM: interactive worlds in miniature. *CHI '95*. https://doi.org/10.1145/223904.223938
- van Wijk JJ, Nuij WAA (2003). Smooth and efficient zooming and panning. *IEEE InfoVis*. https://doi.org/10.1109/infvis.2003.1249004

### Illustrative rendering and camera control
- Bruckner S, Gröller ME (2006). Exploded views for volume data. *IEEE TVCG* 12. https://doi.org/10.1109/tvcg.2006.140
- Christie M, Olivier P, Normand J-M (2008). Camera control in computer graphics. *Computer Graphics Forum* 27. https://doi.org/10.1111/j.1467-8659.2008.01181.x
- Diepstraten J, Weiskopf D, Ertl T (2003). Interactive cutaway illustrations. *Computer Graphics Forum* 22. https://doi.org/10.1111/1467-8659.t01-3-00700
- Feiner SK, Seligmann DD (1992). Cutaways and ghosting: satisfying visibility constraints in dynamic 3D illustrations. *The Visual Computer* 8. https://doi.org/10.1007/bf01897116
- Kosara R, Miksch S, Hauser H (2001). Semantic depth of field. *IEEE InfoVis*. https://doi.org/10.1109/infvis.2001.963286
- Li W, Ritter L, Agrawala M, Curless B, Salesin D (2007). Interactive cutaway illustrations of complex 3D models. *ACM TOG (SIGGRAPH)* 26. https://doi.org/10.1145/1275808.1276416
- Li W, Agrawala M, Curless B, Salesin D (2008). Automated generation of interactive 3D exploded view diagrams. *ACM TOG (SIGGRAPH)* 27. https://doi.org/10.1145/1360612.1360700
- Viola I, Kanitsar A, Gröller ME (2005). Importance-driven feature enhancement in volume visualization. *IEEE TVCG* 11. https://doi.org/10.1109/tvcg.2005.62

### Checked and *not* cited
Two references were tried and not confirmed in OpenAlex, so they are left out:
- Jenkinson & McGill 2013, "Using 3D animation in biology education…";
- Schwartz & Bransford 1998, "A time for telling".
