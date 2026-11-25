# @booki-aui/primitives

Every Booki control defined once, without a framework: its options, state, agent actions and parts, as a ui-sdk `definePrimitive` definition. `@booki-aui/react`, `@booki-aui/web`, `@booki-aui/vue`, `@booki-aui/svelte` and `@booki-aui/solid` render these same definitions, so a control behaves the same wherever it is used.

Most apps install a framework package and never import this one. Import it to render a Booki control under your own markup and names:

```tsx
import { createParts } from "@booki-aui/react"
import { amountField } from "@booki-aui/primitives/amount-field"

const { Root, Input } = createParts(amountField, { root: "div", input: "input" })
```

- Amounts are integer minor units, in and out.
- A decision that needs a person (approve, sign off, release) is marked with `personOnly`, and the agent bridge refuses it whatever the app's `allow` says.
- Bank accounts, IBANs and payment references read as `[redacted]` to an agent.

Peer dependency: `@ui-sdk/core` 0.1.0-beta.17. Rules and money live in `@booki-aui/core`.

Docs and source: https://github.com/Walgermo/booki
