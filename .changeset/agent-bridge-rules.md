---
"@booki/primitives": patch
"@booki/react": patch
---

Safer agent integrations. A press on a button that is a person's decision (signing off, releasing, sending) is refused with "This is a person's decision …" and an `agent.person-only` audit row, also when the control takes no `press` of its own; it used to answer "nothing to press now" and leave no trace. `registerTools(agent, { allow: "bridge" })` lets the bridge's own `allow` decide each step once (no second prompt), answers in the agent's `language`, records a control's own refusals with `audit`, and takes a `prefix` for the tool names (`acme_snapshot`); it also registers where the browser's `registerTool` returns no promise. `attachAudit` writes a change to a list or record per record and field, with the step in front when one `act` ran one step, instead of a cut-off JSON diff. The install guide's WebMCP example now uses `allow: "bridge"`: if you copied it, drop the second `allow`.
