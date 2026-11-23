# Agent ergonomics audit

Real-model runs through Vercel AI Gateway showed that small API details decide
how many calls a task takes and how cheap a model can do it. Four rules came
out of those runs. They are now requirements in
[`spec/agent-contract.md`](../spec/agent-contract.md) section 12, and
[`packages/react/src/ergonomics.test.tsx`](../packages/react/src/ergonomics.test.tsx)
checks them for every control.

1. **Plain field names and units for object arguments.** An action that takes
   an object accepts the names people use, in the units people use, converts
   them, and refuses a field it does not know. Money stays in minor units.
2. **Refusals name what exists.** An unknown field, column, account, code, row
   or option is refused with a sentence listing the valid ones, in English and
   Norwegian.
3. **No ambiguous meaning.** Where a value could mean two things, the snapshot
   says which, and checks refuse the contradiction.
4. **The format is visible before the first try.** An action that takes
   structured input has a short format hint in the snapshot.

## How the test works

For every control exported from `@booki/react`, and every action in its
`agent.actions`, the test has a probe: a call with an unknown argument and the
names its refusal must contain, an object probe (an unknown field must be
refused, listing the fields, and the control must carry a format hint), or a
reason the action takes nothing that can be unknown (`clear`, `assert…`, free
text). A new control or action without a probe fails the test, the way a
removed action fails the contract test. Each refusal must also come back in
Norwegian from `localize`, keeping the ids it names. A walk over each snapshot
fails on a number whose name says money but not its unit.

## Findings

Before this audit, most refusals that listed valid choices were literal English
strings in `@booki/primitives`, so a Norwegian person (or an agent working in
Norwegian) got English. They now come from the message catalogue
(`packages/core/src/messages-en.ts` / `messages-nb.ts`). The English wording of
existing refusals is unchanged unless the row says otherwise.

| Control | Rule | Gap | Fix |
| --- | --- | --- | --- |
| `account-picker` | 2 | Unknown account refused in English only. | `select.unknown-account`, English and Norwegian, listing the accounts. |
| `accounting-period` | 2, 3 | Refusal in English only, listing labels ("October 2026") but not the codes `setPeriod` takes. | `select.unknown-period` lists `2026-10 (October 2026)`: code and label. |
| `aged-balances` | 4, 2 | No hint that pages are 1-based or what `setSort` takes; a bad sort direction was accepted. | `queryFormat` in the snapshot; `setSort` refuses a direction other than `asc`/`desc` (`table.bad-direction`). |
| `aging-chart` | 2 | Unknown bucket refused in English only. | `aging.no-bucket` from the catalogue (same sentence). |
| `amount-field` | 2, 3 | Refusals in English only; the snapshot's `value` and `minor` did not say which currency's minor unit. | `amount.not-minor`, `amount.below-min`, `amount.above-max`; `currency` added to the snapshot. |
| `approval-chain` | – | No gap: `assertApproved` takes nothing; decisions are a person's. | – |
| `attestation-status` | 2 | Refusal in English only, listing translated labels rather than the values. | `select.unknown-attestation` lists `pending, approved, rejected, escalated`. |
| `audit-workpaper` | 1, 2, 4 | `drawSample` ignored unknown options (`{ sampleSize: 25 }` drew the default size); unknown method refused only deep in core; no format hint. | Unknown option keys refused listing `seed, size, tolerableMinor`; unknown method refused listing the methods (`audit.sample-shape`); `sampleFormat` in the snapshot. |
| `bank-account` | – | No gap: digits in, `isValid` out; nothing to be unknown. | – |
| `bank-reconciliation` | 2, 3, 4 | Unknown match id refused in English only; which argument is the bank line and which the open post was not visible. | `reconciliation.no-match`; `matchFormat` says bank line ids first, then open posts. |
| `bar-chart` | 2 | Unknown or folded category and a bad limit refused in English only. | `chart.no-category`, `chart.category-folded`, `chart.other-folds`, `chart.bad-limit`. |
| `cashflow-waterfall` | 2 | Unknown step refused in English only. | `chart.no-step`, `chart.balance-not-step`. |
| `close-checklist` | – | No gap: core's `close.no-task` already lists the tasks in both languages. | – |
| `currency-select` | 2 | Unknown currency refused in English only. | `select.unknown-currency`. |
| `data-table` | 2, 3, 4 | `selectRows` refused an unknown row without naming any; a bad sort direction was accepted; a money column's unit depended on the app's column name; no hint that pages are 1-based. | `table.unknown-row-listed` names the rows on the page; `setSort` checks the direction; money columns carry `unit: "minor"`; `queryFormat` in the snapshot. |
| `evidence-list` | 2 | Unknown or already linked file refused in English only. | `attachment.no-file`, `attachment.already-linked`. |
| `expense-claim` | 1, 2, 4 | Unknown line fields were stored silently (`amount: 450` saved an extra key and then failed on `amountMinor`); distance only in metres; no format hint. | `expenseLineFields` in core refuses unknown fields listing the ones a line takes and accepts `distanceKm: 12.5`; `lineFormat` in the snapshot. |
| `financial-date` | 2 | Invalid date and `setDaysFromToday` on a non-due date refused in English only; a non-number day count gave "Could not compute due date". | `date.invalid`, `date.days-only-due` (names the field's kind and `setDate`), `date.days-not-a-number`. |
| `fixed-asset-register` | 2 | Unknown asset refused in English only. | `assets.no-asset`. |
| `iban-input` | – | No gap: validity in `isValid`. | – |
| `invoice-editor` | 2, 3 | `removeLine` refused without listing lines; `setLine`'s list was English only; the hint did not say the unit price is before VAT. | `invoice.no-line` lists the lines in both languages; `lineFormat` says "price ex VAT". Object form and unknown-field refusal were already there (`invoiceLineFields`). |
| `invoice-number` | – | No gap: free text. | – |
| `kpi-stat` | – | No gap: read-only, figures named `…Minor`, `…Pct`. | – |
| `ledger-table` | 2, 4 | Unknown voucher refused in English only; no `queryFormat`; bad sort direction accepted. | `ledger.no-voucher`; `queryFormat`; direction checked. |
| `organization-number` | – | No gap: digits in, `isValid` out. | – |
| `payment-batch` | 2, 4 | Unknown payment refused in English only; no `queryFormat`; bad sort direction accepted. | `batch.no-payment`; `queryFormat`; direction checked. |
| `payment-reference` | 2 | `generateKid` on a memo reference and a failed KID refused in English only. | `reference.kid-only` (names the kind and `setReference`), `reference.kid-failed`. |
| `period-lock` | – | No gap: core refuses a bad date in both languages. | – |
| `supplier-invoice-inbox` | 2, 4 | Unknown invoice refused in English only; which positional argument is which in `proposeCoding` / `correctField` was not visible; no `queryFormat`. | `supplier-invoice.no-invoice`; `codingFormat` and `queryFormat` in the snapshot. |
| `tax-code-select` | 2 | Unknown code refused in English only. | `select.unknown-tax-code`. A code's effect on gross and net belongs to the voucher, where `postings` shows it. |
| `trend-chart` | 2 | Bad range, bad month and a month outside the range refused in English only. | `chart.bad-range`, `chart.month-format`, `chart.month-outside-in-data`, `chart.month-outside-data`. |
| `vat-return` | 2, 3 | Unknown box refused in English only; `unmappedTotal` is a count named like an amount. | `vat.no-box` and `vat.box-is-total` from the catalogue; `unmappedCount` added beside `unmappedTotal`. |
| `voucher-composer` | 1, 2, 4 | `addLine` took positional arguments only and its extras object ignored unknown keys (`{ vat: "1" }` posted with no VAT code); `removeLine` refused without listing lines; refusals in English only; no format hint. | `addLine({ account, debitMinor, vatCode })` accepted; unknown fields refused listing the valid ones; `voucher.no-line` lists line ids in both languages; `lineFormat` in the snapshot. Gross/net was already clear through `postings` and `voucher.vat-twice`. |
| `voucher-composer` (`setForeign`) | 1, 2, 3, 4 | Found in a trial run on the foreign-currency task (23 November 2026): no hint for `setForeign`, so the argument order and the rate's unit had to be guessed; a wrong value was refused with "got NaN", which names neither the argument nor its unit; an object argument was not accepted. Five failed calls before one went through. | `foreignFormat` in the snapshot; the values as arguments or as `{ currency, amountMinor, rateScaled }`, unknown fields refused with the list; one refusal per value (`voucher.foreign-currency`, `-amount`, `-rate`) that says which value is wrong, its unit, and the whole call, in both languages. |

## Left as they are

- Person-only paths (`commitDraft`, `finalize`, `approve`, sign-offs) still
  throw some English literals. They are not agent actions and a person sees
  the refusal next to the button; moving them into the catalogue is a separate
  piece of work.
- `view.total` in list controls is a row count named like an amount. It sits
  beside `matching`, `page` and `pageCount`, and the test treats those names
  as counts.
- `AmountField.value` stays for compatibility; `minor` says the unit, and the
  test checks the two are equal.
