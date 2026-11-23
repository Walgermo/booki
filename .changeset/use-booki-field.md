---
"@booki/core": patch
"@booki/react": patch
---

`useBookiField` wraps an amount, a closed-list code or a date field you already have and gives it `setMinor`, `setCode` or `setDate` with Booki's rules, refusals in English and Norwegian, and the same audit and source reporting as Booki's own controls. Your field stays as it is; `render` returns it. New `field.unknown-code` messages name the options that exist.
