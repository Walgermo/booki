---
"@booki/react": patch
---

From the fifth product pilot. `AgentCursor` narrates in Norwegian under a Norwegian profile ("setter beløp 125000" instead of "set minor 125000"); `narrateNorwegian` is exported for a page that picks its language itself. `createBookiAgent({ language: "nb" })` returns Booki's refusals in `act` results in Norwegian; the default stays English, and the bridge's own sentences stay as ui-sdk writes them.
