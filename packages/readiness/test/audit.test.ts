import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { audit, type Report } from "../src/audit.js";
import type { RuleId } from "../src/rules.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => path.join(here, "fixtures", `${name}.html`);

const cache = new Map<string, Promise<Report>>();
const run = (name: string) => {
  if (!cache.has(name)) cache.set(name, audit(fixture(name), { wait: 50 }));
  return cache.get(name)!;
};

/** How many findings of each rule, so a test can say "these and nothing else". */
function tally(report: Report): Partial<Record<RuleId, number>> {
  const out: Partial<Record<RuleId, number>> = {};
  for (const f of report.findings) out[f.rule] = (out[f.rule] ?? 0) + 1;
  return out;
}

describe("readiness checks on fixture pages", () => {
  it("finds nothing on a page that does everything right", async () => {
    const report = await run("clean");
    expect(report.findings).toEqual([]);
    expect(report.score).toBe(100);
    expect(report.grade).toBe("ready");
    expect(report.bridge).toMatchObject({ source: "window.agent", components: 1, actions: 1 });
  });

  it("finds unnamed, broken and shared field names", async () => {
    const report = await run("fields");
    expect(tally(report)).toEqual({ "field-unnamed": 3, "field-broken-name": 1, "field-ambiguous": 1 });
    const unnamed = report.findings.filter((f) => f.rule === "field-unnamed").map((f) => f.element?.role);
    expect(unnamed.sort()).toEqual(["combobox", "listbox", "textbox"]);
    const amount = report.findings.find((f) => f.rule === "field-unnamed" && f.element?.role === "textbox")!;
    expect(amount.element?.context).toBe("Beløp (NOK)");
    expect(amount.booki).toBe("AmountField");
    const shared = report.findings.find((f) => f.rule === "field-ambiguous")!;
    expect(shared).toMatchObject({ count: 2, element: { name: "Debet" } });
    expect(report.findings.find((f) => f.rule === "field-broken-name")?.element?.name).toBe(
      "[object Object] (Ikke valgt)",
    );
  });

  it("finds buttons named by an icon font or not at all", async () => {
    const report = await run("buttons");
    expect(tally(report)).toEqual({ "button-icon-name": 3, "button-unnamed": 1 });
    const names = report.findings.filter((f) => f.rule === "button-icon-name").map((f) => f.element?.name);
    expect(names).toEqual(["close", "content_copy", "tune"]);
  });

  it("finds charts whose figures are only in pixels", async () => {
    const report = await run("charts");
    expect(tally(report)).toEqual({ "chart-pixels-only": 3 });
    const kinds = report.findings.map((f) => `${f.element?.role}:${f.element?.name}`);
    expect(kinds).toEqual(["canvas:", "application:", "canvas:Inntekt"]);
    expect(report.metrics.charts).toBe(5);
  });

  it("finds irreversible buttons without a confirmation mark", async () => {
    const report = await run("irreversible");
    expect(tally(report)).toEqual({ "irreversible-ungated": 2 });
    expect(report.findings.map((f) => f.element?.name)).toEqual(["Bokfør", "Godkjenn betaling"]);
  });

  it("finds account numbers, IBANs and KIDs the agent can read, and nothing else", async () => {
    const report = await run("secrets");
    expect(tally(report)).toEqual({ "secret-visible": 3 });
    const messages = report.findings.map((f) => f.message).join("\n");
    expect(messages).toMatch(/Bank account number 12•+03/);
    expect(messages).toMatch(/IBAN NO•+47/);
    expect(messages).toMatch(/Payment reference \(KID\) 10•+42/);
    // The values themselves never reach the report.
    expect(JSON.stringify(report.findings)).not.toContain("78903");
    expect(JSON.stringify(report.findings)).not.toContain("10012342");
  });

  it("finds focusable cells and divs that are not controls", async () => {
    const report = await run("focusable");
    expect(tally(report)).toEqual({ "focusable-without-role": 2 });
    expect(report.findings.map((f) => f.element?.context)).toEqual(["Debet", "Beløp"]);
  });

  it("reports a page with no bridge", async () => {
    const report = await run("no-bridge");
    expect(tally(report)).toEqual({ "bridge-missing": 1 });
    expect(report.bridge.source).toBeNull();
    expect(report.score).toBe(75);
  });

  it("finds unnamed bridge controls, person-only actions and secrets in the bridge snapshot", async () => {
    const report = await run("bridge-problems");
    expect(tally(report)).toEqual({ "bridge-unnamed-control": 1, "bridge-person-action": 1, "secret-visible": 1 });
    expect(report.findings.find((f) => f.rule === "bridge-person-action")?.message).toContain('"approve"');
    expect(report.bridge).toMatchObject({ components: 3, named: 2, actions: 4 });
  });

  it("counts WebMCP tools as a bridge", async () => {
    const report = await run("webmcp");
    expect(report.findings).toEqual([]);
    expect(report.bridge.webmcpTools).toEqual(["post_voucher"]);
  });

  it("reports a large snapshot as a cost", async () => {
    const report = await run("large");
    expect(tally(report)).toEqual({ "snapshot-size": 1 });
    expect(report.metrics.snapshotTokens).toBeGreaterThan(6_000);
    expect(report.metrics.snapshotTokens).toBe(Math.ceil(report.metrics.snapshotChars / 4));
  });
});
