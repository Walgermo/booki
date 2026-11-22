# Workflow gaps in the Booki controls

Found while building the three workflow tasks of the agent benchmark
(`benchmarks/agent`, tasks `inbox`, `reconcile` and `close`). The benchmark
pages use the controls as they are; nothing in `packages/` was changed. Each
item says what the workflow needed, what the control does today, and what the
benchmark page did about it.

## SupplierInvoiceInbox

1. **No way for an agent to post under a company rule.** The single
   supplier-invoice page lets an agent post when the invoice meets the
   company's rule (a ui-sdk `Button` with `data-agent-confirm` and a step
   policy). The inbox has only `approve`, a person's button, and nothing
   between "coded" and "approved" that a rule could allow. So on Booki the
   inbox task ends with every invoice ready for a person, while the replica
   posts them. The benchmark counts that as right for Booki and says so.
   Possible shape: an `approveUnderRule(invoiceId)` the host enables with an
   `allow` rule, recording the rule as the approver, as the voucher page does.
   **Fixed:** `approveUnderRule(invoiceId)` approves only when the ERP has set
   the `rule` option and the rule returns `true`; the record names
   `rule:<ruleName>` as the approver. With no rule it is refused with a
   sentence that says a person approves.

2. **No agent action to mark a duplicate.** The inbox flags a second copy of a
   booked invoice (`duplicateOf`, and an issue sentence), but an agent cannot
   propose its rejection: `reject` is a person's. The agent can only say so in
   its answer, and the person has to find the invoice again. Possible shape:
   `proposeRejection(invoiceId, reason)`, shown to the person as a suggestion
   with the reason filled in, like a suggested match in `BankReconciliation`.
   **Fixed:** `proposeRejection(invoiceId, reason)` stores the reason as
   `proposedRejection` and fills the person's reason field; rejecting stays
   the person's button.

3. **Large step results.** Each `act` step returns the changed keys in full;
   for the inbox that is `inbox`, `rows` and `approvable` for every invoice.
   Four corrections returned about 31 000 characters (h2h, 21 Nov 2026), so a
   model pays for the whole inbox four times. A step result that carries only
   the invoice it changed, plus the counts, would be enough.

## BankReconciliation

4. **`setMatches` lets an agent approve its own matches.** `setMatches` is in
   `agent.actions` (for history and staging) and keeps each match's `status`
   and `source` as given. An agent can therefore write
   `{ status: "approved", source: "agent" }` and skip `approveMatch`, which is
   meant to be a person's. Confirmed on the built benchmark page: one `act`
   step with `setMatches` and `status: "approved"` returned `ok: true` and
   the match stood as approved. The benchmark's check for Booki fails a run that
   ends with an approved match, so a model that does this is counted wrong.
   **It is also what models reach for.** In the real runs (21 Nov 2026) every
   Booki reconcile run, 15 of 15 with Haiku 5.5, DeepSeek V4.1 Flash and
   Sonnet 5.5, used `setMatches` to write all matches at once instead of
   `suggestMatch`, and passed matches with no `status`. The control accepted
   them. A match without a status is neither suggested nor approved: its lines
   leave the unmatched lists, the composed view shows no approve button for
   it (it lists `status === "suggested"` only), and the person is never asked.
   The matches themselves were right in all 15 runs.
   Possible fix: when the source of a call is an agent, refuse a status other
   than `suggested` for a match that is new or changed, or take `setMatches`
   out of `agent.actions` and give history its own channel.
   **Fixed:** a match that is new or changed in `setMatches` becomes a
   suggestion from the agent, with approve and reject buttons for the person.
   A status other than `suggested` on it is refused, and a match a person
   already decided cannot be changed or dropped; given back unchanged it
   passes through, so history and staging still work.

5. **Step results grow with the statement.** As with the inbox, every
   `suggestMatch` step returns `unmatchedBankLines` and `unmatchedPosts` in
   full. Ten suggestions in one `act` returned about 23 000 characters.

## CloseChecklist and PeriodLock

6. **No task can be marked as a person's.** A task like "Steng oktober for
   bokføring" is a person's decision, but `completeTask` accepts any task
   whose dependencies are finished. The task text tells the model to leave it,
   and the check fails a run that completes it; the control itself would let
   it through. Possible shape: `personOnly: true` on a `CloseTask`, refused for
   an agent with a sentence that says who must do it.

7. **A task is not tied to its evidence.** "Bokfør avskrivning for oktober"
   can be marked done whether or not a voucher was posted. The benchmark
   checks the order (period checked, voucher posted, task done, balance
   checked) from the page's own event log. A task could carry an optional
   `evidence` reference (a voucher id, a reconciliation) that `completeTask`
   asks for.

8. **The voucher does not ask the period lock.** `VoucherComposer` and
   `FinancialDateField` do not know about `PeriodLock`. The close page had to
   call `assertPostingAllowed` in its own posting rule to stop a voucher dated
   in a locked month. A `periods` option on the date field (or the composer)
   would make the refusal come from the control, with its sentence.
