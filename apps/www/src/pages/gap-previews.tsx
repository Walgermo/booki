import { Button } from "@ui-sdk/react/button";
import { drawSample, startWorkpaper } from "@booki/core/audit";
import { NO_VAT_SCHEMA_EXAMPLE } from "@booki/core/vat-return";
import {
  AgedBalances,
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
  ConfirmDialog,
  DocumentSignoff,
  EvidenceList,
  SheetStack,
  createToaster,
  ExpenseClaim,
  FixedAssetRegister,
  LedgerTable,
  SupplierInvoiceInbox,
  VatReturn,
} from "@booki/react";

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
import { CASHFLOW, COST_BY_ACCOUNT, COSTS, OPENING, REVENUE, series } from "@/components/erp-dashboard";
import type { ClientRequest, Finding, SignableDocument, StackSheet } from "@booki/react";
import { useState, useSyncExternalStore, type ReactNode } from "react";

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

/** Live previews for the docs pages, on the shared demo books. */
export const GAP_PREVIEWS: Record<string, () => React.JSX.Element> = {
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
  "sheet-stack": () => <SheetStackPreview />,
  "client-requests": () => <ClientRequests defaultRequests={CLIENT_REQUESTS} today="2026-11-15" actor="nina" />,
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
