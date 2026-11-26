import type { Finding, Report } from "./audit.js";
import { RULES, type RuleId } from "./rules.js";

const esc = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!,
  );

/** The report as JSON, without the raw snapshot unless asked. */
export function toJson(report: Report, { snapshot = false } = {}): string {
  const { snapshot: text, ...rest } = report;
  return JSON.stringify(
    snapshot ? report : { ...rest, snapshotIncluded: false, snapshotPreview: text.slice(0, 2_000) },
    null,
    2,
  );
}

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code: string) => (text: string) => (tty ? `\x1b[${code}m${text}\x1b[0m` : text);
const bold = paint("1");
const dim = paint("2");
const red = paint("31");
const yellow = paint("33");
const green = paint("32");

export function toConsole(report: Report): string {
  const colour = !report.measured ? yellow : report.score >= 85 ? green : report.score >= 60 ? yellow : red;
  const out: string[] = [];
  out.push(`${bold("Agent readiness")}  ${report.url}`);
  if (report.redirectedFrom) out.push(yellow(redirectNote(report)));
  const headline = report.measured ? `${report.score}/100` : "no score";
  out.push(
    `${colour(bold(headline))} ${colour(report.grade)}  ${dim(`· ${report.findings.length} findings · snapshot ≈ ${report.metrics.snapshotTokens.toLocaleString("en-US")} tokens · bridge: ${bridgeLine(report)}`)}`,
  );
  out.push("");
  if (!report.measured) {
    out.push(yellow(report.notMeasured ?? ""));
    out.push("");
  }
  const byRule = groupByRule(report.findings);
  for (const d of report.deductions) {
    const rule = RULES[d.rule];
    const list = byRule.get(d.rule) ?? [];
    out.push(
      `${sevMark(rule.severity)} ${bold(rule.title)} ${dim(`(${rule.contract}) −${d.points}`)}  ×${list.length}`,
    );
    for (const f of list.slice(0, 6)) {
      out.push(`    ${f.message}${f.element?.selector ? dim(`  ${f.element.selector}`) : ""}`);
      if (f.booki && f.booki !== rule.booki) out.push(`      ${dim("Booki:")} ${f.booki}`);
    }
    if (list.length > 6) out.push(dim(`    … and ${list.length - 6} more`));
    out.push(`    ${dim("Fix:")} ${rule.fix}`);
    if (rule.booki) out.push(`    ${dim("Booki:")} ${rule.booki}`);
    out.push("");
  }
  if (!report.findings.length && report.measured) out.push(green("Nothing found that stops an agent on this page."));
  return out.join("\n");
}

function bridgeLine(report: Report): string {
  const b = report.bridge;
  if (!b.components && !b.webmcpTools.length) return "none";
  return `${b.components} controls, ${b.actions} named actions${b.webmcpTools.length ? `, WebMCP: ${b.webmcpTools.join(", ")}` : ""}`;
}

function sevMark(severity: string): string {
  return severity === "critical"
    ? red("✖")
    : severity === "serious"
      ? red("●")
      : severity === "moderate"
        ? yellow("●")
        : dim("●");
}

function groupByRule(findings: Finding[]): Map<RuleId, Finding[]> {
  const map = new Map<RuleId, Finding[]>();
  for (const f of findings) map.set(f.rule, [...(map.get(f.rule) ?? []), f]);
  return map;
}

/** Says the page measured is not the one asked for, and how to measure that one. */
export function redirectNote(report: Report): string {
  return `Measured ${report.url}, not ${report.redirectedFrom}: the page sent the browser on, often to sign in. For a screen behind a sign-in, pass --storage-state <file> of a signed-in session (or --profile <dir>).`;
}

export function toHtml(report: Report): string {
  const byRule = groupByRule(report.findings);
  const tone = !report.measured ? "warn" : report.score >= 85 ? "good" : report.score >= 60 ? "warn" : "bad";
  const sections = report.deductions
    .map((d) => {
      const rule = RULES[d.rule];
      const items = (byRule.get(d.rule) ?? [])
        .map((f) => {
          const e = f.element;
          const booki = f.booki ?? rule.booki;
          return `<li class="finding">
  <p class="msg">${esc(f.message)}</p>
  ${
    e
      ? `<dl class="el">
    ${e.role ? `<dt>Role</dt><dd><code>${esc(e.role)}</code>${e.name ? ` “${esc(e.name)}”` : " <em>no name</em>"}${e.ref ? ` <span class="muted">ref ${esc(e.ref)}</span>` : ""}</dd>` : ""}
    ${e.context ? `<dt>Near</dt><dd>${esc(e.context)}</dd>` : ""}
    ${e.selector ? `<dt>Selector</dt><dd><code>${esc(e.selector)}</code></dd>` : ""}
    ${e.html ? `<dt>HTML</dt><dd><code class="html">${esc(e.html)}</code></dd>` : ""}
    ${f.booki && f.booki !== rule.booki ? `<dt>Booki</dt><dd>${esc(booki)}</dd>` : ""}
  </dl>`
      : ""
  }
</li>`;
        })
        .join("\n");
      return `<section class="rule sev-${rule.severity}" id="${rule.id}">
  <header>
    <h2>${esc(rule.title)}</h2>
    <p class="meta"><span class="sev">${rule.severity}</span> · Agent Contract ${esc(rule.contract)} · ${d.findings} found · <strong>−${d.points}</strong> <span class="muted">(${rule.points} each, at most ${rule.cap})</span></p>
  </header>
  <div class="explain">
    <p><strong>Why it matters to an agent.</strong> ${esc(rule.why)}</p>
    <p><strong>Fix.</strong> ${esc(rule.fix)}</p>
    ${rule.booki ? `<p><strong>Booki.</strong> ${esc(rule.booki)}</p>` : ""}
  </div>
  <ol class="findings">${items}</ol>
</section>`;
    })
    .join("\n");

  const b = report.bridge;
  const bridgeRows = b.controls
    .map(
      (c) =>
        `<tr><td>${esc(c.label) || "<em>no label</em>"}</td><td><code>${esc(c.component)}</code></td><td>${c.actions.map((a) => `<code>${esc(a)}</code>`).join(" ")}${c.confirm ? ` <span class="muted">confirm: ${esc(c.confirm)}</span>` : ""}</td></tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent readiness: ${esc(report.title || report.url)}</title>
<style>
:root { --paper:#f7f5ef; --card:#fffdf8; --ink:#1d1c19; --muted:#6b675e; --line:#dcd7cb; --bad:#a3321f; --warn:#8a6100; --good:#2f6b2a; --code:#efebe1; }
@media (prefers-color-scheme: dark) { :root { --paper:#151513; --card:#1d1c19; --ink:#ece8de; --muted:#a39e92; --line:#3a3832; --bad:#e2775f; --warn:#d9a940; --good:#8cc27f; --code:#26251f; } }
* { box-sizing: border-box; }
body { margin:0; background:var(--paper); color:var(--ink); font:15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 960px; margin: 0 auto; padding: 32px 16px 64px; }
h1 { font-size: 22px; margin: 0 0 4px; }
h2 { font-size: 17px; margin: 0; }
a { color: inherit; text-decoration-color: var(--muted); text-underline-offset: 2px; }
code { font: 13px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--code); padding: 1px 4px; border-radius: 3px; overflow-wrap: anywhere; }
.muted { color: var(--muted); }
.url { color: var(--muted); overflow-wrap: anywhere; margin: 0 0 24px; }
.summary { display:grid; grid-template-columns: auto 1fr; gap: 24px; align-items: center; background: var(--card); border:1px solid var(--line); border-radius: 8px; padding: 20px; margin-bottom: 24px; }
.score { font-size: 56px; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; }
.score small { font-size: 18px; color: var(--muted); font-weight: 400; }
.tone-good { color: var(--good); } .tone-warn { color: var(--warn); } .tone-bad { color: var(--bad); }
.facts { display:grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px 16px; margin: 0; }
.facts div { display:grid; } .facts dt { color: var(--muted); font-size: 13px; } .facts dd { margin:0; font-variant-numeric: tabular-nums; }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
th, td { text-align: left; border-bottom: 1px solid var(--line); padding: 6px 8px; vertical-align: top; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
.block { background: var(--card); border:1px solid var(--line); border-radius: 8px; padding: 16px 20px; margin-bottom: 24px; overflow-x: auto; }
.rule { background: var(--card); border:1px solid var(--line); border-left: 4px solid var(--muted); border-radius: 8px; padding: 16px 20px; margin-bottom: 16px; }
.sev-critical, .sev-serious { border-left-color: var(--bad); } .sev-moderate { border-left-color: var(--warn); }
.meta { margin: 4px 0 0; color: var(--muted); font-size: 13px; }
.sev { text-transform: uppercase; letter-spacing: .04em; font-weight: 600; }
.explain p { margin: 8px 0; }
.findings { padding-left: 20px; margin: 12px 0 0; }
.finding { margin-bottom: 12px; }
.msg { margin: 0 0 4px; }
.el { display:grid; grid-template-columns: 72px 1fr; gap: 2px 8px; margin: 0; font-size: 13px; }
.el dt { color: var(--muted); } .el dd { margin: 0; min-width: 0; }
.html { display:inline-block; max-width: 100%; }
details pre { white-space: pre-wrap; font: 12px/1.4 ui-monospace, Menlo, monospace; max-height: 480px; overflow: auto; background: var(--code); padding: 12px; border-radius: 6px; }
@media (max-width: 560px) { .summary { grid-template-columns: 1fr; } .el { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<main>
<h1>Agent readiness</h1>
<p class="url">${esc(report.title)} · <a href="${esc(report.url)}">${esc(report.url)}</a> · ${esc(report.checkedAt.slice(0, 16).replace("T", " "))} UTC</p>
${report.redirectedFrom ? `<p class="redirect"><strong>${esc(redirectNote(report))}</strong></p>` : ""}
${report.measured ? "" : `<p class="redirect"><strong>${esc(report.notMeasured ?? "")}</strong></p>`}

<div class="summary">
  <div class="score tone-${tone}">${report.measured ? `${report.score}<small>/100</small>` : `<small>no score</small>`}<div style="font-size:15px;font-weight:600;margin-top:6px">${esc(report.grade)}</div></div>
  <dl class="facts">
    <div><dt>Findings</dt><dd>${report.findings.length}</dd></div>
    <div><dt>Snapshot</dt><dd>≈ ${report.metrics.snapshotTokens.toLocaleString("en-US")} tokens</dd></div>
    <div><dt>Fields</dt><dd>${report.metrics.fields}</dd></div>
    <div><dt>Buttons</dt><dd>${report.metrics.buttons}</dd></div>
    <div><dt>Charts</dt><dd>${report.metrics.charts}</dd></div>
    <div><dt>Bridge</dt><dd>${b.components ? `${b.components} controls · ${b.actions} actions` : "none"}</dd></div>
  </dl>
</div>

<div class="block">
  <h2>Score</h2>
  ${report.measured ? "" : `<p class="muted"><strong>Not measured.</strong> There is no score: the bridge had no controls and the page has no fields or charts.</p>`}
  <p class="muted">100, minus each rule's points per finding, capped per rule. 85 and up: ready. 60 to 84: partly ready. Below 60: not ready.</p>
  <table><thead><tr><th>Rule</th><th>Contract</th><th class="num">Found</th><th class="num">Points</th></tr></thead><tbody>
  ${report.deductions.map((d) => `<tr><td><a href="#${d.rule}">${esc(RULES[d.rule].title)}</a></td><td>${esc(RULES[d.rule].contract)}</td><td class="num">${d.findings}</td><td class="num">−${d.points}</td></tr>`).join("")}
  ${report.deductions.length ? "" : `<tr><td colspan="4">${report.measured ? "Nothing found." : "Nothing found, and nothing measured."}</td></tr>`}
  </tbody></table>
</div>

${sections}

<div class="block">
  <h2>Agent bridge</h2>
  <p class="muted">${b.source ? `Read through ${esc(b.source)}.` : "No window.agent and no WebMCP tools on this page."}${b.webmcpTools.length ? ` WebMCP tools: ${b.webmcpTools.map((t) => `<code>${esc(t)}</code>`).join(" ")}.` : ""}${b.error ? ` Error: ${esc(b.error)}` : ""}</p>
  ${b.controls.length ? `<table><thead><tr><th>Label</th><th>Control</th><th>Actions</th></tr></thead><tbody>${bridgeRows}</tbody></table>` : ""}
</div>

<div class="block">
  <h2>What a browser agent reads</h2>
  <p class="muted">The page's accessibility snapshot, as browser tools give it to a model: ${report.metrics.snapshotChars.toLocaleString("en-US")} characters, about ${report.metrics.snapshotTokens.toLocaleString("en-US")} tokens (characters ÷ 4).</p>
  <details><summary>Show the snapshot</summary><pre>${esc(report.snapshot)}</pre></details>
</div>

<p class="muted">@booki-aui/readiness ${esc(report.tool.version)} · checks reference the Agent Contract (spec/agent-contract.md).</p>
</main>
</body>
</html>
`;
}
