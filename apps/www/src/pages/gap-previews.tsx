import type { GapName } from "./lazy-previews";
import { AGENT_STATUS_STATES, agentStatusLabel } from "@booki-aui/core/msg/agent-status";
import { Button } from "@ui-sdk/react/button";
import { drawSample, startWorkpaper } from "@booki-aui/core/audit";
import { NO_VAT_SCHEMA_EXAMPLE } from "@booki-aui/core/vat-return";
import type { Activity } from "@booki-aui/core/activity";
import type { Deal, PipelineStage, StageStay } from "@booki-aui/core/pipeline";
import type { RecurringAgreement } from "@booki-aui/core/recurring";
import {
  ChartOfAccounts,
  useBookiLocale,
  AgedBalances,
  AgentStatus,
  type AgentStatusState,
  AgingChart,
  BarChart,
  CashflowWaterfall,
  DataTable,
  KpiStat,
  TrendChart,
  AuditFindings,
  AuditWorkpaper,
  BookiToasts,
  ClientRequests,
  DealPipeline,
  FunnelChart,
  ForecastChart,
  RecurringRevenue,
  StageDurationChart,
  ActivityTimeline,
  ConfirmDialog,
  DocumentEditor,
  DocumentSignoff,
  EvidenceList,
  SheetStack,
  createToaster,
  ExpenseClaim,
  FixedAssetRegister,
  LedgerTable,
  SupplierInvoiceInbox,
  VatReturn,
} from "@booki-aui/react";

import {
  ASSETS,
  AUDIT_MATERIALITY,
  AUDIT_POPULATION,
  CHART_NUMBERS,
  CHART_OF_ACCOUNTS_NO,
  CHART_OF_ACCOUNTS_US,
  CHART_TAX_NO,
  CHART_TAX_US,
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
import { CASHFLOW, COST_BY_ACCOUNT, COSTS, OPENING, REVENUE, series } from "@/components/erp-dashboard";
import type { ClientRequest, EditorDocument, Finding, Mention, SignableDocument, StackSheet } from "@booki-aui/react";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { useLang } from "@/lib/lang";

// Made-up engagement: no real company or person.
const AUDIT_EVIDENCE = [
  { id: "E-11", label: "Salgsjournal desember" },
  { id: "E-12", label: "Følgesedler januar" },
  { id: "E-13", label: "Lagertelling 31.12." },
  { id: "E-14", label: "Attestasjonslogg leverandørfakturaer, 4. kvartal" },
];
const FINDINGS_AT = "2026-11-03T09:15:00Z";
const AUDIT_FINDINGS: Finding[] = [
  {
    id: "F-01",
    code: "F-01",
    title: "Inntekt ført i feil periode",
    category: "misstatement",
    status: "draft",
    basis: "documented",
    description: "To fakturaer datert 28. desember gjelder leveranser i januar.",
    amountMinor: 18_450_000,
    currency: "NOK",
    sources: ["E-11", "E-12"],
    confidential: false,
    raisedBy: "nina",
    log: [{ at: FINDINGS_AT, by: "nina", action: "raised" }],
  },
  {
    id: "F-02",
    code: "F-02",
    title: "Manglende attestasjon av inngående fakturaer",
    category: "control-deficiency",
    status: "confirmed",
    basis: "documented",
    sources: ["E-14"],
    confidential: false,
    raisedBy: "agent",
    confirmedBy: "kari",
    log: [
      { at: FINDINGS_AT, by: "agent", action: "raised" },
      { at: FINDINGS_AT, by: "kari", action: "confirmed" },
    ],
  },
  {
    id: "F-03",
    code: "F-03",
    title: "Mulig nærstående part blant leverandørene",
    category: "compliance",
    status: "draft",
    basis: "hypothesis",
    description: "Samme kontaktadresse hos to leverandører og en ansatt i innkjøp.",
    sources: [],
    confidential: true,
    raisedBy: "kari",
    log: [{ at: FINDINGS_AT, by: "kari", action: "raised" }],
  },
];
// The sample is drawn (reproducibly, from its seed); the testing is still to do.
const WORKPAPER = startWorkpaper(
  drawSample(AUDIT_POPULATION, { method: "monetary-unit", size: 4, seed: "2026-10-31" }),
);

// Performed on version 3, edited since: the line shows "changed after sign-off" and asks for review.
const WORKPAPER_DOCUMENT: SignableDocument = {
  id: "05.3",
  version: 4,
  saveState: "saved",
  openPoints: ["Saldobekreftelse fra Nordbank er ikke mottatt"],
  signatures: [
    { level: "performed", by: "nina", byName: "Nina", at: "2026-11-18T14:05:00Z", version: 3, openPoints: [] },
  ],
};

// A working-paper note: the agent may propose; a person accepts or rejects.
const NOTE_PAGE: EditorDocument = {
  id: "05.4-cut-off",
  version: 6,
  blocks: [
    { id: "b1", type: "heading", level: 2, text: "Revenue cut-off" },
    {
      id: "b2",
      type: "paragraph",
      text: "Sales are recognised when goods are delivered. 25 deliveries around year end were traced to delivery notes.",
    },
    { id: "b3", type: "bullet", text: "No exceptions among the December deliveries" },
    {
      id: "b4",
      type: "bullet",
      text: "Two January deliveries were invoiced in December, see @Invoice 1042",
      refs: [{ kind: "evidence", id: "e1042", label: "Invoice 1042" }],
    },
    {
      id: "b5",
      type: "todo",
      text: "Ask @Kari Nordmann about credit notes after year end",
      refs: [{ kind: "person", id: "kari", label: "Kari Nordmann" }],
    },
  ],
  proposals: [],
};
const NOTE_MENTIONS: Mention[] = [
  { kind: "evidence", id: "e1042", label: "Invoice 1042", hint: "2026-12-30 · 48 200,00" },
  { kind: "file", id: "f-sample", label: "Cut-off sample.xlsx" },
  { kind: "file", id: "f-statement", label: "Bank statement.pdf" },
  { kind: "file", id: "f-letter", label: "Confirmation letter.docx" },
  { kind: "file", id: "f-receipt", label: "Receipt scan.png" },
  { kind: "file", id: "f-export", label: "Ledger extracts.zip" },
  { kind: "person", id: "kari", label: "Kari Nordmann", hint: "Manager" },
  { kind: "page", id: "05.1", label: "05.1 Revenue planning" },
];

// Opened from the working paper down to one customer, so there is a stack to go back through.
const SHEETS: StackSheet[] = [
  { key: "05.3", title: "05.3 Kundefordringer" },
  { key: "05.3.2", title: "05.3.2 Saldobekreftelser" },
  { key: "kunde-1042", title: "Kunde 1042 Fjordvarer AS" },
];
const SHEET_ROWS: Record<string, { key: string; title: string; dockable?: boolean }[]> = {
  "05.3": [
    { key: "05.3.2", title: "05.3.2 Saldobekreftelser" },
    { key: "1500", title: "Hovedbok 1500 Kundefordringer", dockable: true },
  ],
  "05.3.2": [{ key: "kunde-1042", title: "Kunde 1042 Fjordvarer AS" }],
};

/** A person's decision: the question, what is decided, and the answer an agent cannot give. */
const subscribeNothing = () => () => {};

/** Renders its children only in a browser: the build's HTML has none of it. */
function InBrowser({ children }: { children: ReactNode }) {
  const inBrowser = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  return inBrowser ? children : null;
}

function ConfirmDialogPreview() {
  const toaster = useState(() => createToaster())[0];
  return (
    <>
      <ConfirmDialog
        trigger="Frigi betalingskjøring"
        title="Frigi betalingskjøring 2026-11-A?"
        description="Tre betalinger sendes til banken. Det kan ikke angres herfra."
        confirmWord="2026-11-A"
        tone="danger"
        confirmLabel="Frigi"
        onConfirm={() =>
          new Promise<void>((resolve) =>
            setTimeout(() => {
              toaster("Betalingskjøring 2026-11-A er frigitt", { description: "3 betalinger, 48 250,00 kr" });
              resolve();
            }, 600),
          )
        }
      >
        3 betalinger · 48 250,00 kr · fra konto 1503.40.12345
      </ConfirmDialog>
      <BookiToasts toaster={toaster} />
    </>
  );
}

/** Receipts, one of them for what an agent did. */
function ToastsPreview() {
  const toaster = useState(() => createToaster())[0];
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => toaster("Bilag 1042 er bokført", { description: "Kontorhuset AS · 15 500,00 kr" })}>
        Vis kvittering
      </Button>
      <Button
        onClick={() =>
          toaster({
            title: "Agent satte Beløp til 1 250,00",
            data: { agent: true },
            action: { label: "Angre", onAction: () => {} },
          })
        }
      >
        Vis agentens kvittering
      </Button>
      <BookiToasts toaster={toaster} />
    </div>
  );
}

function AgentStatusPreview() {
  const { lang, t } = useLang();
  const [state, setState] = useState<AgentStatusState>("idle");
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <AgentStatus state={state} label={agentStatusLabel(lang, state)} />
        <div aria-hidden="true" data-bk-surface="ink" className="site-machine rounded-[var(--bk-radius)] px-3 py-2">
          <AgentStatus state={state} label={agentStatusLabel(lang, state)} />
        </div>
      </div>
      <label data-agent-hidden="" className="grid justify-self-start gap-1">
        {t("Agent state", "Agenttilstand")}
        <select value={state} onChange={(event) => setState(event.currentTarget.value as AgentStatusState)}>
          {AGENT_STATUS_STATES.map((value) => (
            <option key={value} value={value}>
              {agentStatusLabel(lang, value)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** A working paper and what opens from it: each line opens a sheet over it, the ledger beside it. */
function SheetStackPreview() {
  const [sheets, setSheets] = useState<StackSheet[]>(SHEETS);
  return (
    <SheetStack
      sheets={sheets}
      onSheetsChange={setSheets}
      renderSheet={(sheet) => (
        <ul className="m-0 grid gap-2 p-0 list-none">
          {(SHEET_ROWS[sheet.key] ?? [{ key: `${sheet.key}-note`, title: "Ingen flere ark herfra" }]).map((row) =>
            SHEET_ROWS[sheet.key] ? (
              <li key={row.key}>
                <Button onClick={() => setSheets((open) => [...open, row])}>Åpne {row.title}</Button>
              </li>
            ) : (
              <li key={row.key} className="text-sm text-muted-foreground">
                {row.title}
              </li>
            ),
          )}
        </ul>
      )}
    />
  );
}

const PIPELINE_STAGES: PipelineStage[] = [
  { id: "kvalifisering", name: "Kvalifisering", probability: 10 },
  { id: "tilbud", name: "Tilbud sendt", probability: 50 },
  { id: "forhandling", name: "Forhandling", probability: 70 },
  { id: "vunnet", name: "Vunnet", probability: 100, outcome: "won" },
  { id: "tapt", name: "Tapt", probability: 0, outcome: "lost" },
];
const PIPELINE_OWNERS = [
  { id: "kari", name: "Kari Nordmann" },
  { id: "ola", name: "Ola Hansen" },
];
const PIPELINE_DEALS: Deal[] = [
  {
    id: "D-1",
    name: "Regnskapslisens 2027",
    company: "Fjordkraft Bygg AS",
    stageId: "tilbud",
    valueMinor: 180_000_00,
    currency: "NOK",
    valueStatus: "known",
    valueSource: "Tilbud 2026-114",
    ownerId: "kari",
    expectedClose: "2026-12-15",
    stageChangedAt: "2026-11-10T09:00:00Z",
  },
  {
    id: "D-2",
    name: "Lønnstjenester",
    company: "Nordlys Logistikk AS",
    stageId: "kvalifisering",
    valueMinor: 60_000_00,
    currency: "NOK",
    valueStatus: "unknown",
    ownerId: "ola",
    stageChangedAt: "2026-09-20T09:00:00Z",
  },
  {
    id: "D-3",
    name: "Konsernrapportering",
    company: "Havbris Holding AS",
    stageId: "forhandling",
    valueMinor: 25_000_00,
    currency: "EUR",
    valueStatus: "estimate",
    valueSource: "Møte 4. nov.",
    ownerId: "kari",
    expectedClose: "2026-11-30",
    stageChangedAt: "2026-11-18T09:00:00Z",
  },
];
const FUNNEL_STEPS = [
  { id: "lead", label: "Lead", count: 240 },
  { id: "meeting", label: "Møte", count: 96 },
  { id: "tilbud", label: "Tilbud sendt", count: 58 },
  { id: "forhandling", label: "Forhandling", count: 31 },
  { id: "vunnet", label: "Vunnet", count: 17, valueMinor: 2_340_000_00 },
];
const FORECAST_DEALS: Deal[] = [
  ...PIPELINE_DEALS,
  {
    id: "D-4",
    name: "Årsoppgjør",
    stageId: "vunnet",
    valueMinor: 95_000_00,
    currency: "NOK",
    valueStatus: "known",
    valueSource: "Ordre 88",
    closedAt: "2026-11-12T10:00:00Z",
  },
  {
    id: "D-5",
    name: "Revisjon 2027",
    stageId: "forhandling",
    valueMinor: 140_000_00,
    currency: "NOK",
    valueStatus: "estimate",
    valueSource: "Møte 18. nov.",
    expectedClose: "2027-01-20",
  },
  {
    id: "D-6",
    name: "Rådgivning",
    stageId: "tilbud",
    valueMinor: 48_000_00,
    currency: "NOK",
    valueStatus: "known",
    valueSource: "Tilbud 2026-121",
    expectedClose: "2026-12-10",
  },
];
const AGREEMENTS: RecurringAgreement[] = [
  { id: "K-1", customerId: "Fjordkraft Bygg AS", mrrMinor: 12_500_00, currency: "NOK", start: "2025-09-01" },
  { id: "K-2", customerId: "Fjordkraft Bygg AS", mrrMinor: 2_500_00, currency: "NOK", start: "2026-10-01" },
  {
    id: "K-3",
    customerId: "Nordlys Logistikk AS",
    mrrMinor: 6_000_00,
    currency: "NOK",
    start: "2025-01-01",
    end: "2026-09-30",
  },
  { id: "K-4", customerId: "Havbris Holding AS", mrrMinor: 9_000_00, currency: "NOK", start: "2026-08-01" },
  {
    id: "K-5",
    customerId: "Lysaker Eiendom AS",
    mrrMinor: 8_000_00,
    currency: "NOK",
    start: "2025-03-01",
    end: "2026-07-31",
  },
  { id: "K-6", customerId: "Lysaker Eiendom AS", mrrMinor: 5_500_00, currency: "NOK", start: "2026-08-01" },
];
const STAYS: StageStay[] = [
  { dealId: "Regnskapslisens 2027", stageId: "kvalifisering", enteredAt: "2026-10-01", leftAt: "2026-10-09" },
  { dealId: "Regnskapslisens 2027", stageId: "tilbud", enteredAt: "2026-11-10" },
  { dealId: "Lønnstjenester", stageId: "kvalifisering", enteredAt: "2026-09-20" },
  { dealId: "Konsernrapportering", stageId: "kvalifisering", enteredAt: "2026-09-02", leftAt: "2026-09-16" },
  { dealId: "Konsernrapportering", stageId: "tilbud", enteredAt: "2026-09-16", leftAt: "2026-11-18" },
  { dealId: "Konsernrapportering", stageId: "forhandling", enteredAt: "2026-11-18" },
];
const TIMELINE: Activity[] = [
  {
    id: "A-1",
    kind: "meeting",
    subject: "Demo av rapportmodulen",
    at: "2026-11-04T13:00:00Z",
    by: "kari",
    evidence: "Kalender 4. nov.",
  },
  { id: "A-2", kind: "email", subject: "Sendte tilbud 2026-114", at: "2026-11-10T08:30:00Z", by: "kari" },
  { id: "A-3", kind: "call", subject: "Oppfølging av tilbudet", at: "2026-11-18T10:15:00Z", by: "kari" },
  {
    id: "T-1",
    kind: "task",
    subject: "Avklar oppstartsdato",
    at: "2026-11-18T10:20:00Z",
    by: "kari",
    dueDate: "2026-11-20",
    assigneeId: "kari",
  },
  {
    id: "T-2",
    kind: "task",
    subject: "Send avtaleutkast",
    at: "2026-11-18T10:21:00Z",
    by: "kari",
    dueDate: "2026-11-28",
    assigneeId: "ola",
  },
];

const CLIENT_REQUESTS: ClientRequest[] = [
  {
    id: "R-1",
    title: "Saldobekreftelser fra bankene per 31.12.",
    area: "Bank",
    status: "sent",
    dueDate: "2026-11-10",
    reminders: 1,
    recipient: { name: "Hanne Vik", email: "hanne.vik@klient.example", role: "Økonomisjef" },
    createdBy: "agent",
    sentBy: "nina",
    sentAt: FINDINGS_AT,
  },
  {
    id: "R-2",
    title: "Avstemming av lønn mot a-meldingen",
    area: "Lønn",
    status: "answered",
    dueDate: "2026-11-20",
    reminders: 0,
    recipient: { name: "Erik Moen", email: "erik.moen@klient.example", role: "Lønnsansvarlig" },
    createdBy: "nina",
    sentBy: "nina",
    sentAt: FINDINGS_AT,
    answer: "Avstemmingen for januar til november ligger vedlagt; desember kommer etter lønnskjøringen.",
    answeredAt: "2026-11-12T14:02:00Z",
  },
  {
    id: "R-3",
    title: "Leiekontrakter for lokalene",
    area: "Leie",
    status: "draft",
    dueDate: "2026-11-28",
    reminders: 0,
    recipient: { name: "Hanne Vik", email: "hanne.vik@klient.example", role: "Økonomisjef" },
    createdBy: "agent",
  },
];

/** The chart of accounts in the reader's country: NS 4102 for Norway, the common ranges for the US. */
function ChartOfAccountsPreview() {
  const { country } = useBookiLocale();
  const norway = country === "NO";
  return (
    <ChartOfAccounts
      defaultAccounts={norway ? CHART_OF_ACCOUNTS_NO : CHART_OF_ACCOUNTS_US}
      taxCodes={norway ? CHART_TAX_NO : CHART_TAX_US}
    />
  );
}

/** Live previews for the docs pages, on the shared demo books. */
export const GAP_PREVIEWS: Record<GapName, () => React.JSX.Element> = {
  "kpi-stat": () => (
    <div className="grid max-w-xs">
      <KpiStat
        label="Inntekt oktober"
        valueMinor={REVENUE.at(-1)!}
        previousMinor={REVENUE.at(-2)!}
        previousLabel="september"
        good="up"
        series={series(REVENUE)}
      />
    </div>
  ),
  "trend-chart": () => (
    <TrendChart
      title="Inntekt og kostnader"
      aria-label="Inntekt og kostnader"
      series={[
        { id: "revenue", name: "Inntekt", points: series(REVENUE) },
        { id: "costs", name: "Kostnader", points: series(COSTS) },
      ]}
    />
  ),
  "bar-chart": () => (
    <BarChart
      title="Kostnad per konto, oktober"
      aria-label="Kostnad per konto"
      items={COST_BY_ACCOUNT}
      defaultLimit={6}
    />
  ),
  "aging-chart": () => (
    <AgingChart
      title="Kundefordringer etter alder"
      aria-label="Aldersfordeling"
      items={RECEIVABLES}
      defaultAsOf="2026-10-31"
    />
  ),
  "cashflow-waterfall": () => (
    <CashflowWaterfall title="Kontantstrøm oktober" aria-label="Kontantstrøm" openingMinor={OPENING} steps={CASHFLOW} />
  ),
  "supplier-invoice-inbox": () => (
    <SupplierInvoiceInbox defaultInvoices={SUPPLIER_INVOICES} chart={CHART_NUMBERS} actor="kari" />
  ),
  "evidence-list": () => (
    <EvidenceList
      defaultAttachments={EVIDENCE_LINKED}
      pool={EVIDENCE_POOL}
      requires={["invoice", "receipt"]}
      actor="nina"
    />
  ),
  "expense-claim": () => (
    <ExpenseClaim defaultClaim={EXPENSE_CLAIM} policy={EXPENSE_POLICY} today="2026-10-31" actor="kari" />
  ),
  "ledger-table": () => <LedgerTable entries={LEDGER} documents={LEDGER_DOCUMENTS} />,
  "aged-balances": () => <AgedBalances items={RECEIVABLES} defaultAsOf="2026-10-31" />,
  "vat-return": () => (
    <VatReturn schema={NO_VAT_SCHEMA_EXAMPLE} transactions={VAT_TRANSACTIONS} period="2026-T5" actor="kari" />
  ),
  "audit-workpaper": () => (
    <AuditWorkpaper
      defaultWorkpaper={WORKPAPER}
      population={AUDIT_POPULATION}
      materiality={AUDIT_MATERIALITY}
      tickMarks={TICK_MARKS}
      actor="nina"
    />
  ),
  "audit-findings": () => <AuditFindings defaultFindings={AUDIT_FINDINGS} evidence={AUDIT_EVIDENCE} actor="kari" />,
  // Both open in a portal, which only a browser can render: not in the build's HTML.
  "confirm-dialog": () => (
    <InBrowser>
      <ConfirmDialogPreview />
    </InBrowser>
  ),
  toasts: () => (
    <InBrowser>
      <ToastsPreview />
    </InBrowser>
  ),
  "document-signoff": () => <DocumentSignoff defaultDocument={WORKPAPER_DOCUMENT} actor="kari" actorName="Kari" />,
  "document-editor": () => <DocumentEditor defaultDocument={NOTE_PAGE} mentions={NOTE_MENTIONS} actor="nina" />,
  "sheet-stack": () => <SheetStackPreview />,
  "agent-status": () => <AgentStatusPreview />,
  "client-requests": () => <ClientRequests defaultRequests={CLIENT_REQUESTS} today="2026-11-15" actor="nina" />,
  "deal-pipeline": () => (
    <DealPipeline
      stages={PIPELINE_STAGES}
      defaultDeals={PIPELINE_DEALS}
      owners={PIPELINE_OWNERS}
      today="2026-11-24"
      actor="kari"
    />
  ),
  "funnel-chart": () => <FunnelChart steps={FUNNEL_STEPS} currency="NOK" />,
  "forecast-chart": () => (
    <ForecastChart
      deals={FORECAST_DEALS}
      stages={PIPELINE_STAGES}
      from="2026-10-01"
      to="2027-03-31"
      today="2026-11-24"
      currency="NOK"
    />
  ),
  "recurring-revenue": () => (
    <RecurringRevenue agreements={AGREEMENTS} from="2026-06-30" to="2026-11-30" currency="NOK" />
  ),
  "stage-duration": () => (
    <StageDurationChart
      stays={STAYS}
      stages={PIPELINE_STAGES}
      targets={{ kvalifisering: 14, tilbud: 30, forhandling: 21 }}
      today="2026-11-24"
    />
  ),
  "activity-timeline": () => (
    <ActivityTimeline defaultActivities={TIMELINE} people={PIPELINE_OWNERS} today="2026-11-24" actor="kari" />
  ),
  "chart-of-accounts": () => <ChartOfAccountsPreview />,
  "fixed-asset-register": () => <FixedAssetRegister defaultAssets={ASSETS} defaultPeriod="2026-10" />,
  "data-table": () => (
    <DataTable
      rows={LEDGER}
      columns={[
        { id: "voucher", header: "Voucher", value: (e) => e.voucherNumber },
        { id: "date", header: "Date", kind: "date", value: (e) => e.date },
        { id: "account", header: "Account", value: (e) => `${e.account} ${e.accountName}` },
        { id: "debit", header: "Debit", kind: "money", value: (e) => e.debitMinor || null },
        { id: "credit", header: "Credit", kind: "money", value: (e) => e.creditMinor || null },
      ]}
      pageSize={8}
      selectable
      aria-label="Journal"
    />
  ),
};
