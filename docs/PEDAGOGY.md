# How Scriptorium teaches, and how it stays correct

Scriptorium aims at understanding, not just coverage. A learner should be able to rebuild each idea, picture it, use it, and know when it fails. Every chain step and every diorama is built to that standard, and every factual claim can be traced to a source that really exists.

## 1. The shape of one step

| Field | What it does | Why (evidence) |
|---|---|---|
| `from` + strict order | Nothing is used before it is defined. Arrows in the margin show the dependencies. | Order matches how experts build knowledge, and it keeps the reader's load manageable (Sweller 1988). |
| `terms` | Every new symbol or word comes with its meaning and units. | Undefined symbols are the most common reason a derivation "doesn't stick". |
| `derivation` | One move per line, each with its reason. | Studying worked examples with a reason for each step beats unguided problem solving for novices (Sweller 1988). Writing the "why" invites self-explanation (Chi et al. 1994). |
| `intuition` | A plain-language picture with no new symbols. | Pairing words with images (dual coding) improves recall and transfer (Paivio 1991; Mayer 2002). |
| `bodies` + showcase | The idea attached to concrete objects and events: a 2D diagram or a 3D diorama you can change. | Same reason. The diorama's lessons make the learner predict, act and watch, not only read. |
| `misconception` | The commonest wrong belief and why it fails. | Understanding often requires replacing an intuitive model, not adding to it. That starts when the old model is shown to fail (Posner et al. 1982). |
| `check` | A question that needs understanding (predict, compare, explain), with its answer hidden. | Retrieval practice is one of the two techniques rated "high utility" in the largest review of study methods (Dunlosky et al. 2013). Testing beats re-reading for long-term retention (Roediger & Karpicke 2006). |
| `basis` + `sources` | Says where each claim comes from: the part's own text, standard knowledge, derived above, or a measured fact. Measured facts need a source. | Lets the reader judge how far to trust a claim, and keeps the AI honest. |

## 2. Grounding: the literature as a co-author

Inside claude.ai the page uses the viewer's own research connectors (the artifact `mcp` capability):

- **OpenAlex**: an open index of about 250 million scholarly works in every field, with CC0 metadata and DOIs. It is used for search and for **verifying citations** (`resolve_references`).
- **Consensus**: semantic search over peer-reviewed papers for plain-language research questions, used for empirical claims and measured values.
- **PubMed**: biomedical and life-science literature.

**While writing** a chain, a diorama or a sub-scroll, Claude gets these as tools (`search_literature`, `search_evidence`, `search_biomedical`). The prompt's GROUNDING rules tell it to:
- look up the central laws, definitions and every number it will state or plot;
- copy titles and DOIs exactly from what it found;
- never invent a DOI;
- give a range when sources disagree.

**After writing**, every cited reference is checked against OpenAlex and marked:
- ✓ found;
- ? partial match;
- ✗ not found: the reference may be garbled or invented.

The reader can also press **Find sources** on any step to search OpenAlex and cite a work by hand.

**Without connectors** (outside claude.ai, or with another AI), the same prompts still ask for sources. They show as *unchecked* until verified.

**Corrections over fidelity.** When a book and the established literature disagree, the chain follows the literature, keeps the step, and says what differs in `sourceNote`. Two corrections made while grounding the example library:
- *Water cycle:* "warm air holds more water" was replaced by the saturation vapour pressure of water, $e_s(T)$, which rises about 7 % per kelvin. Saturation is a property of water at a given temperature, not of the air (Koutsoyiannis 2012).
- *Osmosis:* "water diffuses down its own concentration gradient" was replaced by flow driven by the water's chemical potential, mostly as bulk flow through pores (Kramer & Myers 2013; Kedem & Katchalsky 1958). The diorama's lesson text now says that its particle picture shows the direction of flow, not the molecular mechanism.

## 3. Dioramas

A diorama is the same idea made physical:
- **actors**: the bodies the idea is about, introduced one by one in the tour;
- **decor**: gives place and scale, and reacts to the simulation;
- **events**: fire at the meaningful moments;
- **lessons**: each changes one variable and says what to watch;
- **sources**: a `sources` list for the governing law and realistic parameter values, shown in the panel's *Sources* tab.

## 4. References (all checked against OpenAlex)

- Chi M T H, De Leeuw N, Chiu M-H, LaVancher C (1994). Eliciting self-explanations improves understanding. *Cognitive Science*. https://doi.org/10.1207/s15516709cog1803_3
- Dunlosky J, Rawson K A, Marsh E J, Nathan M J, Willingham D T (2013). Improving students' learning with effective learning techniques. *Psychological Science in the Public Interest*. https://doi.org/10.1177/1529100612453266
- Kedem O, Katchalsky A (1958). Thermodynamic analysis of the permeability of biological membranes to non-electrolytes. *Biochimica et Biophysica Acta*. https://doi.org/10.1016/0006-3002(58)90330-5
- Koutsoyiannis D (2012). Clausius–Clapeyron equation and saturation vapour pressure: simple theory reconciled with practice. *European Journal of Physics*. https://doi.org/10.1088/0143-0807/33/2/295
- Kramer E M, Myers D R (2013). Osmosis is not driven by water dilution. *Trends in Plant Science*. https://doi.org/10.1016/j.tplants.2012.12.001
- Mayer R E (2002). Multimedia learning. *Psychology of Learning and Motivation* 41. https://doi.org/10.1016/s0079-7421(02)80005-6
- Paivio A (1991). Dual coding theory: Retrospect and current status. *Canadian Journal of Psychology*. https://doi.org/10.1037/h0084295
- Posner G J, Strike K A, Hewson P W, Gertzog W A (1982). Accommodation of a scientific conception: Toward a theory of conceptual change. *Science Education*. https://doi.org/10.1002/sce.3730660207
- Roediger H L, Karpicke J D (2006). Test-enhanced learning. *Psychological Science*. https://doi.org/10.1111/j.1467-9280.2006.01693.x
- Sweller J (1988). Cognitive load during problem solving: Effects on learning. *Cognitive Science*. https://doi.org/10.1016/0364-0213(88)90023-7

The example library's subject references (Trenberth et al. 2007; Oki & Kanae 2006; Jasechko et al. 2013; Roe 2005; Galton 1889; Le Cam 1986; Smith 1962; Gode & Sunder 1993; van 't Hoff 1887; Preston et al. 1992; Nelson & Olsson 1986; Shinbrot et al. 1992; Goldstein 1975; CODATA 2018; Lighthill 1958; Hewitt & Hewitt 1979; Arrhenius 1889; Laidler 1984; Williams 2025) are listed with DOIs in `js/seeds-sources.js`.
