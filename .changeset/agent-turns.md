---
"@booki-aui/react": patch
---

An undo asked for while an agent's turn is still running now waits for that turn, so the agent's remaining steps are recorded as the agent's and only the undo as the person's. With `language: "nb"`, an action still running answers `pending` as before instead of a translated word, and only the refusal and each step's own sentence are translated. `attachAudit` names what a record added to or removed from a list held, like a voucher line's account and amount, instead of only its id.
