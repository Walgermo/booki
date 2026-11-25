---
"@booki-aui/readiness": patch
---

A page whose bridge has no controls but which has fields of its own (plain selects and text areas that are not on the bridge) no longer scores 100. Each such field is now reported as `field-not-on-bridge`, as it already was when the bridge had some controls. A page with an empty bridge and nothing else to judge is still "not measured".
