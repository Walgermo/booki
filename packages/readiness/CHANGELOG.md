# @booki/readiness

## 0.1.1

### Patch Changes

- [`e6d4e3d`](https://github.com/Walgermo/booki/commit/e6d4e3d1ecad7cde7489f6ce32937c9e99ed262b) Thanks [@Walgermo](https://github.com/Walgermo)! - The Agent Contract is now marked a draft with one implementation.
  
  - **`@booki/readiness/conformance`**: `runConformance` runs 12 checks of the contract (sections 2 to 7) against any bridge with `snapshot`, `act` and `subscribe`, and `formatConformance` prints them.
  - **`@booki/readiness/reference`**: `createReference`, a small implementation of the contract without Booki or ui-sdk.

- [#62](https://github.com/Walgermo/booki/pull/62) [`b3e37e4`](https://github.com/Walgermo/booki/commit/b3e37e4a71af5b467d93fb2775b06a4089916927) Thanks [@Walgermo](https://github.com/Walgermo)! - From the seventh product pilot, run in a real app:
  
  - **An undo is the person's.** ui-sdk's history puts values back through the bridge, so an undo reported `source: "agent"` and `attachAudit` recorded it as the agent's work. `createBookiHistory(agent, { by })` and `createHistory` now record an undo or a seek under `by` (a person's actor id, or a function that returns the one signed in; default `"person"`), and `isHistoryRestoring()` is true while the values go back, for your own change callbacks.
  - **What a step did, in Norwegian.** With `createBookiAgent({ language: "nb" })`, a step's own sentence (`Pressed "Bokfør".`, `… is closed now.`, `Its action is still running.`) comes back as `Trykket på "Bokfør".` and so on, like the refusals already did.
  - **A record's status in the person's language.** A Norwegian sentence such as `finding.not-draft` or `invoice.locked` wrote the status in English ("er confirmed"); it now reads "er bekreftet". A status the agent sent, quoted in the sentence, stays as it must be sent. A missing status reads "without a status" ("uten status") instead of a literal `{status}`.
  - **One closing stop.** A sentence that ends in a question ("…: Godkjenne fakturaen?") no longer ends in "?.".
  - **The cursor's label stays in the window.** Near the right edge it sits left of the pointer, and it is cut with "…" before it would leave the window (`cursorLabelRoom` in `@booki/primitives/agent-cursor`).
  - **Readiness says when it measured another page.** When the page sends the browser on (often to a sign-in page), the report has `redirectedFrom`, and the console and HTML report say to pass `--storage-state`.

- [`8acb2f1`](https://github.com/Walgermo/booki/commit/8acb2f1c22ee98650e5c7472d7947b45814709d9) Thanks [@Walgermo](https://github.com/Walgermo)! - Readiness: a `--timeout <ms>` option for page load (the CLI had a fixed 30 s, too short for a dev server compiling a page on first request); `check(page)` works in your own Playwright page without defining `globalThis.__name`, because every function sent to the page carries its own helper; and the field-name checks skip inputs no one can reach (`aria-hidden`, `inert`, `type="hidden"`, not rendered, or visually hidden out of the tab order, such as the native input Base UI and Radix put beside a custom select, radio group or checkbox), while a visible unlabelled input is still reported. The README shows how to check a form behind a button from your own script.

- [`7291bce`](https://github.com/Walgermo/booki/commit/7291bce6da809f085c33662c3403c83afcef5c28) Thanks [@Walgermo](https://github.com/Walgermo)! - Two fixes from the fifth product pilot.
  
  - **New check, "Field missing from the bridge" (`field-not-on-bridge`, 5 points each, at most 30).** A page with a bridge scored 100 although a radio group and four filter selects a person could use had no entry in the bridge's snapshot. On a page whose bridge has a snapshot, every named field a person can use must now be covered: its name equals an entry's `label`, or it sits inside the element of a bridge component (ui-sdk's `data-slot="<component>"` root, or its `<component>-<part>` parts). A radio group is reported once; disabled fields, fields inside `data-agent-hidden` and hidden inputs are skipped.
  - **WebMCP tools are listed once.** A tool registered again (ui-sdk's `registerTools` under React's development double effect unregisters by aborting its signal, then registers again) or on both `document` and `navigator` was listed twice. Registrations now honour the `signal`, replace a tool of the same name, and `provideContext` replaces the tool set.

## 0.1.0

First preview. Not yet on npm: Booki is published once v1 has run in a real product.
