---
"@booki/core": patch
"@booki/primitives": patch
"@booki/react": patch
"@booki/styles": patch
---

From the fourth product pilot, run in a real app:

- **`@booki/styles` no longer styles the product's own fields inside `useBookiField`.** The base rules for buttons, labels, selects and text reached into `field-amount`, `field-code` and `field-date`, whose markup is the product's, and made its labels invisible. The build now stops if a `useBookiField` kind is in the base scope again, and `base.css` is back to 57,463 B.
- **`useBookiField` code kind takes an option's label too** (any case), and a refusal lists each option as `value (label)`, so it says what `setCode` takes. A label two options share is refused.
- **`useBookiField` can be empty:** `allowEmpty` on an amount reads `minor: null` and `setMinor(null)` empties it; on a code, `setCode("")` or `setCode(null)` clears it.
- **`AccountPicker`'s `onValueChange` type** now declares the `{ reason, source }` it already received.
