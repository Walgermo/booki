---
"@booki/core": patch
"@booki/primitives": patch
"@booki/react": patch
"@booki/styles": patch
"@booki/web": patch
"@booki/readiness": patch
---

From the seventh product pilot, run in a real app:

- **An undo is the person's.** ui-sdk's history puts values back through the bridge, so an undo reported `source: "agent"` and `attachAudit` recorded it as the agent's work. `createBookiHistory(agent, { by })` and `createHistory` now record an undo or a seek under `by` (a person's actor id, or a function that returns the one signed in; default `"person"`), and `isHistoryRestoring()` is true while the values go back, for your own change callbacks.
- **What a step did, in Norwegian.** With `createBookiAgent({ language: "nb" })`, a step's own sentence (`Pressed "Bokfør".`, `… is closed now.`, `Its action is still running.`) comes back as `Trykket på "Bokfør".` and so on, like the refusals already did.
- **A record's status in the person's language.** A Norwegian sentence such as `finding.not-draft` or `invoice.locked` wrote the status in English ("er confirmed"); it now reads "er bekreftet". A status the agent sent, quoted in the sentence, stays as it must be sent. A missing status reads "without a status" ("uten status") instead of a literal `{status}`.
- **One closing stop.** A sentence that ends in a question ("…: Godkjenne fakturaen?") no longer ends in "?.".
- **The cursor's label stays in the window.** Near the right edge it sits left of the pointer, and it is cut with "…" before it would leave the window (`cursorLabelRoom` in `@booki/primitives/agent-cursor`).
- **Readiness says when it measured another page.** When the page sends the browser on (often to a sign-in page), the report has `redirectedFrom`, and the console and HTML report say to pass `--storage-state`.
