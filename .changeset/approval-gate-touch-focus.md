---
"@booki/react": patch
---

`ApprovalGate` no longer forces focus into its word field, so opening it by touch does not raise the phone's keyboard over what is being approved. Opened with a mouse or keys, the dialog still focuses the field. The field also asks for capitals and a "done" key, and turns off autocorrect.
