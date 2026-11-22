# Booki

Build agent-first web apps for accounting and auditing: React controls that an
agent can operate, and cannot misuse.

Agents already work in accounting software by reading the screen and typing
into text boxes. Booki replaces those fields with controls that hand an agent
typed state and named accounting actions over Booki's agent bridge, enforce
the bookkeeping rules
whatever the agent sends, and stop where a person has to decide.

```tsx
import { AmountField, VoucherComposer, createBookiAgent } from "@booki/react"
import "@booki/styles"

const agent = createBookiAgent()

await agent.act({
  steps: [
    { ref: "Amount excl. tax", action: "setMinor", args: [312500] },
    { ref: "Voucher lines", action: "assertPostable", args: [] },
  ],
})
```

## What it guarantees

| Rule | How |
| --- | --- |
| Money is whole minor units | A fraction is refused at the action, before it reaches a voucher. |
| A voucher balances or it is not posted | `assertPostable` names the difference and any missing dimension. |
| Codes come from closed lists | Accounts, VAT codes, departments and projects. The error lists valid ones. |
| People approve what leaves the account | Posting, paying and approving are marked for a person. |
| Bank details stay unread | Account numbers, IBAN and KID read as `[redacted]` to an agent. |
| The agent's work is visible | Presence, proposals a person keeps or reverts, and a mark on what it set. |
| Closed periods stay closed | A voucher dated in a closed period is not postable; a locked period never reopens. |
| Approval takes the right people | Levels, amount limits and substitutes. The requester cannot approve; a payment run needs two people who did not prepare it. |
| A fixed invoice stays fixed | Totals come from the lines. After finalizing, corrections are credit notes. |


The rules run twice: on screen for speed and clarity, and on your server as the
gate. `@booki/core/server` checks the caller your sign-in established (a person
or an agent with its own credential), its role, separation of duties and the
books, and answers with a status and the same sentence the control showed:

```ts
import { guardPostVoucher, toHttp } from "@booki/core/server"

const verdict = guardPostVoucher({ actor, locale: "nb" }, { lines, date, rules: { periods, accounts } })
const { status, body } = toHttp(verdict) // 200, or 401/403/409/422 with a reason
```


Booki implements an open specification, [the Agent Contract for Accounting
UIs](spec/agent-contract.md): what a screen gives an agent, what stays with a
person, how every step is recorded and how the server checks it again. Any ERP
can implement it; one agent then works across products.

Trying it in a product? [A one-screen pilot](docs/pilot.md) takes two weeks and
measures your own screen before and after. `pnpm proof` runs the real-model
numbers with your key.

## Packages

| Package | Role |
| --- | --- |
| `@booki/core` | Rules with no framework: money, vouchers, bank reconciliation, approval chains, period locks, close checklists, invoices, payment batches, supplier invoices, attachments, expenses, ledger, aging, VAT returns, audit sampling, fixed assets, exchange rates, roles, validators, country profiles. |
| `@booki/primitives` | Every control's definition with no framework: its state, its agent actions and the rules it enforces. The packages below render these. |
| `@booki/react` | The controls for React, the agent bridge, and the visible-agent pieces (`AgentCursor`, `AgentPresence`). |
| `@booki/web` | The controls as custom elements (`<booki-amount-field>`), for Angular, server-rendered pages and plain HTML. |
| `@booki/vue`, `@booki/svelte`, `@booki/solid` | The same controls as parts for each framework (`AmountField.Root`, `AmountField.Input`). |
| `@booki/styles` | Optional default look, "Paper and Ink", as CSS variables. See `DESIGN.md`. |

Every framework package is generated from the same definitions, so a control
has the same name, state, actions and rules in each, and one agent operates
them all. Which to use:

| Your product | Package |
| --- | --- |
| React | `@booki/react` |
| Angular, or pages rendered on the server (jQuery, Rails, .NET) | `@booki/web` |
| Vue 3, Nuxt | `@booki/vue` |
| Svelte 5 | `@booki/svelte` |
| Solid 2 | `@booki/solid` |

Not on npm yet. Until it is, use it from this repo.

## Run it

Node 22.13 or later and pnpm 11 (`corepack enable` picks the version).

```bash
pnpm install
```

```bash
pnpm dev
```

Open http://localhost:5173. `/demo` is a small accounting product built only
from these controls, with an agent working each screen; `/close` is one
month-end; `/docs` has every control with its live agent snapshot.

`examples/ap-flow` is a whole accounts-payable flow in Next.js, from the
supplier inbox to a reconciled bank line: four people, an agent with its own
credential, and a server guard on every write. Run it with
`pnpm --filter @booki/example-ap-flow dev` (http://localhost:3100).

The "ask it yourself" box on `/close` uses a real Claude model. It needs a key
on the server: copy `apps/www/.env.example` to `apps/www/.env.local` and fill in `ANTHROPIC_API_KEY`. Everything
else works without one.

## Checks

```bash
pnpm check
```

Formatting, lint, typecheck and every test, as CI runs them. They build the packages first
when `dist` is missing or stale. How to contribute, and which rules a review
checks: `CONTRIBUTING.md`. Versions and release notes: `RELEASING.md`.

A benchmark that runs the same task with a real model through browser tools
and through the bridge is in `benchmarks/agent`.

## For coding agents

- `AGENTS.md`: how this repo works.
- `DESIGN.md`: tokens, layout rules and what does not exist.
- `packages/react/docs/llms.txt`: every control and its agent actions.
- `skills/booki/SKILL.md`: install with
  `npx skills add Walgermo/booki --skill booki`.

## Not covered yet

- Outside React, the controls come as parts: you write the markup around them (rows, options). The agent cursor is `<booki-agent-cursor>` in `@booki/web`, usable from any framework; `AgentPresence` is React-only for now.
- Refusals and issues are English and Norwegian. Role names and permission ids in them are your data and stay as you wrote them. A few messages raised in the React layer are English only.
- Sweden, Denmark, the UK and Germany are starter profiles with English labels.
- The VAT return ships example schemas only. You supply the real box layout.
- Intercompany eliminations, consolidation, budgets, payroll and dunning.
- Nothing connects to a bank, a tax authority or a document scanner: the host does.

## Scope

React 19, Vue 3.5, Svelte 5.33, Solid 2 or any browser with custom elements (peer dependencies: `@ui-sdk/core` and the `@ui-sdk` package for your framework, `0.1.0-beta.14`). Profiles for Norway, the United States, Sweden, Denmark, the United Kingdom and Germany; define your own for the rest. No ERP
connectors: your backend stays yours.

MIT.
