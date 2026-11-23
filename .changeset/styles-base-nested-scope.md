---
"@booki/styles": patch
---

`base.css` is smaller: it states the component scope once per group of rules (CSS nesting inside `:where()`), not once per rule. Specificity stays zero and every selector and declaration is unchanged (checked with `scripts/compare-selectors.mjs`). `base.css` goes from 84,855 B raw / 7,732 B gzip to 57,463 B / 7,347 B; `booki.css` from 170,411 B / 16,879 B to 143,019 B / 16,406 B (gzip at level 6). The build now fails if `base.css` grows past its size budget.
