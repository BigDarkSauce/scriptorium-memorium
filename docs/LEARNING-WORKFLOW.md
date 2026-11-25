# Learning workflow: scan, discover, remember, transfer

Status: progressive question branches, a first loci-memory route and a compact source-orientation scan are implemented. Advanced autocomplete-style scanning and spaced-review scheduling for loci remain design targets.

The learning surface should let a learner move quickly across a whole source, stop at the question that matters, and then uncover only as much reasoning as they need. It should not turn a PDF into another long article to read.

## 1. Three passes through a source

### Pass A — orientation scan

Show the document's real structure and evidence before generating explanations. The first atlas scan now lists detected subsections and source-step counts, then lets the learner search the validated chain for titles, terms, equations, worked examples, tables, figures and code. Each result retains its step ID and page location, opens the concept node to which that exact source step was assigned, and expands the matching source-trail entry.

The scan is intentionally an index, not a second lesson or a generated chapter summary. It is collapsed by default, can be searched without changing the selected question branch, and only shows categories found in the ingested chain. Native autocomplete suggestions are now drawn only from source titles, concept questions, terms, equations, examples, table columns and figure labels/captions. Adaptive preview prompts, ranked cross-source suggestions and richer per-section inventory facets remain future work. Never silently drop a subsection or treat an inaccessible picture as interpreted content.

### Pass B — question sweep

Turn the validated source map into a horizontal set of meaningful question branches. Keep the question visible before the answer. Useful prompt forms include:

| Scan prompt | What it asks the learner to generate |
|---|---|
| **Term completion** | Supply the term from its defining property or role, not from a word bank alone |
| **Relationship completion** | State the missing dependency or contrast between two known concepts |
| **Mechanism bridge** | Infer the supported process connecting a known initial and final state |
| **Next-state prediction** | Predict the next consequential state before showing it |
| **Equation anticipation** | Predict a relation from the variables, units and stated constraints; do not demand a derivation the source has not enabled |
| **Figure reading** | Explain what a source figure shows before its caption or interpretation is expanded |
| **Worked-step completion** | Reconstruct one omitted step while keeping the surrounding worked example visible |
| **Counterfactual** | Change one meaningful variable or component and predict the consequence supported by the source |

Each prompt must be answerable from the supplied source or an explicitly labelled inference from it. A prompt that requires an unintroduced fact is excluded or marked as an extension, never smuggled into the source-grounded path.

### Pass C — selective depth

The learner chooses a question branch. The selected branch contains the stimulus, an optional hint, a response and confidence commitment, then the expected reconstruction. Its explanation is authored as an ordered list of small reasoning units.

**One UNFOLD action reveals exactly one next reasoning unit.** Earlier units stay visible. The branch does not change when the learner unfolds. Space reveals one unit; Ctrl+Z steps back one unit. Moving to another horizontal branch preserves the first branch's prediction and reveal cursor.

Each reasoning unit cites one or more exact chain-step IDs. The UI can therefore show the source trail at the point where the inference is made, not only in a chapter-wide audit panel. Older saved atlases without reasoning units remain readable through their existing explanation; they are not padded with fabricated intermediate steps.

## 2. Loci routes: an optional spatial memory layer

The library and its book rooms already provide stable, navigable places. The initial loci route uses that spatial structure as an optional second representation of the concept atlas, not as a replacement for the source or a mandatory 3D decoration.

### What a useful route contains

- **One distinct anchor per important concept or compact concept cluster.** The shipped first version anchors a concept to a stable bookcase ID, row and slot. The marker is attached to the bookcase, so it follows the case when moved or rotated; it marks the position rather than depending on the identity of the scroll occupying it. Doorways, desks, lecterns and meaningful diorama objects are future anchor types.
- **A concrete association chosen or accepted by the learner.** The association can use shape, movement, scale, sound or a small visual scene. It is a retrieval cue, not evidence that the association is scientifically literal.
- **A question at the location, not the answer.** The current route shows the concept question and the learner's own association cue. The learner writes a reconstruction and confidence, commits it, and only then reveals the expected reconstruction (the node summary). The full source-linked reasoning remains in the atlas.
- **A route with an intelligible order.** The shipped first version lets the learner move a stop earlier or later and labels the result as the learner's own route order. It does not infer prerequisite, causal or temporal order. If a future route is generated from a knowledge relationship, the UI must say which relationship determines the route; a purely navigational order must never be mistaken for a causal one.
- **Edit and bypass.** The learner can change the association or choose another shelf location, or simply ignore the optional route and use the atlas. The first version uses a learner-authored short cue; the location does not encode a factual claim.
- **A source link at every stop.** Each locus points back to its atlas node and source step IDs. The mnemonic may be vivid; the underlying claim still comes from the cited source.

### Retrieval and spacing

The current route stores the learner's attempt, confidence and reveal state with its locus, and now also creates a stable card in the existing retrieval ledger. After the expected reconstruction is revealed, the learner self-rates **Needs another pass** or **Recalled accurately**. The first schedules a one-day interval; the second expands the interval by 2.5× up to 120 days. The stop and route rail show the next due date and current interval. Loci cards are marked as self-rated recall, so their history is excluded from objective transfer-accuracy totals. This is a schedule, not automatic grading of free-text answers; route completion, time spent and streaks are not learning scores.

A route can be walked without the labels after the learner has practised it. That is the test of whether the place has become a retrieval cue rather than a decorative list. The route remains optional because spatial imagery is not a universal requirement for understanding.

## 3. Guardrails against shallow scanning

1. **Coverage is non-negotiable.** The fast scan may compress the view, not the source inventory. Every source unit remains indexed and assigned or explicitly marked as unprocessed.
2. **Recognition is not mastery.** A word bank, highlighted answer or completed animation cannot count as recall. Ask for a prediction or reconstruction before showing the target.
3. **No answer leakage.** A prompt, teaser, branch label or diagram shown before commitment must not contain the missing answer in another form.
4. **One inferential move per reveal.** A reveal unit should settle one small question and, where appropriate, open the next. It must not be a paragraph split arbitrarily into fragments.
5. **Preserve the distinction between source and extension.** External evidence, analogies, memory associations and model assumptions are labelled separately from what the uploaded document states.
6. **Use the least misleading medium.** A physical locus can anchor an abstract relation, but the explanatory content should remain a diagram, equation, argument map or other faithful representation when 3D would imply false spatial structure.

## 4. Evaluation gates

A learning workflow is not finished because its animation or navigation works. Evaluate these behaviours:

- the learner can reconstruct the idea without the branch labels or hints;
- the learner can explain the causal or logical link, not only name the answer;
- confidence changes when the evidence warrants it;
- the learner can apply the principle to a changed context;
- the learner can locate the original source step for a claim;
- a loci association can be edited or bypassed without losing access to the underlying concept;
- a fast scan can be checked against the full source inventory so that it hides no omitted content.

The principal measures are delayed first-attempt recall, transfer accuracy and confidence calibration. Engagement and route completion are useful usability signals, not proxies for learning.
