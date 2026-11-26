# Set up Scriptorium Memorialium

Scriptorium is a local-first study environment. It turns a PDF or PowerPoint presentation into a source-indexed concept atlas and a sequence of explanatory 2D/3D dioramas.

The supported primary authoring route is **OpenAI through the local Scriptorium server**. You do not need a Claude account, a Claude Artifact or a Claude Desktop extension to use it.

## Windows quick start

1. Download the repository ZIP from [GitHub](https://github.com/BigDarkSauce/scriptorium-memorium) and extract it, or clone the repository.
2. For the OpenAI-first workflow, double-click **Launch Scriptorium with OpenAI.bat**.
3. Paste your OpenAI API key into the hidden prompt. The launcher keeps it in the server process environment for that run; it does not write the key to a file or expose it to the browser.
4. Keep the server window open and use the browser tab opened at `http://localhost:8000`.
5. Add a PDF or `.pptx` presentation in the library and choose **Add and analyse**.

OpenAI API usage is billed separately from a ChatGPT subscription. A full chapter may need several model requests for extraction follow-ups, chain authoring, figure work, diorama plans, scene generation, audits and the semantic atlas. Check your Platform usage before analysing a large book.

### Without an OpenAI key

Double-click **Launch Scriptorium.bat**. The local app still runs and can use any optional fallback providers you configure in the AI settings panel. The quality, vision support, rate limits and data handling of those providers differ; check their current terms before sending a document to them.

## Hosted edition

The intended [Scriptorium Memorialium preview](https://bigdarksauce.github.io/scriptorium-memorium/) becomes available after the repository enables GitHub Actions as its Pages publishing source and the deploy workflow succeeds. It serves the complete browser app and its static resources. The seeded library, 3D dioramas, document import, source atlas, retrieval tools and learner data run in the browser. The browser's IndexedDB is origin-specific: the hosted site's library is separate from localhost and from other browsers. Use the app's **Import / export** action to move room and library data between them.

GitHub Pages is static hosting. It does not run the localhost server and cannot read OPENAI_API_KEY from your computer. For the secure OpenAI-first authoring engine, download the repository and use the local launcher below. The hosted edition can use providers that permit browser-origin requests; provider keys entered in its settings remain in that browser profile, so do not use that route for sensitive documents unless the provider's data terms are appropriate.

See [deployment and run modes](DEPLOYMENT.md) for the distinction and the automated publishing workflow.

## Other computers and hosting

Serve the project over HTTP; do not open index.html directly as a file:

```bash
python3 launcher/serve.py 8000
# then open http://localhost:8000
```

The OpenAI key is read by the local server process. A hosted page such as GitHub Pages cannot read that local environment variable; use the local launcher for the OpenAI-first workflow. A different local port or hostname is a different browser origin and therefore has a separate library.

## Configure AI providers

Open the AI sparkle button in the app and enable whichever built-in providers you want. You may also add multiple custom entries with **+ Add custom API**. Each custom entry has independent settings:

1. Give it a name so you can recognise it.
2. Enter the provider's OpenAI-compatible base URL, normally ending in /v1. Do not add /chat/completions.
3. Enter the exact model ID shown by that provider.
4. Paste its API key if the endpoint requires one. The field is optional for local or anonymous endpoints; clearing it removes the saved value.
5. Leave its checkbox enabled and use **Test AI providers** to check model discovery and whether it can produce a source-chain answer.

The custom adapter sends a Bearer-authenticated Chat Completions request to the base URL plus /chat/completions. Multiple model IDs may be comma-separated. This covers OpenAI-compatible gateways and services; it cannot automatically speak every proprietary vendor protocol (for example, a native Messages or Bedrock API). Such a provider needs a dedicated adapter or an OpenAI-compatible gateway.

OpenAI's own primary key is different: use the hidden Windows launcher prompt or the local server environment variable so it remains server-side. Other provider keys are stored in this browser profile's localStorage and IndexedDB. This app does not encrypt browser-stored keys. Use a private browser profile on a trusted device; avoid shared or public computers for sensitive credentials.

## Your library and provider keys

- PDFs, room analyses, atlases and learner progress are kept in the browser's local IndexedDB for that origin. Use **Import / export** to move a library to another browser or computer.
- The OpenAI API key belongs in the hidden launcher prompt or the local server's `OPENAI_API_KEY` environment variable. Never paste it into the browser's provider-settings form, a URL or a source document.
- Built-in and custom fallback-provider keys are stored in this browser profile's AI settings (localStorage and IndexedDB) and sent only to their matching provider. Browser storage is not encrypted by this app. Their retention, training and regional terms are provider-specific; review those terms before enabling a provider for sensitive documents.
- The optional FreeLLMAPI/local-model route can be used as a fallback. It is not required for OpenAI-first operation.
- The old Artifact/Claude Desktop bridge remains only for compatibility with that host. It is not part of the normal local setup.

## Troubleshooting

**The OpenAI status says the key is missing.** Close the old server window and restart with **Launch Scriptorium with OpenAI.bat**. The key exists only in that new server process.

**The AI settings panel says the local relay is unavailable.** Check that the launcher window is still open and that the browser is using the same `localhost:8000` origin it opened.

**The library appears empty.** Return to the same address and port used before. Different browser profiles, hostnames and ports have separate IndexedDB stores. Use **Import / export** to move the library.

**A fallback provider is being used.** Open the AI settings panel and inspect the OpenAI relay status and enabled providers. OpenAI is tried first; enabled fallbacks are considered only if the primary route is unavailable or the request cannot be completed there.

**You want to test the local proxy without making billable requests.** The repository includes an offline integration test that stubs only the outbound OpenAI transport:

```bash
python -m py_compile launcher/serve.py tools/test-openai-proxy.py
python tools/test-openai-proxy.py
```

For the complete request flow and security details, see [OpenAI-first local engine](OPENAI-LOCAL.md). For using the atlas, source scan, loci route and retrieval tools, see [User guide](USER_GUIDE.md).
