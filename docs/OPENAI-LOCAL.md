# OpenAI-first local engine

Scriptorium's primary authoring engine is OpenAI. The standalone local server proxies requests to OpenAI; browser code never receives the API key. The app currently defaults to GPT-6.2 Astra (`gpt-6.2-astra`) and uses the Responses API with the live `web_search` tool. Other configured providers remain automatic fallbacks.

## Quick start on Windows

1. Create an API key in your OpenAI Platform account. API usage is billed separately from a ChatGPT subscription.
2. Double-click **Launch Scriptorium with OpenAI.bat**.
3. Paste the key into the hidden PowerShell prompt.
4. The launcher starts Scriptorium and opens `http://localhost:8000`. Keep its server window open for the whole session.
5. Add a PDF or PowerPoint presentation (`.pptx`) and choose **Add and analyse**. OpenAI is the primary model route; enabled providers take over if the local OpenAI endpoint is not configured or cannot be reached.

The key is held in the launcher/server process environment for that run. It is not written to a config file, browser localStorage, URL, JavaScript bundle or Git repository. The launch script clears the temporary environment variables when the server exits.

## Manual launch

Set environment variables in the same terminal that starts the Python server:

```powershell
$env:OPENAI_API_KEY = Read-Host 'OpenAI API key'
$env:OPENAI_MODEL = 'gpt-6.2-astra'
python launcher/serve.py 8000
```

Or on macOS/Linux:

```bash
read -s OPENAI_API_KEY
export OPENAI_API_KEY
export OPENAI_MODEL=gpt-6.2-astra
python3 launcher/serve.py 8000
```

Then open `http://localhost:8000`. Do not commit a key or paste it into the provider settings form.

## Local endpoints

Both `launcher/serve.py` and the PowerShell fallback `launcher/serve.ps1` expose the same-origin, localhost-only routes:

- `GET /__openai/info` — reports whether a key is configured, the selected model and the key's storage location. It never returns the key.
- `GET /__openai/v1/models` — exposes the selected model to the app's model router.
- `POST /__openai/v1/responses` — proxies Responses API input, web-search tool configuration, JSON mode and optional image input.
- `POST /__openai/v1/chat/completions` — compatibility path for Chat Completions clients.

The adapter verifies same-origin browser requests, limits request bodies to 24 MB, sends the key only to `https://api.openai.com` over HTTPS, and streams the upstream result. It is not a general-purpose URL proxy. The server listener is bound to localhost.

## Verify the local proxy without an API key

The proxy has an offline HTTP integration suite. It starts the real local request handler and stubs only the outbound
OpenAI transport, so it does not contact OpenAI or incur API charges:

```bash
python -m py_compile launcher/serve.py tools/test-openai-proxy.py
python tools/test-openai-proxy.py
```

The suite checks that the information and model routes never return the secret, that Responses and Chat Completions
requests reach only their fixed OpenAI endpoints, that streamed bytes and upstream error statuses are preserved,
and that missing keys, malformed payloads, oversized bodies, cross-origin requests, untrusted Host headers and
unknown routes are rejected. The same checks run in GitHub Actions on the feature branch and its pull request.

## How the AI now builds a room

The new authoring workflow is staged rather than asking for one enormous scene dump:

1. **Local source extraction.** PDF.js reads PDF text, typography, hierarchy, page locations and figure regions. The PPTX parser follows the actual Open XML slide order, extracts text, notes and accessibility descriptions, resolves each slide's embedded images, and recovers cached chart values plus SmartArt labels and connections.
2. **Source inventory.** The app retains subsection/slide IDs, text, page/slide spans, figures and inventories. Those units are source evidence, not assumed to be the right conceptual chunks.
3. **Grounded reasoning chain.** The current chapter prompt derives a detailed chain of definitions, mechanisms, explanations, quantities and evidence from the source. Existing source-coverage and quality checks detect dropped or coarse material and request targeted repairs.
4. **Diorama planning and authoring.** The explanatory compiler routes each concept to an appropriate visual grammar. Spatial, temporal and causal mechanisms can become 3D scenes; intrinsically abstract or argumentative structures remain 2D diagrams rather than receiving decorative 3D treatment.
5. **Semantic atlas.** The model groups validated step IDs across subsections into coherent concept nodes, proposes meaningful typed edges and assigns each step to exactly one node. A strict validator checks that the atlas partitions every source step and that every edge points to an existing node.
6. **Grouped visual authoring.** Where a node needs 3D, the authoring pipeline creates a grouped diorama sequence from the node's visual plan, uses the existing scene specification, and runs the existing scene-plan checks and critique.
7. **Learner reconstruction.** The concept map includes prediction-before-reveal tasks: structural, mechanistic, temporal, explanatory, relational and counterfactual incompleteness. A learner commits an answer and confidence before the answer and explanatory feedback are revealed.
8. **Source audit.** Nodes retain source step IDs, subsection IDs, page/slide locations and figure IDs. OpenAI web-search calls and returned URL citations are logged separately from uploaded-source evidence.

A concept node is not a page summary. A single concept may cross multiple slides or subsections; one slide may contain several separate concepts. The semantic model decides groupings from meaning, mechanism, dependency and explanatory purpose. The validator checks coverage and relationship integrity, not whether every semantic interpretation is necessarily correct.

## Research and supplementation

OpenAI requests use the Responses API with the `web_search` tool available. The model can invoke it where external evidence or a current/specialist detail genuinely helps. The response parser records the tool-call count and returned URL citation annotations. The atlas shows those external references separately from PDF/PPTX source evidence.

The search tool is not invoked for every stage or every claim. It is available to the model and invoked when useful; a response with no returned citations is labelled as having no web-search citations. Do not treat a prompt that merely says “search the web” as evidence that a search occurred.

Other providers in the fallback pool keep their own request path and constraints. They do not automatically inherit OpenAI's native `web_search` tool. The legacy embedded-host adapter is retained only for compatibility; it is not part of the normal local authoring path.

## Model, latency and cost

The default is GPT-6.2 Astra, selected for difficult reasoning and code/scene authoring. You can change `OPENAI_MODEL` in `launcher/launch-openai.ps1` or set it in the environment before starting the server. Model availability, pricing and limits can change; check the current [OpenAI model catalogue](https://developers.openai.com/api/docs/models) and [API pricing](https://openai.com/api/pricing/).

A complete chapter can make multiple requests: chain writing, targeted repairs, missing figures, diorama storyboards, scene authoring, critique, semantic atlas, and possibly learner-requested additional scenes. It can therefore be significantly more expensive than one chat response. Monitor usage in the OpenAI Platform. ChatGPT Plus/Pro/etc. subscriptions do not include OpenAI API usage.

## Regression coverage

CI includes both a pure Open XML unit test and a real-browser synthetic-deck test. The browser test constructs a small PowerPoint ZIP in Chromium and calls the same `splitPresentation`, `presentationSections` and `extractPresentationFigures` functions used by the app. It checks that presentation order is taken from relationships rather than slide filenames, notes and chart/SmartArt structures are retained, and image bytes are decoded with slide/media provenance. It does not send those images to an external model.

## Honest extraction limits

- **PPTX embedded images:** package-internal images actually referenced by a slide are extracted, compressed and attached to the chapter-authoring request when the selected model accepts image input and the configured image limit permits it. Each image retains its slide number, media path, and accessible label/caption where present. This does not mean every picture is interpreted: image attachments are bounded by per-image, per-part and total-byte limits, and a text-only provider cannot inspect their pixels.
- **PPTX charts and SmartArt:** cached chart series values and SmartArt node labels/connections are extracted from their Open XML parts and added to the relevant slide's source text. Chart formulas are not recalculated from the linked workbook, uncached values are not invented, and the original chart styling is not reconstructed. Unsupported vector shapes, embedded objects and video are not yet visually rendered or interpreted. External linked images are not fetched.
- **No silent image guessing:** when a slide is predominantly visual and there is no extractable caption or alt text, its attached image can be inspected by a vision-capable authoring model; otherwise the source record remains explicit about the missing visual interpretation.
- **PDF figures:** the existing PDF extractor crops figure regions, but an AI model only receives images where the selected model supports image input and the app's image limit allows it.
- **Semantic accuracy:** a strict coverage check can prove that every source step was assigned once; it cannot prove that the inferred concepts or causal edges are all true. The audit records uncertainties and marks deterministic subsection fallback when semantic clustering fails.
- **Diorama quality:** scene schema validation and the storyboard critique catch structural omissions, not every domain error. Review high-stakes scientific, medical, engineering or quantitative simulations.
- **Incomplete reveals:** the six types are selected only where the chapter supports a meaningful prediction. Structural challenges can hide specific mapped actor IDs where the scene provides them. Other challenge types currently use a prediction/reveal interaction and then link back to the complete scene; they do not all yet have a bespoke dynamically paused scene state.
- **Research attribution:** web citations are stored at chapter level when returned by the Responses API. They are not automatically asserted as evidence for every individual concept. To claim a source supports a particular node, the model must also attach that source to the relevant step/node.

## References consulted

- [OpenAI API models](https://developers.openai.com/api/docs/models)
- [OpenAI Responses API](https://developers.openai.com/api/docs/guides/migrate-to-responses)
- [OpenAI web search tool](https://developers.openai.com/api/docs/guides/tools-web-search)
- [OpenAI API key safety](https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety)
- [Three.js documentation](https://threejs.org/docs/)
