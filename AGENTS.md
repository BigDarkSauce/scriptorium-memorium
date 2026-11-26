# Repository instructions for ChatGPT, Codex and other coding agents

## Project goal

Scriptorium Memorialium is a source-grounded, diorama-first learning environment. Preserve the distinction between source evidence, external research, model assumptions and illustrative visualisation. Do not invent evidence or silently promote an unverified simulation into a factual claim.

## Safe working rules

- Work on the feature branch feature/openai-diorama-atlas unless the user names another branch.
- Keep main untouched. Do not merge pull requests or change repository-level settings unless the user explicitly asks and the available permissions support it.
- Read the relevant architecture, protocol, pedagogy and feature docs before changing the corresponding subsystem.
- Inspect current code before editing. Prefer small, testable changes over broad rewrites.
- Never add, print, commit or copy API keys, access tokens, document contents or other secrets into source files, logs, examples, screenshots or pull request descriptions.
- The localhost OpenAI adapter must keep OPENAI_API_KEY server-side. Do not implement a browser-to-ChatGPT subscription bridge or put credentials in a public static build.
- Preserve uploaded-source provenance and the versioned simulation contract. Mark uncertainty and unsupported extraction explicitly.
- Keep browser storage and server environment boundaries clear. Do not tell users that browser-stored keys are encrypted.
- Treat generated scenes as models whose assumptions and limits remain inspectable.

## Validation

At minimum, run or confirm the tests relevant to the changed subsystem. For a broad change, use the repository validation workflow and inspect every job, not only the aggregate status. Distinguish the last successful commit from the current branch head. Do not claim tests passed when a job is still running or was cancelled.

Core checks include:

- python tools/test-openai-proxy.py
- node tools/test-provider-config.mjs
- node tools/test-model-contract.mjs
- node tools/test-atlas.mjs
- node tools/test-pptx-visuals.mjs
- node tools/verify-chain.mjs --builtins
- node tools/verify-chain.mjs examples/scene-osmosis.json
- Browser smoke tests in .github/workflows/validate.yml

Do not make paid provider calls during CI. Live API tests require explicit user authorisation and a user-supplied credential.

## Handover

- Commit completed changes to the active feature branch.
- Update the relevant docs and the pull request's current-head validation section.
- Give the user branch, commit, PR and CI links, plus clear run/deployment instructions.
- Do not say the hosted site is live until the Pages deploy job has succeeded and the URL has been checked.
