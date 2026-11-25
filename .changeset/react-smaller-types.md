---
"@booki-aui/react": patch
---

Much smaller type declarations: the package's `.d.ts` files go from 14.7 MB to 300 kB (`ledger-table.d.ts` from 3.8 MB to 8 kB), so TypeScript loads them faster. Each control's parts now name their definition instead of spelling it out once per part. The types themselves are the same.
