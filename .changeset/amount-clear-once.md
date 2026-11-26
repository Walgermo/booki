---
"@booki-aui/primitives": patch
---

AmountField: deleting the text of a controlled amount whose owner keeps its value reports the clear once (`onValueChange(null)` and `onEmpty`), not again on blur. Deleting it again later is reported again.
