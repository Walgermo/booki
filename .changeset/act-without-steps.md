---
"@booki/primitives": patch
"@booki/react": patch
---

An `act` call without `steps`, like `{ "step": [] }` from a model that got the shape wrong, now comes back with ui-sdk's sentence (`act takes { "steps": [...] }, not …`) instead of throwing a TypeError. Through WebMCP the model used to get only "Tool execution failed".
