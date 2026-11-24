# @booki/core

## 0.2.0

### Minor Changes

- [`91594bd`](https://github.com/Walgermo/booki/commit/91594bd45de42ed804824173c43d352dc2101e94) Thanks [@Walgermo](https://github.com/Walgermo)! - **A person's decision is refused for an agent in every framework.** `createBookiAgent` in `@booki/web`, `vue`, `svelte` and `solid` now refuses a person-only step whatever `allow` says, as `@booki/react` did, and `registerTools` refuses it for the browser's own agent too.
  
  **An agent does no more than the person it acts for.** Pass `personOf` in the server guard's context and the person's current roles and entities limit the agent; `agentOwn` names what it may do by the company's rule. Without `personOf` nothing changes.
  
  **Refusals and confirmations are recorded.** `createBookiAgent({ audit })` gets every refused step and every confirmed marked step. `allow` may answer `{ allow, by }` to say who decided; `AuditEvent` has `decidedBy`.
  
  **Whose change it was.** The `on…Change` callbacks of the workflow controls in `@booki/react` are typed with `{ reason, source }`; `BankReconciliation` now passes it on.
  
  **Shorter snapshots.** AccountPicker, TaxCodeSelect and CurrencySelect with more than 30 items list none in the snapshot (`itemsHint` says how to `query`), and an unknown value is refused with the nearest items and the count, under the code `select.unknown-…-more`. Voucher refusals for a long chart name the nearest accounts.
  
  Also: `@booki/styles` ships types for its CSS imports, `usePrimitive`, `usePart` and `personOnly` are exported from `@booki/react`, and the agent's cursor scrolls to a control a sticky bar covers.

- [`39dc3c7`](https://github.com/Walgermo/booki/commit/39dc3c78569baa386460d1ec1b7c250a73c4df3f) Thanks [@Walgermo](https://github.com/Walgermo)! - The rest of the second pilot's points:
  
  - **KpiStat** shows "Not set" for a figure with no value (snapshot `set: false`, no issue), leaves out the "No comparison" line unless `showNoComparison`, and shows whole amounts without ",00" (`trimZeroFraction`, default true). `formatMoney` takes `trimZeroFraction`.
  - **AmountField** can be empty, which is not 0: `allowEmpty`, `value={null}`, `onEmpty`, and `empty` in the snapshot. `clear` and deleting the text empty it; `setMinor(0)` fills it with 0. Without `allowEmpty` nothing changes.
  - **@booki/styles** is minified (170 KB, 17 KB gzipped, was 216 KB and 25 KB) and comes as `base.css` plus `controls/<name>.css`, so a page loads only the controls it uses.

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

- [`3eb4630`](https://github.com/Walgermo/booki/commit/3eb46309940c4ec5c901329c23ea3d27dc4da628) Thanks [@Walgermo](https://github.com/Walgermo)! - Fixes from an internal security review.
  
  - **Bank reconciliation no longer shows payment references (KIDs) to an agent.** `unmatchedBankLines` and `unmatchedPosts` carry `referenceTag` (`ref-1`, …), equal for a line and the post with the same reference, instead of `reference`. The person's tables read `openBankLines` and `openPostsLeft`.
  - **A rule's error is no longer sent to the caller.** The server guard answers a duty rule with 403 `permissions.duty` (now thrown as `DutyRefusal`) and `throw new RuleRefusal(sentence)` from your own rule with 422 `server.rule`. Any other error is rethrown. If your rules threw a plain `Error` to refuse, throw `RuleRefusal` instead.
  - **`ApprovalRequest.requestedFor`**: the person whose agent raised a request may not decide it.
  - **`releaseBatch` refuses `requiredApprovals`** that is not a whole number of at least 1.
  - **An empty `entity` is an entity**: an actor limited to other companies is refused, not let through.
  - **Text read off a document** (supplier name, invoice number) is quoted and shortened in Booki's refusal sentences, so it cannot read as Booki's own words.
  - `isPersonOnly` recognises a person-only sentence among several joined confirm marks.

### Patch Changes

- [`8675d44`](https://github.com/Walgermo/booki/commit/8675d4450eb6188909c87347fc94430c25b340ed) Thanks [@Walgermo](https://github.com/Walgermo)! - Mark what is supported (React with the NO and US profiles) and what is experimental (Vue, Svelte, Solid, Web Components, and the SE, DK, GB and DE profiles) in the package descriptions and READMEs. Nothing is removed.

- [`9523b89`](https://github.com/Walgermo/booki/commit/9523b8963d421246d44a03c8393a4342812f73ff) Thanks [@Walgermo](https://github.com/Walgermo)! - The format hints, examples and refusals of VoucherComposer, InvoiceEditor, SupplierInvoiceInbox, AuditFindings and ExpenseClaim use new example values (account 7140, VAT code 11, "Kursdag" at 980,00). The old ones were the answers of the benchmark's tasks.

- [#61](https://github.com/Walgermo/booki/pull/61) [`e755569`](https://github.com/Walgermo/booki/commit/e755569d52e5b738af75460f19d5fc301cfa8205) Thanks [@Walgermo](https://github.com/Walgermo)! - Norwegian for the bridge and the cursor's amounts.
  
  - **`createBookiAgent({ language: "nb" })`** now also translates the agent bridge's own sentences: a missing component ("Ingen komponent … på siden. Merkelappene på siden: …"), a step that needs a person, the person saying no, a cancelled or unanswered step, a missing or disabled button, an unknown item, and a step without a ref or an action. Before, only Booki's own refusals were Norwegian, and the model and the audit row got these in English. The sentences are in `@booki/core/messages` under `bridge.*`.
  - **`narrateNorwegian`** shows an amount as a person writes it: "setter beløp 1 250,00", not "setter beløp 125000".

- [`2d516a9`](https://github.com/Walgermo/booki/commit/2d516a9b378a466636b3c8f68a90671a6a05b647) Thanks [@Walgermo](https://github.com/Walgermo)! - From the fourth product pilot, run in a real app:
  
  - **`@booki/styles` no longer styles the product's own fields inside `useBookiField`.** The base rules for buttons, labels, selects and text reached into `field-amount`, `field-code` and `field-date`, whose markup is the product's, and made its labels invisible. The build now stops if a `useBookiField` kind is in the base scope again, and `base.css` is back to 57,463 B.
  - **`useBookiField` code kind takes an option's label too** (any case), and a refusal lists each option as `value (label)`, so it says what `setCode` takes. A label two options share is refused.
  - **`useBookiField` can be empty:** `allowEmpty` on an amount reads `minor: null` and `setMinor(null)` empties it; on a code, `setCode("")` or `setCode(null)` clears it.
  - **`AccountPicker`'s `onValueChange` type** now declares the `{ reason, source }` it already received.

- [#62](https://github.com/Walgermo/booki/pull/62) [`b3e37e4`](https://github.com/Walgermo/booki/commit/b3e37e4a71af5b467d93fb2775b06a4089916927) Thanks [@Walgermo](https://github.com/Walgermo)! - From the seventh product pilot, run in a real app:
  
  - **An undo is the person's.** ui-sdk's history puts values back through the bridge, so an undo reported `source: "agent"` and `attachAudit` recorded it as the agent's work. `createBookiHistory(agent, { by })` and `createHistory` now record an undo or a seek under `by` (a person's actor id, or a function that returns the one signed in; default `"person"`), and `isHistoryRestoring()` is true while the values go back, for your own change callbacks.
  - **What a step did, in Norwegian.** With `createBookiAgent({ language: "nb" })`, a step's own sentence (`Pressed "Bokfør".`, `… is closed now.`, `Its action is still running.`) comes back as `Trykket på "Bokfør".` and so on, like the refusals already did.
  - **A record's status in the person's language.** A Norwegian sentence such as `finding.not-draft` or `invoice.locked` wrote the status in English ("er confirmed"); it now reads "er bekreftet". A status the agent sent, quoted in the sentence, stays as it must be sent. A missing status reads "without a status" ("uten status") instead of a literal `{status}`.
  - **One closing stop.** A sentence that ends in a question ("…: Godkjenne fakturaen?") no longer ends in "?.".
  - **The cursor's label stays in the window.** Near the right edge it sits left of the pointer, and it is cut with "…" before it would leave the window (`cursorLabelRoom` in `@booki/primitives/agent-cursor`).
  - **Readiness says when it measured another page.** When the page sends the browser on (often to a sign-in page), the report has `redirectedFrom`, and the console and HTML report say to pass `--storage-state`.

- [`f402123`](https://github.com/Walgermo/booki/commit/f4021237e5a730045eb3d392fccb9e90a2edc707) Thanks [@Walgermo](https://github.com/Walgermo)! - `VoucherComposer`'s `setForeign` is easier for an agent to call right the first time. The snapshot has a new `foreignFormat` hint that says the argument order and the units (the amount in minor units, the rate in millionths). The three values may also come as one object, `setForeign(lineId, { currency, amountMinor, rateScaled })`. A wrong value is refused with which one it is, its unit and the whole call written out, in English and Norwegian, where it used to say only "got NaN".

- [`fc45832`](https://github.com/Walgermo/booki/commit/fc4583221658c7781d39bb889c21259aefc1a14d) Thanks [@Walgermo](https://github.com/Walgermo)! - **A company can block sign-off while points are open.** `DocumentSignoff` takes `blockOpenPoints` (off by default: open points still go with the signature). `signObstacles` and `signDocument` take `{ blockOpenPoints }`, and `guardSignDocument` in `@booki/core/server` applies the same rule and refuses an agent at every level. New message `signoff.open-points`, in English and Norwegian.

- [`3791466`](https://github.com/Walgermo/booki/commit/379146662f849e6d4eacb5298a66a259ca3d3c6e) Thanks [@Walgermo](https://github.com/Walgermo)! - Test coverage can now be measured with the new test:coverage script; CI reports it.

- [`b46512f`](https://github.com/Walgermo/booki/commit/b46512f90e8ad1adad660834dada0e0d4fd32161) Thanks [@Walgermo](https://github.com/Walgermo)! - `useBookiField` wraps an amount, a closed-list code or a date field you already have and gives it `setMinor`, `setCode` or `setDate` with Booki's rules, refusals in English and Norwegian, and the same audit and source reporting as Booki's own controls. Your field stays as it is; `render` returns it. New `field.unknown-code` messages name the options that exist.

## 0.1.0

First preview. Not yet on npm: Booki is published once v1 has run in a real product.
