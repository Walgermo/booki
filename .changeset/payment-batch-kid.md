---
"@booki-aui/primitives": patch
"@booki-aui/react": patch
---

PaymentBatch: a reference that is a KID (digits with a valid mod-10 or mod-11 check digit) reads "[redacted]" to an agent even when the batch is shown under a profile whose references are memos, like the US one. Turning on `secretReference` after the batch is on the page now hides `payments` as well as the list's rows.
