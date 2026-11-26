---
"@booki-aui/core": patch
"@booki-aui/primitives": patch
---

InvoiceEditor price cells and AuditWorkpaper misstatement cells show an amount at its currency's own decimals (none for CLP or JPY, three for BHD), so editing the figure shown stores the same amount. A supplier invoice's currency correction refuses a three-letter code with no ISO minor unit, such as "UDS", instead of saving one that cannot be formatted.
