---
"@booki-aui/core": patch
"@booki-aui/primitives": patch
"@booki-aui/react": patch
---

`AmountField` and the other form controls now put `aria-invalid`, `aria-describedby` and `aria-errormessage` on the visible input instead of the wrapper, so a screen reader announces an error on the field. If you set `aria-describedby` on one of them and relied on it reaching the wrapper, move it to a wrapper of your own.

With `allowEmpty`, `AmountField` now calls `onValueChange(null)` when the field is emptied, and `onValueChange` is typed `(minor: number | null, details?) => void`, so a controlled field learns it was cleared. A handler typed `(minor: number)` on a field with `allowEmpty` no longer type-checks: accept `number | null`. `onEmpty` still fires, after `onValueChange`. The props are now listed in the catalog and the skill.

`useBookiField` takes `group: false` for a field that already has its own labelled group (a `fieldset` with a `legend`): the root loses `role="group"`, so the group is not announced twice. It also has a new `account` kind (`setAccount`): digits of a length range, or a closed `chart` whose unknown numbers are refused with the nearest accounts, in English and Norwegian.
