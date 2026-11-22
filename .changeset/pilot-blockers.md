---
"@booki/primitives": minor
"@booki/react": minor
"@booki/styles": minor
---

`clear` on AccountPicker, TaxCodeSelect and AccountingPeriodSelect now empties the select; it used to choose the first item. AccountPicker starts empty without a `defaultValue`, or with one the chart does not have, where it used to start on the first account; pass `defaultValue` if you relied on that. A TaxCodeSelect `defaultValue` that is not in the list is no selection. Their `onValueChange` can now report `""`, and `setValue("")` restores it, so undo reaches an empty select.

`@booki/styles/layered.css` sets the layer order Tailwind 4 needs (`theme, base, booki, components, utilities`). If you import with `layer(booki)`, put `@layer theme, base, booki, components, utilities;` first: without it Tailwind's reset wins.
