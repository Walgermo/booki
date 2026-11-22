/**
 * Scripted agents: no model, no mistakes. Each one drives a page through the
 * same tools a model gets there and records every call in and out.
 *
 * On the browser pages this is the best case for the page: the script already
 * knows which unnamed widget is which, never retries, skips the search boxes
 * (it knows the row it wants is in the list), and takes a snapshot only where
 * it needs refs it has not seen or must read the page (the balance check the
 * task asks for). With the real Playwright MCP server an action does not put
 * the new snapshot in its reply (it writes it to a file and links it), so
 * reading the page after an action costs a `browser_snapshot` call. With the
 * legacy tools every action returns the snapshot, and no extra call is made.
 */
import type { ResultBlock, Session } from "./session.js";

export type Call = {
  tool: string;
  input: unknown;
  output: string;
  /** Content as the model would get it, when it is more than one text block. */
  blocks?: ResultBlock[];
  isError: boolean;
  /** Wall time of the tool call, from the harness's side. */
  ms: number;
};

export type Recorder = {
  calls: Call[];
  /** Runs one tool. Throws on a tool error unless `allowError`. */
  call: (tool: string, input?: unknown, allowError?: boolean) => Promise<string>;
};

export function recorder(session: Session): Recorder {
  const calls: Call[] = [];
  return {
    calls,
    call: async (tool, input = {}, allowError = false) => {
      const started = performance.now();
      const outcome = await session.run(tool, input);
      const ms = performance.now() - started;
      calls.push({
        tool,
        input,
        output: outcome.content,
        ...(outcome.blocks && (outcome.blocks.length > 1 || outcome.blocks[0]?.type !== "text")
          ? { blocks: outcome.blocks }
          : {}),
        isError: outcome.isError,
        ms,
      });
      if (outcome.isError && !allowError) throw new Error(`${tool} failed: ${outcome.content}`);
      return outcome.content;
    },
  };
}

/** The ref on the nth snapshot line that matches. */
export function refIn(snapshot: string, match: RegExp, nth = 0): string {
  const lines = snapshot.split("\n").filter((line) => match.test(line));
  const found = lines[nth]?.match(/\[ref=([\w-]+)\]/)?.[1];
  if (!found) {
    const shown = snapshot
      .split("\n")
      .filter((l) => /\[ref=/.test(l))
      .slice(0, 60)
      .join("\n");
    throw new Error(`No element matches ${match} (#${nth}) in the snapshot:\n${shown}`);
  }
  return found;
}

/**
 * Browser tools in both shapes. Playwright MCP takes `target` plus a
 * human-readable `element`; the legacy tools take `ref`.
 */
function browser(session: Session, rec: Recorder) {
  const mcp = session.kind === "mcp";
  let latest = "";
  const target = (ref: string, element: string) => (mcp ? { element, target: ref } : { ref });
  const action = async (tool: string, input: Record<string, unknown>) => {
    const output = await rec.call(tool, input);
    if (!mcp) latest = output;
    return output;
  };
  return {
    /** The page as the agent sees it now: one browser_snapshot on MCP. */
    look: async () => {
      if (mcp || latest === "") latest = await rec.call("browser_snapshot", {});
      return latest;
    },
    click: (ref: string, element: string) => action("browser_click", target(ref, element)),
    type: (ref: string, element: string, text: string) => action("browser_type", { ...target(ref, element), text }),
    select: (ref: string, element: string, values: string[]) =>
      action("browser_select_option", { ...target(ref, element), values }),
  };
}

// ---------------------------------------------------------------------------
// Voucher task
// ---------------------------------------------------------------------------

export async function scriptVoucherRaw(session: Session, rec: Recorder): Promise<void> {
  const b = browser(session, rec);
  const form = await b.look();
  await b.type(refIn(form, /textbox "Bilagsdato/), "Bilagsdato", "2026-10-31");

  // The pickers have no names: the script goes by their order on the row
  // (debit account, debit VAT, credit account, credit VAT).
  const pick = async (listbox: number, element: string, row: RegExp) => {
    await b.click(refIn(form, /- listbox \[ref=/, listbox), element);
    const dialog = await b.look();
    await b.click(refIn(dialog, row), element);
  };
  await pick(0, "Debet-konto", /cell "6800"/);
  await pick(1, "Mva-kode for debet", /cell "1: \(25%\)/);
  await pick(2, "Kredit-konto", /cell "2400"/);

  // The amount field has no name either: the first unnamed textbox on the row.
  await b.type(refIn(form, /- textbox \[ref=/, 0), "Beløp", "15500,00");
  // The task asks for the balance to be checked: read the sums row.
  const check = await b.look();
  await b.click(refIn(check, /button "Opprett"/), "Opprett");
}

/** Body cells in reading order: the grid's cells have no names, so the agent counts. */
function cellRef(snapshot: string, column: number): string {
  const lines = snapshot.split("\n");
  const header = lines.findIndex((line) => /columnheader/.test(line));
  const cells = lines.slice(header).filter((line) => /- cell( "[^"]*")? \[ref=/.test(line));
  const found = cells[column]?.match(/\[ref=([\w-]+)\]/)?.[1];
  if (!found) throw new Error(`No body cell #${column} in the snapshot.`);
  return found;
}

export async function scriptVoucherGrid(session: Session, rec: Recorder): Promise<void> {
  const b = browser(session, rec);
  const grid = await b.look();
  const fill = async (column: number, element: string, text: string, option?: RegExp) => {
    await b.click(cellRef(grid, column), element);
    const editing = await b.look();
    await b.type(refIn(editing, /- combobox/), element, text);
    if (option) {
      const lookup = await b.look();
      await b.click(refIn(lookup, option), element);
    }
  };
  await fill(1, "Dato", "31.10.2026");
  await fill(2, "Debet", "6800", /generic \[ref=[\w-]+\]: 6800 - Kontorrekvisita/);
  await fill(3, "Kredit", "2400", /generic \[ref=[\w-]+\]: 2400 - Leverandørgjeld/);
  await fill(4, "Beløp", "15500,00");
  // The task asks for the balance to be checked: read the sums.
  const check = await b.look();
  await b.click(refIn(check, /button "Lagre og bokfør"/), "Lagre og bokfør");
}

export async function scriptVoucherAcc(_session: Session, rec: Recorder): Promise<void> {
  const snapshot = JSON.parse(await rec.call("snapshot")) as { ref: string; component: string }[];
  const refOf = (component: string) => snapshot.find((entry) => entry.component === component)?.ref ?? component;
  const voucher = refOf("voucher-composer");
  // One act: the bridge stops at the first step that fails and says why.
  await rec.call(
    "act",
    {
      steps: [
        { ref: refOf("financial-date"), action: "setDate", args: ["2026-10-31"] },
        // Entered from the invoice, gross with the account's 25 % code; the VAT is posted for it.
        { ref: voucher, action: "addLine", args: ["6800", null, 1_550_000, 0] },
        { ref: voucher, action: "addLine", args: ["2400", null, 0, 1_550_000] },
        { ref: voucher, action: "assertPostable", args: [] },
        { ref: refOf("button"), action: "press", args: [] },
      ],
    },
    true,
  );
}

// ---------------------------------------------------------------------------
// Invoice task
// ---------------------------------------------------------------------------

export async function scriptInvoiceSemantic(session: Session, rec: Recorder): Promise<void> {
  const b = browser(session, rec);
  const form = await b.look();
  const ref = (role: string, name: string) => refIn(form, new RegExp(`- ${role} "${name}" \\[ref=`));
  await b.type(ref("textbox", "Amount excl. tax"), "Amount excl. tax", "3125.00");
  await b.select(ref("combobox", "Sales tax"), "Sales tax", ["8.875% tax"]);
  const rows = [
    ["1200 Accounts receivable", "Debit", "3402.34"],
    ["4000 Sales revenue", "Credit", "3125.00"],
    ["2150 Sales tax payable", "Credit", "277.34"],
  ] as const;
  for (const [index, [account, side, amount]] of rows.entries()) {
    const n = index + 1;
    await b.type(ref("textbox", `Account, line ${n}`), `Account, line ${n}`, account);
    await b.type(ref("textbox", `${side}, line ${n}`), `${side}, line ${n}`, amount);
  }
  // The task asks to confirm debit equals credit: read the totals.
  const check = await b.look();
  if (!check.includes("Debit 3402.34 · Credit 3402.34")) {
    throw new Error("The snapshot does not show the new totals.");
  }
  await b.click(refIn(check, /- button "Pay invoice" \[ref=/), "Pay invoice");
}

export async function scriptInvoiceAcc(_session: Session, rec: Recorder): Promise<void> {
  const components = JSON.parse(await rec.call("snapshot")) as { ref: string; component: string; label?: string }[];
  const refOf = (component: string, label?: string) => {
    const found = components.find((c) => c.component === component && (!label || c.label === label));
    if (!found) throw new Error(`The bridge snapshot has no ${label ?? component}`);
    return found.ref;
  };
  const voucher = refOf("voucher-composer");
  await rec.call(
    "act",
    {
      steps: [
        { ref: refOf("amount-field"), action: "setMinor", args: [312_500] },
        { ref: refOf("tax-code-select"), action: "setTaxCode", args: ["TAX8875"] },
        { ref: voucher, action: "addLine", args: ["1200", "Accounts receivable", 340_234, 0] },
        { ref: voucher, action: "addLine", args: ["4000", "Sales revenue", 0, 312_500] },
        { ref: voucher, action: "addLine", args: ["2150", "Sales tax payable", 0, 27_734] },
        { ref: voucher, action: "assertBalance" },
        { ref: refOf("button", "Pay invoice"), action: "press" },
      ],
    },
    // The pay step is expected to be refused: it needs a person.
    true,
  );
}

// ---------------------------------------------------------------------------
// Supplier invoice
// ---------------------------------------------------------------------------

const UNCHOSEN = /- listbox "\[object Object\] \(Ikke valgt\)" \[ref=/;

export async function scriptSupplierInvoiceRaw(session: Session, rec: Recorder): Promise<void> {
  const b = browser(session, rec);
  const form = await b.look();
  // Every picker is named "[object Object] …": the script goes by order.
  // The first unchosen one is the supplier, the second the cost account.
  const pick = async (box: string, element: string, row: RegExp) => {
    await b.click(box, element);
    const dialog = await b.look();
    await b.click(refIn(dialog, row), element);
  };
  await pick(refIn(form, UNCHOSEN, 0), "Leverandør", /cell "Kontorrekvisita AS"/);
  const field = (name: string) => refIn(form, new RegExp(`- textbox "${name.replace(/[()*]/g, "\\$&")}" \\[ref=`));
  await b.type(field("Fakturanummer"), "Fakturanummer", "8841");
  await b.type(field("Fakturadato"), "Fakturadato", "2026-10-12");
  await b.type(field("Forfallsdato"), "Forfallsdato", "2026-11-11");
  await b.type(field("Totalt beløp"), "Totalt beløp", "15500,00");
  await pick(refIn(form, UNCHOSEN, 1), "Kostnadskonto", /cell "6800"/);
  await pick(refIn(form, /listbox "\[object Object\] 0:/, 0), "Mva", /cell "1: \(25%\)/);
  // The line's inputs have no names; the second sits under "Beløp ekskl. mva".
  await b.type(refIn(form, /- textbox \[ref=/, 1), "Beløp ekskl. mva", "12400,00");
  await b.type(field("KID-nummer/melding (maks 35 tegn)"), "KID", "10012342");
  const check = await b.look();
  await b.click(refIn(check, /button "Opprett"/), "Opprett");
}

export async function scriptSupplierInvoiceAcc(_session: Session, rec: Recorder): Promise<void> {
  const snapshot = JSON.parse(await rec.call("snapshot")) as {
    ref: string;
    component: string;
    label?: string;
    kind?: string;
  }[];
  const refOf = (component: string, match: (entry: { label?: string; kind?: string }) => boolean = () => true) => {
    const found = snapshot.find((entry) => entry.component === component && match(entry));
    if (!found) throw new Error(`The bridge snapshot has no ${component}`);
    return found.ref;
  };
  await rec.call(
    "act",
    {
      steps: [
        { ref: refOf("account-picker", (e) => e.label === "Leverandør"), action: "setAccount", args: ["20001"] },
        { ref: refOf("invoice-number"), action: "setInvoiceNumber", args: ["8841"] },
        { ref: refOf("financial-date", (e) => e.kind === "invoice"), action: "setDate", args: ["2026-10-12"] },
        { ref: refOf("financial-date", (e) => e.kind === "due"), action: "setDate", args: ["2026-11-11"] },
        { ref: refOf("payment-reference"), action: "setReference", args: ["10012342"] },
        { ref: refOf("amount-field"), action: "setMinor", args: [1_550_000] },
        { ref: refOf("account-picker", (e) => e.label === "Kostnadskonto"), action: "setAccount", args: ["6800"] },
        { ref: refOf("tax-code-select"), action: "setTaxCode", args: ["MVA25"] },
        { ref: refOf("button"), action: "press", args: [] },
      ],
    },
    true,
  );
}

// ---------------------------------------------------------------------------
// Sales invoice
// ---------------------------------------------------------------------------

export async function scriptSalesInvoiceRaw(session: Session, rec: Recorder): Promise<void> {
  const b = browser(session, rec);
  const form = await b.look();
  await b.click(refIn(form, /- listbox "\[object Object\] \(Velg kunde\)" \[ref=/), "Kunde");
  const dialog = await b.look();
  await b.click(refIn(dialog, /cell "Brattli AS"/), "Kunde");
  // The line inputs have no names: five per row (Antall, Enhetspris, Påslag, Rabatt, Beløp).
  const describe = /- textbox "Beskriv uten å velge produkt" \[ref=/;
  const unnamed = /- textbox \[ref=/;
  await b.type(refIn(form, describe, 0), "Beskrivelse, linje 1", "Rådgivning");
  await b.type(refIn(form, unnamed, 0), "Antall, linje 1", "12,5");
  await b.type(refIn(form, unnamed, 1), "Enhetspris, linje 1", "1450,00");
  await b.click(refIn(form, /button "Ny rad"/), "Ny rad");
  const two = await b.look();
  await b.type(refIn(two, describe, 1), "Beskrivelse, linje 2", "Reiseutlegg");
  await b.type(refIn(two, unnamed, 5), "Antall, linje 2", "1");
  await b.type(refIn(two, unnamed, 6), "Enhetspris, linje 2", "2380,00");
  // Read the totals before creating it.
  const check = await b.look();
  await b.click(refIn(check, /button "Opprett"/), "Opprett");
}

export async function scriptSalesInvoiceAcc(_session: Session, rec: Recorder): Promise<void> {
  const snapshot = JSON.parse(await rec.call("snapshot")) as { ref: string; component: string }[];
  const refOf = (component: string) => snapshot.find((entry) => entry.component === component)?.ref ?? component;
  const editor = refOf("invoice-editor");
  await rec.call(
    "act",
    {
      steps: [
        { ref: refOf("account-picker"), action: "setAccount", args: ["10001"] },
        { ref: editor, action: "addLine", args: ["Rådgivning", 12_500, 145_000, "S", 2500] },
        { ref: editor, action: "addLine", args: ["Reiseutlegg", 1_000, 238_000, "S", 2500] },
        { ref: editor, action: "assertFinalizable", args: [] },
        { ref: refOf("button"), action: "press", args: [] },
      ],
    },
    true,
  );
}

// ---------------------------------------------------------------------------
// Dashboard (read only). Each script ends with the answer text an agent would
// give; the answer is what gets verified.
// ---------------------------------------------------------------------------

const MONTH_NAMES = [
  "januar",
  "februar",
  "mars",
  "april",
  "mai",
  "juni",
  "juli",
  "august",
  "september",
  "oktober",
  "november",
  "desember",
];

/** "486 500,00" -> 48650000. */
const nbAmount = (text: string) => Math.round(Number(text.replace(/[\s\u00a0]/g, "").replace(",", ".")) * 100);
const kr = (minor: number) =>
  `${(minor / 100).toLocaleString("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr`;

type Month = { year: number; month: number; revenueMinor: number; costsMinor: number };

function dashboardAnswer(months: Month[], over30Minor: number): string {
  const october = months.find((m) => m.year === 2026 && m.month === 10);
  const best = [...months].sort((a, b) => b.revenueMinor - a.revenueMinor)[0];
  return (
    `Oktober 2026: inntekter ${october ? kr(october.revenueMinor) : "ukjent"}, kostnader ${october ? kr(october.costsMinor) : "ukjent"}. ` +
    `Høyest inntekt: ${best ? `${MONTH_NAMES[best.month - 1]} ${best.year}, ${kr(best.revenueMinor)}` : "ukjent"}. ` +
    `Forfalt mer enn 30 dager: ${kr(over30Minor)}.`
  );
}

/** What a screenshot gives: the shape, not the numbers. Only text in the snapshot is exact. */
function approximateAnswer(over30Minor: number): string {
  return (
    "Ut fra skjermbildet: oktober 2026 ser ut til å ha inntekter rundt 490 000 kr og kostnader rundt 320 000 kr; " +
    "høyest inntekt ser ut til å være desember 2025, rundt 510 000 kr (avlest fra søylehøyden, ikke eksakt). " +
    `Forfalt mer enn 30 dager: ${kr(over30Minor)}.`
  );
}

const over30From = (snapshot: string, pattern: RegExp) => {
  const found = snapshot.match(pattern)?.[1];
  if (!found) throw new Error(`The snapshot has no overdue-over-30 figure (${pattern}).`);
  return nbAmount(found);
};

export async function scriptDashboardRawHover(session: Session, rec: Recorder): Promise<string> {
  const b = browser(session, rec);
  const page = await b.look();
  const over30 = over30From(page, /Over 30 dager\) NOK ([\d \u00a0]+,\d{2})/);
  const months: Month[] = [];
  // The bars have no refs: the script targets each month's hover area by CSS
  // selector, which a model would first have to discover.
  const readMonth = async (year: number, index: number) => {
    await rec.call("browser_hover", {
      element: `${MONTH_NAMES[index]} ${year}`,
      target: `.recharts-hit-layer rect:nth-child(${index + 1})`,
    });
    const shown = await b.look();
    const revenue = shown.match(/Inntekter: ([\d \u00a0]+,\d{2})/)?.[1];
    const costs = shown.match(/Kostnader: ([\d \u00a0]+,\d{2})/)?.[1];
    if (!revenue || !costs) throw new Error(`No tooltip after hovering month ${index + 1} of ${year}.`);
    months.push({ year, month: index + 1, revenueMinor: nbAmount(revenue), costsMinor: nbAmount(costs) });
  };
  for (let index = 0; index < 10; index += 1) await readMonth(2026, index);
  await b.select(refIn(page, /- combobox \[ref=/), "År", ["2025"]);
  for (const index of [10, 11]) await readMonth(2025, index);
  return dashboardAnswer(months, over30);
}

export async function scriptDashboardRawScreenshot(session: Session, rec: Recorder): Promise<string> {
  const b = browser(session, rec);
  const page = await b.look();
  const over30 = over30From(page, /Over 30 dager\) NOK ([\d \u00a0]+,\d{2})/);
  await rec.call("browser_take_screenshot", { fullPage: true });
  await b.select(refIn(page, /- combobox \[ref=/), "År", ["2025"]);
  await rec.call("browser_take_screenshot", { fullPage: true });
  return approximateAnswer(over30);
}

/** Bar centres of the canvas chart, from its known layout (best case: the script knows it). */
async function canvasBars(session: Session) {
  const box = await session.evaluate<{ x: number; y: number; width: number; height: number }>(
    "(() => { const r = document.querySelector('.result-canvas').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })()",
  );
  const left = 8;
  const column = (box.width - left) / 12;
  return (index: number) => ({
    x: Math.round(box.x + left + (index + 0.5) * column),
    y: Math.round(box.y + box.height - 12),
  });
}

async function gridYear(b: ReturnType<typeof browser>, page: string, year: number) {
  await b.click(refIn(page, /button "2026 ▾"/), "År");
  const menu = await b.look();
  await b.click(refIn(menu, new RegExp(`button "${year}" \\[ref=`)), String(year));
}

export async function scriptDashboardGridHover(session: Session, rec: Recorder): Promise<string> {
  const b = browser(session, rec);
  const page = await b.look();
  const over30 = over30From(page, /Over 30 dager ([\d \u00a0]+,\d{2})/);
  const bar = await canvasBars(session);
  const months: Month[] = [];
  // The tooltip names no month: the script knows which bar it is over.
  const readMonth = async (year: number, index: number) => {
    await rec.call("browser_mouse_move_xy", bar(index));
    const shown = await b.look();
    // The tooltip and the year summary read the same way; the tooltip is the
    // extra one, above the summary.
    const all = [...shown.matchAll(/Inntekter ([\d \u00a0]+,\d{2}) Kostnader ([\d \u00a0]+,\d{2}) Resultat/g)];
    const tip = all.length >= 2 ? all[0] : undefined;
    if (!tip) throw new Error(`No tooltip after moving to bar ${index + 1} of ${year}.`);
    months.push({ year, month: index + 1, revenueMinor: nbAmount(tip[1]!), costsMinor: nbAmount(tip[2]!) });
  };
  for (let index = 0; index < 10; index += 1) await readMonth(2026, index);
  await gridYear(b, page, 2025);
  for (const index of [10, 11]) await readMonth(2025, index);
  return dashboardAnswer(months, over30);
}

export async function scriptDashboardGridScreenshot(session: Session, rec: Recorder): Promise<string> {
  const b = browser(session, rec);
  const page = await b.look();
  const over30 = over30From(page, /Over 30 dager ([\d \u00a0]+,\d{2})/);
  await rec.call("browser_take_screenshot", { fullPage: true });
  await gridYear(b, page, 2025);
  await rec.call("browser_take_screenshot", { fullPage: true });
  return approximateAnswer(over30);
}

export async function scriptDashboardAcc(_session: Session, rec: Recorder): Promise<string> {
  type Entry = {
    component: string;
    series?: { id: string; points: [string, number][] }[];
    buckets?: { id: string; amountMinor: number }[];
  };
  const snapshot = JSON.parse(await rec.call("snapshot")) as Entry[];
  const trend = snapshot.find((entry) => entry.component === "trend-chart");
  const aging = snapshot.find((entry) => entry.component === "aging-chart");
  const points = (id: string) => new Map(trend?.series?.find((s) => s.id === id)?.points ?? []);
  const revenue = points("revenue");
  const costs = points("costs");
  const months: Month[] = [...revenue.entries()].map(([period, value]) => ({
    year: Number(period.slice(0, 4)),
    month: Number(period.slice(5, 7)),
    revenueMinor: value,
    costsMinor: costs.get(period) ?? 0,
  }));
  const over30 = aging?.buckets?.find((bucket) => bucket.id === "over-30")?.amountMinor;
  if (over30 === undefined || months.length === 0)
    throw new Error("The bridge snapshot lacks the trend or aging data.");
  return dashboardAnswer(months, over30);
}

// ---------------------------------------------------------------------------
// Workflows. Replica scripts go invoice by invoice, match by match, task by
// task, as a person would; the refs of a list stay valid while its rows stay
// on the page, so the script takes a new snapshot only where new elements
// appear (an opened invoice, a pick dialog) or the page must be read.
// ---------------------------------------------------------------------------

/**
 * The ref of the first `item` in the table row that holds a cell reading
 * `cellText`. Rows have no name of their own in the snapshot; the cells do.
 */
export function refInRow(snapshot: string, cellText: string, item: RegExp): string {
  const lines = snapshot.split("\n");
  const cell = lines.findIndex((line) => line.includes(`cell "${cellText}"`));
  if (cell < 0) throw new Error(`No cell "${cellText}" in the snapshot.`);
  let row = cell;
  while (row > 0 && !/- row\b/.test(lines[row]!)) row -= 1;
  const indent = lines[row]!.search(/\S/);
  for (let i = row + 1; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (line.search(/\S/) <= indent) break;
    const found = item.test(line) ? line.match(/\[ref=([\w-]+)\]/)?.[1] : undefined;
    if (found) return found;
  }
  throw new Error(`No ${item} in the row of "${cellText}".`);
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function scriptInboxRaw(session: Session, rec: Recorder): Promise<void> {
  const b = browser(session, rec);
  const list = await b.look();
  const open = async (number: string) => {
    await b.click(refIn(list, new RegExp(`cell "${escape(number)}" \\[ref=`)), `Faktura ${number}`);
    return b.look();
  };
  const field = (form: string, name: string) => refIn(form, new RegExp(`- textbox "${name}" \\[ref=`));
  const book = (form: string) => b.click(refIn(form, /button "Bokfør" \[ref=/), "Bokfør");

  // Booked as they stand.
  for (const number of ["8841", "H-2610"]) await book(await open(number));
  // Gross read wrong.
  let form = await open("55120");
  await b.type(field(form, "Totalt beløp"), "Totalt beløp", "9 375,00");
  await book(form);
  // Invoice number read wrong.
  form = await open("447l");
  await b.type(field(form, "Fakturanummer"), "Fakturanummer", "4471");
  await book(form);
  // No coding: account, then VAT, through the pick dialogs. The two pickers on
  // the line are the second and third "[object Object]" boxes.
  form = await open("3318");
  await b.click(refIn(form, /- listbox "\[object Object\] \(Ikke valgt\)" \[ref=/), "Kostnadskonto");
  let dialog = await b.look();
  await b.click(refIn(dialog, /cell "6810"/), "6810");
  await b.click(refIn(form, /listbox "\[object Object\] 0:/), "Mva");
  dialog = await b.look();
  await b.click(refIn(dialog, /cell "1: \(25%\)/), "25 %");
  await book(form);
  // The copy of 3307 (the first 3307 row; the second is the booked original).
  form = await open("3307");
  await b.click(refIn(form, /button "Avvis" \[ref=/), "Avvis");
  const ask = await b.look();
  await b.click(refIn(ask, /button "Ja" \[ref=/), "Ja");
  for (const number of ["9102", "7781"]) await book(await open(number));
}

type BridgeSnapshot = { ref: string; component: string; label?: string; kind?: string }[];
const refFrom = (snapshot: BridgeSnapshot, component: string) => {
  const found = snapshot.find((entry) => entry.component === component);
  if (!found) throw new Error(`The bridge snapshot has no ${component}`);
  return found.ref;
};

export async function scriptInboxAcc(_session: Session, rec: Recorder): Promise<void> {
  const snapshot = JSON.parse(await rec.call("snapshot")) as BridgeSnapshot;
  const inbox = refFrom(snapshot, "supplier-invoice-inbox");
  // Approving and rejecting are a person's: the agent leaves the inbox ready
  // and the copy flagged (the inbox flags it against the booked invoice).
  await rec.call(
    "act",
    {
      steps: [
        { ref: inbox, action: "correctField", args: ["si-02", "grossMinor", 937_500] },
        { ref: inbox, action: "confirmField", args: ["si-03", "dueDate"] },
        { ref: inbox, action: "correctField", args: ["si-04", "invoiceNumber", "4471"] },
        { ref: inbox, action: "proposeCoding", args: ["si-05", "6810", "MVA25"] },
      ],
    },
    true,
  );
}

export async function scriptReconcileRaw(session: Session, rec: Recorder): Promise<void> {
  const b = browser(session, rec);
  const page = await b.look();
  const box = (rowText: string) => refInRow(page, rowText, /- checkbox \[ref=/);
  const reconcile = refIn(page, /- button "done_all" \[ref=/);
  const pairs: [string[], string[]][] = [
    [["Innbetaling Brattli AS"], ["Faktura 1041 Brattli AS"]],
    [["Husleie Nordlys Eiendom AS"], ["Husleie oktober Nordlys Eiendom AS"]],
    [["Innbetaling Fjelltopp Bygg AS"], ["Faktura 1042 Fjelltopp Bygg AS"]],
    [["Innbetaling Lindholm Regnskap AS"], ["Faktura 1044 Lindholm Regnskap AS"]],
    [["Innbetaling Havbris Design AS"], ["Faktura 1043 Havbris Design AS"]],
    [["Solberg Maskin AS, delbetaling", "Solberg Maskin AS, restbetaling"], ["Faktura 1045 Solberg Maskin AS"]],
    [["Betaling Kontorrekvisita AS"], ["Leverandørfaktura 8841 Kontorrekvisita AS"]],
    [["Betaling Fjordkraft Strøm AS"], ["Leverandørfaktura 55120 Fjordkraft Strøm AS"]],
    [["Skatteetaten skattetrekk"], ["Skattetrekk september"]],
    [["Betaling Datahjelp Norge AS"], ["Leverandørfaktura 3318 Datahjelp Norge AS"]],
  ];
  for (const [lines, posts] of pairs) {
    for (const text of [...lines, ...posts]) await b.click(box(text), text);
    await b.click(reconcile, "Avstem");
  }
  // Read what is left: one bank line, two posts.
  await b.look();
}

export async function scriptReconcileAcc(_session: Session, rec: Recorder): Promise<void> {
  const snapshot = JSON.parse(await rec.call("snapshot")) as BridgeSnapshot;
  const ref = refFrom(snapshot, "bank-reconciliation");
  const pairs: [string[], string[]][] = [
    [["b01"], ["p01"]],
    [["b02"], ["p08"]],
    [["b03"], ["p02"]],
    [["b04"], ["p04"]],
    [["b05"], ["p03"]],
    [["b06", "b09"], ["p05"]],
    [["b07"], ["p06"]],
    [["b08"], ["p07"]],
    [["b10"], ["p12"]],
    [["b11"], ["p09"]],
  ];
  await rec.call(
    "act",
    { steps: pairs.map(([lines, posts]) => ({ ref, action: "suggestMatch", args: [lines, posts] })) },
    true,
  );
}

export async function scriptCloseRaw(session: Session, rec: Recorder): Promise<void> {
  const b = browser(session, rec);
  // The period table is on the page: October reads "Åpen".
  const page = await b.look();
  if (!/cell "oktober 2026"[\s\S]*?cell "Åpen"/.test(page)) throw new Error("October is not shown as open.");
  const tick = (title: string) => b.click(refInRow(page, title, /- checkbox \[ref=/), title);
  await tick("Kontroller at oktober er åpen for bokføring");
  await b.type(refIn(page, /- textbox "Bilagsdato" \[ref=/), "Bilagsdato", "2026-10-31");
  // Account, debit, credit on each row: the inputs have no names.
  const unnamed = /- textbox \[ref=/;
  await b.type(refIn(page, unnamed, 0), "Konto, linje 1", "6010");
  await b.type(refIn(page, unnamed, 1), "Debet, linje 1", "12500,00");
  await b.type(refIn(page, unnamed, 3), "Konto, linje 2", "1290");
  await b.type(refIn(page, unnamed, 5), "Kredit, linje 2", "12500,00");
  await b.click(refIn(page, /button "Bokfør bilag" \[ref=/), "Bokfør bilag");
  // Read the answer before ticking the task.
  const after = await b.look();
  if (!after.includes("Bilaget er bokført.")) throw new Error("The voucher was not posted.");
  await tick("Bokfør avskrivning for oktober");
  await tick("Kontroller saldobalansen");
}

export async function scriptCloseAcc(_session: Session, rec: Recorder): Promise<void> {
  const snapshot = JSON.parse(await rec.call("snapshot")) as BridgeSnapshot;
  const checklist = refFrom(snapshot, "close-checklist");
  const voucher = refFrom(snapshot, "voucher-composer");
  await rec.call(
    "act",
    {
      steps: [
        { ref: refFrom(snapshot, "period-lock"), action: "assertPostingAllowed", args: ["2026-10-31"] },
        { ref: checklist, action: "completeTask", args: ["period"] },
        { ref: refFrom(snapshot, "financial-date"), action: "setDate", args: ["2026-10-31"] },
        { ref: voucher, action: "addLine", args: ["6010", null, 1_250_000, 0] },
        { ref: voucher, action: "addLine", args: ["1290", null, 0, 1_250_000] },
        { ref: voucher, action: "assertPostable", args: [] },
        { ref: refFrom(snapshot, "button"), action: "press", args: [] },
        { ref: checklist, action: "completeTask", args: ["depreciation"] },
        { ref: checklist, action: "completeTask", args: ["balance"] },
      ],
    },
    true,
  );
}

/** Keyed by page id, or "page:strategy" where a page has several strategies. */
export const SCRIPTS: Record<string, (session: Session, rec: Recorder) => Promise<string | void>> = {
  semantic: scriptInvoiceSemantic,
  acc: scriptInvoiceAcc,
  "voucher-raw": scriptVoucherRaw,
  "voucher-grid": scriptVoucherGrid,
  "voucher-acc": scriptVoucherAcc,
  "supplier-invoice-raw": scriptSupplierInvoiceRaw,
  "supplier-invoice-acc": scriptSupplierInvoiceAcc,
  "sales-invoice-raw": scriptSalesInvoiceRaw,
  "sales-invoice-acc": scriptSalesInvoiceAcc,
  "dashboard-raw:hover": scriptDashboardRawHover,
  "dashboard-raw:screenshot": scriptDashboardRawScreenshot,
  "dashboard-grid:hover": scriptDashboardGridHover,
  "dashboard-grid:screenshot": scriptDashboardGridScreenshot,
  "dashboard-acc": scriptDashboardAcc,
  "inbox-raw": scriptInboxRaw,
  "inbox-acc": scriptInboxAcc,
  "reconcile-raw": scriptReconcileRaw,
  "reconcile-acc": scriptReconcileAcc,
  "close-raw": scriptCloseRaw,
  "close-acc": scriptCloseAcc,
};

export const scriptFor = (page: string, strategy: string) =>
  SCRIPTS[strategy === "default" ? page : `${page}:${strategy}`];
