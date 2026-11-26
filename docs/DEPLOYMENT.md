# Deployment and run modes

## Hosted browser edition

The intended GitHub Pages address, once the repository enables Actions publishing and the deploy workflow succeeds, is:

**https://bigdarksauce.github.io/scriptorium-memorium/**

The build-and-upload stage has been verified. GitHub's final Pages publish stage also requires the repository setting **Settings → Pages → Build and deployment → Source → GitHub Actions**. If the deployment is blocked after that change, check **Settings → Environments → github-pages** and allow the `feature/openai-diorama-atlas` branch (or remove the branch restriction) so this preview branch can deploy. These repository settings are owner-controlled; the workflow cannot safely override them.

It contains the complete static browser application: WebGL library and rooms, seeded examples, PDF and PowerPoint import, semantic concept atlas, source scan, retrieval and loci tools, diagrams, diorama editing, local browser storage, and import/export. The deployment bundle also includes the user guides, prompt pack, schemas, example files and local launchers.

The Pages workflow builds the site from tracked repository files and checks the entry-page assets, JavaScript module imports and CSS URLs before upload. It deliberately excludes development tooling and workflow definitions. A push to feature/openai-diorama-atlas publishes the branch preview; the same workflow can also be run manually from the Actions tab.

If Pages has not been configured for Actions publishing in this repository yet, set **Settings → Pages → Build and deployment → Source → GitHub Actions** once. GitHub creates or uses the github-pages deployment environment for the workflow.

### Configure multiple provider keys

The hosted UI can store multiple custom OpenAI-compatible API endpoints, each with its own URL, model ID and optional key. The provider must allow requests from the browser origin (CORS) or be reachable through a local relay when the page is served locally. Keys entered into the browser are stored in that browser profile's localStorage and IndexedDB; this app does not encrypt them. See [provider setup](SETUP-GUIDE.md#configure-ai-providers).

### Hosted-mode limits

GitHub Pages serves static files. It cannot run launcher/serve.py, the PowerShell server, the localhost relay, or access OPENAI_API_KEY on your computer. Therefore:

- The complete browser UI, built-in dioramas and document import tools are available on the hosted page.
- The hosted page can call only providers that permit browser-origin requests, or local endpoints reachable from that browser. Provider support and CORS rules vary.
- An OpenAI API key must never be embedded in the public JavaScript bundle or stored in the hosted page to simulate a server-side key relay.
- The browser's IndexedDB is scoped to the hosted origin. It is separate from http://localhost:8000 and from other browsers. Use **Import / export** to transfer a library or learning data.

## Full OpenAI-first local edition

For the secure OpenAI route, download the source branch and run the local server on your own computer.

### Windows

1. Download and extract the [feature branch ZIP](https://github.com/BigDarkSauce/scriptorium-memorium/archive/refs/heads/feature/openai-diorama-atlas.zip).
2. Double-click **Launch Scriptorium with OpenAI.bat**.
3. Paste your OpenAI API key into the hidden PowerShell prompt.
4. Keep the server window open; Scriptorium opens at http://localhost:8000.
5. Import or analyse your own PDF or .pptx presentation.

The key is held in the local server process environment and is not written into the project, sent to the browser, or committed to GitHub. API use is billed separately by OpenAI. The local server also enables the optional relay path for providers that block browser CORS.

### macOS / Linux

From the extracted project folder:

~~~bash
read -s OPENAI_API_KEY
export OPENAI_API_KEY
export OPENAI_MODEL=gpt-6.2-astra
python3 launcher/serve.py 8000
~~~

Open http://localhost:8000 in the same computer's browser. The terminal that launched the server must remain open.

To run without OpenAI, start python3 launcher/serve.py 8000 without setting the key. The app still runs and can use compatible fallback providers. A plain static server such as ./serve.sh serves the browser app but does not provide the secure AI relay.

## Build the Pages bundle locally

Requires Node.js and a checked-out Git repository:

~~~bash
node tools/build-pages.mjs _site
~~~

The build copies runtime and supporting project files into _site, checks required deployment files and verifies local HTML assets, JavaScript module imports and CSS URLs. The workflow then uploads that folder as the GitHub Pages artifact.

## Validation boundary

CI exercises the live local app with Chromium, a synthetic PowerPoint import, the semantic atlas UI, the seeded WebGL interactions and the visual-polish checks. The offline OpenAI proxy and real Windows PowerShell server are tested without making billable provider calls. These tests validate the code and local runtime; they do not substitute for a real, user-authorised OpenAI API request or checking the model's interpretation of an arbitrary uploaded deck.
