import { describe, expect, it } from "vitest";
import {
  CONFIDENTIAL_MARKER,
  assertConfirmable,
  confirmFinding,
  createFinding,
  editFinding,
  findingIssues,
  linkSource,
  redactFinding,
  reopenFinding,
  setBasis,
  withdrawFinding,
  type Finding,
} from "./findings.js";
import { localize } from "./messages.js";
import { PERSON_ONLY, guardConfirmFinding, type ServerActor } from "./server.js";
import { STANDARD_ROLES, can } from "./permissions.js";

const AT = "2026-03-02T09:00:00Z";
const LATER = "2026-03-03T09:00:00Z";

const draft = (over: Partial<Parameters<typeof createFinding>[0]> = {}): Finding =>
  createFinding(
    {
      id: "F-1",
      title: "Revenue cut-off",
      category: "misstatement",
      basis: "documented",
      amountMinor: 125_000_00,
      currency: "nok",
      ...over,
    },
    "agent",
    AT,
  );

describe("findings", () => {
  it("raises a draft with the log started", () => {
    const finding = draft({ sources: ["E1", "E1", " "] });
    expect(finding).toMatchObject({
      status: "draft",
      currency: "NOK",
      sources: ["E1"],
      confidential: false,
      raisedBy: "agent",
    });
    expect(finding.log).toEqual([{ at: AT, by: "agent", action: "raised" }]);
    expect(() => draft({ category: "typo" as never })).toThrow(
      /Categories: misstatement, control-deficiency, compliance, other/,
    );
    expect(() => draft({ basis: "rumour" as never })).toThrow(/Bases: documented, reported, hypothesis/);
    expect(() => draft({ amountMinor: 12.5 })).toThrow(/whole number of minor units/);
    expect(() => draft({ title: " " })).toThrow(/title cannot be empty/);
    expect(() => createFinding({ ...draft(), id: "F-2" }, " ", AT)).toThrow(/needs the id of who made it/);
  });

  it("edits, links and sets the basis of a draft only, appending to the log", () => {
    let finding = editFinding(draft(), { title: "Revenue cut-off, December" }, "kari", LATER);
    finding = linkSource(finding, "E7", "agent", LATER);
    finding = setBasis(finding, "reported", "agent", LATER);
    expect(finding.log.map((line) => line.action)).toEqual(["raised", "edited", "source-linked", "edited"]);
    expect(finding.log[3]?.note).toBe("basis: documented → reported");
    expect(editFinding(finding, { title: finding.title }, "kari", LATER)).toBe(finding);
    expect(() => linkSource(finding, "E7", "agent", LATER)).toThrow(/already cites "E7"/);
    expect(() => editFinding(finding, { status: "confirmed" } as never, "kari", LATER)).toThrow(
      /no field "status".*Fields: title/,
    );
    const confirmed = confirmFinding(finding, "per", LATER);
    expect(() => editFinding(confirmed, { title: "x" }, "kari", LATER)).toThrow(/is confirmed and cannot be changed/);
    expect(() => linkSource(confirmed, "E8", "agent", LATER)).toThrow(/Only a draft can/);
    expect(() => setBasis(confirmed, "documented", "agent", LATER)).toThrow(/Only a draft can/);
  });

  it("warns, never blocks: confirming goes through with issues", () => {
    const weak = draft({ basis: "documented", amountMinor: 500_00, currency: undefined });
    const issues = findingIssues(weak);
    expect(issues).toEqual([
      'Finding "F-1" is marked documented but cites no evidence. Link a source or change the basis.',
      'Finding "F-1" has an amount but no currency.',
    ]);
    expect(() => assertConfirmable(weak)).toThrow(/is not ready to confirm: Finding "F-1" is marked documented/);
    const confirmed = confirmFinding(weak, "per", LATER);
    expect(confirmed).toMatchObject({ status: "confirmed", confirmedBy: "per" });
    expect(findingIssues(confirmFinding(draft({ basis: "hypothesis" }), "per", LATER))[0]).toMatch(
      /is confirmed but rests on a hypothesis/,
    );
    expect(findingIssues(draft({ amountMinor: undefined }))).toContain(
      'Finding "F-1" is a misstatement without an amount (minor units).',
    );
    expect(() => assertConfirmable(linkSource(draft(), "E1", "agent", AT))).not.toThrow();
    for (const issue of issues) expect(localize(issue, "nb")).toMatch(/^Funnet "F-1"/);
  });

  it("withdraws only with a reason of 20 characters or more, and reopens", () => {
    const finding = confirmFinding(linkSource(draft(), "E1", "agent", AT), "per", LATER);
    expect(() => withdrawFinding(finding, "per", LATER, "Wrong.")).toThrow(/at least 20 characters, got 6/);
    expect(() => withdrawFinding(finding, "per", LATER, "                         x")).toThrow(/got 1/);
    const withdrawn = withdrawFinding(finding, "per", LATER, "Client posted the credit note in January.");
    expect(withdrawn).toMatchObject({
      status: "withdrawn",
      withdrawnBy: "per",
      withdrawReason: "Client posted the credit note in January.",
    });
    expect(() => withdrawFinding(withdrawn, "per", LATER, "Client posted the credit note in January.")).toThrow(
      /already withdrawn by "per"/,
    );
    const reopened = reopenFinding(withdrawn, "per", LATER);
    expect(reopened.status).toBe("draft");
    expect(reopened.withdrawReason).toBeUndefined();
    expect(reopened.confirmedBy).toBeUndefined();
    expect(reopened.log.map((line) => line.action)).toEqual([
      "raised",
      "source-linked",
      "confirmed",
      "withdrawn",
      "reopened",
    ]);
    expect(() => reopenFinding(reopened, "per", LATER)).toThrow(/nothing to reopen/);
    expect(
      localize(
        new Error(
          'Withdrawing finding "F-1" needs a reason of at least 20 characters, got 6. It is kept with the file.',
        ),
        "nb",
      ),
    ).toMatch(/minst 20 tegn/);
  });

  it("redacts a confidential finding for agents", () => {
    const secret = withdrawFinding(
      linkSource(
        draft({ confidential: true, code: "F-03", description: "Suspected kickbacks to the purchasing manager." }),
        "E9",
        "kari",
        AT,
      ),
      "per",
      LATER,
      "Moved to a separate investigation file.",
    );
    const shown = redactFinding(secret);
    expect(shown).toEqual({
      id: "F-1",
      code: "F-03",
      title: CONFIDENTIAL_MARKER,
      description: CONFIDENTIAL_MARKER,
      category: "misstatement",
      status: "withdrawn",
      basis: "documented",
      confidential: true,
      raisedBy: "agent",
      withdrawnBy: "per",
      sourceCount: 1,
      logCount: 3,
    });
    expect(JSON.stringify(shown)).not.toMatch(/cut-off|kickbacks|E9|investigation|125000/);
    const open = redactFinding(draft());
    expect(open).toMatchObject({ title: "Revenue cut-off", amountMinor: 125_000_00, sourceCount: 0, logCount: 1 });
  });

  it("keeps confirming and withdrawing with people, and gives the roles their parts", () => {
    expect(PERSON_ONLY).toEqual(expect.arrayContaining(["finding.confirm", "finding.withdraw"]));
    const partner: ServerActor = { id: "per", kind: "person", roles: ["partner"] };
    const staff: ServerActor = { id: "kari", kind: "person", roles: ["auditor"] };
    const agent: ServerActor = { id: "assistant", kind: "agent", roles: ["partner"], onBehalfOf: "per" };
    expect(can(staff, STANDARD_ROLES, "finding.raise")).toBe(true);
    expect(can(staff, STANDARD_ROLES, "finding.confirm")).toBe(false);
    expect(guardConfirmFinding({ actor: partner }, { finding: draft(), at: LATER })).toMatchObject({
      ok: true,
      actor: "per",
      value: { status: "confirmed", confirmedBy: "per" },
    });
    expect(guardConfirmFinding({ actor: agent }, { finding: draft(), at: LATER })).toMatchObject({
      ok: false,
      status: 403,
      code: "server.person-only",
    });
    expect(guardConfirmFinding({ actor: staff }, { finding: draft(), at: LATER })).toMatchObject({
      ok: false,
      status: 403,
      code: "permissions.denied",
    });
    expect(
      guardConfirmFinding({ actor: partner }, { finding: confirmFinding(draft(), "per", AT), at: LATER }),
    ).toMatchObject({ ok: false, code: "finding.not-draft" });
  });
});
