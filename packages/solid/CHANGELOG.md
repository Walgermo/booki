# @booki/solid

## 0.3.0

### Patch Changes

- Updated dependencies [[`6a7055c`](https://github.com/Walgermo/booki/commit/6a7055c05fad4d0dacda520afc5fe5823750fa4c), [`1c95020`](https://github.com/Walgermo/booki/commit/1c95020e1ea0a99556ea58b79e0a590711fdb621)]:
  - @booki-aui/core@0.3.0
  - @booki-aui/primitives@0.3.0

## 0.2.1

### Patch Changes

- Updated dependencies []:
  - @booki-aui/core@0.2.1
  - @booki-aui/primitives@0.2.1

## 0.2.0

### Minor Changes

- [#93](https://github.com/Walgermo/booki/pull/93) [`ec89785`](https://github.com/Walgermo/booki/commit/ec8978566d2a81ee14eb94cc5163a2490ea824a9) Thanks [@Walgermo](https://github.com/Walgermo)! - The packages are now named `@booki-aui/*` and are published to npm (the `@booki` scope on npm belongs to someone else). Install with `pnpm add @booki-aui/core @booki-aui/react @booki-aui/styles`, and replace `@booki/` with `@booki-aui/` in your imports, for example `import { createBookiAgent } from "@booki-aui/react"` and `import "@booki-aui/styles"`. Nothing else changed.

### Patch Changes

- Updated dependencies [[`ec89785`](https://github.com/Walgermo/booki/commit/ec8978566d2a81ee14eb94cc5163a2490ea824a9)]:
  - @booki-aui/core@0.2.0
  - @booki-aui/primitives@0.2.0

## 0.1.7

### Patch Changes

- Updated dependencies [[`3fe7338`](https://github.com/Walgermo/booki/commit/3fe7338a650bbc8a6c900693bc8f93abba937a0a)]:
  - @booki/core@0.1.7
  - @booki/primitives@0.1.7

## 0.1.6

### Patch Changes

- Updated dependencies [[`1054c6e`](https://github.com/Walgermo/booki/commit/1054c6e79f3418e1fb9560beea50b7b027f82bff)]:
  - @booki/core@0.1.6
  - @booki/primitives@0.1.6

## 0.1.5

### Patch Changes

- [#78](https://github.com/Walgermo/booki/pull/78) [`326ce38`](https://github.com/Walgermo/booki/commit/326ce386d087c74fb359a3508ccf4a416a41adea) Thanks [@Walgermo](https://github.com/Walgermo)! - Built on `@ui-sdk/*` 0.1.0-beta.17 (was beta.16), and the peer dependencies ask for it exactly, so move your `@ui-sdk` packages with Booki.
  
  What changes for an agent, from ui-sdk: `act` checks the shape of the whole call before it runs, so a step with an unknown key or `args` that is not a list fails with a message instead of being half-read; a `setX` action that leaves `x` unchanged, or sets a different value, now fails and says what the value is; a number outside a control's min and max is refused, not clamped; `agentTools` lists `act` first. New in the bridge: an `expect` step, `closed` and `from` on `query`, and `more` and `section` in long snapshots.
  
  What changes in Booki:
  
  - `LedgerTable`'s `page` state is 1-based, the same as `table.page` and `setPage`. It was 0-based, so `setPage(3)` left `page: 2`, which ui-sdk now reports as a failed step.
  - `@booki/svelte` no longer needs `ssr: { noExternal: [...] }`: `@ui-sdk/svelte` imports its own files with extensions now. Load it through Vite with the Svelte plugin as before.
  - `@booki/primitives` and `@booki/react` no longer copy ui-sdk declaration files into `dist`, since `@ui-sdk/core` exports `SlotProps` now.
  
  beta.17 was published on 2026-11-24; under a release-age rule (pnpm 11 waits one day by default) it installs from 2026-11-25.
- Updated dependencies [[`326ce38`](https://github.com/Walgermo/booki/commit/326ce386d087c74fb359a3508ccf4a416a41adea)]:
  - @booki/primitives@0.1.5
  - @booki/core@0.1.5

## 0.1.4

### Patch Changes

- Updated dependencies [[`520026a`](https://github.com/Walgermo/booki/commit/520026a6eea792c8186387a7dbc285b97628de36)]:
  - @booki/primitives@0.1.4
  - @booki/core@0.1.4

## 0.1.3

### Patch Changes

- [#69](https://github.com/Walgermo/booki/pull/69) [`85bde56`](https://github.com/Walgermo/booki/commit/85bde56ab298f00f1b08e326bb26610457d416f8) Thanks [@Walgermo](https://github.com/Walgermo)! - Four sales reports. `FunnelChart`: how many records reached each step, the conversion from the step before and from the first, the drop-off and the biggest drop; a step that rises is reported. `ForecastChart`: won, committed, best case and weighted revenue per month or quarter, from the same deals and stages as `DealPipeline`, naming the deals it leaves out (no close date, no amount or one without a source, another currency). `RecurringRevenue`: opening, new, expansion, contraction, churn and closing between two dates, as MRR or ARR; agreements billed per month, quarter or year are summed exactly per year, and the monthly view says what rounding moved. `StageDurationChart`: median and longest days per stage, a target per stage, and the deals over it. Rules in `@booki/core/funnel`, `@booki/core/recurring` and `forecastByPeriod` / `timeInStage` in `@booki/core/pipeline`. The catalog has recipes for win rate, a leaderboard, MRR over time, and working without stage history.
- Updated dependencies [[`85bde56`](https://github.com/Walgermo/booki/commit/85bde56ab298f00f1b08e326bb26610457d416f8)]:
  - @booki/core@0.1.3
  - @booki/primitives@0.1.3

## 0.1.2

### Patch Changes

- Updated dependencies [[`d7816ae`](https://github.com/Walgermo/booki/commit/d7816ae204780a08b4b1097699e57aaf47002626)]:
  - @booki/core@0.1.2
  - @booki/primitives@0.1.2

## 0.1.1

### Patch Changes

- [#65](https://github.com/Walgermo/booki/pull/65) [`201f7c9`](https://github.com/Walgermo/booki/commit/201f7c9d1aa843ab3a7c75ebbeb87df831110c08) Thanks [@Walgermo](https://github.com/Walgermo)! - Two controls for sales and customer work. `DealPipeline` is a board of deals in stages with each stage's totals per currency and a weighted forecast: an agent moves open deals, records a value with its source (`setValue`), and sets the expected close date and the owner; a value without a source is shown and never summed; marking a deal won or lost, and reopening it, are a person's buttons. `ActivityTimeline` is a customer's history and next steps: an agent logs calls, emails, meetings and notes, and schedules, reschedules and completes tasks, each recorded as the agent's; removing an entry is a person's. Rules in `@booki/core/pipeline` and `@booki/core/activity`, the `deal.close` and `activity.remove` permissions, a `sales` starter role, and `guardCloseDeal` for the server. `deal.close` is a person's decision: `PERSON_ONLY` and the readiness check now list it.
- Updated dependencies [[`201f7c9`](https://github.com/Walgermo/booki/commit/201f7c9d1aa843ab3a7c75ebbeb87df831110c08)]:
  - @booki/core@0.1.1
  - @booki/primitives@0.1.1

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
