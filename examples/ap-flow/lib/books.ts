import { approveBatch, setBatchItems, type PaymentBatch } from "@booki/core/payment-batch";
import { validateMatch, type BankLine, type OpenPost, type ReconciliationMatch } from "@booki/core/reconciliation";
import {
  actorLabel,
  guard,
  guardReleasePayments,
  type GuardContext,
  type Refusal,
  type ServerActor,
  type Verdict,
} from "@booki/core/server";
import { approveSupplierInvoice, rejectSupplierInvoice, type SupplierInvoice } from "@booki/core/supplier-invoice";
import type { Deed } from "@booki/core/permissions";
import { CHART, COMPANY, VALUE_DATE, seedInvoices } from "./data";
import { ROLES } from "./people";
import { RULE_NAME, smallKnownSupplier } from "./rule";

/**
 * The books: what the server holds and the only place a change becomes true.
 * The screens propose a whole new list (the inbox's invoices, the batch, the
 * matches); the server compares it with what it has, and lets through only
 * the transitions the actor may make. A refusal changes nothing.
 *
 * Kept in memory for the example. Your app keeps this in its database.
 */

export type AuditRow = { id: string; at: string; actor: string; action: string; target: string; detail?: string };

export type Books = {
  invoices: SupplierInvoice[];
  batch: PaymentBatch | null;
  bankLines: BankLine[];
  matches: ReconciliationMatch[];
  audit: AuditRow[];
};

export type Write =
  | { action: "invoices"; invoices: SupplierInvoice[] }
  | { action: "prepare-batch" }
  | { action: "batch"; batch: PaymentBatch }
  | { action: "matches"; matches: ReconciliationMatch[] }
  | { action: "reset" };

export type Answer = { ok: true; books: Books } | (Refusal & { books: Books });

const CHART_NUMBERS = CHART.map((account) => account.number);

export function seedBooks(): Books {
  return { invoices: seedInvoices(), batch: null, bankLines: [], matches: [], audit: [] };
}

/** Open posts are the approved invoices: what the bank statement should settle. */
export function openPosts(books: Books): OpenPost[] {
  return books.invoices
    .filter((invoice) => invoice.status === "approved" || invoice.status === "posted")
    .map((invoice) => ({
      id: invoice.id,
      date: String(invoice.fields.dueDate.value),
      description: `${invoice.fields.supplierName.value} ${invoice.fields.invoiceNumber.value}`,
      amountMinor: -invoice.fields.grossMinor.value,
      reference: String(invoice.fields.paymentReference.value),
    }));
}

/** Who did what to the invoices in a batch, for the duty rules. */
function invoiceDeeds(books: Books, batch: PaymentBatch): Deed[] {
  return batch.items.flatMap((item) => {
    const invoice = books.invoices.find((candidate) => candidate.id === item.id);
    return invoice?.approvedBy ? [{ actorId: invoice.approvedBy, permission: "supplier-invoice.approve" }] : [];
  });
}

const now = () => new Date().toISOString();
let sequence = 0;

function log(books: Books, actor: ServerActor | undefined, action: string, target: string, detail?: string) {
  books.audit.unshift({
    id: `a${++sequence}`,
    at: now(),
    actor: actor ? actorLabel(actor) : "unknown",
    action,
    target,
    ...(detail ? { detail } : {}),
  });
}

/** Runs one decision through the guard; on a refusal, logs it and stops the write. */
function decide<T>(books: Books, context: GuardContext, target: string, verdict: Verdict<T>): T {
  if (!verdict.ok) {
    log(books, context.actor, "refused", target, verdict.message);
    throw verdict;
  }
  return verdict.value;
}

function refusal(status: Refusal["status"], code: string, message: string): Refusal {
  return { ok: false, status, code, message };
}

/** The fields a screen may change on an open invoice. Status, approver and the like are the server's. */
function editable(stored: SupplierInvoice, incoming: SupplierInvoice): SupplierInvoice {
  return {
    ...stored,
    fields: incoming.fields,
    coding: incoming.coding,
    proposedRejection: incoming.proposedRejection,
    status: incoming.coding?.account ? "coded" : "new",
  };
}

function writeInvoices(books: Books, context: GuardContext, incoming: SupplierInvoice[]) {
  const at = now();
  const actor = context.actor!;
  books.invoices = books.invoices.map((stored) => {
    const next = incoming.find((invoice) => invoice.id === stored.id);
    if (!next || JSON.stringify(next) === JSON.stringify(stored)) return stored;
    if (stored.status !== "new" && stored.status !== "coded") {
      log(books, actor, "refused", stored.id, "Fakturaen er allerede avgjort.");
      throw refusal(409, "supplier-invoice.already-decided", `Faktura ${stored.id} er allerede ${stored.status}.`);
    }
    const draft = editable(stored, next);
    const inbox = { inbox: books.invoices, chart: CHART_NUMBERS };

    if (next.status === "approved") {
      // The agent's approval stands only under the company's rule, checked here again.
      if (next.approvedBy?.startsWith("rule:")) {
        const approved = decide(
          books,
          context,
          stored.id,
          guard(context, "supplier-invoice.approve-under-rule", () => {
            const verdict = smallKnownSupplier(draft);
            if (verdict !== true) throw new Error(verdict);
            return approveSupplierInvoice(draft, `rule:${RULE_NAME}`, at, inbox);
          }),
        );
        log(books, actor, "supplier-invoice.approve-under-rule", stored.id, `Regel: ${RULE_NAME}`);
        return approved;
      }
      const approved = decide(
        books,
        context,
        stored.id,
        guard(context, "supplier-invoice.approve", () => approveSupplierInvoice(draft, actor.id, at, inbox)),
      );
      log(books, actor, "supplier-invoice.approve", stored.id);
      return approved;
    }

    if (next.status === "rejected") {
      const rejected = decide(
        books,
        context,
        stored.id,
        guard(context, "supplier-invoice.approve", () =>
          rejectSupplierInvoice(draft, actor.id, next.rejectionReason ?? "", at),
        ),
      );
      log(books, actor, "supplier-invoice.reject", stored.id, rejected.rejectionReason);
      return rejected;
    }

    const changed: string[] = [];
    if (JSON.stringify(next.coding) !== JSON.stringify(stored.coding))
      changed.push(`kontert ${next.coding?.account ?? "–"}`);
    if (JSON.stringify(next.fields) !== JSON.stringify(stored.fields)) changed.push("felt rettet eller bekreftet");
    if (next.proposedRejection && !stored.proposedRejection)
      changed.push(`foreslår avvisning: ${next.proposedRejection.reason}`);
    log(books, actor, "supplier-invoice.edit", stored.id, changed.join("; ") || undefined);
    return draft;
  });
}

function prepareBatch(books: Books, context: GuardContext) {
  const actor = context.actor!;
  if (books.batch) throw refusal(409, "batch.exists", "Det finnes allerede et betalingsforslag.");
  const approved = books.invoices.filter((invoice) => invoice.status === "approved");
  if (approved.length === 0) throw refusal(409, "batch.nothing", "Ingen attesterte fakturaer å betale ennå.");
  books.batch = decide(
    books,
    context,
    "betalingsforslag",
    guard(context, "payment.prepare", () => ({
      id: "pb-1",
      status: "draft" as const,
      debitAccount: COMPANY.account,
      valueDate: VALUE_DATE,
      currency: COMPANY.currency,
      // The agent's deeds count as the person's it works for, and the other way round.
      preparedBy: actor.kind === "agent" ? (actor.onBehalfOf ?? actor.id) : actor.id,
      items: approved.map((invoice) => ({
        id: invoice.id,
        creditorName: String(invoice.fields.supplierName.value),
        amountMinor: invoice.fields.grossMinor.value,
        creditorAccount: invoice.bankAccount ?? "",
        reference: String(invoice.fields.paymentReference.value),
      })),
      approvals: [],
    })),
  );
  log(books, actor, "payment.prepare", "betalingsforslag", `${approved.length} betalinger`);
}

function writeBatch(books: Books, context: GuardContext, incoming: PaymentBatch) {
  const stored = books.batch;
  if (!stored) throw refusal(409, "batch.none", "Det finnes ikke noe betalingsforslag.");
  const actor = context.actor!;
  const deeds = [...invoiceDeeds(books, stored), { actorId: stored.preparedBy, permission: "payment.prepare" }];

  if (incoming.status === "released" && stored.status !== "released") {
    books.batch = decide(
      books,
      context,
      stored.id,
      guardReleasePayments({ ...context, deeds }, { batch: stored, requiredApprovals: 1 }),
    );
    log(books, actor, "payment.release", stored.id);
    // The bank's statement for the value date: one line per payment, KID and all.
    books.bankLines = books.batch.items.map((item) => ({
      id: `b-${item.id}`,
      date: books.batch!.valueDate,
      description: `Betaling ${item.creditorName}`,
      amountMinor: -item.amountMinor,
      reference: item.reference,
    }));
    return;
  }

  if (incoming.approvals.length > stored.approvals.length) {
    books.batch = decide(
      books,
      context,
      stored.id,
      guard({ ...context, deeds }, "payment.approve", () => approveBatch(stored, actor.id, now())),
    );
    log(books, actor, "payment.approve", stored.id);
    return;
  }

  // Taking a payment out: allowed before release; the approvals it had no longer count.
  const kept = incoming.items.map((item) => item.id);
  const removed = stored.items.filter((item) => !kept.includes(item.id));
  if (removed.length > 0) {
    books.batch = setBatchItems(
      stored,
      stored.items.filter((item) => kept.includes(item.id)),
    );
    log(books, actor, "payment.remove", stored.id, removed.map((item) => item.id).join(", "));
  }
}

function writeMatches(books: Books, context: GuardContext, incoming: ReconciliationMatch[]) {
  const actor = context.actor!;
  const posts = openPosts(books);
  const next: ReconciliationMatch[] = [];
  for (const match of incoming) {
    const stored = books.matches.find((candidate) => candidate.id === match.id);
    if (!stored) {
      // A new match is a suggestion, whoever makes it; its lines must exist and balance.
      const valid = validateMatch(books.bankLines, posts, next, match.bankLineIds, match.postIds);
      next.push({
        id: match.id,
        bankLineIds: valid.bankLineIds,
        postIds: valid.postIds,
        status: "suggested",
        source: actor.kind === "agent" ? "agent" : "person",
      });
      log(
        books,
        actor,
        "reconciliation.suggest",
        match.id,
        `${valid.bankLineIds.join("+")} ↔ ${valid.postIds.join("+")}`,
      );
      continue;
    }
    if (match.status !== stored.status && (match.status === "approved" || match.status === "rejected")) {
      decide(
        books,
        context,
        stored.id,
        guard(context, "reconciliation.approve", () => true),
      );
      log(books, actor, `reconciliation.${match.status === "approved" ? "approve" : "reject"}`, stored.id);
      next.push({ ...stored, status: match.status });
      continue;
    }
    next.push(stored);
  }
  for (const stored of books.matches) {
    if (!next.some((match) => match.id === stored.id)) {
      if (stored.status !== "suggested") {
        throw refusal(409, "reconciliation.decided", `Avstemmingen ${stored.id} er avgjort og kan ikke fjernes.`);
      }
      log(books, actor, "reconciliation.withdraw", stored.id);
    }
  }
  books.matches = next;
}

/**
 * Applies one write for one actor. All or nothing: on a refusal, the books
 * stay as they were, apart from the refusal in the audit trail.
 */
export function apply(books: Books, actor: ServerActor | undefined, write: Write): Answer {
  const context: GuardContext = { actor, roles: ROLES, locale: "nb" };
  if (write.action === "reset") return { ok: true, books: Object.assign(books, seedBooks()) };
  if (!actor) return { ...refusal(401, "auth.signed-out", "Ingen er logget inn."), books };

  const before = structuredClone({ ...books, audit: [] as AuditRow[] });
  try {
    switch (write.action) {
      case "invoices":
        writeInvoices(books, context, write.invoices);
        break;
      case "prepare-batch":
        prepareBatch(books, context);
        break;
      case "batch":
        writeBatch(books, context, write.batch);
        break;
      case "matches":
        writeMatches(books, context, write.matches);
        break;
      default:
        throw refusal(400 as Refusal["status"], "write.unknown", "Ukjent handling.");
    }
    return { ok: true, books };
  } catch (error) {
    // Put the books back; keep the audit trail, refusals included.
    const { audit } = books;
    Object.assign(books, before, { audit });
    if (error && typeof error === "object" && (error as Refusal).ok === false) return { ...(error as Refusal), books };
    const message = error instanceof Error ? error.message : String(error);
    log(books, actor, "refused", write.action, message);
    return { ...refusal(422, "write.refused", message), books };
  }
}
