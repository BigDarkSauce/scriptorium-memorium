import assert from 'node:assert/strict';
import { pptxSlideAssets, pptxChartSummary, pptxDiagramSummary, resolvePptTarget } from '../js/ai/pptx.js';
import { sectionList, figureList, chapterPrompt } from '../js/ai/prompts.js';
import { sourcePointLabel, sourcePointsLabel, sourceRangeLabel } from '../js/room/source-label.js';

const slidePath = 'ppt/slides/slide3.xml';
const rels = `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image2.png"/>
  <Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart2.xml"/>
  <Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramData" Target="../diagrams/data1.xml"/>
  <Relationship Id="rId8" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="https://example.test/linked.png" TargetMode="External"/>
  <Relationship Id="rIdUnused" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/unused.png"/>
</Relationships>`;
const slide = `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram">
  <p:pic><p:nvPicPr><p:cNvPr id="4" name="Picture 4" descr="A labelled cross-section of a leaf"/></p:nvPicPr><p:blipFill><a:blip r:embed="rId5"/></p:blipFill></p:pic>
  <p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="5" name="Chart 5" descr="Annual yield by treatment"/></p:nvGraphicFramePr><c:chart r:id="rId6"/></p:graphicFrame>
  <p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="6" name="Diagram 6" descr="The feedback cycle"/></p:nvGraphicFramePr><dgm:relIds r:dm="rId7"/></p:graphicFrame>
  <p:pic><p:nvPicPr><p:cNvPr id="7" name="External picture"/></p:nvPicPr><p:blipFill><a:blip r:link="rId8"/></p:blipFill></p:pic>
</p:sld>`;
const refs = pptxSlideAssets(slide, rels, slidePath, 3);
assert.equal(resolvePptTarget(slidePath, '../media/image2.png'), 'ppt/media/image2.png');
assert.equal(refs.images.length, 1, 'only referenced, embedded images are admitted');
assert.equal(refs.images[0].path, 'ppt/media/image2.png');
assert.equal(refs.images[0].caption, 'A labelled cross-section of a leaf');
assert.equal(refs.images[0].slide, 3);
assert.equal(refs.charts.length, 1);
assert.equal(refs.charts[0].path, 'ppt/charts/chart2.xml');
assert.equal(refs.charts[0].caption, 'Annual yield by treatment');
assert.equal(refs.diagrams.length, 1);
assert.equal(refs.diagrams[0].path, 'ppt/diagrams/data1.xml');
assert.equal(refs.diagrams[0].caption, 'The feedback cycle');

const chart = `<c:chartSpace xmlns:c="c" xmlns:a="a"><c:chart><c:title><c:tx><c:rich><a:p><a:r><a:t>Yield by treatment</a:t></a:r></a:p></c:rich></c:tx></c:title><c:plotArea><c:barChart><c:ser>
  <c:tx><c:strRef><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>Grain yield</c:v></c:pt></c:strCache></c:strRef></c:tx>
  <c:cat><c:strRef><c:strCache><c:pt idx="0"><c:v>Control</c:v></c:pt><c:pt idx="1"><c:v>Fertiliser</c:v></c:pt></c:strCache></c:cat>
  <c:val><c:numRef><c:numCache><c:pt idx="0"><c:v>3.2</c:v></c:pt><c:pt idx="1"><c:v>4.8</c:v></c:pt></c:numCache></c:val>
</c:ser></c:barChart></c:plotArea></c:chart></c:chartSpace>`;
const chartSummary = pptxChartSummary(chart);
assert.match(chartSummary, /Yield by treatment/);
assert.match(chartSummary, /Grain yield/);
assert.match(chartSummary, /Control = 3.2/);
assert.match(chartSummary, /Fertiliser = 4.8/);

const diagram = `<dgm:dataModel xmlns:dgm="d" xmlns:a="a"><dgm:ptLst>
  <dgm:pt modelId="node-1" type="node"><dgm:sp><a:t>Stimulus</a:t></dgm:sp></dgm:pt>
  <dgm:pt modelId="node-2" type="node"><dgm:sp><a:t>Response</a:t></dgm:sp></dgm:pt>
</dgm:ptLst><dgm:cxnLst><dgm:cxn modelId="edge-1" type="parOf" srcId="node-1" destId="node-2"/></dgm:cxnLst></dgm:dataModel>`;
const diagramSummary = pptxDiagramSummary(diagram, 'Feedback cycle');
assert.match(diagramSummary, /Stimulus/);
assert.match(diagramSummary, /Response/);
assert.match(diagramSummary, /node-1 → node-2/);

const slideUnit = { id: 'slide-3', title: 'Plant response', level: 2, startPage: 3, endPage: 3, text: 'A response follows a stimulus.' };
assert.match(sectionList([slideUnit], 'pptx'), /slide 3/);
const figureLabel = figureList([{ id: 'fig-s3-1', label: 'Leaf cross-section', slide: 3, page: 3, caption: 'Vascular bundle' }]);
assert.match(figureLabel, /slide 3/);
const prompt = chapterPrompt({
  book: 'Test deck', chapter: 'Plant response (slides 3–3)', text: slideUnit.text, sourceType: 'pptx',
  sections: [{ ...slideUnit, inventory: { chars: 32 } }],
  figures: [{ id: 'fig-s3-1', label: 'Leaf cross-section', slide: 3, page: 3, caption: 'Vascular bundle' }],
  attached: ['fig-s3-1'], images: 1
});
assert.match(prompt, /\(slide 3\)/);
assert.match(prompt, /FIGURES, TABLES AND EMBEDDED IMAGES FROM THE SOURCE/);
assert.match(prompt, /PowerPoint presentation's own examples/);
assert.equal(sourceRangeLabel({ startPage: 3, endPage: 5 }, 'pptx'), 'slides 3–5');
assert.equal(sourcePointLabel({ page: 3, slide: 3 }, 'pptx'), 'slide 3');
assert.equal(sourcePointsLabel([2, 4], 'pptx'), 'slides 2, 4');
assert.equal(sourcePointLabel({ page: 4 }, 'pdf'), 'p. 4');


console.log('PASS  PowerPoint visual relationships resolve in slide order; linked/unused images are excluded; chart values, SmartArt edges and slide provenance are recoverable');
