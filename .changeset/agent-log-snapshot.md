---
"@booki-aui/react": patch
"@booki-aui/styles": patch
"@booki-aui/core": patch
---

`AgentLog` and `AgentSnapshot`: two read-only panels that show people what an agent does and reads. `AgentLog` lists each step an agent from `createBookiAgent` takes (which control, which action, its arguments, with a secret control's arguments shown as `[redacted]`) and its answer: running, waiting for a person while `allow` asks, done, or refused with the reason. Newest last; it follows new rows unless the person has scrolled up. Pass `rows` (from `useAgentLog`) to keep the list yourself. `AgentSnapshot` shows, for the controls inside a `scope`, each one's label, its actions and its state as JSON, taken from the bridge's own snapshot, so a redacted value stays redacted. It updates as the controls change. Neither offers an agent anything to read or call. Both are styled on ink in `@booki-aui/styles` and use new English and Norwegian sentences in the `@booki-aui/core` catalogue.

Calls a browser agent makes through `registerTools` with a gate of its own are listed too. A step whose control cannot be told for certain, or could be a secret one, never shows its values, in the call or in the answer.
