---
name: booki
description: >-
  Installs and wires Booki (@booki/core, @booki/react, @booki/styles) into a
  React 19 (supported), or Vue, Svelte, Solid or Web Components (experimental) app — BookiLocaleProvider,
  agent-ready accounting primitives, and createBookiAgent. Use when adding Booki, agent-first accounting controls, AmountField,
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

The skills CLI rewrites its lock file. Look at the diff afterwards and keep only
Booki's entry: it can change the entries of skills you already had.

Into an existing Next.js and shadcn/ui product, also read
https://raw.githubusercontent.com/Walgermo/booki/main/docs/drop-in.md

## Goal

Fully implement Booki in the user's app: packages, locale provider, styles,
domain primitives the product needs, and an agent bridge with human gates for
money movement.

## Support

Supported: React 19 (`@booki/react`, with `@booki/core`, `@booki/primitives` and
`@booki/styles`) with the Norway (NO) and United States (US) country profiles.

Experimental: Vue, Svelte, Solid and Web Components (`@booki/vue`, `@booki/svelte`,
`@booki/solid`, `@booki/web`), and the Sweden (SE), Denmark (DK), United Kingdom (GB)
and Germany (DE) starter profiles. Experimental means the packages work and come from
the same primitives, but they have less testing and their API may change between
releases without notice.

Rule for the agent: when the app is not React, or the country is not NO or US, tell
the person that the setup is experimental before you wire it.

## 1. Install

Booki is not on npm yet, so `pnpm add @booki/react` answers 404. Pack it from a clone
(Node 26, pnpm 11):

```bash
git clone https://github.com/Walgermo/booki.git ../booki && cd ../booki && pnpm install
pnpm pack:local --out <your app>/vendor/booki
```

It prints what to do next, for pnpm (an `overrides` block and a `pnpm add`) and for npm
(one `npm install`). Commit the files in `vendor/booki` if others build the app. Don't
use `link:`: the app then loads a second React, and nobody else can install it.

Once Booki is published, this is the whole step:

```bash
pnpm add @booki/core @booki/react @booki/styles
```

Requires React 19+ for `@booki/react`. Other stacks: `@booki/web` (custom elements; Angular,
server-rendered pages), `@booki/vue`, `@booki/svelte`, `@booki/solid`, all with the same
controls and actions. Add `@ui-sdk/core` and the `@ui-sdk` package for your framework
(`@ui-sdk/react`) as direct dependencies of the app, both at exactly `0.1.0-beta.16`. The
bridge and controls come from them, and the guide imports `Button` from `@ui-sdk/react/button`,
which `@booki/react` does not re-export. Add both together: adding only `@ui-sdk/react` has
made pnpm drop `@ui-sdk/core` from the lockfile.
TypeScript and `import "@booki/styles"`: the package ships its types, so the side-effect
import checks. With Tailwind, import it from CSS instead (section 2).
**A minimum release age.** Booki pins the `@ui-sdk` packages exactly, so an app with a
release-age rule (pnpm `minimumReleaseAge`, Renovate's `minimumReleaseAge`) can refuse a version
that is only days old. Then stop and say so. Either wait until the version is old enough, or ask
the product's owner to approve an exception for exactly those versions, on your branch only, never
on the main branch. Never add an exception yourself.

`pnpm add` rewrites the lockfile, so it can stop on an unrelated package's Node `engines`
entry. That is the app's lockfile, not Booki: fix or report that entry, don't change Node for it.
A way through: install once with `--config.engine-strict=false`, then put the app's own edit of
that `engines` entry back in the lockfile by hand and check that `pnpm install --frozen-lockfile`
passes.

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

With Tailwind 4, import the styles from CSS and put Booki's layer between Tailwind's
reset and its utilities. Without the first line the reset wins, and fields and buttons
come out with no padding or border:

```css
@layer theme, base, booki, components, utilities;
@import "@booki/styles" layer(booki);
@import "tailwindcss";
```

Only a few controls on a page: import `@booki/styles/base.css` and
`@booki/styles/controls/<name>.css` for the ones it uses (`kpi-stat`, `data-table`, …)
instead of the whole sheet (about 9 KB gzipped against 17 KB).

`useBookiLocale()` / `useBookiLocaleOptional()` → `country`, `profile`, `setCountry`.

| Concern | NO | US |
| --- | --- | --- |
| Currency | NOK | USD |
| Bank | Kontonummer (mod11) | ABA routing + account |
| Org id | Organisasjonsnummer (mod11) | EIN |
| Period | Year / month / MVA-termin | Year / month |
| Payment ref | KID | Memo / invoice # |
| SCA | BankID mock | Passkey mock |

## 3. Agent bridge (one per app, in `src/agent.ts` or wherever the app keeps its client-side modules)

The bridge lives in the browser. `"use client"` and the `window` check make the file
safe where pages render on the server (Next.js); in Vite they do nothing.

```tsx
"use client"

import {
  createBookiAgent,
  createAgentCursor,
  attachAudit,
  createBookiHistory,
  registerTools,
  withRecordedAct,
} from "@booki/react"

// The company's rules for marked steps (data-agent-confirm): return true to let
// the agent do it alone, false to refuse, undefined to ask the person.
const policy = (_step: { confirm?: string }): boolean | undefined => undefined

// The bridge is a module, so it can't call a hook. The app's own confirm dialog and the
// signed-in person connect here from a component (below); until then it asks with window.confirm.
let askPerson = async (question: string): Promise<boolean> => window.confirm(question)
let personId = (): string => "person:unknown"
export function connectPerson(ask: typeof askPerson, id: typeof personId) {
  askPerson = ask
  personId = id
}

const allow = async (step: { confirm?: string }) => {
  if (!step.confirm) return true
  const decided = policy(step)
  // `by` goes in the audit row: the rule, or the person who answered.
  if (decided !== undefined) return { allow: decided, by: "rule:posting-1" }
  return { allow: await askPerson(step.confirm), by: personId() }
}

// Your own audit trail: the agent's changes, the steps it was refused, and who confirmed the rest.
// No such endpoint in your product? Keep these events in the browser (a log, the console) and let
// the server record its own writes: section 6's guard names the agent and the person it acted for.
const audit = (event: object) => void fetch("/api/audit", { method: "POST", body: JSON.stringify(event) })

// A visible agent pointer: it goes to each control and presses before the step runs.
export const cursor = createAgentCursor()

export const agent = createBookiAgent({
  agentId: "bookkeeper",
  ruleVersion: "posting-1",
  allow: cursor.wrap(allow),
  audit,
  // Booki's refusals in Norwegian for a Norwegian product (the cursor follows the profile by itself).
  language: "nb",
})

export const history = createBookiHistory(agent)

if (typeof window !== "undefined") {
  attachAudit(agent, audit, { agentId: "bookkeeper", ruleVersion: "posting-1" })
  // Browser agents (WebMCP) get the same tools, cursor and rules. A person's own
  // browser agent acts in their session: turn this on when the server can tell it apart.
  if (process.env.NEXT_PUBLIC_BOOKI_WEBMCP === "on") {
    registerTools(agent, { allow: cursor.wrap(allow), audit, agentId: "browser" })
  }
  // Console and devtools: window.agent.snapshot(). Not in production. Its act records
  // a step the control refuses, as actAndRecord does. window.agent exists before a screen
  // has rendered its controls: take the first snapshot once the screen is on the page, or
  // wait until it lists the control you need.
  if (process.env.NODE_ENV !== "production") {
    Object.assign(window, { agent: withRecordedAct(agent, { audit, agentId: "bookkeeper" }) })
  }
}
```

Connect the app's dialog and the signed-in person once, from a component near the root:

```tsx
function ConnectAgent() {
  const confirm = useConfirmDialog() // the app's own dialog: (question) => Promise<boolean>
  const session = useSession()
  useEffect(() => connectPerson(confirm, () => session.user.id), [confirm, session.user.id])
  return null
}
```

Take the first snapshot after the screen has rendered: `window.agent` exists before a screen
has registered its controls.

(In Vite: `import.meta.env.DEV` and `import.meta.env.VITE_BOOKI_WEBMCP`.)

### Whose write it is

The agent runs in the person's page, so the page decides which credential a write
carries, and it must come from the change itself:

```tsx
<SupplierInvoiceInbox
  invoices={invoices}
  onInvoicesChange={(next, { source }) => save(next, source === "agent" ? "agent" : "person")}
/>
```

Every `on…Change` gets `{ reason, source }`, and a `Button` from `@ui-sdk/react/button`
gives `onClick(event, { source })`. Don't keep an "agent is running" flag: the person can
click while the agent's step waits for its pointer or for `allow`, and their click would
be recorded as the agent's. If the person's click changes the control first, the agent's
waiting step then fails ("disabled now", or a refusal naming the new state): the person's
action wins, and the agent reads the screen again. `save` sends the agent's writes with a token your server
issued for the agent (short-lived, naming the person as `onBehalfOf`); the server never
takes the actor from the body.

### When a step is done

`act` answers when the control has accepted the step, not when your server has. Two things follow:

- A control you keep controlled shows the change once the server has answered. Count the
  writes in flight and wait for them before the agent's next `snapshot`, and give the
  server's refusal back to the model with the result.
- A press that starts something async answers `ok: true` when it has started. Read the
  outcome from the next snapshot.

`examples/ap-flow` does both (`lib/writes.ts`, `lib/script.ts`, `lib/model-agent.ts`):
https://github.com/Walgermo/booki/tree/main/examples/ap-flow

At the app root, once, in a client file of its own (`src/booki-root.tsx`). A server
layout must not import `agent` or `cursor`; it renders this and passes the person:

```tsx
"use client"

import type { ReactNode } from "react"
import { BookiAccessProvider, BookiLocaleProvider, AgentCursor, AgentPresence } from "@booki/react"
import { agent, cursor } from "./agent"

type User = { id: string; name: string; roles: string[] }

export function BookiRoot({ user, children }: { user: User; children: ReactNode }) {
  return (
    <BookiLocaleProvider defaultCountry="NO">
      <BookiAccessProvider actor={user}>
        {children}
        <AgentPresence agent={agent} />   {/* marks what the agent changed; announces it */}
        <AgentCursor cursor={cursor} />    {/* the agent's pointer, ring and narration */}
      </BookiAccessProvider>
    </BookiLocaleProvider>
  )
}
```

```tsx
// app/layout.tsx (Next.js): a Server Component
<body>
  <BookiRoot user={user}>{children}</BookiRoot>
</body>
```

`cursor.setEnabled(false)` turns the pointer off (benchmarks, batch jobs);
it follows `prefers-reduced-motion` on its own.

### Your own components

Screens the product already has stay. You don't wrap components: give a control
a primitive (`definePrimitive` and `createChange` from `@booki/react`: named
actions, `controlled` state, `data-agent-confirm` on irreversible buttons), then
create its parts with `createParts`, with your own tags and names, or keep the control
you have inside a root made with `usePrimitive` and `usePart`. A whole example:
https://raw.githubusercontent.com/Walgermo/booki/main/docs/own-controls.md The same
primitive renders in React (supported), and in Vue, Svelte, Solid and Web Components (experimental). A Booki
control under your own names: `createParts` with its definition from
`@booki/primitives`.

The lowest threshold, for an input or select the product keeps (a shadcn or Base UI
field): `useBookiField` from `@booki/react` gives it Booki's typed agent action and
rules without replacing it. Three kinds: `amount` (`setMinor`, integer minor units),
`code` from a closed list (`setCode`, a refusal names the options) and `date`
(`setDate`, ISO). Your field calls `change(next, event)` for a person's edit and shows
`refusal`. See "The lower threshold: useBookiField" in own-controls.md.

A free-text field (a description, a note) needs no Booki kind: `Input` from
`@ui-sdk/react/input` is already on the bridge, with `setValue`, under its accessible name.

Keep what the person types as text and parse it exactly; `Number()` and `* 100` lose øre.
`parseToMinor` reads "12," as 12,00, so while the text still ends in a separator the person is
not done: change the amount once it doesn't, and on blur. `allowEmpty` lets the field be empty (`minor: null`). A code
field takes an option's value or its label; `allowEmpty` there lets it be cleared.

```tsx
import { formatMoney, parseToMinor } from "@booki/core/money"

function AmountInput(props: { value: number | null; onValueChange?: (minor: number | null) => void }) {
  const show = (minor: number | null) =>
    minor === null ? "" : formatMoney(minor, { currency: "NOK", locale: "nb-NO", withCurrency: false })
  const [draft, setDraft] = useState(() => show(props.value))
  return useBookiField(
    {
      kind: "amount",
      value: props.value,
      allowEmpty: true,
      label: "Beløp",
      onValueChange: (minor, details) => {
        // The agent's amount replaces the text; the person's own typing is left as typed.
        if (details.source === "agent") setDraft(show(minor))
        props.onValueChange?.(minor)
      },
    },
    ({ change, refusal }) => (
      <>
        <Input
          inputMode="decimal"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            // "12," is still being typed: wait for the next digit, or for blur.
            if (/[,.]\s*$/.test(e.target.value)) return
            const minor = parseToMinor(e.target.value, "NOK", { locale: "nb-NO" })
            if (minor !== null || e.target.value.trim() === "") change(minor, e.nativeEvent)
          }}
          onBlur={(e) => {
            const minor = parseToMinor(e.target.value, "NOK", { locale: "nb-NO" })
            if (minor !== null || e.target.value.trim() === "") change(minor, e.nativeEvent)
          }}
        />
        {refusal ? <p>{refusal}</p> : null}
      </>
    ),
  )
}
```

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
| AmountField | `@booki/react` | `setMinor` — integer minor units; `minMinor` / `maxMinor`; `allowEmpty`: empty reads `value: null`, `setMinor(null)` and `clear` empty it |
| VoucherComposer | `@booki/react` | line edits with VAT code, department and project per line; `assertPostable` names what blocks posting; closed lists via `accounts`, `taxCodes`, `departments`, `projects`; a foreign-currency line with `setForeign` (the `foreignFormat` hint gives the order and units) |
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
| PaymentReferenceInput | `@booki/react` | secret KID when NO; a US memo is shown unless `secretReference` |
| OrganizationNumberInput | `@booki/react` | orgnr mod11 / EIN |
| IbanInput | `@booki/react` | secret; checksum; NO → kontonummer |
| FinancialDateField | `@booki/react` | invoice / due / posting ISO dates |
| AccountingPeriodSelect | `@booki/react` | closed year / month / VAT term |
| InvoiceNumberInput | `@booki/react` | document / invoice number |
| AttestationStatus | `@booki/react` | `setStatus`; approve/reject via confirm press |
| TaxCodeSelect | `@booki/react` | closed `items` |
| AccountPicker | `@booki/react` | closed chart; over 30 accounts are not in the snapshot: `query({ within, text })` finds one by number or whole word |
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
- Countries beyond NO/US (supported) and SE/DK/GB/DE (experimental): `defineProfile` + the provider's `profiles` prop

## 6. The same rules on the server

The controls are for speed and clarity; the API is the gate. Run every write
through `@booki/core/server` with the caller your sign-in established. Give the
agent its own credential so the server sees `kind: "agent"`.

```ts
import { guardPostVoucher, toHttp } from "@booki/core/server"

export async function POST(request: Request) {
  const actor = await session(request) // { id, kind: "person" | "agent", roles }
  const { lines, date } = await request.json()
  const verdict = guardPostVoucher(
    { actor, entity, locale: "nb", personOf }, // personOf(id): the person an agent acts for, with their roles now
    { lines, date, rules: { periods, accounts } },
  )
  if (verdict.ok) await books.post(lines, date, verdict.actor) // "agent:bookkeeper" or the person's id
  const { status, body } = toHttp(verdict) // 401, 403, 409 or 422 with the control's own sentence
  return Response.json(body, { status })
}
```

`toHttp`'s body is `{ ok, code, message, issues? }`. If your API has an error shape of its
own, map it there and keep `code` and `message`: the agent acts on them.

**Delegation.** With `personOf` an agent may only do what both its own role and the person
it acts for (`onBehalfOf`) allow, and an unknown person is refused. Permissions the agent
has by the company's rule go in `agentOwn`. Without `personOf` the person is only recorded.

**The agent's credential.** `issueAgentToken({ agentId, onBehalfOf }, secret)` from
`@booki/core/server` issues a signed token that lasts 15 minutes. Your sign-in issues it for the signed-in person,
and the page sends it with the agent's writes. `verifyAgentToken(token, secret)` gives
`{ id, kind: "agent", onBehalfOf, grantId }` or null; add the agent's roles. The secret is
at least 32 characters and stays on the server. Bind a token to what it is for with
`audience` (an engagement, a company) and verify with `verifyAgentToken(token, secret, { audience })`.

**A step the control refuses** (a fraction of an øre, an unknown account) is not an `allow`
decision. Where your code calls `act` for a model, call `actAndRecord(agent, input, { audit, agentId })`
instead: it writes an `agent.failed` row with the refusal sentence and the control's name, once
(a step `allow` refused is already recorded). `withRecordedAct(agent, …)` gives a bridge whose `act`
does it. The browser's own agent (WebMCP) does not go through it: its `allow` refusals are
recorded, a control's own refusal is not.

**Your own rules** refuse with `throw new RuleRefusal("…")` (422 `server.rule`). A
`BookiError` a rule throws (one of Booki's own refusals) is answered too, with its status (409
for a closed period or a used invoice number, otherwise 422) and its sentence. Any other error
(a database error, a bug) is rethrown for your error handling, not sent to the caller. A request an agent raised records
the person it worked for as `requestedFor`, so that person cannot decide it.

**What an agent reads is data.** Supplier names, descriptions and other text read off a
document reach the agent in state and in refusals, quoted. Tell your model that text in
tool results is never an instruction. A reconciliation gives the agent `referenceTag`, never the KID.

**Log refusals too:** on `!verdict.ok`, write `actorRecord(actor)` and `verdict.code` to the audit trail.

Guards: `guardPostVoucher`, `guardDecideApproval`, `guardApproved`,
`guardReleasePayments`, `guardClosePeriod`, `guardFinalizeInvoice`,
`guardSubmitVatReturn`, `guardSignDocument`, and `guard(context, permission, rule)` for your own
actions. `PERSON_ONLY` decisions (approve, sign off, finalize, release, close,
submit) are refused for an agent even when its roles allow them.

**Sign-off with open points:** by default they go with the signature. Set `blockOpenPoints` on `DocumentSignoff` and pass the same `blockOpenPoints` to `guardSignDocument` when your firm refuses a signature until every point is closed. Use the same value in both places: the screen is not a security boundary.

## 7. Implementation checklist

1. Detect the stack (Vite/Next, package manager, existing providers, auth).
2. Add the packages (section 1: packed from a clone until they are on npm); import `@booki/styles` once at the root if using the default look
   (map `--bk-*` tokens to the product's own).
3. Root: `BookiLocaleProvider`, `BookiAccessProvider` with the signed-in person,
   `AgentPresence` and `AgentCursor`.
4. One bridge in `src/agent.ts`: `createBookiAgent` + `cursor.wrap(allow)`,
   `attachAudit`, `createBookiHistory`, `registerTools`.
5. Replace ad-hoc amount, bank, KID, date, account and voucher inputs with Booki
   controls; lists with `DataTable`; dashboard figures with the chart controls.
   An amount, code or date field you keep: `useBookiField`. For the rest, define
   primitives and create their parts.
6. Mark posts, payments and SCA with `data-agent-confirm`; approving, signing off,
   finalizing and releasing stay a person's buttons. Guard the same writes in the API
   with `@booki/core/server`.
7. Own posting state in one place (no two writers).
8. Prove it in the running app: `window.agent.snapshot()` lists the screen's
   controls with named actions; one `agent.act` sets an amount and the cursor
   shows it; a marked step waits for a person; the audit log has `agent:bookkeeper`.
   Then run the readiness audit from the clone against the running screen (it only
   reads): `pnpm --dir ../booki readiness <url of the screen> --timeout 120000` (a dev
   server compiling the page the first time needs the longer timeout). It names fields
   an agent cannot tell apart, irreversible buttons without `data-agent-confirm`, and
   secrets in the snapshot. It never clicks, so a form behind a button is not measured:
   open it with your own Playwright step and call `check(page)` from `@booki/readiness`
   (its README has the example).

## Out of scope

ERP adapters, live BankID/WebAuthn, PCI card inputs — apps own those.

## References

- Agent Contract (the draft spec Booki implements; one implementation so far): https://raw.githubusercontent.com/Walgermo/booki/main/spec/agent-contract.md
- Catalog: https://raw.githubusercontent.com/Walgermo/booki/main/packages/react/docs/llms.txt
