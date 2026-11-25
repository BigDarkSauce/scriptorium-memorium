#!/usr/bin/env node
// Regression tests for source-mapped diorama model contracts (Node 18+, no external dependencies).
import assert from 'node:assert/strict';
import { checkPlan, checkSceneContract } from '../js/ai/prompts.js';

const plan = {
  version: 'scriptorium-model-plan/1',
  question: 'What makes the parts of this system work together?',
  knowledgeKind: ['structural'],
  levels: ['System', 'Part'],
  sequence: [
    { stage: 'orientation', technique: 'establish', cameraMode: 'global', purpose: 'Locate the whole system', answers: 'What is the whole?' },
    { stage: 'decomposition', technique: 'explode', cameraMode: 'object', purpose: 'Separate the working parts', answers: 'Which parts make up the whole?' }
  ],
  comprehensionCheck: {
    explainBack: 'Explain how the declared parts make up the system.',
    misconceptionToAvoid: 'The parts are unrelated.'
  },
  modelContract: {
    systemBoundary: 'A bounded two-actor mechanism; external feedback is outside the model.',
    entities: [
      { bodyId: 'input', referent: 'the source component', role: 'provides the input', evidenceStepIds: ['S1'] },
      { bodyId: 'process', referent: 'the transforming component', role: 'acts on the input', evidenceStepIds: ['S1'] }
    ],
    stateVariables: [
      { key: 'rate', name: 'Process rate', unit: 's^-1', initial: 1, min: 0.5, max: 2, controllable: true, provenance: 'source', evidenceStepIds: ['S1'] }
    ],
    mechanisms: [
      { id: 'input-to-process', from: ['input'], to: ['process'], rule: 'The input drives the process at the selected rate.', basis: 'source', evidenceStepIds: ['S1'] }
    ],
    constraints: [
      { kind: 'causal', statement: 'The process cannot occur before its input is available.', evidenceStepIds: ['S1'] }
    ],
    assumptions: [
      { statement: 'The scene represents a single bounded conversion.', why: 'This isolates the mechanism and excludes feedback.' }
    ],
    observables: [
      { name: 'Process rate', unit: 's^-1', relationship: 'It follows the selected rate parameter.', evidenceStepIds: ['S1'] }
    ],
    uncertainties: ['The source does not describe feedback beyond this boundary.']
  }
};

const scene = {
  type: 'scene',
  sourceStepIds: ['S1'],
  bodies: [
    { id: 'input', role: 'actor', shape: { kind: 'sphere' } },
    { id: 'process', role: 'actor', shape: { kind: 'box' } }
  ],
  params: [
    { key: 'rate', label: 'Process rate', min: 0.5, max: 2, value: 1, unit: 's^-1' }
  ],
  modelContract: JSON.parse(JSON.stringify(plan.modelContract)),
  modelAudit: { verdict: 'pass' }
};

function faults(items) { return items.filter(x => x.level === 'fault'); }

assert.equal(faults(checkPlan(plan, null, null, ['S1'])).length, 0, 'valid versioned plan should pass');
assert.deepEqual(checkSceneContract(scene, plan, ['S1']).faults, [], 'scene matching the contract should pass');

const foreignEvidence = structuredClone(plan);
foreignEvidence.modelContract.observables[0].evidenceStepIds = ['S99'];
assert.ok(faults(checkPlan(foreignEvidence, null, null, ['S1'])).some(x => x.issue.includes('unknown source step')), 'foreign evidence step must be rejected');

const missingEvidence = structuredClone(plan);
missingEvidence.modelContract.stateVariables[0].evidenceStepIds = [];
assert.ok(faults(checkPlan(missingEvidence, null, null, ['S1'])).length, 'unreferenced source-derived variable must be rejected');

const unsupportedExternal = structuredClone(plan);
unsupportedExternal.modelContract.mechanisms[0].basis = 'external';
assert.ok(faults(checkPlan(unsupportedExternal, null, null, ['S1'])).some(x => x.issue.includes('needs a source')), 'external mechanism without a source must be rejected');

const wrongActor = structuredClone(scene);
wrongActor.bodies[1].id = 'unplanned-actor';
assert.ok(checkSceneContract(wrongActor, plan, ['S1']).faults.some(x => x.includes('missing from the scene')), 'unplanned actor substitution must be rejected');

const wrongUnit = structuredClone(scene);
wrongUnit.params[0].unit = 'Hz';
assert.ok(checkSceneContract(wrongUnit, plan, ['S1']).faults.some(x => x.includes('unit differs')), 'unit mismatch must be rejected');

const wrongRange = structuredClone(scene);
wrongRange.params[0].max = 3;
assert.ok(checkSceneContract(wrongRange, plan, ['S1']).faults.some(x => x.includes('range differs')), 'range mismatch must be rejected');

const extraParam = structuredClone(scene);
extraParam.params.push({ key: 'unplanned', min: 0, max: 1, value: 0.5, unit: 'ratio' });
assert.ok(checkSceneContract(extraParam, plan, ['S1']).faults.some(x => x.includes('absent from modelContract')), 'undeclared scene parameter must be rejected');

const legacyPlan = structuredClone(plan);
delete legacyPlan.version;
delete legacyPlan.modelContract;
assert.equal(faults(checkPlan(legacyPlan)).length, 0, 'legacy unversioned plans remain compatible');
const legacyScene = structuredClone(scene);
delete legacyScene.modelContract;
assert.equal(checkSceneContract(legacyScene, legacyPlan).faults.length, 0, 'legacy scenes must not be falsely failed');
assert.ok(checkSceneContract(legacyScene, legacyPlan).warnings.length, 'legacy scenes should disclose missing contract coverage');

console.log('PASS: simulation model-contract regression tests (valid, evidence, actor, parameter, and legacy cases).');
