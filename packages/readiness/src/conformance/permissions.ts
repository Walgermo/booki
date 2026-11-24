/**
 * The decisions that stay with a person (spec/agent-contract.md, section 5).
 * A server MUST refuse each of these when the caller is an agent, whatever its roles.
 * test/permissions.test.ts keeps this list equal to the spec table.
 */
export const PERSON_ONLY_PERMISSIONS: readonly string[] = [
  "approval.decide",
  "supplier-invoice.approve",
  "expense.approve",
  "payment.approve",
  "payment.release",
  "reconciliation.approve",
  "period.close",
  "period.adjust-closed",
  "close.sign-off",
  "invoice.finalize",
  "vat.submit",
  "asset.dispose",
  "audit.sign-off",
  "audit.review",
  "audit.conclude",
  "audit.eqcr",
  "audit.freeze",
  "finding.confirm",
  "finding.withdraw",
  "request.send",
  "request.decide",
  "deal.close",
];
