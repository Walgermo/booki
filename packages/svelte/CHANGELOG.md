# @booki/svelte

## 0.2.0

### Minor Changes

- [#5](https://github.com/Walgermo/booki/pull/5) [`40c1fdd`](https://github.com/Walgermo/booki/commit/40c1fddc823ef72ce385299ff6d949fb3374e434) Thanks [@Walgermo](https://github.com/Walgermo)! - **A person's decision is refused for an agent in every framework.** `createBookiAgent` in `@booki/web`, `vue`, `svelte` and `solid` now refuses a person-only step whatever `allow` says, as `@booki/react` did, and `registerTools` refuses it for the browser's own agent too.
  
  **An agent does no more than the person it acts for.** Pass `personOf` in the server guard's context and the person's current roles and entities limit the agent; `agentOwn` names what it may do by the company's rule. Without `personOf` nothing changes.
  
  **Refusals and confirmations are recorded.** `createBookiAgent({ audit })` gets every refused step and every confirmed marked step. `allow` may answer `{ allow, by }` to say who decided; `AuditEvent` has `decidedBy`.
  
  **Whose change it was.** The `on…Change` callbacks of the workflow controls in `@booki/react` are typed with `{ reason, source }`; `BankReconciliation` now passes it on.
  
  **Shorter snapshots.** AccountPicker, TaxCodeSelect and CurrencySelect with more than 30 items list none in the snapshot (`itemsHint` says how to `query`), and an unknown value is refused with the nearest items and the count, under the code `select.unknown-…-more`. Voucher refusals for a long chart name the nearest accounts.
  
  Also: `@booki/styles` ships types for its CSS imports, `usePrimitive`, `usePart` and `personOnly` are exported from `@booki/react`, and the agent's cursor scrolls to a control a sticky bar covers.

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

### Patch Changes

- [#38](https://github.com/Walgermo/booki/pull/38) [`8c4cc04`](https://github.com/Walgermo/booki/commit/8c4cc04121bdd236014694fb0d9bc9894e294db3) Thanks [@Walgermo](https://github.com/Walgermo)! - Mark what is supported (React with the NO and US profiles) and what is experimental (Vue, Svelte, Solid, Web Components, and the SE, DK, GB and DE profiles) in the package descriptions and READMEs. Nothing is removed.

- [#46](https://github.com/Walgermo/booki/pull/46) [`463ce49`](https://github.com/Walgermo/booki/commit/463ce491dbb4bc41463249ed8a2a48c68be93274) Thanks [@Walgermo](https://github.com/Walgermo)! - One rule for payment references in `PaymentReferenceInput` and `PaymentBatch`: a KID always reads `[redacted]` to an agent; a memo or invoice reference does not, unless the app sets the new `secretReference` option. `PaymentBatch` used to hide every reference; in React it now follows the country profile, so a US batch shows its memos to an agent. The primitive's new `referenceKind` option defaults to `"kid"`, so a batch that does not say still hides its references.

- [#54](https://github.com/Walgermo/booki/pull/54) [`248f969`](https://github.com/Walgermo/booki/commit/248f969dce8de4825462586af009f9f4ac670fca) Thanks [@Walgermo](https://github.com/Walgermo)! - Built on `@ui-sdk/*` 0.1.0-beta.16 (was beta.14), and the peer dependencies ask for it exactly, so move your `@ui-sdk` packages with Booki. The release only fixes behaviour: Escape closes an open layer such as a tooltip before a page shortcut runs, a hover-opened submenu closes first on Escape, an OTP field reads digits from other scripts, a dialog keeps focus when Safari's Tab skips its buttons, and placed content keeps its arrow keys when items arrive late. No Booki API changes. beta.16 was published on 2026-11-23; under a release-age rule (pnpm 11 waits one day by default) it installs from 2026-11-24.
- Updated dependencies [[`8c4cc04`](https://github.com/Walgermo/booki/commit/8c4cc04121bdd236014694fb0d9bc9894e294db3), [`463ce49`](https://github.com/Walgermo/booki/commit/463ce491dbb4bc41463249ed8a2a48c68be93274), [`68dfebb`](https://github.com/Walgermo/booki/commit/68dfebb571717827b6cbea10b27ec70e1f316954), [`7a4e413`](https://github.com/Walgermo/booki/commit/7a4e4136653cd61cd14a3d7e93a3dd7dd85199d5), [`2a16ea2`](https://github.com/Walgermo/booki/commit/2a16ea25f6ec4c2481b49186b652d596d22182dc), [`40c1fdd`](https://github.com/Walgermo/booki/commit/40c1fddc823ef72ce385299ff6d949fb3374e434), [`acebca2`](https://github.com/Walgermo/booki/commit/acebca2f533c60e26295f19ee36b183f5be000eb), [`7987885`](https://github.com/Walgermo/booki/commit/7987885629a47347c9eec5b20a5b0ad627fa407d), [`8ff62af`](https://github.com/Walgermo/booki/commit/8ff62afea24f6aab6b192f0354db59f47f0dccfa), [`734ba40`](https://github.com/Walgermo/booki/commit/734ba40e5af914992ad35bb0617c543165e72210), [`6a1dbc2`](https://github.com/Walgermo/booki/commit/6a1dbc22a6169e5fc4b449d0708f09467b642d7d), [`8ce3a6d`](https://github.com/Walgermo/booki/commit/8ce3a6d3edb44b012799966dfe364f7825204b1b), [`bef5808`](https://github.com/Walgermo/booki/commit/bef580862c3c12fabeb769ef46c85c3b41d36ca4), [`248f969`](https://github.com/Walgermo/booki/commit/248f969dce8de4825462586af009f9f4ac670fca), [`e77f270`](https://github.com/Walgermo/booki/commit/e77f270551099a0d53a70a481459de0a8fc3993f)]:
  - @booki/core@0.2.0
  - @booki/primitives@0.2.0

## 0.1.0

First preview. Not yet on npm: Booki is published once v1 has run in a real product.
