# Presentation craft: what a high-end visualiser does, and what Scriptorium takes from it

Source studied: *The Secrets to High End Presentations in D5*, Show It Better (YouTube, 29 Sep 2026), English auto-captions, about 3,450 words, read in full. The video is about architectural renders. Below, each tip is paraphrased (not quoted), followed by a critical note on whether and how it applies to a teaching diorama. A teaching diorama is not architecture. Its "hero" is a *process*, and its viewer is trying to *understand*, not to be persuaded. So some tips transfer directly, some need translating, and one or two would be harmful if copied blindly.

## 1. Depth first, before adding more things

**The tips**
- Split every frame into foreground, middle ground and background.
- Foreground: something at the frame edges, so the world seems to continue past the frame.
- Middle ground: the hero, clearly visible and singled out by the key light.
- Background: loose silhouettes that only separate the planes.
- Atmosphere (fog or haze) between the middle and back planes, so the hero detaches from what is behind it.
- A shadow from an object that is *not in the frame* (a dense tree placed outside the camera) gives a dappled foreground without adding clutter.
- A person walking *toward* the hero leads the eye. People near the camera, or looking at the camera, steal the attention.
- Camera placement is often the real problem. Lower it a little, rotate it, shift it sideways, or let something overlap the frame edge.

**Check**: desaturate the image completely and look only at values (light against dark). If all planes sit at the same value, there is no depth, however nice the colours are.

**For Scriptorium**
- *Adopted*: the three-plane rule for every diorama:
  - foreground: the plinth edge, meadow tufts or a lab bench lip at the frame edge;
  - middle: the instruments and actors;
  - background: a painted, hazed backdrop.
- *Adopted*: the hero gets the key light.
  - In a lesson, the "hero" changes from step to step. So the key light should favour whatever the current beat is about: a gentle light accent on the focus object, or dimming of the others. We already dim the other labels; the light should follow too.
- *Adopted*: off-frame shadow casters (a "cookie"/gobo) are cheap and keep the frame clean.
- *Adapted*: the eye-leading "person".
  - In a diorama this is the **motion of the process itself**: rising water, a rolling ball, a drifting molecule. It also includes our guide arrows.
  - The lesson is the same: the thing that leads the eye must point *at* the subject, never at the camera.
  - A guide arrow that crosses the frame toward nothing is the arrow equivalent of the person looking at the lens.
- *Adopted as a test*: the value check is automated in our screenshot QA. Each beat still is converted to luminance, and we measure the separation between the focus object's region and its surroundings. A flat histogram is a failed shot.

## 2. Mix formats, each explaining something different

**The tips**
- A project shown as thirty renders looks like a folder of images.
- Mix formats instead:
  - a render for atmosphere;
  - a plan for organisation;
  - an axonometric for how the parts come together;
  - a maquette view for massing;
  - a section for the inside.
- Variety is not the goal; each format must explain something the others cannot.

**For Scriptorium**: this is exactly the user's complaint about three identical sketches. Our formats, and the single job of each:

| Format | Its job | Where |
|---|---|---|
| Live diorama (3D) | how it behaves, cause and effect in time | pedestal → diorama |
| Overview drawing (card model) | what the parts are, at a glance | first appearance in a scroll |
| Stage plate (numbered close drawing) | which parts *this* step is about, in this step's state | repeated appearances |
| Cutaway/section | what happens inside (inside a flask, a cell, a reactor) | when a step is about an interior |
| Plot | how one quantity depends on another | `plot` demos |
| Real figure from the PDF | what the author actually showed | inline, with page reference |
| Pedestal maquette | the whole set-up, as an object in the room | book room |

A scroll that repeats the same format for the same purpose is a defect.

## 3. Consistent, cinematic colour

**The tips**
- Work in a wide colour space (ACES) so colours aren't crushed.
- Lower the contrast and exposure a little, so the image keeps information at both ends.
- Warm highlights against cool shadows and fog, a split common in film and photography; a warmer sky pulls the whole palette.
- A LUT never at full strength; fit it to the image, not the image to it.
- Above all, every image of one project shares one grade, so the set has a language.

**For Scriptorium**
- We use AgX tone mapping, a wide-gamut-friendly curve from the same family of ideas.
- *Adopted*:
  - **one look per book** (per room), carried into every diorama, plate and pedestal of that book;
  - a split-tone grade (cool shadows, warm highlights) at low strength;
  - no crushed blacks.
- *Caution*: a teaching image must keep colour *meaning* (the blue water, the red thermometer, the coloured stage markers). A grade must never shift those enough to confuse a legend. The grade is applied before the UI and markers, never to them.

## 4. Presentation as a conversation (live variants)

**The tips**: clients always ask "in another material? at night? closer?". So prepare variables with states (materials, time of day, camera variations), bound to clickable triggers in the scene, and switch them live.

**For Scriptorium**
- This is the diorama's *Variables* panel and the lessons' `set`, and it is our strongest feature.
- *Adopted*:
  - **in-scene triggers**: clicking an instrument offers its own states (for example "seal at 990 hPa", "cool to 2 °C") right there, not only in a side panel;
  - **camera variations** as named shots that the learner can jump between: overview, close-up of the spout, POV.

## 5. Movement that explains

**The tips**
- Every camera move must reveal something new.
- Most shots in great architectural film don't move the camera at all; life comes from things in the scene (wind, people, light).
- When the camera does move, it moves slowly, long enough to feel intentional, and cuts before it drags: about 3–4 s.
- Eye-level, no wild angles. Close-ups use a *narrow field of view* and crop away everything else.
- Alternate the rhythm (static wide, slow move, close-up, repeat) so the eye never tires.

**For Scriptorium**: this is a direct critique of our continuous orbit drift during beats, which the user called "AI slop camera floating". The director now follows a shot grammar:
- **Wide (static)**: establishes the set-up at the start of a step. No drift.
- **Push (3–4 s, then hold)**: from wide toward the subject when the instruction names it. It stops and holds; it doesn't keep floating.
- **Close-up (narrow FOV ≈ 20–28°, static)**: for an event on a small part (a meniscus, a crystal, a bond). It cuts in (a short dip through the grade), it doesn't fly in.
- **POV**: the learner's eye on an actor (riding the ball, sitting in the bubble, travelling with the molecule), when the step is about what that actor experiences.
- **Rhythm**: never two moving shots in a row. Wide → close → push → close …
- Life comes from the process (water rising, rain, crystals), not from the camera.

*Caution*: the video's advice to keep shots short is for a passive film. A learner must *read* while watching. So our holds are as long as the reading time, and the process is slowed (time dilation), not the shot shortened.

## 6. A pre-flight checklist (run before calling any scene finished)

1. Three planes visible: foreground at an edge, a lit hero in the middle, a hazed background.
2. The desaturated value check passes: the hero separates from what is around it.
3. Nothing leads the eye away from the subject: no arrow to nowhere, no label across the hero, no bright object at the frame edge.
4. One grade for the whole book; legend colours unchanged.
5. Each format used once for its own job; no repeats.
6. Camera: no floating; moves of 3–4 s that end in a hold; cuts for close-ups; no two moving shots in a row.
7. Stills from every beat and the frame sequence of every camera move checked for clutter, overlap, jerks and abrupt stops.
