---
"@booki/core": patch
"@booki/react": patch
"@booki/primitives": patch
---

`useBookiField` with `kind: "code"` takes `personOnly`: values only a person may choose, such as a deal's won and lost stages in a stage select the product already has. An agent's `setCode` to one of them is refused with a sentence that names it; a person's change, which passes its DOM event, goes through; the snapshot lists them.

`CurrencySelect` names its trigger in the person's language ("Valuta" on a Norwegian screen) and takes a `label` option, like the other pickers.
