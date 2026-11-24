---
"@booki/primitives": patch
"@booki/react": patch
"@booki/web": patch
"@booki/vue": patch
"@booki/svelte": patch
"@booki/solid": patch
---

Built on `@ui-sdk/*` 0.1.0-beta.17 (was beta.16), and the peer dependencies ask for it exactly, so move your `@ui-sdk` packages with Booki.

What changes for an agent, from ui-sdk: `act` checks the shape of the whole call before it runs, so a step with an unknown key or `args` that is not a list fails with a message instead of being half-read; a `setX` action that leaves `x` unchanged, or sets a different value, now fails and says what the value is; a number outside a control's min and max is refused, not clamped; `agentTools` lists `act` first. New in the bridge: an `expect` step, `closed` and `from` on `query`, and `more` and `section` in long snapshots.

What changes in Booki:

- `LedgerTable`'s `page` state is 1-based, the same as `table.page` and `setPage`. It was 0-based, so `setPage(3)` left `page: 2`, which ui-sdk now reports as a failed step.
- `@booki/svelte` no longer needs `ssr: { noExternal: [...] }`: `@ui-sdk/svelte` imports its own files with extensions now. Load it through Vite with the Svelte plugin as before.
- `@booki/primitives` and `@booki/react` no longer copy ui-sdk declaration files into `dist`, since `@ui-sdk/core` exports `SlotProps` now.

beta.17 was published on 2026-11-24; under a release-age rule (pnpm 11 waits one day by default) it installs from 2026-11-25.
