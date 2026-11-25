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
          figureIds: ['F1'],
          visualIds: ['pptx-chart-s3-1'],
          visualRecords: [{
            id: 'pptx-chart-s3-1', kind: 'chart', label: 'Yield by treatment', caption: 'Cached source chart',
            slide: 3, mediaPath: 'ppt/charts/chart1.xml', sourceSectionId: '1.1', sourceSectionTitle: 'Membrane transport',
            stepIds: ['S2'], linkBasis: 'same-slide source locator',
            data: { chartKind: 'bar', series: [{ name: 'Grain yield', points: [{ index: 0, category: 'Control', rawValue: '3.2' }, { index: 1, category: 'Fertiliser', rawValue: '4.8' }] }] }
          }],
          figureRecords: [{
            id: 'F1', label: 'Membrane permeability diagram',
            caption: 'A diagram showing a selective boundary and its transport route.',
            page: 3, stepIds: ['S2']
          }],
          unresolvedFigureIds: [],
          stepSummaries: [
            { stepId: 'S1', title: 'Membrane boundary', statement: 'The membrane separates two regions.', pages: [2] },
            { stepId: 'S2', title: 'Flux relation', statement: 'The rate depends on the stated gradient and permeability.', pages: [3] },
            { stepId: 'S3', title: 'Supplemental observation', statement: 'An additional note has no subsection mapping.', pages: [4] }
          ]
        },
        knowledgeKinds: ['causal'],
        visualIntent: 'Test view',
        explanatoryFigures: [{
          viewId: 'yield-evidence', viewOrder: 1, viewStage: 'orientation',
          stepId: 'S2', sourceStepIds: ['S2'], title: 'Yield by treatment', purpose: 'Faithful reconstruction of the source chart.',
          sourceVisualId: 'pptx-chart-s3-1', sourceVisualIds: ['pptx-chart-s3-1'], sourceFigureIds: [],
          sourceSlide: 3, sourceKind: 'chart',
          figure: { kind: 'bars', caption: 'Source chart · cached values; no axis unit inferred.', categories: ['Control', 'Fertiliser'], series: [{ name: 'Grain yield', values: [3.2, 4.8] }] }
        }, {
          viewId: 'transport-mechanism', viewOrder: 2, viewStage: 'mechanism',
          stepId: 'S2', sourceStepIds: ['S1', 'S2'], title: 'Transport mechanism', purpose: 'Show the route and the direction of movement.',
          sourceVisualIds: [], sourceFigureIds: [],
          figure: { kind: 'flow', caption: 'Conceptual route through the channel.', nodes: [{ id: 'outside', label: 'Outside' }, { id: 'channel', label: 'Channel' }, { id: 'inside', label: 'Inside' }], edges: [{ from: 'outside', to: 'channel', label: 'enters' }, { from: 'channel', to: 'inside', label: 'passes through' }] }
        }],
        visualSequence: [{
          id: 'yield-evidence', viewId: 'yield-evidence', order: 1, stage: 'orientation',
          title: 'Yield by treatment', purpose: 'Compare the values from the source chart.',
          medium: '2d', status: 'ready', sourceStepIds: ['S2'],
          figures: [{
            viewId: 'yield-evidence', stepId: 'S2', sourceStepIds: ['S2'],
            title: 'Yield by treatment', purpose: 'Faithful reconstruction of the source chart.',
            sourceVisualId: 'pptx-chart-s3-1', sourceSlide: 3, sourceKind: 'chart',
            figure: { kind: 'bars', caption: 'Source chart · cached values; no axis unit inferred.', categories: ['Control', 'Fertiliser'], series: [{ name: 'Grain yield', values: [3.2, 4.8] }] }
          }]
        }, {
          id: 'transport-mechanism', viewId: 'transport-mechanism', order: 2, stage: 'mechanism',
          title: 'Transport mechanism', purpose: 'Show the route and the direction of movement.',
          medium: '2d', status: 'ready', sourceStepIds: ['S1', 'S2'],
          figures: [{
            viewId: 'transport-mechanism', stepId: 'S2', sourceStepIds: ['S1', 'S2'],
            title: 'Transport mechanism', purpose: 'Show the route and the direction of movement.',
            figure: { kind: 'flow', caption: 'Conceptual route through the channel.', nodes: [{ id: 'outside', label: 'Outside' }, { id: 'channel', label: 'Channel' }, { id: 'inside', label: 'Inside' }], edges: [{ from: 'outside', to: 'channel', label: 'enters' }, { from: 'channel', to: 'inside', label: 'passes through' }] }
          }]
        }],
        dioramaSet: [], position: { x: 50, y: 50 },
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
    const beforeAppend = {
      rootTag: view && view.tagName,
      rootClass: view && view.className,
      scanCount: view && view.querySelectorAll('.atlas-source-scan').length,
      childClasses: view ? [...view.children].map(x => x.className) : []
    };
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
      memoryVisits: () => memoryVisits,
      beforeAppend
    };
  });

  const mountDiagnostics = await page.evaluate(() => ({
    ...(window.__atlasUITest && window.__atlasUITest.beforeAppend || {}),
    mountedViews: document.querySelectorAll('[data-test-atlas="true"]').length,
    mountedScanCount: document.querySelectorAll('[data-test-atlas="true"] .atlas-source-scan').length,
    mountedChildClasses: [...(document.querySelector('[data-test-atlas="true"]') || {}).children || []].map(x => x.className)
  }));
  console.log('ATLAS_TEST_MOUNT', JSON.stringify(mountDiagnostics));
  assert.equal(mountDiagnostics.scanCount, 1, 'renderAtlasView must create the source scan before mounting');
  assert.equal(mountDiagnostics.mountedScanCount, 1, 'the mounted atlas view must retain the source scan');

  const branches = page.locator('.atlas-branch-tab');
  assert.equal(await branches.count(), 2, 'two questions should appear as horizontal branches');
  assert.match(await page.locator('.atlas-challenge-card h4').innerText(), /mechanism/i);

  const sourceScan = page.locator('.atlas-source-scan');
  await sourceScan.locator('.atlas-scan-summary').evaluate(el => el.click());
  assert.equal(await sourceScan.locator('.atlas-scan-summary').getAttribute('aria-expanded'), 'true', 'the source-scan control must expose its expanded state');
  assert.equal(await sourceScan.locator('.atlas-source-scan-body').evaluate(el => el.hidden), false, 'the source-scan body must be revealed');
  assert.match(await sourceScan.innerText(), /Membrane transport/i, 'the default source scan must expose the extracted subsection');
  const sectionBrowse = sourceScan.locator('.atlas-scan-section').first();
  assert.match(await sectionBrowse.innerText(), /Membrane transport.*2 source steps/s);
  await sectionBrowse.locator('.atlas-scan-section-summary').evaluate(el => el.click());
  assert.equal(await sectionBrowse.locator('.atlas-scan-section-summary').getAttribute('aria-expanded'), 'true', 'each subsection control must expose its expanded state');
  assert.equal(await sectionBrowse.locator('.atlas-scan-section-steps').evaluate(el => el.hidden), false, 'the subsection step list must be revealed');
  assert.equal(await sectionBrowse.locator('.atlas-scan-section-steps .atlas-scan-row').count(), 2, 'expanded subsections must expose their source-step inventory');
  const sectionText = await sectionBrowse.innerText();
  assert.ok(sectionText.includes('Membrane boundary') && sectionText.includes('S1 · p. 2'), 'the subsection inventory must show the first source title and ID/page');
  assert.ok(sectionText.includes('Flux relation') && sectionText.includes('S2 · p. 3'), 'the subsection inventory must show the second source title and ID/page');
  assert.equal(await sourceScan.locator('.atlas-scan-section').count(), 2, 'unsectioned source steps must have an explicit inventory group');
  const unmappedBrowse = sourceScan.locator('.atlas-scan-section').nth(1);
  const unmappedSummary = await unmappedBrowse.locator('.atlas-scan-section-summary').innerText();
  assert.ok(unmappedSummary.includes('Unmapped / unsectioned source steps') && unmappedSummary.includes('1 source steps'), 'the unmapped group must report its step count');
  await unmappedBrowse.locator('.atlas-scan-section-summary').evaluate(el => el.click());
  assert.equal(await unmappedBrowse.locator('.atlas-scan-section-summary').getAttribute('aria-expanded'), 'true');
  const unmappedText = await unmappedBrowse.innerText();
  assert.ok(unmappedText.includes('Supplemental observation') && unmappedText.includes('S3 · p. 4'), 'the unmapped inventory must expose its source title and ID/page');
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
  await sourceScan.locator('.atlas-scan-row').first().evaluate(el => el.click());
  const afterSourceSelection = await page.evaluate(() => {
    const view = document.querySelector('[data-test-atlas="true"]');
    const scan = view && view.querySelector('.atlas-source-scan');
    const body = scan && scan.querySelector('.atlas-source-scan-body');
    return {
      url: location.href,
      viewPresent: !!view,
      scanPresent: !!scan,
      scanBodyHidden: body ? body.hidden : null,
      searchPresent: !!(scan && scan.querySelector('.atlas-scan-search')),
      activeNode: window.__atlasUITest && window.__atlasUITest.atlas.selectedNodeId
    };
  });
  console.log('ATLAS_AFTER_SOURCE_SELECTION', JSON.stringify(afterSourceSelection));
  assert.equal(await page.locator('.atlas-source-trail').getAttribute('open'), '', 'a source search must open the concept source trail');
  const firstSourceTrailStep = await page.locator('.atlas-source-step[open]').innerText();
  assert.ok(firstSourceTrailStep.includes('S1') && firstSourceTrailStep.includes('Membrane boundary'), 'the exact selected source step must expand in the source trail');
  assert.match(await page.locator('.atlas-source-trail').innerText(), /Membrane permeability diagram.*F1.*p\. 3.*S2/i, 'the concept trail must expose the exact indexed source figure, page and linked step');
  const sourceVisualDisclosure = page.locator('.atlas-source-visual');
  await sourceVisualDisclosure.locator('summary').click();
  assert.equal(await sourceVisualDisclosure.getAttribute('open'), '', 'the structured visual source record should expand on demand');
  assert.match(await sourceVisualDisclosure.innerText(), /Yield by treatment.*pptx-chart-s3-1.*Slide 3.*S2.*Grain yield: Control = 3\\.2; Fertiliser = 4\\.8/is, 'the expanded concept source trail must reveal structured chart values and their linked source slide');
  const visualTabs = page.locator('.atlas-visual-path-tab');
  assert.equal(await visualTabs.count(), 2, 'the concept pathway must expose its two ordered visual stages');
  assert.match(await visualTabs.nth(0).innerText(), /ORIENTATION.*Yield by treatment/i);
  const firstVisualStage = page.locator('.atlas-visual-path-panel');
  assert.equal(await firstVisualStage.locator('.atlas-visual-path-figure .fig-bars').count(), 1, 'the evidence stage must render its native source-chart figure');
  assert.match(await firstVisualStage.innerText(), /Reconstructed from source visual pptx-chart-s3-1.*slide 3.*S2/i);
  assert.equal(await firstVisualStage.locator('.fig-bad').count(), 0, 'the source-derived figure must validate and render without an error');
  await visualTabs.nth(1).click();
  assert.match(await firstVisualStage.innerText(), /MECHANISM.*Transport mechanism.*route and the direction/i);
  assert.equal(await firstVisualStage.locator('.atlas-visual-path-figure .fig-flow').count(), 1, 'the learner must be able to switch to the separate mechanism view');
  await visualTabs.nth(0).click();
  assert.equal(await firstVisualStage.locator('.atlas-visual-path-figure .fig-bars').count(), 1, 'switching back must restore the earlier source-evidence view');
  assert.equal(await scanSearch.isVisible(), true, 'the source scan must remain expanded after opening a concept');
  assert.equal(await scanSearch.inputValue(), 'selective permeability', 'the previous source query must survive concept selection');
  await scanSearch.fill('Flux relation');
  assert.equal(await sourceScan.locator('.atlas-scan-row').count(), 1, 'an equation step must be searchable by its source title');
  assert.match(await sourceScan.locator('.atlas-scan-row').first().innerText(), /equation \/ derivation/i);
  await sourceScan.locator('.atlas-scan-row').first().evaluate(el => el.click());
  const secondSourceTrailStep = await page.locator('.atlas-source-step[open]').innerText();
  assert.ok(secondSourceTrailStep.includes('S2') && secondSourceTrailStep.includes('Flux relation'), 'a second search must jump to its exact source step');
  await scanSearch.fill('Supplemental observation');
  assert.equal(await sourceScan.locator('.atlas-scan-row').count(), 1, 'unsectioned steps must remain searchable');
  assert.match(await sourceScan.locator('.atlas-scan-row').first().innerText(), /S3.*page not indexed|S3.*p\. 4/i);
  await sourceScan.locator('.atlas-scan-row').first().evaluate(el => el.click());
  const unmappedSourceTrailStep = await page.locator('.atlas-source-step[open]').innerText();
  assert.ok(unmappedSourceTrailStep.includes('S3') && unmappedSourceTrailStep.includes('Supplemental observation'));
  const afterUnmappedSelection = await page.evaluate(() => {
    const view = document.querySelector('[data-test-atlas="true"]');
    const scan = view && view.querySelector('.atlas-source-scan');
    const body = scan && scan.querySelector('.atlas-source-scan-body');
    return {
      viewPresent: !!view,
      scanPresent: !!scan,
      scanBodyHidden: body ? body.hidden : null,
      searchPresent: !!(scan && scan.querySelector('.atlas-scan-search')),
      query: scan && scan.querySelector('.atlas-scan-search') && scan.querySelector('.atlas-scan-search').value,
      activeNode: window.__atlasUITest && window.__atlasUITest.atlas.selectedNodeId,
      selectedStep: window.__atlasUITest && window.__atlasUITest.atlas.selectedSourceStepId
    };
  });
  assert.equal(afterUnmappedSelection.scanPresent, true, 'selecting an unsectioned source result must keep the source scan mounted');
  assert.equal(afterUnmappedSelection.scanBodyHidden, false, 'selecting an unsectioned source result must keep the source scan expanded');
  assert.equal(afterUnmappedSelection.searchPresent, true, 'selecting an unsectioned source result must keep the source search field mounted');
  const currentScanSearch = page.locator('.atlas-source-scan .atlas-scan-search');
  await currentScanSearch.fill('a diagram showing a selective boundary');
  assert.equal(await sourceScan.locator('.atlas-scan-row').count(), 1, 'figure captions must be searchable through their linked source step');
  const figureResult = await sourceScan.locator('.atlas-scan-row').first().innerText();
  assert.ok(figureResult.includes('Flux relation') && figureResult.includes('S2') && figureResult.includes('p. 3'), 'the figure-caption result must retain its linked source title, ID and page even when the subsection label appears between them');
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
    const reviewSchedules = {
      'locus-one': { id: 'review-one', due: Date.now(), interval: 1, attempts: 0, history: [] },
      'locus-two': { id: 'review-two', due: Date.now(), interval: 1, attempts: 0, history: [] }
    };
    const ratings = [];
    let saves = 0;
    hub.showMemoryRoute({
      bookId: app.lib.books[0].id,
      partId: 'memory-test-part',
      atlas,
      initialNodeId: 'locus-one',
      reviewSchedules,
      onGradeRecall: async (nodeId, recalled) => {
        const current = reviewSchedules[nodeId];
        const interval = recalled ? Math.min(120, Math.max(2, current.interval * 2.5)) : 1;
        const next = {
          ...current,
          interval,
          attempts: current.attempts + 1,
          history: [...current.history, recalled ? 1 : 0].slice(-12),
          lastRating: recalled ? 'recalled' : 'again',
          due: Date.now() + interval * 864e5
        };
        reviewSchedules[nodeId] = next;
        ratings.push({ nodeId, recalled });
        return next;
      },
      onSave: () => { saves++; }
    });
    const openRoute = () => hub.showMemoryRoute({
      bookId: app.lib.books[0].id,
      partId: 'memory-test-part',
      atlas,
      initialNodeId: 'locus-one',
      reviewSchedules,
      onGradeRecall: async (nodeId, recalled) => {
        const current = reviewSchedules[nodeId];
        const interval = recalled ? Math.min(120, Math.max(2, current.interval * 2.5)) : 1;
        const next = {
          ...current,
          interval,
          attempts: current.attempts + 1,
          history: [...current.history, recalled ? 1 : 0].slice(-12),
          lastRating: recalled ? 'recalled' : 'again',
          due: Date.now() + interval * 864e5
        };
        reviewSchedules[nodeId] = next;
        ratings.push({ nodeId, recalled });
        return next;
      },
      onSave: () => { saves++; }
    });
    window.__lociUITest = { atlas, reviewSchedules, ratings, getSaves: () => saves, openRoute };
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
  assert.match(await memoryPanel.locator('.memory-route-schedule').innerText(), /Due today/i);
  await memoryPanel.getByRole('button', { name: 'Needs another pass' }).click();
  assert.match(await memoryPanel.locator('.memory-route-schedule').innerText(), /Due tomorrow/i, 'a learner-rated difficult recall should return after one day');
  assert.match(await memoryPanel.locator('.memory-route-schedule').innerText(), /Current interval · 1 day/i);
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
  await memoryPanel.getByRole('button', { name: 'Recalled accurately' }).click();
  assert.match(await memoryPanel.locator('.memory-route-schedule').innerText(), /Due in 3 days/i, 'accurate recall should expand the interval');
  assert.match(await memoryPanel.locator('.memory-route-schedule').innerText(), /Current interval · 2.5 days/i);
  await memoryPanel.locator('.memory-route-footer button').nth(1).click();
  assert.match(await memoryPanel.locator('.memory-route-question').innerText(), /What changes if the route is removed/i);
  await memoryPanel.locator('.memory-route-footer button').nth(0).click();
  assert.match(await memoryPanel.innerText(), /The boundary permits only the movements supported by its available routes/i, 'revealed recall state must persist when returning to a route stop');
  await memoryPanel.getByRole('button', { name: 'Move this place later' }).click();
  assert.match(await memoryPanel.locator('.memory-route-heading').innerText(), /Selective boundary/i, 'reordering must keep the same place selected');
  const routeOrder = await page.evaluate(() => window.__lociUITest.atlas.memoryPlaces.map(p => p.nodeId));
  assert.deepEqual(routeOrder, ['locus-two', 'locus-one'], 'the learner-defined order must be saved on the atlas');
  const lociSaves = await page.evaluate(() => window.__lociUITest.getSaves());
  assert.ok(lociSaves >= 7, 'the route must flush both recall attempts, self-ratings and explicit route order');
  const persistedReview = await page.evaluate(() => window.__lociUITest.atlas.memoryPlaces.find(p => p.nodeId === 'locus-one').review);
  assert.equal(persistedReview.committed, true);
  assert.equal(persistedReview.revealed, true);
  assert.equal(persistedReview.rating, 'recalled');
  assert.equal(persistedReview.history.length, 1, 'the prior recall attempt must survive a second attempt');
  assert.equal(persistedReview.history[0].rating, 'again');
  const scheduleState = await page.evaluate(() => ({
    interval: window.__lociUITest.reviewSchedules['locus-one'].interval,
    history: window.__lociUITest.reviewSchedules['locus-one'].history,
    ratings: window.__lociUITest.ratings
  }));
  assert.equal(scheduleState.interval, 2.5);
  assert.deepEqual(scheduleState.history, [0, 1]);
  assert.deepEqual(scheduleState.ratings, [{ nodeId: 'locus-one', recalled: false }, { nodeId: 'locus-one', recalled: true }]);
  // Simulate the review becoming due after the learner has already seen and rated its answer.
  // Re-entering the route must archive the previous attempt and hide its answer until a new prediction.
  await page.evaluate(() => { window.__lociUITest.reviewSchedules['locus-one'].due = Date.now() - 1; });
  await page.evaluate(() => window.__scriptorium.mode.closeMemoryRoute());
  assert.equal(await memoryPanel.count(), 0, 'closing a route must remove its panel');
  await page.evaluate(() => window.__lociUITest.openRoute());
  const duePanel = page.locator('.memory-route-panel');
  await duePanel.waitFor();
  assert.equal(await duePanel.locator('.memory-route-response').inputValue(), '', 'a due revisit must clear the previous response');
  assert.equal(await duePanel.locator('.memory-route-response').isDisabled(), false, 'a due revisit must return to an answerable recall prompt');
  assert.equal(await duePanel.locator('.memory-route-feedback.expected').count(), 0, 'a due revisit must hide the previously revealed answer');
  assert.equal(await duePanel.getByRole('button', { name: 'Reveal expected reconstruction' }).count(), 0, 'the previous answer cannot be revealed before a fresh attempt is committed');
  const dueHistory = await page.evaluate(() => window.__lociUITest.atlas.memoryPlaces.find(p => p.nodeId === 'locus-one').review.history);
  assert.equal(dueHistory.length, 2, 'the due revisit must retain both previous attempts');
  assert.equal(dueHistory[1].rating, 'recalled', 'the prior self-rating must remain attached to its archived attempt');

  // A fresh due attempt can reveal its answer and then be self-rated without the due-reset logic
  // clearing that just-revealed answer on the same route session.
  await duePanel.locator('.memory-route-response').fill('Movement depends on an available route.');
  await duePanel.locator('.memory-route-confidence').selectOption('High');
  await duePanel.getByRole('button', { name: 'Commit recall' }).click();
  await duePanel.getByRole('button', { name: 'Reveal expected reconstruction' }).click();
  assert.equal(await duePanel.locator('.memory-route-feedback.expected').count(), 1, 'the new answer remains visible after its reveal');
  assert.equal(await duePanel.getByRole('button', { name: 'Recalled accurately' }).count(), 1, 'the fresh answer remains available for self-rating');

  // Leave that fresh answer unrated, then reopen the route: the next due session must hide it
  // again and archive the unrated response rather than leaking the previous answer.
  await page.evaluate(() => window.__scriptorium.mode.closeMemoryRoute());
  await page.evaluate(() => window.__lociUITest.openRoute());
  const nextDuePanel = page.locator('.memory-route-panel');
  await nextDuePanel.waitFor();
  assert.equal(await nextDuePanel.locator('.memory-route-response').inputValue(), '', 'an unrated due attempt is archived and reset on the next route entry');
  assert.equal(await nextDuePanel.locator('.memory-route-feedback.expected').count(), 0, 'an unrated previous answer is also hidden on the next due entry');
  const secondDueHistory = await page.evaluate(() => window.__lociUITest.atlas.memoryPlaces.find(p => p.nodeId === 'locus-one').review.history);
  assert.equal(secondDueHistory.length, 3);
  assert.equal(secondDueHistory[2].rating, null, 'the unrated response must be retained as an ungraded attempt');
  assert.equal(secondDueHistory[2].response, 'Movement depends on an available route.');
  await page.evaluate(() => window.__scriptorium.mode.closeMemoryRoute());
  assert.deepEqual(errors, [], 'loci assignment and route interactions must not create browser errors');

  console.log('PASS  atlas UI: horizontal branches, arrow navigation, committed prediction, one-unit UNFOLD, Space, Ctrl+Z, drafts, locked predictions, source labels, per-branch persistence, loci recall, self-rated due scheduling, learner-controlled route order and source-index search');
} finally {
  await browser.close();
}
