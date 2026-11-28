---
"@booki-aui/core": patch
"@booki-aui/primitives": patch
"@booki-aui/react": patch
---

Faster tables, charts and vouchers. Money, dates and numbers reuse one `Intl` formatter per locale and options instead of making one per cell, a table's search folds plain text without normalising it, its sort uses one collator, and a voucher looks its lines up by id. With 5 000 rows, a `DataTable` search or sort takes about 9 ms instead of 70. The output is unchanged. The cache is public as `@booki-aui/core/intl` (`numberFormat`, `dateTimeFormat`, `collator`).
