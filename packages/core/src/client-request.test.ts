import { describe, expect, it } from "vitest";
import {
  acceptAnswer,
  assertAnswered,
  createRequest,
  editRequest,
  overdue,
  recordAnswer,
  redactRequest,
  rejectAnswer,
  remind,
  requestIssues,
  sendRequest,
  type ClientRequest,
} from "./client-request.js";
import { localize } from "./messages.js";
import { STANDARD_ROLES, can } from "./permissions.js";
import { PERSON_ONLY, guard, type ServerActor } from "./server.js";

const AT = "2026-03-02T09:00:00Z";
const recipient = { name: "Ingrid Fjell", email: "ingrid@example.test", role: "CFO" };
const draft = (over: Partial<Parameters<typeof createRequest>[0]> = {}): ClientRequest =>
  createRequest(
    { id: "R-1", title: "Bank confirmations at year end", recipient, dueDate: "2026-03-10", area: "Cash", ...over },
    "agent",
  );

describe("client requests", () => {
  it("drafts a request and checks what it is given", () => {
    expect(draft()).toEqual({
      id: "R-1",
      title: "Bank confirmations at year end",
      area: "Cash",
      status: "draft",
      recipient,
      dueDate: "2026-03-10",
      reminders: 0,
      createdBy: "agent",
    });
    expect(() => draft({ recipient: { ...recipient, email: "ingrid at example" } })).toThrow(/not a valid address/);
    // The refusal does not repeat the address.
    expect(() => draft({ recipient: { ...recipient, email: "ingrid@nowhere" } })).not.toThrow(/ingrid@nowhere/);
    expect(() => draft({ dueDate: "2026-02-30" })).toThrow(/YYYY-MM-DD, got "2026-02-30"/);
    expect(() => draft({ title: "" })).toThrow(/title cannot be empty/);
    expect(() => createRequest({ ...draft(), id: "R-2" }, "")).toThrow(/Drafting a client request needs the id/);
  });

  it("edits a draft only", () => {
    const edited = editRequest(draft(), {
      title: "Bank confirmations",
      recipient: { role: "Controller" },
      dueDate: "",
    });
    expect(edited).toMatchObject({
      title: "Bank confirmations",
      recipient: { name: "Ingrid Fjell", email: recipient.email, role: "Controller" },
    });
    expect(edited.dueDate).toBeUndefined();
    expect(() => editRequest(draft(), { status: "sent" } as never)).toThrow(
      /no field "status" can be edited\. Fields: title, area, dueDate, recipient/,
    );
    expect(() => editRequest(sendRequest(draft(), "kari", AT), { title: "x" })).toThrow(
      /Only a draft can be changed or sent/,
    );
  });

  it("goes draft → sent → answered → rejected → answered → accepted", () => {
    const sent = sendRequest(draft(), "kari", AT);
    expect(sent).toMatchObject({ status: "sent", sentBy: "kari", sentAt: AT });
    expect(() => sendRequest(sent, "kari", AT)).toThrow(/is sent\. Only a draft/);
    expect(() => assertAnswered(sent)).toThrow(/no answer from the client/);
    expect(() => recordAnswer(sent, " ", AT)).toThrow(/answer cannot be empty/);
    const answered = recordAnswer(sent, "Confirmations from both banks attached.", "2026-03-08T12:00:00Z");
    expect(() => assertAnswered(answered)).not.toThrow();
    expect(requestIssues(answered)).toEqual([
      'Request "R-1" is answered; a person judges whether the answer is enough.',
    ]);
    expect(() => rejectAnswer(answered, "kari", " ")).toThrow(/needs a reason/);
    const rejected = rejectAnswer(answered, "kari", "Only one bank's confirmation is attached.");
    expect(rejected).toMatchObject({
      status: "rejected",
      decidedBy: "kari",
      rejectReason: "Only one bank's confirmation is attached.",
    });
    expect(() => acceptAnswer(rejected, "kari")).toThrow(/Only an answered request can be judged/);
    const again = recordAnswer(rejected, "Second confirmation attached.", "2026-03-09T12:00:00Z");
    expect(again.rejectReason).toBeUndefined();
    expect(acceptAnswer(again, "kari")).toMatchObject({ status: "accepted", decidedBy: "kari" });
  });

  it("reminds while waiting and lists what is overdue", () => {
    const sent = sendRequest(draft(), "kari", AT);
    const reminded = remind(remind(sent, "kari", "2026-03-11T08:00:00Z"), "kari", "2026-03-12T08:00:00Z");
    expect(reminded).toMatchObject({ reminders: 2, remindedAt: "2026-03-12T08:00:00Z" });
    expect(() => remind(draft(), "kari", AT)).toThrow(
      /is draft, so it is not waiting|is et utkast|not waiting for the client/,
    );
    const requests = [
      reminded,
      { ...draft(), id: "R-2" },
      { ...sent, id: "R-3", dueDate: "2026-04-01" },
      { ...sent, id: "R-4", dueDate: undefined },
    ];
    expect(overdue(requests, "2026-03-11")).toEqual(["R-1"]);
    expect(requestIssues(reminded, "2026-03-11")).toEqual([
      'Request "R-1" was due 2026-03-10 and is still waiting for the client.',
    ]);
    expect(requestIssues(requests[3]!)).toEqual(['Request "R-4" has no due date.']);
    expect(localize(requestIssues(reminded, "2026-03-11")[0], "nb")).toBe(
      'Forespørselen "R-1" hadde frist 2026-03-10 og venter fortsatt på klienten.',
    );
  });

  it("keeps the email out of what an agent reads", () => {
    const shown = redactRequest(draft());
    expect(shown.recipient).toEqual({ name: "Ingrid Fjell", role: "CFO" });
    expect(JSON.stringify(shown)).not.toContain("@");
  });

  it("keeps sending and judging with people", () => {
    expect(PERSON_ONLY).toEqual(expect.arrayContaining(["request.send", "request.decide"]));
    expect(PERSON_ONLY).not.toContain("request.draft");
    const agent: ServerActor = { id: "assistant", kind: "agent", roles: ["auditor"] };
    const kari: ServerActor = { id: "kari", kind: "person", roles: ["auditor"] };
    expect(guard({ actor: agent }, "request.draft", () => draft())).toMatchObject({ ok: true });
    expect(guard({ actor: agent }, "request.send", () => sendRequest(draft(), agent.id, AT))).toMatchObject({
      ok: false,
      code: "server.person-only",
    });
    expect(guard({ actor: kari }, "request.send", () => sendRequest(draft(), kari.id, AT))).toMatchObject({
      ok: true,
      value: { status: "sent" },
    });
    expect(can(kari, STANDARD_ROLES, "request.decide")).toBe(true);
  });
});
