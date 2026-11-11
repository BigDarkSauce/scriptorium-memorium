# Scriptorium free models (the bridge)

Inside the Claude app, Scriptorium is an Artifact, and an Artifact's page may not contact outside addresses. So its
free LLM APIs (Groq, Gemini, OVHcloud, …) could not be reached there, and **“Claude + free models”** could not work in
the one place where Claude itself is available. This small MCP server makes those requests from your own computer: the
page asks it (through the Artifact's `mcp` capability, server `host:scriptorium-free`), it calls the provider with
Node's own `fetch` and passes the answer back as it streams in.

It calls only LLM-shaped addresses: `https://…/models` and `https://…/chat/completions` on any host, and anything on
this computer (`localhost`: FreeLLMAPI, Ollama, LM Studio). Its four tools are read-only (they change nothing on the
computer), so the app does not ask you to confirm each request. Your keys stay in the page's storage and only pass
through here on their way to their provider. Only the Artifact's owner can use a server on their computer.

## Install (one double-click)

1. Double-click **`Scriptorium free models.mcpb`** (in this folder, or downloaded from the AI panel).
   Claude Desktop opens it; press **Install**. (Or: Settings → Extensions, drag the file in.)
2. In Scriptorium (inside the Claude app) open the AI panel (the sparkle button) and press **Check again**:
   it says “✓ Free models connected”.

Claude Desktop runs it with its own Node.js; nothing else to install.

## Or by hand (the same server, configured yourself)

Claude Desktop → Settings → Developer → Edit Config, and add (with your own path; it needs Node.js 18+ installed):

```json
{ "mcpServers": { "scriptorium-free": { "command": "node",
  "args": ["C:\\Users\\you\\Desktop\\Scriptorium Memorium\\bridge\\server\\index.mjs"] } } }
```

Restart Claude Desktop. The name must be `scriptorium-free`.

## Files

* `server/index.mjs`: the server (no dependencies; MCP over stdio, newline-delimited JSON-RPC 2.0).
* `manifest.json`: the extension's manifest (MCPB format).
* `Scriptorium free models.mcpb`: the two files above, zipped (rebuild: zip `manifest.json` and `server/` together).

Tests: `node tools/test-bridge.mjs` (the server over stdio, then the page's router through it to a mock provider).
