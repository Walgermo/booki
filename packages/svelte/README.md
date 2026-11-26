# @booki-aui/svelte

Experimental. This adapter is less tested than `@booki-aui/react`, and its API may
change between releases. See the
[Support section](https://github.com/Walgermo/booki#support) of the README.

Agent-first accounting controls for Svelte. The same rules, state and agent
actions as `@booki-aui/react`, generated from the same framework-free definitions
in `@booki-aui/primitives`.

```bash
booki_version=$(npm view @booki-aui/svelte@latest version) &&
ui_sdk_version=$(npm view "@booki-aui/svelte@$booki_version" peerDependencies.@ui-sdk/core) &&
pnpm add --save-exact "@booki-aui/svelte@$booki_version" "@booki-aui/styles@$booki_version" \
  "@ui-sdk/core@$ui_sdk_version" "@ui-sdk/svelte@$ui_sdk_version"
```

Each control is a namespace of parts, like `AmountField.Root` and
`AmountField.Input`. Create the agent bridge once with `createBookiAgent`.
Peer dependencies: `@ui-sdk/core` and `@ui-sdk/svelte` 0.1.0-beta.18.

Load it through Vite with the Svelte plugin (SvelteKit has it), as with any Svelte component library.
