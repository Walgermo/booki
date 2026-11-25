import { describe, expect, it } from "vitest";

import { IRREVERSIBLE, looksLikeIconName, samePage } from "../src/audit.js";
import { toHtml, toJson } from "../src/report.js";
import { RULES } from "../src/rules.js";
import { score } from "../src/score.js";
import { findSecrets, isIban, isKid, isKontonummer, isRoutingNumber } from "../src/secrets.js";
import { estimateTokens, parseSnapshot } from "../src/snapshot.js";

describe("parseSnapshot", () => {
  it("reads roles, names, refs, flags and values, including quoted lines", () => {
    const nodes = parseSnapshot(
      [
        "- main [ref=e3]:",
        '  - textbox "Bilagsdato *" [ref=e10]',
        "  - listbox [ref=e23] [cursor=pointer]:",
        '  - checkbox "Bokfør ved lagring" [checked] [ref=e51]',
        "  - 'img \"Utvikling: nov. 2025 398 200,00 kr\" [ref=e15]'",
        '  - textbox "KID" [ref=e7]: "10012342"',
        "  - text: Bilagsdato *",
      ].join("\n"),
    );
    expect(nodes.map((n) => [n.role, n.name, n.ref])).toEqual([
      ["main", "", "e3"],
      ["textbox", "Bilagsdato *", "e10"],
      ["listbox", "", "e23"],
      ["checkbox", "Bokfør ved lagring", "e51"],
      ["img", "Utvikling: nov. 2025 398 200,00 kr", "e15"],
      ["textbox", "KID", "e7"],
    ]);
    expect(nodes[3]!.flags).toEqual(["checked"]);
    expect(nodes[5]!.value).toBe("10012342");
  });

  it("estimates tokens as characters ÷ 4", () => {
    expect(estimateTokens("abcd".repeat(10))).toBe(10);
    expect(estimateTokens("abcde")).toBe(2);
  });
});

describe("secret validators", () => {
  it("accepts valid check digits and refuses near misses", () => {
    expect(isKontonummer("8601.11.17947")).toBe(true);
    expect(isKontonummer("8601.11.17948")).toBe(false);
    expect(isIban("NO93 8601 1117 947")).toBe(true);
    expect(isIban("NO94 8601 1117 947")).toBe(false);
    expect(isKid("10012342")).toBe(true);
    expect(isKid("10012343")).toBe(false);
    expect(isRoutingNumber("021000021")).toBe(true);
    expect(isRoutingNumber("021000022")).toBe(false);
  });

  it("finds secrets in text but not amounts, dates or limits", () => {
    const hits = findSecrets(
      "Konto 8601.11.17947, IBAN NO9386011117947, KID: 10012342, routing 021000021, kort 4111 1111 1111 1111. " +
        "Beløp 15 500,00, dato 2026-10-31, KID (maks 35 tegn), 12345678901",
    );
    expect(hits.map((h) => h.kind)).toEqual(["bank-account", "iban", "kid", "routing-number", "card"]);
    expect(hits[0]!.masked).toBe("86•••••••47");
  });
});

describe("icon names and irreversible buttons", () => {
  it("knows icon ligatures", () => {
    for (const name of ["close", "content_copy", "more_vert", "calendar_month"])
      expect(looksLikeIconName(name, false)).toBe(true);
    expect(looksLikeIconName("savings", false)).toBe(false);
    expect(looksLikeIconName("savings", true)).toBe(true);
    expect(looksLikeIconName("Lukk", true)).toBe(false);
    expect(looksLikeIconName("Lagre", false)).toBe(false);
  });

  it("knows irreversible verbs in Norwegian and English", () => {
    for (const name of [
      "Bokfør",
      "Opprett",
      "Godkjenn",
      "Lagre og bokfør",
      "Send faktura",
      "Pay invoice",
      "Approve",
      "Post voucher",
    ]) {
      expect(IRREVERSIBLE.test(name), name).toBe(true);
    }
    for (const name of ["Lagre utkast", "Forhåndsvis", "Ny rad", "Betalingssammendrag", "Avbryt"]) {
      expect(IRREVERSIBLE.test(name), name).toBe(false);
    }
  });
});

describe("score", () => {
  it("takes points per finding, capped per rule, never below 0", () => {
    expect(score([]).score).toBe(100);
    expect(score([{ rule: "bridge-missing" }]).score).toBe(75);
    const many = Array.from({ length: 40 }, () => ({ rule: "field-unnamed" as const }));
    expect(score(many)).toMatchObject({ score: 100 - RULES["field-unnamed"].cap, grade: "partly ready" });
    const everything = Object.keys(RULES).flatMap((rule) =>
      Array.from({ length: 10 }, () => ({ rule: rule as keyof typeof RULES })),
    );
    expect(score(everything).score).toBe(0);
  });

  it("every rule names a contract section, a reason and a fix", () => {
    for (const rule of Object.values(RULES)) {
      expect(rule.contract).toMatch(/§\d/);
      expect(rule.why.length).toBeGreaterThan(40);
      expect(rule.fix.length).toBeGreaterThan(20);
      expect(rule.cap).toBeGreaterThanOrEqual(rule.points);
    }
  });
});

describe("reports", () => {
  const report = {
    tool: { name: "@booki-aui/readiness" as const, version: "0.1.0" },
    url: "file:///x.html",
    title: "<Test>",
    checkedAt: "2026-11-21T10:00:00.000Z",
    ...score([{ rule: "field-unnamed" }]),
    findings: [
      {
        rule: "field-unnamed" as const,
        message: "A textbox with no name.",
        element: { role: "textbox", name: "", html: "<input>" },
      },
    ],
    metrics: { snapshotChars: 40, snapshotTokens: 10, fields: 1, buttons: 0, charts: 0 },
    bridge: { source: null, components: 0, named: 0, actions: 0, controls: [], webmcpTools: [], error: null },
    snapshot: "- textbox [ref=e1]",
  };

  it("escapes page content in the HTML report", () => {
    const html = toHtml(report);
    expect(html).toContain("&lt;Test&gt;");
    expect(html).toContain("&lt;input&gt;");
    expect(html).toContain(">95<");
    expect(html).toContain("§3.1");
  });

  it("leaves the full snapshot out of the JSON unless asked", () => {
    expect(JSON.parse(toJson(report))).toMatchObject({ score: 95, snapshotIncluded: false });
    expect(JSON.parse(toJson(report, { snapshot: true })).snapshot).toBe(report.snapshot);
  });
});

describe("samePage", () => {
  it("ignores the query, the hash and a closing slash", () => {
    expect(samePage("http://localhost:3000/screen/?tab=2#x", "http://localhost:3000/screen")).toBe(true);
  });
  it("tells a sign-in page from the screen asked for", () => {
    expect(samePage("http://localhost:3000/login?next=%2Fscreen", "http://localhost:3000/screen")).toBe(false);
  });
});
