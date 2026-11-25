import { localize } from "@booki-aui/core/messages";
import { approvalState } from "@booki-aui/core/approval";
import { summarizeClose } from "@booki-aui/core/close";
import { invoiceIssues } from "@booki-aui/core/invoice";
import { batchIssues, currentApprovals } from "@booki-aui/core/payment-batch";
import { suggestMatches, type BankLine, type OpenPost, type ReconciliationMatch } from "@booki-aui/core/reconciliation";
import { voucherIssues, type AccountOption, type VoucherLine } from "@booki-aui/core/voucher";
import { NO_VAT_SCHEMA_EXAMPLE, DRAFT_VAT_FILING } from "@booki-aui/core/vat-return";
import { EMPTY_WORKPAPER } from "@booki-aui/core/audit";
import {
  BookiAccessProvider,
  BookiLocaleProvider,
  AgedBalances,
  AgentPresence,
  DataTable,
  type DataTableColumn,
  AuditWorkpaper,
  EvidenceList,
  ExpenseClaim,
  FixedAssetRegister,
  LedgerTable,
  SupplierInvoiceInbox,
  VatReturn,
  ApprovalChain,
  BankReconciliation,
  CloseChecklist,
  InvoiceEditor,
  PaymentBatch,
  PeriodLock,
  useBookiLocale,
  VoucherComposer,
  type AgentPresenceController,
  type ApprovalLevel,
  type ApprovalRequest,
  type CloseTask,
  type Invoice,
  type PaymentBatchData,
  type PeriodState,
} from "@booki-aui/react";
import { Button as GateButton } from "@ui-sdk/react/button";
import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { agent } from "@/agent";
import { SiteAgentCursor } from "@/components/site-agent-cursor";
import {
  ASSETS,
  AUDIT_MATERIALITY,
  AUDIT_POPULATION,
  CHART_NUMBERS,
  EVIDENCE_LINKED,
  EVIDENCE_POOL,
  EXPENSE_CLAIM,
  EXPENSE_POLICY,
  LEDGER,
  LEDGER_DOCUMENTS,
  RECEIVABLES,
  SUPPLIER_INVOICES,
  TICK_MARKS,
  VAT_TRANSACTIONS,
} from "@/lib/demo-data";
import { Button } from "@/components/ui/button";
import { ErpDashboard } from "@/components/erp-dashboard";

type Tone = "good" | "bad" | "neutral";
type LogRow = { id: number; text: string; tone: Tone; word: string };
type ActResult = { ok: boolean; error?: { message: string } };
type ScreenId =
  | "overview"
  | "inbox"
  | "vouchers"
  | "invoices"
  | "expenses"
  | "payments"
  | "bank"
  | "approvals"
  | "close"
  | "vat"
  | "ledger"
  | "journal"
  | "receivables"
  | "assets"
  | "audit";
type Group = "Daily" | "Control" | "Reports";

const SCREENS: { id: ScreenId; group: Group; title: string; note: string }[] = [
  {
    id: "overview",
    group: "Daily",
    title: "Oversikt",
    note: "Tallene for oktober, og det som venter på en person, på tvers av regnskapet.",
  },
  {
    id: "inbox",
    group: "Daily",
    title: "Leverandørfakturaer",
    note: "Tre skannede fakturaer. Én har en usikker sum, og én er samme faktura to ganger.",
  },
  {
    id: "vouchers",
    group: "Daily",
    title: "Bilag",
    note: "Leverandørfaktura fra Kontorrekvisita AS, 15 500,00 inkludert 25 % mva.",
  },
  {
    id: "invoices",
    group: "Daily",
    title: "Utgående faktura",
    note: "Et utkast til Brattli. Summene kommer fra linjene.",
  },
  {
    id: "expenses",
    group: "Daily",
    title: "Utlegg",
    note: "Ninas reiseregning for oktober, kontrollert mot reglementet.",
  },
  {
    id: "payments",
    group: "Daily",
    title: "Betalinger",
    note: "Fredagens betalingsoppdrag. Det trenger to personer, og ingen av dem kan være den som laget det.",
  },
  {
    id: "bank",
    group: "Daily",
    title: "Bankavstemming",
    note: "En regel avstemte det som var entydig. Resten blir foreslått og attestert.",
  },
  {
    id: "approvals",
    group: "Control",
    title: "Attestering",
    note: "Leverandørfaktura 2041, 125 000,00. Over 100 000,00 må også økonomisjefen godkjenne.",
  },
  {
    id: "close",
    group: "Control",
    title: "Periodeavslutning",
    note: "Oktober 2026. Oppgavene i rekkefølge, så lukkes perioden.",
  },
  {
    id: "vat",
    group: "Control",
    title: "Mva-melding",
    note: "Termin 5, september og oktober. Postoppsettet er et eksempel, ikke det offisielle formatet.",
  },
  {
    id: "ledger",
    group: "Reports",
    title: "Hovedbok",
    note: "Saldobalanse. Åpne en konto for å se hva som ligger der.",
  },
  {
    id: "journal",
    group: "Reports",
    title: "Bilagsoversikt",
    note: "Alle posteringer. Sorter, søk, filtrer, velg kolonner og last ned.",
  },
  {
    id: "receivables",
    group: "Reports",
    title: "Kundereskontro",
    note: "Hvem som skylder hva, og hvor lenge, per 31. oktober.",
  },
  { id: "assets", group: "Reports", title: "Anleggsmidler", note: "Registeret og avskrivningene for oktober." },
  {
    id: "audit",
    group: "Reports",
    title: "Revisjon",
    note: "Test av salget i oktober: vesentlighet, et utvalg og to signaturer.",
  },
];
const GROUP_LABEL: Record<Group, string> = { Daily: "Daglig", Control: "Kontroll", Reports: "Rapporter" };
const GROUPS: Group[] = ["Daily", "Control", "Reports"];

const PEOPLE: Record<string, string> = {
  nina: "Nina, regnskapsfører",
  kari: "Kari, leder",
  per: "Per, leder",
  cfo: "Astrid, økonomisjef",
};
/** Who may do what: the accountant prepares, managers approve, the CFO closes and releases. */
const ACTORS: Record<string, { id: string; roles: string[] }> = {
  nina: { id: "nina", roles: ["accountant"] },
  kari: { id: "kari", roles: ["manager"] },
  per: { id: "per", roles: ["manager"] },
  cfo: { id: "cfo", roles: ["controller", "auditor"] },
};
const nameOf = (id: string) => (id === "agent" ? "agenten" : (PEOPLE[id]?.split(",")[0] ?? id));
/** Status words from the rules, as the screen says them. */
const STATUS: Record<string, string> = {
  draft: "utkast",
  submitted: "sendt inn",
  approved: "godkjent",
  rejected: "avvist",
  paid: "utbetalt",
  ready: "klar",
  pending: "venter",
  escalated: "eskalert",
};
const status = (value: string) => STATUS[value] ?? value;

const CHART: AccountOption[] = [
  { number: "2400", name: "Leverandørgjeld" },
  { number: "2711", name: "Inngående mva" },
  {
    number: "6800",
    name: "Kontorrekvisita",
    vatCodes: ["MVA25", "MVA15", "MVA0"],
    defaultVatCode: "MVA25",
    requiresDepartment: true,
  },
];
const DEPARTMENTS = [
  { code: "10", name: "Oslo" },
  { code: "20", name: "Bergen" },
];
const POSTING_DATE = "2026-10-31";

/** The journal as table columns: the same definitions serve the screen, the agent and the CSV. */
const JOURNAL_COLUMNS: DataTableColumn<(typeof LEDGER)[number]>[] = [
  { id: "voucher", header: "Bilag", value: (e) => e.voucherNumber },
  { id: "date", header: "Dato", kind: "date", value: (e) => e.date },
  { id: "account", header: "Konto", value: (e) => `${e.account} ${e.accountName}` },
  { id: "description", header: "Tekst", value: (e) => e.description },
  { id: "debit", header: "Debet", kind: "money", value: (e) => e.debitMinor || null },
  { id: "credit", header: "Kredit", kind: "money", value: (e) => e.creditMinor || null },
  { id: "entry", header: "Post-ID", value: (e) => e.id, hidden: true, sortable: false },
];

const BANK: BankLine[] = [
  { id: "b1", date: "2026-10-01", description: "Nordlys AS", amountMinor: 1_250_000, reference: "10012342" },
  { id: "b2", date: "2026-10-02", description: "Samlebetaling Brattli", amountMinor: 3_000_000 },
  { id: "b3", date: "2026-10-03", description: "Husleie oktober", amountMinor: -1_500_000 },
  { id: "b4", date: "2026-10-04", description: "Mobilbetaling 48213", amountMinor: 49_900 },
  { id: "b5", date: "2026-10-04", description: "Mobilbetaling 48219", amountMinor: 49_900 },
];
const POSTS: OpenPost[] = [
  { id: "p1", date: "2026-09-20", description: "Faktura 1001", amountMinor: 1_250_000, reference: "10012342" },
  { id: "p2", date: "2026-09-21", description: "Faktura 1002", amountMinor: 1_000_000 },
  { id: "p3", date: "2026-09-22", description: "Faktura 1003", amountMinor: 2_000_000 },
  { id: "p4", date: "2026-09-25", description: "Leverandørfaktura husleie", amountMinor: -1_500_000 },
  { id: "p5", date: "2026-09-28", description: "Faktura 1004", amountMinor: 49_900 },
  { id: "p6", date: "2026-09-29", description: "Faktura 1005", amountMinor: 49_900 },
];

const DRAFT_INVOICE: Invoice = {
  id: "draft-1",
  kind: "invoice",
  status: "draft",
  currency: "NOK",
  lines: [
    {
      id: "l1",
      description: "Rådgivning, oktober",
      quantityMilli: 12_500,
      unitPriceMinor: 145_000,
      taxCategory: "S",
      taxRateBp: 2500,
    },
  ],
};

const BATCH: PaymentBatchData = {
  id: "batch-7",
  status: "draft",
  debitAccount: "1503 40 12345",
  valueDate: "2026-11-06",
  currency: "NOK",
  preparedBy: "nina",
  approvals: [],
  items: [
    {
      id: "p1",
      creditorName: "Kontorrekvisita AS",
      amountMinor: 1_550_000,
      creditorAccount: "8601 11 17947",
      reference: "10012342",
    },
    {
      id: "p2",
      creditorName: "Brattli",
      amountMinor: 438_000,
      creditorAccount: "1234 56 78903",
      reference: "20045519",
    },
    {
      id: "p3",
      creditorName: "Kontorrekvisita AS",
      amountMinor: 1_550_000,
      creditorAccount: "86011117947",
      reference: "10012342",
    },
  ],
};

const CHAIN: ApprovalLevel[] = [
  {
    id: "manager",
    name: "Leder",
    approvers: [{ id: "kari", limitMinor: 20_000_000, substituteId: "per" }],
    escalateTo: { id: "cfo" },
  },
  { id: "cfo", name: "Økonomisjef", fromMinor: 10_000_000, approvers: [{ id: "cfo" }] },
];
const REQUEST: ApprovalRequest = { id: "inv-2041", amountMinor: 12_500_000, requesterId: "nina", decisions: [] };

const TASKS: CloseTask[] = [
  { id: "bank", title: "Avstem banken", status: "open", needsSignOff: true },
  { id: "accruals", title: "Bokfør periodiseringer", status: "open" },
  { id: "vat", title: "Klargjør mva-meldingen", status: "open", dependsOn: ["bank", "accruals"], needsSignOff: true },
  { id: "lock", title: "Lukk perioden", status: "open", dependsOn: ["vat"] },
];
const PERIODS: PeriodState[] = [
  { code: "2025", status: "hard-closed" },
  { code: "2026-09", status: "soft-closed" },
];

// The names an agent addresses the controls by.
const REF = {
  voucher: "Bilag",
  post: "Bokfør bilag",
  invoice: "Faktura",
  batch: "Betalingsbunt",
  bank: "Bankavstemming",
  approval: "Godkjenning",
  close: "Periodeavslutning",
  periods: "Perioder",
  inbox: "Leverandørfakturaer",
  evidence: "Vedlegg",
  expenses: "Reiseregning",
  ledger: "Hovedbok",
  journal: "Posteringer",
  receivables: "Aldersfordelte kundefordringer",
  vat: "Mva-melding",
  assets: "Anleggsregister",
  audit: "Arbeidspapir",
};

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * A small accounting product built only from Booki controls: the screens an
 * ERP has, one signed-in person, and an agent that works whichever screen is
 * open. The data is made up; every agent step is a real action on a real control.
 */
export function ErpPage() {
  return (
    <BookiLocaleProvider country="NO">
      <Erp />
    </BookiLocaleProvider>
  );
}

function Erp() {
  const { profile } = useBookiLocale();
  const [screen, setScreen] = useState<ScreenId>("overview");
  const [actor, setActor] = useState("kari");
  const [lines, setLines] = useState<VoucherLine[]>([]);
  const [postedCount, setPostedCount] = useState(0);
  const [invoice, setInvoice] = useState(DRAFT_INVOICE);
  const [batch, setBatch] = useState(BATCH);
  const [matches, setMatches] = useState<ReconciliationMatch[]>(() => suggestMatches(BANK, POSTS));
  const [request, setRequest] = useState(REQUEST);
  const [tasks, setTasks] = useState(TASKS);
  const [periods, setPeriods] = useState(PERIODS);
  const [supplierInvoices, setSupplierInvoices] = useState(SUPPLIER_INVOICES);
  const [evidence, setEvidence] = useState(EVIDENCE_LINKED);
  const [claim, setClaim] = useState(EXPENSE_CLAIM);
  const [filing, setFiling] = useState(DRAFT_VAT_FILING);
  const [assets, setAssets] = useState(ASSETS);
  const [runs, setRuns] = useState<string[]>([]);
  const [workpaper, setWorkpaper] = useState(EMPTY_WORKPAPER);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogRow[]>([]);
  const [marks, setMarks] = useState(0);
  const presence = useRef<AgentPresenceController | null>(null);
  const seq = useRef(0);

  const rules = {
    accounts: CHART,
    vatCodes: profile.tax.codes.map((code) => code.code),
    departments: DEPARTMENTS,
    periods,
  };
  const voucherProblems = voucherIssues(lines, rules, { date: POSTING_DATE });
  const postable = voucherProblems.length === 0;
  const syncMarks = () => setMarks(presence.current?.marked().length ?? 0);

  function say(text: string, tone: Tone, word: string) {
    seq.current += 1;
    const id = seq.current;
    setLog((rows) => [...rows, { id, text, tone, word }]);
  }

  /** One agent step: send it, show the library's answer, give the eye a moment. */
  async function step(text: string, ref: string, action: string, args: unknown[] = []) {
    const r = (await agent.act({ steps: [{ ref, action, args }] } as never)) as ActResult;
    say(r.ok ? text : (r.error?.message ?? "Refused"), r.ok ? "good" : "bad", r.ok ? "done" : "refused");
    syncMarks();
    await wait(480);
    return r.ok;
  }

  const find = <T,>(label: string) => agent.snapshot().find((c) => c.label === label) as unknown as T | undefined;

  const scripts: Record<Exclude<ScreenId, "overview">, () => Promise<void>> = {
    vouchers: async () => {
      await step("Voucher: cleared the draft", REF.voucher, "clear");
      await step("Voucher: debit 6800 Kontorrekvisita 12 400,00", REF.voucher, "addLine", [
        "6800",
        undefined,
        1_240_000,
        0,
      ]);
      await step("Voucher: debit 2711 Inngående mva 3 100,00", REF.voucher, "addLine", ["2711", undefined, 310_000, 0]);
      await step("Voucher: credit 2400 Leverandørgjeld 15 500,00", REF.voucher, "addLine", [
        "2400",
        undefined,
        0,
        1_550_000,
      ]);
      if (!(await step("Voucher: postable", REF.voucher, "assertPostable"))) {
        const expense = find<{ lines: VoucherLine[] }>(REF.voucher)?.lines.find((line) => line.account === "6800");
        if (expense) {
          await step("Voucher: set department 10 Oslo on the 6800 line", REF.voucher, "setDepartment", [
            expense.id,
            "10",
          ]);
          await step("Voucher: checked again. Postable.", REF.voucher, "assertPostable");
        }
      }
      await step("Posted the voucher", REF.post, "press");
    },
    invoices: async () => {
      await step("Invoice: added travel, 2 380,00 at 25%", REF.invoice, "addLine", [
        "Reiseutlegg",
        1000,
        238_000,
        "S",
        2500,
      ]);
      await step("Invoice: 1.5 hours is not a whole quantity", REF.invoice, "setLine", ["l1", { quantityMilli: 1.5 }]);
      await step("Invoice: 5% discount on the consulting line", REF.invoice, "setLine", ["l1", { discountBp: 500 }]);
      await step("Invoice: nothing stops it from being finalized", REF.invoice, "assertFinalizable");
      await step("Finalized the invoice", REF.invoice, "finalize");
    },
    payments: async () => {
      const issue = find<{ issues: string[] }>(REF.batch)?.issues[0];
      if (issue) {
        say(issue, "neutral", "found");
        await wait(480);
        await step("Payments: removed the duplicate, p3", REF.batch, "removePayment", ["p3"]);
      }
      await step("Payments: ready to release", REF.batch, "assertReleasable");
      await step("Approved the batch", REF.batch, "approve");
    },
    bank: async () => {
      await step("Bank: matched the Brattli payment to invoices 1002 and 1003", REF.bank, "suggestMatch", [
        "b2",
        ["p2", "p3"],
      ]);
      say(
        "Bank: left the two mobile payments. Same amount, no reference, nothing to tell them apart.",
        "neutral",
        "left",
      );
      await wait(480);
      await step("Approved its own match", REF.bank, "approveMatch", ["m1"]);
    },
    approvals: async () => {
      await step("Approvals: invoice 2041 is approved", REF.approval, "assertApproved");
      await step("Approved invoice 2041", REF.approval, "approve");
    },
    inbox: async () => {
      await step("Inbox: the Brattli total is 4 380,00 on the PDF, not 4 381,00", REF.inbox, "correctField", [
        "si-2",
        "grossMinor",
        438_000,
      ]);
      await step("Inbox: confirmed Brattli's organisation number", REF.inbox, "confirmField", [
        "si-2",
        "supplierOrgNumber",
      ]);
      await step("Inbox: coded Brattli to 6340", REF.inbox, "proposeCoding", ["si-2", "6340", "MVA25"]);
      await step("Inbox: Brattli is ready for approval", REF.inbox, "assertApprovable", ["si-2"]);
      await step("Inbox: Kontorrekvisita 8841 is ready for approval", REF.inbox, "assertApprovable", ["si-1"]);
      await step("Approved the Brattli invoice", REF.inbox, "approve", ["si-2"]);
    },
    expenses: async () => {
      await step("Expenses: dinner corrected to the receipt, 790,00", REF.expenses, "setLine", [
        "l2",
        { amountMinor: 79_000 },
      ]);
      await step("Expenses: mileage amount set by hand", REF.expenses, "setLine", ["l3", { amountMinor: 1 }]);
      await step("Expenses: checked against the policy", REF.expenses, "assertSubmittable");
      await step("Submitted the claim", REF.expenses, "submit");
    },
    vat: async () => {
      await step("VAT: opened outgoing VAT at the high rate", REF.vat, "openBox", ["sales-high-tax"]);
      await step("VAT: back to the boxes", REF.vat, "back");
      await step("VAT: the return is ready", REF.vat, "assertReady");
      await step("Submitted the VAT return", REF.vat, "submit");
    },
    ledger: async () => {
      await step("Ledger: opened 6800 Kontorrekvisita", REF.ledger, "openAccount", ["6800"]);
      await step("Ledger: opened voucher 2004 and read every line", REF.ledger, "showVoucher", ["2004"]);
      await step("Ledger: back to 6800", REF.ledger, "back");
      await step("Ledger: compared September with October on 6800", REF.ledger, "explainVariance", [
        "6800",
        "2026-09",
        "2026-10",
      ]);
      await step("Ledger: back to the trial balance", REF.ledger, "back");
    },
    journal: async () => {
      await step("Journal: searched for Kontorrekvisita", REF.journal, "setSearch", ["Kontorrekvisita"]);
      await step("Journal: largest debit first", REF.journal, "setSort", ["debit", "desc"]);
      await step("Journal: only October", REF.journal, "setFilter", ["date", "2026-10"]);
    },
    receivables: async () => {
      await step("Receivables: listed customers more than 60 days overdue", REF.receivables, "overdue", [60]);
      await step("Receivables: opened Havblikk Hotell", REF.receivables, "openParty", ["c3"]);
    },
    assets: async () => {
      await step("Assets: October can be depreciated", REF.assets, "assertRunnable", ["2026-10"]);
      await step("Assets: proposed October's depreciation", REF.assets, "proposeRun", ["2026-10"]);
      await step("Confirmed the depreciation run", REF.assets, "confirmRun");
    },
    audit: async () => {
      await step("Audit: drew a monetary-unit sample of four, seed okt-2026", REF.audit, "drawSample", [
        "monetary-unit",
        { size: 4, seed: "okt-2026" },
      ]);
      const first = find<{ workpaper: { items: { id: string }[] } }>(REF.audit)?.workpaper.items[0]?.id;
      if (first) {
        await step(`Audit: ${first} agrees to the invoice`, REF.audit, "setResult", [first, "ok"]);
        await step(`Audit: tick mark on ${first}`, REF.audit, "setTickMark", [first, "✓"]);
      }
      await step("Audit: ready for sign-off", REF.audit, "assertReadyForSignOff");
      await step("Signed as preparer", REF.audit, "signAsPreparer");
    },
    close: async () => {
      await step("Period: 30 September can be posted to", REF.periods, "assertPostingAllowed", ["2026-09-30"]);
      await step("Period: 31 October can be posted to", REF.periods, "assertPostingAllowed", [POSTING_DATE]);
      await step("Close: accruals done", REF.close, "completeTask", ["accruals"]);
      await step("Close: VAT return prepared", REF.close, "completeTask", ["vat"]);
      await step("Close: ready to close", REF.close, "assertReadyToClose");
      await step("Signed off its own work", REF.close, "signOff", ["accruals"]);
    },
  };

  async function run(ids: Exclude<ScreenId, "overview">[]) {
    if (running) return;
    setRunning(true);
    setLog([]);
    try {
      for (const id of ids) {
        setScreen(id);
        // The agent can only work controls that are on screen.
        await wait(350);
        await scripts[id]();
      }
      say("Done. Decisions that need you are queued on the overview.", "neutral", "queued");
    } finally {
      syncMarks();
      setRunning(false);
    }
  }

  // What a person still has to do, read from the same state the screens show.
  const approval = approvalState(CHAIN, request);
  const close = summarizeClose(tasks);
  const suggested = matches.filter((match) => match.status === "suggested").length;
  const queue: { id: ScreenId; text: string; detail: string; open: boolean }[] = [
    { id: "bank", text: "Bankavstemming", detail: `${suggested} forslag til attestering`, open: suggested > 0 },
    {
      id: "vouchers",
      text: "Leverandørbilag",
      detail:
        lines.length === 0
          ? postedCount
            ? `${postedCount} bokført`
            : "ikke påbegynt"
          : postable
            ? "klart til bokføring"
            : localize(voucherProblems[0] ?? "", "nb"),
      open: lines.length > 0,
    },
    {
      id: "invoices",
      text: "Utgående faktura til Brattli",
      detail:
        invoice.status !== "draft"
          ? `ferdigstilt som ${invoice.number}`
          : invoiceIssues(invoice).length
            ? "har feil"
            : "klar til ferdigstilling",
      open: invoice.status === "draft",
    },
    {
      id: "payments",
      text: "Betalingsoppdrag",
      detail:
        batch.status === "released"
          ? "sendt til bank"
          : batchIssues(batch).length
            ? "har en dobbeltbetaling"
            : `${currentApprovals(batch).length} av 2 godkjenninger`,
      open: batch.status === "draft",
    },
    {
      id: "approvals",
      text: "Leverandørfaktura 2041",
      detail:
        approval.status === "pending"
          ? `venter på ${approval.mayDecide.map(nameOf).join(" eller ") || "ingen"}`
          : status(approval.status),
      open: approval.status === "pending",
    },
    {
      id: "inbox",
      text: "Leverandørfakturaer",
      detail: `${supplierInvoices.filter((item) => item.status === "new" || item.status === "coded").length} til kontroll`,
      open: supplierInvoices.some((item) => item.status === "new" || item.status === "coded"),
    },
    {
      id: "expenses",
      text: "Ninas reiseregning",
      detail: status(claim.status),
      open: claim.status === "draft" || claim.status === "submitted",
    },
    { id: "vat", text: "Mva-melding, termin 5", detail: status(filing.status), open: filing.status !== "submitted" },
    {
      id: "assets",
      text: "Avskrivninger oktober",
      detail: runs.includes("2026-10") ? "kjørt" : "ikke kjørt",
      open: !runs.includes("2026-10"),
    },
    {
      id: "close",
      text: "Avslutning oktober",
      detail: close.readyToClose
        ? "klar til lukking"
        : `${close.open} åpne, ${close.awaitingSignOff.length} til signering`,
      open: !close.readyToClose,
    },
  ];

  const current = SCREENS.find((item) => item.id === screen) ?? SCREENS[0]!;
  const sheet = (children: ReactNode) => <div className="site-sheet min-w-0">{children}</div>;

  return (
    <BookiAccessProvider actor={ACTORS[actor]}>
      <div lang="nb" className="min-h-svh bg-background text-foreground">
        <AgentPresence agent={agent} onController={(controller) => (presence.current = controller)} />
        <SiteAgentCursor />

        <header
          className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-2 md:px-8"
          style={{ borderBottom: "var(--hairline) solid var(--bk-border-strong)" }}
        >
          <div className="flex flex-wrap items-baseline gap-x-4">
            <span className="text-base font-semibold tracking-[-0.02em]">Nordlys Regnskap</span>
            <span className="text-sm text-muted-foreground">Nordlys AS · oktober 2026</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <label className="site-label flex items-center gap-2 whitespace-nowrap">
              Logget inn som
              {/* Who is signed in is the person's to choose: an agent never switches identity. */}
              <select
                data-agent-hidden=""
                className="h-11 rounded-[var(--bk-radius-sm)] border border-input bg-card px-3 text-base text-foreground md:h-10 md:text-sm"
                value={actor}
                onChange={(event) => setActor(event.target.value)}
              >
                {Object.entries(PEOPLE).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <Link to="/" lang="en" className="site-nav-link">
              A demo built with Booki
            </Link>
          </div>
        </header>

        <div className="grid gap-x-10 px-5 md:px-8 lg:grid-cols-[10rem_minmax(0,1fr)_19rem]">
          <nav aria-label="Skjermbilder" className="erp-nav">
            {GROUPS.map((group) => (
              <div key={group} className="erp-nav__group" role="group" aria-label={GROUP_LABEL[group]}>
                <span className="erp-nav__label">{GROUP_LABEL[group]}</span>
                {SCREENS.filter((item) => item.group === group).map((item) => (
                  <GateButton
                    key={item.id}
                    type="button"
                    className="site-nav-link site-text-button"
                    aria-current={item.id === screen ? "page" : undefined}
                    disabled={running}
                    onClick={() => setScreen(item.id)}
                  >
                    {item.title}
                  </GateButton>
                ))}
              </div>
            ))}
          </nav>

          <main className="min-w-0 py-6">
            <h1 className="m-0 text-[2rem] leading-none font-semibold tracking-[-0.04em]">{current.title}</h1>
            <p className="mt-2 mb-6 max-w-[60ch] text-muted-foreground">{current.note}</p>

            {screen === "overview" ? <ErpDashboard /> : null}

            {screen === "overview" ? (
              <ul className="erp-queue">
                {[...queue]
                  .sort((a, b) => Number(b.open) - Number(a.open))
                  .map((item) => (
                    <li key={item.id}>
                      <GateButton
                        className="erp-queue__row"
                        data-open={item.open ? "" : undefined}
                        disabled={running}
                        onClick={() => setScreen(item.id)}
                      >
                        <span className="erp-queue__text">{item.text}</span>
                        <span className="erp-queue__detail">{item.detail}</span>
                        <span aria-hidden className="erp-queue__go">
                          →
                        </span>
                      </GateButton>
                    </li>
                  ))}
              </ul>
            ) : null}

            {screen === "vouchers"
              ? sheet(
                  <div className="grid gap-5">
                    <div className="landing-scroll">
                      <VoucherComposer
                        lines={lines}
                        onLinesChange={setLines}
                        accounts={CHART}
                        departments={DEPARTMENTS}
                        periods={periods}
                        postingDate={POSTING_DATE}
                        editable
                        aria-label={REF.voucher}
                      />
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <GateButton
                        type="button"
                        className="min-h-11"
                        disabled={!postable || lines.length === 0}
                        data-agent-confirm="Posting needs a person"
                        onClick={() => {
                          setPostedCount((count) => count + 1);
                          setLines([]);
                        }}
                      >
                        {REF.post}
                      </GateButton>
                      <span className="text-sm text-muted-foreground">
                        Posting date {POSTING_DATE}
                        {postedCount ? ` · ${postedCount} posted` : ""}
                      </span>
                    </div>
                    <EvidenceList
                      attachments={evidence}
                      onAttachmentsChange={setEvidence}
                      pool={EVIDENCE_POOL}
                      requires={["invoice", "receipt"]}
                      actor={actor}
                      aria-label={REF.evidence}
                    />
                  </div>,
                )
              : null}

            {screen === "inbox"
              ? sheet(
                  <SupplierInvoiceInbox
                    invoices={supplierInvoices}
                    onInvoicesChange={setSupplierInvoices}
                    chart={CHART_NUMBERS}
                    actor={actor}
                    aria-label={REF.inbox}
                  />,
                )
              : null}

            {screen === "expenses"
              ? sheet(
                  <ExpenseClaim
                    claim={claim}
                    onClaimChange={setClaim}
                    policy={EXPENSE_POLICY}
                    today={POSTING_DATE}
                    actor={actor}
                    aria-label={REF.expenses}
                  />,
                )
              : null}

            {screen === "vat"
              ? sheet(
                  <VatReturn
                    schema={NO_VAT_SCHEMA_EXAMPLE}
                    transactions={VAT_TRANSACTIONS}
                    period="2026-T5"
                    filing={filing}
                    onFilingChange={setFiling}
                    actor={actor}
                    nameOf={nameOf}
                    aria-label={REF.vat}
                  />,
                )
              : null}

            {screen === "ledger"
              ? sheet(<LedgerTable entries={LEDGER} documents={LEDGER_DOCUMENTS} aria-label={REF.ledger} />)
              : null}

            {screen === "journal"
              ? sheet(
                  <DataTable
                    rows={LEDGER}
                    columns={JOURNAL_COLUMNS}
                    pageSize={10}
                    selectable
                    exportName="posteringer"
                    aria-label={REF.journal}
                  />,
                )
              : null}

            {screen === "receivables"
              ? sheet(<AgedBalances items={RECEIVABLES} defaultAsOf={POSTING_DATE} aria-label={REF.receivables} />)
              : null}

            {screen === "assets"
              ? sheet(
                  <FixedAssetRegister
                    assets={assets}
                    onAssetsChange={setAssets}
                    runs={runs}
                    onRunsChange={setRuns}
                    defaultPeriod="2026-10"
                    aria-label={REF.assets}
                  />,
                )
              : null}

            {screen === "audit"
              ? sheet(
                  <AuditWorkpaper
                    workpaper={workpaper}
                    onWorkpaperChange={setWorkpaper}
                    population={AUDIT_POPULATION}
                    materiality={AUDIT_MATERIALITY}
                    tickMarks={TICK_MARKS}
                    actor={actor}
                    nameOf={nameOf}
                    aria-label={REF.audit}
                  />,
                )
              : null}

            {screen === "invoices"
              ? sheet(
                  <InvoiceEditor
                    invoice={invoice}
                    onInvoiceChange={setInvoice}
                    nextNumber="10042"
                    aria-label={REF.invoice}
                  />,
                )
              : null}

            {screen === "payments"
              ? sheet(
                  <PaymentBatch
                    batch={batch}
                    onBatchChange={setBatch}
                    actor={actor}
                    nameOf={nameOf}
                    aria-label={REF.batch}
                  />,
                )
              : null}

            {screen === "bank" ? (
              <BankReconciliation
                bankLines={BANK}
                openPosts={POSTS}
                matches={matches}
                onMatchesChange={setMatches}
                aria-label={REF.bank}
              />
            ) : null}

            {screen === "approvals"
              ? sheet(
                  <ApprovalChain
                    chain={CHAIN}
                    request={request}
                    onRequestChange={setRequest}
                    actor={actor}
                    nameOf={nameOf}
                    aria-label={REF.approval}
                  />,
                )
              : null}

            {screen === "close" ? (
              <div className="grid gap-8">
                {sheet(
                  <CloseChecklist
                    tasks={tasks}
                    onTasksChange={setTasks}
                    actor={actor}
                    nameOf={nameOf}
                    aria-label={REF.close}
                  />,
                )}
                {sheet(
                  <PeriodLock
                    codes={["2025", "2026-09", "2026-10", "2026-11"]}
                    periods={periods}
                    onPeriodsChange={setPeriods}
                    aria-label={REF.periods}
                  />,
                )}
              </div>
            ) : null}
          </main>

          <aside lang="en" aria-label="Agent" className="erp-agent site-machine min-w-0">
            <div className="flex items-center justify-between gap-3">
              <h2 className="site-kicker">Agent</h2>
              <span className="site-signal" data-state={running ? "working" : "idle"}>
                {running ? "working" : "idle"}
              </span>
            </div>
            <p className="mt-3 mb-0 text-sm text-ink-muted">
              A fixed script sending real actions to the controls on screen. Every answer below is the library's own.
            </p>
            <div className="mt-4 grid gap-2">
              <Button
                disabled={running || screen === "overview"}
                onClick={() => screen !== "overview" && void run([screen])}
              >
                {running ? "Agent working…" : "Work this screen"}
              </Button>
              <Button
                variant="outline"
                disabled={running}
                onClick={() =>
                  void run([
                    "inbox",
                    "bank",
                    "vouchers",
                    "invoices",
                    "expenses",
                    "payments",
                    "approvals",
                    "vat",
                    "assets",
                    "close",
                  ])
                }
              >
                Work the whole month-end
              </Button>
              <Button
                variant="ghost"
                disabled={marks === 0}
                onClick={() => {
                  presence.current?.acknowledge();
                  syncMarks();
                }}
              >
                Mark {marks} agent {marks === 1 ? "value" : "values"} reviewed
              </Button>
            </div>
            {log.length === 0 ? (
              <p className="mt-6 mb-0 font-mono text-xs text-ink-muted">No actions yet.</p>
            ) : (
              <ol className="site-rows site-rows--ink mt-6 font-mono text-xs" aria-live="polite">
                {log.map((row) => (
                  <li key={row.id} className="grid gap-1.5">
                    <span className="[overflow-wrap:anywhere]">{row.text}</span>
                    <span className="landing-tag justify-self-start" data-tone={row.tone}>
                      {row.word}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </aside>
        </div>
      </div>
    </BookiAccessProvider>
  );
}
