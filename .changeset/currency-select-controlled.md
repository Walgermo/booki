---
"@booki/react": patch
---

A controlled `CurrencySelect` (with `value`) no longer passes its default "NOK" as `defaultValue` too, so ui-sdk stops warning "got `value` and `defaultValue`" on every render.
