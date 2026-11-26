# Working on Scriptorium from ChatGPT without an API key

## What this means

A ChatGPT conversation can inspect and, in a write-enabled connected session, edit this GitHub repository directly. That connection is authenticated through the user's GitHub authorisation; it does not need a Scriptorium provider key or an OpenAI Platform API key.

The Scriptorium app's own AI authoring is a separate runtime. If you want the app itself to send document-authoring requests to OpenAI, configure an OpenAI API key in the local launcher. A ChatGPT subscription is not itself an API credential that a standalone web app can call. ChatGPT and API usage have separate billing and credential systems.

## Connect and authorise the repository

1. In ChatGPT, open Settings → Apps (the label may vary by client) and connect GitHub.
2. Authorise the GitHub account that owns BigDarkSauce/scriptorium-memorium, and make sure this repository is included in the allowed repositories.
3. For repository inspection, ask ChatGPT to read this file and AGENTS.md first, then inspect the named files and explain findings with file paths.
4. For edits and commits, use a ChatGPT session or coding workspace that has GitHub write capability. OpenAI's standard GitHub app can be read-only in ordinary chat; Codex is the supported write-capable coding workflow when the chat connector cannot push changes. Do not paste an API key to solve a GitHub permission problem.

## Reusable instruction

Paste this into a ChatGPT conversation:

> Work directly on BigDarkSauce/scriptorium-memorium. Read AGENTS.md and docs/CHATGPT-GITHUB-WORKFLOW.md first. Use the connected GitHub repository access; do not ask me for an OpenAI API key. Work on feature/openai-diorama-atlas, leave main untouched, inspect the current implementation before editing, run the relevant tests and GitHub Actions, commit completed work to that feature branch, and report the exact commit, PR, check status and remaining limitations. Do not merge.

## What you can ask ChatGPT to do

- Audit a feature, trace bugs and explain the code with repository citations.
- Implement a feature on the development branch, add tests and documentation, and prepare a PR.
- Inspect CI failures, make a targeted fix, and rerun validation.
- Review source-ingestion, simulation contracts, diagrams and pedagogical behaviour against their documented constraints.

## Credential separation

- ChatGPT/GitHub connection: authorises repository access. No model API key is needed for code review or repository changes.
- Scriptorium custom provider credentials: configured in the app's AI engine panel for the app's own model requests.
- OpenAI local credential: entered into the local launcher and kept in the server process environment. It is never a GitHub credential and must not be placed into source code.
