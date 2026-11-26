---
"@booki-aui/primitives": patch
"@booki-aui/react": patch
---

AmountField: emptying an amount (`clear`, `setMinor(null)`, deleting the text) is now reported on `minor` as well as `empty`, so history can undo it and put the amount back. A controlled field whose owner does not pass the new `value` back keeps both its amount and its emptiness, instead of reading empty (or filled) while it still holds the old value.
