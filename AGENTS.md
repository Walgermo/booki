# Booki — agent notes

## Product concept

**Booki** (Accounting UI-SDK) is an **agent-first** design system for **accounting and auditing**:

- Distribution = **npm packages** (`@booki-aui/core`, `@booki-aui/react`, `@booki-aui/styles`)
- Behavior = **UI SDK** primitives/behaviors (`@ui-sdk/core` / `@ui-sdk/react` `0.1.0-beta.18`)
- Scope = **global** with **country profiles** (Norway `NO`, United States `US`)
- Domain = money, vouchers, bank/payment refs, attestation, audit trail

Agents should prefer operating controls via the UI SDK agent bridge over DOM clicking.

## UI SDK (always follow latest docs)

Canonical docs: https://ui-sdk.dev/docs

Before using ui-sdk locally:

1. Follow the ui-sdk skill if installed (`npx skills@latest add vercel-labs/ui --skill ui-sdk`).
2. Read `node_modules/@ui-sdk/react/docs/llms.txt`.
3. Prefer `createBookiAgent` / `attachAudit` from `@booki-aui/react` (wraps `createAgent`).
4. Bridge: `snapshot`, `act`, `query`, `subscribe`, `registerTools` — see https://ui-sdk.dev/docs/agents/connect-an-agent/reference
5. Domain primitives via `definePrimitive`: `AmountField`, `VoucherComposer`, `BankAccountInput`, `PaymentReferenceInput`, `TaxCodeSelect`, `AccountPicker`, `CurrencySelect`, `OrganizationNumberInput`, `IbanInput`, `FinancialDateField`, `AccountingPeriodSelect`, `InvoiceNumberInput`, `AttestationStatus`, `BankReconciliation`, `ApprovalChain`, `PeriodLock`, `CloseChecklist`, `InvoiceEditor`, `PaymentBatch`, `SupplierInvoiceInbox`, `EvidenceList`, `ExpenseClaim`, `LedgerTable`, `AgedBalances`, `VatReturn`, `AuditWorkpaper`, `FixedAssetRegister`, `ChartOfAccounts`, and for sales `DealPipeline`, `ActivityTimeline`, `FunnelChart`, `ForecastChart`, `RecurringRevenue`, `StageDurationChart`. Prefer `proposeChanges` / `createBookiHistory` for propose → allow → commit.
6. Mark irreversible steps with `data-agent-confirm`; gate them in `allow`. Bank/KID/IBAN are secret. Attestation approve/reject/escalate need a person.
7. Booki skill: `skills/booki/SKILL.md` (`npx skills add Walgermo/booki --skill booki`). Catalog: `packages/react/docs/llms.txt`.

Requires React 19+ for `@booki-aui/react`. Every control is defined once in `packages/primitives` (framework-free); `@booki-aui/web`, `@booki-aui/vue`, `@booki-aui/svelte` and `@booki-aui/solid` are generated from it with `node packages/web/scripts/generate.mjs` and `node scripts/generate-frameworks.mjs`. Change a control in primitives, then regenerate.

## Install

```bash
pnpm add @booki-aui/core @booki-aui/react @booki-aui/styles @ui-sdk/core@0.1.0-beta.18 @ui-sdk/react@0.1.0-beta.18
```

The `@ui-sdk` packages are pinned exactly, so add them in the same command as Booki (see the
README's release-age note). Do not change those pins by hand.

```tsx
import { BookiLocaleProvider } from "@booki-aui/react"
import "@booki-aui/styles"

<BookiLocaleProvider defaultCountry="NO">{children}</BookiLocaleProvider>
```

## Country / locale

`useBookiLocale()` / `useBookiLocaleOptional()` expose `country`, `profile`, `setCountry`.

| Concern | NO | US |
| --- | --- | --- |
| Currency | NOK | USD |
| Bank | Kontonummer (mod11) | ABA routing + account |
| Org id | Organisasjonsnummer (mod11) | EIN |
| Period | Year / month / MVA-termin | Year / month |
| Payment ref | KID | Memo / invoice # |
| SCA | BankID mock | Passkey mock |

Starter profiles also exist for `SE`, `DK`, `GB` and `DE` (English labels, IBAN, standard VAT rates). Any other country: `defineProfile` and the provider's `profiles` prop. Roles and the working entity come from `BookiAccessProvider`.

## Design

The look is "Paper and Ink" in `DESIGN.md`: paper for people, ink for machine output, and lime signal only for what an agent did. Use `--bk-*` tokens only; never a literal colour. The Night (dark) theme is `data-bk-theme="dark"` on a wrapper.

## Source layout

- `packages/core` — Money, locale, validators, voucher helpers
- `packages/react` — Unstyled agent-ready React primitives
- `packages/styles` — Optional default look (CSS variables + `data-slot`)
- `packages/icons` — Duotone icons (SVG, markup strings, React `<Icon />`). Style in `icons.yaml`; draw with the draw-icons skill, add each new icon to `packages/icons/categories.json`, then `pnpm icons`.
- `apps/www` — Docs + live demos

ERP adapters are out of scope — apps integrate ERPs themselves.

## Accounting UX rules

- Amounts: integer minor units via `Money` / `AmountField` (tabular nums, format on blur; agent `setMinor`)
- Every posting/attestation path should append an **audit** event (include `actor: agent:…` when the bridge drove the change; prefer `attachAudit` / `subscribe` with `source === "agent"`)
- Voucher lines must show debit/credit balance (`VoucherComposer` for agent edits; `VoucherLines` read-only)
- Payments / posts that need a person: `data-agent-confirm` + `createBookiAgent({ allow })`
- Approving, signing off, finalizing and releasing are a person's buttons and never in `agent.actions`. On the server, `@booki-aui/core/server` refuses them for `kind: "agent"` (`PERSON_ONLY`); every write route goes through a guard Pass `actor` so the decision is recorded as that person's
- A person's click passes its DOM event into `change(key, value, { reason, event })`, so ui-sdk reports the real source
- Never name a state key `error` for a message to the person: ui-sdk reads it as a failed action. Use `refusal`
- `data-agent-secret` on any part marks the component as private. Keep secrets out of `controlled`; the bridge can expose presentation state such as `open` or `visible`. Mark a plain element when it alone displays a secret
- A component whose inputs are all `disabled` offers an agent no actions: use `aria-readonly` for a closed row
- A slot name is lowercased by `mount`, so name slots in one word (`prepare`, not `signPreparer`)
- One stylesheet per control in `packages/styles/src/controls/`; the build concatenates them
- The public contract (agent actions, options, parts, `data-slot` names) only grows: `packages/react/src/contract.test.tsx` fails when one is removed or renamed. After an intended addition: `UPDATE_CONTRACT=1 pnpm --filter @booki-aui/react test`
- Lists of records use `DataTable` (or `@booki-aui/core/table` for the logic) rather than a table of their own, so sort, search, pages, columns, totals and CSV behave the same everywhere
- Test new primitives with `mount` from `@ui-sdk/core/testing` as well as through the agent bridge
- Agent ergonomics (`spec/agent-contract.md` §12, `docs/agent-ergonomics.md`): an object argument refuses unknown fields and lists the valid ones; every refusal of an unknown id lists what exists and comes from the catalogue (`messages-en.ts` / `messages-nb.ts`), not a literal; a value that could mean two things says its unit; an object-taking action has a `…Format` hint in `controlled`. `packages/react/src/ergonomics.test.tsx` needs a probe for every new agent action
- Every package change carries a changeset (`pnpm changeset`): patch for a fix or an addition, minor for a breaking change while Booki is 0.x. The UI packages release together at one version. `RELEASING.md` has the rules; never edit a version or a CHANGELOG by hand.
