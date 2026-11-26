---
"@booki-aui/react": patch
---

TaxCodeSelect, CurrencySelect and AccountingPeriodSelect pass `aria-invalid`, `aria-describedby`, `aria-errormessage` and `required` to the native `<select>` as well as the button, so on a touch screen, where the native picker is the one a person uses, a screen reader hears the field's error.
