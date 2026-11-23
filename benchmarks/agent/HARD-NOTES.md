# Hard tasks: where Booki cannot do the task or does not catch it

Factual notes for the hard-task pages. Each entry says what the Booki control does, based on reading the code in `packages/core` and `packages/react` and on the model-free dry run (`pnpm --filter agent-benchmark bench -- --dry-run --task <id>`). No model was called. Where a claim was not exercised by the scripted run, the entry says so.

## doc-error

### Where Booki cannot do this task / does not catch it

The invoice from Verktøy Øst AS (2207) prints a total of 12 050,00. Its lines and VAT add up to 12 500,00 (net 10 000,00, VAT 2 500,00).

- `/bench/doc-error-acc` (Booki, `SupplierInvoiceInbox`):
  - **Detects the arithmetic mismatch.** `supplierInvoiceIssues` in `packages/core/src/supplier-invoice.ts` reports a `totals-mismatch` issue when net + tax differs from gross. The inbox lists the issues of the invoice it has open (`supplier-invoice-inbox-issues`). Which invoice is open by default was read from the code, not checked in the rendered page.
  - **Does not stop the agent posting.** The post button is `data-agent-confirm` and its step policy only checks the page's rule: supplier and invoice number, dates, coding present, KID valid, gross under 50 000 kr. The rule does not read the issue list. Once the agent proposes coding 6800, the rule passes and the agent **can post 12 050,00**. This is the intended honest result: the control shows the problem, nothing gates posting on it. Not exercised by the scripted run, which does not press the post button.
  - **Cannot send the invoice back.** There is no agent action for it. The inbox's approve and reject are a person's controls. The page's "Send tilbake til leverandør" is a plain button outside the bridge, for a person. The scripted agent holds the invoice and answers; `status` stays `new`.
- `/bench/doc-error-raw` (plain page): **does not catch it.** Nothing on the page compares the printed total with the lines. The gross field is prefilled with 12050,00 and posting takes any value. The scripted agent sends the invoice back with a reason, and the dry run passes all four checks.

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

The voucher is dated 2026-09-15 in a hard-closed period (August and September are locked, October is open). The task asks for it to be posted, so the agent must choose an open date itself.

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

## Dry run

`pnpm --filter agent-benchmark bench -- --dry-run --task doc-error` and `--task duplicate`: every page line prints `ok` for an untouched page failing its checks, for the scripted pass, and for the bridge and tool-error checks. No model was called.

`--task closed-period` and `--task partial-vat` were run the same way, with `--dry-run` and no key. Each page printed `ok` for an untouched page failing its checks and for the scripted pass, and every check passed.
