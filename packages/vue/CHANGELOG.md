# @booki/vue

## 0.2.0

### Minor Changes

- [`91594bd`](https://github.com/Walgermo/booki/commit/91594bd45de42ed804824173c43d352dc2101e94) Thanks [@Walgermo](https://github.com/Walgermo)! - **A person's decision is refused for an agent in every framework.** `createBookiAgent` in `@booki/web`, `vue`, `svelte` and `solid` now refuses a person-only step whatever `allow` says, as `@booki/react` did, and `registerTools` refuses it for the browser's own agent too.
  
  **An agent does no more than the person it acts for.** Pass `personOf` in the server guard's context and the person's current roles and entities limit the agent; `agentOwn` names what it may do by the company's rule. Without `personOf` nothing changes.
  
  **Refusals and confirmations are recorded.** `createBookiAgent({ audit })` gets every refused step and every confirmed marked step. `allow` may answer `{ allow, by }` to say who decided; `AuditEvent` has `decidedBy`.
  
  **Whose change it was.** The `on…Change` callbacks of the workflow controls in `@booki/react` are typed with `{ reason, source }`; `BankReconciliation` now passes it on.
  
  **Shorter snapshots.** AccountPicker, TaxCodeSelect and CurrencySelect with more than 30 items list none in the snapshot (`itemsHint` says how to `query`), and an unknown value is refused with the nearest items and the count, under the code `select.unknown-…-more`. Voucher refusals for a long chart name the nearest accounts.
  
  Also: `@booki/styles` ships types for its CSS imports, `usePrimitive`, `usePart` and `personOnly` are exported from `@booki/react`, and the agent's cursor scrolls to a control a sticky bar covers.

- [`ed052a5`](https://github.com/Walgermo/booki/commit/ed052a5f3481dac6702da4939423a994584ce39a) Thanks [@Walgermo](https://github.com/Walgermo)! - From the second product pilot:
  
  - `issueAgentToken` and `verifyAgentToken` in `@booki/core/server`: a short-lived, signed credential for an agent working for a person (HMAC-SHA-256 through WebCrypto). A token that is changed, expired or signed with another secret verifies as null.
  - `actAndRecord(agent, input, { audit })`: `act`, plus an `agent.failed` audit row when the control itself refuses a step, which `allow` never sees.
  - A delegation refusal names the roles a person could hold, not the agent's own.
  - The Agent Contract's section 5 lists every decision in `PERSON_ONLY`; a test keeps them the same.

- [`64be5f5`](https://github.com/Walgermo/booki/commit/64be5f5ee04ec2b57bbc6de1cb9eb2263157d606) Thanks [@Walgermo](https://github.com/Walgermo)! - From the third product pilot, run in a real app:
  
  - **Agent tokens have an audience.** `issueAgentToken({ …, audience })`, and `verifyAgentToken(token, secret, { audience })` refuses a token issued for anything else.
  - **One audit row per refusal, with the control's name.** `actAndRecord` no longer writes `agent.failed` for a step `allow` refused (already `agent.refused`), and names the control by its label rather than its ref.
  - **`withRecordedAct(agent, { audit })`**: the bridge with `act` through `actAndRecord`, for `window.agent` and your own model loop.
  - **An empty AmountField reads `value: null` and `minor: null`** (with `allowEmpty`); `setMinor(null)` empties it.

### Patch Changes

- [`8675d44`](https://github.com/Walgermo/booki/commit/8675d4450eb6188909c87347fc94430c25b340ed) Thanks [@Walgermo](https://github.com/Walgermo)! - Mark what is supported (React with the NO and US profiles) and what is experimental (Vue, Svelte, Solid, Web Components, and the SE, DK, GB and DE profiles) in the package descriptions and READMEs. Nothing is removed.

- [`a34a56e`](https://github.com/Walgermo/booki/commit/a34a56ea996a50168444cfe5fe599e02d64a153d) Thanks [@Walgermo](https://github.com/Walgermo)! - One rule for payment references in `PaymentReferenceInput` and `PaymentBatch`: a KID always reads `[redacted]` to an agent; a memo or invoice reference does not, unless the app sets the new `secretReference` option. `PaymentBatch` used to hide every reference; in React it now follows the country profile, so a US batch shows its memos to an agent. The primitive's new `referenceKind` option defaults to `"kid"`, so a batch that does not say still hides its references.

- [`f62785b`](https://github.com/Walgermo/booki/commit/f62785b209c2a7ded51ab74a29ec264e1babbaab) Thanks [@Walgermo](https://github.com/Walgermo)! - Built on `@ui-sdk/*` 0.1.0-beta.16 (was beta.14), and the peer dependencies ask for it exactly, so move your `@ui-sdk` packages with Booki. The release only fixes behaviour: Escape closes an open layer such as a tooltip before a page shortcut runs, a hover-opened submenu closes first on Escape, an OTP field reads digits from other scripts, a dialog keeps focus when Safari's Tab skips its buttons, and placed content keeps its arrow keys when items arrive late. No Booki API changes. beta.16 was published on 2026-11-23; under a release-age rule (pnpm 11 waits one day by default) it installs from 2026-11-24.
- Updated dependencies [[`8675d44`](https://github.com/Walgermo/booki/commit/8675d4450eb6188909c87347fc94430c25b340ed), [`a34a56e`](https://github.com/Walgermo/booki/commit/a34a56ea996a50168444cfe5fe599e02d64a153d), [`9523b89`](https://github.com/Walgermo/booki/commit/9523b8963d421246d44a03c8393a4342812f73ff), [`e755569`](https://github.com/Walgermo/booki/commit/e755569d52e5b738af75460f19d5fc301cfa8205), [`2d516a9`](https://github.com/Walgermo/booki/commit/2d516a9b378a466636b3c8f68a90671a6a05b647), [`b3e37e4`](https://github.com/Walgermo/booki/commit/b3e37e4a71af5b467d93fb2775b06a4089916927), [`5827827`](https://github.com/Walgermo/booki/commit/5827827952db0df5306176495dc6b4bb3bfd6fb7), [`91594bd`](https://github.com/Walgermo/booki/commit/91594bd45de42ed804824173c43d352dc2101e94), [`39dc3c7`](https://github.com/Walgermo/booki/commit/39dc3c78569baa386460d1ec1b7c250a73c4df3f), [`ed052a5`](https://github.com/Walgermo/booki/commit/ed052a5f3481dac6702da4939423a994584ce39a), [`64be5f5`](https://github.com/Walgermo/booki/commit/64be5f5ee04ec2b57bbc6de1cb9eb2263157d606), [`3eb4630`](https://github.com/Walgermo/booki/commit/3eb46309940c4ec5c901329c23ea3d27dc4da628), [`f402123`](https://github.com/Walgermo/booki/commit/f4021237e5a730045eb3d392fccb9e90a2edc707), [`fc45832`](https://github.com/Walgermo/booki/commit/fc4583221658c7781d39bb889c21259aefc1a14d), [`3791466`](https://github.com/Walgermo/booki/commit/379146662f849e6d4eacb5298a66a259ca3d3c6e), [`f62785b`](https://github.com/Walgermo/booki/commit/f62785b209c2a7ded51ab74a29ec264e1babbaab), [`b46512f`](https://github.com/Walgermo/booki/commit/b46512f90e8ad1adad660834dada0e0d4fd32161)]:
  - @booki/core@0.2.0
  - @booki/primitives@0.2.0

## 0.1.0

First preview. Not yet on npm: Booki is published once v1 has run in a real product.
