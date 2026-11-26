# Simulation model contracts and independent fidelity review

A diorama is a model of a selected system, not merely a scene that resembles its subject. Scriptorium therefore asks the authoring model to state what the scene is meant to represent before it writes the scene specification.

This is a structured quality-control layer. It makes assumptions and support inspectable; it does **not** prove that arbitrary generated code is scientifically correct.

## 1. Plan the model before composing the scene

For a new `scriptorium-model-plan/1`, the plan contains a `modelContract` with:

- **System boundary:** what the simulation includes, and which real-world influences or scales it leaves outside.
- **Entities:** each causal actor's exact scene body ID, real referent (or clearly named conceptual stand-in), role, and supporting source-step IDs.
- **State variables:** scene parameter key, quantity, unit, initial value and permitted range; whether the variable is controllable; and whether its value comes from the source, is derived, or is illustrative.
- **Mechanisms:** directed `from` and `to` actors, a conditional cause-and-effect rule, its evidential basis (`source`, `standard`, `external`, or `hypothesis`), and the source step IDs or external source that support it.
- **Constraints:** causal, conservation, geometric, temporal or logical limits that the scene must not violate.
- **Assumptions:** simplifications and boundary conditions, with what each enables and excludes.
- **Observables:** readouts or visible outcomes and the relationship between them and the model state.
- **Uncertainties:** material things the source does not establish and the model therefore cannot claim to resolve.

The plan receives the exact source-step IDs that support the concept. This prevents the planner from quietly inventing IDs and lets the deterministic checks reject evidence references outside the supplied source set.

A variable that is not grounded by the uploaded material must be marked `illustrative` and described as a simplification. It must not be presented as a measured or source-reported value. An external mechanism needs an explicit source. A hypothesised relationship must remain visibly labelled as a hypothesis.

## 2. Match the authored scene to the approved contract

After scene authoring, deterministic checks compare the actual scene with the approved model contract:

1. Actor IDs are unique and match the declared model entities exactly.
2. Every controllable contract variable has a corresponding scene parameter.
3. Parameter keys, initial values, ranges and units match the contract.
4. No undeclared scene parameter is quietly introduced.
5. The contract copied into the scene is identical to the approved plan contract.
6. Evidence step IDs are members of the source step set supplied for the scene.

A mismatch is treated as an authoring failure and triggers the bounded simpler retry. It is not silently repaired by widening ranges or adding unapproved actors. When both attempts fail, the existing fallback route is used and the failure reason is retained.

Older rooms with unversioned plans remain readable. The new contract checker does not falsely fail those legacy plans; it reports that the additional model contract was not available.

## 3. Independent model-fidelity review

For a scene that passes the deterministic contract check, a separate reviewer call assesses the authored scene against the contract and its source mapping. It examines:

- **Entity fidelity:** do actors correspond to the declared referents?
- **Causal fidelity:** do behaviours and code implement the stated direction and sequence of effects, or merely animate objects?
- **Quantitative fidelity:** are units, ranges, initial conditions, formulae and readouts coherent?
- **Constraint fidelity:** are conservation, geometry, sign conventions, boundaries and possible states respected where relevant?
- **Intervention fidelity:** does a control change the stated variable and cause a corresponding response?
- **Scope:** do simplifications preserve the intended lesson, and are unverified claims clearly separated?

The reviewer returns `pass`, `revise`, or `uncertain`, with severity-ranked issues, unverified claims and assumptions that should be surfaced. Critical or major issues with a `revise` verdict trigger the simpler retry. Minor findings are retained in the audit record and do not automatically force a retry. An `uncertain` result is retained as uncertainty rather than being converted into a pass.

The saved scene stores:

- `modelContract`: the approved contract copied from the plan;
- `modelValidation`: deterministic contract-match results;
- `modelAudit`: the independent review and its limitations;
- `sourceStepIds`: the source-step set used for the scene.

The offline verifier (`tools/verify-chain.mjs`) checks these records in a chain or room and can also check a standalone scene.

## 4. What this does not establish

The following distinctions are important:

- A structurally valid contract is not proof that its mechanisms are true.
- A second model's critique is not an independent scientific experiment or formal verification. It can miss mistakes or flag valid simplifications.
- A code string that parses is not proof that its numerical integration, units, or runtime behaviour is correct.
- Source-step traceability proves where a claim was attached, not that the source itself is correct or sufficiently detailed.
- This is not a universal physics engine. When a domain's equations, boundary conditions, stochastic structure or data are not specified, the scene should stay qualitative or explicitly illustrative instead of manufacturing precision.
- A live browser/WebGL test, a real OpenAI authoring request and domain-expert review are still needed to assess rendered quality and the behaviour of each generated simulation.

The contract and review make a model's assumptions, evidence and unresolved questions inspectable. They raise the cost of unsupported scene authoring, but do not remove the need for human review and real execution tests.
