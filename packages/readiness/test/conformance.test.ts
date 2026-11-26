import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  CONFORMANCE_CHECKS,
  formatConformance,
  runConformance,
  type ConformanceReport,
  type ConformanceTarget,
} from "../src/conformance/index.js";
import { createReference, type Reference } from "../src/reference/index.js";

const SECRET = "86011117947";
const SPEC = new URL("../../../spec/agent-contract.md", import.meta.url);

type Bridge = Reference["bridge"];
type Step = { ref: string; action: string; args?: unknown[] };

// A target for the reference, with the bank account set so the secret check means something.
function referenceTarget(): { ref: Reference; target: ConformanceTarget } {
  const ref = createReference();
  ref.bridge.act({ steps: [{ ref: "Bank account", action: "setAccount", args: [SECRET] }] });
  const target: ConformanceTarget = {
    bridge: ref.bridge,
    drive: { ref: "Amount", action: "setMinor", args: [155000] },
    secrets: [SECRET],
    closedList: { step: { ref: "Account", action: "setAccount", args: ["9999"] }, valid: ["1920", "6800"] },
    personOnly: [{ ref: "Approval", action: "approve" }],
    server: (actor, permission) => ref.server(actor, permission),
  };
  return { ref, target };
}

const statusOf = (report: ConformanceReport, id: string) => report.checks.find((c) => c.id === id)?.status;

// The reference bridge with the parts a broken variant changes overridden.
function broken(ref: Reference, overrides: Partial<Bridge>): Bridge {
  return { ...ref.bridge, ...overrides };
}

describe("conformance: the reference", () => {
  it("conforms with every check run", async () => {
    const { target } = referenceTarget();
    const report = await runConformance(target);
    expect(report.conforms).toBe(true);
    expect(report.failed).toBe(0);
    expect(report.skipped).toBe(0);
    expect(report.checks).toHaveLength(12);
  });

  it("skips the checks that need extra input when only the bridge is given", async () => {
    const { target } = referenceTarget();
    const report = await runConformance({ bridge: target.bridge });
    expect(report.conforms).toBe(true);
    const skipped = report.checks.filter((c) => c.status === "skip").map((c) => c.id);
    expect(skipped.sort()).toEqual(["closed-list", "recording-agent", "server-person-only", "server-unsigned"]);
    expect(statusOf(report, "person-only-not-offered")).toBe("pass");
    expect(report.checks.find((c) => c.id === "person-only-not-offered")?.message).toContain("skipped");
  });

  it("returns an incomplete result until the screen has mounted controls", async () => {
    const { ref } = referenceTarget();
    const report = await runConformance({ bridge: broken(ref, { snapshot: () => [] }) });
    expect(report.conforms).toBe(false);
    expect(statusOf(report, "bridge-shape")).toBe("skip");
    expect(formatConformance(report)).toMatch(/Incomplete conformance check/);
  });

  it("formats one line per check and a summary with the skipped count", async () => {
    const { target } = referenceTarget();
    const text = formatConformance(await runConformance({ bridge: target.bridge }));
    const lines = text.split("\n");
    expect(lines).toHaveLength(13);
    expect(lines[0]).toMatch(/^PASS  §2  bridge-shape  /);
    expect(lines.at(-1)).toMatch(/4 skipped/);
  });
});

describe("conformance: valid variants", () => {
  it("accepts approveUnderRule, the canonical rule-bound action, as not person-only", async () => {
    const { ref, target } = referenceTarget();
    const bridge = broken(ref, {
      snapshot: () =>
        ref.bridge
          .snapshot()
          .map((c) => (c.ref === "Approval" ? { ...c, actions: [...c.actions, "approveUnderRule"] } : c)),
    });
    const report = await runConformance({ ...target, bridge });
    expect(statusOf(report, "person-only-not-offered")).toBe("pass");
  });

  it("does not read an amount in minor units as a bank account", async () => {
    const ref = createReference();
    expect(ref.bridge.act({ steps: [{ ref: "Amount", action: "setMinor", args: [Number(SECRET)] }] }).ok).toBe(true);
    const report = await runConformance({ bridge: ref.bridge });
    expect(statusOf(report, "snapshot-secrets")).toBe("pass");
  });

  it("accepts a date control's ISO value beside its formatted text", async () => {
    const { ref, target } = referenceTarget();
    const bridge = broken(ref, {
      snapshot: () => [
        ...ref.bridge.snapshot(),
        {
          ref: "Due",
          component: "financial-date",
          label: "Due",
          actions: [],
          value: "2026-11-23",
          formatted: "23.11.2026",
        },
        { ref: "Lines", component: "voucher-composer", label: "Lines", actions: [], lines: [{ debitMinor: 1250 }] },
      ],
    });
    const report = await runConformance({ ...target, bridge });
    expect(statusOf(report, "snapshot-values")).toBe("pass");
  });

  it("accepts a drive step that records one attributed event per change", async () => {
    const { ref, target } = referenceTarget();
    const bridge = broken(ref, {
      subscribe: (listener) =>
        ref.bridge.subscribe((event) => {
          listener(event);
          if (event.source === "agent") listener({ ...event, ref: "Total" });
        }),
    });
    const report = await runConformance({ ...target, bridge });
    expect(statusOf(report, "recording-agent")).toBe("pass");
  });
});

describe("conformance: broken variants", () => {
  it("fails snapshot-secrets when the snapshot leaks the bank account", async () => {
    const { ref, target } = referenceTarget();
    const bridge = broken(ref, {
      snapshot: () => ref.bridge.snapshot().map((c) => (c.ref === "Bank account" ? { ...c, account: SECRET } : c)),
    });
    const report = await runConformance({ ...target, bridge });
    expect(statusOf(report, "snapshot-secrets")).toBe("fail");
    expect(report.conforms).toBe(false);
  });

  it("fails act-never-throws when act throws", async () => {
    const { ref, target } = referenceTarget();
    const bridge = broken(ref, {
      act: () => {
        throw new Error("boom");
      },
    });
    const report = await runConformance({ ...target, bridge });
    expect(statusOf(report, "act-never-throws")).toBe("fail");
    expect(report.conforms).toBe(false);
  });

  it("fails amount-minor-only when setMinor accepts 12.5", async () => {
    const { ref, target } = referenceTarget();
    const bridge = broken(ref, {
      act: (input) => {
        const step = input.steps[0] as Step;
        if (step.action === "setMinor" && step.args?.[0] === 12.5) return { ok: true };
        return ref.bridge.act(input);
      },
    });
    const report = await runConformance({ ...target, bridge });
    expect(statusOf(report, "amount-minor-only")).toBe("fail");
    expect(report.conforms).toBe(false);
  });

  it("fails person-only-not-offered when an agent is offered approve", async () => {
    const { ref, target } = referenceTarget();
    const bridge = broken(ref, {
      snapshot: () =>
        ref.bridge.snapshot().map((c) => (c.ref === "Approval" ? { ...c, actions: [...c.actions, "approve"] } : c)),
    });
    const report = await runConformance({ ...target, bridge });
    expect(statusOf(report, "person-only-not-offered")).toBe("fail");
    expect(report.conforms).toBe(false);
  });

  it("fails snapshot-named when a component has an empty label", async () => {
    const { ref, target } = referenceTarget();
    const bridge = broken(ref, {
      snapshot: () => ref.bridge.snapshot().map((c, i) => (i === 0 ? { ...c, label: "" } : c)),
    });
    const report = await runConformance({ ...target, bridge });
    expect(statusOf(report, "snapshot-named")).toBe("fail");
    expect(report.conforms).toBe(false);
  });

  it("fails recording-agent when the event names a person for an agent step", async () => {
    const { ref, target } = referenceTarget();
    const bridge = broken(ref, {
      subscribe: (listener) => ref.bridge.subscribe((event) => listener({ ...event, actor: "anna" })),
    });
    const report = await runConformance({ ...target, bridge });
    expect(statusOf(report, "recording-agent")).toBe("fail");
    expect(report.conforms).toBe(false);
  });

  it("fails server-person-only when the server accepts payment.release from an agent", async () => {
    const { ref, target } = referenceTarget();
    const server: ConformanceTarget["server"] = (actor, permission) =>
      permission === "payment.release" && actor?.kind === "agent" ? { status: 200 } : ref.server(actor, permission);
    const report = await runConformance({ ...target, server });
    expect(statusOf(report, "server-person-only")).toBe("fail");
    expect(report.checks.find((c) => c.id === "server-person-only")?.message).toContain("payment.release");
    expect(report.conforms).toBe(false);
  });

  it("fails server-person-only when only roles refuse an agent that holds the granting role", async () => {
    const { target } = referenceTarget();
    // Checks that the actor holds `controller`, never what kind of actor it is.
    const server: ConformanceTarget["server"] = (actor) =>
      actor === null ? { status: 401 } : actor.roles.includes("controller") ? { status: 200 } : { status: 403 };
    const report = await runConformance({ ...target, server, serverActor: () => ({ id: "c", roles: ["controller"] }) });
    expect(statusOf(report, "server-person-only")).toBe("fail");
    expect(report.conforms).toBe(false);
    // Without fixtures that grant the permission, a 403 proves nothing: not a pass.
    const unproven = await runConformance({ ...target, server });
    expect(statusOf(unproven, "server-person-only")).toBe("skip");
    expect(unproven.checks.find((c) => c.id === "server-person-only")?.message).toContain("serverActor");
  });

  it("fails snapshot-values on fractional minor units in a list and a display date as a date control's value", async () => {
    const { ref, target } = referenceTarget();
    const bridge = broken(ref, {
      snapshot: () => [
        ...ref.bridge.snapshot(),
        { ref: "Lines", component: "voucher-composer", label: "Lines", actions: [], lines: [{ debitMinor: 12.5 }] },
        { ref: "Due", component: "financial-date", label: "Due", actions: [], value: "23.11.2026", formatted: "" },
      ],
    });
    const report = await runConformance({ ...target, bridge });
    expect(statusOf(report, "snapshot-values")).toBe("fail");
    const message = report.checks.find((c) => c.id === "snapshot-values")?.message ?? "";
    expect(message).toContain("Lines.lines[0].debitMinor=12.5");
    expect(message).toContain('Due.value="23.11.2026"');
  });

  it("checks an extracted invoice field by the value it holds", async () => {
    const { ref, target } = referenceTarget();
    const inbox = (netMinor: unknown, invoiceDate: unknown) => ({
      ref: "Inbox",
      component: "supplier-invoice-inbox",
      label: "Inbox",
      actions: [],
      invoices: [{ id: "si-1", fields: { netMinor, invoiceDate } }],
    });
    const valid = broken(ref, {
      snapshot: () => [
        ...ref.bridge.snapshot(),
        inbox({ value: 1240000, confidence: 0.97 }, { value: "2026-10-12", confidence: 0.96 }),
      ],
    });
    expect(statusOf(await runConformance({ ...target, bridge: valid }), "snapshot-values")).toBe("pass");

    const malformed = broken(ref, {
      snapshot: () => [
        ...ref.bridge.snapshot(),
        inbox({ value: 12400.5, confidence: 0.97 }, { value: "12.10.2026", confidence: 0.96 }),
      ],
    });
    const report = await runConformance({ ...target, bridge: malformed });
    expect(statusOf(report, "snapshot-values")).toBe("fail");
    const message = report.checks.find((c) => c.id === "snapshot-values")?.message ?? "";
    expect(message).toContain("Inbox.invoices[0].fields.netMinor.value=12400.5");
    expect(message).toContain('Inbox.invoices[0].fields.invoiceDate.value="12.10.2026"');
  });

  it("fails only the SHOULD check when an unsigned request gets 200", async () => {
    const { ref, target } = referenceTarget();
    const server: ConformanceTarget["server"] = (actor, permission) =>
      actor === null ? { status: 200 } : ref.server(actor, permission);
    const report = await runConformance({ ...target, server });
    expect(statusOf(report, "server-unsigned")).toBe("fail");
    expect(report.conforms).toBe(true);
  });

  it("fails closed-list when the refusal does not name the valid accounts", async () => {
    const { ref, target } = referenceTarget();
    const bridge = broken(ref, {
      act: (input) => {
        const step = input.steps[0] as Step;
        if (step.ref === "Account" && step.action === "setAccount" && step.args?.[0] === "9999") {
          return { ok: false, error: { message: "Unknown account." } };
        }
        return ref.bridge.act(input);
      },
    });
    const report = await runConformance({ ...target, bridge });
    expect(statusOf(report, "closed-list")).toBe("fail");
    expect(report.conforms).toBe(false);
  });

  it("formats a failing variant with FAIL", async () => {
    const { ref, target } = referenceTarget();
    const bridge = broken(ref, {
      act: () => {
        throw new Error("boom");
      },
    });
    const text = formatConformance(await runConformance({ ...target, bridge }));
    expect(text).toContain("FAIL  §4.5  act-never-throws");
    expect(text).toMatch(/Does not conform .*failed/);
  });
});

describe("conformance: the check list", () => {
  it("has unique ids", () => {
    const ids = CONFORMANCE_CHECKS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names only sections that are headings in the spec", () => {
    const spec = readFileSync(SPEC, "utf8");
    const headings = new Set([...spec.matchAll(/^## (\d+)\./gm)].map((m) => m[1]));
    for (const check of CONFORMANCE_CHECKS) {
      const major = check.section.split(".")[0];
      expect(headings.has(major), `${check.id} cites §${check.section}`).toBe(true);
    }
  });
});
