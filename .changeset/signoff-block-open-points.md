---
"@booki/core": patch
"@booki/primitives": patch
"@booki/react": patch
---

**A company can block sign-off while points are open.** `DocumentSignoff` takes `blockOpenPoints` (off by default: open points still go with the signature). `signObstacles` and `signDocument` take `{ blockOpenPoints }`, and `guardSignDocument` in `@booki/core/server` applies the same rule and refuses an agent at every level. New message `signoff.open-points`, in English and Norwegian.
