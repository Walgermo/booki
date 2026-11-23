import { describe, expect, it } from "vitest";
import type { SupplierInvoice } from "@booki/core/supplier-invoice";
import { apply, openPosts, seedBooks, type Books } from "@/lib/books";
import { actorFor } from "@/lib/people";
import { RULE_NAME } from "@/lib/rule";

const as = (token: string) => actorFor(token);
const coded = (books: Books, id: string, account: string): SupplierInvoice[] =>
  books.invoices.map((invoice) => (invoice.id === id ? { ...invoice, coding: { account } } : invoice));
const withInvoice = (books: Books, id: string, change: Partial<SupplierInvoice>): SupplierInvoice[] =>
  books.invoices.map((invoice) => (invoice.id === id ? { ...invoice, ...change } : invoice));

describe("the books, as the server keeps them", () => {
  it("walks an invoice from the inbox to an approved bank match, with the right person at each step", () => {
    const books = seedBooks();

    // Nina codes the cleaning invoice; Kari approves it.
    expect(apply(books, as("person:nina"), { action: "invoices", invoices: coded(books, "si-2", "6340") }).ok).toBe(
      true,
    );
    expect(books.invoices.find((i) => i.id === "si-2")!.status).toBe("coded");
    expect(
      apply(books, as("person:kari"), {
        action: "invoices",
        invoices: withInvoice(books, "si-2", { status: "approved" }),
      }).ok,
    ).toBe(true);
    expect(books.invoices.find((i) => i.id === "si-2")).toMatchObject({ status: "approved", approvedBy: "kari" });

    // Nina prepares the batch; Kari may not approve the payment of an invoice she approved.
    expect(apply(books, as("person:nina"), { action: "prepare-batch" }).ok).toBe(true);
    const kari = apply(books, as("person:kari"), {
      action: "batch",
      batch: {
        ...books.batch!,
        approvals: [...books.batch!.approvals, { approverId: "kari", at: "x", fingerprint: "x" }],
      },
    });
    expect(kari.ok).toBe(false);
    expect(books.batch!.approvals).toHaveLength(0);

    // Ola approves; Ola may not also release; Per releases.
    const approve = { ...books.batch!, approvals: [{ approverId: "ola", at: "x", fingerprint: "x" }] };
    expect(apply(books, as("person:ola"), { action: "batch", batch: approve }).ok).toBe(true);
    expect(apply(books, as("person:ola"), { action: "batch", batch: { ...books.batch!, status: "released" } }).ok).toBe(
      false,
    );
    expect(apply(books, as("person:per"), { action: "batch", batch: { ...books.batch!, status: "released" } }).ok).toBe(
      true,
    );
    expect(books.bankLines).toHaveLength(1);

    // The agent suggests the match; only a person approves it.
    const match = {
      id: "m1",
      bankLineIds: ["b-si-2"],
      postIds: ["si-2"],
      status: "suggested" as const,
      source: "agent" as const,
    };
    expect(apply(books, as("agent:nina"), { action: "matches", matches: [match] }).ok).toBe(true);
    expect(books.matches[0]).toMatchObject({ status: "suggested", source: "agent" });
    expect(apply(books, as("agent:nina"), { action: "matches", matches: [{ ...match, status: "approved" }] }).ok).toBe(
      false,
    );
    expect(apply(books, as("person:nina"), { action: "matches", matches: [{ ...match, status: "approved" }] }).ok).toBe(
      true,
    );
    expect(openPosts(books)).toHaveLength(1);

    expect(books.audit.map((row) => `${row.actor} ${row.action}`)).toContain("agent:bookkeeper reconciliation.suggest");
  });

  it("refuses an agent's approval of an invoice, and lets it through only under the company's rule", () => {
    const books = seedBooks();
    apply(books, as("agent:nina"), { action: "invoices", invoices: coded(books, "si-1", "6800") });
    const plain = apply(books, as("agent:nina"), {
      action: "invoices",
      invoices: withInvoice(books, "si-1", { status: "approved", approvedBy: "agent" }),
    });
    expect(plain.ok).toBe(false);
    // The second copy (si-3) still sits in the inbox, so the rule's approval is refused as a possible duplicate.
    const ruled = apply(books, as("agent:nina"), {
      action: "invoices",
      invoices: withInvoice(books, "si-1", { status: "approved", approvedBy: `rule:${RULE_NAME}` }),
    });
    expect(ruled.ok).toBe(false);
    // Kari rejects the copy; now the rule approves the original.
    expect(
      apply(books, as("person:kari"), {
        action: "invoices",
        invoices: withInvoice(books, "si-3", { status: "rejected", rejectionReason: "Duplikat av si-1" }),
      }).ok,
    ).toBe(true);
    const again = apply(books, as("agent:nina"), {
      action: "invoices",
      invoices: withInvoice(books, "si-1", { status: "approved", approvedBy: `rule:${RULE_NAME}` }),
    });
    expect(again.ok).toBe(true);
    expect(books.invoices.find((i) => i.id === "si-1")!.approvedBy).toBe(`rule:${RULE_NAME}`);
  });

  it("keeps the rule on the server: an invoice over the limit is refused even if the screen said yes", () => {
    const books = seedBooks();
    apply(books, as("agent:nina"), { action: "invoices", invoices: coded(books, "si-2", "6340") });
    const answer = apply(books, as("agent:nina"), {
      action: "invoices",
      invoices: withInvoice(books, "si-2", { status: "approved", approvedBy: `rule:${RULE_NAME}` }),
    });
    expect(answer.ok).toBe(false);
    expect(books.invoices.find((i) => i.id === "si-2")!.status).toBe("coded");
  });

  it("takes the approver from the credential, never from the body", () => {
    const books = seedBooks();
    apply(books, as("person:nina"), { action: "invoices", invoices: coded(books, "si-2", "6340") });
    const answer = apply(books, as("person:nina"), {
      action: "invoices",
      invoices: withInvoice(books, "si-2", { status: "approved", approvedBy: "kari" }),
    });
    expect(answer.ok).toBe(false); // Nina is an accountant: she may not approve, whatever the body says.
    expect(apply(books, undefined, { action: "prepare-batch" })).toMatchObject({ ok: false, status: 401 });
  });

  it("lets the agent do what the person it works for may do, and no more", () => {
    const books = seedBooks();
    apply(books, as("person:nina"), { action: "invoices", invoices: coded(books, "si-2", "6340") });
    apply(books, as("person:kari"), {
      action: "invoices",
      invoices: withInvoice(books, "si-2", { status: "approved" }),
    });
    // Kari may not prepare a payment batch, so neither may the agent working for her.
    const forKari = apply(books, as("agent:kari"), { action: "prepare-batch" });
    expect(forKari).toMatchObject({ ok: false, status: 403, code: "server.delegation" });
    expect(books.batch).toBeNull();
    expect(books.audit[0]).toMatchObject({ actor: "agent:bookkeeper", action: "refused" });
    expect(apply(books, as("agent:nina"), { action: "prepare-batch" }).ok).toBe(true);
  });

  it("logs a step the page refused as the agent's, and only for an agent", () => {
    const books = seedBooks();
    const write = { action: "agent-step", step: "agent.refused", target: "Betalingsforslag" } as const;
    expect(apply(books, as("person:nina"), write).ok).toBe(false);
    expect(apply(books, as("agent:nina"), write).ok).toBe(true);
    expect(books.audit[0]).toMatchObject({ actor: "agent:bookkeeper", target: "Betalingsforslag" });
  });
});

describe("findings of the security review", () => {
  it("does not let the agent make an unknown supplier a regular one by editing its fields", () => {
    const books = seedBooks();
    const si2 = books.invoices.find((i) => i.id === "si-2")!;
    const forged = {
      ...si2,
      fields: {
        ...si2.fields,
        supplierOrgNumber: { ...si2.fields.supplierOrgNumber, value: "923609016" },
        grossMinor: { ...si2.fields.grossMinor, value: 400_000 },
      },
      coding: { account: "6340" },
    };
    // In one write with the approval: refused.
    const together = apply(books, as("agent:nina"), {
      action: "invoices",
      invoices: books.invoices.map((i) =>
        i.id === "si-2" ? { ...forged, status: "approved" as const, approvedBy: "rule:x" } : i,
      ),
    });
    expect(together.ok).toBe(false);
    // As two writes: the edit stands, but the rule checks the registered bank account.
    apply(books, as("agent:nina"), {
      action: "invoices",
      invoices: books.invoices.map((i) => (i.id === "si-2" ? forged : i)),
    });
    const after = apply(books, as("agent:nina"), {
      action: "invoices",
      invoices: books.invoices.map((i) =>
        i.id === "si-2" ? { ...i, status: "approved" as const, approvedBy: "rule:x" } : i,
      ),
    });
    expect(after).toMatchObject({ ok: false, code: "server.rule" });
    expect(books.invoices.find((i) => i.id === "si-2")!.status).not.toBe("approved");
  });

  it("counts an approval under the rule as the deed of the person whose agent made it", () => {
    const books = seedBooks();
    const reject = books.invoices.map((i) =>
      i.id === "si-3" ? { ...i, status: "rejected" as const, rejectionReason: "Kopi av si-1" } : i,
    );
    apply(books, as("person:kari"), { action: "invoices", invoices: reject });
    apply(books, as("agent:ola"), { action: "invoices", invoices: coded(books, "si-1", "6800") });
    const approved = apply(books, as("agent:ola"), {
      action: "invoices",
      invoices: withInvoice(books, "si-1", { status: "approved", approvedBy: "rule:x" }),
    });
    expect(approved.ok).toBe(true);
    expect(apply(books, as("person:nina"), { action: "prepare-batch" }).ok).toBe(true);
    const ola = apply(books, as("person:ola"), {
      action: "batch",
      batch: { ...books.batch!, approvals: [{ approverId: "ola", at: "x", fingerprint: "x" }] },
    });
    expect(ola).toMatchObject({ ok: false, code: "permissions.duty" });
  });

  it("lets only someone who may prepare a batch take payments out of it", () => {
    const books = seedBooks();
    apply(books, as("person:nina"), { action: "invoices", invoices: coded(books, "si-2", "6340") });
    apply(books, as("person:kari"), {
      action: "invoices",
      invoices: withInvoice(books, "si-2", { status: "approved" }),
    });
    apply(books, as("person:nina"), { action: "prepare-batch" });
    const kari = apply(books, as("person:kari"), { action: "batch", batch: { ...books.batch!, items: [] } });
    expect(kari).toMatchObject({ ok: false, status: 403 });
    expect(books.batch!.items).toHaveLength(1);
  });
});
