#!/usr/bin/env node
// Regression tests for semantic atlas coverage and progressive, source-mapped challenge reasoning.
import assert from 'node:assert/strict';

// The atlas module imports the configured provider router. Its module-level environment probe
// expects a browser window, but these tests exercise only pure atlas functions and never call a provider.
globalThis.window = globalThis.window || {};
const { atlasPrompt, validateAtlas, sourceFigureEvidence, selectSourceFigureAttachments, sourceFigureAttachmentManifest, sourceVisualEvidence, buildVisualReconstructionBrief, sourceVisualFigure, selectedSourceVisualFigures, buildConceptVisualSequence, compileAtlas } = await import('../js/ai/atlas.js');

const steps = [
  { id: 'S1', bodies: ['membrane', 'solute'], section: '1.1', pages: [3], table: { caption: 'Transport conditions', columns: ['Condition', 'Flux'], rows: [['A', '2.1'], ['B', '3.4']] } },
  { id: 'S2', bodies: ['membrane', 'channel'], section: '1.1', pages: [3], figureRefs: [{ id: 'F1' }], math: 'J = P(C1 - C2)', derivation: [{ expr: 'J = PΔC', why: 'The source relation' }], from: ['S1'] }
];
const sourceSections = [{
  id: '1.1', title: 'Membrane transport', startPage: 3, endPage: 3, sourceSlide: 3,
  sourceVisuals: [{
    id: 'pptx-chart-s3-1', kind: 'chart', label: 'Transport rates', slide: 3, mediaPath: 'ppt/charts/chart1.xml',
    data: { title: 'Transport rates', chartKind: 'bar', series: [{ name: 'Flux', categories: ['A', 'B'], values: ['2.1', '3.4'], points: [{ index: 0, category: 'A', rawValue: '2.1', value: 2.1 }, { index: 1, category: 'B', rawValue: '3.4', value: 3.4 }] }] }
  }, {
    id: 'pptx-smartart-s3-1', kind: 'smartart', label: 'Transport cycle', slide: 3, mediaPath: 'ppt/diagrams/data1.xml',
    data: { title: 'Transport cycle', nodes: [{ id: 'n1', label: 'Stimulus' }, { id: 'n2', label: 'Response' }], links: [{ id: 'e1', from: 'n1', to: 'n2', type: 'parOf' }] }
  }]
}];
const sourceFigures = [{
  id: 'F1', label: 'Membrane transport diagram', kind: 'figure',
  caption: 'A labelled membrane channel and its direction of transport.',
  page: 3, slide: 3, mediaPath: 'ppt/media/image1.png', dataUrl: 'data:image/png;base64,aGVsbG8='
}, {
  id: 'F2', label: 'Unlinked visual', kind: 'figure',
  caption: 'This is indexed but no source step cites it.',
  page: 4, dataUrl: 'data:image/png;base64,d29ybGQ='
}];

const makeAtlas = () => ({
  version: 'scriptorium-atlas/1',
  question: 'How does the membrane regulate movement across it?',
  nodes: [{
    id: 'selective-transport',
    title: 'Selective transport',
    question: 'Why does changing the channel alter the movement of solute?',
    summary: 'A membrane and its channels constrain which movements are possible.',
    stepIds: ['S1', 'S2'],
    subsectionIds: ['1.1'],
    knowledgeKinds: ['causal', 'structural'],
    visualIntent: 'Show a membrane, a channel and solute movement.',
    dioramaSet: [{
      viewId: 'boundary-evidence', order: 1, stage: 'orientation',
      title: 'A selective boundary',
      purpose: 'Make selective passage and its constraint visible.',
      mustShow: ['membrane', 'channel', 'solute'],
      manipulations: ['channel availability'],
      medium: '2d',
      sourceFigureIds: ['F1'],
      sourceVisualIds: ['pptx-chart-s3-1']
    }],
    position: { x: 50, y: 50 },
    challenges: [{
      id: 'channel-counterfactual',
      type: 'counterfactual',
      stimulus: 'A solute is on one side of the membrane.',
      question: 'What changes when the relevant channel is absent?',
      hint: 'Separate the barrier from the route through it.',
      answer: 'The channel-dependent route is no longer available.',
      why: 'The source steps describe the channel as the route that permits this movement.',
      feedback: 'Compare your prediction with the availability of the transport route.',
      missingBodyIds: [],
      reasoning: [
        { title: 'Identify the boundary', text: 'The membrane separates the two regions.', sourceStepIds: ['S1'] },
        { title: 'Identify the route', text: 'The channel provides a route through that boundary.', sourceStepIds: ['S2'] },
        { title: 'Apply the intervention', text: 'Removing the channel removes that channel-dependent route.', sourceStepIds: ['S1', 'S2'] }
      ]
    }]
  }],
  edges: [],
  uncertainties: [],
  unassignedNotes: []
});

const valid = makeAtlas();
assert.equal(validateAtlas(valid, ['S1', 'S2'], steps), null, 'a complete source-mapped atlas should pass');
assert.equal(validateAtlas(valid, ['S1', 'S2'], steps, true, sourceFigures, true, sourceSections), null, 'new atlas views may cite only extracted figures and structured visuals linked to their concept steps');

const figureEvidence = sourceFigureEvidence(['S1', 'S2'], steps, sourceFigures);
assert.deepEqual(figureEvidence.figures.map(f => ({ id: f.id, stepIds: f.stepIds, page: f.page, slide: f.slide })), [
  { id: 'F1', stepIds: ['S2'], page: 3, slide: 3 }
], 'the evidence index must map extracted figure provenance back to the exact chain step');
assert.deepEqual(figureEvidence.unresolvedFigureIds, [], 'a figure with a valid extracted record is resolved');
const unresolved = sourceFigureEvidence(['S1'], [
  { id: 'S1', figures: ['missing-figure'] }
], sourceFigures);
assert.deepEqual(unresolved.unresolvedFigureIds, ['missing-figure'], 'an unindexed source reference must remain unresolved');

const selectedAttachments = selectSourceFigureAttachments(valid.nodes[0], steps, sourceFigures, 3);
assert.deepEqual(selectedAttachments.map(f => f.id), ['F1'], 'only image assets cited by a node step may be attached; unrelated indexed images are excluded');
assert.deepEqual(selectSourceFigureAttachments(valid.nodes[0], steps, sourceFigures, 0), [], 'the attachment budget is enforced');
const attachmentManifest = sourceFigureAttachmentManifest(valid.nodes[0], steps, sourceFigures, 3);
assert.deepEqual(attachmentManifest, [{
  attachmentIndex: 1, id: 'F1', label: 'Membrane transport diagram', kind: 'figure',
  caption: 'A labelled membrane channel and its direction of transport.', page: 3, slide: 3, mediaPath: 'ppt/media/image1.png', stepIds: ['S2']
}], 'the image manifest must preserve the exact attachment order and source location');
assert.equal(Object.hasOwn(attachmentManifest[0], 'dataUrl'), false, 'manifest metadata must not duplicate image bytes into saved JSON');

const visualEvidence = sourceVisualEvidence(['S1', 'S2'], steps, sourceSections);
assert.deepEqual(visualEvidence.slides, ['3']);
assert.deepEqual(visualEvidence.visuals.map(v => ({ id: v.id, kind: v.kind, stepIds: v.stepIds, slide: v.slide })), [
  { id: 'pptx-chart-s3-1', kind: 'chart', stepIds: ['S1', 'S2'], slide: 3 },
  { id: 'pptx-smartart-s3-1', kind: 'smartart', stepIds: ['S1', 'S2'], slide: 3 }
], 'structured chart and SmartArt records must retain exact slide and source-step links');
const unrelatedVisuals = sourceVisualEvidence(['S1'], [
  { id: 'S1', section: '1.2', pages: [4] }
], sourceSections);
assert.deepEqual(unrelatedVisuals.visuals, [], 'a visual from another slide/section must not leak into the concept');
const reconstruction = buildVisualReconstructionBrief(valid.nodes[0], steps, sourceSections, sourceFigures);
assert.equal(reconstruction.structuredVisuals[0].data.series[0].points[1].value, 3.4, 'the reconstruction brief must preserve the chart cache value');
assert.deepEqual(reconstruction.structuredVisuals[1].data.links[0], { id: 'e1', from: 'n1', to: 'n2', type: 'parOf' }, 'the brief must preserve SmartArt edge identity');
assert.deepEqual(reconstruction.sourceTables[0].rows, [['A', '2.1'], ['B', '3.4']], 'source table cells must be copied exactly');
assert.equal(reconstruction.sourceEquations[0].expression, 'J = P(C1 - C2)');
assert.deepEqual(reconstruction.stepDependencies, [{ stepId: 'S2', dependsOnStepIds: ['S1'] }]);
assert.ok(reconstruction.reconstructionRules.some(rule => /Do not infer physical scale/.test(rule)));

const selectedSourceFigures = selectedSourceVisualFigures(valid.nodes[0], steps, sourceSections);
assert.equal(selectedSourceFigures.length, 1, 'the atlas should compile only the source visual selected by this concept view');
assert.equal(selectedSourceFigures[0].sourceVisualId, 'pptx-chart-s3-1');
assert.equal(selectedSourceFigures[0].sourceSlide, 3);
assert.equal(selectedSourceFigures[0].viewId, 'boundary-evidence');
assert.equal(selectedSourceFigures[0].viewOrder, 1);
assert.equal(selectedSourceFigures[0].viewStage, 'orientation');
assert.equal(selectedSourceFigures[0].figure.kind, 'bars');
const noSelection = selectedSourceVisualFigures({
  ...valid.nodes[0], dioramaSet: [{ ...valid.nodes[0].dioramaSet[0], sourceVisualIds: [] }]
}, steps, sourceSections);
assert.deepEqual(noSelection, [], 'unselected source visuals stay in provenance but are not presented as explanatory figures');

const stagedNode = {
  ...valid.nodes[0],
  dioramaSet: [
    { ...valid.nodes[0].dioramaSet[0], viewId: 'boundary-evidence', order: 1, stage: 'orientation', sourceVisualIds: ['pptx-chart-s3-1'] },
    { viewId: 'mechanism-map', order: 2, stage: 'mechanism', title: 'The transport mechanism', purpose: 'Connect the route and its effect.', medium: '2d', mustShow: ['channel', 'solute'], manipulations: [], sourceFigureIds: [], sourceVisualIds: [] },
    { viewId: 'interactive-model', order: 3, stage: 'reconstruction', title: 'Reconstruct the system', purpose: 'Inspect the mechanism in 3D.', medium: '3d', mustShow: ['membrane', 'channel'], manipulations: ['channel availability'], sourceFigureIds: [], sourceVisualIds: [] },
    { viewId: 'prediction-view', order: 4, stage: 'understanding', title: 'Predict the outcome', purpose: 'Test the mechanism.', medium: '2d', mustShow: ['outcome'], manipulations: [], sourceFigureIds: [], sourceVisualIds: [] }
  ],
  explanatoryFigures: selectedSourceFigures,
  dioramaRefs: [{ stepId: 'S1', demoIndex: 0, title: 'Transport diorama', purpose: 'Inspect the route.' }]
};
const visualSequence = buildConceptVisualSequence(stagedNode);
assert.deepEqual(visualSequence.map(v => [v.viewId, v.order, v.stage, v.medium, v.status]), [
  ['boundary-evidence', 1, 'orientation', '2d', 'ready'],
  ['mechanism-map', 2, 'mechanism', '2d', 'planned'],
  ['interactive-model', 3, 'reconstruction', '3d', 'ready'],
  ['prediction-view', 4, 'understanding', '2d', 'planned']
], 'the concept visual pathway must preserve planned order/stage and distinguish ready from planned views');
assert.deepEqual(visualSequence[0].figures.map(f => f.sourceVisualId), ['pptx-chart-s3-1']);
assert.equal(visualSequence[2].dioramaRef.title, 'Transport diorama', 'all 3D intentions resolve through the single grouped scene');
assert.equal(visualSequence.filter(v => v.medium === '3d').length, 1, 'multiple 3D plans collapse into one coherent interactive model');

const smartArtOnlyNode = {
  ...valid.nodes[0],
  dioramaSet: [{ ...valid.nodes[0].dioramaSet[0], viewId: 'smartart-route', order: 1, stage: 'mechanism', sourceVisualIds: ['pptx-smartart-s3-1'] }]
};
const selectedSmartArt = selectedSourceVisualFigures(smartArtOnlyNode, steps, sourceSections);
assert.equal(selectedSmartArt.length, 1);
assert.equal(selectedSmartArt[0].figure.kind, 'flow');
assert.deepEqual(selectedSmartArt[0].figure.edges, [{ from: 'n1', to: 'n2', label: 'parOf' }]);


const chartFigure = sourceVisualFigure(sourceSections[0].sourceVisuals[0]);
assert.equal(chartFigure.kind, 'bars');
assert.deepEqual(chartFigure.categories, ['A', 'B']);
assert.deepEqual(chartFigure.series[0].values, [2.1, 3.4]);
assert.match(chartFigure.caption, /slide 3.*Cached values; no axis unit inferred/i);

const smartArtFigure = sourceVisualFigure(sourceSections[0].sourceVisuals[1]);
assert.equal(smartArtFigure.kind, 'flow');
assert.deepEqual(smartArtFigure.nodes.map(n => [n.id, n.label]), [['n1', 'Stimulus'], ['n2', 'Response']]);
assert.deepEqual(smartArtFigure.edges, [{ from: 'n1', to: 'n2', label: 'parOf' }]);
assert.match(smartArtFigure.caption, /Layout redrawn; source node IDs and connection types retained/);

const incompleteSmartArt = sourceVisualFigure({
  ...sourceSections[0].sourceVisuals[1],
  data: { ...sourceSections[0].sourceVisuals[1].data, links: [], omittedLinks: 1 }
});
assert.equal(incompleteSmartArt.kind, 'table', 'incomplete SmartArt must fall back to a source-node inventory');
assert.deepEqual(incompleteSmartArt.rows, [['n1', 'Stimulus', ''], ['n2', 'Response', '']]);
assert.doesNotMatch(JSON.stringify(incompleteSmartArt), /"edges"/, 'the fallback must not invent a chain of connections');

const nonNumericChart = sourceVisualFigure({
  ...sourceSections[0].sourceVisuals[0],
  data: { ...sourceSections[0].sourceVisuals[0].data, chartKind: 'bar', series: [{
    name: 'Flux', points: [
      { index: 0, category: 'A', rawValue: 'not reported', value: null },
      { index: 1, category: 'B', rawValue: '3.4', value: 3.4 }
    ]
  }] }
});
assert.equal(nonNumericChart.kind, 'table', 'a chart with non-numeric or missing values must stay a raw data table, not a quantitative bar scale');
assert.deepEqual(nonNumericChart.rows, [['A', 'not reported'], ['B', '3.4']]);

const misalignedChart = sourceVisualFigure({
  ...sourceSections[0].sourceVisuals[0],
  data: { ...sourceSections[0].sourceVisuals[0].data, chartKind: 'bar', series: [{
    name: 'Flux', points: [{ index: 0, category: null, rawValue: '2.1', value: 2.1 }, { index: 1, category: 'B', rawValue: '3.4', value: 3.4 }]
  }] }
});
assert.equal(misalignedChart, null, 'misaligned or missing categories must not be assigned arbitrary labels');


const duplicateViewId = makeAtlas();
duplicateViewId.nodes[0].dioramaSet.push({ ...duplicateViewId.nodes[0].dioramaSet[0], order: 2 });
assert.match(validateAtlas(duplicateViewId, ['S1', 'S2'], steps, true, sourceFigures, true, sourceSections), /duplicate viewId/);
const duplicateViewOrder = makeAtlas();
duplicateViewOrder.nodes[0].dioramaSet.push({ ...duplicateViewOrder.nodes[0].dioramaSet[0], viewId: 'second-view', order: 1 });
assert.match(validateAtlas(duplicateViewOrder, ['S1', 'S2'], steps, true, sourceFigures, true, sourceSections), /duplicate view order/);
const missingViewStage = makeAtlas();
delete missingViewStage.nodes[0].dioramaSet[0].stage;
assert.match(validateAtlas(missingViewStage, ['S1', 'S2'], steps, true, sourceFigures, true, sourceSections), /ordered explanatory-view plan/);

const invalidVisual = makeAtlas();
invalidVisual.nodes[0].dioramaSet[0].sourceVisualIds = ['pptx-chart-s8-1'];
assert.match(validateAtlas(invalidVisual, ['S1', 'S2'], steps, true, sourceFigures, true, sourceSections), /unknown or unlinked structured source visual/);


const inventedFigure = makeAtlas();
inventedFigure.nodes[0].dioramaSet[0].sourceFigureIds = ['F9'];
assert.match(validateAtlas(inventedFigure, ['S1', 'S2'], steps, true, sourceFigures, true, sourceSections), /unknown or unlinked source figure/);
const crossNodeFigure = makeAtlas();
crossNodeFigure.nodes[0].stepIds = ['S1'];
assert.match(validateAtlas(crossNodeFigure, ['S1'], steps, true, sourceFigures, true, sourceSections), /unknown or unlinked source figure/);
const missingFigureField = makeAtlas();
delete missingFigureField.nodes[0].dioramaSet[0].sourceFigureIds;
assert.match(validateAtlas(missingFigureField, ['S1', 'S2'], steps, true, sourceFigures, true, sourceSections), /complete explanatory-view plan/);

const deterministicAtlas = await compileAtlas({
  book: 'Test source', sourceType: 'pptx', part: 'Transport',
  analysis: { question: 'How is transport controlled?', chain: steps.map(st => ({ ...st, title: st.id, statement: st.id, answers: 'A', opens: 'B', explain: [] })) },
  sections: sourceSections,
  figures: sourceFigures, auto: false
});
assert.deepEqual(deterministicAtlas.nodes[0].sourceRefs.visualRecords.map(v => ({ id: v.id, stepIds: v.stepIds, slide: v.slide })), [
  { id: 'pptx-chart-s3-1', stepIds: ['S1', 'S2'], slide: 3 },
  { id: 'pptx-smartart-s3-1', stepIds: ['S1', 'S2'], slide: 3 }
], 'the deterministic fallback atlas must preserve structured visual evidence');
assert.deepEqual(deterministicAtlas.nodes[0].sourceRefs.figureRecords.map(f => ({ id: f.id, stepIds: f.stepIds, page: f.page, slide: f.slide })), [
  { id: 'F1', stepIds: ['S2'], page: 3, slide: 3 }
], 'the deterministic fallback must preserve figure-to-step provenance');
assert.deepEqual(deterministicAtlas.sourceIndex.pdfFigureIndex.find(f => f.id === 'F2').stepIds, [], 'unlinked indexed figures remain explicitly unlinked');
assert.equal(deterministicAtlas.sourceIndex.pdfFigureIndex.find(f => f.id === 'F1').mediaPath, 'ppt/media/image1.png', 'PowerPoint package media provenance must survive atlas compilation');
assert.equal(deterministicAtlas.nodes[0].sourceRefs.figureRecords[0].slide, 3, 'slide provenance must survive the concept-node evidence map');
assert.match(deterministicAtlas.sourceIndex.sourceUnit, /slide/);

assert.equal(validateAtlas(valid, ['S1', 'S2'], steps, true), null, 'newly authored progressive challenges should pass');

const singleUnitLegacy = makeAtlas();
singleUnitLegacy.nodes[0].challenges[0].reasoning = [singleUnitLegacy.nodes[0].challenges[0].reasoning[0]];
assert.equal(validateAtlas(singleUnitLegacy, ['S1', 'S2'], steps), null, 'legacy one-unit reasoning remains readable');
assert.match(validateAtlas(singleUnitLegacy, ['S1', 'S2'], steps, true), /2–5 ordered reveal units/, 'new challenge authoring requires at least two reasoning units');

const foreignStep = makeAtlas();
foreignStep.nodes[0].challenges[0].reasoning[1].sourceStepIds = ['S99'];
assert.match(validateAtlas(foreignStep, ['S1', 'S2'], steps), /outside its concept node/);

const missingSources = makeAtlas();
missingSources.nodes[0].challenges[0].reasoning[0].sourceStepIds = [];
assert.match(validateAtlas(missingSources, ['S1', 'S2'], steps), /missing a title, text or sourceStepIds/);

const tooManyUnits = makeAtlas();
tooManyUnits.nodes[0].challenges[0].reasoning = Array.from({ length: 6 }, (_, i) => ({
  title: 'Move ' + i, text: 'Reasoning move ' + i, sourceStepIds: ['S1']
}));
assert.match(validateAtlas(tooManyUnits, ['S1', 'S2'], steps), /1–5 ordered reveal units/);

const legacy = makeAtlas();
delete legacy.nodes[0].challenges[0].reasoning;
assert.equal(validateAtlas(legacy, ['S1', 'S2'], steps), null, 'older saved atlases without reveal units remain valid');
assert.match(validateAtlas(legacy, ['S1', 'S2'], steps, true), /2–5 ordered reveal units/);

const validLocus = makeAtlas();
validLocus.memoryPlaces = [{
  nodeId: 'selective-transport', caseId: 'bookcase-1', row: 0, slot: 2,
  association: 'A gate with one narrow passage'
}];
assert.equal(validateAtlas(validLocus, ['S1', 'S2'], steps), null, 'a valid learner-authored loci anchor should pass');

const validRecallHistory = makeAtlas();
validRecallHistory.memoryPlaces = [{
  nodeId: 'selective-transport', caseId: 'bookcase-1', row: 0, slot: 2,
  association: 'A gate with one narrow passage',
  review: { response: 'The channel permits movement.', confidence: 'High', history: [] }
}];
assert.equal(validateAtlas(validRecallHistory, ['S1', 'S2'], steps), null, 'a valid loci recall record should pass');

const oversizedRecallHistory = makeAtlas();
oversizedRecallHistory.memoryPlaces = [{
  nodeId: 'selective-transport', caseId: 'bookcase-1', row: 0, slot: 2,
  association: 'A gate with one narrow passage',
  review: {
    history: Array.from({ length: 13 }, (_, i) => ({ response: 'Attempt ' + i, confidence: 'Medium' }))
  }
}];
assert.match(validateAtlas(oversizedRecallHistory, ['S1', 'S2'], steps), /at most twelve attempts/);

const invalidRecallRating = makeAtlas();
invalidRecallRating.memoryPlaces = [{
  nodeId: 'selective-transport', caseId: 'bookcase-1', row: 0, slot: 2,
  association: 'A gate with one narrow passage',
  review: { response: 'I remembered.', confidence: 'High', rating: 'maybe' }
}];
assert.match(validateAtlas(invalidRecallRating, ['S1', 'S2'], steps), /recall rating is invalid/);

const invalidHistoryRating = makeAtlas();
invalidHistoryRating.memoryPlaces = [{
  nodeId: 'selective-transport', caseId: 'bookcase-1', row: 0, slot: 2,
  association: 'A gate with one narrow passage',
  review: { history: [{ response: 'I remembered.', confidence: 'High', rating: 'perfect' }] }
}];
assert.match(validateAtlas(invalidHistoryRating, ['S1', 'S2'], steps), /history contains an invalid rating/);

const invalidReviewDate = makeAtlas();
invalidReviewDate.memoryPlaces = [{
  nodeId: 'selective-transport', caseId: 'bookcase-1', row: 0, slot: 2,
  association: 'A gate with one narrow passage',
  review: { gradedAt: 'yesterday-ish' }
}];
assert.match(validateAtlas(invalidReviewDate, ['S1', 'S2'], steps), /recall timestamp is invalid/);

const foreignLocus = makeAtlas();
foreignLocus.memoryPlaces = [{
  nodeId: 'missing-concept', caseId: 'bookcase-1', row: 0, slot: 2,
  association: 'A gate with one narrow passage'
}];
assert.match(validateAtlas(foreignLocus, ['S1', 'S2'], steps), /memory place refers to a concept node not present/);

const malformedLocus = makeAtlas();
malformedLocus.memoryPlaces = [{
  nodeId: 'selective-transport', caseId: 'bookcase-1', row: -1, slot: 2,
  association: 'A gate with one narrow passage'
}];
assert.match(validateAtlas(malformedLocus, ['S1', 'S2'], steps), /invalid bookcase, row, slot or association/);

const duplicateLocus = makeAtlas();
duplicateLocus.nodes[0].stepIds = ['S1'];
duplicateLocus.nodes[0].challenges = [];
duplicateLocus.nodes.push({
  ...duplicateLocus.nodes[0],
  id: 'channel-route',
  title: 'Channel route',
  question: 'What route does the channel provide?',
  stepIds: ['S2'],
  position: { x: 80, y: 80 }
});
duplicateLocus.memoryPlaces = [
  { nodeId: 'selective-transport', caseId: 'bookcase-1', row: 0, slot: 2, association: 'Gate' },
  { nodeId: 'channel-route', caseId: 'bookcase-1', row: 0, slot: 2, association: 'Door' }
];
assert.match(validateAtlas(duplicateLocus, ['S1', 'S2'], steps), /two concept nodes share the same loci location/);

const wrongPartition = makeAtlas();
wrongPartition.nodes[0].stepIds = ['S1'];
wrongPartition.nodes[0].challenges = []; // keep the fixture focused on the partition check, not its now-foreign reasoning citations
assert.match(validateAtlas(wrongPartition, ['S1', 'S2'], steps), /does not partition all source steps/);

const duplicateChallenge = makeAtlas();
duplicateChallenge.nodes[0].stepIds = ['S1'];
duplicateChallenge.nodes[0].challenges[0].reasoning = duplicateChallenge.nodes[0].challenges[0].reasoning
  .map(unit => ({ ...unit, sourceStepIds: ['S1'] }));
duplicateChallenge.nodes.push({
  ...duplicateChallenge.nodes[0],
  id: 'second-concept',
  stepIds: ['S2'],
  challenges: [{
    ...duplicateChallenge.nodes[0].challenges[0],
    reasoning: duplicateChallenge.nodes[0].challenges[0].reasoning.map(unit => ({ ...unit, sourceStepIds: ['S2'] }))
  }]
});
assert.match(validateAtlas(duplicateChallenge, ['S1', 'S2'], steps), /duplicate challenge id/);

const prompt = atlasPrompt({
  book: 'Test source',
  part: 'Transport',
  analysis: { chain: steps.map(st => ({ ...st, title: st.id, statement: st.id, answers: 'A', opens: 'B', explain: [] })) },
  sections: sourceSections,
  figures: sourceFigures
});
assert.match(prompt, /reasoning array of 2–5 short, ordered reveal units/);
assert.match(prompt, /sourceStepIds/);
assert.match(prompt, /SOURCE FIGURE INDEX/);
assert.match(prompt, /sourceFigureIds/);
assert.match(prompt, /sourceVisualIds/);
assert.match(prompt, /stable-kebab-id/);
assert.match(prompt, /a unique integer order from 1–6/);
assert.match(prompt, /All 3D views for one concept are combined into one interactive scene/);
assert.match(prompt, /STRUCTURED SOURCE VISUAL INDEX/);
assert.match(prompt, /pptx-chart-s3-1/);
assert.match(prompt, /F1/);
assert.match(prompt, /each UNFOLD action exposes exactly one next unit/);
assert.match(prompt, /Never use an UNFOLD action to advance to another challenge/);

console.log('PASS  atlas coverage, progressive source-mapped challenges, legacy compatibility and bounded unique loci recall');
// The imported provider modules are browser-first and may leave browser lifecycle work queued; this pure unit
// suite has completed all synchronous assertions at this point, so do not keep the CI runner alive for those handles.
process.exit(0);
