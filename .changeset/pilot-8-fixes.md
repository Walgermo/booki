---
"@booki/styles": patch
---

`AmountField` is one control high, like the other fields, instead of 7px taller. `@booki/styles/shadcn.css` gives Booki's fields shadcn's input height (`h-9`, 44px on touch); set `--bk-control-h` after the import if your inputs are another height. The drop-in guide covers a `numeric` column that arrives as a JS number (`fromMajor`) and a currency list of your own.
