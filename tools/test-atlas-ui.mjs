#!/usr/bin/env node
// Browser interaction regression for horizontal atlas branches and one-step-at-a-time reasoning.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const URL0 = process.argv[2] || process.env.ATLAS_UI_URL || 'http://127.0.0.1:8000/';
async function loadPlaywright() {
  try { return await import('playwright'); } catch (e) { }
  try {
    const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return createRequire(globalRoot + '/noop.js')('playwright');
  } catch (e) { }
  console.error('playwright is not installed');
  process.exit(2);
}

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl']
});
const page = await (await browser.newContext({ viewport: { width: 1180, height: 820 } })).newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });

try {
  await page.goto(URL0, { waitUntil: 'domcontentloaded', timeout: 60000 });
  errors.length = 0; // Ignore unrelated startup/CDN errors; only assert the test interaction itself is clean.
  await page.evaluate(async () => {
    const { renderAtlasView } = await import('/js/room/atlas-view.js');
    const makeChallenge = (id, type, q, prefix) => ({
      id, type, stimulus: 'A controlled source-grounded situation.', question: q,
      hint: 'Identify the relevant constraint before predicting.',
      answer: 'The expected reconstruction for ' + prefix + '.',
      why: 'The source establishes the relationship used in this inference.',
      feedback: 'Compare the relationship and the intervention in your prediction.',
      missingBodyIds: [],
      reasoning: [
        { title: prefix + ' · identify', text: 'Identify the relevant state and boundary.', sourceStepIds: ['S1'] },
        { title: prefix + ' · connect', text: 'Connect the stated relationship to the observed change.', sourceStepIds: ['S2'] },
        { title: prefix + ' · conclude', text: 'Apply the intervention and state the supported consequence.', sourceStepIds: ['S1', 'S2'] }
      ]
    });
    let memoryAssignments = 0, memoryRemovals = 0, memoryVisits = 0;
    const atlas = {
      question: 'How do the system components constrain the outcome?',
      attempts: {},
      memoryPlaces: [{
        nodeId: 'test-node', caseId: 'test-case', row: 0, slot: 1, rowLabel: 2,
        shelfName: 'Test bookcase', association: 'A brass key opening a narrow gate'
      }],
      nodes: [{
        id: 'test-node', title: 'Test concept', question: 'How does this system behave?',
        summary: 'A two-branch test of source-grounded reasoning.',
        stepIds: ['S1', 'S2', 'S3'],
        sourceRefs: {
          stepIds: ['S1', 'S2', 'S3'], subsectionIds: ['1.1'],
          stepSummaries: [
            { stepId: 'S1', title: 'Membrane boundary', statement: 'The membrane separates two regions.', pages: [2] },
            { stepId: 'S2', title: 'Flux relation', statement: 'The rate depends on the stated gradient and permeability.', pages: [3] },
            { stepId: 'S3', title: 'Supplemental observation', statement: 'An additional note has no subsection mapping.', pages: [4] }
          ]
        },
        knowledgeKinds: ['causal'],
        visualIntent: 'Test view', dioramaSet: [], position: { x: 50, y: 50 },
        challenges: [
          makeChallenge('branch-mechanism', 'mechanistic', 'What mechanism connects the initial and final states?', 'Mechanism'),
          makeChallenge('branch-counterfactual', 'counterfactual', 'What changes when this component is removed?', 'Counterfactual')
        ]
      }],
      edges: [],
      sourceIndex: {
        sourceSubsections: [{ id: '1.1', title: 'Membrane transport', startPage: 2, endPage: 3 }],
        pdfFigureIndex: [{
          id: 'F1', label: 'Membrane permeability diagram', page: 3,
          caption: 'A diagram showing a selective boundary and its transport route.'
        }]
      },
      audit: { certainty: 'test atlas' }
    };
    const part = {
      title: 'Test part',
      analysis: {
        chain: [
          {
            id: 'S1', section: '1.1', kind: 'definition', title: 'Membrane boundary',
            statement: 'The membrane separates two regions.',
            terms: [{ term: 'selective permeability', meaning: 'The boundary permits some movements and not others.' }],
            pages: [2]
          },
          {
            id: 'S2', section: '1.1', kind: 'equation', title: 'Flux relation',
            statement: 'The rate of movement depends on the stated gradient and permeability.',
            math: 'J = P (C1 - C2)', figureRefs: [{ id: 'F1' }], pages: [3]
          },
          {
            id: 'S3', kind: 'note', title: 'Supplemental observation',
            statement: 'An additional note has no subsection mapping.',
            pages: [4]
          }
        ]
      }
    };
    let saves = 0;
    const view = renderAtlasView({
      atlas, part,
      onSave: () => { saves++; },
      onAssignMemoryPlace: () => { memoryAssignments++; },
      onRemoveMemoryPlace: () => { memoryRemovals++; },
      onVisitMemoryRoute: () => { memoryVisits++; }
    });
    view.dataset.testAtlas = 'true';
    // This is an isolated browser UI surface over the running 3D hall, not an element appended underneath its canvas.
    // Give it a real pointer-interactive layer so Playwright exercises the same clicks a learner can make.
    Object.assign(view.style, {
      position: 'fixed', inset: '0', zIndex: '2147483000',
      overflow: 'auto', background: 'rgba(247,244,236,.98)',
      padding: '22px', boxSizing: 'border-box'
    });
    document.body.append(view);
    window.__atlasUITest = {
      atlas, getSaves: () => saves,
      memoryAssignments: () => memoryAssignments,
      memoryRemovals: () => memoryRemovals,
      memoryVisits: () => memoryVisits
    };
  });

  const branches = page.locator('.atlas-branch-tab');
  assert.equal(await branches.count(), 2, 'two questions should appear as horizontal branches');
  assert.match(await page.locator('.atlas-challenge-card h4').innerText(), /mechanism/i);

  const sourceScan = page.locator('.atlas-source-scan');
  await sourceScan.locator('.atlas-scan-summary').click({ force: true });
  assert.equal(await sourceScan.evaluate(el => el.open), true, 'the native source-scan disclosure must open');
  assert.match(await sourceScan.innerText(), /Membrane transport/i, 'the default source scan must expose the extracted subsection');
  const sectionBrowse = sourceScan.locator('.atlas-scan-section').first();
  assert.match(await sectionBrowse.innerText(), /Membrane transport.*2 source steps/s);
  await sectionBrowse.locator('.atlas-scan-section-summary').click({ force: true });
  assert.equal(await sectionBrowse.evaluate(el => el.open), true, 'each subsection should expand independently');
  assert.equal(await sectionBrowse.locator('.atlas-scan-section-steps .atlas-scan-row').count(), 2, 'expanded subsections must expose their source-step inventory');
  assert.match(await sectionBrowse.innerText(), /S1.*Membrane boundary/i);
  assert.match(await sectionBrowse.innerText(), /S2.*Flux relation/i);
  assert.equal(await sourceScan.locator('.atlas-scan-section').count(), 2, 'unsectioned source steps must have an explicit inventory group');
  const unmappedBrowse = sourceScan.locator('.atlas-scan-section').nth(1);
  assert.match(await unmappedBrowse.locator('.atlas-scan-section-summary').innerText(), /Unmapped \/ unsectioned source steps.*1 source steps/i);
  await unmappedBrowse.locator('.atlas-scan-section-summary').click({ force: true });
  assert.match(await unmappedBrowse.innerText(), /S3.*Supplemental observation.*p\. 4/i);
  const scanSearch = sourceScan.locator('.atlas-scan-search');
  assert.equal(await scanSearch.getAttribute('list'), 'atlas-source-suggestions-test-node', 'the scan input must expose its source-grounded autocomplete list');
  const suggestionValues = await page.locator('#atlas-source-suggestions-test-node option').evaluateAll(options => options.map(option => option.value));
  assert.ok(suggestionValues.includes('selective permeability'), 'autocomplete must include source terms');
  assert.ok(suggestionValues.includes('J = P (C1 - C2)'), 'autocomplete must include source equations');
  assert.ok(suggestionValues.includes('Membrane permeability diagram'), 'autocomplete must include indexed figure labels');
  assert.ok(suggestionValues.includes('A diagram showing a selective boundary and its transport route.'), 'autocomplete must include source figure captions');
  await scanSearch.fill('selective permeability');
  assert.equal(await sourceScan.locator('.atlas-scan-row').count(), 1, 'a term search must find its exact source step');
  assert.match(await sourceScan.locator('.atlas-scan-row').first().innerText(), /S1.*p\. 2/i);
  await sourceScan.locator('.atlas-scan-row').first().click();
  assert.equal(await page.locator('.atlas-source-trail').getAttribute('open'), '', 'a source search must open the concept source trail');
  assert.match(await page.locator('.atlas-source-step[open]').innerText(), /S1.*Membrane boundary/i, 'the exact selected source step must expand in the source trail');
  await scanSearch.fill('Flux relation');
  assert.equal(await sourceScan.locator('.atlas-scan-row').count(), 1, 'an equation step must be searchable by its source title');
  assert.match(await sourceScan.locator('.atlas-scan-row').first().innerText(), /equation \/ derivation/i);
  await sourceScan.locator('.atlas-scan-row').first().click();
  assert.match(await page.locator('.atlas-source-step[open]').innerText(), /S2.*Flux relation/i, 'a second search must jump to its exact source step');
  await scanSearch.fill('Supplemental observation');
  assert.equal(await sourceScan.locator('.atlas-scan-row').count(), 1, 'unsectioned steps must remain searchable');
  assert.match(await sourceScan.locator('.atlas-scan-row').first().innerText(), /S3.*page not indexed|S3.*p\. 4/i);
  await sourceScan.locator('.atlas-scan-row').first().click();
  assert.match(await page.locator('.atlas-source-step[open]').innerText(), /S3.*Supplemental observation/i);
  await scanSearch.fill('a diagram showing a selective boundary');
  assert.equal(await sourceScan.locator('.atlas-scan-row').count(), 1, 'figure captions must be searchable through their linked source step');
  assert.match(await sourceScan.locator('.atlas-scan-row').first().innerText(), /S2.*p\. 3/i);
  assert.match(await page.locator('.atlas-memory-locus').innerText(), /brass key opening a narrow gate/i);
  await page.getByRole('button', { name: 'Change this memory place' }).click();
  await page.getByRole('button', { name: 'Remove memory place' }).click();
  await page.getByRole('button', { name: /Visit memory route/ }).click();
  const memoryCallbacks = await page.evaluate(() => ({
    assignments: window.__atlasUITest.memoryAssignments(),
    removals: window.__atlasUITest.memoryRemovals(),
    visits: window.__atlasUITest.memoryVisits()
  }));
  assert.deepEqual(memoryCallbacks, { assignments: 1, removals: 1, visits: 1 }, 'the concept atlas must expose assignment, removal and route callbacks');

  const prediction = page.locator('.atlas-prediction');
  await prediction.fill('The channel provides a route through the boundary.');
  await page.locator('.atlas-confidence').selectOption('High');
  await page.getByRole('button', { name: 'Commit prediction' }).click();
  await page.getByRole('button', { name: 'Reveal answer and begin unfolding' }).click();
  assert.equal(await page.locator('.atlas-prediction').isDisabled(), true, 'a committed prediction must lock after the answer is shown');
  assert.equal(await page.locator('.atlas-confidence').isDisabled(), true, 'confidence must remain the pre-reveal confidence');

  const next = page.locator('.atlas-unfold-next');
  assert.equal(await page.locator('.atlas-reasoning-unit').count(), 0, 'the explanation must remain hidden until UNFOLD');
  assert.match(await next.innerText(), /UNFOLD.*1 \/ 3/);

  await next.click();
  assert.equal(await page.locator('.atlas-reasoning-unit').count(), 1, 'one click must reveal exactly one unit');
  assert.equal(await page.locator('.atlas-source-chip').count(), 1, 'each revealed unit must expose its source-step link');

  await page.keyboard.press('Space');
  assert.equal(await page.locator('.atlas-reasoning-unit').count(), 2, 'Space must reveal one further unit on the same branch');
  assert.match(await page.locator('.atlas-challenge-card h4').innerText(), /mechanism/i);

  await page.keyboard.press('Control+z');
  assert.equal(await page.locator('.atlas-reasoning-unit').count(), 1, 'Ctrl+Z must step back by exactly one reveal');

  await branches.nth(1).click();
  assert.match(await page.locator('.atlas-challenge-card h4').innerText(), /component is removed/i);
  assert.equal(await page.locator('.atlas-reasoning-unit').count(), 0, 'a new branch starts at its own first reveal state');
  await page.locator('.atlas-prediction').fill('This is a saved draft for the second branch.');
  await page.locator('.atlas-confidence').selectOption('Medium');

  await branches.nth(1).focus();
  await page.keyboard.press('ArrowLeft');
  assert.match(await page.locator('.atlas-challenge-card h4').innerText(), /mechanism/i);
  assert.equal(await page.locator('.atlas-reasoning-unit').count(), 1, 'arrow navigation must return to the previous branch and restore its saved reveal cursor');

  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('.atlas-prediction').inputValue(), 'This is a saved draft for the second branch.', 'an uncommitted draft must survive switching branches');
  assert.equal(await page.locator('.atlas-confidence').inputValue(), 'Medium', 'the confidence draft must survive branch switching');
  await page.keyboard.press('ArrowLeft');

  const state = await page.evaluate(() => ({
    unfolded: window.__atlasUITest.atlas.attempts['branch-mechanism'].unfoldedCount,
    committed: window.__atlasUITest.atlas.attempts['branch-mechanism'].committed,
    revealed: window.__atlasUITest.atlas.attempts['branch-mechanism'].revealed,
    draft: window.__atlasUITest.atlas.attempts['branch-counterfactual'].response,
    draftConfidence: window.__atlasUITest.atlas.attempts['branch-counterfactual'].confidence,
    saves: window.__atlasUITest.getSaves()
  }));
  assert.equal(state.unfolded, 1);
  assert.equal(state.committed, true);
  assert.equal(state.revealed, true);
  assert.equal(state.draft, 'This is a saved draft for the second branch.');
  assert.equal(state.draftConfidence, 'Medium');
  assert.ok(state.saves >= 7, 'drafts, confidence, prediction, answer and reveal movements should be saved');
  assert.deepEqual(errors, [], 'the atlas interaction must not create browser errors');

  // The real app replaces the reader/atlas view when the library opens. Remove only the temporary test overlay
  // so it cannot intercept clicks intended for the library's route panel.
  await page.locator('.atlas-view[data-test-atlas="true"]').evaluate(el => el.remove());

  // Exercise the actual walkable-library implementation, not a mock: slots are bookcase-local and the review is
  // committed before the expected reconstruction is shown.
  await page.waitForFunction(() => {
    const h = window.__scriptorium && window.__scriptorium.mode;
    return !!(h && typeof h.listShelves === 'function' && typeof h.showMemoryRoute === 'function');
  }, { timeout: 60000 });
  const routeInfo = await page.evaluate(() => {
    const app = window.__scriptorium, hub = app.mode;
    const shelf = hub.listShelves()[0], row = shelf.rows[0], slot = row.slots[0];
    const makeNode = (id, title, question, summary) => ({
      id, title, question, summary, stepIds: ['S1', 'S2']
    });
    const atlas = {
      nodes: [
        makeNode('locus-one', 'Selective boundary', 'What does the boundary allow?', 'The boundary permits only the movements supported by its available routes.'),
        makeNode('locus-two', 'Available route', 'What changes if the route is removed?', 'Removing the route removes that route-dependent movement.')
      ],
      memoryPlaces: [
        { nodeId: 'locus-one', caseId: shelf.caseId, row: row.row, slot: slot.slot, rowLabel: row.label, shelfName: shelf.title, association: 'A key beside a narrow doorway' },
        { nodeId: 'locus-two', caseId: shelf.caseId, row: row.row, slot: (row.slots[1] || slot).slot, rowLabel: row.label, shelfName: shelf.title, association: 'A bridge that disappears' }
      ]
    };
    let saves = 0;
    hub.showMemoryRoute({
      bookId: app.lib.books[0].id,
      partId: 'memory-test-part',
      atlas,
      initialNodeId: 'locus-one',
      onSave: () => { saves++; }
    });
    window.__lociUITest = { atlas, getSaves: () => saves };
    return {
      count: atlas.memoryPlaces.length,
      shelfId: shelf.caseId,
      markerParentId: hub.memoryMarker && hub.memoryMarker.parent && hub.memoryMarker.parent.userData.shelfId
    };
  });
  assert.equal(routeInfo.count, 2);
  assert.equal(routeInfo.markerParentId, routeInfo.shelfId, 'the visual anchor must be attached to the bookcase, not a world-space coordinate');
  const memoryPanel = page.locator('.memory-route-panel');
  await memoryPanel.waitFor();
  assert.match(await memoryPanel.locator('.memory-route-question').innerText(), /What does the boundary allow/i);
  assert.equal(await memoryPanel.getByText(/Expected reconstruction/).count(), 0, 'the expected answer must be hidden before the recall attempt');
  await memoryPanel.locator('.memory-route-response').fill('The boundary permits only movement through an available route.');
  await memoryPanel.locator('.memory-route-confidence').selectOption('High');
  await memoryPanel.getByRole('button', { name: 'Commit recall' }).click();
  assert.equal(await memoryPanel.locator('.memory-route-response').isDisabled(), false, 'a committed attempt remains editable until reveal');
  await memoryPanel.getByRole('button', { name: 'Reveal expected reconstruction' }).click();
  assert.equal(await memoryPanel.locator('.memory-route-response').isDisabled(), true, 'the attempt locks after reveal');
  assert.match(await memoryPanel.innerText(), /The boundary permits only the movements supported by its available routes/i);
  await memoryPanel.getByRole('button', { name: 'Start another recall attempt' }).click();
  assert.equal(await memoryPanel.locator('.memory-route-response').isDisabled(), false, 'a learner must be able to practise a revealed concept again');
  assert.equal(await memoryPanel.locator('.memory-route-response').inputValue(), '', 'a fresh attempt starts without copying the prior answer');
  const historyAfterReset = await page.evaluate(() => window.__lociUITest.atlas.memoryPlaces.find(p => p.nodeId === 'locus-one').review.history);
  assert.equal(historyAfterReset.length, 1, 'the completed attempt must be retained in history');
  assert.equal(historyAfterReset[0].response, 'The boundary permits only movement through an available route.');
  await memoryPanel.locator('.memory-route-response').fill('A new attempt: movement depends on an available route.');
  await memoryPanel.locator('.memory-route-confidence').selectOption('Medium');
  await memoryPanel.getByRole('button', { name: 'Commit recall' }).click();
  await memoryPanel.getByRole('button', { name: 'Reveal expected reconstruction' }).click();
  assert.equal(await memoryPanel.locator('.memory-route-response').isDisabled(), true);
  await memoryPanel.locator('.memory-route-footer button').nth(1).click();
  assert.match(await memoryPanel.locator('.memory-route-question').innerText(), /What changes if the route is removed/i);
  await memoryPanel.locator('.memory-route-footer button').nth(0).click();
  assert.match(await memoryPanel.innerText(), /The boundary permits only the movements supported by its available routes/i, 'revealed recall state must persist when returning to a route stop');
  await memoryPanel.getByRole('button', { name: 'Move this place later' }).click();
  assert.match(await memoryPanel.locator('.memory-route-heading').innerText(), /Selective boundary/i, 'reordering must keep the same place selected');
  const routeOrder = await page.evaluate(() => window.__lociUITest.atlas.memoryPlaces.map(p => p.nodeId));
  assert.deepEqual(routeOrder, ['locus-two', 'locus-one'], 'the learner-defined order must be saved on the atlas');
  const lociSaves = await page.evaluate(() => window.__lociUITest.getSaves());
  assert.ok(lociSaves >= 3, 'the route must flush the recall draft with commitment, reveal and explicit route order');
  const persistedReview = await page.evaluate(() => window.__lociUITest.atlas.memoryPlaces.find(p => p.nodeId === 'locus-one').review);
  assert.equal(persistedReview.committed, true);
  assert.equal(persistedReview.revealed, true);
  assert.equal(persistedReview.history.length, 1, 'the prior recall attempt must survive a second attempt');
  await page.evaluate(() => window.__scriptorium.mode.closeMemoryRoute());
  assert.equal(await memoryPanel.count(), 0, 'closing a route must remove its panel');
  assert.deepEqual(errors, [], 'loci assignment and route interactions must not create browser errors');

  console.log('PASS  atlas UI: horizontal branches, arrow navigation, committed prediction, one-unit UNFOLD, Space, Ctrl+Z, drafts, locked predictions, source labels, per-branch persistence, loci recall, learner-controlled route order and source-index search');
} finally {
  await browser.close();
}
