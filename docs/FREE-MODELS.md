# Free models: the three AI engines

Scriptorium Memorialium writes scrolls (chains of steps), figures and dioramas with a language model. The **AI engine**
button (the sparkle under the graphics button, on every screen) chooses who writes:

| Mode | Who writes | Limits |
|---|---|---|
| **Claude directs** | Your Claude does everything (inside claude.ai). | Your Claude plan's limits. |
| **Claude + free models** | Claude reads each chapter into its chain and plans and checks each diorama (the *director's* requests); the free models write the volume: coverage follow-ups, repairs, figures, diorama code, step expansions (the *worker's* requests). | Each stands in for the other: Claude at its limit → the free models take the request; every free model at its limit → Claude takes it. A job never stops. |
| **Free models only** | The pool of free models does everything, the best one free at that moment first. | When every free model is at its limit, the job **waits** for the earliest reset (it says which and how long, and can be stopped) instead of failing. |

The prompts, the JSON formats and the quality checks are the same whichever engine answers (js/ai/prompts.js): a free
model gets exactly the request Claude would get, and its answer goes through the same parser, the same `qualityGate`,
the same repairs and the same diorama checks.

## How the router never runs out (js/ai/free.js)

No single free tier is big or steady enough for a whole book, but pooled they are large (FreeLLMAPI counts about
7.4 billion tokens a month across 34 free tiers). For every request the router:

1. **discovers** each provider's live model list (`GET /models`, kept a day), so retired models drop out and new ones
   come in without an update of the app;
2. **ranks** the models by how well they write long, exact JSON (the `RANK` table; unknown names are tried after the
   known ones);
3. **budgets** each model: requests this minute and today, learned from the 429 answers it meets, and cool-downs read
   from the provider's own headers (`Retry-After`, `x-ratelimit-reset-*`); a daily cap waits for 00:00 UTC;
4. **validates** the answer (parsed as JSON, not cut off, plus the caller's check, e.g. "has a chain of steps"); a
   wrong answer is named back to the same model once, then the next model gets the request;
5. **caches** answers that passed (IndexedDB, 30 days): running the same request again costs nothing;
6. **waits, never fails**: when every model is busy it waits for the earliest reset. A model on your own computer
   (Ollama, LM Studio, FreeLLMAPI) has no quota at all.

Honest limits: free tiers change their rules without notice, and the best free models are not as strong as Claude at
very long, exact answers (see the test results below). "Never runs out" means the job always finishes; when every free
quota is spent for the day it finishes after the reset, unless a local model or Claude (hybrid mode) is there.

## What works from a web page (measured, November 2026)

Cross-origin requests from the app's page were tried against each provider (the standalone page; inside the Claude
app the extension makes the requests and none of this applies):

* **answer from the page:** Groq, Google Gemini, Cerebras, Mistral, OpenRouter, Cohere, Z.ai, Chutes, Hugging Face,
  OVHcloud, LLM7, Pollinations;
* **blocked from a page** (no CORS): NVIDIA NIM, GitHub Models, SambaNova, Cloudflare Workers AI, Kilo. These are
  reached through **FreeLLMAPI**, which runs as a small server on your computer and has no such restriction.

## Setting it up (best first)

1. **No key at all**: OVHcloud (gpt-oss-120b, Qwen3.5-397B, Llama 3.3 70B; 2 requests a minute per model), LLM7
   (two small models without a key) and Pollinations (one reply per 45 s) work at once. Slow, but the app can write a
   whole scroll with nothing set up.
2. **Google AI Studio** key (aistudio.google.com/apikey, no card): the strongest free models (Gemini Flash), and they
   can read PDF page images.
3. **Groq** key (console.groq.com/keys) and **Cerebras** key (cloud.cerebras.ai): very fast, about a thousand requests
   a day per model.
4. **Mistral** (console.mistral.ai, free Experiment plan) and **OpenRouter** (openrouter.ai/keys, 50 free requests a
   day): more reserve.
5. **FreeLLMAPI** (github.com/tashfeenahmed/freellmapi; on Windows the `.exe` installer from its Releases page; or
   `curl -fsSL https://freellmapi.co/install.sh | bash` with Docker): add your provider keys in its dashboard
   (http://localhost:5173), then turn on "FreeLLMAPI (local router)" in the AI panel and paste its unified
   `freellmapi-…` key. It pools 34 providers (NVIDIA NIM, GitHub Models and Cloudflare included) behind one address,
   `http://localhost:3001/v1`, with its own rotation.
6. **Ollama** (ollama.com): a model on your own computer, no limit and private. Start it with `OLLAMA_ORIGINS=*` so a
   web page may call it, pull a model (`ollama pull qwen3:8b`), turn on "Ollama / LM Studio" and type the model name.
   On a laptop GPU it is slow; it is the reserve that cannot run out.

Keys stay in this browser (localStorage `sm-ai`) and are sent only to the provider they belong to. Some free tiers
may use prompts to improve their models (Google outside the EEA/UK/Switzerland, Mistral's free plan unless you opt
out, some OpenRouter providers); the panel says so beside each one.

## Where the app runs, and the bridge that makes “Claude + free models” work in the Claude app

Inside the Claude app Scriptorium is an Artifact, and an Artifact's page **may not call outside addresses** (tested:
every provider, even the keyless ones, is unreachable from it). Claude, on the other hand, is only reachable from
inside the Claude app. So without help, “Claude + free models” had no place where both halves worked.

The help is **the Scriptorium free-models extension** (`bridge/`, packed as `Scriptorium free models.mcpb`): a tiny
MCP server that runs on your own computer inside Claude Desktop. An Artifact may call such a server (its `mcp`
capability, server `host:scriptorium-free`); the page hands it each free-model request, it makes the request with
Node's own fetch (no browser rules: NVIDIA NIM, GitHub Models, SambaNova and Cloudflare are reachable too) and passes
the answer back as it streams (`http_start`, then `http_poll` every few seconds, so a long answer never meets the
app's ~130 s limit per call). It only calls LLM-shaped addresses (`https://…/models`, `…/chat/completions`) and
servers on your own computer; its tools are read-only, so the app does not ask to confirm each request.

| Where | Claude | Free models |
|---|---|---|
| **Claude app, extension installed** | yes | yes, through the extension: all three modes work |
| Claude app, no extension | yes | no: “Claude + free models” uses Claude for everything; the panel offers the extension |
| Standalone page (Launch Scriptorium.bat, or GitHub) | no (Claude lives in the Claude app) | yes, straight from the page |

Install: double-click `Scriptorium free models.mcpb` (your Scriptorium Memorium folder, or **Download the extension**
in the AI panel) → Claude Desktop → **Install**; then **Check again** in the panel. Claude Desktop runs it with its
own Node.js. (By hand: bridge/README.md.) Only the Artifact's owner can use a server on their computer.

The standalone page still works on its own (free models only):
* **Launch Scriptorium.bat** in your Scriptorium Memorium folder (http://localhost:8000);
* or from GitHub: https://bigdarksauce.github.io/scriptorium-memorium/

Each place keeps its own library in its browser storage: move it with **Import / export**.

## The live test

"Test the free models" in the panel runs, for every provider in play: its model list (reach), a tiny exact answer
(alive, latency), then this app's real chapter request (`chapterPrompt`) on a short original passage, put through the
app's own `normalizeChain` and `qualityGate`. Results so far are in docs/ARCHITECTURE.md (round 18).
