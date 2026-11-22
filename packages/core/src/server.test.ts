import { describe, expect, it } from "vitest";
import type { ApprovalLevel, ApprovalRequest } from "./approval.js";
import type { CloseTask } from "./close.js";
import { approveBatch, type PaymentBatch } from "./payment-batch.js";
import { BookiError } from "./msg.js";
import {
  actorRecord,
  advise,
  guard,
  guardClosePeriod,
  guardDecideApproval,
  guardPostVoucher,
  guardReleasePayments,
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
