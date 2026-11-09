# Baroque monastery libraries: design note for the hub and book rooms

This note records what the `style: 'baroque'` room shell (`js/gfx/roomshell.js`, `js/gfx/baroque.js`) and the
baroque furniture (`js/hub/props.js`) take from four 18th-century halls, and why. Everything in the app is drawn
in code: canvas textures and procedural geometry. No photograph, painting or statue is copied; the halls give
proportions, rhythm, palette and the logic of the parts.

## The halls

### Klosterbibliothek Metten (Bavaria, 1722–1726)
- A 17th-century two-aisled hall remodelled under Abbot Roman II Märkl. It is split into a main room and two side
  rooms in the proportion 2 : 3 : 2.
- Franz Josef Holzinger's stucco includes **pairs of atlantes (male figures) that carry the vaults** in the main hall,
  with pairs of angels in the side rooms. Innozenz Anton Warathy painted **fourteen ceiling frescoes**, and each one
  relates to the books shelved beneath it.
- Allegories of Faith and Science flank the entrance portal.
- **What we took:**
  - optional *atlas piers*, abstract muscular figures built from capsules and lathe shapes. They stand on rose
    scagliola pedestals and hold up the entablature on either side of the central window and of the door;
  - one fresco panel per bay, so each ceiling panel "belongs" to the shelves beneath it;
  - a pale checkered stone floor.
- Sources: [Kloster Metten (de.wikipedia)](https://de.wikipedia.org/wiki/Kloster_Metten);
  [Atlas Obscura, Baroque Library of Metten Abbey](https://assets.atlasobscura.com/places/baroque-library-metten-abbey).

### Stiftsbibliothek Admont (Styria, completed 1776)
- Architect Joseph Hueber. The hall is **70 m long, 14 m wide and 11 m high (12.7 m under the central dome)**, and
  it runs through two storeys. Its plan has three parts: an oval central dome and three bays in each wing hall.
- **Seven ceiling frescoes in shallow domes and vaults** by Bartolomeo Altomonte show the path of knowledge up to
  divine Wisdom in the centre.
- **48 windows on two storeys** (60 counting the 12 hidden behind the rounded corner cabinets) were meant to flood
  the room with Enlightenment light.
- The bookcases are **white with sparse gold**, a break from the brown libraries before them.
- The floor uses **over 7,000 diamond-shaped stones of white, red and grey marble**, which read as cubes and zigzags.
- The wing halls have **a gallery on consoles**, reached by **spiral stairs hidden behind paired cabinets**. Some
  doors are disguised as book spines.
- **What we took:**
  - a white-and-gold palette;
  - a long hall divided into bays, each with a **shallow painted dome**; long rooms get several domes, square
    rooms get one;
  - tall arched windows that dominate the window wall;
  - floor options `diagonal` (diamond checker) and `cubes` (the tumbling-block illusion in white/rose/grey);
  - a gallery on consoles with a corner spiral stair when the room is tall enough;
  - white bookcases with gilded cornices.
- Sources: [Stift Admont, Architecture](https://stiftadmont.at/en/architektur/);
  [Stift Admont, About the abbey library](https://stiftadmont.at/en/about-the-abbey-library/);
  [Admont Abbey (en.wikipedia)](https://en.wikipedia.org/wiki/Admont_Abbey).

### Biblioteca do Palácio-Convento de Mafra (Portugal)
- Designed by Manuel Caetano de Sousa. It is a long, cross-shaped hall: about **88–90 m of marble floor, roughly
  9.5 m wide**.
- It holds about 36,000 volumes on **rococo bookcases in pale wood on two levels with a wooden balcony**. Gilding
  was planned and never applied, so the room's elegance comes from proportion and light rather than ornament.
- Bats living in the hall still keep the insects down.
- **What we took:**
  - long-hall proportions, so the shell must look right when w is about 2.5 × d;
  - two levels of shelving: a built-in upper tier of books behind the gallery balustrade;
  - a wooden gallery deck;
  - the proof that a pale, almost unornamented bookcase is enough. The carcass is cream; the gold is kept to
    cornices, crest and capitals.
- Sources: [Salt of Portugal, The resplendent tranquility of the Mafra library](https://saltofportugal.com/2019/04/01/the-resplendent-tranquility-of-the-mafra-library/);
  [PlanetWare, Palácio Nacional de Mafra](https://planetware.com/mafra/palacio-nacional-de-mafra-p-lisb-pnm.htm);
  [A Portuguese Affair, Mafra National Palace](https://www.aportugueseaffair.com/mafra-national-palace).

### Klosterbibliothek Wiblingen (Ulm, 1740s, completed 1744)
- Designed by Christian Wiedemann, rococo.
- The **fresco by Franz Martin Kuen** has a central female figure of divine Wisdom among angels.
- The scagliola columns are **"candyfloss pink and teal"** with gilt capitals, and they carry **a gallery whose
  balustrade swings in and out**.
- **Eight painted wooden statues that look like porcelain**, by Dominikus Hermenegild Herberger, stand for Faith,
  History, Jurisprudence, Natural Science, Mathematics, Obedience, Prayer and Renunciation of the World.
- **What we took:**
  - the rose/teal scagliola pairing: the hub uses rose shafts and the book rooms use teal (`palette`);
  - the **serpentine gallery front**, which bows out between piers;
  - white allegorical figures on marble pedestals: the `statue()` prop is abstract, a draped column of lathe and
    capsule forms with a symbolic attribute (book, globe, compass ring, tablet or flame). It is not a copy of any
    figure.
- Sources: [Wiblingen Abbey (en.wikipedia)](https://en.wikipedia.org/wiki/Wiblingen_Abbey);
  [Kloster Wiblingen press release, 19 April 2022](https://www.kloster-wiblingen.de/presse/pressemeldungen/pressemeldungen-detailansicht/5549);
  [Third Eye Traveller, Wiblingen Abbey Library](https://thirdeyetraveller.com/wiblingen-abbey-library-germany/);
  [Inside/Inside, Wiblingen monastery library](https://insideinside.org/project/wiblingen-monastery-library/).

## Design and practicality: why these halls work
1. **Shelves on the walls, centre kept free.**
   - From the late 16th century, shelving moved from free-standing desks in the middle of the room to the walls.
   - Windows went above or between the shelves, and the open centre held reading tables, globes and statues.
   - Source: A. Serrai, ["Vasi o Saloni librari"](https://bibliothecae.unibo.it/article/view/5701), *Bibliothecae.it* 2 (2013).
   - In the app: bookcases snap to walls, and the centre axis holds the desk, the armchair and the statues.
2. **The bay rhythm (travée).**
   - A pilaster or column, then a bookcase bay, then a pilaster. The rhythm organises thousands of volumes into
     readable units, each with its own subject and often its own fresco above.
   - The shell spaces pilasters evenly at a target pitch of about 3.2 m (≈ one horizontal bookcase). A book room
     can pass the positions of its stations, and the pilasters then fall *between* the scrolls.
3. **Why the shelves are recessed.**
   - Cases set into the wall plane, between projecting pilasters, keep the floor clear.
   - The pilasters frame each bay and protect the book edges from passers-by.
   - Shadowed niches also keep direct sun off the spines.
   - A real recess would fight the user's freely placed bookcases, so the shell keeps the pilaster *shafts* in the
     3 cm gap that the hub's snapping leaves behind a bookcase. Only capitals, cornice and atlantes project, and
     they sit above bookcase height. The bookcases themselves carry fluted pilasters and a deep cornice, so each
     one reads as a recessed bay.
4. **Gallery access.**
   - Admont and Mafra double the shelf area with a gallery: a narrow deck on consoles, a balustrade at about 1 m,
     and spiral stairs hidden in corners.
   - The shell adds a gallery automatically when the room is tall enough, h ≥ 7 m by default (`gallery: 'auto'`).
     The gallery skips the window wall, so the windows stay full height.
5. **Light from tall windows.**
   - Daylight was the only safe light in a library: candles were forbidden near books.
   - The halls use tall, round-headed windows and white or cream surfaces to multiply the daylight.
   - The shell puts arched windows in the bays of the window wall. A warm low sun casts the window shapes onto the
     floor through shadow-casting walls, with soft additive light shafts.
   - The sconces and chandeliers are a modern concession, kept dim and warm.
6. **Proportions.**
   - Admont is about 5 : 1 : 0.8 (L : W : H) and Mafra about 9 : 1 : 1. A narrow, tall, long hall gives the
     processional view.
   - The upper third of the height belongs to cornice, cove and vault, so the frescoes read as sky above a solid
     order.
   - The shell sets the cornice at about 70–80 % of h, and a coved vault rises to the painted domes.

## What the shell builds (summary)
- **Order.**
  - A colossal order of flat pilasters with scagliola shafts: rose or teal, veined, clearcoated.
  - Gilt bases and Corinthian-like capitals (abacus, acanthus bell, volutes).
  - A marble dado and a stucco entablature (architrave, gilt-banded frieze, projecting cornice).
- **Ceiling.**
  - A coved vault with gilt ribs continuing each pilaster.
  - A cream stucco ceiling with one shallow painted dome per bay group.
  - The domes carry a procedural sky: clouds, a warm centre and soft robed shapes on cloud banks, inside a painted
    balustrade.
- **Floor.** Polished checkered marble (`checker`, `diagonal`, `cubes`): MeshPhysicalMaterial with a low-roughness
  clearcoat, reflecting the environment.
- **Window wall.** Arched windows in the bays, a sky beyond, glazing bars, warm sun shafts and window-shaped sun
  patches on the floor.
- **Door.** A double door in the front wall with a gilt-edged frame and an overdoor cartouche.
- **Lights.** Gilt candle sconces on the pilasters (emissive flames and glow sprites, with very few real lights)
  and one to three chandeliers.
- **Optional parts.** Atlas piers, a serpentine gallery with an upper book tier, and a spiral stair.

## Second pass: the book-lined walls (what a review found missing)
A review of the first pass found that the defining feature of all three reference halls was absent: **walls lined
floor to ceiling with carved bookcases packed with leather spines, with a gallery tier above.** The shell had plaster
walls with pilasters and a few low free-standing cases. The second pass adds the following.

- **Built-in wall bookcases** (`makeBaroqueShell({ cases })`, built by `buildWallCases` in `js/gfx/baroque.js`).
  - Three finishes after the references:
    - `white`: ivory painted wood with the grain faintly showing, gilt beads, egg-and-dart frieze, fluted case
      pilasters (Admont). Used in the hub.
    - `walnut`: figured walnut with gilt trim and scagliola panels in the case pilasters (Metten). Used in the book
      rooms.
    - `pale`: pale rococo oak, carved but ungilded (Mafra).
  - **Lower tier.** A closed cupboard for folios (fielded doors), a ledge, then open shelves at about 0.36 m pitch up
    to the capitals.
    - Where there is a gallery, the cases run up to the deck, which rests on them (as at Admont and Mafra).
    - On the window wall they stop under the sills.
  - **Piers.** Each pier of the bay rhythm becomes a full-depth case pilaster that carries the cornice ressaut, so the
    order continues out of the woodwork.
  - **Gallery tier.** Shallower cases (0.3 m) between the shell's pilasters, behind the balustrade.
  - **Books.** Every volume is one instance of a single `InstancedMesh`: one draw call for about 6–7k books in the
    18 × 12 × 7 m hall.
    - Each instance varies its width, height, depth, brightness and binding.
    - The bindings are 8 variants in a canvas spine atlas (calf, morocco, cloth, vellum) with raised bands, gilt
      fillets and lettering pieces; a 4-line shader patch shifts u per instance.
    - Books come in sets of the same binding and height, with the occasional folio, gap and leaning volume.
- **The user's bookcases stay practical.**
  - They still snap flush to the wall.
  - The wall cases are split into ~1 m sections, and any section a user bookcase stands in front of is left out.
    `shell.userData.setCases({ skip })` rebuilds only the case layer (≈ 0.1 s, on drop, not during a drag).
  - Free placement in the middle of the room is unaffected.
  - A user bookcase holds scrolls and nothing else. (An earlier version packed leather-bound books around the
    scrolls, `fillBookcase`; it was removed when the bookcases became scroll cases, because the books competed with
    the scrolls' name tags and hid which places were free.) Now every slot of every tier carries a pair of velvet
    cradles (`scrollRests` / `setRestTiers` in js/hub/props.js, one instanced draw call per bookcase), and the tiers
    are backed with sage silk damask, so an almost empty subject still reads as a finished display case that is
    ready for scrolls. The scrolls stay the only interactive objects, with ivory name tags.
  - Slots are 0.17 m apart and centred between the stiles (17 per tier on a 3.2 m case, 5 on a 1.15 m one). A
    hanging scroll reserves the 3 slots its roll spans on its tier (`hangSlots`).
  - New scrolls go to the eye-level tiers first (scroll centres nearest 1.35 m). The example books of a new library
    are spread evenly along the eye-level tier of their bookcase instead of all starting at the left end.
- **Book rooms.**
  - Each hanging scroll stands in an open niche of its bay. The niche has walnut panelling behind it, gilt jamb
    beads, and a shelf of books bridging over it when the room is tall enough.
  - Unused bays are full bookcases. The camera opens facing the first scrolls and their pedestals.
- **A working reading floor in the hub.** A carpet runner on the axis, two refectory reading tables with lecterns and
  benches, and a terrestrial and a celestial globe. Shelving on the walls and furniture in the middle is the pattern
  Serrai describes for the hall library (see *Shelves on the walls, centre kept free* above).
- **Figures.**
  - Heads are carved from a displaced sphere: brow, eye sockets with eyeballs, nose and alae, lips, chin, ears.
  - Hair is waved and gathered into a knot for the allegories; the atlantes get curled hair and a beard.
  - The cavities are darkened by baked vertex colour, so the features read even under flat light.
  - The atlantes also wear a mantle knotted on the shoulder.
- **Budget**, measured in headless Chromium with SwiftShader:
  - Hub at 18 × 12 × 7: 108 draw calls and 243k triangles in the main pass, or 195 calls and 333k triangles counting
    the sun's shadow pass. Small gilt, balusters, books and tiny parts do not cast.
  - Book room at 12 × 10 × 5.5: 111 calls and 114k triangles.
  - Above 9k volumes the books drop their cover faces.
