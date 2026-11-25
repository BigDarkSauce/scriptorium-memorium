# Optional fallback model providers

Scriptorium's primary authoring engine is OpenAI through the local secure relay. The model router gives the `openai-local` provider absolute priority. If the local endpoint is unavailable or a request cannot be completed there, the router can try other providers that are enabled in the AI settings panel.

This document describes that **fallback pool**. It is not a list of alternative primary modes. The older Claude Artifact/Claude Desktop bridge instructions are legacy compatibility material; they are not needed for the local OpenAI-first workflow.

## How the fallback router works

The provider router (`js/ai/free.js`) discovers available model lists where supported, applies a tested ranking for this app's long structured JSON tasks, respects provider budgets and reset headers, and tries the next eligible provider after a failed or invalid response. Successful validated responses can be cached. A fallback model's output still passes through the caller's parser and quality checks; those checks do not prove that its scientific claims are true.

The OpenAI local provider is given absolute precedence over the fallback pool. The pool is therefore a continuity option, not a reason to send every document to every provider. You can enable or disable fallback providers individually in **AI settings**.

## Configuring optional fallbacks

1. Start Scriptorium with **Launch Scriptorium.bat** or **Launch Scriptorium with OpenAI.bat**.
2. Open the AI settings panel.
3. Enable only providers you are comfortable using and supply their own keys, base URLs or model names where required.
4. Use **Test AI providers** to check reachability and whether a provider can produce a response that passes the app's actual validation path.
5. Keep OpenAI enabled as the primary provider if you want the normal OpenAI-first route.

The panel lists supported provider endpoints and their current configuration. Provider catalogues, quotas, pricing, free tiers and regional availability change frequently; treat the panel and each provider's current terms as authoritative rather than relying on a static allowance quoted in this document.

## Local model routers

FreeLLMAPI, Ollama and LM Studio can be configured as optional local fallbacks. FreeLLMAPI can expose several upstream providers behind one local OpenAI-compatible endpoint. A local model can avoid sending a document to a third-party model provider, but its speed and output quality depend on the hardware and model you choose.

The FreeLLMAPI route is optional. It does not replace the OpenAI relay, and it does not automatically inherit OpenAI's native Responses API tools such as hosted web search.

## Key and data handling

- The OpenAI key is read by the local Scriptorium server from `OPENAI_API_KEY`. It is not stored in browser localStorage or sent to JavaScript.
- Optional fallback-provider keys and settings are stored in the browser's AI settings, mirrored in the app's local IndexedDB store, and may be synchronised through the optional host bridge when that bridge is present.
- Fallback requests are sent to the configured provider or local router. Their retention, training, processing location and privacy terms are not controlled by Scriptorium.
- Do not enable a provider for confidential material unless its terms and your organisation's rules allow that document to be sent there.

## Limits and troubleshooting

Free tiers and provider rate limits change without notice. A provider can also disappear, reject a key, remove a model or stop supporting vision. The app reports the reachability and validation result it actually observed; it does not guarantee that a free provider will always complete a chapter.

If no usable provider is available, inspect the AI panel, check the provider's own status page and key settings, or use the portable prompt/JSON workflow described in [the protocol](PROTOCOL.md). For the primary local route, see [OpenAI-first local engine](OPENAI-LOCAL.md).
