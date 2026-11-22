---
name: booki
description: >-
  Installs and wires Booki (@booki/core, @booki/react, @booki/styles) into a
  React 19, Vue, Svelte, Solid or Web Components app — BookiLocaleProvider, agent-ready accounting primitives, and
  createBookiAgent. Use when adding Booki, agent-first accounting controls, AmountField,
  VoucherComposer, bank/KID inputs, or agent-operated ledger UI.
---

# Booki

Agent-first UI for accounting and auditing.
Operate controls via `createBookiAgent` — not DOM clicking.

Public skill (this file):
https://raw.githubusercontent.com/Walgermo/booki/main/skills/booki/SKILL.md

Install into the agent:
```bash
npx skills add Walgermo/booki --skill booki
```

## Goal

Fully implement Booki in the user's app: packages, locale provider, styles,
domain primitives the product needs, and an agent bridge with human gates for
money movement.

## 1. Install

```bash
pnpm add @booki/core @booki/react @booki/styles
```

Requires React 19+ for `@booki/react`. Other stacks: `@booki/web` (custom elements; Angular,
server-rendered pages), `@booki/vue`, `@booki/svelte`, `@booki/solid`, all with the same
controls and actions. Peer dependencies (`@ui-sdk/core` and the `@ui-sdk` package for the framework, 0.1.0-beta.14)
are installed with the packages; add them by hand only if your package manager does not.

## 2. Provider + styles

```tsx
import { BookiLocaleProvider } from "@booki/react"
import "@booki/styles"

export function App() {
  return (
    <BookiLocaleProvider defaultCountry="NO">{/* or "US" */}
      {/* app */}
    </BookiLocaleProvider>
  )
}
```

`useBookiLocale()` / `useBookiLocaleOptional()` → `country`, `profile`, `setCountry`.

| Concern | NO | US |
| --- | --- | --- |
| Currency | NOK | USD |
| Bank | Kontonummer (mod11) | ABA routing + account |
| Org id | Organisasjonsnummer (mod11) | EIN |
| Period | Year / month / MVA-termin | Year / month |
| Payment ref | KID | Memo / invoice # |
| SCA | BankID mock | Passkey mock |

## 3. Agent bridge (one per app, in `src/agent.ts`)

```tsx
import {
  createBookiAgent,
  createAgentCursor,
  attachAudit,
  createBookiHistory,
  registerTools,
} from "@booki/react"

// The company's rules for marked steps (data-agent-confirm): return true to let
// the agent do it alone, false to refuse, undefined to ask the person.
const policy = (step: { confirm?: string }) => undefined

const allow = async (step: { confirm?: string }) => {
  if (!step.confirm) return true
  return policy(step) ?? window.confirm(step.confirm) // swap for the app's own dialog
}

// A visible agent pointer: it goes to each control and presses before the step runs.
export const cursor = createAgentCursor()

export const agent = createBookiAgent({
  agentId: "bookkeeper",
  ruleVersion: "posting-1",
  allow: cursor.wrap(allow),
})

attachAudit(agent, (event) => auditLog.push(event), {
  agentId: "bookkeeper",
  ruleVersion: "posting-1",
})
export const history = createBookiHistory(agent)

// Browser agents (WebMCP) get the same tools, cursor and rules.
registerTools(agent, { allow: cursor.wrap(allow) })

// Console and devtools: window.agent.snapshot()
Object.assign(window, { agent })
```

At the app root, once:

```tsx
import { BookiAccessProvider, BookiLocaleProvider, AgentCursor, AgentPresence } from "@booki/react"
import { agent, cursor } from "./agent"

<BookiLocaleProvider defaultCountry="NO">
  <BookiAccessProvider actor={{ id: user.id, name: user.name, roles: user.roles }}>
    <App />
    <AgentPresence agent={agent} />   {/* marks what the agent changed; announces it */}
    <AgentCursor cursor={cursor} />    {/* the agent's pointer, ring and narration */}
  </BookiAccessProvider>
</BookiLocaleProvider>
```

`cursor.setEnabled(false)` turns the pointer off (benchmarks, batch jobs);
it follows `prefers-reduced-motion` on its own.

### Your own components

Screens the product already has stay. You don't wrap components: give a control
a primitive (`definePrimitive` and `createChange` from `@booki/react`: named
actions, `controlled` state, `data-agent-confirm` on irreversible buttons), then
create its parts with `createParts`, with your own tags and names. The same
primitive renders in React, Vue, Svelte, Solid and Web Components. A Booki
control under your own names: `createParts` with its definition from
`@booki/primitives`.

Bridge verbs: `snapshot`, `act`, `query`, `subscribe`, `registerTools`.
Prefer domain actions (`setMinor`, `setTaxCode`, `setAccount`, `setKontonummer`,
`setOrganizationNumber`, `setIban`, `setDate`, `setPeriod`, `assertBalance`)
over raw `setValue` strings.

Amounts are integer minor units both ways: the AmountField snapshot's `value` /
`minor` is what `setMinor` takes (12500 = 125.00). There is no agent `setValue`
on AmountField; `setMinor` rejects decimals, text like "125.00", and amounts
outside `minMinor` (default 0) / `maxMinor`.

Propose → allow → commit (amounts stage on key `"minor"`, which calls
`setMinor` and lets `revert` restore the previous amount):

```ts
const staged = await proposeChanges(agent, [
  { ref: "Amount excl. tax", key: "minor", value: 312500 },
])
```

`createBookiHistory` records Booki's keys (`minor`, `lines`, `digits` plus the
bridge's defaults), so `history.undoSource("agent")` restores amounts in minor units.
With a history of your own, pass `keys: BOOKI_HISTORY_KEYS`. Secret fields
(bank, IBAN, KID) can't be restored and are reported back.

## 4. Primitives to wire

Use only what the screen needs. Prefer `definePrimitive` entries:

| Component | Package entry | Agent notes |
| --- | --- | --- |
| AmountField | `@booki/react` | `setMinor` — integer minor units; `minMinor` / `maxMinor` |
| VoucherComposer | `@booki/react` | line edits with VAT code, department and project per line; `assertPostable` names what blocks posting; closed lists via `accounts`, `taxCodes`, `departments`, `projects` |
| BankReconciliation | `@booki/react` | agent suggests matches (`suggestMatch`), a person approves; sides must sum equal |
| ApprovalChain | `@booki/react` | agent reads status and who may decide (`assertApproved`); approve/reject/escalate are a person's, checked against limits and levels |
| PeriodLock | `@booki/react` | agent asks `assertPostingAllowed(date)`; a person closes and locks |
| CloseChecklist | `@booki/react` | agent does tasks in order (`completeTask`); a second person signs off |
| InvoiceEditor | `@booki/react` | agent drafts lines, totals are computed; a person finalizes; corrections by credit note |
| PaymentBatch | `@booki/react` | agent sees payments without account numbers and removes duplicates; two people approve, a person releases |
| SupplierInvoiceInbox | `@booki/react` | agent corrects extracted fields and proposes coding; a person approves; duplicates are named |
| EvidenceList | `@booki/react` | agent links and classifies attachments; the entry knows what evidence is missing |
| ExpenseClaim | `@booki/react` | expenses, mileage and per diem against a policy; exceptions need a second person |
| LedgerTable | `@booki/react` | trial balance → account → voucher → attached document; read-only; agent can `showVoucher`, `back`, `explainVariance` |
| AgedBalances | `@booki/react` | receivables or payables by age; agent asks `overdue(minDays)` |
| VatReturn | `@booki/react` | computed from a schema you supply; agent checks, a person submits |
| AuditWorkpaper | `@booki/react` | materiality, seeded sample, tick marks; people conclude and sign |
| AuditFindings | `@booki/react` | findings with basis and evidence; agent drafts and cites, a person confirms or withdraws; confidential text stays unread |
| ClientRequests | `@booki/react` | requests to the client; agent drafts and records answers, a person sends, reminds and judges; email stays out of the snapshot |
| FixedAssetRegister | `@booki/react` | schedules and a proposed depreciation run; a person confirms |
| DataTable | `@booki/react` | any list: sort, search, filter, pages, columns, selection, totals, CSV; agent reads the page and counts |
| KpiStat, TrendChart, BarChart, AgingChart, CashflowWaterfall | `@booki/react` | dashboard figures and charts; the agent reads numbers, periods and buckets from the snapshot, never pixels; `drill` to pick a period, bar, bucket or step |
| BankAccountInput | `@booki/react` | secret; NO kontonummer / US ABA |
| PaymentReferenceInput | `@booki/react` | secret KID when NO |
| OrganizationNumberInput | `@booki/react` | orgnr mod11 / EIN |
| IbanInput | `@booki/react` | secret; checksum; NO → kontonummer |
| FinancialDateField | `@booki/react` | invoice / due / posting ISO dates |
| AccountingPeriodSelect | `@booki/react` | closed year / month / VAT term |
| InvoiceNumberInput | `@booki/react` | document / invoice number |
| AttestationStatus | `@booki/react` | `setStatus`; approve/reject via confirm press |
| TaxCodeSelect | `@booki/react` | closed `items` |
| AccountPicker | `@booki/react` | closed chart `items` |
| CurrencySelect | `@booki/react` | closed NOK/USD |

Display / human-gated (not domain act targets): `MoneyAmount`, `VoucherLines`,
`AuditTrail`, `ApprovalGate`, `PaymentConfirm`, `ScaPrompt`, `ExceptionBanner`,
`CountryToggle`.

## 5. Money + audit rules

- Canonical amounts: `{ minor: number, currency }` from `@booki/core` — never floats
- Prefer `buildBalancedSalesVoucher` from `@booki/core` for auto-compose
- Posting / attestation paths append audit events; use `actor: agent:…` when
  `subscribe` reports `source === "agent"`
- Irreversible money moves: `data-agent-confirm` + gate in `allow`
- Bank / KID: `data-agent-secret` (snapshots show `[redacted]`)
- Approvals, sign-offs, finalizing and releasing are never agent actions. Pass
  `actor` (the signed-in person's id) so decisions are recorded as theirs
- Check `PeriodLock.assertPostingAllowed(date)` before booking into a period
- Wrap the app in `BookiAccessProvider` with the signed-in actor and roles; the
  controls then refuse a button the role does not allow. The server must still check:
  see section 6
- Countries beyond NO/US/SE/DK/GB/DE: `defineProfile` + the provider's `profiles` prop

## 6. The same rules on the server

The controls are for speed and clarity; the API is the gate. Run every write
through `@booki/core/server` with the caller your sign-in established. Give the
agent its own credential so the server sees `kind: "agent"`.

```ts
import { guardPostVoucher, toHttp } from "@booki/core/server"

export async function POST(request: Request) {
  const actor = await session(request) // { id, kind: "person" | "agent", roles }
  const { lines, date } = await request.json()
  const verdict = guardPostVoucher({ actor, entity, locale: "nb" }, { lines, date, rules: { periods, accounts } })
  if (verdict.ok) await books.post(lines, date, verdict.actor) // "agent:bookkeeper" or the person's id
  const { status, body } = toHttp(verdict) // 401, 403, 409 or 422 with the control's own sentence
  return Response.json(body, { status })
}
```

Guards: `guardPostVoucher`, `guardDecideApproval`, `guardApproved`,
`guardReleasePayments`, `guardClosePeriod`, `guardFinalizeInvoice`,
`guardSubmitVatReturn`, and `guard(context, permission, rule)` for your own
actions. `PERSON_ONLY` decisions (approve, sign off, finalize, release, close,
submit) are refused for an agent even when its roles allow them.

## 7. Implementation checklist

1. Detect the stack (Vite/Next, package manager, existing providers, auth).
2. Add the packages; import `@booki/styles` once at the root if using the default look
   (map `--bk-*` tokens to the product's own).
3. Root: `BookiLocaleProvider`, `BookiAccessProvider` with the signed-in person,
   `AgentPresence` and `AgentCursor`.
4. One bridge in `src/agent.ts`: `createBookiAgent` + `cursor.wrap(allow)`,
   `attachAudit`, `createBookiHistory`, `registerTools`.
5. Replace ad-hoc amount, bank, KID, date, account and voucher inputs with Booki
   controls; lists with `DataTable`; dashboard figures with the chart controls.
   For the rest, define primitives and create their parts.
6. Mark posts, payments and SCA with `data-agent-confirm`; approving, signing off,
   finalizing and releasing stay a person's buttons. Guard the same writes in the API
   with `@booki/core/server`.
7. Own posting state in one place (no two writers).
8. Prove it in the running app: `window.agent.snapshot()` lists the screen's
   controls with named actions; one `agent.act` sets an amount and the cursor
   shows it; a marked step waits for a person; the audit log has `agent:bookkeeper`.

## Out of scope

ERP adapters, live BankID/WebAuthn, PCI card inputs — apps own those.

## References

- Agent Contract (the open spec Booki implements): https://raw.githubusercontent.com/Walgermo/booki/main/spec/agent-contract.md
- Catalog: https://raw.githubusercontent.com/Walgermo/booki/main/packages/react/docs/llms.txt
