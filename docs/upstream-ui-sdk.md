# Upstream: ui-sdk issues Booki works around

A gap in `@ui-sdk/*` that Booki works around. When it is fixed upstream, remove
the workaround named under it.

Fixed in 0.1.0-beta.17, and their workarounds removed: `SlotProps` is exported
from `@ui-sdk/core` (vercel-labs/ui#1017), so `@booki/primitives` and
`@booki/react` no longer copy ui-sdk declaration files into `dist`; and
`@ui-sdk/svelte` imports its files with extensions (vercel-labs/ui#1027), so
`@booki/svelte` no longer needs `ssr.noExternal`.

## History restores through the bridge, so an undo reports `source: "agent"`

Not reported yet.

**What happens.** `createHistory` puts values back with the bridge's own `act`, so
every change of an undo or a seek reaches change callbacks and `subscribe` with
`source: "agent"`. A person who presses Undo is then recorded as the agent. The
history needs that source to tell its own restoring from new changes, so a
caller can't change it from outside.

**Booki's workaround.** `createHistory` and `createBookiHistory` in
`@booki/react` mark the bridge while `seek` or `undoSource` runs: `attachAudit`
records those changes under the history's `by` (the person), and
`isHistoryRestoring()` is true for an app's own change callbacks. A fix upstream
would give the restore a source of its own, or the person's.
