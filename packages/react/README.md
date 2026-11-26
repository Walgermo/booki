# @booki-aui/react

Agent-first controls for accounting and auditing in React. Each control gives an agent typed state and named actions over Booki's agent bridge, and enforces the accounting rules from `@booki-aui/core` whatever the agent sends.

```tsx
import { AmountField, VoucherComposer, BankReconciliation, createBookiAgent } from "@booki-aui/react"
```

- Amounts are integer minor units, in and out.
- Posting, paying and approving are marked for a person.
- Bank details read as `[redacted]` to an agent.
- `AgentCursor`, `AgentPresence`, `useAgentProposal` and `AgentProposal` make the agent's work visible.
- A control of your own: define its primitive with `definePrimitive` and `createChange`, then create its parts with `createParts`, all exported from here. A Booki control under your own names: `createParts` with a definition from `@booki-aui/primitives`.

Requires React 19. Peer dependencies: `@ui-sdk/core` and `@ui-sdk/react` 0.1.0-beta.18. The agent catalog is in `docs/llms.txt`.

Docs and source: https://github.com/Walgermo/booki
