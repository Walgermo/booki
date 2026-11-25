import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

import {
  bridgeCoverage,
  describeElement,
  findCharts,
  findFocusableNonControls,
  INIT_SCRIPT,
  inPage,
  onlyInSecrets,
  readBridge,
  type ElementInfo,
} from "./page.js";
import { PERSON_ACTION } from "./person-action.js";
import { RULES, SNAPSHOT_TOKENS, type RuleId } from "./rules.js";
import { score } from "./score.js";
import { findSecrets, SECRET_LABEL } from "./secrets.js";
import { estimateTokens, parseSnapshot, type SnapshotNode } from "./snapshot.js";

export type Finding = {
  rule: RuleId;
  /** What was found, in one line. */
  message: string;
  element?: {
    role?: string;
    name?: string;
    ref?: string | null;
    selector?: string;
    html?: string;
    context?: string;
  };
  /** The Booki control for this element, when one fits better than the rule's general one. */
  booki?: string;
  /** For a finding that covers several elements. */
  count?: number;
};

export type BridgeReport = {
  source: "window.agent" | "webmcp" | null;
  components: number;
  named: number;
  actions: number;
  /** Action names per component label, for the report. */
  controls: Array<{ label: string; component: string; actions: string[]; confirm?: string }>;
  webmcpTools: string[];
  error: string | null;
};

export type Report = {
  tool: { name: "@booki-aui/readiness"; version: string };
  url: string;
  title: string;
  checkedAt: string;
  score: number;
  grade: "ready" | "partly ready" | "not ready" | "not measured";
  /**
   * False when the bridge had no controls: the form may not be open yet, so
   * `score` rests on almost nothing and `grade` is "not measured".
   */
  measured: boolean;
  /** Set when `measured` is false: what to do instead. */
  notMeasured?: string;
  /** Points lost per rule. */
  deductions: Array<{ rule: RuleId; findings: number; points: number }>;
  findings: Finding[];
  metrics: {
    snapshotChars: number;
    snapshotTokens: number;
    fields: number;
    buttons: number;
    charts: number;
  };
  bridge: BridgeReport;
  snapshot: string;
  /**
   * The address asked for, when the page sent the browser somewhere else (a
   * sign-in page, say): `url` is then the page that was measured.
   */
  redirectedFrom?: string;
};

export type AuditOptions = {
  /** Playwright storage state (cookies, localStorage) of a signed-in session. */
  storageState?: string;
  /** A browser profile directory to run in (signed in already). */
  profile?: string;
  /** "chrome" (default), "msedge", "chromium" or any Playwright channel. */
  channel?: string;
  /** A browser binary, instead of a channel. */
  executablePath?: string;
  /** Milliseconds to wait after the page has loaded, for late rendering. Default 500. */
  wait?: number;
  /** A selector to wait for before checking. */
  waitFor?: string;
  headed?: boolean;
  viewport?: { width: number; height: number };
  /**
   * Milliseconds to wait for the page to load (navigation, the load event)
   * and for `waitFor`, before giving up. Default 30000; 0 waits without a limit.
   */
  timeout?: number;
};

export const VERSION = "0.1.0";

const FIELD_ROLES = new Set([
  "textbox",
  "searchbox",
  "combobox",
  "listbox",
  "spinbutton",
  "checkbox",
  "radio",
  "switch",
  "slider",
]);
const ACTION_ROLES = new Set(["button", "link", "menuitem"]);

/**
 * Ligatures common icon fonts draw. A button whose whole name is one of these,
 * or a snake_case word, is named by its icon.
 */
const ICON_WORDS = new Set(
  (
    "add add_circle arrow_back arrow_drop_down arrow_forward attach_file calendar_month calendar_today cancel check " +
    "check_circle chevron_left chevron_right clear close content_copy content_paste date_range delete delete_outline " +
    "done download edit edit_note error expand_less expand_more file_download file_upload filter_alt filter_list " +
    "help help_outline home info keyboard_arrow_down keyboard_arrow_up launch link menu more_horiz more_vert " +
    "notifications open_in_new print refresh remove save search send settings sort star sync tune undo upload " +
    "visibility visibility_off warning"
  ).split(" "),
);

export function looksLikeIconName(name: string, iconFont: boolean): boolean {
  const n = name.trim();
  if (!n || n.length > 40) return false;
  if (/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(n)) return true;
  if (ICON_WORDS.has(n)) return true;
  // With an icon font in use, any single lowercase word is the ligature.
  return iconFont && /^[a-z][a-z0-9_]*$/.test(n);
}

/** Buttons that post, pay, send, approve or otherwise cannot be taken back. */
export const IRREVERSIBLE =
  /(^|[^\p{L}])(bokfør|opprett|godkjenn|attester|betal|send|signer|fullfør|frigi|overfør|utbetal|lukk periode|post|pay|approve|submit|finali[sz]e|release|sign[ -]?off|transfer)(e|er)?(?=$|[^\p{L}])/iu;

// What runs in the page, each with its own `__name` helper (see inPage).
const DESCRIBE = inPage(describeElement);
const READ_BRIDGE = inPage(readBridge);
const FIND_FOCUSABLE = inPage(findFocusableNonControls);
const FIND_CHARTS = inPage(findCharts);
const ONLY_IN_SECRETS = inPage(onlyInSecrets);
const BRIDGE_COVERAGE = inPage(bridgeCoverage);

const BROKEN_NAME = /\[object \w+\]|\bundefined\b|\bnull\b|\bNaN\b/;

function toTarget(input: string): string {
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) return input;
  const resolved = path.resolve(input);
  if (existsSync(resolved)) return pathToFileURL(resolved).href;
  return `https://${input}`;
}

async function open(target: string, options: AuditOptions): Promise<{ page: Page; close: () => Promise<void> }> {
  const viewport = options.viewport ?? { width: 1280, height: 900 };
  const launch = {
    headless: !options.headed,
    ...(options.executablePath
      ? { executablePath: options.executablePath }
      : options.channel === "chromium"
        ? {}
        : { channel: options.channel ?? "chrome" }),
  };
  let browser: Browser | null = null;
  let context: BrowserContext;
  if (options.profile) {
    context = await chromium.launchPersistentContext(path.resolve(options.profile), { ...launch, viewport });
  } else {
    browser = await chromium.launch(launch);
    context = await browser.newContext({
      viewport,
      ...(options.storageState ? { storageState: path.resolve(options.storageState) } : {}),
    });
  }
  await context.addInitScript(INIT_SCRIPT);
  const page = context.pages()[0] ?? (await context.newPage());
  const timeout = options.timeout ?? 30_000;
  page.setDefaultTimeout(timeout);
  page.setDefaultNavigationTimeout(timeout);
  await page.goto(target, { waitUntil: "load", timeout });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
  if (options.waitFor) await page.waitForSelector(options.waitFor);
  await page.waitForTimeout(options.wait ?? 500);
  return {
    page,
    close: async () => {
      await context.close();
      await browser?.close();
    },
  };
}

async function describe(page: Page, node: SnapshotNode): Promise<ElementInfo | null> {
  if (!node.ref) return null;
  try {
    return await page.locator(`aria-ref=${node.ref}`).evaluate(DESCRIBE, undefined, { timeout: 2_000 });
  } catch {
    return null;
  }
}

function element(node: SnapshotNode, info: ElementInfo | null): Finding["element"] {
  return {
    role: node.role,
    name: node.name,
    ref: node.ref,
    selector: info?.selector,
    html: info?.html,
    context: info?.context || undefined,
  };
}

/** A Booki control that fits the field, guessed from its role, type and the text near it. */
export function bookiControlFor(role: string, info: ElementInfo | null): string | undefined {
  const near = `${info?.context ?? ""} ${info?.html ?? ""}`.toLowerCase();
  if (info?.type === "date" || /dato|date|forfall|due/.test(near)) return "FinancialDateField";
  if (/kid|payment ref|betalingsref/.test(near)) return "PaymentReferenceInput";
  if (/iban/.test(near)) return "IbanInput";
  if (/kontonummer|bank ?account|routing/.test(near)) return "BankAccountInput";
  if (/mva|vat|tax|avgift/.test(near)) return "TaxCodeSelect";
  if (/valuta|currency/.test(near)) return "CurrencySelect";
  if (
    /beløp|amount|sum|total|pris|price|debet|kredit|debit|credit/.test(near) &&
    (role === "textbox" || role === "spinbutton")
  )
    return "AmountField";
  if (/faktura(nummer|nr)|invoice (no|number)/.test(near)) return "InvoiceNumberInput";
  if (/periode|period|termin/.test(near)) return "AccountingPeriodSelect";
  if (/org\.?nr|organisasjonsnummer|ein\b/.test(near)) return "OrganizationNumberInput";
  if (role === "listbox" || role === "combobox")
    return "AccountPicker (accounts, customers, suppliers) or TaxCodeSelect";
  return undefined;
}

/** Whether two addresses name one page: the same origin and path, whatever the query or hash. */
export function samePage(a: string, b: string): boolean {
  try {
    const x = new URL(a);
    const y = new URL(b);
    const trim = (p: string) => p.replace(/\/+$/, "") || "/";
    return x.origin === y.origin && trim(x.pathname) === trim(y.pathname);
  } catch {
    return a === b;
  }
}

/** Opens the page and checks what stops an agent there. */
export async function audit(input: string, options: AuditOptions = {}): Promise<Report> {
  const target = toTarget(input);
  const { page, close } = await open(target, options);
  try {
    const landed = page.url();
    if (!samePage(landed, target)) return { ...(await check(page, landed)), redirectedFrom: target };
    return await check(page, target);
  } finally {
    await close();
  }
}

/** Said when the bridge has no controls, in the console, the HTML report and the JSON. */
export const NOT_MEASURED =
  "Nothing measured: the bridge has no controls, so most checks had nothing to compare the page with. The tool never clicks: a form that appears after a row is selected or a button is pressed is not on the page yet. Open the form first (a Playwright step), then call check(page) from @booki-aui/readiness.";

/** Checks an open page. Exposed for callers that drive their own browser. */
export async function check(page: Page, url = page.url()): Promise<Report> {
  const snapshot = await page.ariaSnapshot({ mode: "ai" });
  const nodes = parseSnapshot(snapshot);
  const findings: Finding[] = [];

  // Bridge first: it decides how irreversible buttons are gated.
  const raw = await page.evaluate(READ_BRIDGE);
  const controls = raw.components.map((c) => ({
    label: typeof c.label === "string" ? c.label : "",
    component: String(c.component ?? "?"),
    actions: Array.isArray(c.actions) ? c.actions.map(String) : [],
    ...(typeof c.confirm === "string" ? { confirm: c.confirm } : {}),
  }));
  const bridge: BridgeReport = {
    source: raw.source,
    components: controls.length,
    named: controls.filter((c) => c.label.trim()).length,
    actions: controls.reduce((sum, c) => sum + c.actions.length, 0),
    controls,
    webmcpTools: raw.tools,
    error: raw.error,
  };
  const generic = new Set(["snapshot", "act", "query"]);
  const ownTools = raw.tools.filter((tool) => !generic.has(tool));
  const hasBridge = bridge.actions > 0 || ownTools.length > 0;
  if (!hasBridge) {
    findings.push({
      rule: "bridge-missing",
      message:
        bridge.source === null
          ? "No window.agent and no WebMCP tools: an agent can only read the accessibility tree and click."
          : `A bridge answers (${bridge.source}) but offers no controls with actions on this page.`,
    });
  }
  for (const control of controls) {
    if (!control.label.trim()) {
      findings.push({
        rule: "bridge-unnamed-control",
        message: `A ${control.component} on the bridge has no label.`,
        element: { role: control.component, name: "" },
      });
    }
    for (const action of control.actions.filter((a) => PERSON_ACTION.test(a))) {
      findings.push({
        rule: "bridge-person-action",
        message: `"${control.label || control.component}" offers the agent "${action}".`,
        element: { role: control.component, name: control.label },
      });
    }
  }

  // Fields.
  // Playwright lists an aria-hidden field it can still focus, marked [aria-hidden]
  // and often without a ref. Neither a person's screen reader nor an agent's
  // tree treats it as a field.
  const fields = nodes.filter((n) => FIELD_ROLES.has(n.role) && !n.flags.includes("aria-hidden"));
  const named = new Map<string, SnapshotNode[]>();
  for (const node of fields) {
    const name = node.name.trim();
    if (!name) {
      const info = await describe(page, node);
      // The native input a UI library hides beside a custom control: no one reaches it.
      if (info?.hidden) continue;
      findings.push({
        rule: "field-unnamed",
        message: `A ${node.role} with no name${info?.context ? `, near "${info.context}"` : ""}.`,
        element: element(node, info),
        booki: bookiControlFor(node.role, info),
      });
      continue;
    }
    if (BROKEN_NAME.test(name)) {
      const info = await describe(page, node);
      if (info?.hidden) continue;
      findings.push({
        rule: "field-broken-name",
        message: `A ${node.role} named "${name}".`,
        element: element(node, info),
        booki: bookiControlFor(node.role, info),
      });
      continue;
    }
    if (node.role === "radio") continue;
    const key = `${node.role}\u0000${name}`;
    named.set(key, [...(named.get(key) ?? []), node]);
  }
  for (const candidates of named.values()) {
    if (candidates.length < 2) continue;
    const group: Array<{ node: SnapshotNode; info: ElementInfo | null }> = [];
    for (const node of candidates) {
      const info = await describe(page, node);
      if (!info?.hidden) group.push({ node, info });
    }
    if (group.length < 2) continue;
    const first = group[0]!;
    findings.push({
      rule: "field-ambiguous",
      message: `${group.length} fields are each a ${first.node.role} named "${first.node.name}".`,
      element: element(first.node, first.info),
      count: group.length,
    });
  }

  // Fields a person can use that the bridge does not offer. Only with a bridge
  // snapshot to compare against: a page without one is reported as such, and a
  // snapshot cut short ("more") leaves out entries the field may have.
  const entries = raw.components
    .filter((c) => !c.offPage && c.component !== "more")
    .map((c) => ({ component: String(c.component ?? ""), label: typeof c.label === "string" ? c.label : "" }));
  const truncated = raw.components.some((c) => c.component === "more");
  if (hasBridge && entries.length && !truncated) {
    const norm = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase();
    const labels = new Set(entries.map((e) => norm(e.label)).filter(Boolean));
    const seenGroups = new Set<string>();
    for (const node of fields) {
      const name = node.name.trim();
      // Unnamed and broken names are reported above; a disabled field takes no input.
      if (!name || BROKEN_NAME.test(name) || node.flags.includes("disabled") || !node.ref) continue;
      if (labels.has(norm(name))) continue;
      const coverage = await page
        .locator(`aria-ref=${node.ref}`)
        .evaluate(BRIDGE_COVERAGE, entries, { timeout: 2_000 })
        .catch(() => null);
      if (!coverage || coverage.inRoot || coverage.agentHidden || coverage.group?.covered) continue;
      const group = coverage.group;
      if (group) {
        if (seenGroups.has(norm(group.name))) continue;
        seenGroups.add(norm(group.name));
      }
      const info = await describe(page, node);
      if (info?.hidden) continue;
      const role = group ? "radiogroup" : node.role;
      const shown = group ? group.name : name;
      findings.push({
        rule: "field-not-on-bridge",
        message: `A ${role} named "${shown}" is on the page but not on the bridge: no snapshot entry has that label or contains it.`,
        element: { ...element(node, info), role, name: shown },
        booki: bookiControlFor(node.role, info),
      });
    }
  }

  // Things a person can focus or click that the tree does not call a control.
  const focusables = await page.evaluate(FIND_FOCUSABLE);
  const focusLocator = page.locator("[tabindex]");
  for (const item of focusables) {
    const info = await focusLocator
      .nth(item.index)
      .evaluate(DESCRIBE, undefined, { timeout: 2_000 })
      .catch(() => null);
    findings.push({
      rule: "focusable-without-role",
      message: `A focusable <${item.tag}> with no control role${item.text ? ` ("${item.text}")` : ""}${info?.context ? `, under "${info.context}"` : ""}.`,
      element: {
        role: item.tag,
        name: item.text,
        selector: info?.selector,
        html: info?.html,
        context: info?.context || undefined,
      },
      booki: bookiControlFor("textbox", info),
    });
  }

  // Buttons: names, and the irreversible ones.
  const actionNodes = nodes.filter((n) => ACTION_ROLES.has(n.role));
  const bridgeButtons = new Map(controls.filter((c) => c.component === "button").map((c) => [c.label.trim(), c]));
  for (const node of actionNodes) {
    const name = node.name.trim();
    if (node.role === "button" && !name) {
      const info = await describe(page, node);
      findings.push({ rule: "button-unnamed", message: "A button with no name.", element: element(node, info) });
      continue;
    }
    if (node.role !== "link") {
      const plain = looksLikeIconName(name, false);
      const info = plain || /^[a-z][a-z0-9_]*$/.test(name) ? await describe(page, node) : null;
      if (looksLikeIconName(name, info?.iconFont ?? false)) {
        findings.push({
          rule: "button-icon-name",
          message: `A ${node.role} named "${name}", the icon's ligature.`,
          element: element(node, info),
        });
        continue;
      }
    }
    if (IRREVERSIBLE.test(name)) {
      const info = await describe(page, node);
      const onBridge = bridgeButtons.get(name);
      const gated = Boolean(info?.confirm) || Boolean(onBridge?.confirm);
      if (!gated) {
        findings.push({
          rule: "irreversible-ungated",
          message: `"${name}" ${node.role === "link" ? "(a link) " : ""}takes an irreversible step with no data-agent-confirm and no person gate.`,
          element: element(node, info),
        });
      }
    }
  }

  // Charts.
  const charts = await page.evaluate(FIND_CHARTS);
  const chartLocator = page.locator("canvas, svg");
  for (const chart of charts) {
    if (chart.figures >= 2) continue;
    const info = await chartLocator
      .nth(chart.index)
      .evaluate(DESCRIBE, undefined, { timeout: 2_000 })
      .catch(() => null);
    const what = chart.kind === "canvas" ? "A canvas" : `An SVG${chart.role ? ` (role ${chart.role})` : ""}`;
    findings.push({
      rule: "chart-pixels-only",
      message: `${what} ${chart.width}×${chart.height} ${chart.name ? `named "${chart.name}" but` : "with no name and"} no figures in the DOM.`,
      element: {
        role: chart.role ?? chart.kind,
        name: chart.name,
        selector: info?.selector,
        html: info?.html,
        context: info?.context || undefined,
      },
    });
  }

  // Secrets in what the agent reads: the snapshot, and the bridge's snapshot.
  const lines = snapshot.split("\n");
  // Refs are not page text; blank them so their digits do not join a number.
  const readable = snapshot.replace(/\[ref=e\d+\]/g, (m) => " ".repeat(m.length));
  const secrets = findSecrets(readable);
  for (const hit of secrets) {
    const lineIndex = snapshot.slice(0, hit.index).split("\n").length - 1;
    const node = nodes.find((n) => n.line === lineIndex) ?? nodes.filter((n) => n.line < lineIndex).at(-1);
    const info = node ? await describe(page, node) : null;
    // Marked data-agent-secret on a page with a bridge: the bridge redacts it.
    if (hasBridge && (info?.secret || (await page.evaluate(ONLY_IN_SECRETS, hit.value)))) continue;
    findings.push({
      rule: "secret-visible",
      message: `${SECRET_LABEL[hit.kind]} ${hit.masked} is in the accessibility snapshot.`,
      element: {
        ...(node ? element(node, info) : {}),
        context: lines[lineIndex]?.trim().replace(hit.value, hit.masked),
      },
    });
  }
  const bridgeText = JSON.stringify(raw.components);
  const bridgeSecrets = findSecrets(bridgeText);
  secrets.push(...bridgeSecrets);
  for (const hit of bridgeSecrets) {
    const owner = raw.components.find((c) => JSON.stringify(c).includes(hit.value));
    findings.push({
      rule: "secret-visible",
      message: `${SECRET_LABEL[hit.kind]} ${hit.masked} is in the bridge snapshot${owner?.label ? ` of "${owner.label}"` : ""}.`,
      element: { role: owner?.component, name: owner?.label },
    });
  }

  // Cost.
  const tokens = estimateTokens(snapshot);
  if (tokens > SNAPSHOT_TOKENS.warn) {
    findings.push({
      rule: "snapshot-size",
      message: `The accessibility snapshot is about ${tokens.toLocaleString("en-US")} tokens; an agent reads it again after most steps.`,
      count: tokens > SNAPSHOT_TOKENS.high ? 2 : 1,
    });
  }

  // The report never repeats a secret: mask every value found, wherever it appears.
  const redact = (text: string | undefined) => {
    if (!text) return text;
    let out = text;
    for (const hit of secrets) {
      for (const form of new Set([hit.value, hit.value.replace(/[^0-9A-Za-z]/g, "")])) {
        if (form.length >= 4) out = out.split(form).join(hit.masked);
      }
    }
    return out;
  };
  for (const finding of findings) {
    finding.message = redact(finding.message)!;
    if (finding.element) {
      for (const key of ["name", "html", "context", "selector"] as const)
        finding.element[key] = redact(finding.element[key]);
    }
  }
  for (const control of controls) control.label = redact(control.label)!;

  const title = await page.title();
  const result = score(findings);
  const measured = bridge.components > 0;
  return {
    tool: { name: "@booki-aui/readiness", version: VERSION },
    url,
    title,
    checkedAt: new Date().toISOString(),
    ...result,
    measured,
    ...(measured ? {} : { grade: "not measured" as const, notMeasured: NOT_MEASURED }),
    findings: sortFindings(findings),
    metrics: {
      snapshotChars: snapshot.length,
      snapshotTokens: tokens,
      fields: fields.length,
      buttons: actionNodes.filter((n) => n.role === "button").length,
      charts: charts.length,
    },
    bridge,
    snapshot: redact(snapshot)!,
  };
}

const ORDER = { critical: 0, serious: 1, moderate: 2, minor: 3 } as const;

function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => ORDER[RULES[a.rule].severity] - ORDER[RULES[b.rule].severity]);
}
