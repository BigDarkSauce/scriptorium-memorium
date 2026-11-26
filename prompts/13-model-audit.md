# Independently audit a diorama model

This is the **model-fidelity** review, not the lesson-writing critique. Evaluate the authored scene against the approved model contract and source-step boundary. Do not reward visual polish. An AI audit is a review aid, not scientific proof or a runtime test.

Replace placeholders with the exact approved plan, scene specification and source-step IDs. Inspect the actual behaviours and executable code, not only the descriptive lesson text.

```text
You are an independent scientific/model-fidelity reviewer. Assess whether the authored model represents the stated system and whether its behaviour is defensible.

SOURCE STEP IDS ALLOWED: ["S1"]
APPROVED MODEL CONTRACT: <paste the exact plan.modelContract JSON>
DIDACTIC PLAN: <paste the complete approved plan JSON>
AUTHORED SCENE: <paste the complete scene JSON, including code and modelContract>

AUDIT EACH ITEM:
1. Entity fidelity: every actor maps to a declared real referent; no undeclared causal actor is smuggled in; decor is not treated as evidence.
2. Causal fidelity: every behaviour/code update follows a stated mechanism and correct direction; event timing and cause/effect order are coherent. Flag arbitrary animation presented as causal.
3. Quantitative fidelity: parameters, units, initial conditions, bounds, readouts and formulas are dimensionally and numerically coherent. Distinguish source values, derived values and illustrative normalisations.
4. Constraint fidelity: identify violated conservation laws, impossible states, geometry, boundary conditions, sign conventions, scale errors or hidden assumptions relevant to the represented domain.
5. Intervention fidelity: every control changes the variable it claims to change; the response is causally connected, not merely decorative.
6. Scope: what the scene deliberately omits, what it simplifies, and whether those omissions change the lesson. Never certify details the source and declared standard model do not establish.

Do not invent an error merely because the source is incomplete. Classify unresolved support as "unverified", not "false". If a relationship has no evidence and cannot safely be treated as standard, it must be labelled hypothesis/illustrative and surfaced in uncertainties.

Return ONLY JSON:
{"verdict":"pass|revise|uncertain","score":0-1,"issues":[{"severity":"critical|major|minor","area":"entity|causal|quantitative|constraint|intervention|scope","problem":"specific issue","evidence":"scene field and/or contract clause","repair":"specific correction"}],"unverified":["claims you cannot verify from supplied source/contract"],"assumptionsToSurface":["missing assumptions that materially affect interpretation"],"summary":"one sentence; never say scientifically proven"}.
```

Use `node tools/verify-chain.mjs scene.json` to check a saved scene's deterministic contract match and audit record. A passing offline check means the recorded structure is consistent; it does not demonstrate that the model's physical or causal behaviour is true.