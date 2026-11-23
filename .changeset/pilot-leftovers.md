---
"@booki/core": minor
"@booki/primitives": minor
"@booki/react": minor
"@booki/styles": minor
---

The rest of the second pilot's points:

- **KpiStat** shows "Not set" for a figure with no value (snapshot `set: false`, no issue), leaves out the "No comparison" line unless `showNoComparison`, and shows whole amounts without ",00" (`trimZeroFraction`, default true). `formatMoney` takes `trimZeroFraction`.
- **AmountField** can be empty, which is not 0: `allowEmpty`, `value={null}`, `onEmpty`, and `empty` in the snapshot. `clear` and deleting the text empty it; `setMinor(0)` fills it with 0. Without `allowEmpty` nothing changes.
- **@booki/styles** is minified (170 KB, 17 KB gzipped, was 216 KB and 25 KB) and comes as `base.css` plus `controls/<name>.css`, so a page loads only the controls it uses.
