import { describe, expect, it } from "vitest";
import type { ApprovalLevel, ApprovalRequest } from "./approval.js";
import type { CloseTask } from "./close.js";
import { approveBatch, type PaymentBatch } from "./payment-batch.js";
import { draftCreditNote, finalizeInvoice } from "./invoice.js";
import { BookiError } from "./msg.js";
import {
  actorRecord,
  advise,
  guard,
  guardClosePeriod,
  guardDecideApproval,
  guardFinalizeInvoice,
  guardPostVoucher,
  guardReleasePayments,
  guardSignDocument,
  toHttp,
  type ServerActor,
} from "./server.js";
import { createVoucherLine } from "./voucher.js";

const nina: ServerActor = { id: "nina", kind: "person", roles: ["accountant"] };
const kari: ServerActor = { id: "kari", kind: "person", roles: ["manager"] };
const ola: ServerActor = { id: "ola", kind: "person", roles: ["controller"] };
const bookkeeper: ServerActor = {
  id: "bookkeeper",
  kind: "agent",
  roles: ["accountant", "manager", "controller"],
  onBehalfOf: "nina",
};

const balanced = [
  createVoucherLine({ id: "a", account: "6800", accountName: "Kontorrekvisita", debitMinor: 1_550_000 }),
  createVoucherLine({ id: "b", account: "2400", accountName: "Leverandørgjeld", creditMinor: 1_550_000 }),
];
const unbalanced = [
  createVoucherLine({ id: "a", account: "6800", accountName: "Kontorrekvisita", debitMinor: 1_550_000 }),
  createVoucherLine({ id: "b", account: "2400", accountName: "Leverandørgjeld", creditMinor: 1_000_000 }),
];
const periods = [
  { code: "2026-09", status: "soft-closed" as const },
  { code: "2025", status: "hard-closed" as const },
];

describe("server guards", () => {
  it("lets an agent post a balanced voucher into an open period, and records it as the agent", () => {
    const verdict = guardPostVoucher(
      { actor: bookkeeper },
      { lines: balanced, date: "2026-10-31", rules: { periods } },
    );
    expect(verdict).toMatchObject({ ok: true, actor: "agent:bookkeeper", value: { balanced: true } });
  });

  it("refuses what the screen refuses, with the status an API should send", () => {
    expect(guardPostVoucher({}, { lines: balanced, date: "2026-10-31" })).toMatchObject({ ok: false, status: 401 });
    expect(guardPostVoucher({ actor: kari }, { lines: balanced, date: "2026-10-31" })).toMatchObject({
      ok: false,
      status: 403,
      code: "permissions.denied",
    });
    const off = guardPostVoucher({ actor: nina }, { lines: unbalanced, date: "2026-10-31" });
    expect(off).toMatchObject({ ok: false, status: 422, code: "voucher.not-postable" });
    expect(off.ok === false && off.issues?.length).toBeGreaterThan(0);
    expect(
      guardPostVoucher({ actor: nina }, { lines: balanced, date: "2025-06-30", rules: { periods } }),
    ).toMatchObject({
      ok: false,
      code: "voucher.not-postable",
    });
  });

  it("lets only a person with the right to adjust post into a soft-closed period, never an agent", () => {
    const into = { lines: balanced, date: "2026-09-30", rules: { periods } };
    expect(guardPostVoucher({ actor: nina }, into).ok).toBe(false);
    expect(guardPostVoucher({ actor: { ...ola, roles: ["controller", "accountant"] } }, into).ok).toBe(true);
    expect(guardPostVoucher({ actor: bookkeeper }, into).ok).toBe(false);
  });

  it("keeps a person's decisions with people, even when the agent holds the role", () => {
    const chain: ApprovalLevel[] = [{ id: "leader", name: "Leder", approvers: [{ id: "kari" }, { id: "bookkeeper" }] }];
    const request: ApprovalRequest = { id: "si-1", amountMinor: 1_550_000, requesterId: "nina", decisions: [] };
    const byAgent = guardDecideApproval(
      { actor: bookkeeper },
      { chain, request, decision: "approved", at: "2026-10-31T10:00:00Z" },
    );
    expect(byAgent).toMatchObject({ ok: false, status: 403, code: "server.person-only" });
    expect(byAgent.ok === false && byAgent.message).toMatch(/person's decision/);

    const byKari = guardDecideApproval(
      { actor: kari },
      { chain, request, decision: "approved", at: "2026-10-31T10:00:00Z" },
    );
    expect(byKari.ok && byKari.value.decisions[0]?.approverId).toBe("kari");
  });

  it("refuses to finalize a credit note in a different currency from the original", () => {
    const original = finalizeInvoice(
      {
        id: "invoice",
        kind: "invoice",
        status: "draft",
        currency: "NOK",
        lines: [
          { id: "line", description: "Item", quantityMilli: 1000, unitPriceMinor: 100, taxCategory: "Z", taxRateBp: 0 },
        ],
      },
      "1001",
    );
    const invoice = { ...draftCreditNote(original, "credit"), currency: "USD" };
    const result = guardFinalizeInvoice(
      { actor: nina, locale: "nb" },
      {
        invoice,
        number: "2001",
        others: [original],
      },
    );
    expect(result).toMatchObject({ ok: false, status: 422, code: "invoice.not-ready" });
    expect(result.ok === false && result.issues).toEqual([
      expect.stringContaining("Kreditnota credit er i USD. Den må bruke NOK"),
    ]);
  });

  it("separates approving from releasing, and needs the approvals to be current", () => {
    const draft: PaymentBatch = {
      id: "pb-1",
      status: "draft",
      debitAccount: "1503.12.34567",
      valueDate: "2026-11-02",
      currency: "NOK",
      preparedBy: "nina",
      items: [
        { id: "p1", creditorName: "Kontorrekvisita AS", amountMinor: 1_550_000, creditorAccount: "1234.56.78903" },
      ],
      approvals: [],
    };
    const approved = approveBatch(approveBatch(draft, "kari", "2026-11-01T09:00:00Z"), "ola", "2026-11-01T09:05:00Z");
    expect(guardReleasePayments({ actor: ola }, { batch: approved })).toMatchObject({
      ok: false,
      status: 403,
      code: "permissions.duty",
    });
    const lena: ServerActor = { id: "lena", kind: "person", roles: ["controller"] };
    expect(guardReleasePayments({ actor: lena }, { batch: approved })).toMatchObject({
      ok: true,
      value: { status: "released" },
    });
    expect(guardReleasePayments({ actor: lena }, { batch: draft })).toMatchObject({ ok: false, status: 422 });
    expect(guardReleasePayments({ actor: bookkeeper }, { batch: approved })).toMatchObject({
      code: "server.person-only",
    });
  });

  it("closes a period only when every task is done and signed, and answers in Norwegian", () => {
    const tasks: CloseTask[] = [
      { id: "bank", title: "Avstem banken", status: "done", doneBy: "nina", needsSignOff: true },
      { id: "vat", title: "Mva", status: "signed", doneBy: "nina", signedBy: "ola" },
    ];
    const verdict = guardClosePeriod({ actor: ola, locale: "nb" }, { tasks });
    expect(verdict).toMatchObject({ ok: false, status: 409 });
    expect(verdict.ok === false && verdict.message).toMatch(/[æøå]|ikke|venter/i);
  });

  it("turns a verdict into an HTTP answer, and works for actions of your own", () => {
    const roles = [{ id: "clerk", name: "Clerk", permissions: ["note.write"] }];
    const verdict = guard({ actor: { id: "x", kind: "person", roles: ["clerk"] }, roles }, "note.write", () => "saved");
    expect(toHttp(verdict)).toEqual({ status: 200, body: { ok: true, actor: "x", value: "saved" } });
    const refused = toHttp(
      guard({ actor: { id: "y", kind: "person", roles: [] }, roles }, "note.write", () => "saved"),
    );
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ ok: false, code: "permissions.denied" });
  });

  it("types the body, so it can be mapped to an app's own error shape", () => {
    const roles = [{ id: "clerk", name: "Clerk", permissions: ["note.write"] }];
    const { status, body } = toHttp(
      guard({ actor: { id: "y", kind: "person", roles: [] }, roles }, "note.write", () => "saved"),
    );
    const mapped = body.ok ? { value: body.value } : { error: body.message, code: body.code, issues: body.issues };
    expect(status).toBe(403);
    expect(mapped).toMatchObject({ code: "permissions.denied" });
  });

  it("does not send a person-only refusal to the roles the agent itself holds", () => {
    const roles = [
      { id: "partner", name: "Partner", permissions: ["finding.raise", "audit.sign-off"] },
      { id: "agent", name: "Agent", permissions: ["finding.raise", "audit.sign-off"] },
    ];
    const actor: ServerActor = { id: "bookkeeper", roles: ["agent"], kind: "agent", onBehalfOf: "p1" };
    const personOf = () => ({ id: "p1", roles: ["partner"] });
    const en = guard({ actor, roles, personOf }, "audit.sign-off", () => true);
    expect(en).toMatchObject({ ok: false, code: "server.person-only" });
    expect(en.ok === false && en.message).toMatch(/roles: Partner\.$/);
    const nb = guard({ actor, roles, personOf, locale: "nb" }, "audit.sign-off", () => true);
    expect(nb.ok === false && nb.message).toMatch(/rollene: Partner\.$/);
    expect(nb.ok === false && nb.message).not.toMatch(/Agent/);
  });

  it("names the able roles in a person-only refusal when the agent holds all of them", () => {
    // A role shared by an agent and a person is still who to ask: not "none defined".
    const actor: ServerActor = { id: "bot", kind: "agent", roles: ["manager", "controller"] };
    const refused = guard({ actor }, "supplier-invoice.approve", () => true);
    expect(refused).toMatchObject({ ok: false, status: 403, code: "server.person-only" });
    expect(refused.ok === false && refused.message).toMatch(/Manager/);
    expect(refused.ok === false && refused.message).not.toMatch(/none defined/);
    expect(guard({ actor: kari }, "supplier-invoice.approve", () => true)).toMatchObject({ ok: true });
  });
});

describe("audit engagements", () => {
  // Roles per engagement: partner on one, quality reviewer on another.
  const tone: ServerActor = { id: "tone", kind: "person", roles: [], scopes: { o1: ["partner"], o2: ["eqcr"] } };
  const assistant: ServerActor = {
    id: "assistant",
    kind: "agent",
    roles: ["partner"],
    onBehalfOf: "tone",
    clientId: "mcp:claude",
    grantId: "g-17",
  };

  it("counts the roles held in the engagement the request is for", () => {
    expect(guard({ actor: tone, scope: "o1" }, "audit.conclude", () => "ok")).toMatchObject({ ok: true });
    const elsewhere = guard({ actor: tone, scope: "o2" }, "audit.conclude", () => "ok");
    expect(elsewhere).toMatchObject({ ok: false, status: 403, code: "permissions.denied" });
  });

  it("keeps reviewing, concluding, the quality review and freezing with people", () => {
    for (const permission of ["audit.review", "audit.conclude", "audit.eqcr", "audit.freeze"]) {
      expect(guard({ actor: assistant }, permission, () => "ok")).toMatchObject({
        ok: false,
        status: 403,
        code: "server.person-only",
      });
    }
  });

  it("refuses the preparer as reviewer, and anyone who worked on it as quality reviewer", () => {
    const both: ServerActor = { id: "per", kind: "person", roles: ["auditor", "eqcr"] };
    const review = guard(
      { actor: both, deeds: [{ actorId: "per", permission: "audit.prepare" }] },
      "audit.review",
      () => "ok",
    );
    expect(review).toMatchObject({ ok: false, status: 403, code: "permissions.duty" });
    const eqcr = guard(
      { actor: both, deeds: [{ actorId: "per", permission: "audit.review" }] },
      "audit.eqcr",
      () => "ok",
    );
    expect(eqcr).toMatchObject({ ok: false, status: 403, message: expect.stringMatching(/quality reviewer/) });
  });

  it("requires a reason when one is asked for, in the caller's language", () => {
    const thin = guard(
      { actor: tone, scope: "o1", minReason: 20, reason: "feil", locale: "nb" },
      "audit.sign-off",
      () => "ok",
    );
    expect(thin).toMatchObject({
      ok: false,
      status: 422,
      code: "server.reason-required",
      message: expect.stringMatching(/minst 20 tegn/),
    });
    const given = guard(
      { actor: tone, scope: "o1", minReason: 20, reason: "Signert på feil versjon av arbeidspapiret" },
      "audit.sign-off",
      () => "ok",
    );
    expect(given).toMatchObject({ ok: true });
  });

  it("advise: who may act still refuses, what the books say comes back as warnings", () => {
    const warned = advise({ actor: tone, scope: "o1" }, "audit.conclude", () => {
      throw new BookiError("close.not-ready", { issues: ["Two actions are not done"] });
    });
    expect(warned).toEqual({ ok: true, value: undefined, actor: "tone", warnings: ["Two actions are not done"] });
    expect(advise({ actor: assistant }, "audit.conclude", () => "ok")).toMatchObject({
      ok: false,
      code: "server.person-only",
    });
    expect(advise({ actor: tone, scope: "o1" }, "audit.conclude", () => 42)).toEqual({
      ok: true,
      value: 42,
      actor: "tone",
      warnings: [],
    });
  });

  it("actorRecord keeps whose session, which client and which grant", () => {
    expect(actorRecord(assistant)).toEqual({
      actor: "agent:assistant",
      kind: "agent",
      onBehalfOf: "tone",
      clientId: "mcp:claude",
      grantId: "g-17",
    });
    expect(actorRecord(tone)).toEqual({ actor: "tone", kind: "person" });
  });
});

describe("an agent never does more than the person it acts for", () => {
  const people: Record<string, ServerActor> = { nina, kari, ola };
  const personOf = (id: string) => people[id];
  const agent: ServerActor = { id: "bookkeeper", kind: "agent", roles: ["accountant"], onBehalfOf: "kari" };
  const post = (context: Parameters<typeof guard>[0]) => guard(context, "voucher.post", () => "posted");

  it("refuses what the person may not do, and names who may", () => {
    const verdict = post({ actor: agent, personOf });
    expect(verdict).toMatchObject({ ok: false, status: 403, code: "server.delegation" });
    expect(verdict.ok === false && verdict.message).toContain("Accountant");
    expect(verdict.ok === false && verdict.message).toContain("kari");
  });

  it("allows what both may do", () => {
    expect(post({ actor: { ...agent, onBehalfOf: "nina" }, personOf })).toMatchObject({ ok: true });
  });

  it("does not let the person's roles add to the agent's", () => {
    const own: ServerActor = { ...agent, roles: [], onBehalfOf: "nina" };
    expect(post({ actor: own, personOf })).toMatchObject({ ok: false, code: "permissions.denied" });
  });

  it("refuses a person it does not know, or a lookup that answers someone else", () => {
    const gone: ServerActor = { ...agent, onBehalfOf: "left-the-company" };
    expect(post({ actor: gone, personOf })).toMatchObject({ status: 403, code: "server.delegation-unknown" });
    expect(post({ actor: agent, personOf: () => nina })).toMatchObject({ code: "server.delegation-unknown" });
    expect(post({ actor: { ...agent, onBehalfOf: "" }, personOf })).toMatchObject({
      code: "server.delegation-unknown",
    });
  });

  it("refuses a company the person does not work in", () => {
    const limited = () => ({ ...nina, entities: ["nordlys"] });
    const actor: ServerActor = { ...agent, onBehalfOf: "nina" };
    expect(post({ actor, personOf: limited, entity: "fjord" })).toMatchObject({ code: "server.delegation-entity" });
    expect(post({ actor, personOf: limited, entity: "nordlys" })).toMatchObject({ ok: true });
  });

  it("counts the person's roles in the scope named", () => {
    const scoped = () => ({ ...kari, scopes: { "case-1": ["accountant"] } });
    expect(post({ actor: agent, personOf: scoped, scope: "case-1" })).toMatchObject({ ok: true });
    expect(post({ actor: agent, personOf: scoped, scope: "case-2" })).toMatchObject({ code: "server.delegation" });
  });

  it("leaves what the company's own rule gives the agent, and a person's own calls", () => {
    expect(post({ actor: agent, personOf, agentOwn: ["voucher.post"] })).toMatchObject({ ok: true });
    expect(post({ actor: nina, personOf: () => undefined })).toMatchObject({ ok: true });
  });

  it("says it in Norwegian too", () => {
    const verdict = post({ actor: agent, personOf, locale: "nb" });
    expect(verdict.ok === false && verdict.message).toContain("arbeider for");
  });
});

describe("signing a document is a person's, at every level", () => {
  const auditor: ServerActor = { id: "per", name: "Per", kind: "person", roles: ["auditor"] };
  const partner: ServerActor = { id: "lise", kind: "person", roles: ["partner"] };
  const robot: ServerActor = { id: "auditbot", kind: "agent", roles: ["auditor", "partner"], onBehalfOf: "per" };
  const document = {
    id: "05.3",
    version: 4,
    saveState: "saved" as const,
    openPoints: [],
    signatures: [],
  };
  const at = "2026-11-23T09:00:00Z";

  it("signs for a person who holds the permission, and records their name", () => {
    const verdict = guardSignDocument({ actor: auditor }, { document, level: "performed", at });
    expect(verdict).toMatchObject({ ok: true, actor: "per" });
    expect(verdict.ok && verdict.value.signatures[0]).toMatchObject({ level: "performed", by: "per", byName: "Per" });
  });

  it("refuses while points are open when the company blocks it, with 422 and the code", () => {
    const open = { ...document, openPoints: ["Bekreftelse fra bank mangler"] };
    const blocked = guardSignDocument(
      { actor: auditor },
      { document: open, level: "performed", at, blockOpenPoints: true },
    );
    expect(blocked).toMatchObject({ ok: false, status: 422, code: "signoff.open-points" });
    // Without the rule the same signature goes through, with the points.
    expect(guardSignDocument({ actor: auditor }, { document: open, level: "performed", at })).toMatchObject({
      ok: true,
    });
  });

  it("answers the open-points refusal in Norwegian", () => {
    const open = { ...document, openPoints: ["Bekreftelse fra bank mangler"] };
    const verdict = guardSignDocument(
      { actor: auditor, locale: "nb" },
      { document: open, level: "performed", at, blockOpenPoints: true },
    );
    expect(verdict).toMatchObject({ ok: false, code: "signoff.open-points" });
    expect(verdict.ok === false && verdict.message).toContain("åpne punkter");
  });

  it("refuses an agent at every level, even when its roles hold the permission", () => {
    const performed = guardSignDocument({ actor: robot }, { document, level: "performed", at });
    expect(performed).toMatchObject({ ok: false, status: 403, code: "server.person-only" });

    const signedPerformed = {
      ...document,
      signatures: [{ level: "performed" as const, by: "per", at, version: 4, openPoints: [] }],
    };
    const reviewed = guardSignDocument({ actor: robot }, { document: signedPerformed, level: "reviewed", at });
    expect(reviewed).toMatchObject({ ok: false, status: 403, code: "server.person-only" });

    const approved = guardSignDocument({ actor: robot }, { document, level: "approved", at });
    expect(approved).toMatchObject({ ok: false, status: 403, code: "server.person-only" });
  });

  it("refuses when no one is signed in", () => {
    expect(guardSignDocument({}, { document, level: "performed", at })).toMatchObject({ ok: false, status: 401 });
  });

  it("lets a partner sign the approval, never an agent", () => {
    const signedReview = {
      ...document,
      signatures: [
        { level: "performed" as const, by: "per", at, version: 4, openPoints: [] },
        { level: "reviewed" as const, by: "kari", at, version: 4, openPoints: [] },
      ],
    };
    expect(guardSignDocument({ actor: partner }, { document: signedReview, level: "approved", at })).toMatchObject({
      ok: true,
    });
  });
});

describe("the specification", () => {
  it("lists every decision that stays with a person, as PERSON_ONLY does", async () => {
    const { readFileSync } = await import("node:fs");
    const { PERSON_ONLY } = await import("./server.js");
    const spec = readFileSync(new URL("../../../spec/agent-contract.md", import.meta.url), "utf8");
    const section = spec.slice(spec.indexOf("## 5."), spec.indexOf("## 6."));
    const listed = [...section.matchAll(/^\s*\| `([a-z.-]+)` \|/gm)].map((m) => m[1]).sort();
    expect(listed).toEqual([...PERSON_ONLY].sort());
  });
});

describe("a delegation refusal", () => {
  it("names the roles a person could hold, not the agent's own", () => {
    const roles = [
      { id: "accountant", name: "Accountant", permissions: ["payment.prepare"] },
      { id: "bookkeeping-agent", name: "Bookkeeping agent", permissions: ["payment.prepare"] },
      { id: "manager", name: "Manager", permissions: [] },
    ];
    const agent: ServerActor = { id: "bk", kind: "agent", roles: ["bookkeeping-agent"], onBehalfOf: "kari" };
    const verdict = guard(
      { actor: agent, roles, personOf: () => ({ id: "kari", roles: ["manager"] }) },
      "payment.prepare",
      () => true,
    );
    expect(verdict.ok === false && verdict.message).toContain("Accountant");
    expect(verdict.ok === false && verdict.message).not.toContain("Bookkeeping agent");
  });
});
