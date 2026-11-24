# @booki/styles

## 0.2.0

### Minor Changes

- [`5827827`](https://github.com/Walgermo/booki/commit/5827827952db0df5306176495dc6b4bb3bfd6fb7) Thanks [@Walgermo](https://github.com/Walgermo)! - `clear` on AccountPicker, TaxCodeSelect and AccountingPeriodSelect now empties the select; it used to choose the first item. AccountPicker starts empty without a `defaultValue`, or with one the chart does not have, where it used to start on the first account; pass `defaultValue` if you relied on that. A TaxCodeSelect `defaultValue` that is not in the list is no selection. Their `onValueChange` can now report `""`, and `setValue("")` restores it, so undo reaches an empty select.
  
  `@booki/styles/layered.css` sets the layer order Tailwind 4 needs (`theme, base, booki, components, utilities`). If you import with `layer(booki)`, put `@layer theme, base, booki, components, utilities;` first: without it Tailwind's reset wins.

- [`39dc3c7`](https://github.com/Walgermo/booki/commit/39dc3c78569baa386460d1ec1b7c250a73c4df3f) Thanks [@Walgermo](https://github.com/Walgermo)! - The rest of the second pilot's points:
  
  - **KpiStat** shows "Not set" for a figure with no value (snapshot `set: false`, no issue), leaves out the "No comparison" line unless `showNoComparison`, and shows whole amounts without ",00" (`trimZeroFraction`, default true). `formatMoney` takes `trimZeroFraction`.
  - **AmountField** can be empty, which is not 0: `allowEmpty`, `value={null}`, `onEmpty`, and `empty` in the snapshot. `clear` and deleting the text empty it; `setMinor(0)` fills it with 0. Without `allowEmpty` nothing changes.
  - **@booki/styles** is minified (170 KB, 17 KB gzipped, was 216 KB and 25 KB) and comes as `base.css` plus `controls/<name>.css`, so a page loads only the controls it uses.

### Patch Changes

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

- [`91594bd`](https://github.com/Walgermo/booki/commit/91594bd45de42ed804824173c43d352dc2101e94) Thanks [@Walgermo](https://github.com/Walgermo)! - **A person's decision is refused for an agent in every framework.** `createBookiAgent` in `@booki/web`, `vue`, `svelte` and `solid` now refuses a person-only step whatever `allow` says, as `@booki/react` did, and `registerTools` refuses it for the browser's own agent too.
  
  **An agent does no more than the person it acts for.** Pass `personOf` in the server guard's context and the person's current roles and entities limit the agent; `agentOwn` names what it may do by the company's rule. Without `personOf` nothing changes.
  
  **Refusals and confirmations are recorded.** `createBookiAgent({ audit })` gets every refused step and every confirmed marked step. `allow` may answer `{ allow, by }` to say who decided; `AuditEvent` has `decidedBy`.
  
  **Whose change it was.** The `on…Change` callbacks of the workflow controls in `@booki/react` are typed with `{ reason, source }`; `BankReconciliation` now passes it on.
  
  **Shorter snapshots.** AccountPicker, TaxCodeSelect and CurrencySelect with more than 30 items list none in the snapshot (`itemsHint` says how to `query`), and an unknown value is refused with the nearest items and the count, under the code `select.unknown-…-more`. Voucher refusals for a long chart name the nearest accounts.
  
  Also: `@booki/styles` ships types for its CSS imports, `usePrimitive`, `usePart` and `personOnly` are exported from `@booki/react`, and the agent's cursor scrolls to a control a sticky bar covers.

- [`5b4ead3`](https://github.com/Walgermo/booki/commit/5b4ead383d9f76cfa3cf15bec11f7b48e98311e6) Thanks [@Walgermo](https://github.com/Walgermo)! - `base.css` is smaller: it states the component scope once per group of rules (CSS nesting inside `:where()`), not once per rule. Specificity stays zero and every selector and declaration is unchanged (checked with `scripts/compare-selectors.mjs`). `base.css` goes from 84,855 B raw / 7,732 B gzip to 57,463 B / 7,347 B; `booki.css` from 170,411 B / 16,879 B to 143,019 B / 16,406 B (gzip at level 6). The build now fails if `base.css` grows past its size budget.

- [`9622876`](https://github.com/Walgermo/booki/commit/962287687b8f5912b8349954179fb158881e7397) Thanks [@Walgermo](https://github.com/Walgermo)! - The README states the browsers the stylesheets need: Chrome or Edge 112, Safari 16.5 or Firefox 117, or newer, because of native CSS nesting.

- [`b46512f`](https://github.com/Walgermo/booki/commit/b46512f90e8ad1adad660834dada0e0d4fd32161) Thanks [@Walgermo](https://github.com/Walgermo)! - The base styles now also cover the three `useBookiField` kinds (`field-amount`, `field-code`, `field-date`), so `base.css` is 58,351 B raw (7,357 B gzip).

- [`025d6f9`](https://github.com/Walgermo/booki/commit/025d6f95587865aaa1b29a2d2278d85a3ad72a62) Thanks [@Walgermo](https://github.com/Walgermo)! - Screen-reader-only text no longer widens the page on a phone. It was absolutely positioned at its static place, so inside a wide table (the voucher lines, a DataTable) it could sit outside every scroll box and push the page sideways. It is now pinned to the corner of its containing block.

## 0.1.0

First preview. Not yet on npm: Booki is published once v1 has run in a real product.
