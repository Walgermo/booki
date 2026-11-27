import { catalogMeta } from "@/lib/catalog-meta";
import { usePageMeta } from "@/lib/lang";
import { formatMoney, money } from "@booki-aui/core/money";
import type { IconName } from "@booki-aui/icons";
import { Icon } from "@booki-aui/icons/react";
import { localize } from "@booki-aui/core/messages";
import { periodStatusOn } from "@booki-aui/core/period-lock";
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
  personOnly,
  BookiLocaleProvider,
  AgedBalances,
  AgentPresence,
  AgentStatus,
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
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
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
import { entriesIn, type Entry } from "@/components/agent-view";
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
    note: "Nøkkeltall og oppgaver for oktober 2026.",
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
const SCREEN_ICON: Record<ScreenId, IconName> = {
  overview: "gauge",
  inbox: "inbox",
  vouchers: "document-lines",
  invoices: "receipt",
  expenses: "wallet",
  payments: "stack",
  bank: "scale",
  approvals: "circle-check",
  close: "list-checks",
  vat: "stamp",
  ledger: "book",
  journal: "list-rows",
  receivables: "hourglass",
  assets: "barcode",
  audit: "clipboard",
};
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
const PAGE_META = catalogMeta("demo");

export function ErpPage() {
  usePageMeta(PAGE_META);
  return (
    <BookiLocaleProvider country="NO">
      <Erp />
    </BookiLocaleProvider>
  );
}

function Erp() {
  const { profile } = useBookiLocale();
  const [screen, setScreen] = useState<ScreenId>("overview");
  const [navOpen, setNavOpen] = useState(false);
  const content = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
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

  function dismissNav(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && navOpen) {
      setNavOpen(false);
      menuButton.current?.focus();
    }
  }

  function openScreen(id: ScreenId) {
    setScreen(id);
    setNavOpen(false);
    requestAnimationFrame(() => heading.current?.focus());
  }

  function say(text: string, tone: Tone, word: string) {
    seq.current += 1;
    const id = seq.current;
    setLog((rows) => [...rows, { id, text, tone, word }]);
  }

  const find = <T = Entry>(label: string) => entriesIn(content.current).find((c) => c.label === label) as T | undefined;

  /** One agent step: send it, show the library's answer, give the eye a moment. */
  async function step(text: string, label: string, action: string, args: unknown[] = []) {
    const target = find(label);
    if (!target) {
      say(`Fant ikke «${label}» på denne siden.`, "bad", "Avvist");
      return false;
    }
    const r = (await agent.act({ steps: [{ ref: target.ref, action, args }] } as never)) as ActResult;
    say(r.ok ? text : localize(r.error?.message ?? "Avvist", "nb"), r.ok ? "good" : "bad", r.ok ? "Utført" : "Avvist");
    syncMarks();
    await wait(480);
    return r.ok;
  }

  const scripts: Record<ScreenId, () => Promise<void>> = {
    overview: async () => {
      for (const entry of entriesIn(content.current).filter((item) => item.component === "kpi-stat")) {
        const { label, valueMinor, currency } = entry as unknown as {
          label: string;
          valueMinor: number | null;
          currency: string;
        };
        if (valueMinor !== null)
          say(
            `${label}: ${formatMoney(money(valueMinor, currency), { locale: profile.locale, trimZeroFraction: true })}`,
            "neutral",
            "Lest",
          );
      }
    },
    vouchers: async () => {
      await step("Tømte bilagsutkastet", REF.voucher, "clear");
      await step("Debiterte 6800 Kontorrekvisita med 12 400,00", REF.voucher, "addLine", [
        "6800",
        undefined,
        1_240_000,
        0,
      ]);
      await step("Debiterte 2711 Inngående mva med 3 100,00", REF.voucher, "addLine", ["2711", undefined, 310_000, 0]);
      await step("Krediterte 2400 Leverandørgjeld med 15 500,00", REF.voucher, "addLine", [
        "2400",
        undefined,
        0,
        1_550_000,
      ]);
      if (!(await step("Kontrollerte om bilaget kan bokføres", REF.voucher, "assertPostable"))) {
        const expense = find<{ lines: VoucherLine[] }>(REF.voucher)?.lines.find((line) => line.account === "6800");
        if (expense) {
          await step("Valgte avdeling 10 Oslo på linjen for konto 6800", REF.voucher, "setDepartment", [
            expense.id,
            "10",
          ]);
          await step("Kontrollerte bilaget på nytt. Klart til bokføring.", REF.voucher, "assertPostable");
        }
      }
      await step("Bokførte bilaget", REF.post, "press");
    },
    invoices: async () => {
      await step("La til reiseutlegg på 2 380,00 med 25 % mva", REF.invoice, "addLine", [
        "Reiseutlegg",
        1000,
        238_000,
        "S",
        2500,
      ]);
      await step("Kontrollerte antallet på første fakturalinje", REF.invoice, "setLine", [
        "l1",
        { quantityMilli: 1.5 },
      ]);
      await step("La inn 5 % rabatt på konsulentlinjen", REF.invoice, "setLine", ["l1", { discountBp: 500 }]);
      await step("Kontrollerte at fakturaen er klar for ferdigstilling", REF.invoice, "assertFinalizable");
      await step("Ferdigstilte fakturaen", REF.invoice, "finalize");
    },
    payments: async () => {
      const issue = find<{ issues: string[] }>(REF.batch)?.issues[0];
      if (issue) {
        say(localize(issue, "nb"), "neutral", "Til kontroll");
        await wait(480);
        await step("Fjernet dobbeltbetalingen p3", REF.batch, "removePayment", ["p3"]);
      }
      await step("Kontrollerte om betalingsoppdraget kan frigis", REF.batch, "assertReleasable");
      await step("Godkjente betalingsoppdraget", REF.batch, "approve");
    },
    bank: async () => {
      await step("Foreslo å knytte innbetalingen fra Brattli til faktura 1002 og 1003", REF.bank, "suggestMatch", [
        "b2",
        ["p2", "p3"],
      ]);
      say("Lot de to mobilbetalingene stå åpne. De har samme beløp og mangler referanse.", "neutral", "Til kontroll");
      await wait(480);
      await step("Godkjente eget avstemmingsforslag", REF.bank, "approveMatch", ["m1"]);
    },
    approvals: async () => {
      await step("Kontrollerte om faktura 2041 er godkjent", REF.approval, "assertApproved");
      await step("Godkjente faktura 2041", REF.approval, "approve");
    },
    inbox: async () => {
      await step("Rettet summen på fakturaen fra Brattli til 4 380,00 fra PDF-en", REF.inbox, "correctField", [
        "si-2",
        "grossMinor",
        438_000,
      ]);
      await step("Bekreftet organisasjonsnummeret til Brattli", REF.inbox, "confirmField", [
        "si-2",
        "supplierOrgNumber",
      ]);
      await step("Foreslo konto 6340 for Brattli", REF.inbox, "proposeCoding", ["si-2", "6340", "MVA25"]);
      await step("Kontrollerte om fakturaen fra Brattli er klar til godkjenning", REF.inbox, "assertApprovable", [
        "si-2",
      ]);
      await step("Kontrollerte om faktura 8841 er klar til godkjenning", REF.inbox, "assertApprovable", ["si-1"]);
      await step("Godkjente fakturaen fra Brattli", REF.inbox, "approve", ["si-2"]);
    },
    expenses: async () => {
      await step("Rettet middagsutlegget til 790,00 fra kvitteringen", REF.expenses, "setLine", [
        "l2",
        { amountMinor: 79_000 },
      ]);
      await step("Endret kjøregodtgjørelsen manuelt", REF.expenses, "setLine", ["l3", { amountMinor: 1 }]);
      await step("Kontrollerte utleggene mot reglementet", REF.expenses, "assertSubmittable");
      await step("Sendte inn reiseregningen", REF.expenses, "submit");
    },
    vat: async () => {
      await step("Åpnet utgående mva med høy sats", REF.vat, "openBox", ["sales-high-tax"]);
      await step("Gikk tilbake til mva-postene", REF.vat, "back");
      await step("Kontrollerte om mva-meldingen er klar", REF.vat, "assertReady");
      await step("Sendte inn mva-meldingen", REF.vat, "submit");
    },
    ledger: async () => {
      await step("Åpnet konto 6800 Kontorrekvisita", REF.ledger, "openAccount", ["6800"]);
      await step("Åpnet bilag 2004 og leste posteringene", REF.ledger, "showVoucher", ["2004"]);
      await step("Gikk tilbake til konto 6800", REF.ledger, "back");
      await step("Sammenlignet september og oktober på konto 6800", REF.ledger, "explainVariance", [
        "6800",
        "2026-09",
        "2026-10",
      ]);
      await step("Gikk tilbake til saldobalansen", REF.ledger, "back");
    },
    journal: async () => {
      await step("Søkte etter Kontorrekvisita", REF.journal, "setSearch", ["Kontorrekvisita"]);
      await step("Sorterte med høyeste debetbeløp først", REF.journal, "setSort", ["debit", "desc"]);
      await step("Filtrerte på oktober", REF.journal, "setFilter", ["date", "2026-10"]);
    },
    receivables: async () => {
      await step("Hentet kunder med krav som er mer enn 60 dager over forfall", REF.receivables, "overdue", [60]);
      await step("Åpnet Havblikk Hotell", REF.receivables, "openParty", ["c3"]);
    },
    assets: async () => {
      await step("Kontrollerte om avskrivningene for oktober kan kjøres", REF.assets, "assertRunnable", ["2026-10"]);
      await step("Foreslo avskrivninger for oktober", REF.assets, "proposeRun", ["2026-10"]);
      await step("Bekreftet avskrivningskjøringen", REF.assets, "confirmRun");
    },
    audit: async () => {
      await step("Trakk fire poster med pengeenhetsutvalg og frøet okt-2026", REF.audit, "drawSample", [
        "monetary-unit",
        { size: 4, seed: "okt-2026" },
      ]);
      const first = find<{ workpaper: { items: { id: string }[] } }>(REF.audit)?.workpaper.items[0]?.id;
      if (first) {
        await step(`Kontrollerte ${first} mot fakturaen`, REF.audit, "setResult", [first, "ok"]);
        await step(`La til kontrollmerke på ${first}`, REF.audit, "setTickMark", [first, "✓"]);
      }
      await step("Kontrollerte om arbeidspapiret kan signeres", REF.audit, "assertReadyForSignOff");
      await step("Signerte som utarbeider", REF.audit, "signAsPreparer");
    },
    close: async () => {
      await step("Kontrollerte bokføringsadgangen for 30. september", REF.periods, "assertPostingAllowed", [
        "2026-09-30",
      ]);
      await step("Kontrollerte bokføringsadgangen for 31. oktober", REF.periods, "assertPostingAllowed", [
        POSTING_DATE,
      ]);
      await step("Fullførte periodiseringene", REF.close, "completeTask", ["accruals"]);
      await step("Klargjorde mva-meldingen", REF.close, "completeTask", ["vat"]);
      await step("Kontrollerte om perioden kan lukkes", REF.close, "assertReadyToClose");
      await step("Signerte eget arbeid", REF.close, "signOff", ["accruals"]);
    },
  };

  async function run(ids: ScreenId[]) {
    if (running) return;
    setRunning(true);
    setNavOpen(false);
    setLog([]);
    try {
      for (const id of ids) {
        setScreen(id);
        // The agent can only work controls that are on screen.
        await wait(350);
        await scripts[id]();
      }
      if (ids.length > 1)
        say("Du finner oppgavene som gjenstår i arbeidslisten på oversikten.", "neutral", "Til oppfølging");
    } finally {
      syncMarks();
      setRunning(false);
    }
  }

  // What a person still has to do, read from the same state the screens show.
  const approval = approvalState(CHAIN, request);
  const close = summarizeClose(tasks);
  const periodLocked = periodStatusOn(periods, POSTING_DATE).status === "hard-closed";
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
      detail: periodLocked
        ? "perioden er lukket"
        : close.readyToClose
          ? "klar til lukking"
          : `${close.open} åpne, ${close.awaitingSignOff.length} til signering`,
      open: !periodLocked,
    },
  ];

  const current = SCREENS.find((item) => item.id === screen) ?? SCREENS[0]!;
  const sheet = (children: ReactNode) => <div className="site-sheet min-w-0">{children}</div>;

  return (
    <BookiAccessProvider actor={ACTORS[actor]}>
      <div lang="nb" className="erp-shell min-h-svh bg-background text-foreground">
        <AgentPresence agent={agent} onController={(controller) => (presence.current = controller)} />
        <SiteAgentCursor />

        <header className="erp-header">
          <div className="erp-identity">
            <Icon name="building" className="erp-identity__icon" />
            <div>
              <strong>Nordlys Regnskap</strong>
              <span>Nordlys AS · oktober 2026</span>
            </div>
          </div>
          <div className="erp-header__controls flex flex-wrap items-center gap-x-6 gap-y-2">
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
            <Link to="/" className="site-nav-link">
              Om Booki
            </Link>
          </div>
        </header>

        <div className="erp-workspace">
          <nav aria-label="Skjermbilder" className="erp-nav">
            <div className="erp-nav__toolbar">
              <GateButton
                ref={menuButton}
                onKeyDown={dismissNav}
                className="site-text-button"
                aria-expanded={navOpen}
                aria-controls="erp-screens"
                aria-label={`Velg skjerm. Gjeldende side: ${current.title}`}
                onClick={() => setNavOpen(!navOpen)}
              >
                <Icon name={SCREEN_ICON[screen]} /> {current.title} <Icon name="chevron-down" />
              </GateButton>
              <a href="#erp-agent" onKeyDown={dismissNav} className="site-nav-link">
                Til agentpanelet
              </a>
            </div>
            <div className="erp-nav__screens" id="erp-screens" data-open={navOpen}>
              {GROUPS.map((group) => (
                <div key={group} className="erp-nav__group" role="group" aria-label={GROUP_LABEL[group]}>
                  <span className="erp-nav__label">{GROUP_LABEL[group]}</span>
                  {SCREENS.filter((item) => item.group === group).map((item) => (
                    <GateButton
                      key={item.id}
                      onKeyDown={dismissNav}
                      type="button"
                      className="site-nav-link site-text-button"
                      aria-current={item.id === screen ? "page" : undefined}
                      disabled={running}
                      onClick={() => openScreen(item.id)}
                    >
                      <Icon name={SCREEN_ICON[item.id]} />
                      {item.title}
                    </GateButton>
                  ))}
                </div>
              ))}
            </div>
          </nav>

          <main ref={content} className="erp-content min-w-0">
            <h1
              tabIndex={-1}
              ref={heading}
              id="erp-screen-title"
              className="m-0 text-[2rem] leading-none font-semibold tracking-[-0.04em]"
            >
              {current.title}
            </h1>
            <p className="mt-2 mb-6 max-w-[60ch] text-muted-foreground">{current.note}</p>

            {screen === "overview" ? (
              <ErpDashboard>
                <details className="erp-inbox">
                  <summary>
                    <Icon name="list-checks" />
                    Arbeidsliste <span>{queue.filter((item) => item.open).length} åpne</span>
                    <Icon name="chevron-down" />
                  </summary>
                  <ul className="erp-queue">
                    {[...queue]
                      .sort((a, b) => Number(b.open) - Number(a.open))
                      .map((item) => (
                        <li key={item.id}>
                          <GateButton
                            className="erp-queue__row"
                            data-open={item.open ? "" : undefined}
                            disabled={running}
                            onClick={() => openScreen(item.id)}
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
                </details>
              </ErpDashboard>
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

          <aside
            id="erp-agent"
            tabIndex={-1}
            data-bk-surface="ink"
            aria-label="Agent"
            className="erp-agent site-machine min-w-0"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="site-kicker">Agent</h2>
              <AgentStatus state={running ? "working" : log.length ? "done" : "idle"} />
            </div>
            <p className="mt-3 mb-0 text-sm text-ink-muted">
              {screen === "overview"
                ? "Les nøkkeltallene, eller la agenten forberede månedsavslutningen."
                : current.title + " · Agenten viser hvert steg her."}
            </p>
            <div className="mt-4 grid gap-2">
              <Button disabled={running} onClick={() => void run([screen])}>
                {running ? "Agenten arbeider…" : screen === "overview" ? "Les nøkkeltallene" : "Kjør på denne siden"}
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
                Forbered månedsavslutning
              </Button>
              {marks > 0 && (
                <Button
                  variant="ghost"
                  data-agent-confirm={personOnly("Gjennomgang av agentens endringer krever en person.")}
                  onClick={() => {
                    presence.current?.acknowledge();
                    syncMarks();
                  }}
                >
                  Kvitter for {marks} {marks === 1 ? "endring" : "endringer"}
                </Button>
              )}
            </div>
            {log.length > 0 && (
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
            <a href="#erp-screen-title" className="erp-agent__back site-nav-link">
              Tilbake til {current.title.toLowerCase()}
            </a>
          </aside>
        </div>
      </div>
    </BookiAccessProvider>
  );
}
