# The Agent Contract for Accounting UIs

Version 0.1 · Draft with one implementation · 21 November 2026 · MIT licence

A shared contract between accounting and auditing software and the AI agents
that work in it. It says what a screen must give an agent, what an agent may
never do there, and how every step is recorded, so an agent can be let into
the books without anyone reading a pixel or guessing which field is which.

This is a draft. It has one implementation so far (Booki), so it is not yet a
standard: sections may change, and a name only becomes stable once a second
implementation has used it. The contract itself is independent of any library,
framework or model: any ERP can implement it. A conformance suite and a small
reference implementation without Booki or ui-sdk are in packages/readiness (see
section 10).

The keywords MUST, MUST NOT, SHOULD and MAY are used as in RFC 2119.

## 1. Why a contract

Agents already work in accounting software by reading the screen and clicking.
That costs more than it needs to (measured in this repository with real models:
1.8 to 11 times the cost per task and up to 19 times the time against
agent-first screens), takes a strong model to get right (the two cheapest models
were right 19 of 20 times on agent-first screens, 23 and 18 of 30 on ordinary
ones), lets the agent guess
between unnamed fields, and records the agent's work as the person's. Accounting cannot accept the last two. The contract removes all
three.

## 2. Terms

- **Control**: a part of a screen with a name, a state and actions: an amount
  field, a voucher, an approval chain, a ledger.
- **Agent**: software acting through the controls, with its own identity.
- **Person**: a signed-in human with roles.
- **Bridge**: what gives an agent the controls on a screen. It MUST offer at
  least `snapshot` (read), `act` (do named steps) and `subscribe` (follow
  changes). `query` (ask a control) is RECOMMENDED.
- **Refusal**: a control or server saying no, with a sentence.

## 3. Reading

1. Every control an agent may use MUST appear in the snapshot with a name
   (`label`), a component type, its declared state and its action names.
2. State MUST be values, not presentation: amounts as integer minor units with
   a currency, dates as `YYYY-MM-DD`, periods as codes (`2026-10`, `2026-T5`),
   accounts and tax codes as their codes.
3. A control showing a figure (a KPI, a chart, a ledger) MUST expose the
   figures themselves, so an agent never reads a chart from pixels or tooltips.
4. A list MUST say how many rows exist and match, and which page is shown.
   Totals MUST be over every match, not the page.
5. Secrets MUST be redacted in the snapshot (`[redacted]`): bank account
   numbers, IBANs, payment references such as KID, card data and one-time codes.
   An agent MAY set a secret; it MUST NOT read one back.

## 4. Acting

1. An agent MUST act through named actions with typed arguments
   (`setMinor(155000)`, `setAccount("6800")`, `addLine(...)`), never by typing
   into or clicking unnamed elements.
2. Amounts MUST be integer minor units in and out. A decimal, a formatted
   string or an amount outside the control's limits MUST be refused.
3. Closed lists (accounts, tax codes, currencies, periods, departments,
   projects) MUST be enforced. A refusal MUST name valid choices.
4. The accounting rules MUST run inside the action: a voucher that does not
   balance, a date in a closed period or an approval out of order is refused
   by the control, whatever the agent sends.
5. A refusal MUST be one sentence a person and an agent can act on, in the
   person's language. It MUST NOT be reported as a crash. A message meant for
   the person MUST NOT use a state key a bridge reads as a failed action.
6. A checking action (`assertPostable`, `assertPostingAllowed`,
   `assertReleasable`) SHOULD exist wherever a later step can fail, so an agent
   learns what blocks it before trying.

## 5. What stays with a person

1. These decisions MUST NOT be agent actions, and a server MUST refuse them
   from an agent caller whatever its roles:

   | Permission | Decision |
   | --- | --- |
   | `approval.decide` | Approve, reject or escalate a request |
   | `supplier-invoice.approve` | Approve a supplier invoice |
   | `expense.approve` | Approve an expense claim |
   | `payment.approve` | Approve a payment run |
   | `payment.release` | Release payments to the bank |
   | `reconciliation.approve` | Accept a reconciliation |
   | `period.close` | Close or lock a period |
   | `period.adjust-closed` | Post into a closed period |
   | `close.sign-off` | Sign off a close task |
   | `invoice.finalize` | Finalize a sales invoice under a number |
   | `vat.submit` | Submit a VAT return |
   | `asset.dispose` | Dispose of a fixed asset |
   | `audit.sign-off` | Sign off audit work |
   | `audit.review` | Review audit work |
   | `audit.conclude` | Conclude an audit area |
   | `audit.eqcr` | Quality review of an engagement |
   | `audit.freeze` | Freeze an audit file |
   | `finding.confirm` | Confirm an audit finding |
   | `finding.withdraw` | Withdraw a confirmed finding |
   | `request.send` | Send a request to the client |
   | `request.decide` | Accept or reject a client's answer |
   | `deal.close` | Mark a sales deal won or lost, or reopen it |

2. An irreversible step that the company MAY let an agent take under its own
   rules (posting a voucher, paying an invoice under a limit) MUST be marked
   (`data-agent-confirm` with a sentence saying what it does). The bridge MUST
   ask the company's policy before running it, and send it to a person when
   the policy does not allow it.
3. Separation of duties MUST hold for agents and people alike: whoever
   approved a payment run does not release it; whoever posted does not sign
   off the close.

## 6. Recording

1. Every change MUST record who made it. An agent's change MUST be recorded as
   the agent (`agent:<id>`), with the person whose session started it
   (`onBehalfOf`) where there is one, never as that person.
2. A person's click MUST be recorded as the person's, even on a screen where
   an agent is working.
3. Audit events SHOULD carry the rule version the step was checked against.

## 7. The server

1. The rules in sections 4 to 6 MUST run again on the server for every write.
   The screen is for speed and clarity; the server is the gate.
2. The caller MUST come from the server's own sign-in, never from the request
   body. An agent MUST have a credential of its own, so the server knows it is
   an agent.
3. A refusal SHOULD be answered with a status and a stable code:
   401 not signed in, 403 role, person-only decision or separation of duties,
   409 state of the books (closed period, waiting approval), 422 the input
   (unbalanced, unknown account), with the same sentence the control showed.

## 8. Seeing the agent work

1. A screen SHOULD show which controls an agent changed until a person has
   looked at them.
2. A screen SHOULD show the agent working: which control it is on and what it
   does, before the step runs, in the person's language.
3. A suggestion an agent makes SHOULD be keepable or revertible by a person in
   one step.

## 9. Canonical actions

Implementations SHOULD use these names, so one agent works across products.
An implementation MAY add actions; it MUST NOT give these names another
meaning.

| Control | Actions |
| --- | --- |
| `amount-field` | `clear`, `setMinor` |
| `account-picker` | `clear`, `setAccount` |
| `tax-code-select` | `clear`, `setTaxCode` |
| `currency-select` | `clear`, `setCurrency` |
| `financial-date` | `clear`, `setDate`, `setDaysFromToday`, `setValue` |
| `accounting-period` | `clear`, `setPeriod` |
| `invoice-number` | `clear`, `setInvoiceNumber`, `setValue` |
| `organization-number` | `clear`, `setDigits`, `setOrganizationNumber` |
| `bank-account` | `clear`, `setAccount`, `setKontonummer`, `setRouting` |
| `iban-input` | `clear`, `setIban` |
| `payment-reference` | `clear`, `generateKid`, `setReference`, `setValue` |
| `voucher-composer` | `addLine`, `assertBalance`, `assertPostable`, `clear`, `removeLine`, `setAccount`, `setCredit`, `setDebit`, `setDepartment`, `setDimension`, `setForeign`, `setLines`, `setProject`, `setVatCode` |
| `attestation-status` | `setStatus` |
| `approval-chain` | `assertApproved` |
| `period-lock` | `assertPostingAllowed` |
| `close-checklist` | `assertReadyToClose`, `completeTask` |
| `bank-reconciliation` | `assertReconciled`, `setMatches`, `suggestMatch`, `withdrawMatch` |
| `supplier-invoice-inbox` | `approveUnderRule`, `assertApprovable`, `confirmField`, `correctField`, `proposeCoding`, `proposeRejection` |
| `invoice-editor` | `addLine`, `assertFinalizable`, `removeLine`, `setCustomerTaxId`, `setInvoice`, `setLine` |
| `payment-batch` | `assertReleasable`, `removePayment` |
| `expense-claim` | `addLine`, `assertSubmittable`, `removeLine`, `setLine` |
| `evidence-list` | `assertEvidenced`, `linkAttachment`, `setKind` |
| `vat-return` | `assertReady`, `back`, `openBox` |
| `fixed-asset-register` | `assertRunnable`, `back`, `openAsset`, `proposeRun`, `setPeriod` |
| `chart-of-accounts` | `filterClass`, `find`, `mapStandard`, `propose`, `setProposal`, `setVatCode` |
| `audit-workpaper` | `assertReadyForSignOff`, `drawSample`, `setEvidence`, `setNote`, `setResult`, `setTickMark` |
| `ledger-table` | `back`, `explainVariance`, `openAccount`, `setRange`, `showVoucher` |
| `aged-balances` | `back`, `openParty`, `overdue`, `setAsOf` |
| `data-table` | `clearFilters`, `clearSelection`, `clearSort`, `hideColumns`, `selectRows`, `setFilter`, `setPage`, `setPageSize`, `setSearch`, `setSort`, `showColumns` |
| `trend-chart` | `drill`, `setRange` |
| `bar-chart` | `drill`, `setLimit` |
| `aging-chart` | `drill` |
| `cashflow-waterfall` | `drill` |
| `kpi-stat` | none: read-only |

The permissions in section 5 and `voucher.post`, `evidence.remove`,
`vat.prepare`, `asset.run-depreciation` and `audit.prepare` are the canonical
permission names.

## 10. Conformance

An implementation conforms when, for every control it ships:

1. its actions, options, parts and names only grow between versions (Booki
   checks this with a contract test against a recorded baseline);
2. a test drives it through the bridge and through a person's input, and both
   reach the same state;
3. every person-only decision in section 5 is refused for an agent on the
   screen and on the server;
4. its refusals exist in each language it ships;
5. its agent actions meet the ergonomics rules in section 12.

A conformance suite for the bridge-level conditions (sections 2 to 7) ships as
`@booki-aui/readiness/conformance`; `runConformance` takes a bridge (snapshot, act,
subscribe) and optional probes, and reports each check as pass, fail or skip
with the section it enforces. `@booki-aui/readiness/reference` is a small
implementation of the contract without Booki or ui-sdk that the suite passes.
The suite does not yet cover per-language refusals (10.4) or the ergonomics
rules (12) beyond naming valid choices; passing it is necessary, not
sufficient.

A product MAY claim "Agent Contract 0.1 (draft)" for the screens that conform,
and SHOULD list them.

## 11. Changing the contract

Proposals go as issues or pull requests to this file. A new version only
adds; a name, once published, keeps its meaning.

## 12. Ergonomics

Measured with real models: each rule below, when broken, cost an agent extra
calls or a wrong result. They hold for every agent action of every control.

1. **Plain names and units.** An action that takes an object MUST accept the
   field names people use for it and SHOULD accept the units people use,
   converting them (`quantity: 12.5`, `taxRate: 25`, `distanceKm: 12.5`).
   Money MUST stay in integer minor units, as section 4.2 requires. A field
   the action does not know MUST be refused, never ignored or stored.
2. **Refusals name what exists.** An unknown field, column, account, code,
   row or option MUST be refused with one sentence that lists the valid ones
   (or a sample of them, when there are many), in each language the
   implementation ships (section 10.4). The sentence MUST keep the ids it
   lists as they are in every language.
3. **One meaning per value.** Where a value could mean two things (gross or
   net, minor units or whole units, a page counted from 0 or 1, what a VAT
   code does to an amount), the snapshot MUST say which: by the key's name
   (`amountMinor`, `taxRateBp`), a unit beside it (`unit: "minor"`,
   `currency`), or the derived result (`postings`). A check MUST refuse the
   contradiction, such as VAT entered both inside a gross amount and on its
   own line. A key whose name is ambiguous SHOULD get a twin whose name is
   not (`unmappedCount` beside `unmappedTotal`), and keep the old key.
4. **Format before the first try.** An action that takes an object or a list
   of ids MUST have a format hint in the snapshot: one example call, under
   about 40 tokens, in a key ending in `Format` (`lineFormat`, `queryFormat`).
   An action that takes a formatted string (a date, a period) SHOULD name the
   format in its refusal.
5. A conforming implementation SHOULD test these rules generically: drive
   every agent action with an unknown argument and check the refusal, and
   fail when an action has no such check (Booki:
   `packages/react/src/ergonomics.test.tsx`).
