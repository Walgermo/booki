---
"@booki-aui/core": patch
"@booki-aui/primitives": patch
---

`logActivity` takes an optional `today` (YYYY-MM-DD): an entry dated with no time is checked against the person's own date rather than the UTC one. ActivityTimeline passes the local date.
