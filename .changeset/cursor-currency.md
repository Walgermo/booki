---
"@booki-aui/primitives": patch
"@booki-aui/react": patch
---

The Norwegian agent cursor says an amount in the field's own currency: `setMinor(125000)` on a yen field reads "setter beløp 125 000", not "1 250,00". AmountField's root carries `data-currency`, which the cursor reads; where no currency is known it shows the minor units as given rather than guessing kroner.
