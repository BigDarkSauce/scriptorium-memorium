# OpenAI local engine

The standalone Scriptorium server can call the OpenAI API through a same-origin adapter. The browser sends requests to the local server; it never sees the OpenAI API key.

## Quick start (Windows)

1. Create an API key in your OpenAI Platform account. API usage is billed separately from a ChatGPT subscription.
2. Double-click **Launch Scriptorium with OpenAI.bat**.
3. Paste the key into the hidden PowerShell prompt. The key is held in the launcher process environment only.
4. Open the AI settings panel. **OpenAI · local secure relay** is enabled by default and is tried before the other providers.
5. Add a PDF or presentation-derived PDF and run the analysis.

The launcher sets `OPENAI_MODEL=gpt-6.2-astra`. The model can be changed by editing that value in `launcher/launch-openai.ps1`, or by setting the environment variable before launching `launcher/serve.py`.

## Manual launch

Set environment variables in the same terminal that starts Scriptorium:

```powershell
$env:OPENAI_API_KEY = Read-Host 'OpenAI API key'
$env:OPENAI_MODEL = 'gpt-6.2-astra'
python launcher/serve.py 8000
```

Then open `http://localhost:8000`. Keep the server terminal open. Do not commit a key, add it to a config file, or paste it into the AI settings form.

The Python server and PowerShell fallback server expose:
- `GET /__openai/info` — whether a key is configured and which model is selected (never the key).
- `GET /__openai/v1/models` — the configured model ID for the app's model router.
- `POST /__openai/v1/chat/completions` — same-origin streaming proxy to OpenAI Chat Completions.

The adapter checks request origin, imposes a 24 MB request-body ceiling, uses HTTPS upstream, and adds the bearer key server-side. It does not expose a general-purpose proxy route. The listener is bound to localhost.

## Model choice and cost

GPT-6.2 Astra is the default because OpenAI currently documents it as its flagship model for demanding reasoning and coding. It supports Chat Completions and the Responses API. Scriptorium currently uses Chat Completions because its existing pipeline expects streamed JSON chat messages. A chapter can invoke several AI calls (chain, repairs, figure design, diorama planning and scene authoring, semantic atlas, and custom dioramas). Monitor API usage and cost in the OpenAI Platform dashboard. The existing provider router can fall back to other configured providers if the local endpoint is unavailable.

## What happens to a document

The browser extracts PDF text and page/figure metadata locally with pdf.js. The app sends the relevant chapter text, figure metadata and (when supported by the selected model) a limited set of figure images to the configured provider. The OpenAI adapter streams the request to OpenAI. The app stores derived analyses in the browser's IndexedDB. Review your provider's current data-use and retention terms before uploading sensitive material.

## Honest limits

- An AI-generated concept atlas is a validated grouping proposal, not a proof that a model has perfectly understood every topic.
- The app's source index records the PDF subsection, page, figure and step mappings that it actually has. Missing page references remain listed as missing; the software does not invent a page.
- The six kinds of incompleteness are selected where the source permits a meaningful prediction. They are not forced into every topic.
- An external research citation is only labelled as external evidence when the AI returns a reference that can be stored and checked. The local OpenAI chat route in this version does not itself perform a web search. Claude's connected research tools remain a separate optional path; OpenAI's native web search tool requires the Responses API and is not yet wired into this chat-completions adapter.
- A visually rich scene can still be conceptually wrong. Each diorama retains source step IDs and is checked against the app's existing scene schema and teaching-plan checks, but automated checks are not a substitute for subject-matter review.

## References consulted for this integration

- OpenAI API models and the GPT-6.2 Astra model ID: https://developers.openai.com/api/docs/models
- OpenAI API changelog, including November 17 2026 Chat Completions support for GPT-6.2 Astra and Sol: https://developers.openai.com/api/docs/changelog
- OpenAI API key safety guidance: https://help.openai.com/en/articles/5112595-best-practices-for-api-key-safety
- Three.js documentation: https://threejs.org/docs/
