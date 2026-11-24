---
"@booki/react": patch
---

`createBookiAgent({ language: "nb" })` works with `createBookiHistory`, `createHistory` and `registerTools`. Before, history threw "createHistory requires an agent with the original act method returned by createAgent" when it was created, and the WebMCP `act` tool failed when called, because the agent's translated `act` is not the one ui-sdk looks up. They now use the bridge underneath; what they answer themselves is in ui-sdk's words.
