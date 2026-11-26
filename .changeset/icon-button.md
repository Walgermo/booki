---
"@booki-aui/react": patch
"@booki-aui/styles": patch
"@booki-aui/readiness": patch
---

`IconButton`: an icon button named by what it does. `label` is required ("Delete line 2"); it is the button's accessible name and tooltip, so an agent presses it by those words and a screen reader says them, and the icon is hidden. Pass any icon, such as `<TrashIcon />` from `@booki-aui/icons/react`; `showLabel` adds the label as visible text. It is ui-sdk's Button underneath, so `data-agent-confirm` and pending states work as on any button. Readiness now calls a nameless icon-only button that and points to `IconButton`, and flags a Booki icon shown at a size other than 16 or 20 px (minor, 1 point).
