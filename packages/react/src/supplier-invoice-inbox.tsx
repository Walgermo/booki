import { formatMoney, minorDigitsFor, money } from "@booki-aui/core/money";
import type { BookiChangeDetails } from "./change-details.js";
import { matchingRows, type TableColumn, type TableQuery } from "@booki-aui/core/table";
import {
  SUPPLIER_INVOICE_FIELDS,
  type BookedSupplierInvoice,
  type SupplierInvoice,
  type SupplierInvoiceCoding,
  type SupplierInvoiceField,
  type SupplierInvoiceStatus,
} from "@booki-aui/core/supplier-invoice";
import { createParts } from "@ui-sdk/react/primitive";
import type { ReactNode } from "react";
import { useAccessFor } from "./access.js";
import { ariaSort, downloadCsv, sortMark } from "./csv-download.js";
import { useBookiLocaleOptional } from "./locale.js";
import { useSay } from "./say.js";
import {
  type InvoiceTotals,
  type SupplierInvoiceSummary,
  AMOUNTS,
  DEFAULT_PAGE_SIZE,
  invoiceColumns,
  supplierInvoiceInbox,
} from "@booki-aui/primitives/supplier-invoice-inbox";

const parts = createParts(supplierInvoiceInbox, {
  root: "div",
  select: "button",
  cell: "input",
  account: "select",
  confirm: "button",
  approve: "button",
  reject: "button",
  search: "input",
  statusfilter: "select",
  sort: "button",
  prev: "button",
  next: "button",
});
const SupplierInvoiceInboxRoot = parts.Root;
const SupplierInvoiceInboxSelect = parts.Select;
const SupplierInvoiceInboxCell = parts.Cell;
const SupplierInvoiceInboxAccount = parts.Account;
const SupplierInvoiceInboxConfirm = parts.Confirm;
const SupplierInvoiceInboxApprove = parts.Approve;
const SupplierInvoiceInboxReject = parts.Reject;
const SupplierInvoiceInboxSearch = parts.Search;
const SupplierInvoiceInboxStatusFilter = parts.Statusfilter;
const SupplierInvoiceInboxSort = parts.Sort;
const SupplierInvoiceInboxPrev = parts.Prev;
const SupplierInvoiceInboxNext = parts.Next;

const COPY = {
  EN: {
    label: "Supplier invoices",
    supplier: "Supplier",
    number: "Invoice no.",
    due: "Due",
    gross: "Gross",
    status: "Status",
    open: "Open",
    empty: "No invoices in the inbox.",
    count: (n: number, ready: number) => `${n} invoice${n === 1 ? "" : "s"} · ${ready} ready to approve`,
    invoice: "Invoice",
    document: "Document",
    page: "page",
    bankAccount: "Bank account",
    confidence: "confidence",
    confirm: "Confirm",
    confirmedBy: "confirmed by",
    correctedBy: "corrected by",
    coding: "Coding",
    account: "Account",
    chooseAccount: "Choose an account",
    vatCode: "VAT code",
    dimensions: "Dimensions",
    issues: "Must be fixed before approval",
    duplicate: "duplicate of",
    reason: "Reason for rejecting",
    approve: "Approve for posting",
    reject: "Reject",
    search: "Search",
    allStatuses: "All statuses",
    currency: "Currency",
    exportCsv: "Download CSV",
    noMatch: "No invoices match.",
    total: "Total",
    prev: "Previous page",
    next: "Next page",
    range: (from: number, to: number, of: number) => `${from}–${to} of ${of}`,
    statuses: { new: "New", coded: "Coded", approved: "Approved", posted: "Posted", rejected: "Rejected" },
    fields: {
      supplierName: "Supplier name",
      supplierOrgNumber: "Organisation number",
      invoiceNumber: "Invoice number",
      invoiceDate: "Invoice date",
      dueDate: "Due date",
      netMinor: "Net",
      taxMinor: "Tax",
      grossMinor: "Gross",
      currency: "Currency",
      paymentReference: "Payment reference",
    },
  },
  NO: {
    label: "Leverandørfakturaer",
    supplier: "Leverandør",
    number: "Fakturanr.",
    due: "Forfall",
    gross: "Brutto",
    status: "Status",
    open: "Åpne",
    empty: "Ingen fakturaer i innboksen.",
    count: (n: number, ready: number) => `${n} faktura${n === 1 ? "" : "er"} · ${ready} klar til godkjenning`,
    invoice: "Faktura",
    document: "Dokument",
    page: "side",
    bankAccount: "Bankkonto",
    confidence: "sikkerhet",
    confirm: "Bekreft",
    confirmedBy: "bekreftet av",
    correctedBy: "rettet av",
    coding: "Kontering",
    account: "Konto",
    chooseAccount: "Velg konto",
    vatCode: "MVA-kode",
    dimensions: "Dimensjoner",
    issues: "Må rettes før godkjenning",
    duplicate: "duplikat av",
    reason: "Begrunnelse for avvisning",
    approve: "Godkjenn for bokføring",
    reject: "Avvis",
    search: "Søk",
    allStatuses: "Alle statuser",
    currency: "Valuta",
    exportCsv: "Last ned CSV",
    noMatch: "Ingen fakturaer passer.",
    total: "Sum",
    prev: "Forrige side",
    next: "Neste side",
    range: (from: number, to: number, of: number) => `${from}–${to} av ${of}`,
    statuses: { new: "Ny", coded: "Kontert", approved: "Godkjent", posted: "Bokført", rejected: "Avvist" },
    fields: {
      supplierName: "Leverandørnavn",
      supplierOrgNumber: "Organisasjonsnummer",
      invoiceNumber: "Fakturanummer",
      invoiceDate: "Fakturadato",
      dueDate: "Forfallsdato",
      netMinor: "Netto",
      taxMinor: "MVA",
      grossMinor: "Brutto",
      currency: "Valuta",
      paymentReference: "Betalingsreferanse",
    },
  },
} as const;

export type SupplierInvoiceInboxProps = {
  invoices?: SupplierInvoice[];
  defaultInvoices?: SupplierInvoice[];
  booked?: BookedSupplierInvoice[];
  chart?: string[];
  threshold?: number;
  actor?: string;
  agentActor?: string;
  /** The company's rule for approving without a person: true, or a sentence saying why not. Enables the agent's approveUnderRule. */
  rule?: (invoice: SupplierInvoice) => boolean | string;
  /** The rule's name in the record: approved by `rule:<ruleName>`. */
  ruleName?: string;
  onInvoicesChange?: (invoices: SupplierInvoice[], details: BookiChangeDetails) => void;
  /** Invoices a person sees per page. Defaults to 100. */
  pageSize?: number;
  /** The sort, search, filters and page of the list, when the app owns it. */
  query?: TableQuery;
  defaultQuery?: Partial<TableQuery>;
  onQueryChange?: (query: TableQuery) => void;
  className?: string;
  "aria-label"?: string;
};

type RootState = {
  invoices: SupplierInvoice[];
  inbox: SupplierInvoiceSummary[];
  selected: string;
  refusal: string;
  query: TableQuery;
  view: { total: number; matching: number; page: number; pageCount: number };
  totals: InvoiceTotals;
  pageIds: string[];
};

/** A header cell whose label sorts the list: asc, desc, off. */
function SortHeader({
  id,
  query,
  align,
  children,
}: {
  id: string;
  query: TableQuery;
  align?: "end";
  children: ReactNode;
}) {
  const sorted = query.sort?.column === id ? query.sort.direction : undefined;
  return (
    <th scope="col" data-align={align} aria-sort={ariaSort(query.sort, id)}>
      <SupplierInvoiceInboxSort value={id}>
        {children}
        <span aria-hidden="true" data-slot="supplier-invoice-inbox-sort-mark">
          {sortMark(sorted)}
        </span>
      </SupplierInvoiceInboxSort>
    </th>
  );
}

const STATUSES: SupplierInvoiceStatus[] = ["new", "coded", "approved", "posted", "rejected"];

const mask = (account: string) => {
  const digits = account.replace(/\s/g, "");
  return digits.length > 4 ? `•••• ${digits.slice(-4)}` : "••••";
};

/**
 * Composed inbox: the list (search, status filter, sortable headers, gross per
 * currency over every match, pages, CSV), one open invoice with its fields and
 * coding, and approve / reject.
 */
function SupplierInvoiceInbox({
  invoices,
  defaultInvoices,
  booked,
  chart,
  threshold,
  actor,
  agentActor,
  rule,
  ruleName,
  onInvoicesChange,
  pageSize = DEFAULT_PAGE_SIZE,
  query,
  defaultQuery,
  onQueryChange,
  className,
  "aria-label": ariaLabel,
}: SupplierInvoiceInboxProps) {
  const { country, profile } = useBookiLocaleOptional();
  const say = useSay();
  const access = useAccessFor({ approve: "supplier-invoice.approve", reject: "supplier-invoice.approve" }, actor);
  const copy = COPY[country === "NO" ? "NO" : "EN"];
  return (
    <SupplierInvoiceInboxRoot
      invoices={invoices}
      defaultInvoices={defaultInvoices}
      booked={booked}
      chart={chart}
      threshold={threshold}
      actor={access.actor}
      denied={access.denied}
      agentActor={agentActor}
      rule={rule}
      ruleName={ruleName}
      locale={profile.locale}
      onInvoicesChange={onInvoicesChange}
      pageSize={pageSize}
      query={query}
      defaultQuery={defaultQuery}
      onQueryChange={onQueryChange}
      className={className}
      aria-label={ariaLabel ?? copy.label}
    >
      {(state: RootState) => {
        const fmt = (invoice: SupplierInvoice) => {
          const minor = invoice.fields.grossMinor.value;
          if (!Number.isSafeInteger(minor)) return "";
          return formatMoney(money(minor, invoice.fields.currency.value || profile.currency), {
            locale: profile.locale,
          });
        };
        const open = state.invoices.find((item) => item.id === state.selected);
        const summary = state.inbox.find((item) => item.id === state.selected);
        const editable = open?.status === "new" || open?.status === "coded";
        const ready = state.inbox.filter((item) => item.approvable).length;
        const page = state.pageIds
          .map((id) => state.invoices.find((invoice) => invoice.id === id))
          .filter((invoice): invoice is SupplierInvoice => Boolean(invoice));
        const from = state.view.matching === 0 ? 0 : (state.view.page - 1) * state.query.pageSize + 1;
        const to = Math.min(state.view.matching, state.view.page * state.query.pageSize);
        const totals = Object.entries(state.totals.grossMinor);
        const download = () => {
          const headers: Record<string, string> = {
            supplierName: copy.supplier,
            invoiceNumber: copy.number,
            dueDate: copy.due,
            grossMinor: copy.gross,
            currency: copy.currency,
            status: copy.status,
          };
          // Gross in its own currency's decimals; never the payment reference or the bank account.
          const columns: TableColumn<SupplierInvoice>[] = invoiceColumns.map((column) =>
            column.id === "grossMinor"
              ? {
                  ...column,
                  header: headers.grossMinor!,
                  kind: "text",
                  value: (invoice) => {
                    const minor = invoice.fields.grossMinor.value;
                    if (!Number.isSafeInteger(minor)) return "";
                    const digits = minorDigitsFor(invoice.fields.currency.value || profile.currency);
                    return (minor / 10 ** digits).toFixed(digits);
                  },
                }
              : { ...column, header: headers[column.id] ?? column.header },
          );
          downloadCsv("supplier-invoices", matchingRows(state.invoices, invoiceColumns, state.query), columns, country);
        };
        return (
          <>
            <p data-slot="supplier-invoice-inbox-status" role="status">
              {state.invoices.length === 0 ? copy.empty : copy.count(state.invoices.length, ready)}
            </p>
            {state.invoices.length > 0 ? (
              <div data-slot="supplier-invoice-inbox-toolbar">
                <label data-slot="supplier-invoice-inbox-filter">
                  <span data-slot="visually-hidden">{copy.search}</span>
                  <SupplierInvoiceInboxSearch placeholder={copy.search} aria-label={copy.search} />
                </label>
                <label data-slot="supplier-invoice-inbox-filter">
                  <span data-slot="visually-hidden">{copy.status}</span>
                  <SupplierInvoiceInboxStatusFilter aria-label={copy.status}>
                    <option value="">{copy.allStatuses}</option>
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {copy.statuses[status]}
                      </option>
                    ))}
                  </SupplierInvoiceInboxStatusFilter>
                </label>
                <span data-slot="supplier-invoice-inbox-spacer" />
                <button
                  type="button"
                  data-slot="supplier-invoice-inbox-export"
                  data-variant="secondary"
                  onClick={download}
                >
                  {copy.exportCsv}
                </button>
              </div>
            ) : null}
            {state.invoices.length > 0 ? (
              <div data-slot="supplier-invoice-inbox-scroll">
                <table data-slot="supplier-invoice-inbox-table">
                  <thead>
                    <tr>
                      <SortHeader id="supplierName" query={state.query}>
                        {copy.supplier}
                      </SortHeader>
                      <SortHeader id="invoiceNumber" query={state.query}>
                        {copy.number}
                      </SortHeader>
                      <SortHeader id="dueDate" query={state.query}>
                        {copy.due}
                      </SortHeader>
                      <SortHeader id="grossMinor" query={state.query} align="end">
                        {copy.gross}
                      </SortHeader>
                      <SortHeader id="status" query={state.query}>
                        {copy.status}
                      </SortHeader>
                      <th>
                        <span data-slot="visually-hidden">{copy.open}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.length === 0 ? (
                      <tr>
                        <td colSpan={6} data-slot="supplier-invoice-inbox-empty">
                          {copy.noMatch}
                        </td>
                      </tr>
                    ) : null}
                    {page.map((invoice) => {
                      const row = state.inbox.find((item) => item.id === invoice.id);
                      return (
                        <tr
                          key={invoice.id}
                          data-status={invoice.status}
                          data-selected={invoice.id === state.selected ? "" : undefined}
                          data-attention={row && row.issues.length > 0 ? "" : undefined}
                        >
                          <td>{invoice.fields.supplierName.value}</td>
                          <td data-slot="supplier-invoice-inbox-figure">{invoice.fields.invoiceNumber.value}</td>
                          <td data-slot="supplier-invoice-inbox-figure">{invoice.fields.dueDate.value}</td>
                          <td data-align="end" data-slot="supplier-invoice-inbox-figure">
                            {fmt(invoice)}
                          </td>
                          <td data-slot="supplier-invoice-inbox-state">
                            {copy.statuses[invoice.status as SupplierInvoiceStatus]}
                            {row && row.duplicateOf.length > 0
                              ? ` · ${copy.duplicate} ${row.duplicateOf.join(", ")}`
                              : ""}
                          </td>
                          <td>
                            <SupplierInvoiceInboxSelect
                              value={invoice.id}
                              aria-label={`${copy.open}: ${invoice.fields.supplierName.value} ${invoice.fields.invoiceNumber.value}`}
                            >
                              {copy.open}
                            </SupplierInvoiceInboxSelect>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {totals.length > 0 ? (
                    <tfoot>
                      {totals.map(([currency, minor], index) => (
                        <tr key={currency} data-slot="supplier-invoice-inbox-totals">
                          <th colSpan={3} scope="row">
                            {index === 0 ? copy.total : ""}
                          </th>
                          <td data-align="end" data-slot="supplier-invoice-inbox-figure">
                            {formatMoney(money(minor, currency || profile.currency), { locale: profile.locale })}
                          </td>
                          <td colSpan={2} />
                        </tr>
                      ))}
                    </tfoot>
                  ) : null}
                </table>
              </div>
            ) : null}
            {state.view.matching > state.query.pageSize ? (
              <div data-slot="supplier-invoice-inbox-pagination">
                <SupplierInvoiceInboxPrev aria-label={copy.prev}>←</SupplierInvoiceInboxPrev>
                <span data-slot="supplier-invoice-inbox-range" aria-live="polite">
                  {copy.range(from, to, state.view.matching)}
                </span>
                <SupplierInvoiceInboxNext aria-label={copy.next}>→</SupplierInvoiceInboxNext>
              </div>
            ) : null}
            {open && summary ? (
              <section
                data-slot="supplier-invoice-inbox-detail"
                data-status={open.status}
                aria-label={`${copy.invoice} ${open.fields.invoiceNumber.value}`}
              >
                <p data-slot="supplier-invoice-inbox-document">
                  {copy.document}: {open.document.fileName ?? open.document.id}
                  {open.document.page ? `, ${copy.page} ${open.document.page}` : ""} ·{" "}
                  {copy.statuses[open.status as SupplierInvoiceStatus]}
                  {open.bankAccount ? (
                    <>
                      {" · "}
                      {copy.bankAccount}: <span data-agent-secret="">{mask(open.bankAccount)}</span>
                    </>
                  ) : null}
                </p>
                <div data-slot="supplier-invoice-inbox-fields">
                  {SUPPLIER_INVOICE_FIELDS.map((field) => {
                    const entry = open.fields[field];
                    const review = summary.needsReview.includes(field);
                    const amount = AMOUNTS.includes(field);
                    return (
                      <div key={field} data-slot="supplier-invoice-inbox-field" data-review={review ? "" : undefined}>
                        <label>
                          <span>{copy.fields[field]}</span>
                          <SupplierInvoiceInboxCell
                            value={`${open.id}|${field}`}
                            aria-label={copy.fields[field]}
                            inputMode={amount ? "decimal" : undefined}
                            data-align={amount ? "end" : undefined}
                            aria-invalid={review ? "true" : undefined}
                          />
                        </label>
                        <span data-slot="supplier-invoice-inbox-note">
                          {Math.round(entry.confidence * 100)}% {copy.confidence}
                          {entry.correctedBy ? ` · ${copy.correctedBy} ${entry.correctedBy}` : ""}
                          {entry.confirmedBy ? ` · ${copy.confirmedBy} ${entry.confirmedBy}` : ""}
                        </span>
                        {review ? (
                          <SupplierInvoiceInboxConfirm
                            value={`${open.id}|${field}`}
                            aria-label={`${copy.confirm}: ${copy.fields[field]}`}
                          >
                            {copy.confirm}
                          </SupplierInvoiceInboxConfirm>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
                <div data-slot="supplier-invoice-inbox-coding" role="group" aria-label={copy.coding}>
                  <label>
                    <span>{copy.account}</span>
                    {chart && editable ? (
                      <SupplierInvoiceInboxAccount value={open.id} aria-label={copy.account}>
                        <option value="" disabled>
                          {copy.chooseAccount}
                        </option>
                        {[...new Set([...chart, ...(open.coding ? [open.coding.account] : [])])].map((account) => (
                          <option key={account} value={account}>
                            {account}
                          </option>
                        ))}
                      </SupplierInvoiceInboxAccount>
                    ) : (
                      <SupplierInvoiceInboxCell value={`${open.id}|account`} aria-label={copy.account} />
                    )}
                  </label>
                  <label>
                    <span>{copy.vatCode}</span>
                    <SupplierInvoiceInboxCell value={`${open.id}|vatCode`} aria-label={copy.vatCode} />
                  </label>
                  {open.coding?.dimensions ? (
                    <p data-slot="supplier-invoice-inbox-note">
                      {copy.dimensions}:{" "}
                      {Object.entries(open.coding.dimensions)
                        .map(([key, value]) => `${key} ${value}`)
                        .join(", ")}
                    </p>
                  ) : null}
                </div>
                {summary.issues.length > 0 ? (
                  <ul data-slot="supplier-invoice-inbox-issues" aria-label={copy.issues}>
                    {summary.issues.map((issue) => (
                      <li key={issue}>{say(issue)}</li>
                    ))}
                  </ul>
                ) : null}
                {open.status === "rejected" && open.rejectionReason ? (
                  <p data-slot="supplier-invoice-inbox-note">
                    {copy.reason}: {open.rejectionReason}
                  </p>
                ) : null}
                {editable ? (
                  <div data-slot="supplier-invoice-inbox-actions">
                    <SupplierInvoiceInboxApprove value={open.id} disabled={!summary.approvable}>
                      {copy.approve}
                    </SupplierInvoiceInboxApprove>
                    <label>
                      <span data-slot="visually-hidden">{copy.reason}</span>
                      <SupplierInvoiceInboxCell
                        value={`${open.id}|reason`}
                        aria-label={copy.reason}
                        placeholder={copy.reason}
                      />
                    </label>
                    <SupplierInvoiceInboxReject value={open.id}>{copy.reject}</SupplierInvoiceInboxReject>
                  </div>
                ) : null}
              </section>
            ) : null}
            {state.refusal ? (
              <p data-slot="supplier-invoice-inbox-error" role="alert">
                {say(state.refusal)}
              </p>
            ) : null}
          </>
        );
      }}
    </SupplierInvoiceInboxRoot>
  );
}

export {
  SupplierInvoiceInbox,
  SupplierInvoiceInboxAccount,
  SupplierInvoiceInboxApprove,
  SupplierInvoiceInboxCell,
  SupplierInvoiceInboxConfirm,
  SupplierInvoiceInboxReject,
  SupplierInvoiceInboxRoot,
  SupplierInvoiceInboxSelect,
  SupplierInvoiceInboxSearch,
  SupplierInvoiceInboxStatusFilter,
  SupplierInvoiceInboxSort,
  SupplierInvoiceInboxPrev,
  SupplierInvoiceInboxNext,
  supplierInvoiceInbox,
};
export type {
  BookedSupplierInvoice,
  SupplierInvoice,
  SupplierInvoiceCoding,
  SupplierInvoiceField,
  SupplierInvoiceStatus,
};

export { type SupplierInvoiceSummary, type InvoiceTotals } from "@booki-aui/primitives/supplier-invoice-inbox";
