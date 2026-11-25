---
"@booki/core": patch
"@booki/primitives": patch
"@booki/react": patch
---

An `act` call without `steps`, like `{ "step": [] }` from a model that got the shape wrong, now comes back with ui-sdk's sentence (`act takes { "steps": [...] }, not …`) instead of throwing a TypeError. Through WebMCP the model used to get only "Tool execution failed". With `language: "nb"`, ui-sdk's sentences about a call in the wrong shape (no `steps`, a field `act` doesn't take, a step without a ref, an action or a value) come back in Norwegian.
