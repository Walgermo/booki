# @booki/svelte

Experimental. This adapter is less tested than `@booki/react`, and its API may
change between releases. See the
[Support section](https://github.com/Walgermo/booki#support) of the README.

Agent-first accounting controls for Svelte. The same rules, state and agent
actions as `@booki/react`, generated from the same framework-free definitions
in `@booki/primitives`.

```bash
pnpm add @booki/svelte @booki/styles
```

Each control is a namespace of parts, like `AmountField.Root` and
`AmountField.Input`. Create the agent bridge once with `createBookiAgent`.
Peer dependencies: `@ui-sdk/core` and `@ui-sdk/svelte` 0.1.0-beta.14.

Load it through Vite with the Svelte plugin (SvelteKit has it). For server rendering, keep both packages in the server bundle: `ssr: { noExternal: ["@booki/svelte", "@ui-sdk/svelte"] }`. Left external, or imported from plain Node, `@ui-sdk/svelte` fails: it imports its own folders by directory and leaves that to the bundler.
