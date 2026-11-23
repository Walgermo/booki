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

## Dry run

`pnpm --filter agent-benchmark bench -- --dry-run --task doc-error` and `--task duplicate`: every page line prints `ok` for an untouched page failing its checks, for the scripted pass, and for the bridge and tool-error checks. No model was called.
