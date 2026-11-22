# @booki/vue

Agent-first accounting controls for Vue. The same rules, state and agent
actions as `@booki/react`, generated from the same framework-free definitions
in `@booki/primitives`.

```bash
pnpm add @booki/vue @booki/styles
```

Each control is a namespace of parts, like `AmountField.Root` and
`AmountField.Input`. Create the agent bridge once with `createBookiAgent`.
Peer dependencies: `@ui-sdk/core` and `@ui-sdk/vue` 0.1.0-beta.14.
