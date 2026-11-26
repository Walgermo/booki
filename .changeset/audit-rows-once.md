---
"@booki-aui/primitives": patch
"@booki-aui/react": patch
---

Audit rows for agent refusals are written once, by whichever side has an `audit`. A press on a person's decision through `registerTools(agent, { allow: "bridge", audit })`, on an agent without its own `audit`, now writes its `agent.person-only` row with the registration's actor; a step `allow` refused on such an agent is written by `actAndRecord` instead of being skipped. A refusal for a control the agent named by its label in another case or without its accents is no longer written twice.
