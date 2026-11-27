# @booki/readiness

## 0.3.1

### Patch Changes

- [#203](https://github.com/Walgermo/booki/pull/203) [`7e16c16`](https://github.com/Walgermo/booki/commit/7e16c168f82cfdb1f57a919e4172331ca46bdec2) Thanks [@Walgermo](https://github.com/Walgermo)! - Describe Booki on npm as UI for entire apps where people and AI agents work together, and clarify what each package provides.

## 0.3.0

### Minor Changes

- [#184](https://github.com/Walgermo/booki/pull/184) [`eb83ef8`](https://github.com/Walgermo/booki/commit/eb83ef87b6a3eaa8c91e63a27879710904361cd2) Thanks [@Walgermo](https://github.com/Walgermo)! - Preserve fractional basis points when calculating invoice and voucher tax. Payment batch approval and release now require a real calendar date. Aging reports, filtered money columns and party drill-downs calculate totals exactly and refuse totals outside the safe minor-unit range.
  
  New working-paper proposals receive opaque, durable IDs. Read the ID from the proposal or bridge result when accepting, rejecting or withdrawing it. Existing pending proposals keep their IDs. HTML-backed papers preserve callout editability and list item identities. In the editor, Alt+Down focuses the command or mention list. Arrow keys, Home and End navigate, Enter selects, and Escape returns to the text without changing it.
  
  Conformance checks on an empty bridge now report an incomplete result and return `conforms: false`. Run the check after the screen mounts.

### Patch Changes

- [#186](https://github.com/Walgermo/booki/pull/186) [`c735db6`](https://github.com/Walgermo/booki/commit/c735db698802f13d18b7aa698a07a5bd49099f5d) Thanks [@Walgermo](https://github.com/Walgermo)! - Preserve the classification of HTML callouts, such as `data-callout="warning"`, when a working paper is opened and saved.
  
  Keep editor buttons in place during pointer clicks below open suggestions. Rejected aging filters now preserve the report and CSV. Unrepresentable aging reports show an issue, and a hidden money column with an unrepresentable total no longer prevents other columns from rendering.
  
  Conformance checks skip the person-only probe until the screen has mounted controls.

## 0.2.5

### Patch Changes

- [#171](https://github.com/Walgermo/booki/pull/171) [`99d0d1c`](https://github.com/Walgermo/booki/commit/99d0d1c582b19048f88c2c2929b62825b2e9cc8b) Thanks [@Walgermo](https://github.com/Walgermo)! - `IconButton`: an icon button named by what it does. `label` is required ("Delete line 2"); it is the button's accessible name and tooltip, so an agent presses it by those words and a screen reader says them, and the icon is hidden. Pass any icon, such as `<TrashIcon />` from `@booki-aui/icons/react`; `showLabel` adds the label as visible text. It is ui-sdk's Button underneath, so `data-agent-confirm` and pending states work as on any button. Readiness now calls a nameless icon-only button that and points to `IconButton`, and flags a Booki icon shown at a size other than 16 or 20 px (minor, 1 point).

## 0.2.4

### Patch Changes

- [#157](https://github.com/Walgermo/booki/pull/157) [`67b9c9b`](https://github.com/Walgermo/booki/commit/67b9c9bc2226a48de5729fd620aa3a921a2bf1a5) Thanks [@Walgermo](https://github.com/Walgermo)! - `snapshot-values` checks a value read from a document (`{ value, confidence }`, a supplier invoice's fields) by the amount or date it holds instead of rejecting the wrapper. Bridge coverage lets a grid cell with `aria-readonly="false"` override its read-only grid, so an editable cell the bridge leaves out is reported.

- [#151](https://github.com/Walgermo/booki/pull/151) [`6d56262`](https://github.com/Walgermo/booki/commit/6d562622bbafec1c3b5a1d421c5ce1a6631b1e43) Thanks [@Walgermo](https://github.com/Walgermo)! - The audit and the conformance suite judge fewer things wrong:
  
  - A WebMCP snapshot tool that answers in plain text, not a list of controls, is no longer read as an empty list, so the page's fields are not each counted missing from it.
  - A read-only field (native `readOnly` on a text input or textarea, or inside `aria-readonly="true"`) is not counted as missing from the bridge: no one can change it.
  - A page with no fields or charts is measured when something else was found (a focusable cell, an ungated posting button) or when it registers WebMCP tools of its own, so `--fail-under` judges its score instead of "no score".
  - A WebMCP tool registered again with the same object and a new signal stays when the older signal aborts.
  - `approveUnderRule`, a canonical agent action, is not reported as a person-only action.
  - `server-person-only` asks as an agent that holds the roles granting the permission, and checks that a person with the same roles is let through; a new `serverActor` option gives those roles (default `[permission]`). A permission it cannot verify is reported as such, not passed.
  - `snapshot-secrets` no longer reads an amount in minor units as a bank account number; `snapshot-values` checks nested lists (a voucher's lines) and a date control's `value`; `recording-agent` accepts one attributed event per change.

## 0.2.3

### Patch Changes

- [#132](https://github.com/Walgermo/booki/pull/132) [`e4d4d0d`](https://github.com/Walgermo/booki/commit/e4d4d0d19a303ad7b27588b8045712e59d94e907) Thanks [@Walgermo](https://github.com/Walgermo)! - The JSON report's `tool.version` is the installed version of `@booki-aui/readiness`; it always said 0.1.0.

## 0.2.2

### Patch Changes

- [#125](https://github.com/Walgermo/booki/pull/125) [`815a6ad`](https://github.com/Walgermo/booki/commit/815a6ad8b7506ca0d1b1b939f622c967c125564b) Thanks [@Walgermo](https://github.com/Walgermo)! - A page whose bridge (window.agent, or a WebMCP snapshot tool) has no controls but which has fields of its own (plain selects and text areas that are not on the bridge) no longer scores 100. Each such field is now reported as `field-not-on-bridge`, as it already was when the bridge had some controls. A page with an empty bridge and nothing else to judge is still "not measured".

## 0.2.1

### Patch Changes

- [#117](https://github.com/Walgermo/booki/pull/117) [`cd2641e`](https://github.com/Walgermo/booki/commit/cd2641ed58e1663d7d65efbd3932c4628643a86b) Thanks [@Walgermo](https://github.com/Walgermo)! - A page whose bridge has no controls and that has no fields or charts no longer reads as a pass. The console prints "no score", the HTML report says nothing was measured, and the JSON report gets `measured: false`, `grade: "not measured"` and a `notMeasured` text that points to opening the form first and calling `check(page)`. A page without a bridge but with fields is still scored, with `bridge-missing`. `score` stays in the JSON. `--fail-under` exits 1 for an unmeasured page.

## 0.2.0

### Minor Changes

- [#93](https://github.com/Walgermo/booki/pull/93) [`ec89785`](https://github.com/Walgermo/booki/commit/ec8978566d2a81ee14eb94cc5163a2490ea824a9) Thanks [@Walgermo](https://github.com/Walgermo)! - The packages are now named `@booki-aui/*` and are published to npm (the `@booki` scope on npm belongs to someone else). Install with `pnpm add @booki-aui/core @booki-aui/react @booki-aui/styles`, and replace `@booki/` with `@booki-aui/` in your imports, for example `import { createBookiAgent } from "@booki-aui/react"` and `import "@booki-aui/styles"`. Nothing else changed.

## 0.1.1

### Patch Changes

- [#65](https://github.com/Walgermo/booki/pull/65) [`201f7c9`](https://github.com/Walgermo/booki/commit/201f7c9d1aa843ab3a7c75ebbeb87df831110c08) Thanks [@Walgermo](https://github.com/Walgermo)! - Two controls for sales and customer work. `DealPipeline` is a board of deals in stages with each stage's totals per currency and a weighted forecast: an agent moves open deals, records a value with its source (`setValue`), and sets the expected close date and the owner; a value without a source is shown and never summed; marking a deal won or lost, and reopening it, are a person's buttons. `ActivityTimeline` is a customer's history and next steps: an agent logs calls, emails, meetings and notes, and schedules, reschedules and completes tasks, each recorded as the agent's; removing an entry is a person's. Rules in `@booki/core/pipeline` and `@booki/core/activity`, the `deal.close` and `activity.remove` permissions, a `sales` starter role, and `guardCloseDeal` for the server. `deal.close` is a person's decision: `PERSON_ONLY` and the readiness check now list it.

## 0.1.0

The first release. It is not on npm: run it from a clone with
`pnpm --dir <booki clone> readiness <url>`.

- Scores how ready a page is for an agent, from 0 to 100, and names what stops one:
  unnamed or shared field names, fields missing from the agent bridge, irreversible
  buttons without `data-agent-confirm`, secrets in the snapshot. It only reads.
- `--storage-state` or `--profile` for a screen behind a sign-in; the report says when
  the page sent the browser on to another page. `--timeout` for a dev server that
  compiles on first load. `check(page)` for a page you open with your own Playwright
  steps.
- The Agent Contract conformance suite and a reference implementation.
