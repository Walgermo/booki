# Hard tasks: where Booki cannot do the task or does not catch it

Factual notes for the hard-task pages. Each entry says what the Booki control does, based on reading the code in `packages/core` and `packages/react` and on the model-free dry run (`pnpm --filter agent-benchmark bench -- --dry-run --task <id>`). No model was called. Where a claim was not exercised by the scripted run, the entry says so.

## Summary

| Task | Trap | Raw page does | Booki page does | Booki can do it |
| --- | --- | --- | --- | --- |
| doc-error | The printed total (12 050,00) does not match the lines and VAT (12 500,00). | Does not catch it. The scripted agent returns the invoice with a reason. | Shows the `totals-mismatch` issue. Nothing stops a post, and the return action is not an agent action. The scripted agent holds the invoice. | partly |
| closed-period | A voucher dated 2026-09-15 falls in a hard-closed period. | Refuses the voucher with a line of text and names no open period. The scripted agent re-dates it to October and posts. | `PeriodLock` refuses the locked date through `assertPostingAllowed`. The scripted agent re-dates it to October and posts under the page's rule. | yes |
| duplicate | Invoice 8841 from Kontorrekvisita AS is already in the ledger. | Does not catch it. The scripted agent reads the ledger, answers and does not post. | `duplicatesOf` flags the duplicate, and the post policy refuses it. The refusal is not exercised by the scripted run, which does not press the button. | yes |
| foreign-currency | EUR 1 000,00 is booked at the rate of the invoice date (11,7250), so the NOK amount is 11 725,00. | No conversion and no rate check. The agent types the NOK rows. | The line holds the foreign amount and the rate. The scripted agent works out the NOK amount itself, and no control looks up the rate. | partly |
| partial-vat | Half of the input VAT (1 250,00) is not deductible. | There is no VAT column. The agent types three lines without a VAT code. | No control splits the VAT. The expected end state is reachable only with no VAT code on the lines. | partly |

"Booki can do it" is about the task's end state as the verifier reads it. `yes` means the Booki page reaches it with its own controls and the scripted run shows it; `partly` means a control helps, but the agent or a person must do a step the control does not (see the section for the task).

## doc-error

### Where Booki cannot do this task / does not catch it

The invoice from Verktøy Øst AS (2207) prints a total of 12 050,00. Its lines and VAT add up to 12 500,00 (net 10 000,00, VAT 2 500,00).

- `/bench/doc-error-acc` (Booki, `SupplierInvoiceInbox`):
  - **Detects the arithmetic mismatch.** `supplierInvoiceIssues` in `packages/core/src/supplier-invoice.ts` reports a `totals-mismatch` issue when net + tax differs from gross. The inbox lists the issues of the invoice it has open (`supplier-invoice-inbox-issues`). Which invoice is open by default was read from the code, not checked in the rendered page.
  - **Does not stop the agent posting.** The post button is `data-agent-confirm` and its step policy only checks the page's rule: supplier and invoice number, dates, coding present, KID valid, gross under 50 000 kr. The rule does not read the issue list. Once the agent proposes coding 6800, the rule passes and the agent **can post 12 050,00**. This is the intended honest result: the control shows the problem, nothing gates posting on it. Not exercised by the scripted run, which does not press the post button.
  - **Cannot send the invoice back.** There is no agent action for it. The inbox's approve and reject are a person's controls. The page's "Send tilbake til leverandør" is a plain button outside the bridge, for a person. The scripted agent holds the invoice and answers; `status` stays `new`.
- `/bench/doc-error-raw` (plain page): **does not catch it.** Nothing on the page compares the printed total with the lines. The gross field is prefilled with 12050,00 and posting takes any value. The scripted agent sends the invoice back with a reason. Sending it back is recorded but not required, as on the Booki page: the checks are that nothing is posted and that the answer names both totals.

## duplicate

### Where Booki cannot do this task / does not catch it

Invoice 8841 from Kontorrekvisita AS (org.nr 911223344) is already in the ledger as voucher v-101. The same invoice arrives again.

- `/bench/duplicate-acc` (Booki, `SupplierInvoiceInbox` with the ledger as `booked`):
  - **Detects the duplicate.** `duplicatesOf` in `packages/core/src/supplier-invoice.ts` matches on invoice number and on supplier organisation number (or name when there is no number). The inbox shows "duplicate of v-101" on the row and adds a `duplicate` issue.
  - **The post refuses it, through the page's policy.** The step policy calls `duplicatesOf` on the invoice and refuses the post when any booked invoice matches. The refusal is the page's code, not the inbox's: the inbox has no post action of its own. Not exercised by the scripted run, which does not press the post button.
  - **Approval for posting** (a person's) goes through `approveSupplierInvoice` and `assertApprovable` with the same booked context, so a person's approval is refused while the duplicate stands. Read from the code, not exercised.
  - **Says so.** The scripted agent answers that 8841 is a duplicate and that it did not post. The dry run passes `answerFlagsDuplicate`.
  - Deviation from the plan: the page uses the inbox as the editing surface, not the `acc-supplier-invoice` form. `hard-data.ts` has no due date for the duplicate, so the page uses 2026-11-11 as a constant, the same date the supplier-invoice script uses.
- `/bench/duplicate-raw` (plain page): **does not catch it.** The ledger table shows 8841 from Kontorrekvisita AS, and nothing warns when the same number is entered. "Bokfør faktura" appends a fourth row whatever the table says. The scripted agent reads the ledger, finds 8841, answers and does not post; the dry run passes both checks.

## closed-period

### Where Booki cannot do the task / does not help

The voucher is dated 2026-09-15 in a hard-closed period (August and September are locked, October is open). Two outcomes count as right: the agent posts it in October with the original date in the voucher text, or it posts nothing and tells the person September is closed. Moving a voucher's date is an accounting decision, so stopping to ask is not a failure. The periods must stay as they were either way.

- `/bench/closed-period-acc` (Booki, `PeriodLock` and `VoucherComposer`):
  - **Refuses the locked date through the period lock's agent action.** `PeriodLock` exposes `assertPostingAllowed` (`packages/primitives/src/period-lock.ts`). A locked date throws `period.hard-closed`, with the period code and the date in the message. The snapshot carries `periods` and a `refusal` state.
  - **Does not say which period is open.** The message reads "Period {code} is closed. Nothing can be posted on {date}; post the correction in an open period." It names no open period, and the lock's snapshot has no next-open-period field. The agent has to infer October from the status list.
  - **Does not stop the agent choosing the date.** The step policy only checks the page's rule: balanced, dated in an open period through `assertPostingAllowed`, at most 50 000 kr. A September date fails the rule, so the post goes to a person; the agent must re-date to October before the post is auto-approved. The scripted run does this (date 2026-09-15, then 2026-10-01).
  - **Periods stay with a person.** Closing and locking are `PeriodLock` buttons outside the agent's actions. The page logs `periods-changed` on any change; the scripted run makes no period change, so the check passes.
  - **Free text is a plain `Input`.** The voucher text uses the ui-sdk `Input` with `setValue`. Booki has no voucher-text field of its own; `InvoiceNumberInput` was not used because its label and format are for invoice numbers.
- `/bench/closed-period-raw` (plain page): **refuses with a line of text and names no period open.** "Perioden er stengt for bokføring." is shown inline and the voucher is not posted. The status table is plain text, so the agent reads October as "Åpen" without any control saying so. The scripted run re-dates and posts; the dry run passes all four checks.

## partial-vat

### Where Booki cannot do the task / does not help

Invoice 7710 from Mobil og Data AS: gross 12 500,00, net 10 000,00, VAT 2 500,00. Half the VAT (1 250,00) is not deductible, so 6900 takes 11 250,00 and 2710 takes 1 250,00; 2400 is credited 12 500,00.

- **No control splits non-deductible VAT.** `VoucherComposer` and `vatPostings` in `packages/core/src/voucher.ts` treat a line with a VAT code as gross and post the full VAT for that code's percentage (25 % for MVA25) on 2710 or 2700. The composer has no share or percentage option: `addLine`, `setVatCode` and the other actions take a code, not a fraction. Read from the code; not checked in a rendered page.
- **The only way to get the task's end state is to enter three lines with no VAT code**, as the task's expected lines are typed: 6900 debit 1 125 000 minor, 2710 debit 125 000 minor, 2400 credit 1 250 000 minor. Nothing on the page helps with this, and no helper computes the 50 % split.
- **A VAT code on the cost line is accepted and changes the ledger.** Account 6900 is in the chart with no restricted VAT codes, so MVA25 can be set on it. The composer's `postings` then give 6900 net 900 000 and 2710 225 000 for a 1 125 000 line (25 % of the gross, not half of it), which is not the end state. The end-state check reads account, debit and credit only and does not read `vatCode`, so a line coded MVA25 would still pass the lines check. This is a gap in the verifier, recorded here and not changed (the verifier contract is fixed for this task).
- **The rule does not look at VAT.** The post rule checks balance, date and the 50 000 kr limit. A voucher with the wrong VAT split posts under it.
- `/bench/partial-vat-raw` (plain page): **there is no VAT column**, so the agent cannot code a line, and the form posts exactly what is typed when debit equals credit. The rule is shown as text above the form. The scripted run enters the three lines and posts; the dry run passes all four checks.
- `/bench/partial-vat-acc` (Booki): the rule text is shown above the composer. The scripted run enters the three lines without a VAT code through the bridge (`setDate`, three `addLine` calls, `assertPostable`, `press`) and the post goes through the step policy; the dry run passes all four checks.

## foreign-currency

### Where Booki cannot do the task / does not help

Invoice NC-5531 from Nordic Cloud Ltd is dated 2026-10-14 and is EUR 1 000,00. The rate for that date is 11,7250 NOK per EUR (the table's rate for 2026-10-14), so the voucher is 11 725,00 kr on 6800 debit and 2400 credit, with the currency and the rate recorded.

- `/bench/foreign-currency-acc` (Booki, `VoucherComposer`):
  - **The composer can record a foreign amount and a rate on a line.** The agent action `setForeign` (`packages/primitives/src/voucher-composer.ts`) calls `setLineForeign` in `packages/core/src/voucher.ts`, which converts with `convertMinor` in `packages/core/src/fx.ts` and stores `foreign` (currency, amount in minor units, `rateScaled`). Read from the code, not exercised: the scripted run does not call `setForeign`.
  - **The scripted run sends the NOK base itself.** It sends both lines in one `setLines`, with the foreign object and the NOK figure of 11 725,00 kr on each line. `assertPostable` then checks the NOK base against the foreign amount at the rate (`assertForeignAmount`), so a wrong NOK figure is refused at the composer. The NOK arithmetic is the agent's, not the control's.
  - **No control looks up the rate.** `findRate` in `packages/core/src/fx.ts` picks the rate on or before a date, but no Booki control calls it (checked with a grep over `packages/primitives`, `packages/react` and `packages/core`). The page shows the rate table as a `DataTable`, and the agent reads the rate from it.
  - **The currency select is not connected to the lines.** `CurrencySelect` on the page records the voucher currency for display only; the composer's line currency comes from the `foreign` object on each line. Changing the select does not change any line, and the page does not check the two against each other.
  - **The rule does not check the rate.** The post rule checks balance, date and the 50 000 kr limit. A line at another rate posts under it, as long as the composer's own check passes.
  - **The mirror for the end state.** The page writes `rateScaled` as the rate on the first foreign line, or `null`, and the line's foreign amount and currency as flat fields. This is a copy of what the composer holds, not a conversion.
- `/bench/foreign-currency-raw` (plain page): **no conversion and no rate check.** The currency, foreign amount and rate are text fields the page keeps and never reads. The page posts the NOK rows as typed when debit equals credit. The scripted agent reads the rate from the table, types 11725,00 on both rows, and posts; the dry run passes all four checks.

## Dry run

`pnpm --filter agent-benchmark bench -- --dry-run --task doc-error` and `--task duplicate`: every page line prints `ok` for an untouched page failing its checks, for the scripted pass, and for the bridge and tool-error checks. No model was called.

`--task closed-period` and `--task partial-vat` were run the same way, with `--dry-run` and no key. Each page printed `ok` for an untouched page failing its checks and for the scripted pass, and every check passed.

`--task foreign-currency` was run the same way. Both pages printed `ok` for an untouched page failing its checks, for the scripted pass, and for the bridge and tool-error checks; every end-state check passed on both.

## Changed after the first trial run (23 November 2026)

A trial with Claude subagents as the model (not a published measurement) stopped and asked on `closed-period` and flagged without sending back on `doc-error`. Both are reasonable for a person's assistant, and the checks counted them wrong. Two checks changed; the task texts, the pages and everything in `packages/` did not:

- `closed-period`: "nothing posted, periods untouched, and the reply says September is closed" is a second right outcome next to posting in October.
- `doc-error` (plain page): `returnedWithReason` is no longer required, so both pages ask the same: not posted, both totals named.
