#!/usr/bin/env node
// Regression tests for semantic atlas coverage and progressive, source-mapped challenge reasoning.
import assert from 'node:assert/strict';

// The atlas module imports the configured provider router. Its module-level environment probe
// expects a browser window, but these tests exercise only pure atlas functions and never call a provider.
globalThis.window = globalThis.window || {};
const { atlasPrompt, validateAtlas } = await import('../js/ai/atlas.js');

const steps = [
  { id: 'S1', bodies: ['membrane', 'solute'], section: '1.1', pages: [2] },
  { id: 'S2', bodies: ['membrane', 'channel'], section: '1.1', pages: [3] }
];

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
      title: 'A selective boundary',
      purpose: 'Make selective passage and its constraint visible.',
      mustShow: ['membrane', 'channel', 'solute'],
      manipulations: ['channel availability'],
      medium: '2d'
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
  sections: [{ id: '1.1', title: 'Transport', level: 1, startPage: 2, endPage: 3, text: 'Source-grounded transport description.' }]
});
assert.match(prompt, /reasoning array of 2–5 short, ordered reveal units/);
assert.match(prompt, /sourceStepIds/);
assert.match(prompt, /each UNFOLD action exposes exactly one next unit/);
assert.match(prompt, /Never use an UNFOLD action to advance to another challenge/);

console.log('PASS  atlas coverage, progressive source-mapped challenges, legacy compatibility and bounded unique loci recall');
// The imported provider modules are browser-first and may leave browser lifecycle work queued; this pure unit
// suite has completed all synchronous assertions at this point, so do not keep the CI runner alive for those handles.
process.exit(0);
