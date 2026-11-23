import { BookiError, msg } from "./msg.js";

/** One payment going out in a batch. */
export type PaymentItem = {
  id: string;
  creditorName: string;
  /** Amount to pay in minor units. Always above zero. */
  amountMinor: number;
  /** The creditor's account: kontonummer, IBAN or routing + account. Secret. */
  creditorAccount: string;
  /** KID, invoice number or memo. */
  reference?: string;
};

export type BatchApproval = {
  approverId: string;
  /** ISO timestamp. */
  at: string;
  /** What the approver saw. If the batch changes, the approval no longer counts. */
  fingerprint: string;
};

/**
 * - `draft`: items can change. Any change drops the approvals.
 * - `released`: sent to the bank. Fixed.
 */
export type PaymentBatch = {
  id: string;
  status: "draft" | "released";
  debitAccount: string;
  /** ISO date the bank should execute on. */
  valueDate: string;
  currency: string;
  /** Who put the batch together. They cannot approve it. */
  preparedBy: string;
  items: PaymentItem[];
  approvals: BatchApproval[];
};

export function batchTotalMinor(batch: Pick<PaymentBatch, "items">): number {
  return batch.items.reduce((sum, item) => sum + item.amountMinor, 0);
}

/** A stable string of everything an approver signs: accounts, date and every item. */
export function batchFingerprint(batch: PaymentBatch): string {
  const items = [...batch.items]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((item) => [item.id, item.creditorAccount, item.amountMinor, item.reference ?? ""]);
  // JSON, not joined text: a reference holding the separators must not make two batches look alike.
  return JSON.stringify([batch.debitAccount, batch.valueDate, batch.currency, items]);
}

/** Groups of items that look like the same payment twice: same account, amount and reference. */
export function duplicatePayments(items: PaymentItem[]): PaymentItem[][] {
  const groups = new Map<string, PaymentItem[]>();
  for (const item of items) {
    // The same account and reference written differently (dots, spaces, case) is still the same payment.
    const key = JSON.stringify([
      item.creditorAccount.toUpperCase().replace(/[^A-Z0-9]/g, ""),
      item.amountMinor,
      (item.reference ?? "").replace(/\s/g, "").toUpperCase(),
    ]);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

/** Approvals that still match the batch as it is now. */
export function currentApprovals(batch: PaymentBatch): BatchApproval[] {
  const now = batchFingerprint(batch);
  return batch.approvals.filter((approval) => approval.fingerprint === now);
}

/** Everything that stops a batch from being approved, as sentences. */
export function batchIssues(batch: PaymentBatch): string[] {
  const issues: string[] = [];
  if (batch.items.length === 0) issues.push(msg("batch.no-payments"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(batch.valueDate))
    issues.push(msg("batch.value-date-format", { value: String(batch.valueDate) }));
  if (!batch.debitAccount.trim()) issues.push(msg("batch.no-debit-account"));
  const ids = new Set<string>();
  for (const item of batch.items) {
    if (ids.has(item.id)) issues.push(msg("batch.duplicate-id", { id: item.id }));
    ids.add(item.id);
    if (!Number.isSafeInteger(item.amountMinor) || item.amountMinor <= 0) {
      issues.push(msg("batch.amount-format", { id: item.id, value: String(item.amountMinor) }));
    }
    if (!item.creditorAccount.trim()) issues.push(msg("batch.no-creditor-account", { id: item.id }));
  }
  for (const group of duplicatePayments(batch.items)) {
    issues.push(msg("batch.duplicate-payments", { idsAndList: group.map((item) => item.id) }));
  }
  return issues;
}

/** Replace the items of a draft. Every approval is dropped: nobody approved this version. */
export function setBatchItems(batch: PaymentBatch, items: PaymentItem[]): PaymentBatch {
  if (batch.status !== "draft") throw new BookiError("batch.released", { id: batch.id });
  return { ...batch, items, approvals: [] };
}

/**
 * Record one person's approval of the batch as it is now. Refused for the
 * person who prepared it, for someone who already approved, and while the
 * batch has issues.
 */
export function approveBatch(batch: PaymentBatch, approverId: string, at: string): PaymentBatch {
  if (batch.status !== "draft") throw new BookiError("batch.already-released", { id: batch.id });
  const who = String(approverId ?? "").trim();
  if (who === "") throw new BookiError("batch.approver-required");
  if (who === batch.preparedBy) {
    throw new BookiError("batch.preparer-cannot-approve", { who });
  }
  const issues = batchIssues(batch);
  if (issues.length > 0) throw new BookiError("batch.not-approvable", { issues });
  const current = currentApprovals(batch);
  if (current.some((approval) => approval.approverId === who)) {
    throw new BookiError("batch.already-approved-by", { who });
  }
  return {
    ...batch,
    approvals: [...current, { approverId: who, at, fingerprint: batchFingerprint(batch) }],
  };
}

/** Throws unless enough different people have approved the batch exactly as it is now. */
export function assertReleasable(batch: PaymentBatch, requiredApprovals = 2): void {
  // 0, a fraction or NaN would let a batch go with no one's approval.
  if (!Number.isSafeInteger(requiredApprovals) || requiredApprovals < 1) {
    throw new BookiError("batch.required-approvals", { value: String(requiredApprovals) });
  }
  if (batch.status !== "draft") throw new BookiError("batch.already-released", { id: batch.id });
  const issues = batchIssues(batch);
  if (issues.length > 0) throw new BookiError("batch.not-releasable", { issues });
  const current = currentApprovals(batch);
  if (current.length < requiredApprovals) {
    const stale = batch.approvals.length - current.length;
    throw new BookiError("batch.approvals-missing", {
      current: current.length,
      required: requiredApprovals,
      stale: stale > 0 ? msg("batch.approvals-stale", { count: stale }) : "",
    });
  }
}

/** Mark the batch as sent to the bank. */
export function releaseBatch(batch: PaymentBatch, requiredApprovals = 2): PaymentBatch {
  assertReleasable(batch, requiredApprovals);
  return { ...batch, status: "released" };
}
