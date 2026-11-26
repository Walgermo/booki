# @booki/primitives

## 0.4.3

### Patch Changes

- Updated dependencies []:
  - @booki-aui/core@0.4.3

## 0.4.2

### Patch Changes

- [#152](https://github.com/Walgermo/booki/pull/152) [`c0d5491`](https://github.com/Walgermo/booki/commit/c0d5491d32c8d815626a182dbc2a76b967df7c7d) Thanks [@Walgermo](https://github.com/Walgermo)! - `logActivity` takes an optional `today` (YYYY-MM-DD): an entry dated with no time is checked against the person's own date rather than the UTC one. ActivityTimeline passes the local date.

- [#158](https://github.com/Walgermo/booki/pull/158) [`1b151e4`](https://github.com/Walgermo/booki/commit/1b151e4385f9c826ebcc453458917b62a6c2f0c3) Thanks [@Walgermo](https://github.com/Walgermo)! - `timeline` and `lastTouch` take an optional `{ dayStart: "local" }`: an entry dated with no time then starts at the beginning of that day in the runtime's time zone instead of UTC midnight. The default stays UTC. ActivityTimeline passes it, so east of UTC a date-only contact no longer outranks a timed one made earlier that same local day.

- [#158](https://github.com/Walgermo/booki/pull/158) [`1b151e4`](https://github.com/Walgermo/booki/commit/1b151e4385f9c826ebcc453458917b62a6c2f0c3) Thanks [@Walgermo](https://github.com/Walgermo)! - AmountField: deleting the text of a controlled amount whose owner keeps its value reports the clear once (`onValueChange(null)` and `onEmpty`), not again on blur. Deleting it again later is reported again.

- [#153](https://github.com/Walgermo/booki/pull/153) [`db02f38`](https://github.com/Walgermo/booki/commit/db02f385f4366b3a7811aaa033bf70ef0c82a561) Thanks [@Walgermo](https://github.com/Walgermo)! - AmountField: emptying an amount (`clear`, `setMinor(null)`, deleting the text) is now reported on `minor` as well as `empty`, so history can undo it and put the amount back. A controlled field whose owner does not pass the new `value` back keeps both its amount and its emptiness, instead of reading empty (or filled) while it still holds the old value.

- [#153](https://github.com/Walgermo/booki/pull/153) [`db02f38`](https://github.com/Walgermo/booki/commit/db02f385f4366b3a7811aaa033bf70ef0c82a561) Thanks [@Walgermo](https://github.com/Walgermo)! - Audit rows for agent refusals are written once, by whichever side has an `audit`. A press on a person's decision through `registerTools(agent, { allow: "bridge", audit })`, on an agent without its own `audit`, now writes its `agent.person-only` row with the registration's actor; a step `allow` refused on such an agent is written by `actAndRecord` instead of being skipped. A refusal for a control the agent named by its label in another case or without its accents is no longer written twice.

- [#152](https://github.com/Walgermo/booki/pull/152) [`c0d5491`](https://github.com/Walgermo/booki/commit/c0d5491d32c8d815626a182dbc2a76b967df7c7d) Thanks [@Walgermo](https://github.com/Walgermo)! - InvoiceEditor price cells and AuditWorkpaper misstatement cells show an amount at its currency's own decimals (none for CLP or JPY, three for BHD), so editing the figure shown stores the same amount. A supplier invoice's currency correction refuses a three-letter code with no ISO minor unit, such as "UDS", instead of saving one that cannot be formatted.

- [#153](https://github.com/Walgermo/booki/pull/153) [`db02f38`](https://github.com/Walgermo/booki/commit/db02f385f4366b3a7811aaa033bf70ef0c82a561) Thanks [@Walgermo](https://github.com/Walgermo)! - The Norwegian agent cursor says an amount in the field's own currency: `setMinor(125000)` on a yen field reads "setter beløp 125 000", not "1 250,00". AmountField's root carries `data-currency`, which the cursor reads; where no currency is known it shows the minor units as given rather than guessing kroner.

- [#153](https://github.com/Walgermo/booki/pull/153) [`db02f38`](https://github.com/Walgermo/booki/commit/db02f385f4366b3a7811aaa033bf70ef0c82a561) Thanks [@Walgermo](https://github.com/Walgermo)! - PaymentBatch: a reference that is a KID (digits with a valid mod-10 or mod-11 check digit) reads "[redacted]" to an agent even when the batch is shown under a profile whose references are memos, like the US one. Turning on `secretReference` after the batch is on the page now hides `payments` as well as the list's rows.

- [#153](https://github.com/Walgermo/booki/pull/153) [`db02f38`](https://github.com/Walgermo/booki/commit/db02f385f4366b3a7811aaa033bf70ef0c82a561) Thanks [@Walgermo](https://github.com/Walgermo)! - An agent's press on Release or Approve in PaymentBatch, Sign off in CloseChecklist, Approve, Reject or Escalate in ApprovalChain, or Finalize in InvoiceEditor is now refused by name ("This is a person's decision …") with an `agent.person-only` audit row, instead of "nothing to press". The buttons carry `data-person-only`, which names the decision without marking the component's other agent actions the way `data-agent-confirm` on its own button would.

- [#153](https://github.com/Walgermo/booki/pull/153) [`db02f38`](https://github.com/Walgermo/booki/commit/db02f385f4366b3a7811aaa033bf70ef0c82a561) Thanks [@Walgermo](https://github.com/Walgermo)! - BankReconciliation: a layout of your own built on `BankReconciliationRoot` gets the unmatched bank lines and posts with their payment references again (`unmatchedBankLines`, `unmatchedPosts`), as its types say. The agent's snapshot still reads only the references' tags.
- Updated dependencies [[`c0d5491`](https://github.com/Walgermo/booki/commit/c0d5491d32c8d815626a182dbc2a76b967df7c7d), [`1b151e4`](https://github.com/Walgermo/booki/commit/1b151e4385f9c826ebcc453458917b62a6c2f0c3), [`c0d5491`](https://github.com/Walgermo/booki/commit/c0d5491d32c8d815626a182dbc2a76b967df7c7d), [`1b151e4`](https://github.com/Walgermo/booki/commit/1b151e4385f9c826ebcc453458917b62a6c2f0c3), [`c0d5491`](https://github.com/Walgermo/booki/commit/c0d5491d32c8d815626a182dbc2a76b967df7c7d), [`c0d5491`](https://github.com/Walgermo/booki/commit/c0d5491d32c8d815626a182dbc2a76b967df7c7d), [`1b151e4`](https://github.com/Walgermo/booki/commit/1b151e4385f9c826ebcc453458917b62a6c2f0c3), [`c0d5491`](https://github.com/Walgermo/booki/commit/c0d5491d32c8d815626a182dbc2a76b967df7c7d)]:
  - @booki-aui/core@0.4.2

## 0.4.1

### Patch Changes

- Updated dependencies [[`33ad13c`](https://github.com/Walgermo/booki/commit/33ad13c47dfb54f263a5dc7a3a345085e8b46d16)]:
  - @booki-aui/core@0.4.1

## 0.4.0

### Patch Changes

- [#138](https://github.com/Walgermo/booki/pull/138) [`889d7b0`](https://github.com/Walgermo/booki/commit/889d7b094fec6db989f9009456ffb9a0734484a5) Thanks [@Walgermo](https://github.com/Walgermo)! - Keep the full English message catalogue out of the standalone AmountField bundle by loading only amount, money, and locale messages at startup. The complete English and Norwegian catalogues remain available through the translation API.

- [#136](https://github.com/Walgermo/booki/pull/136) [`ff41c97`](https://github.com/Walgermo/booki/commit/ff41c973b01bde428c59c9542b0b8468ba40925c) Thanks [@Walgermo](https://github.com/Walgermo)! - Keep invalid AmountField drafts visible for correction and block native form submission until the amount is valid.
- Updated dependencies [[`889d7b0`](https://github.com/Walgermo/booki/commit/889d7b094fec6db989f9009456ffb9a0734484a5), [`2222b4b`](https://github.com/Walgermo/booki/commit/2222b4bc1413edc8f09f6426806428c39a63633b), [`46d3d02`](https://github.com/Walgermo/booki/commit/46d3d02b3f6995d4d1324502b466cc3b83ce3ff4), [`ff41c97`](https://github.com/Walgermo/booki/commit/ff41c973b01bde428c59c9542b0b8468ba40925c)]:
  - @booki-aui/core@0.4.0

## 0.3.3

### Patch Changes

- Updated dependencies []:
  - @booki-aui/core@0.3.3

## 0.3.2

### Patch Changes

- Updated dependencies [[`a6462a0`](https://github.com/Walgermo/booki/commit/a6462a086d56505249a3d6fa8481aa8f6dcd04b8)]:
  - @booki-aui/core@0.3.2

## 0.3.1

### Patch Changes

- Updated dependencies [[`536a34a`](https://github.com/Walgermo/booki/commit/536a34a8fb35f575862ec5cfee06fe74000dac75)]:
  - @booki-aui/core@0.3.1

## 0.3.0

### Minor Changes

- [#120](https://github.com/Walgermo/booki/pull/120) [`6a7055c`](https://github.com/Walgermo/booki/commit/6a7055c05fad4d0dacda520afc5fe5823750fa4c) Thanks [@Walgermo](https://github.com/Walgermo)! - Breaking while Booki is 0.x, so this is a minor.
  
  `AmountField` and the other form controls now put `aria-invalid`, `aria-describedby` and `aria-errormessage` on the visible input instead of the wrapper, so a screen reader announces an error on the field. If you set `aria-describedby` on one of them and relied on it reaching the wrapper, move it to a wrapper of your own. On the US bank field the account-number input now takes `aria-invalid` too.
  
  With `allowEmpty`, `AmountField` now calls `onValueChange(null)` at runtime when the field is emptied (clearing it, or deleting its text). A handler that does arithmetic on the value or calls `money()` on it must handle `null`. `onEmpty` still fires, after `onValueChange`. In types, `onValueChange` is `(minor: number | null, details?) => void` whenever `allowEmpty` is `true` or a `boolean` variable, so a handler typed `(minor: number)` there no longer type-checks: accept `number | null`. With `allowEmpty` left out or `false` the handler still gets a `number`. `<AmountField>` infers this from its own props. The exported `AmountFieldProps` defaults to `boolean`, so a wrapper `function MyAmount(props: AmountFieldProps)` accepts `allowEmpty` and a `number | null` handler; write `AmountFieldProps<false>` to keep a wrapper on a `number` handler. The props are now listed in the catalog and the skill.
  
  `useBookiField` takes `group: false` for a field that already has its own labelled group (a `fieldset` with a `legend`): the root loses `role="group"`, so the group is not announced twice. It also has a new `account` kind (`setAccount`): digits of a length range, or a closed `chart` whose unknown numbers are refused with the nearest accounts, in English and Norwegian. An empty number is refused with "an account number is needed" with or without a chart. The check applies to a whole number, so a render that a person types into keeps a draft and calls `change` on blur (see `docs/own-controls.md`).

### Patch Changes

- Updated dependencies [[`6a7055c`](https://github.com/Walgermo/booki/commit/6a7055c05fad4d0dacda520afc5fe5823750fa4c), [`1c95020`](https://github.com/Walgermo/booki/commit/1c95020e1ea0a99556ea58b79e0a590711fdb621)]:
  - @booki-aui/core@0.3.0

## 0.2.1

### Patch Changes

- Updated dependencies []:
  - @booki-aui/core@0.2.1

## 0.2.0

### Minor Changes

- [#93](https://github.com/Walgermo/booki/pull/93) [`ec89785`](https://github.com/Walgermo/booki/commit/ec8978566d2a81ee14eb94cc5163a2490ea824a9) Thanks [@Walgermo](https://github.com/Walgermo)! - The packages are now named `@booki-aui/*` and are published to npm (the `@booki` scope on npm belongs to someone else). Install with `pnpm add @booki-aui/core @booki-aui/react @booki-aui/styles`, and replace `@booki/` with `@booki-aui/` in your imports, for example `import { createBookiAgent } from "@booki-aui/react"` and `import "@booki-aui/styles"`. Nothing else changed.

### Patch Changes

- Updated dependencies [[`ec89785`](https://github.com/Walgermo/booki/commit/ec8978566d2a81ee14eb94cc5163a2490ea824a9)]:
  - @booki-aui/core@0.2.0

## 0.1.7

### Patch Changes

- [#83](https://github.com/Walgermo/booki/pull/83) [`3fe7338`](https://github.com/Walgermo/booki/commit/3fe7338a650bbc8a6c900693bc8f93abba937a0a) Thanks [@Walgermo](https://github.com/Walgermo)! - An `act` call without `steps`, like `{ "step": [] }` from a model that got the shape wrong, now comes back with ui-sdk's sentence (`act takes { "steps": [...] }, not …`) instead of throwing a TypeError. Through WebMCP the model used to get only "Tool execution failed". With `language: "nb"`, ui-sdk's sentences about a call in the wrong shape (no `steps`, a field `act` doesn't take, a step without a ref, an action or a value) come back in Norwegian.
- Updated dependencies [[`3fe7338`](https://github.com/Walgermo/booki/commit/3fe7338a650bbc8a6c900693bc8f93abba937a0a)]:
  - @booki/core@0.1.7

## 0.1.6

### Patch Changes

- [#80](https://github.com/Walgermo/booki/pull/80) [`1054c6e`](https://github.com/Walgermo/booki/commit/1054c6e79f3418e1fb9560beea50b7b027f82bff) Thanks [@Walgermo](https://github.com/Walgermo)! - Booki and the bridge features of ui-sdk beta.17, lined up:
  
  - **The bridge's new sentences in Norwegian.** With `createBookiAgent({ language: "nb" })`, a `set` step that didn't take ("tok ikke: verdien er fortsatt …"), one that landed on another value, a failed `expect`, and a number outside min and max now come back in Norwegian like the rest of the bridge's sentences.
  - **A failed `expect` writes no audit row.** `actAndRecord` recorded it as `agent.failed`, but a check changes nothing and refuses nothing. A refused change is still recorded.
  - **Long lists page with `from`.** The `itemsHint` of `AccountPicker`, `CurrencySelect`, `TaxCodeSelect` and `useBookiFieldCode` says that `query({ within, from: 50 })` reads the next 50, next to the bridge's own `more` count.
  - **Docs.** The skill and the catalog show `expect` before a save, which components it works on (fields with a value, not record components), and what "didn't take" means for a controlled field.
- Updated dependencies [[`1054c6e`](https://github.com/Walgermo/booki/commit/1054c6e79f3418e1fb9560beea50b7b027f82bff)]:
  - @booki/core@0.1.6

## 0.1.5

### Patch Changes

- [#78](https://github.com/Walgermo/booki/pull/78) [`326ce38`](https://github.com/Walgermo/booki/commit/326ce386d087c74fb359a3508ccf4a416a41adea) Thanks [@Walgermo](https://github.com/Walgermo)! - Built on `@ui-sdk/*` 0.1.0-beta.17 (was beta.16), and the peer dependencies ask for it exactly, so move your `@ui-sdk` packages with Booki.
  
  What changes for an agent, from ui-sdk: `act` checks the shape of the whole call before it runs, so a step with an unknown key or `args` that is not a list fails with a message instead of being half-read; a `setX` action that leaves `x` unchanged, or sets a different value, now fails and says what the value is; a number outside a control's min and max is refused, not clamped; `agentTools` lists `act` first. New in the bridge: an `expect` step, `closed` and `from` on `query`, and `more` and `section` in long snapshots.
  
  What changes in Booki:
  
  - `LedgerTable`'s `page` state is 1-based, the same as `table.page` and `setPage`. It was 0-based, so `setPage(3)` left `page: 2`, which ui-sdk now reports as a failed step.
  - `@booki/svelte` no longer needs `ssr: { noExternal: [...] }`: `@ui-sdk/svelte` imports its own files with extensions now. Load it through Vite with the Svelte plugin as before.
  - `@booki/primitives` and `@booki/react` no longer copy ui-sdk declaration files into `dist`, since `@ui-sdk/core` exports `SlotProps` now.
  
  beta.17 was published on 2026-11-24; under a release-age rule (pnpm 11 waits one day by default) it installs from 2026-11-25.
- Updated dependencies []:
  - @booki/core@0.1.5

## 0.1.4

### Patch Changes

- [#75](https://github.com/Walgermo/booki/pull/75) [`520026a`](https://github.com/Walgermo/booki/commit/520026a6eea792c8186387a7dbc285b97628de36) Thanks [@Walgermo](https://github.com/Walgermo)! - Safer agent integrations. A press on a button that is a person's decision (signing off, releasing, sending) is refused with "This is a person's decision …" and an `agent.person-only` audit row, also when the control takes no `press` of its own; it used to answer "nothing to press now" and leave no trace. `registerTools(agent, { allow: "bridge" })` lets the bridge's own `allow` decide each step once (no second prompt), answers in the agent's `language`, records a control's own refusals with `audit`, and takes a `prefix` for the tool names (`acme_snapshot`); it also registers where the browser's `registerTool` returns no promise. `attachAudit` writes a change to a list or record per record and field, with the step in front when one `act` ran one step, instead of a cut-off JSON diff. The install guide's WebMCP example now uses `allow: "bridge"`: if you copied it, drop the second `allow`.
- Updated dependencies []:
  - @booki/core@0.1.4

## 0.1.3

### Patch Changes

- [#69](https://github.com/Walgermo/booki/pull/69) [`85bde56`](https://github.com/Walgermo/booki/commit/85bde56ab298f00f1b08e326bb26610457d416f8) Thanks [@Walgermo](https://github.com/Walgermo)! - Four sales reports. `FunnelChart`: how many records reached each step, the conversion from the step before and from the first, the drop-off and the biggest drop; a step that rises is reported. `ForecastChart`: won, committed, best case and weighted revenue per month or quarter, from the same deals and stages as `DealPipeline`, naming the deals it leaves out (no close date, no amount or one without a source, another currency). `RecurringRevenue`: opening, new, expansion, contraction, churn and closing between two dates, as MRR or ARR; agreements billed per month, quarter or year are summed exactly per year, and the monthly view says what rounding moved. `StageDurationChart`: median and longest days per stage, a target per stage, and the deals over it. Rules in `@booki/core/funnel`, `@booki/core/recurring` and `forecastByPeriod` / `timeInStage` in `@booki/core/pipeline`. The catalog has recipes for win rate, a leaderboard, MRR over time, and working without stage history.
- Updated dependencies [[`85bde56`](https://github.com/Walgermo/booki/commit/85bde56ab298f00f1b08e326bb26610457d416f8)]:
  - @booki/core@0.1.3

## 0.1.2

### Patch Changes

- [#67](https://github.com/Walgermo/booki/pull/67) [`d7816ae`](https://github.com/Walgermo/booki/commit/d7816ae204780a08b4b1097699e57aaf47002626) Thanks [@Walgermo](https://github.com/Walgermo)! - `useBookiField` with `kind: "code"` takes `personOnly`: values only a person may choose, such as a deal's won and lost stages in a stage select the product already has. An agent's `setCode` to one of them is refused with a sentence that names it; a person's change, which passes its DOM event, goes through; the snapshot lists them.
  
  `CurrencySelect` names its trigger in the person's language ("Valuta" on a Norwegian screen) and takes a `label` option, like the other pickers.
- Updated dependencies [[`d7816ae`](https://github.com/Walgermo/booki/commit/d7816ae204780a08b4b1097699e57aaf47002626)]:
  - @booki/core@0.1.2

## 0.1.1

### Patch Changes

- [#65](https://github.com/Walgermo/booki/pull/65) [`201f7c9`](https://github.com/Walgermo/booki/commit/201f7c9d1aa843ab3a7c75ebbeb87df831110c08) Thanks [@Walgermo](https://github.com/Walgermo)! - Two controls for sales and customer work. `DealPipeline` is a board of deals in stages with each stage's totals per currency and a weighted forecast: an agent moves open deals, records a value with its source (`setValue`), and sets the expected close date and the owner; a value without a source is shown and never summed; marking a deal won or lost, and reopening it, are a person's buttons. `ActivityTimeline` is a customer's history and next steps: an agent logs calls, emails, meetings and notes, and schedules, reschedules and completes tasks, each recorded as the agent's; removing an entry is a person's. Rules in `@booki/core/pipeline` and `@booki/core/activity`, the `deal.close` and `activity.remove` permissions, a `sales` starter role, and `guardCloseDeal` for the server. `deal.close` is a person's decision: `PERSON_ONLY` and the readiness check now list it.
- Updated dependencies [[`201f7c9`](https://github.com/Walgermo/booki/commit/201f7c9d1aa843ab3a7c75ebbeb87df831110c08)]:
  - @booki/core@0.1.1

## 0.1.0

The first release. It is not on npm: Booki is published once v1 has run in a real
product. Install it from a clone with `pnpm pack:local` (the install guide in
`skills/booki/SKILL.md` has the steps), with `@ui-sdk/core` and `@ui-sdk/react` at
exactly `0.1.0-beta.16`.

- **Supported:** React 19 (`@booki/react` with `@booki/core`, `@booki/primitives` and
  `@booki/styles`), and the Norway (NO) and United States (US) country profiles.
- **Experimental:** Vue, Svelte, Solid and Web Components (`@booki/vue`,
  `@booki/svelte`, `@booki/solid`, `@booki/web`), generated from the same primitives,
  and the SE, DK, GB and DE starter profiles.
- Accounting and audit controls an agent operates by name through the ui-sdk bridge:
  amounts in minor units, vouchers that must balance, bank account, IBAN and KID
  redacted from the snapshot, periods, VAT, invoices, payment batches, reconciliation,
  approvals, close, findings and workpapers. `useBookiField` gives a field you keep
  Booki's agent action and rules.
- Approving, signing off, finalizing and releasing are a person's: never an agent
  action, refused by `createBookiAgent` whatever the app allows, and by the server
  guards in `@booki/core/server` (`PERSON_ONLY`). `data-agent-confirm` steps wait for
  the person; `attachAudit` and `actAndRecord` record what the agent did, what it was
  refused and who decided.
- Refusals, the bridge's own sentences and the agent cursor in English and Norwegian
  (`createBookiAgent({ language: "nb" })`).
- Fixed in seven rounds of a product pilot in a real app, from the install guide.
