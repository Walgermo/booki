---
"@booki-aui/react": patch
"@booki-aui/styles": patch
---

Building blocks for the screens around the accounting controls. `Card`: a paper surface with a `title` that names the region, `description`, `actions` beside the title (they wrap under it when the card is narrow), the body and a `footer`. `Field`: a `label`, one control, `help` and `errorText`, wired with `for`, `aria-describedby` and `aria-invalid`; a plain text `<input>` or `<textarea>` inside becomes one the agent fills by the label, while a password or a `<select>` is wired for people only. `Toolbar`: a named row of actions with one tab stop, arrow keys, Home and End between items, and wrapping when narrow, with `ToolbarGroup` and `ToolbarSeparator`; the agent reads it as one toolbar listing its buttons and presses one by name, and a button's `data-agent-confirm` still holds. Each has one stylesheet in `@booki-aui/styles` (`controls/card.css`, `controls/field.css`, `controls/toolbar.css`), on tokens only, keyed on a Booki attribute so another library's `card`, `field` or `toolbar` slot is never restyled.
