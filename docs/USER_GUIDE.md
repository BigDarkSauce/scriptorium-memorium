# User guide

## The library

- **Move:** the box at the bottom right switches between two ways of moving. Its **Speed** slider (0.3–4 m/s) sets how fast you move in both, and is remembered.
  - **Overview:** drag to orbit, use the wheel to zoom, and press WASD or the arrow keys to glide.
  - **Walk (first person):** you see the room at the height of a person's eyes (1.62 m).
    - Drag to turn your head and press WASD to walk. Hold Shift to hurry.
    - The wheel, or holding the right mouse button, narrows your view to look closely.
    - You can't walk through walls or furniture. Press **V** to switch modes.
  - The same controls work in every book room.
- **Arrange library:** add horizontal (wide, 3-tier) or vertical (tall, 6-tier) bookcases.
  - Click one to select it, then drag it along the floor; it snaps flush to the nearest wall.
  - Rotate it by 90° or 15°, rename it by subject, switch its shape, or remove it.
  - The **Room size** sliders change the room's width, depth and height.
- **+ Add PDF scroll:** pick one or more PDFs. Each becomes a folded scroll with its name tag. It goes on the selected bookcase, otherwise the first one with space.
- **Open a scroll:** click it. It lifts out, unrolls in light, and carries you into its room.
- **Graphics: Low · Medium · High (auto):** the chip button under the speaker (top right) opens the graphics setting.
  - The app picks a level for your device at the start, marked *(auto)*, and lowers it by itself if frames stay slow (a step-down shows up here, again marked *(auto)*).
  - Tap a level to keep it; your choice is remembered. **Auto** goes back to the automatic choice.
  - *Low* turns off the surface relief, the haze and sun shafts, and uses one sun shadow; *High* adds deeper relief, self-shadowed rock and soil, and three shadow ranges. Shadow detail changes the next time a diorama opens.

## A book room

- Parts are found automatically and hang from the **left wall** onward, then around the room.
- **Click a hanging scroll** to read it.
  - **Analyse this part** writes the logical chain. Choose *Complete* or *Essential* (the length comes from the content) or an *Exact number of steps*.
  - Without Claude, use **Paste JSON from another AI**. Before pasting, `node tools/verify-chain.mjs answer.json` checks the answer on your computer and lists anything missing.
- **Where each demo's data comes from** is written under it: *From the PDF* with the table or page it comes from, *Data added from outside the PDF* with its source, or *Our drawing* when the demo shows no data of its own. The PDF's own figures appear in the step that explains them, captioned *From the PDF, p. N*.
- **Each step** shows its terms with units, a plain picture (*Picture it*), the commonest mistake, a *Check yourself* question with a hidden answer, and where the claim comes from.
- **Sources.** Inside claude.ai, Claude searches OpenAlex, Consensus and PubMed while it writes, if you have those connectors. The bar above the chain counts the sources:
  - **Verify against OpenAlex** checks each one: ✓ found, ? partial match, ✗ not found (treat these with suspicion).
  - **Find sources** under a step searches OpenAlex so you can cite a work yourself.
  - Inside a diorama, the *Sources* tab lists what it is built on.
- **More detail → sub-scroll** writes a deeper chain for one step and hangs it beside the parent.
- **Pedestals** carry the card model of the part's diorama. Click one: it unfolds and you enter the diorama. To choose which diorama a pedestal shows, use the *Pedestal* button on any drawing in the scroll.
- **Room** opens the size sliders and the list of scrolls. The room also grows by itself when new scrolls need space.

## A diorama

1. **The drawing.** You see the scene as a drawing, either on the scroll or full screen. Press **Transition** (or scroll down) to materialise it while the camera dives in.
2. **The tour.** Scroll, press ↓ or press › to visit each significant body in turn. Its name appears beside it and stays there. Decor isn't toured, but it reacts to the simulation (trees sway with wind, windows glow at night…).
3. **Explore.** A panel slides in on the left (described below). While a step plays, the **cinematic** presentation takes over:
   - Each moment gets one camera shot that suits it, and then the camera holds still: the **wide** view of the whole model; a slow **push** in towards the object an instruction is about; a still **medium** view framing the subject and the objects an explanation names; a **close** cut to a small part where an event happens; or a **point of view** riding along with an actor, when a step asks for it. Two moving shots never follow each other.
   - Each explanation appears beside the thing it describes, joined to it by a line.
   - Explanations come one at a time, and each stays as long as it takes to read. A thin bar shows the time left.
   - While you read an event, simulated time slows to about a third (more while notes are waiting), so you can still see the process the text describes.
   - When a step ends, its *Why* explanation appears next to the object.
   - Grab the camera at any time; the director gives it back to you for a few seconds.
   - The bar at the bottom left switches **Cinematic** on or off and sets the **reading pace** (slow, normal, fast).
   - **Guides** (optional) adds animated arrows that show which way the subject is moving, and links to the other objects the explanation names.
   - Read first, then watch: when a step starts, the model waits while you read its instruction (hover over a note to keep it; › skips it), then the step plays. Each note shows the step's **question**, and the explanation ends with the question it opens next.
   - During a step the instruction panel folds away and the readouts shrink to the quantities the step mentions; both come back when the step ends. *All readouts ▾* shows every value.
   - **Point of view**: press **P** (or ◉ next to an object in *Objects*) to see from inside any object — ride the pendulum bob, travel with a gas molecule, sit inside a flask. Drag to look around, ‹ › switch object, **Esc** leaves. Some steps take you there by themselves.
   - **Sound**: the speaker button (top right) switches sound on or off. Each place has its own background (library hall, reading room, workshop, meadow with live rain and wind, sea, space, the micro world), and events, clicks, scrolls, bookcases and footsteps have their own sounds.

   The panel itself has three parts:
   - **Instructions** appear one at a time. Press *Play this step*: it sets the variables, focuses the camera, and runs until the step's event or time is reached. The next step then appears; finished steps stay readable, with an explanation.
   - **Variables** are sliders for every parameter.
   - **Objects** lists everything in the scene.
4. **Edit.** Press the pencil, or E, then click any object. **Ctrl+Z** undoes the last change (a move, rotation or scale, a hide or removal, a replacement, an added object, or a change made by AI):
   - **Move / Rotate / Scale**, with the G, R and S keys;
   - **Hide** (H), **Remove** (Del), or **Replace…** with another shape and material;
   - **Ask AI to change…** in plain words. *+ Add object* places a new body, and the *Ask AI…* button with nothing selected changes the whole diorama.
5. The top-right buttons replay the drawing-to-real transition, restart the simulation, or leave.

## Import / export

- **Prompt pack:** copy or download every prompt to use with any AI.
- **Export this room / whole library** as JSON. **Import JSON** accepts a library, a room, or a single scene.
