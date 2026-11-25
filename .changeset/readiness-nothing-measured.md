---
"@booki-aui/readiness": patch
---

A page whose bridge has no controls no longer reads as a pass. The console prints "no score", the HTML report says nothing was measured, and the JSON report gets `measured: false`, `grade: "not measured"` and a `notMeasured` text that points to opening the form first and calling `check(page)`. `score` stays in the JSON. `--fail-under` now exits 1 for an unmeasured page.
