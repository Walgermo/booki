# @booki/core

## 0.5.3

No changes in this release.

## 0.5.2

No changes in this release.

## 0.5.1

### Patch Changes

- [#193](https://github.com/Walgermo/booki/pull/193) [`9dd5417`](https://github.com/Walgermo/booki/commit/9dd5417908ed11c3d44a4bd7c4925c1cb1873781) Thanks [@Walgermo](https://github.com/Walgermo)! - Show file-type icons beside files and attached evidence in the document editor’s mention menu. File suggestions can supply a file name and MIME type separately from their display label.

## 0.5.0

### Minor Changes

- [#184](https://github.com/Walgermo/booki/pull/184) [`eb83ef8`](https://github.com/Walgermo/booki/commit/eb83ef87b6a3eaa8c91e63a27879710904361cd2) Thanks [@Walgermo](https://github.com/Walgermo)! - Preserve fractional basis points when calculating invoice and voucher tax. Payment batch approval and release now require a real calendar date. Aging reports, filtered money columns and party drill-downs calculate totals exactly and refuse totals outside the safe minor-unit range.
  
  New working-paper proposals receive opaque, durable IDs. Read the ID from the proposal or bridge result when accepting, rejecting or withdrawing it. Existing pending proposals keep their IDs. HTML-backed papers preserve callout editability and list item identities. In the editor, Alt+Down focuses the command or mention list. Arrow keys, Home and End navigate, Enter selects, and Escape returns to the text without changing it.
  
  Conformance checks on an empty bridge now report an incomplete result and return `conforms: false`. Run the check after the screen mounts.

### Patch Changes

- [#186](https://github.com/Walgermo/booki/pull/186) [`c735db6`](https://github.com/Walgermo/booki/commit/c735db698802f13d18b7aa698a07a5bd49099f5d) Thanks [@Walgermo](https://github.com/Walgermo)! - Preserve the classification of HTML callouts, such as `data-callout="warning"`, when a working paper is opened and saved.
  
  Keep editor buttons in place during pointer clicks below open suggestions. Rejected aging filters now preserve the report and CSV. Unrepresentable aging reports show an issue, and a hidden money column with an unrepresentable total no longer prevents other columns from rendering.
  
  Conformance checks skip the person-only probe until the screen has mounted controls.

## 0.4.4

### Patch Changes

- [#175](https://github.com/Walgermo/booki/pull/175) [`1097c40`](https://github.com/Walgermo/booki/commit/1097c40e4deeac102c465bebc93ad68917075561) Thanks [@Walgermo](https://github.com/Walgermo)! - `AgentLog` and `AgentSnapshot`: two read-only panels that show people what an agent does and reads. `AgentLog` lists each step an agent from `createBookiAgent` takes (which control, which action, its arguments, with a secret control's arguments shown as `[redacted]`) and its answer: running, waiting for a person while `allow` asks, done, or refused with the reason. Newest last; it follows new rows unless the person has scrolled up. Pass `rows` (from `useAgentLog`) to keep the list yourself. `AgentSnapshot` shows, for the controls inside a `scope`, each one's label, its actions and its state as JSON, taken from the bridge's own snapshot, so a redacted value stays redacted. It updates as the controls change. Neither offers an agent anything to read or call. Both are styled on ink in `@booki-aui/styles` and use new English and Norwegian sentences in the `@booki-aui/core` catalogue.
  
  Calls a browser agent makes through `registerTools` with a gate of its own are listed too. A step whose control cannot be told for certain, or could be a secret one, never shows its values, in the call or in the answer.

- [#178](https://github.com/Walgermo/booki/pull/178) [`df93b3a`](https://github.com/Walgermo/booki/commit/df93b3a005f81644bc331825ab79938ab8bdcc6c) Thanks [@Walgermo](https://github.com/Walgermo)! - `AgentStatus`: one short line telling a person what an agent is doing, with `state` `"idle" | "working" | "waiting" | "done" | "refused"` and an optional `label` (default words from the en/nb catalogue, such as "agent working" and "waiting for a person"). It is `role="status"` with `aria-live="polite"`, the icon is hidden, and `data-agent-hidden` keeps it out of the agent's snapshot. `@booki-aui/styles` colours it by meaning (signal for working and done, warning while waiting, danger when refused, muted when idle, with ink twins under `data-bk-surface="ink"`) and keeps its width fixed across states. Working turns its badge, waiting breathes, and on a change the icons cross-fade and the check draws in once; nothing plays on first render, and reduced motion holds it still. `Spinner` is the turning ring on its own (`data-slot="spinner"`, aria-hidden), for a busy button.
  
  New icons in an "Agent status" category: `agent-idle`, `agent-working`, `agent-waiting`, `agent-done`, `agent-refused` (the agent cursor with a state badge), `spinner`, `loader-dots` and `stop`. New token `--bk-ink-warning`. Core adds `@booki-aui/core/msg/agent-status` with the five labels in English and Norwegian.

- [#181](https://github.com/Walgermo/booki/pull/181) [`9f2debf`](https://github.com/Walgermo/booki/commit/9f2debfaf217a1883da0b251728651a7792768e7) Thanks [@Walgermo](https://github.com/Walgermo)! - `ChartOfAccounts` ("Kontoplan"): the whole chart of accounts under its classes, NS 4102 classes 1–8 on the NO profile and the common ranges on US. People search by number or name, filter by class and status, fold class headings, and edit name, VAT code and standard account in the row (by row, so a duplicated number is edited one row at a time). A narrow list shows its accounts as cards, sorted with an order select. It shows what is wrong with each account: a duplicate number, a number outside its class, a type its class does not hold, a missing SAF-T mapping on NO. An agent can `find`, `filterClass`, `setVatCode`, `mapStandard` and `propose` new accounts or edits. A proposal waits on screen, and only a person can commit it (`data-person-only`) or activate and deactivate an account (`data-agent-confirm`). Number and type are fixed once an account is `locked`. The class and range rules are in `@booki-aui/core/chart-of-accounts` (`chartSchemeFor`, `accountIssues`, `checkChange`, `applyChanges`), and the new permission is `chart.maintain`. `attachAudit` now names records that have a `number` but no `id`, such as accounts, the way it names records by `id`. The base stylesheet budget goes up 250 bytes to make room for the new component's scope.

- [#183](https://github.com/Walgermo/booki/pull/183) [`3daad28`](https://github.com/Walgermo/booki/commit/3daad28649ad5232f719210c4ebbc042844e4da3) Thanks [@Walgermo](https://github.com/Walgermo)! - DocumentEditor, a block editor for working papers. "/" opens commands and "@" mentions the files, evidence, people and pages the app passes. An agent reads the page as blocks and can find, insert, edit, move and remove blocks or run a command by name; every one is a proposal, shown in the agent's colour, that waits until a person accepts or rejects it. Accept and Reject are a person's buttons, never agent actions, and an accept is refused when a person changed the block after the agent saw it. `onAudit` gets one row per change. The block model, the proposal rules and TipTap JSON converters are in `@booki-aui/core/document-blocks`. `proposals` / `onProposalsChange` let the app store waiting proposals so they outlive the page. `fromHtml` / `toHtml` read and write an editor's HTML: the block-id attribute is an option (default `data-block-id`), every other attribute is kept, bold, italics, code and links become inline markdown and come back as markup, and anything the editor cannot edit (a table, a data field) is carried through untouched as an `embed`. A block an accepted proposal wrote keeps the agent's `origin` until a person edits it.

## 0.4.3

No changes in this release.

## 0.4.2

### Patch Changes

- [#152](https://github.com/Walgermo/booki/pull/152) [`c0d5491`](https://github.com/Walgermo/booki/commit/c0d5491d32c8d815626a182dbc2a76b967df7c7d) Thanks [@Walgermo](https://github.com/Walgermo)! - `logActivity` takes an optional `today` (YYYY-MM-DD): an entry dated with no time is checked against the person's own date rather than the UTC one. ActivityTimeline passes the local date.

- [#158](https://github.com/Walgermo/booki/pull/158) [`1b151e4`](https://github.com/Walgermo/booki/commit/1b151e4385f9c826ebcc453458917b62a6c2f0c3) Thanks [@Walgermo](https://github.com/Walgermo)! - `timeline` and `lastTouch` take an optional `{ dayStart: "local" }`: an entry dated with no time then starts at the beginning of that day in the runtime's time zone instead of UTC midnight. The default stays UTC. ActivityTimeline passes it, so east of UTC a date-only contact no longer outranks a timed one made earlier that same local day.

- [#152](https://github.com/Walgermo/booki/pull/152) [`c0d5491`](https://github.com/Walgermo/booki/commit/c0d5491d32c8d815626a182dbc2a76b967df7c7d) Thanks [@Walgermo](https://github.com/Walgermo)! - InvoiceEditor price cells and AuditWorkpaper misstatement cells show an amount at its currency's own decimals (none for CLP or JPY, three for BHD), so editing the figure shown stores the same amount. A supplier invoice's currency correction refuses a three-letter code with no ISO minor unit, such as "UDS", instead of saving one that cannot be formatted.

- [#158](https://github.com/Walgermo/booki/pull/158) [`1b151e4`](https://github.com/Walgermo/booki/commit/1b151e4385f9c826ebcc453458917b62a6c2f0c3) Thanks [@Walgermo](https://github.com/Walgermo)! - Money: store the scale with the amount. An integer of minor units is only exact together with the number of decimals it counts, and ISO 4217 changes a currency's minor unit by amendment. 0.4.0 moved to the ISO list, so amounts saved earlier in currencies whose decimals changed (CLP and 15 others now 0, BHD and 5 others now 3, CLF and UYW 4; before, only JPY and KWD differed from 2) would be read at the wrong scale. Rather than a migration note alone, `@booki-aui/core/money` adds exact helpers, following how established money libraries keep the scale with the amount (a Dinero.js snapshot is `{ amount, currency, scale }`) and how payment APIs keep a legacy representation readable instead of silently reinterpreting it:
  
  - `toScaled(money)` gives `{ amount, currency, scale }` to store; `moneyFromScaled(scaled)` reads it back in the currency's current minor units.
  - `rescaleMinor(minor, fromScale, currency)` converts exactly: adding decimals always works, dropping them is refused (`money.rescale-lossy`) unless the dropped digits are zeros, so no rounding happens without you choosing it.
  - `legacyMinorDigitsFor(currency)` gives the decimals versions before 0.4.0 used, so an integer saved then without a scale is rescaled once with `rescaleMinor(saved, legacyMinorDigitsFor(currency), currency)`.
  
  See "Store the scale with the amount" in docs/drop-in.md. No floats are involved.

- [#152](https://github.com/Walgermo/booki/pull/152) [`c0d5491`](https://github.com/Walgermo/booki/commit/c0d5491d32c8d815626a182dbc2a76b967df7c7d) Thanks [@Walgermo](https://github.com/Walgermo)! - With `language: "nb"`, a failed check whose value is text containing ", not " keeps that text as it is and translates only the comparison; a field's text is never translated. The `setForeign` amount refusal says its example is for USD or NOK and that JPY and KWD use other decimals.

- [#152](https://github.com/Walgermo/booki/pull/152) [`c0d5491`](https://github.com/Walgermo/booki/commit/c0d5491d32c8d815626a182dbc2a76b967df7c7d) Thanks [@Walgermo](https://github.com/Walgermo)! - A person-only refusal names the roles that can do it even when the refused agent holds them too, instead of "none defined".

- [#158](https://github.com/Walgermo/booki/pull/158) [`1b151e4`](https://github.com/Walgermo/booki/commit/1b151e4385f9c826ebcc453458917b62a6c2f0c3) Thanks [@Walgermo](https://github.com/Walgermo)! - History from `createBookiHistory` gains `undoEntry(id)`: it undoes one entry only while it is still the latest applied change, checked when its turn runs rather than when it is asked for. A receipt's Undo uses it, so a change a person makes while an agent turn holds the undo back is kept and the undo is refused. Refusals `history.later-changes` and `history.no-entry` are in the catalogue (en and nb).

- [#152](https://github.com/Walgermo/booki/pull/152) [`c0d5491`](https://github.com/Walgermo/booki/commit/c0d5491d32c8d815626a182dbc2a76b967df7c7d) Thanks [@Walgermo](https://github.com/Walgermo)! - `forecastByPeriod` counts only deals closing within `from` to `to`, so totals no longer change when a quarter starts before the range. `timeInStage` takes the mean of the two middle stays for an even count, and counts the time that passed for a finished stay with times at both ends. `funnel` finds the biggest drop from exact shares, so a loss that rounds to 0.0 % still counts. `setDealValue` drops the old source when the figure changes and no new source is given, even with a status.

## 0.4.1

### Patch Changes

- [#146](https://github.com/Walgermo/booki/pull/146) [`33ad13c`](https://github.com/Walgermo/booki/commit/33ad13c47dfb54f263a5dc7a3a345085e8b46d16) Thanks [@Walgermo](https://github.com/Walgermo)! - With `language: "nb"`, a failed multi-step call whose first step failed now ends in Norwegian too: "Send det på nytt med …" (it stayed English unless steps before it had run). "Its labels: none." for a page with no labels is translated as well.

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
