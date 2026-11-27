# @booki/styles

## 0.5.2

### Patch Changes

- [#200](https://github.com/Walgermo/booki/pull/200) [`274092a`](https://github.com/Walgermo/booki/commit/274092a6e5ae1b50ed5f5bc1e4ec99d77ebcbc0e) Thanks [@Walgermo](https://github.com/Walgermo)! - Improve keyboard access to scrollable reports, announce sorting in the trial-balance list, respect reduced motion in pickers, and make report controls easier to read and tap on phones.
  
  Keep native form validity in sync for bank details, payment references, organization numbers and IBAN. Preserve the initial locale during hydration.

- [#196](https://github.com/Walgermo/booki/pull/196) [`a25ee00`](https://github.com/Walgermo/booki/commit/a25ee00bc2e5b0b6c8bdab52da707c6a5b8c82aa) Thanks [@Walgermo](https://github.com/Walgermo)! - Preview block formatting in the slash menu and highlight tagged sources inline while editing a document.

- [#200](https://github.com/Walgermo/booki/pull/200) [`274092a`](https://github.com/Walgermo/booki/commit/274092a6e5ae1b50ed5f5bc1e4ec99d77ebcbc0e) Thanks [@Walgermo](https://github.com/Walgermo)! - Give KPI values a full-width row so sparklines cannot obscure amounts in narrow cards.
  
  Use the visible labels as the accessible names for trend ranges and aging buckets, with expanded descriptions for screen readers.

## 0.5.1

### Patch Changes

- [#193](https://github.com/Walgermo/booki/pull/193) [`9dd5417`](https://github.com/Walgermo/booki/commit/9dd5417908ed11c3d44a4bd7c4925c1cb1873781) Thanks [@Walgermo](https://github.com/Walgermo)! - Show file-type icons beside files and attached evidence in the document editor’s mention menu. File suggestions can supply a file name and MIME type separately from their display label.

- [#192](https://github.com/Walgermo/booki/pull/192) [`b841d36`](https://github.com/Walgermo/booki/commit/b841d36fbb0e44899abd400fd00442e6ceaf08a9) Thanks [@Walgermo](https://github.com/Walgermo)! - Add Undo and Redo to the document editor for a person's typing and block edits, with keyboard shortcuts and audit events.

## 0.5.0

### Patch Changes

- [#184](https://github.com/Walgermo/booki/pull/184) [`eb83ef8`](https://github.com/Walgermo/booki/commit/eb83ef87b6a3eaa8c91e63a27879710904361cd2) Thanks [@Walgermo](https://github.com/Walgermo)! - Preserve fractional basis points when calculating invoice and voucher tax. Payment batch approval and release now require a real calendar date. Aging reports, filtered money columns and party drill-downs calculate totals exactly and refuse totals outside the safe minor-unit range.
  
  New working-paper proposals receive opaque, durable IDs. Read the ID from the proposal or bridge result when accepting, rejecting or withdrawing it. Existing pending proposals keep their IDs. HTML-backed papers preserve callout editability and list item identities. In the editor, Alt+Down focuses the command or mention list. Arrow keys, Home and End navigate, Enter selects, and Escape returns to the text without changing it.
  
  Conformance checks on an empty bridge now report an incomplete result and return `conforms: false`. Run the check after the screen mounts.

- [#189](https://github.com/Walgermo/booki/pull/189) [`b17d729`](https://github.com/Walgermo/booki/commit/b17d72939a92b91d794ad69dcb63aad7d8266011) Thanks [@Walgermo](https://github.com/Walgermo)! - AgentStatus now uses the same Booki pointer as the live React and Web cursors. Each of its five states keeps its own badge and localized label. The corresponding exported SVGs use the same centered stem. The waiting label has stronger contrast on Paper. The cursor presses at its tip when work begins and when a live step runs. Reduced motion keeps the pointer still.
  
  Read-only cursor steps inspect the control without a press. Missing targets, cancellation, overlapping steps and detachment clear stale visuals. Cursor narration omits arguments on secret controls. Both renderers honor custom travel times and keep labels above low targets.

## 0.4.4

### Patch Changes

- [#175](https://github.com/Walgermo/booki/pull/175) [`1097c40`](https://github.com/Walgermo/booki/commit/1097c40e4deeac102c465bebc93ad68917075561) Thanks [@Walgermo](https://github.com/Walgermo)! - `AgentLog` and `AgentSnapshot`: two read-only panels that show people what an agent does and reads. `AgentLog` lists each step an agent from `createBookiAgent` takes (which control, which action, its arguments, with a secret control's arguments shown as `[redacted]`) and its answer: running, waiting for a person while `allow` asks, done, or refused with the reason. Newest last; it follows new rows unless the person has scrolled up. Pass `rows` (from `useAgentLog`) to keep the list yourself. `AgentSnapshot` shows, for the controls inside a `scope`, each one's label, its actions and its state as JSON, taken from the bridge's own snapshot, so a redacted value stays redacted. It updates as the controls change. Neither offers an agent anything to read or call. Both are styled on ink in `@booki-aui/styles` and use new English and Norwegian sentences in the `@booki-aui/core` catalogue.
  
  Calls a browser agent makes through `registerTools` with a gate of its own are listed too. A step whose control cannot be told for certain, or could be a secret one, never shows its values, in the call or in the answer.

- [#178](https://github.com/Walgermo/booki/pull/178) [`df93b3a`](https://github.com/Walgermo/booki/commit/df93b3a005f81644bc331825ab79938ab8bdcc6c) Thanks [@Walgermo](https://github.com/Walgermo)! - `AgentStatus`: one short line telling a person what an agent is doing, with `state` `"idle" | "working" | "waiting" | "done" | "refused"` and an optional `label` (default words from the en/nb catalogue, such as "agent working" and "waiting for a person"). It is `role="status"` with `aria-live="polite"`, the icon is hidden, and `data-agent-hidden` keeps it out of the agent's snapshot. `@booki-aui/styles` colours it by meaning (signal for working and done, warning while waiting, danger when refused, muted when idle, with ink twins under `data-bk-surface="ink"`) and keeps its width fixed across states. Working turns its badge, waiting breathes, and on a change the icons cross-fade and the check draws in once; nothing plays on first render, and reduced motion holds it still. `Spinner` is the turning ring on its own (`data-slot="spinner"`, aria-hidden), for a busy button.
  
  New icons in an "Agent status" category: `agent-idle`, `agent-working`, `agent-waiting`, `agent-done`, `agent-refused` (the agent cursor with a state badge), `spinner`, `loader-dots` and `stop`. New token `--bk-ink-warning`. Core adds `@booki-aui/core/msg/agent-status` with the five labels in English and Norwegian.

- [#180](https://github.com/Walgermo/booki/pull/180) [`9da3dc0`](https://github.com/Walgermo/booki/commit/9da3dc05696e62fdd503a4d4a001f25e3e38542a) Thanks [@Walgermo](https://github.com/Walgermo)! - Building blocks for the screens around the accounting controls. `Card`: a paper surface with a `title` that names the region, `description`, `actions` beside the title (they wrap under it when the card is narrow), the body and a `footer`. `Field`: a `label`, one control, `help` and `errorText`, wired with `for`, `aria-describedby` and `aria-invalid`; a plain text `<input>` or `<textarea>` inside becomes one the agent fills by the label, while a password or a `<select>` is wired for people only. `Toolbar`: a named row of actions with one tab stop, arrow keys, Home and End between items, and wrapping when narrow, with `ToolbarGroup` and `ToolbarSeparator`; the agent reads it as one toolbar listing its buttons and presses one by name, and a button's `data-agent-confirm` still holds. Each has one stylesheet in `@booki-aui/styles` (`controls/card.css`, `controls/field.css`, `controls/toolbar.css`), on tokens only, keyed on a Booki attribute so another library's `card`, `field` or `toolbar` slot is never restyled.

- [#181](https://github.com/Walgermo/booki/pull/181) [`9f2debf`](https://github.com/Walgermo/booki/commit/9f2debfaf217a1883da0b251728651a7792768e7) Thanks [@Walgermo](https://github.com/Walgermo)! - `ChartOfAccounts` ("Kontoplan"): the whole chart of accounts under its classes, NS 4102 classes 1–8 on the NO profile and the common ranges on US. People search by number or name, filter by class and status, fold class headings, and edit name, VAT code and standard account in the row (by row, so a duplicated number is edited one row at a time). A narrow list shows its accounts as cards, sorted with an order select. It shows what is wrong with each account: a duplicate number, a number outside its class, a type its class does not hold, a missing SAF-T mapping on NO. An agent can `find`, `filterClass`, `setVatCode`, `mapStandard` and `propose` new accounts or edits. A proposal waits on screen, and only a person can commit it (`data-person-only`) or activate and deactivate an account (`data-agent-confirm`). Number and type are fixed once an account is `locked`. The class and range rules are in `@booki-aui/core/chart-of-accounts` (`chartSchemeFor`, `accountIssues`, `checkChange`, `applyChanges`), and the new permission is `chart.maintain`. `attachAudit` now names records that have a `number` but no `id`, such as accounts, the way it names records by `id`. The base stylesheet budget goes up 250 bytes to make room for the new component's scope.

- [#183](https://github.com/Walgermo/booki/pull/183) [`3daad28`](https://github.com/Walgermo/booki/commit/3daad28649ad5232f719210c4ebbc042844e4da3) Thanks [@Walgermo](https://github.com/Walgermo)! - DocumentEditor, a block editor for working papers. "/" opens commands and "@" mentions the files, evidence, people and pages the app passes. An agent reads the page as blocks and can find, insert, edit, move and remove blocks or run a command by name; every one is a proposal, shown in the agent's colour, that waits until a person accepts or rejects it. Accept and Reject are a person's buttons, never agent actions, and an accept is refused when a person changed the block after the agent saw it. `onAudit` gets one row per change. The block model, the proposal rules and TipTap JSON converters are in `@booki-aui/core/document-blocks`. `proposals` / `onProposalsChange` let the app store waiting proposals so they outlive the page. `fromHtml` / `toHtml` read and write an editor's HTML: the block-id attribute is an option (default `data-block-id`), every other attribute is kept, bold, italics, code and links become inline markdown and come back as markup, and anything the editor cannot edit (a table, a data field) is carried through untouched as an `embed`. A block an accepted proposal wrote keeps the agent's `origin` until a person edits it.

- [#171](https://github.com/Walgermo/booki/pull/171) [`99d0d1c`](https://github.com/Walgermo/booki/commit/99d0d1c582b19048f88c2c2929b62825b2e9cc8b) Thanks [@Walgermo](https://github.com/Walgermo)! - `IconButton`: an icon button named by what it does. `label` is required ("Delete line 2"); it is the button's accessible name and tooltip, so an agent presses it by those words and a screen reader says them, and the icon is hidden. Pass any icon, such as `<TrashIcon />` from `@booki-aui/icons/react`; `showLabel` adds the label as visible text. It is ui-sdk's Button underneath, so `data-agent-confirm` and pending states work as on any button. Readiness now calls a nameless icon-only button that and points to `IconButton`, and flags a Booki icon shown at a size other than 16 or 20 px (minor, 1 point).

- [#176](https://github.com/Walgermo/booki/pull/176) [`563f193`](https://github.com/Walgermo/booki/commit/563f193a25995f48d3abc0c67924ac2d831e77ac) Thanks [@Walgermo](https://github.com/Walgermo)! - `Button`: a plain button with Booki's look, so an app no longer needs a button of its own. `variant` is `primary` (default, ink on paper), `secondary` (a card with a ring) or `ghost` (quiet, inside another surface); `size` is `md` (default) or `sm`, which looks smaller and keeps a 40px hit area. Native button props pass through and `type` defaults to `"button"`. It is ui-sdk's Button underneath, so an agent presses it by its text and `data-agent-confirm` and pending states work as on any button. It renders `data-slot="button"` with `data-booki-button`, `data-variant` and `data-size`; the styles are in `controls/button.css`. `IconButton` is now a `Button` underneath and takes `variant` (default `ghost`, its look until now) and `size`.

- [#174](https://github.com/Walgermo/booki/pull/174) [`8cd3d0b`](https://github.com/Walgermo/booki/commit/8cd3d0b63b2312383bad3eeefadf89a2f8596eb1) Thanks [@Walgermo](https://github.com/Walgermo)! - ExceptionBanner sits inline as a plain card: a warning square by the title, the reason first, the context muted. No more red wash, red title or floating shadow. Its look moves to its own control stylesheet.
  
  FunnelChart keeps its bars readable in a narrow container: the step label moves onto its own line.

## 0.4.3

No changes in this release.

## 0.4.2

### Patch Changes

- [#153](https://github.com/Walgermo/booki/pull/153) [`db02f38`](https://github.com/Walgermo/booki/commit/db02f385f4366b3a7811aaa033bf70ef0c82a561) Thanks [@Walgermo](https://github.com/Walgermo)! - The styles build checks every output before it replaces `dist`, so a build that stops on the `base.css` size budget leaves the last good build in place instead of a `dist` with two files that a later packaging step takes for a complete one.

## 0.4.1

No changes in this release.

## 0.4.0

### Patch Changes

- [#141](https://github.com/Walgermo/booki/pull/141) [`2222b4b`](https://github.com/Walgermo/booki/commit/2222b4bc1413edc8f09f6426806428c39a63633b) Thanks [@Walgermo](https://github.com/Walgermo)! - Link the npm package homepages to the Booki installation guide.

- [#134](https://github.com/Walgermo/booki/pull/134) [`cc38202`](https://github.com/Walgermo/booki/commit/cc38202316778d31014017f7599b3d2948b49ac5) Thanks [@Walgermo](https://github.com/Walgermo)! - Keep the host page's native color scheme when importing Booki styles. Booki controls default to light and follow explicit Booki theme wrappers.

## 0.3.3

No changes in this release.

## 0.3.2

No changes in this release.

## 0.3.1

No changes in this release.

## 0.3.0

No changes in this release.

## 0.2.1

### Patch Changes

- [#99](https://github.com/Walgermo/booki/pull/99) [`4726bfa`](https://github.com/Walgermo/booki/commit/4726bfa0a1ae4bba6897fa7ac47bedd624eb842d) Thanks [@Walgermo](https://github.com/Walgermo)! - `base.css` is 26% smaller: 42 KB instead of 58 KB raw (7.0 KB instead of 7.3 KB gzipped). The component scope is now stated three times instead of twelve. Every selector keeps its specificity and every element its look.

## 0.2.0

### Minor Changes

- [#93](https://github.com/Walgermo/booki/pull/93) [`ec89785`](https://github.com/Walgermo/booki/commit/ec8978566d2a81ee14eb94cc5163a2490ea824a9) Thanks [@Walgermo](https://github.com/Walgermo)! - The packages are now named `@booki-aui/*` and are published to npm (the `@booki` scope on npm belongs to someone else). Install with `pnpm add @booki-aui/core @booki-aui/react @booki-aui/styles`, and replace `@booki/` with `@booki-aui/` in your imports, for example `import { createBookiAgent } from "@booki-aui/react"` and `import "@booki-aui/styles"`. Nothing else changed.

## 0.1.7

No changes in this release.

## 0.1.6

No changes in this release.

## 0.1.5

No changes in this release.

## 0.1.4

No changes in this release.

## 0.1.3

### Patch Changes

- [#69](https://github.com/Walgermo/booki/pull/69) [`85bde56`](https://github.com/Walgermo/booki/commit/85bde56ab298f00f1b08e326bb26610457d416f8) Thanks [@Walgermo](https://github.com/Walgermo)! - Four sales reports. `FunnelChart`: how many records reached each step, the conversion from the step before and from the first, the drop-off and the biggest drop; a step that rises is reported. `ForecastChart`: won, committed, best case and weighted revenue per month or quarter, from the same deals and stages as `DealPipeline`, naming the deals it leaves out (no close date, no amount or one without a source, another currency). `RecurringRevenue`: opening, new, expansion, contraction, churn and closing between two dates, as MRR or ARR; agreements billed per month, quarter or year are summed exactly per year, and the monthly view says what rounding moved. `StageDurationChart`: median and longest days per stage, a target per stage, and the deals over it. Rules in `@booki/core/funnel`, `@booki/core/recurring` and `forecastByPeriod` / `timeInStage` in `@booki/core/pipeline`. The catalog has recipes for win rate, a leaderboard, MRR over time, and working without stage history.

## 0.1.2

No changes in this release.

## 0.1.1

### Patch Changes

- [#65](https://github.com/Walgermo/booki/pull/65) [`201f7c9`](https://github.com/Walgermo/booki/commit/201f7c9d1aa843ab3a7c75ebbeb87df831110c08) Thanks [@Walgermo](https://github.com/Walgermo)! - Two controls for sales and customer work. `DealPipeline` is a board of deals in stages with each stage's totals per currency and a weighted forecast: an agent moves open deals, records a value with its source (`setValue`), and sets the expected close date and the owner; a value without a source is shown and never summed; marking a deal won or lost, and reopening it, are a person's buttons. `ActivityTimeline` is a customer's history and next steps: an agent logs calls, emails, meetings and notes, and schedules, reschedules and completes tasks, each recorded as the agent's; removing an entry is a person's. Rules in `@booki/core/pipeline` and `@booki/core/activity`, the `deal.close` and `activity.remove` permissions, a `sales` starter role, and `guardCloseDeal` for the server. `deal.close` is a person's decision: `PERSON_ONLY` and the readiness check now list it.

- [#64](https://github.com/Walgermo/booki/pull/64) [`56dc93e`](https://github.com/Walgermo/booki/commit/56dc93e565835150a13babce8b888384623aa4b4) Thanks [@Walgermo](https://github.com/Walgermo)! - `AmountField` is one control high, like the other fields, instead of 7px taller. `@booki/styles/shadcn.css` gives Booki's fields shadcn's input height (`h-9`, 44px on touch); set `--bk-control-h` after the import if your inputs are another height. The drop-in guide covers a `numeric` column that arrives as a JS number (`fromMajor`) and a currency list of your own.

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
