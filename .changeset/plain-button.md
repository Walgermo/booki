---
"@booki-aui/react": patch
"@booki-aui/styles": patch
---

`Button`: a plain button with Booki's look, so an app no longer needs a button of its own. `variant` is `primary` (default, ink on paper), `secondary` (a card with a ring) or `ghost` (quiet, inside another surface); `size` is `md` (default) or `sm`, which looks smaller and keeps a 40px hit area. Native button props pass through and `type` defaults to `"button"`. It is ui-sdk's Button underneath, so an agent presses it by its text and `data-agent-confirm` and pending states work as on any button. It renders `data-slot="button"` with `data-booki-button`, `data-variant` and `data-size`; the styles are in `controls/button.css`. `IconButton` is now a `Button` underneath and takes `variant` (default `ghost`, its look until now) and `size`.
