import { describe, expect, it, vi } from "vitest";
import { bookiAllow, bookiRegisterTools, type AgentDecisionRow } from "./agent-policy.js";
import { personOnly } from "./person-only.js";

const release = personOnly("Releasing payments needs a person (test)");
const step = (more: object = {}) => ({
  ref: "c1",
  component: "payment-batch",
  label: "Payment batch",
  action: "press",
  args: ["Release"] as unknown[],
  ...more,
});
const context = () => ({ signal: new AbortController().signal });

describe("bookiAllow", () => {
  it("adds nothing when the app gave nothing", () => {
    expect(bookiAllow({})).toBeUndefined();
  });

  it("refuses a person's decision whatever the app answers, and records it", async () => {
    const rows: AgentDecisionRow[] = [];
    const allow = vi.fn(() => true);
    const decide = bookiAllow({ allow, audit: (row) => rows.push(row), agentId: "bookkeeper" })!;
    await expect(decide(step({ confirm: release }), context())).rejects.toThrow(/person/);
    expect(allow).not.toHaveBeenCalled();
    expect(rows).toEqual([expect.objectContaining({ actor: "agent:bookkeeper", action: "agent.person-only" })]);
  });

  it("records who confirmed a marked step, and who refused one", async () => {
    const rows: AgentDecisionRow[] = [];
    const audit = (row: AgentDecisionRow) => rows.push(row);
    const marked = step({ confirm: "Post the voucher" });
    expect(await bookiAllow({ allow: () => ({ allow: true, by: "nina" }), audit })!(marked, context())).toBe(true);
    expect(await bookiAllow({ allow: () => ({ allow: false, by: "nina" }), audit })!(marked, context())).toBe(false);
    expect(await bookiAllow({ allow: () => false, audit })!(step(), context())).toBe(false);
    expect(rows.map((row) => [row.action, row.decidedBy])).toEqual([
      ["agent.confirmed", "nina"],
      ["agent.refused", "nina"],
      ["agent.refused", undefined],
    ]);
  });

  it("says nothing about an unmarked step that ran, and never records arguments", async () => {
    const rows: AgentDecisionRow[] = [];
    const audit = (row: AgentDecisionRow) => rows.push(row);
    expect(await bookiAllow({ allow: () => true, audit })!(step(), context())).toBe(true);
    expect(rows).toEqual([]);
    await bookiAllow({ allow: () => false, audit })!(step({ args: ["86011117947"] }), context());
    expect(JSON.stringify(rows)).not.toContain("86011117947");
  });

  it("with audit and no allow, refuses marked steps the way the bridge does, and runs the rest", async () => {
    const rows: AgentDecisionRow[] = [];
    const decide = bookiAllow({ audit: (row) => rows.push(row) })!;
    expect(await decide(step(), context())).toBe(true);
    await expect(decide(step({ confirm: "Post the voucher" }), context())).rejects.toThrow(/Needs a person/);
    expect(rows).toHaveLength(1);
  });

  it("records a step nobody answered, and drops an answer that comes too late", async () => {
    const rows: AgentDecisionRow[] = [];
    const controller = new AbortController();
    let answer!: (yes: boolean) => void;
    const decide = bookiAllow({
      allow: () => new Promise<boolean>((resolve) => (answer = resolve)),
      audit: (row) => rows.push(row),
    })!;
    const waiting = decide(step({ confirm: "Post the voucher" }), { signal: controller.signal });
    controller.abort();
    answer(true);
    expect(await waiting).toBe(false);
    expect(rows.map((row) => row.action)).toEqual(["agent.cancelled"]);
  });

  it("does not run a step it could not record", async () => {
    const decide = bookiAllow({
      allow: () => true,
      audit: () => {
        throw new Error("audit store is down");
      },
    })!;
    await expect(decide(step({ confirm: "Post the voucher" }), context())).rejects.toThrow("audit store is down");
  });

  it("takes only a true answer for yes", async () => {
    for (const odd of [1, "yes", {}, { allow: "yes" }, null, undefined]) {
      expect(await bookiAllow({ allow: () => odd as never })!(step(), context())).toBe(false);
    }
  });
});

describe("bookiRegisterTools", () => {
  it("keeps a person's decision from the browser's own agent", async () => {
    let given!: (s: ReturnType<typeof step>, c: { signal: AbortSignal }) => boolean | Promise<boolean>;
    const register = bookiRegisterTools((_agent: object, options) => {
      given = options.allow as never;
      return () => {};
    });
    register({}, { allow: () => true });
    expect(await given(step(), context())).toBe(true);
    await expect(Promise.resolve(given(step({ confirm: release }), context()))).rejects.toThrow(/person/);
  });

  it("leaves the bridge to refuse a missing allow", () => {
    const register = bookiRegisterTools(() => {
      throw new Error("needs an allow");
    });
    expect(() => register({}, {} as never)).toThrow("needs an allow");
  });
});
