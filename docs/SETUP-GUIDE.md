# Scriptorium Memorialium: setting it up (and sharing it)

Scriptorium Memorialium is a walkable 3D library: each PDF you add becomes a room of scrolls, chains of logical steps
with figures, and the ideas you can step into as living 3D dioramas. An AI writes the scrolls and dioramas. This guide
gets everything working, including free AI models with very large monthly allowances.

## What you get, and where it runs

| | In the Claude app (the published page) | On your computer (Launch Scriptorium.bat) |
|---|---|---|
| Open it | https://claude.ai/artifact/QpCmKYRujhaHzeq4eY2rie | double-click `Launch Scriptorium.bat` |
| AI: Claude | yes (your Claude plan) | no (Claude lives in the Claude app) |
| AI: free models | yes, with the **Scriptorium extension** (step 2) | yes, through the launcher's AI relay |
| FreeLLMAPI (34 providers) | yes, found by itself through the extension | yes, found by itself through the relay |
| Your library | kept in the Claude app's storage for the page | kept in your browser for http://localhost:8000 |

Move a library between the two with **Import / export** (main menu).

The three AI engines (the sparkle button):
* **Claude directs**: Claude writes everything. The best quality.
* **Claude + free models**: Claude reads each chapter and plans each diorama; the free models write the volume. Each
  stands in when the other is at its limit, so a job never stops.
* **Free models only**: the best free model available at that moment writes everything; when all are at their limits
  the job waits for the next reset instead of failing.

## The quick way (Windows)

1. Download the project: **https://github.com/BigDarkSauce/scriptorium-memorium** → Code → Download ZIP, and unzip it
   (or `git clone https://github.com/BigDarkSauce/scriptorium-memorium.git`).
2. Double-click **`Setup Scriptorium.bat`** in the folder. It asks before each step:
   1. shortcuts on the Desktop;
   2. the Scriptorium extension in Claude Desktop (it opens the file; you press **Install**);
   3. FreeLLMAPI: downloads its latest Windows installer from GitHub and runs it;
   4. opens the free-key sign-up pages and FreeLLMAPI's **Keys** page;
   5. opens Scriptorium.

Everything below is the same, by hand.

## Step by step

### 1. The app
* In the Claude app: open the published page (link above). Nothing to install.
* On your computer: unzip the project and double-click `Launch Scriptorium.bat` (it serves the app at
  http://localhost:8000 with the AI relay; keep its window open). It uses Python if you have it, else PowerShell.

### 2. The Scriptorium extension (free models inside the Claude app)
Inside the Claude app the page may not contact outside addresses itself. The extension makes its free-model requests
from your computer, and keeps your AI keys in a file there (`%USERPROFILE%\.scriptorium\ai-settings.json`), so every
new version of the app has them.

* Double-click `bridge\Scriptorium free models.mcpb` → Claude Desktop → **Install**.
  (Or Claude Desktop → Settings → Extensions → drag the file in. Or the **Download the extension** button in the AI panel.)
* In Scriptorium (in the Claude app) open the AI panel → **Check again**: “✓ Free models connected”.

It calls only AI-shaped addresses (`https://…/models`, `…/chat/completions`) and programs on your own computer. Claude
Desktop runs it with its own Node.js. Note: a server on someone's computer can be used only by the **owner** of the
published page; people you share the page with use the version on their own computer (step 1, second way) for free
models, or publish their own copy.

### 3. FreeLLMAPI (34 providers, one key)
[FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi) (MIT) is a router you run on your computer: you give it a free
key per provider once, and it offers all of them behind one address and one key, rotating around every limit. Its
authors count ~7.4 billion tokens a month across 34 providers (635 model endpoints) when every provider has a key.

* Install: the Windows `.exe` from its [latest release](https://github.com/tashfeenahmed/freellmapi/releases/latest)
  (the desktop app runs at http://127.0.0.1:31415 and lives in the tray), or Docker / npm (port 3001).
* Scriptorium finds it by itself, its address and its unified `freellmapi-…` key, through the extension (Claude app) or
  the launcher's relay (your computer). The AI panel then says “✓ FreeLLMAPI connected: N models ready”.
  By hand: the AI panel → FreeLLMAPI row → its address and the unified key from its Keys page.

### 4. The free keys
Each provider needs its own free account (only you can sign up). Paste each key in **FreeLLMAPI's dashboard → Keys**
(then Scriptorium uses all of them through FreeLLMAPI), or straight into Scriptorium's AI panel, provider by provider.

Largest free tiers without a card, open worldwide (start here):

| Provider | Key page | What it gives |
|---|---|---|
| Google AI Studio (Gemini) | https://aistudio.google.com/apikey | the strongest free models; reads PDF page images |
| Groq | https://console.groq.com/keys | very fast; ~1,000 requests a day per model |
| Cerebras | https://cloud.cerebras.ai/ | very fast; ~1M tokens a day |
| NVIDIA NIM | https://build.nvidia.com/ | many large open models |
| Mistral | https://console.mistral.ai/api-keys | free Experiment plan |
| OpenRouter | https://openrouter.ai/keys | free models (50 requests a day; 1,000 after a one-time $10 top-up) |
| Cloudflare Workers AI | https://dash.cloudflare.com/profile/api-tokens | `account_id:token` in FreeLLMAPI |
| Cohere | https://dashboard.cohere.com/api-keys | trial key |
| Z.ai (GLM Flash) | https://z.ai/manage-apikey/apikey-list | GLM Flash models free |
| Hugging Face | https://huggingface.co/settings/tokens | small monthly router credit |

No key at all (work at once, slowly): OVHcloud, LLM7, Pollinations, Kilo, AI Horde. The full list of 34, with what
each gives: https://freellmapi.co/models.html

Honest limits: the 7.4 billion figure is the sum of every listed free tier. Some providers need things not everyone
has (a Chinese real-name account: ModelScope, Qianfan, Volcengine, iFlytek; a payment method: Sail; Telegram
verification: NaraRouter), a few have closed their free tiers (SambaNova; OpenCode Zen's free models; Reka for new
accounts), and every free tier has per-minute and per-day limits that change without notice. With the keys in the
table above most of the capacity is open; Scriptorium's router (and FreeLLMAPI's) moves to the next free model at each
limit and waits for the earliest reset rather than failing. A model on your own computer (Ollama, LM Studio) has no
limit at all.

## Your keys stay yours, across every update

Keys and choices are kept in three places: the browser's storage for the page, its IndexedDB, and (with the extension)
a file on your computer. At start the newest copy wins, so a key you change is never undone by an older copy, and a
new version of the app, a cleared browser or a new computer with the extension finds them again. Nothing else changes
them. Keys go only to the provider they belong to (or to FreeLLMAPI on your computer).

## Sharing it

* **The page**: share https://claude.ai/artifact/QpCmKYRujhaHzeq4eY2rie. Others read and use it in their own Claude
  app; scrolls you mark “visible to everyone” appear under **Get scroll** for them.
* **The whole project**: https://github.com/BigDarkSauce/scriptorium-memorium (and its Releases page: the project and
  the extension as downloads). Anyone can run `Setup Scriptorium.bat` on Windows, or serve the folder anywhere
  (`python3 launcher/serve.py`).

## Troubleshooting

* **“This page cannot reach the free models”** in the Claude app: install the extension (step 2), then **Check again**.
* **The extension is installed but not found**: Claude Desktop → Settings → Extensions → make sure it is enabled; quit
  and reopen Claude Desktop. The AI panel shows its version (1.1 or later finds FreeLLMAPI and keeps your keys).
* **FreeLLMAPI not found**: open it from the Start menu (tray icon); the desktop app listens on port 31415.
* **Every free model is at its limit**: the status line says which one frees up next and when; add more keys (step 4).
* **The first visit to a room takes a few seconds**: the graphics card compiles the room's materials once (“Preparing
  the room…”); later visits are quick.
