---
"@booki-aui/readiness": patch
---

`snapshot-values` checks a value read from a document (`{ value, confidence }`, a supplier invoice's fields) by the amount or date it holds instead of rejecting the wrapper. Bridge coverage lets a grid cell with `aria-readonly="false"` override its read-only grid, so an editable cell the bridge leaves out is reported.
