---
"@booki-aui/readiness": patch
---

A page whose bridge has no controls and that has no fields or charts no longer reads as a pass. The console prints "no score", the HTML report says nothing was measured, and the JSON report gets `measured: false`, `grade: "not measured"` and a `notMeasured` text that points to opening the form first and calling `check(page)`. A page without a bridge but with fields is still scored, with `bridge-missing`. `score` stays in the JSON. `--fail-under` exits 1 for an unmeasured page.
