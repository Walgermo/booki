# Upstream: ui-sdk issues Booki works around

Gaps in `@ui-sdk/*`. The first two, present in 0.1.0-beta.13 and still in beta.16,
are reported and fixed upstream (vercel-labs/ui#1043 and #1042, merged after
beta.16 was published), so the next release should carry them. When Booki moves
to a release that has a fix, remove the workaround named under it.

## 1. `SlotProps` and the types it rests on are not exported from `@ui-sdk/core`

Reported: [vercel-labs/ui#1017](https://github.com/vercel-labs/ui/issues/1017)
(the bundled-declarations part is in [this comment](https://github.com/vercel-labs/ui/issues/1017#issuecomment-7083870679)).

**What happens.** A library that calls `definePrimitive` and emits declarations
gets an inferred type that names `SlotProps` (`foundation/kernel/primitive-types`).
`@ui-sdk/core` does not export it, and its `exports` map blocks the deep path,
so TypeScript cannot write an importable reference. Bundled declarations
(tsup / rollup-plugin-dts) copy `primitive-types.d.ts` into the library's
`dist` with four relative imports to files the library does not have:
`./live.js`, `./roles.js`, `./selects.js`, `./store.js`. A consumer with
`skipLibCheck: false` gets `TS2307` for each.

**Booki's workaround.** `scripts/vendor-ui-sdk-types.mjs` copies the four
files into `dist` after `tsup` in `@booki/primitives` and `@booki/react`.

## 2. `@ui-sdk/svelte` imports `./create-parts` without an extension

Reported: [vercel-labs/ui#1027](https://github.com/vercel-labs/ui/issues/1027).

**What happens.** `dist/primitive.js` has `export { createParts } from "./create-parts"`.
`dist` holds both `create-parts.js` and a folder `create-parts/`, so Node's ESM
loader resolves the folder and throws `ERR_UNSUPPORTED_DIR_IMPORT`. Importing
`@ui-sdk/svelte` from plain Node fails, and so does Vite SSR when the package
is left external (the default for dependencies). A bundled client build works.

**Booki's workaround.** `@booki/svelte`'s README (written by
`scripts/generate-frameworks.mjs`) says to load it through Vite with the Svelte
plugin and to keep both packages in the SSR bundle with `ssr.noExternal`.

## 3. History restores through the bridge, so an undo reports `source: "agent"`

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
