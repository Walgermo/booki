# @booki/core

## 0.2.0

### Minor Changes

- [#5](https://github.com/Walgermo/booki/pull/5) [`40c1fdd`](https://github.com/Walgermo/booki/commit/40c1fddc823ef72ce385299ff6d949fb3374e434) Thanks [@Walgermo](https://github.com/Walgermo)! - **A person's decision is refused for an agent in every framework.** `createBookiAgent` in `@booki/web`, `vue`, `svelte` and `solid` now refuses a person-only step whatever `allow` says, as `@booki/react` did, and `registerTools` refuses it for the browser's own agent too.
  
  **An agent does no more than the person it acts for.** Pass `personOf` in the server guard's context and the person's current roles and entities limit the agent; `agentOwn` names what it may do by the company's rule. Without `personOf` nothing changes.
  
  **Refusals and confirmations are recorded.** `createBookiAgent({ audit })` gets every refused step and every confirmed marked step. `allow` may answer `{ allow, by }` to say who decided; `AuditEvent` has `decidedBy`.
  
  **Whose change it was.** The `on…Change` callbacks of the workflow controls in `@booki/react` are typed with `{ reason, source }`; `BankReconciliation` now passes it on.
  
  **Shorter snapshots.** AccountPicker, TaxCodeSelect and CurrencySelect with more than 30 items list none in the snapshot (`itemsHint` says how to `query`), and an unknown value is refused with the nearest items and the count, under the code `select.unknown-…-more`. Voucher refusals for a long chart name the nearest accounts.
  
  Also: `@booki/styles` ships types for its CSS imports, `usePrimitive`, `usePart` and `personOnly` are exported from `@booki/react`, and the agent's cursor scrolls to a control a sticky bar covers.

- [#9](https://github.com/Walgermo/booki/pull/9) [`acebca2`](https://github.com/Walgermo/booki/commit/acebca2f533c60e26295f19ee36b183f5be000eb) Thanks [@Walgermo](https://github.com/Walgermo)! - The rest of the second pilot's points:
  
  - **KpiStat** shows "Not set" for a figure with no value (snapshot `set: false`, no issue), leaves out the "No comparison" line unless `showNoComparison`, and shows whole amounts without ",00" (`trimZeroFraction`, default true). `formatMoney` takes `trimZeroFraction`.
  - **AmountField** can be empty, which is not 0: `allowEmpty`, `value={null}`, `onEmpty`, and `empty` in the snapshot. `clear` and deleting the text empty it; `setMinor(0)` fills it with 0. Without `allowEmpty` nothing changes.
  - **@booki/styles** is minified (170 KB, 17 KB gzipped, was 216 KB and 25 KB) and comes as `base.css` plus `controls/<name>.css`, so a page loads only the controls it uses.

- [#8](https://github.com/Walgermo/booki/pull/8) [`7987885`](https://github.com/Walgermo/booki/commit/7987885629a47347c9eec5b20a5b0ad627fa407d) Thanks [@Walgermo](https://github.com/Walgermo)! - From the second product pilot:
  
  - `issueAgentToken` and `verifyAgentToken` in `@booki/core/server`: a short-lived, signed credential for an agent working for a person (HMAC-SHA-256 through WebCrypto). A token that is changed, expired or signed with another secret verifies as null.
  - `actAndRecord(agent, input, { audit })`: `act`, plus an `agent.failed` audit row when the control itself refuses a step, which `allow` never sees.
  - A delegation refusal names the roles a person could hold, not the agent's own.
  - The Agent Contract's section 5 lists every decision in `PERSON_ONLY`; a test keeps them the same.

- [#10](https://github.com/Walgermo/booki/pull/10) [`8ff62af`](https://github.com/Walgermo/booki/commit/8ff62afea24f6aab6b192f0354db59f47f0dccfa) Thanks [@Walgermo](https://github.com/Walgermo)! - From the third product pilot, run in a real app:
  
  - **Agent tokens have an audience.** `issueAgentToken({ …, audience })`, and `verifyAgentToken(token, secret, { audience })` refuses a token issued for anything else.
  - **One audit row per refusal, with the control's name.** `actAndRecord` no longer writes `agent.failed` for a step `allow` refused (already `agent.refused`), and names the control by its label rather than its ref.
  - **`withRecordedAct(agent, { audit })`**: the bridge with `act` through `actAndRecord`, for `window.agent` and your own model loop.
  - **An empty AmountField reads `value: null` and `minor: null`** (with `allowEmpty`); `setMinor(null)` empties it.

- [#7](https://github.com/Walgermo/booki/pull/7) [`734ba40`](https://github.com/Walgermo/booki/commit/734ba40e5af914992ad35bb0617c543165e72210) Thanks [@Walgermo](https://github.com/Walgermo)! - Fixes from an internal security review.
  
  - **Bank reconciliation no longer shows payment references (KIDs) to an agent.** `unmatchedBankLines` and `unmatchedPosts` carry `referenceTag` (`ref-1`, …), equal for a line and the post with the same reference, instead of `reference`. The person's tables read `openBankLines` and `openPostsLeft`.
  - **A rule's error is no longer sent to the caller.** The server guard answers a duty rule with 403 `permissions.duty` (now thrown as `DutyRefusal`) and `throw new RuleRefusal(sentence)` from your own rule with 422 `server.rule`. Any other error is rethrown. If your rules threw a plain `Error` to refuse, throw `RuleRefusal` instead.
  - **`ApprovalRequest.requestedFor`**: the person whose agent raised a request may not decide it.
  - **`releaseBatch` refuses `requiredApprovals`** that is not a whole number of at least 1.
  - **An empty `entity` is an entity**: an actor limited to other companies is refused, not let through.
  - **Text read off a document** (supplier name, invoice number) is quoted and shortened in Booki's refusal sentences, so it cannot read as Booki's own words.
  - `isPersonOnly` recognises a person-only sentence among several joined confirm marks.

### Patch Changes

- [#38](https://github.com/Walgermo/booki/pull/38) [`8c4cc04`](https://github.com/Walgermo/booki/commit/8c4cc04121bdd236014694fb0d9bc9894e294db3) Thanks [@Walgermo](https://github.com/Walgermo)! - Mark what is supported (React with the NO and US profiles) and what is experimental (Vue, Svelte, Solid, Web Components, and the SE, DK, GB and DE profiles) in the package descriptions and READMEs. Nothing is removed.

- [#6](https://github.com/Walgermo/booki/pull/6) [`68dfebb`](https://github.com/Walgermo/booki/commit/68dfebb571717827b6cbea10b27ec70e1f316954) Thanks [@Walgermo](https://github.com/Walgermo)! - The format hints, examples and refusals of VoucherComposer, InvoiceEditor, SupplierInvoiceInbox, AuditFindings and ExpenseClaim use new example values (account 7140, VAT code 11, "Kursdag" at 980,00). The old ones were the answers of the benchmark's tasks.

- [#55](https://github.com/Walgermo/booki/pull/55) [`7a4e413`](https://github.com/Walgermo/booki/commit/7a4e4136653cd61cd14a3d7e93a3dd7dd85199d5) Thanks [@Walgermo](https://github.com/Walgermo)! - From the fourth product pilot, run in a real app:
  
  - **`@booki/styles` no longer styles the product's own fields inside `useBookiField`.** The base rules for buttons, labels, selects and text reached into `field-amount`, `field-code` and `field-date`, whose markup is the product's, and made its labels invisible. The build now stops if a `useBookiField` kind is in the base scope again, and `base.css` is back to 57,463 B.
  - **`useBookiField` code kind takes an option's label too** (any case), and a refusal lists each option as `value (label)`, so it says what `setCode` takes. A label two options share is refused.
  - **`useBookiField` can be empty:** `allowEmpty` on an amount reads `minor: null` and `setMinor(null)` empties it; on a code, `setCode("")` or `setCode(null)` clears it.
  - **`AccountPicker`'s `onValueChange` type** now declares the `{ reason, source }` it already received.

- [#49](https://github.com/Walgermo/booki/pull/49) [`6a1dbc2`](https://github.com/Walgermo/booki/commit/6a1dbc22a6169e5fc4b449d0708f09467b642d7d) Thanks [@Walgermo](https://github.com/Walgermo)! - `VoucherComposer`'s `setForeign` is easier for an agent to call right the first time. The snapshot has a new `foreignFormat` hint that says the argument order and the units (the amount in minor units, the rate in millionths). The three values may also come as one object, `setForeign(lineId, { currency, amountMinor, rateScaled })`. A wrong value is refused with which one it is, its unit and the whole call written out, in English and Norwegian, where it used to say only "got NaN".

- [#41](https://github.com/Walgermo/booki/pull/41) [`8ce3a6d`](https://github.com/Walgermo/booki/commit/8ce3a6d3edb44b012799966dfe364f7825204b1b) Thanks [@Walgermo](https://github.com/Walgermo)! - **A company can block sign-off while points are open.** `DocumentSignoff` takes `blockOpenPoints` (off by default: open points still go with the signature). `signObstacles` and `signDocument` take `{ blockOpenPoints }`, and `guardSignDocument` in `@booki/core/server` applies the same rule and refuses an agent at every level. New message `signoff.open-points`, in English and Norwegian.

- [#37](https://github.com/Walgermo/booki/pull/37) [`bef5808`](https://github.com/Walgermo/booki/commit/bef580862c3c12fabeb769ef46c85c3b41d36ca4) Thanks [@Walgermo](https://github.com/Walgermo)! - Test coverage can now be measured with the new test:coverage script; CI reports it.

- [#42](https://github.com/Walgermo/booki/pull/42) [`e77f270`](https://github.com/Walgermo/booki/commit/e77f270551099a0d53a70a481459de0a8fc3993f) Thanks [@Walgermo](https://github.com/Walgermo)! - `useBookiField` wraps an amount, a closed-list code or a date field you already have and gives it `setMinor`, `setCode` or `setDate` with Booki's rules, refusals in English and Norwegian, and the same audit and source reporting as Booki's own controls. Your field stays as it is; `render` returns it. New `field.unknown-code` messages name the options that exist.

## 0.1.0

First preview. Not yet on npm: Booki is published once v1 has run in a real product.
