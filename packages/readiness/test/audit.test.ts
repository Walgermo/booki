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

  it("does not call an empty bridge on a page with no form ready", async () => {
    const report = await run("empty-bridge");
    expect(report.bridge.components).toBe(0);
    expect(report.measured).toBe(false);
    expect(report.grade).toBe("not measured");
    expect(report.notMeasured).toMatch(/check\(page\)/);
    const { toConsole } = await import("../src/report.js");
    expect(toConsole(report)).toMatch(/no score/);
  });

  it("does not pass an empty bridge on a page with fields of its own", async () => {
    const report = await run("empty-bridge-fields");
    expect(report.bridge.components).toBe(0);
    expect(report.measured).toBe(true);
    expect(tally(report)).toEqual({ "bridge-missing": 1, "field-not-on-bridge": 3 });
    expect(report.score).toBeLessThan(100);
  });

  it("does not pass an empty WebMCP snapshot tool on a page with fields of its own", async () => {
    const report = await run("empty-webmcp-fields");
    expect(report.bridge.source).toBe("webmcp");
    expect(report.bridge.components).toBe(0);
    expect(tally(report)["field-not-on-bridge"]).toBe(2);
    expect(report.score).toBeLessThan(100);
  });

  it("does not compare fields with a WebMCP snapshot it cannot read as a list", async () => {
    const report = await run("webmcp-text-snapshot");
    expect(report.bridge.source).toBe("webmcp");
    expect(tally(report)).toEqual({});
    expect(report.score).toBe(100);
  });

  it("skips read-only fields when comparing with an empty bridge", async () => {
    // Read-only input and textarea, a field in an aria-readonly grid: no one can change them.
    // A read-only checkbox still toggles, and the plain Notat field is editable.
    const report = await run("empty-bridge-readonly");
    expect(tally(report)).toEqual({ "bridge-missing": 1, "field-not-on-bridge": 2 });
    expect(
      report.findings
        .filter((f) => f.rule === "field-not-on-bridge")
        .map((f) => f.element?.name)
        .sort(),
    ).toEqual(["Godkjent", "Notat"]);
  });

  it("measures a page with focusable cells and an ungated button but no fields", async () => {
    const report = await run("grid-no-fields");
    expect(report.metrics.fields).toBe(0);
    expect(tally(report)).toEqual({ "bridge-missing": 1, "focusable-without-role": 2, "irreversible-ungated": 1 });
    expect(report.measured).toBe(true);
    expect(report.grade).not.toBe("not measured");
  });

  it("measures a page whose only bridge is WebMCP tools of its own", async () => {
    const report = await run("webmcp-only-tools");
    expect(report.findings).toEqual([]);
    expect(report.measured).toBe(true);
    expect(report.score).toBe(100);
    expect(report.grade).toBe("ready");
  });

  it("still scores a page with fields but no bridge", async () => {
    const report = await run("no-bridge");
    expect(report.measured).toBe(true);
    expect(report.grade).not.toBe("not measured");
    expect(report.notMeasured).toBeUndefined();
  });

  it("measures a page whose bridge has controls", async () => {
    expect((await run("clean")).measured).toBe(true);
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

  it("skips the hidden inputs UI libraries put beside custom controls, and reports a visible unnamed one", async () => {
    const report = await run("hidden-inputs");
    // Base UI / Radix hidden inputs (aria-hidden, tabindex -1, visually hidden),
    // inert, type="hidden" and display:none inputs are not fields anyone reaches.
    expect(tally(report)).toEqual({ "field-unnamed": 1 });
    const visible = report.findings[0]!;
    expect(visible.element).toMatchObject({ role: "textbox", context: "Referanse" });
    expect(visible.element?.html).toBe('<input type="text">');
    expect(report.score).toBe(95);
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

  it("finds a named field a person can use that the bridge does not offer", async () => {
    const report = await run("bridge-coverage");
    // Konto and Retning are on the bridge by label, the line inputs sit inside the
    // voucher-composer's root under names of their own, Bokføringsdato sits in a
    // financial-date part (no root part rendered), and the data-agent-hidden field
    // is kept from the agent on purpose. Only the Avdeling filter is missing.
    expect(tally(report)).toEqual({ "field-not-on-bridge": 1 });
    expect(report.findings[0]).toMatchObject({
      rule: "field-not-on-bridge",
      element: { role: "combobox", name: "Avdeling" },
    });
    expect(report.findings[0]!.message).toContain('"Avdeling"');
    expect(report.score).toBe(95);
  });

  it("finds nothing once that field is on the bridge", async () => {
    const report = await run("bridge-coverage-covered");
    expect(report.findings).toEqual([]);
    expect(report.score).toBe(100);
  });

  it("reports an uncovered radio group once, skips disabled fields, and matches extra roots by label", async () => {
    const report = await run("bridge-coverage-radios");
    expect(tally(report)).toEqual({ "field-not-on-bridge": 2 });
    expect(report.findings.map((f) => `${f.element?.role}:${f.element?.name}`)).toEqual([
      "radiogroup:Retning",
      "textbox:Prosjekt nr",
    ]);
  });

  it("does not check bridge coverage without a bridge snapshot", async () => {
    // No bridge: reported as such, not field by field.
    expect((await run("no-bridge")).findings.some((f) => f.rule === "field-not-on-bridge")).toBe(false);
    // WebMCP tools of the page's own but no snapshot to compare against.
    expect((await run("webmcp")).findings.some((f) => f.rule === "field-not-on-bridge")).toBe(false);
  });

  it("lists each WebMCP tool once when a page registers it again", async () => {
    const report = await run("webmcp-reregistered");
    expect(report.bridge.webmcpTools).toEqual(["snapshot", "act", "query", "post_voucher"]);
    expect(report.bridge).toMatchObject({ source: "webmcp", components: 1 });
    expect(report.findings).toEqual([]);
  });

  it("keeps a tool whose older registration's signal aborts after a newer one", async () => {
    const report = await run("webmcp-reused-tool");
    expect(report.bridge.webmcpTools).toEqual(["snapshot"]);
    expect(report.bridge).toMatchObject({ source: "webmcp", components: 1 });
  });

  it("reports a large snapshot as a cost", async () => {
    const report = await run("large");
    expect(tally(report)).toEqual({ "snapshot-size": 1 });
    expect(report.metrics.snapshotTokens).toBeGreaterThan(6_000);
    expect(report.metrics.snapshotTokens).toBe(Math.ceil(report.metrics.snapshotChars / 4));
  });
});

describe("a page that sends the browser on", () => {
  it("measures where it landed, and says so", async () => {
    const report = await audit(fixture("redirects"), { wait: 50 });
    expect(report.redirectedFrom).toMatch(/redirects\.html$/);
    expect(report.url).toMatch(/clean\.html$/);
    const { toConsole } = await import("../src/report.js");
    expect(toConsole(report)).toMatch(/--storage-state/);
  });

  it("does not flag the page it was asked for", async () => {
    expect((await run("clean")).redirectedFrom).toBeUndefined();
  });
});
