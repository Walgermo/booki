---
"@booki/core": minor
"@booki/primitives": minor
"@booki/react": minor
"@booki/web": minor
"@booki/vue": minor
"@booki/svelte": minor
"@booki/solid": minor
---

From the third product pilot, run in a real app:

- **Agent tokens have an audience.** `issueAgentToken({ …, audience })`, and `verifyAgentToken(token, secret, { audience })` refuses a token issued for anything else.
- **One audit row per refusal, with the control's name.** `actAndRecord` no longer writes `agent.failed` for a step `allow` refused (already `agent.refused`), and names the control by its label rather than its ref.
- **`withRecordedAct(agent, { audit })`**: the bridge with `act` through `actAndRecord`, for `window.agent` and your own model loop.
- **An empty AmountField reads `value: null` and `minor: null`** (with `allowEmpty`); `setMinor(null)` empties it.
