---
"@booki/core": minor
"@booki/primitives": minor
"@booki/react": minor
"@booki/styles": patch
"@booki/web": minor
"@booki/vue": minor
"@booki/svelte": minor
"@booki/solid": minor
---

**A person's decision is refused for an agent in every framework.** `createBookiAgent` in `@booki/web`, `vue`, `svelte` and `solid` now refuses a person-only step whatever `allow` says, as `@booki/react` did, and `registerTools` refuses it for the browser's own agent too.

**An agent does no more than the person it acts for.** Pass `personOf` in the server guard's context and the person's current roles and entities limit the agent; `agentOwn` names what it may do by the company's rule. Without `personOf` nothing changes.

**Refusals and confirmations are recorded.** `createBookiAgent({ audit })` gets every refused step and every confirmed marked step. `allow` may answer `{ allow, by }` to say who decided; `AuditEvent` has `decidedBy`.

**Whose change it was.** The `on…Change` callbacks of the workflow controls in `@booki/react` are typed with `{ reason, source }`; `BankReconciliation` now passes it on.

**Shorter snapshots.** AccountPicker, TaxCodeSelect and CurrencySelect with more than 30 items list none in the snapshot (`itemsHint` says how to `query`), and an unknown value is refused with the nearest items and the count, under the code `select.unknown-…-more`. Voucher refusals for a long chart name the nearest accounts.

Also: `@booki/styles` ships types for its CSS imports, `usePrimitive`, `usePart` and `personOnly` are exported from `@booki/react`, and the agent's cursor scrolls to a control a sticky bar covers.
