---
"@booki-aui/core": minor
"@booki-aui/primitives": minor
"@booki-aui/react": minor
---

Breaking while Booki is 0.x, so this is a minor.

`AmountField` and the other form controls now put `aria-invalid`, `aria-describedby` and `aria-errormessage` on the visible input instead of the wrapper, so a screen reader announces an error on the field. If you set `aria-describedby` on one of them and relied on it reaching the wrapper, move it to a wrapper of your own. On the US bank field the account-number input now takes `aria-invalid` too.

With `allowEmpty`, `AmountField` now calls `onValueChange(null)` at runtime when the field is emptied (clearing it, or deleting its text). A handler that does arithmetic on the value or calls `money()` on it must handle `null`. `onEmpty` still fires, after `onValueChange`. In types, `onValueChange` is `(minor: number | null, details?) => void` whenever `allowEmpty` is `true` or a `boolean` variable, so a handler typed `(minor: number)` there no longer type-checks: accept `number | null`. With `allowEmpty` left out or `false` the handler still gets a `number`. The props are now listed in the catalog and the skill.

`useBookiField` takes `group: false` for a field that already has its own labelled group (a `fieldset` with a `legend`): the root loses `role="group"`, so the group is not announced twice. It also has a new `account` kind (`setAccount`): digits of a length range, or a closed `chart` whose unknown numbers are refused with the nearest accounts, in English and Norwegian. The check applies to a whole number, so a render that a person types into keeps a draft and calls `change` on blur (see `docs/own-controls.md`).
