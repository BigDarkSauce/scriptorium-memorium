# User guide

## The library

- **Move:** drag to look around, WASD or the arrow keys to walk.
- **Arrange library:** add horizontal (wide, 3-tier) or vertical (tall, 6-tier) bookcases.
  - Click one to select it, then drag it along the floor; it snaps flush to the nearest wall.
  - Rotate it by 90° or 15°, rename it by subject, switch its shape, or remove it.
  - The **Room size** sliders change the room's width, depth and height.
- **+ Add PDF scroll:** pick one or more PDFs. Each becomes a folded scroll with its name tag. It goes on the selected bookcase, otherwise the first one with space.
- **Open a scroll:** click it. It lifts out, unrolls in light, and carries you into its room.

## A book room

- Parts are found automatically and hang from the **left wall** onward, then around the room.
- **Click a hanging scroll** to read it.
  - **Analyse this part** writes the logical chain. Choose *Complete* or *Essential* (the length comes from the content) or an *Exact number of steps*.
  - Without Claude, use **Paste JSON from another AI**.
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
3. **Explore.** A panel slides in on the left:
   - **Instructions** appear one at a time. Press *Play this step*: it sets the variables, focuses the camera, and runs until the step's event or time is reached. The next step then appears; finished steps stay readable, with an explanation.
   - **Variables** are sliders for every parameter.
   - **Objects** lists everything in the scene.
4. **Edit.** Press the pencil, or E, then click any object:
   - **Move / Rotate / Scale**, with the G, R and S keys;
   - **Hide** (H), **Remove** (Del), or **Replace…** with another shape and material;
   - **Ask AI to change…** in plain words. *+ Add object* places a new body, and the *Ask AI…* button with nothing selected changes the whole diorama.
5. The top-right buttons replay the drawing-to-real transition, restart the simulation, or leave.

## Import / export

- **Prompt pack:** copy or download every prompt to use with any AI.
- **Export this room / whole library** as JSON. **Import JSON** accepts a library, a room, or a single scene.
