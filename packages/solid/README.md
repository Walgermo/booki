# @booki/solid

Experimental. This adapter is less tested than `@booki/react`, and its API may
change between releases. See the
[Support section](https://github.com/Walgermo/booki#support) of the README.

Agent-first accounting controls for Solid. The same rules, state and agent
actions as `@booki/react`, generated from the same framework-free definitions
in `@booki/primitives`.

```bash
pnpm add @booki/solid @booki/styles
```

Each control is a namespace of parts, like `AmountField.Root` and
`AmountField.Input`. Create the agent bridge once with `createBookiAgent`.
Peer dependencies: `@ui-sdk/core` and `@ui-sdk/solid` 0.1.0-beta.17.
