# @booki/styles

## 0.2.0

### Minor Changes

- [#3](https://github.com/Walgermo/booki/pull/3) [`2a16ea2`](https://github.com/Walgermo/booki/commit/2a16ea25f6ec4c2481b49186b652d596d22182dc) Thanks [@Walgermo](https://github.com/Walgermo)! - `clear` on AccountPicker, TaxCodeSelect and AccountingPeriodSelect now empties the select; it used to choose the first item. AccountPicker starts empty without a `defaultValue`, or with one the chart does not have, where it used to start on the first account; pass `defaultValue` if you relied on that. A TaxCodeSelect `defaultValue` that is not in the list is no selection. Their `onValueChange` can now report `""`, and `setValue("")` restores it, so undo reaches an empty select.
  
  `@booki/styles/layered.css` sets the layer order Tailwind 4 needs (`theme, base, booki, components, utilities`). If you import with `layer(booki)`, put `@layer theme, base, booki, components, utilities;` first: without it Tailwind's reset wins.

- [#9](https://github.com/Walgermo/booki/pull/9) [`acebca2`](https://github.com/Walgermo/booki/commit/acebca2f533c60e26295f19ee36b183f5be000eb) Thanks [@Walgermo](https://github.com/Walgermo)! - The rest of the second pilot's points:
  
  - **KpiStat** shows "Not set" for a figure with no value (snapshot `set: false`, no issue), leaves out the "No comparison" line unless `showNoComparison`, and shows whole amounts without ",00" (`trimZeroFraction`, default true). `formatMoney` takes `trimZeroFraction`.
  - **AmountField** can be empty, which is not 0: `allowEmpty`, `value={null}`, `onEmpty`, and `empty` in the snapshot. `clear` and deleting the text empty it; `setMinor(0)` fills it with 0. Without `allowEmpty` nothing changes.
  - **@booki/styles** is minified (170 KB, 17 KB gzipped, was 216 KB and 25 KB) and comes as `base.css` plus `controls/<name>.css`, so a page loads only the controls it uses.

### Patch Changes

- [#55](https://github.com/Walgermo/booki/pull/55) [`7a4e413`](https://github.com/Walgermo/booki/commit/7a4e4136653cd61cd14a3d7e93a3dd7dd85199d5) Thanks [@Walgermo](https://github.com/Walgermo)! - From the fourth product pilot, run in a real app:
  
  - **`@booki/styles` no longer styles the product's own fields inside `useBookiField`.** The base rules for buttons, labels, selects and text reached into `field-amount`, `field-code` and `field-date`, whose markup is the product's, and made its labels invisible. The build now stops if a `useBookiField` kind is in the base scope again, and `base.css` is back to 57,463 B.
  - **`useBookiField` code kind takes an option's label too** (any case), and a refusal lists each option as `value (label)`, so it says what `setCode` takes. A label two options share is refused.
  - **`useBookiField` can be empty:** `allowEmpty` on an amount reads `minor: null` and `setMinor(null)` empties it; on a code, `setCode("")` or `setCode(null)` clears it.
  - **`AccountPicker`'s `onValueChange` type** now declares the `{ reason, source }` it already received.

- [#5](https://github.com/Walgermo/booki/pull/5) [`40c1fdd`](https://github.com/Walgermo/booki/commit/40c1fddc823ef72ce385299ff6d949fb3374e434) Thanks [@Walgermo](https://github.com/Walgermo)! - **A person's decision is refused for an agent in every framework.** `createBookiAgent` in `@booki/web`, `vue`, `svelte` and `solid` now refuses a person-only step whatever `allow` says, as `@booki/react` did, and `registerTools` refuses it for the browser's own agent too.
  
  **An agent does no more than the person it acts for.** Pass `personOf` in the server guard's context and the person's current roles and entities limit the agent; `agentOwn` names what it may do by the company's rule. Without `personOf` nothing changes.
  
  **Refusals and confirmations are recorded.** `createBookiAgent({ audit })` gets every refused step and every confirmed marked step. `allow` may answer `{ allow, by }` to say who decided; `AuditEvent` has `decidedBy`.
  
  **Whose change it was.** The `on…Change` callbacks of the workflow controls in `@booki/react` are typed with `{ reason, source }`; `BankReconciliation` now passes it on.
  
  **Shorter snapshots.** AccountPicker, TaxCodeSelect and CurrencySelect with more than 30 items list none in the snapshot (`itemsHint` says how to `query`), and an unknown value is refused with the nearest items and the count, under the code `select.unknown-…-more`. Voucher refusals for a long chart name the nearest accounts.
  
  Also: `@booki/styles` ships types for its CSS imports, `usePrimitive`, `usePart` and `personOnly` are exported from `@booki/react`, and the agent's cursor scrolls to a control a sticky bar covers.

- [#35](https://github.com/Walgermo/booki/pull/35) [`ee0f242`](https://github.com/Walgermo/booki/commit/ee0f2420e9468b6cf3449e07ba0158585b6bc53e) Thanks [@Walgermo](https://github.com/Walgermo)! - `base.css` is smaller: it states the component scope once per group of rules (CSS nesting inside `:where()`), not once per rule. Specificity stays zero and every selector and declaration is unchanged (checked with `scripts/compare-selectors.mjs`). `base.css` goes from 84,855 B raw / 7,732 B gzip to 57,463 B / 7,347 B; `booki.css` from 170,411 B / 16,879 B to 143,019 B / 16,406 B (gzip at level 6). The build now fails if `base.css` grows past its size budget.

- [#47](https://github.com/Walgermo/booki/pull/47) [`a57f357`](https://github.com/Walgermo/booki/commit/a57f35775d68b4188ebf2bbe7b5ba0b408478c3a) Thanks [@Walgermo](https://github.com/Walgermo)! - The README states the browsers the stylesheets need: Chrome or Edge 112, Safari 16.5 or Firefox 117, or newer, because of native CSS nesting.

- [#42](https://github.com/Walgermo/booki/pull/42) [`e77f270`](https://github.com/Walgermo/booki/commit/e77f270551099a0d53a70a481459de0a8fc3993f) Thanks [@Walgermo](https://github.com/Walgermo)! - The base styles now also cover the three `useBookiField` kinds (`field-amount`, `field-code`, `field-date`), so `base.css` is 58,351 B raw (7,357 B gzip).

- [#52](https://github.com/Walgermo/booki/pull/52) [`5b6d8ec`](https://github.com/Walgermo/booki/commit/5b6d8ec2ddf1657896c19de885905653fc5df5ca) Thanks [@Walgermo](https://github.com/Walgermo)! - Screen-reader-only text no longer widens the page on a phone. It was absolutely positioned at its static place, so inside a wide table (the voucher lines, a DataTable) it could sit outside every scroll box and push the page sideways. It is now pinned to the corner of its containing block.

## 0.1.0

First preview. Not yet on npm: Booki is published once v1 has run in a real product.
