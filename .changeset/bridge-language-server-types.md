---
"@booki-aui/core": patch
---

With `createBookiAgent({ language: "nb" })` a declined confirm now comes back in Norwegian also when the app's confirm text is a question or several sentences ("Bokføre bilag 12. Dette kan ikke angres: vil du fortsette?"); the confirm text of a refusal is read as page text. `toHttp(verdict).body` is typed (`HttpBody<T>`: the value on success, `{ ok: false, code, message, issues? }` on a refusal) instead of `unknown`, so it can be mapped to your own error shape. A person-only refusal no longer lists the refused agent's own roles under "ask someone with one of these roles".
