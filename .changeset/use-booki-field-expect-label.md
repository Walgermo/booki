---
"@booki-aui/core": patch
"@booki-aui/react": patch
---

`useBookiField`: `expect` now works on every kind. Each snapshot holds `value` beside its own key (`minor`, `code`, `account`, `date`), and `expect` compares `value`, so `expect` after `setAccount("2400")` passes instead of reading null. An amount's `value` and `minor` are both integer minor units.

With `language: "nb"`, a failed multi-step `act` now ends in Norwegian: "Stegene før dette er utført." and "Send det på nytt med …" replace the English "The steps before this one stay done." and "Send it again with …".

`useBookiField` with `group: false` no longer puts `aria-label` on the root, so `getByLabelText("Your label")` finds the input alone and your visible `<label>` is the only accessible name. The agent still reads the same label, from a visually hidden element inside the root (`data-slot="visually-hidden"`; `@booki-aui/styles` hides it). If you query that text with `getByText`, it now matches two elements.

Docs: render the product's own input inside `useBookiField`, never one that is on the bridge such as ui-sdk's `Input`, or the field appears twice.
