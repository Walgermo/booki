# @booki/core

## 0.4.0

### Minor Changes

- [#135](https://github.com/Walgermo/booki/pull/135) [`46d3d02`](https://github.com/Walgermo/booki/commit/46d3d02b3f6995d4d1324502b466cc3b83ce3ff4) Thanks [@Walgermo](https://github.com/Walgermo)! - Require credit notes to use the original invoice's currency. If an issued credit note uses a different currency, correct that ledger record before calculating the remaining credit or finalizing another credit note. Invoice calculations now refuse amounts outside the safe integer range.
  
  Money conversions use the published ISO 4217 minor unit, including zero decimals for CLP and three for BHD. For codes without a defined minor unit in the current list, conversion and formatting throw `money.no-minor-unit` and typed amount parsing returns `null`.

### Patch Changes

- [#138](https://github.com/Walgermo/booki/pull/138) [`889d7b0`](https://github.com/Walgermo/booki/commit/889d7b094fec6db989f9009456ffb9a0734484a5) Thanks [@Walgermo](https://github.com/Walgermo)! - Keep the full English message catalogue out of the standalone AmountField bundle by loading only amount, money, and locale messages at startup. The complete English and Norwegian catalogues remain available through the translation API.

- [#141](https://github.com/Walgermo/booki/pull/141) [`2222b4b`](https://github.com/Walgermo/booki/commit/2222b4bc1413edc8f09f6426806428c39a63633b) Thanks [@Walgermo](https://github.com/Walgermo)! - Link the npm package homepages to the Booki installation guide.

- [#136](https://github.com/Walgermo/booki/pull/136) [`ff41c97`](https://github.com/Walgermo/booki/commit/ff41c973b01bde428c59c9542b0b8468ba40925c) Thanks [@Walgermo](https://github.com/Walgermo)! - Keep invalid AmountField drafts visible for correction and block native form submission until the amount is valid.

## 0.3.3

No changes in this release.

## 0.3.2

### Patch Changes

- [#129](https://github.com/Walgermo/booki/pull/129) [`a6462a0`](https://github.com/Walgermo/booki/commit/a6462a086d56505249a3d6fa8481aa8f6dcd04b8) Thanks [@Walgermo](https://github.com/Walgermo)! - With `language: "nb"`, the bridge's own step refusals from ui-sdk now come back in Norwegian too: "… har ingenting å trykke på nå.", "… tar ikke … nå. Den tar: …" and the sentence on what `press` takes. The refusal for an account number with other characters than digits now reads "can only hold digits" ("kan bare inneholde sifre").

## 0.3.1

### Patch Changes

- [#127](https://github.com/Walgermo/booki/pull/127) [`536a34a`](https://github.com/Walgermo/booki/commit/536a34a8fb35f575862ec5cfee06fe74000dac75) Thanks [@Walgermo](https://github.com/Walgermo)! - `useBookiField`: `expect` now works on every kind. Each snapshot holds `value` beside its own key (`minor`, `code`, `account`, `date`), and `expect` compares `value`, so `expect` after `setAccount("2400")` passes instead of reading null. An amount's `value` and `minor` are both integer minor units.
  
  With `language: "nb"`, a failed multi-step `act` now ends in Norwegian: "Stegene før dette er utført." and "Send det på nytt med …" replace the English "The steps before this one stay done." and "Send it again with …". This holds when the failing step's own sentence ends in a list ("Its labels: …", "Buttons: …") or is one the catalogue does not know.
  
  `useBookiField` with `group: false` no longer puts `aria-label` on the root, so `getByLabelText("Your label")` finds the input alone and your visible `<label>` is the only accessible name. The agent still reads the same label, from a `hidden` element inside the root, which is not shown or read aloud with or without `@booki-aui/styles`. If you query that text with `getByText`, it now matches two elements: use `getByLabelText(label)` or `getByText(label, { selector: "label" })`.
  
  `useBookiField`: `value` is now in each kind's `controlled`, so when your `onValueChange` refuses a change on a field you do not update, the agent's `setAccount`, `setCode`, `setDate` or `setMinor` now fails with "didn't take: it is still …" instead of reporting ok.
  
  Docs: render the product's own input inside `useBookiField`, never one that is on the bridge such as ui-sdk's `Input`, or the field appears twice.

## 0.3.0

### Minor Changes

- [#120](https://github.com/Walgermo/booki/pull/120) [`6a7055c`](https://github.com/Walgermo/booki/commit/6a7055c05fad4d0dacda520afc5fe5823750fa4c) Thanks [@Walgermo](https://github.com/Walgermo)! - Breaking while Booki is 0.x, so this is a minor.
  
  `AmountField` and the other form controls now put `aria-invalid`, `aria-describedby` and `aria-errormessage` on the visible input instead of the wrapper, so a screen reader announces an error on the field. If you set `aria-describedby` on one of them and relied on it reaching the wrapper, move it to a wrapper of your own. On the US bank field the account-number input now takes `aria-invalid` too.
  
  With `allowEmpty`, `AmountField` now calls `onValueChange(null)` at runtime when the field is emptied (clearing it, or deleting its text). A handler that does arithmetic on the value or calls `money()` on it must handle `null`. `onEmpty` still fires, after `onValueChange`. In types, `onValueChange` is `(minor: number | null, details?) => void` whenever `allowEmpty` is `true` or a `boolean` variable, so a handler typed `(minor: number)` there no longer type-checks: accept `number | null`. With `allowEmpty` left out or `false` the handler still gets a `number`. `<AmountField>` infers this from its own props. The exported `AmountFieldProps` defaults to `boolean`, so a wrapper `function MyAmount(props: AmountFieldProps)` accepts `allowEmpty` and a `number | null` handler; write `AmountFieldProps<false>` to keep a wrapper on a `number` handler. The props are now listed in the catalog and the skill.
  
  `useBookiField` takes `group: false` for a field that already has its own labelled group (a `fieldset` with a `legend`): the root loses `role="group"`, so the group is not announced twice. It also has a new `account` kind (`setAccount`): digits of a length range, or a closed `chart` whose unknown numbers are refused with the nearest accounts, in English and Norwegian. An empty number is refused with "an account number is needed" with or without a chart. The check applies to a whole number, so a render that a person types into keeps a draft and calls `change` on blur (see `docs/own-controls.md`).

### Patch Changes

- [#116](https://github.com/Walgermo/booki/pull/116) [`1c95020`](https://github.com/Walgermo/booki/commit/1c95020e1ea0a99556ea58b79e0a590711fdb621) Thanks [@Walgermo](https://github.com/Walgermo)! - With `createBookiAgent({ language: "nb" })` a declined confirm now comes back in Norwegian also when the app's confirm text is a question or several sentences ("Bokføre bilag 12. Dette kan ikke angres: vil du fortsette?"); the confirm text of a refusal is read as page text. `toHttp(verdict).body` is typed (`HttpBody<T>`: the value on success, `{ ok: false, code, message, issues? }` on a refusal) instead of `unknown`, so it can be mapped to your own error shape. A person-only refusal no longer lists the refused agent's own roles under "ask someone with one of these roles".

## 0.2.1

No changes in this release.

## 0.2.0

### Minor Changes

- [#93](https://github.com/Walgermo/booki/pull/93) [`ec89785`](https://github.com/Walgermo/booki/commit/ec8978566d2a81ee14eb94cc5163a2490ea824a9) Thanks [@Walgermo](https://github.com/Walgermo)! - The packages are now named `@booki-aui/*` and are published to npm (the `@booki` scope on npm belongs to someone else). Install with `pnpm add @booki-aui/core @booki-aui/react @booki-aui/styles`, and replace `@booki/` with `@booki-aui/` in your imports, for example `import { createBookiAgent } from "@booki-aui/react"` and `import "@booki-aui/styles"`. Nothing else changed.

## 0.1.7

### Patch Changes

- [#83](https://github.com/Walgermo/booki/pull/83) [`3fe7338`](https://github.com/Walgermo/booki/commit/3fe7338a650bbc8a6c900693bc8f93abba937a0a) Thanks [@Walgermo](https://github.com/Walgermo)! - An `act` call without `steps`, like `{ "step": [] }` from a model that got the shape wrong, now comes back with ui-sdk's sentence (`act takes { "steps": [...] }, not …`) instead of throwing a TypeError. Through WebMCP the model used to get only "Tool execution failed". With `language: "nb"`, ui-sdk's sentences about a call in the wrong shape (no `steps`, a field `act` doesn't take, a step without a ref, an action or a value) come back in Norwegian.

## 0.1.6

### Patch Changes

- [#80](https://github.com/Walgermo/booki/pull/80) [`1054c6e`](https://github.com/Walgermo/booki/commit/1054c6e79f3418e1fb9560beea50b7b027f82bff) Thanks [@Walgermo](https://github.com/Walgermo)! - Booki and the bridge features of ui-sdk beta.17, lined up:
  
  - **The bridge's new sentences in Norwegian.** With `createBookiAgent({ language: "nb" })`, a `set` step that didn't take ("tok ikke: verdien er fortsatt …"), one that landed on another value, a failed `expect`, and a number outside min and max now come back in Norwegian like the rest of the bridge's sentences.
  - **A failed `expect` writes no audit row.** `actAndRecord` recorded it as `agent.failed`, but a check changes nothing and refuses nothing. A refused change is still recorded.
  - **Long lists page with `from`.** The `itemsHint` of `AccountPicker`, `CurrencySelect`, `TaxCodeSelect` and `useBookiFieldCode` says that `query({ within, from: 50 })` reads the next 50, next to the bridge's own `more` count.
  - **Docs.** The skill and the catalog show `expect` before a save, which components it works on (fields with a value, not record components), and what "didn't take" means for a controlled field.

## 0.1.5

No changes in this release.

## 0.1.4

No changes in this release.

## 0.1.3

### Patch Changes

- [#69](https://github.com/Walgermo/booki/pull/69) [`85bde56`](https://github.com/Walgermo/booki/commit/85bde56ab298f00f1b08e326bb26610457d416f8) Thanks [@Walgermo](https://github.com/Walgermo)! - Four sales reports. `FunnelChart`: how many records reached each step, the conversion from the step before and from the first, the drop-off and the biggest drop; a step that rises is reported. `ForecastChart`: won, committed, best case and weighted revenue per month or quarter, from the same deals and stages as `DealPipeline`, naming the deals it leaves out (no close date, no amount or one without a source, another currency). `RecurringRevenue`: opening, new, expansion, contraction, churn and closing between two dates, as MRR or ARR; agreements billed per month, quarter or year are summed exactly per year, and the monthly view says what rounding moved. `StageDurationChart`: median and longest days per stage, a target per stage, and the deals over it. Rules in `@booki/core/funnel`, `@booki/core/recurring` and `forecastByPeriod` / `timeInStage` in `@booki/core/pipeline`. The catalog has recipes for win rate, a leaderboard, MRR over time, and working without stage history.

## 0.1.2

### Patch Changes

- [#67](https://github.com/Walgermo/booki/pull/67) [`d7816ae`](https://github.com/Walgermo/booki/commit/d7816ae204780a08b4b1097699e57aaf47002626) Thanks [@Walgermo](https://github.com/Walgermo)! - `useBookiField` with `kind: "code"` takes `personOnly`: values only a person may choose, such as a deal's won and lost stages in a stage select the product already has. An agent's `setCode` to one of them is refused with a sentence that names it; a person's change, which passes its DOM event, goes through; the snapshot lists them.
  
  `CurrencySelect` names its trigger in the person's language ("Valuta" on a Norwegian screen) and takes a `label` option, like the other pickers.

## 0.1.1

### Patch Changes

- [#65](https://github.com/Walgermo/booki/pull/65) [`201f7c9`](https://github.com/Walgermo/booki/commit/201f7c9d1aa843ab3a7c75ebbeb87df831110c08) Thanks [@Walgermo](https://github.com/Walgermo)! - Two controls for sales and customer work. `DealPipeline` is a board of deals in stages with each stage's totals per currency and a weighted forecast: an agent moves open deals, records a value with its source (`setValue`), and sets the expected close date and the owner; a value without a source is shown and never summed; marking a deal won or lost, and reopening it, are a person's buttons. `ActivityTimeline` is a customer's history and next steps: an agent logs calls, emails, meetings and notes, and schedules, reschedules and completes tasks, each recorded as the agent's; removing an entry is a person's. Rules in `@booki/core/pipeline` and `@booki/core/activity`, the `deal.close` and `activity.remove` permissions, a `sales` starter role, and `guardCloseDeal` for the server. `deal.close` is a person's decision: `PERSON_ONLY` and the readiness check now list it.

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
