# Learning workflow: scan, discover, remember, transfer

Status: progressive question branches are implemented in the semantic atlas. The rapid-scan and loci layers below are the next product-design targets; they are specified here, not claimed as shipped.

The learning surface should let a learner move quickly across a whole source, stop at the question that matters, and then uncover only as much reasoning as they need. It should not turn a PDF into another long article to read.

## 1. Three passes through a source

### Pass A — orientation scan

Show the document's real structure and evidence before generating explanations:

- detected chapters, sections, slides or infographic panels;
- key terms, equations, worked examples, tables and figures, with their page/slide references;
- the source's own question thread where the text states one;
- uncertainty where extraction is weak, for example an image-led slide with no accessible description.

This is an index, not a chapter summary. It should be possible to see the scope of a source without opening every explanation. Never silently drop a subsection or treat an inaccessible picture as interpreted content.

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

The library and its book rooms already provide stable, navigable places. A loci route should use that spatial structure as an optional second representation of the concept atlas, not as a replacement for the source or a mandatory 3D decoration.

### What a useful route contains

- **One distinct anchor per important concept or compact concept cluster.** Anchors should be recognisable landmarks in a stable room: a doorway, desk object, shelf bay, lectern or a meaningful diorama object. Avoid assigning many ideas to visually similar objects.
- **A concrete association chosen or accepted by the learner.** The association can use shape, movement, scale, sound or a small visual scene. It is a retrieval cue, not evidence that the association is scientifically literal.
- **A question at the location, not the answer.** Arriving at an anchor asks the learner to reconstruct the concept, relationship or mechanism. The explanation remains hidden until the learner commits or requests help.
- **A route with an intelligible order.** The order may follow prerequisite, causal or temporal relationships, but the app must say which relationship determines the route. A purely navigational order must not be mistaken for a causal one.
- **Edit, move, replace and remove.** The learner can change an association, choose another landmark, opt out of imagery or use a verbal/symbolic cue instead. A poor or culturally opaque association should not become a permanent obstacle.
- **A source link at every stop.** Each locus points back to its atlas node and source step IDs. The mnemonic may be vivid; the underlying claim still comes from the cited source.

### Retrieval and spacing

A due review should reuse the existing retrieval ledger rather than create a competing points system. A due card can open the corresponding locus and present its question. The learner predicts first, reveals the expected reconstruction, and then sees the source-linked reasoning path. Missed items return according to the review schedule; route completion, time spent and streaks are not learning scores.

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
