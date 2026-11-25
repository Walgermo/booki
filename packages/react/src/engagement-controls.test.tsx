import type { ClientRequest } from "@booki-aui/core/client-request";
import type { Finding } from "@booki-aui/core/findings";
import { mount } from "@ui-sdk/core/testing";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { BookiAccessProvider } from "./access.js";
import { AuditFindings, auditFindings } from "./audit-findings.js";
import { createBookiAgent } from "./booki-agent.js";
import { ClientRequests, clientRequests } from "./client-requests.js";
import { BookiLocaleProvider } from "./locale.js";

afterEach(() => cleanup());

type Result = { ok: boolean; value?: unknown; error?: { message: string } };

function setup(component: string, ref: string, ui: ReactElement, country: "US" | "NO" = "US") {
  const agent = createBookiAgent({ agentId: "test" });
  const heard: unknown[] = [];
  agent.subscribe((event) => heard.push(event));
  render(<BookiLocaleProvider defaultCountry={country}>{ui}</BookiLocaleProvider>);
  const entry = () => agent.snapshot().find((c) => c.component === component) as unknown as Record<string, any>;
  const act = (action: string, args: unknown[] = []) =>
    agent.act({ steps: [{ ref, action, args }] }) as Promise<Result>;
  const button = (name: string) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === name || b.textContent === name,
    )!;
  const field = (name: string) => document.querySelector(`textarea[aria-label="${name}"]`) as HTMLTextAreaElement;
  const alert = () => document.querySelector('[role="alert"]')?.textContent ?? "";
  return { agent, heard, entry, act, button, field, alert };
}

const AT = "2026-03-02T09:00:00Z";
const finding = (over: Partial<Finding>): Finding => ({
  id: "F-1",
  title: "Revenue cut-off",
  category: "misstatement",
  status: "draft",
  basis: "documented",
  sources: [],
  confidential: false,
  raisedBy: "kari",
  amountMinor: 84_000_00,
  currency: "USD",
  log: [{ at: AT, by: "kari", action: "raised" }],
  ...over,
});
const SECRET = "Suspected side payments to a purchasing officer";
const findings: Finding[] = [
  finding({}),
  finding({
    id: "F-2",
    code: "F-02",
    title: SECRET,
    description: "Tip received through the whistleblowing channel.",
    basis: "reported",
    confidential: true,
    amountMinor: 230_000_00,
  }),
];
const evidence = [
  { id: "E1", label: "Sales ledger Dec" },
  { id: "E2", label: "Delivery notes Jan" },
];
const LEAK = /side payments|whistleblowing|23000000|purchasing officer/;

describe("AuditFindings", () => {
  const ui = (actor = "per") => <AuditFindings defaultFindings={findings} evidence={evidence} actor={actor} />;

  it("lets an agent draft, edit, cite and set the basis, but not confirm or withdraw", async () => {
    const { entry, act } = setup("audit-findings", "Audit findings", ui());
    expect(entry().actions).toEqual(["draftFinding", "editFinding", "linkSource", "setBasis", "assertConfirmable"]);
    expect(entry().findingFormat).toMatch(/draftFinding\(/);
    expect(entry().issues["F-1"][0]).toMatch(/marked documented but cites no evidence/);

    const drafted = await act("draftFinding", [
      { title: "Unrecorded liability", category: "misstatement", basis: "hypothesis", amountMinor: 12_000_00 },
    ]);
    expect(drafted.ok).toBe(true);
    expect(entry().register[2]).toMatchObject({
      id: "F-3",
      status: "draft",
      basis: "hypothesis",
      currency: "USD",
      raisedBy: "agent",
    });
    expect(
      (await act("draftFinding", [{ title: "x", category: "misstatement", basis: "documented", severity: "high" }]))
        .error?.message,
    ).toMatch(/no field "severity"\. Fields: title, category, basis/);

    expect(
      (await act("editFinding", ["F-3", { description: "Invoice 4471 from February, for December work." }])).ok,
    ).toBe(true);
    expect((await act("linkSource", ["F-1", "E9"])).error?.message).toMatch(
      /No evidence "E9" to cite\. Evidence: E1, E2/,
    );
    expect((await act("linkSource", ["F-1", "E1"])).ok).toBe(true);
    expect((await act("setBasis", ["F-3", "documented"])).ok).toBe(true);
    expect((await act("assertConfirmable", ["F-3"])).error?.message).toMatch(
      /not ready to confirm: Finding "F-3" is marked documented/,
    );
    expect((await act("assertConfirmable", ["F-1"])).ok).toBe(true);

    for (const action of ["confirm", "withdraw", "reopen"]) {
      expect((await act(action, ["F-1"])).ok, action).toBe(false);
    }
    expect(entry().register[0].status).toBe("draft");
    expect(entry().register[0].log.map((line: { action: string }) => line.action)).toEqual(["raised", "source-linked"]);
  });

  it("never lets a confidential finding's text reach the snapshot or agent.subscribe", async () => {
    const { entry, act, heard, button, field } = setup("audit-findings", "Audit findings", ui());
    expect(document.body.textContent).toContain(SECRET);
    expect(entry().register[1]).toMatchObject({
      id: "F-2",
      code: "F-02",
      title: "[confidential]",
      description: "[confidential]",
      sourceCount: 0,
    });
    expect(JSON.stringify(entry())).not.toMatch(LEAK);
    expect((await act("editFinding", ["F-2", { title: "Changed" }])).error?.message).toMatch(
      /is confidential: an agent cannot change it/,
    );
    expect((await act("linkSource", ["F-2", "E1"])).ok).toBe(false);
    // A person's work on it reaches the bridge redacted too.
    fireEvent.click(button("Confirm: F-02"));
    fireEvent.change(field("Reason for withdrawing: F-02"), {
      target: { value: "Moved to a separate investigation file." },
    });
    fireEvent.click(button("Withdraw: F-02"));
    await act("editFinding", ["F-1", { title: "Revenue cut-off, December" }]);
    expect(entry().register[1]).toMatchObject({ status: "withdrawn", withdrawnBy: "per" });
    expect(heard.length).toBeGreaterThan(2);
    expect(JSON.stringify(heard)).not.toMatch(LEAK);
    expect(JSON.stringify(heard)).not.toMatch(/investigation file/);
    expect(JSON.stringify(entry())).not.toMatch(/investigation file/);
  });

  it("refuses a withdrawal without a reason of 20 characters", () => {
    const { entry, button, field, alert } = setup("audit-findings", "Audit findings", ui());
    fireEvent.change(field("Reason for withdrawing: F-1"), { target: { value: "Not needed." } });
    fireEvent.click(button("Withdraw: F-1"));
    expect(alert()).toMatch(/at least 20 characters, got 11/);
    expect(entry().register[0].status).toBe("draft");
    fireEvent.change(field("Reason for withdrawing: F-1"), {
      target: { value: "Credit note posted 3 January covers it." },
    });
    fireEvent.click(button("Withdraw: F-1"));
    expect(alert()).toBe("");
    expect(entry().register[0]).toMatchObject({
      status: "withdrawn",
      withdrawReason: "Credit note posted 3 January covers it.",
    });
    fireEvent.click(button("Reopen: F-1"));
    expect(entry().register[0].status).toBe("draft");
  });

  it("shows the refusal in Norwegian and refuses a role that may not confirm", async () => {
    render(
      <BookiLocaleProvider defaultCountry="NO">
        <BookiAccessProvider actor={{ id: "kari", roles: ["auditor"] }}>
          <AuditFindings defaultFindings={findings} />
        </BookiAccessProvider>
      </BookiLocaleProvider>,
    );
    const confirm = [...document.querySelectorAll("button")].find(
      (b) => b.getAttribute("aria-label") === "Bekreft: F-1",
    )!;
    expect(confirm.getAttribute("data-agent-confirm")).toBeTruthy();
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(document.querySelector('[role="alert"]')?.textContent).toMatch(
        /"kari" har ikke lov til "finding.confirm".*Partner/,
      ),
    );
  });

  it("reports a person's click as the source of the change (ui-sdk mount)", async () => {
    const view = mount(
      auditFindings,
      { defaultFindings: findings, actor: "per" },
      `<root><confirm value="F-1#confirm">Confirm</confirm></root>`,
    );
    try {
      await view.click(view.part("confirm", "F-1#confirm")!);
      expect((view.state.findings as Finding[])[0]).toMatchObject({ status: "confirmed", confirmedBy: "per" });
      expect(view.changes.at(-1)).toMatchObject({ key: "findingsShown", reason: "confirm-finding", source: "mouse" });
      expect(JSON.stringify(view.changes)).not.toMatch(LEAK);
    } finally {
      view.unmount();
    }
  });
});

const EMAIL = "ingrid.fjell@example.test";
const request = (over: Partial<ClientRequest>): ClientRequest => ({
  id: "R-1",
  title: "Bank confirmations at year end",
  area: "Cash",
  status: "draft",
  dueDate: "2026-03-10",
  reminders: 0,
  createdBy: "kari",
  recipient: { name: "Ingrid Fjell", email: EMAIL, role: "CFO" },
  ...over,
});
const requests: ClientRequest[] = [
  request({}),
  request({
    id: "R-2",
    title: "Payroll reconciliation",
    area: "Payroll",
    status: "sent",
    sentBy: "kari",
    sentAt: AT,
    dueDate: "2026-03-05",
  }),
];

describe("ClientRequests", () => {
  const ui = () => <ClientRequests defaultRequests={requests} today="2026-03-08" actor="kari" />;

  it("lets an agent draft and record an answer, but not send, remind or judge", async () => {
    const { entry, act } = setup("client-requests", "Client requests", ui());
    expect(entry().actions).toEqual(["draftRequest", "editRequest", "recordAnswer", "assertAnswered"]);
    expect(entry().overdue).toEqual(["R-2"]);
    expect(entry().requestFormat).toMatch(/draftRequest\(/);
    const drafted = await act("draftRequest", [
      {
        title: "Lease contracts",
        recipientName: "Ola Berg",
        recipientEmail: "ola.berg@example.test",
        dueDate: "2026-03-20",
      },
    ]);
    expect(drafted.ok).toBe(true);
    expect(entry().tracker[2]).toEqual(
      expect.objectContaining({ id: "R-3", status: "draft", recipient: { name: "Ola Berg" } }),
    );
    expect(
      (await act("draftRequest", [{ title: "x", recipientName: "A", recipientEmail: "a@b.test", to: "x" }])).error
        ?.message,
    ).toMatch(/no field "to"\. Fields: title, recipientName, recipientEmail/);
    expect((await act("editRequest", ["R-3", { dueDate: "20.03.2026" }])).error?.message).toMatch(/YYYY-MM-DD/);
    expect((await act("editRequest", ["R-3", { area: "Leases" }])).ok).toBe(true);
    expect((await act("assertAnswered", ["R-2"])).error?.message).toMatch(/no answer from the client/);
    expect((await act("recordAnswer", ["R-1", "Attached."])).error?.message).toMatch(/not waiting for the client/);
    expect((await act("recordAnswer", ["R-2", "Reconciliation for December attached."])).ok).toBe(true);
    expect((await act("assertAnswered", ["R-2"])).ok).toBe(true);
    for (const action of ["send", "remind", "accept", "reject"]) {
      expect((await act(action, ["R-2"])).ok, action).toBe(false);
    }
    expect(entry().tracker[0].status).toBe("draft");
    expect(entry().tracker[1].status).toBe("answered");
  });

  it("never lets a recipient's email reach the snapshot or agent.subscribe", async () => {
    const { entry, act, heard, button } = setup("client-requests", "Client requests", ui());
    expect(document.body.textContent).toContain(EMAIL);
    expect(entry().tracker[0].recipient).toEqual({ name: "Ingrid Fjell", role: "CFO" });
    expect(JSON.stringify(entry())).not.toContain("@");
    fireEvent.click(button("Send: Bank confirmations at year end"));
    fireEvent.click(button("Remind: Payroll reconciliation"));
    await act("recordAnswer", ["R-2", "Attached."]);
    await act("editRequest", ["R-1", { title: "Bank confirmations" }]);
    expect(entry().tracker[0]).toMatchObject({ status: "sent", sentBy: "kari" });
    expect(entry().tracker[1]).toMatchObject({ status: "answered", reminders: 1 });
    expect(heard.length).toBeGreaterThan(2);
    expect(JSON.stringify(heard)).not.toContain(EMAIL);
    expect(JSON.stringify(entry())).not.toContain(EMAIL);
  });

  it("needs a reason to reject an answer, then waits for the client again", async () => {
    const answered = [
      request({ status: "answered", sentBy: "kari", sentAt: AT, answer: "One confirmation attached.", answeredAt: AT }),
    ];
    const { entry, button, field, alert } = setup(
      "client-requests",
      "Client requests",
      <ClientRequests defaultRequests={answered} today="2026-03-08" actor="kari" />,
    );
    fireEvent.click(button("Reject answer: Bank confirmations at year end"));
    expect(alert()).toMatch(/needs a reason/);
    fireEvent.change(field("What is missing: Bank confirmations at year end"), {
      target: { value: "The second bank is missing." },
    });
    fireEvent.click(button("Reject answer: Bank confirmations at year end"));
    expect(entry().tracker[0]).toMatchObject({
      status: "rejected",
      decidedBy: "kari",
      rejectReason: "The second bank is missing.",
    });
    expect(button("Remind: Bank confirmations at year end")).toBeDefined();
  });

  it("reports a person's click as the source of the change (ui-sdk mount)", async () => {
    const view = mount(
      clientRequests,
      { defaultRequests: requests, actor: "kari", today: "2026-03-08" },
      `<root><send value="R-1#send">Send</send></root>`,
    );
    try {
      await view.click(view.part("send", "R-1#send")!);
      expect((view.state.requests as ClientRequest[])[0]).toMatchObject({ status: "sent", sentBy: "kari" });
      expect(view.changes.at(-1)).toMatchObject({ key: "requestsShown", reason: "send-request", source: "mouse" });
      expect(JSON.stringify(view.changes)).not.toContain(EMAIL);
    } finally {
      view.unmount();
    }
  });
});
