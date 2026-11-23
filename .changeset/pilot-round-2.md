---
"@booki/core": minor
"@booki/primitives": minor
"@booki/react": minor
"@booki/web": minor
"@booki/vue": minor
"@booki/svelte": minor
"@booki/solid": minor
---

From the second product pilot:

- `issueAgentToken` and `verifyAgentToken` in `@booki/core/server`: a short-lived, signed credential for an agent working for a person (HMAC-SHA-256 through WebCrypto). A token that is changed, expired or signed with another secret verifies as null.
- `actAndRecord(agent, input, { audit })`: `act`, plus an `agent.failed` audit row when the control itself refuses a step, which `allow` never sees.
- A delegation refusal names the roles a person could hold, not the agent's own.
- The Agent Contract's section 5 lists every decision in `PERSON_ONLY`; a test keeps them the same.
