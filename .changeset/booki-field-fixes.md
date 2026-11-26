---
"@booki-aui/react": patch
---

`useBookiField`: a disabled or read-only field ignores a person's edit, as it does an agent's. A refusal is shown in the screen's language (the agent still reads English). The date kind takes `allowEmpty`, so `setDate("")` or `setDate(null)` clears an optional date. An account field given an empty `chart` allows no number, instead of falling back to the open-field length check. A code field's `personOnly` values are refused for an agent's step even when it passes an event of its own, and the list in the snapshot is a frozen copy, so changing it changes nothing.
