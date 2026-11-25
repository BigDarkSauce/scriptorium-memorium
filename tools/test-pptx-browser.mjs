#!/usr/bin/env node
// End-to-end browser test of the real PPTX ZIP -> ordered slide text/notes/chart/SmartArt -> embedded image path.
// Uses JSZip already loaded by the app and a synthetic but structurally valid Open XML package.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const URL0 = process.argv[2] || process.env.PPTX_TEST_URL || 'http://127.0.0.1:8000/';
async function loadPlaywright() {
  try { return await import('playwright'); } catch (e) {}
  try {
    const root = execSync('npm root -g', { encoding: 'utf8' }).trim();
    return createRequire(root + '/noop.js')('playwright');
  } catch (e) {}
  throw new Error('Playwright is not installed');
}
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
try {
  await page.goto(URL0, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.JSZip && window.JSZip.loadAsync, null, { timeout: 30000 });
  const result = await page.evaluate(async () => {
    const { splitPresentation, extractPresentationFigures, presentationSections } = await import('/js/ai/ingest.js');
    const zip = new window.JSZip();
    const put = (path, content) => zip.file(path, content);
    put('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide7.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
  <Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`);
    put('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst>
</p:presentation>`);
    put('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide7.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
</Relationships>`);
    put('ppt/slides/slide7.xml', `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram">
  <p:cSld><p:spTree>
    <p:sp><p:nvSpPr><p:cNvPr id="1" name="Title"/><p:nvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Leaf anatomy</a:t></a:r></a:p></p:txBody></p:sp>
    <p:sp><p:nvSpPr><p:cNvPr id="2" name="Body"/><p:nvSpPr/><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>The vascular bundle transports water and sugars.</a:t></a:r></a:p></p:txBody></p:sp>
    <p:pic><p:nvPicPr><p:cNvPr id="3" name="Leaf picture" descr="A labelled leaf cross-section"/></p:nvPicPr><p:blipFill><a:blip r:embed="rImg"/></p:blipFill></p:pic>
    <p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="4" name="Yield chart" descr="Yield by treatment"/></p:nvGraphicFramePr><c:chart r:id="rChart"/></p:graphicFrame>
    <p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="5" name="Process diagram" descr="Photosynthesis sequence"/></p:nvGraphicFramePr><dgm:relIds r:dm="rDiagram"/></p:graphicFrame>
  </p:spTree></p:cSld>
</p:sld>`);
    put('ppt/slides/slide2.xml', `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="1" name="Title"/><p:nvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Stomatal control</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`);
    put('ppt/slides/_rels/slide7.xml.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rImg" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/leaf.png"/>
  <Relationship Id="rChart" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/>
  <Relationship Id="rDiagram" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramData" Target="../diagrams/data1.xml"/>
  <Relationship Id="rNotes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/>
</Relationships>`);
    put('ppt/slides/_rels/slide2.xml.rels', `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`);
    put('ppt/notesSlides/notesSlide1.xml', `<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="1" name="Notes"/><p:nvSpPr/><p:nvPr><p:ph type="body"/></p:nvPr></p:nvSpPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Instructor note: compare xylem and phloem transport.</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:notes>`);
    put('ppt/charts/chart1.xml', `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:chart><c:title><c:tx><c:rich><a:p><a:r><a:t>Yield by treatment</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:barChart><c:ser><c:tx><c:strRef><c:strCache><c:pt idx="0"><c:v>Grain yield</c:v></c:pt></c:strCache></c:strRef></c:tx><c:cat><c:strRef><c:strCache><c:pt idx="0"><c:v>Control</c:v></c:pt><c:pt idx="1"><c:v>Fertiliser</c:v></c:pt></c:strCache></c:strRef></c:cat><c:val><c:numRef><c:numCache><c:pt idx="0"><c:v>3.2</c:v></c:pt><c:pt idx="1"><c:v>4.8</c:v></c:pt></c:numCache></c:numRef></c:val></c:ser></c:barChart></c:plotArea></c:chart></c:chartSpace>`);
    put('ppt/diagrams/data1.xml', `<dgm:dataModel xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><dgm:ptLst><dgm:pt modelId="n1" type="node"><dgm:sp><a:p><a:r><a:t>Light capture</a:t></a:r></a:p></dgm:sp></dgm:pt><dgm:pt modelId="n2" type="node"><dgm:sp><a:p><a:r><a:t>Carbon fixation</a:t></a:r></a:p></dgm:sp></dgm:pt></dgm:ptLst><dgm:cxnLst><dgm:cxn modelId="e1" type="parOf" srcId="n1" destId="n2"/></dgm:cxnLst></dgm:dataModel>`);
    const canvas = document.createElement('canvas');
    canvas.width = 2; canvas.height = 2;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#287a4b'; ctx.fillRect(0, 0, 2, 2);
    const png = await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create PNG fixture')), 'image/png'));
    put('ppt/media/leaf.png', new Uint8Array(await png.arrayBuffer()));

    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    const file = new File([bytes], 'source-fixture.pptx', { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
    const parsed = await splitPresentation(file);
    const part = parsed.parts[0];
    const extracted = await extractPresentationFigures(file, 1, 2);
    const sections = await presentationSections(null, part);
    return {
      sourceType: parsed.sourceType,
      pages: parsed.pages,
      slideTitles: part.subsections.map(x => x.title),
      slideTexts: part.subsections.map(x => x.text),
      sectionText: sections.text,
      figures: extracted.map(x => ({ id: x.id, label: x.label, caption: x.caption, slide: x.slide, page: x.page, mediaPath: x.mediaPath, dataUrlPrefix: x.dataUrl.slice(0, 24) })),
      figureMeta: (await import('/js/ai/ingest.js')).figureMeta(extracted)
    };
  });
  assert.equal(result.sourceType, 'pptx');
  assert.equal(result.pages, 2);
  assert.deepEqual(result.slideTitles, ['Leaf anatomy', 'Stomatal control'], 'slide order must follow presentation.xml relationships, not filename order');
  assert.match(result.slideTexts[0], /vascular bundle transports water and sugars/i);
  assert.match(result.slideTexts[0], /Instructor note: compare xylem and phloem/i);
  assert.match(result.slideTexts[0], /Yield by treatment/);
  assert.match(result.slideTexts[0], /Control = 3.2/);
  assert.match(result.slideTexts[0], /Fertiliser = 4.8/);
  assert.match(result.slideTexts[0], /Light capture/);
  assert.match(result.slideTexts[0], /Carbon fixation/);
  assert.match(result.slideTexts[0], /n1 → n2/);
  assert.match(result.sectionText, /\(slide 1\)/);
  assert.equal(result.figures.length, 1);
  assert.equal(result.figures[0].id, 'fig-s1-1');
  assert.equal(result.figures[0].slide, 1);
  assert.equal(result.figures[0].page, 1);
  assert.equal(result.figures[0].mediaPath, 'ppt/media/leaf.png');
  assert.match(result.figures[0].label, /labelled leaf cross-section/i);
  assert.match(result.figures[0].dataUrlPrefix, /^data:image\/(jpeg|png);base64,/);
  assert.equal(result.figureMeta[0].mediaPath, 'ppt/media/leaf.png');
  assert.equal(result.figureMeta[0].slide, 1);
  assert.deepEqual(errors, [], 'the browser page must not emit JavaScript exceptions');

  console.log('PASS  real browser PPTX integration: ordered slides, shape text, speaker notes, chart cache, SmartArt graph, embedded image pixels and provenance');
} finally {
  await browser.close();
}
