import {
  accountLedger,
  summarizeLedger,
  type AccountLedgerRow,
  type LedgerEntry,
  type TrialBalanceRow,
} from "@booki-aui/core/ledger";
import { formatMoney, minorDigitsFor, money } from "@booki-aui/core/money";
import { matchingRows, type TableColumn, type TableQuery } from "@booki-aui/core/table";
import { createParts } from "@ui-sdk/react/primitive";
import { useMemo, type ReactNode } from "react";
import { ariaSort, downloadCsv, sortMark } from "./csv-download.js";
import { useBookiLocaleOptional } from "./locale.js";
import { useSay } from "./say.js";
import {
  type Details,
  type LedgerVoucherRef,
  type LedgerView,
  type LedgerDocument,
  type LedgerVoucherSummary,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SNAPSHOT_ROWS,
  columnsOf,
  range,
  ledgerTable,
} from "@booki-aui/primitives/ledger-table";

const parts = createParts(ledgerTable, {
  root: "div",
  from: "input",
  to: "input",
  list: "div",
  row: "div",
  back: "button",
  voucher: "button",
  lineaccount: "button",
  document: "button",
  crumb: "button",
  previous: "button",
  next: "button",
  search: "input",
  sort: "button",
});
const LedgerTableRoot = parts.Root;
const LedgerTableFrom = parts.From;
const LedgerTableTo = parts.To;
const LedgerTableList = parts.List;
const LedgerTableRow = parts.Row;
const LedgerTableBack = parts.Back;
const LedgerTableVoucher = parts.Voucher;
const LedgerTableLineAccount = parts.Lineaccount;
const LedgerTableDocument = parts.Document;
const LedgerTableCrumb = parts.Crumb;
const LedgerTablePrevious = parts.Previous;
const LedgerTableNext = parts.Next;
const LedgerTableSearch = parts.Search;
const LedgerTableSort = parts.Sort;

const COPY = {
  EN: {
    ledger: "General ledger",
    trialBalance: "Trial balance",
    from: "From",
    to: "To",
    account: "Account",
    opening: "Opening",
    debit: "Debit",
    credit: "Credit",
    closing: "Closing",
    total: "Total",
    balanced: "Debit and credit are equal",
    notBalanced: "Debit and credit differ by",
    back: "Back to trial balance",
    date: "Date",
    voucher: "Voucher",
    text: "Text",
    balance: "Balance",
    openingBalance: "Opening balance",
    openVoucher: "Open voucher",
    previous: "Previous",
    next: "Next",
    rows: "Rows",
    of: "of",
    noEntries: "No entries in this range.",
    voucherHeading: "Voucher",
    lines: "Lines",
    document: "Document",
    openDocument: "Open document",
    noDocument: "No document attached",
    voucherBalanced: "Balanced",
    voucherOff: "Out of balance by",
    breadcrumb: "Where you are",
    openAccount: "Open account",
    search: "Search",
    exportCsv: "Download CSV",
    noMatch: "No rows match.",
    accountName: "Account name",
  },
  NO: {
    ledger: "Hovedbok",
    trialBalance: "Saldobalanse",
    from: "Fra",
    to: "Til",
    account: "Konto",
    opening: "Inngående",
    debit: "Debet",
    credit: "Kredit",
    closing: "Utgående",
    total: "Sum",
    balanced: "Debet og kredit er like",
    notBalanced: "Debet og kredit avviker med",
    back: "Tilbake til saldobalansen",
    date: "Dato",
    voucher: "Bilag",
    text: "Tekst",
    balance: "Saldo",
    openingBalance: "Inngående saldo",
    openVoucher: "Åpne bilag",
    previous: "Forrige",
    next: "Neste",
    rows: "Rader",
    of: "av",
    noEntries: "Ingen posteringer i dette tidsrommet.",
    voucherHeading: "Bilag",
    lines: "Linjer",
    document: "Dokument",
    openDocument: "Åpne dokument",
    noDocument: "Ingen dokument vedlagt",
    voucherBalanced: "I balanse",
    voucherOff: "Ute av balanse med",
    breadcrumb: "Der du er",
    openAccount: "Åpne konto",
    search: "Søk",
    exportCsv: "Last ned CSV",
    noMatch: "Ingen rader passer.",
    accountName: "Kontonavn",
  },
} as const;

export type LedgerTableProps = {
  entries: LedgerEntry[];
  account?: string | null;
  defaultAccount?: string | null;
  onAccountChange?: (account: string | null) => void;
  from?: string | null;
  defaultFrom?: string | null;
  onFromChange?: (from: string | null) => void;
  to?: string | null;
  defaultTo?: string | null;
  onToChange?: (to: string | null) => void;
  /** Rows shown per page. Defaults to 100. */
  pageSize?: number;
  /** Most rows an agent's snapshot carries. Defaults to 50. */
  snapshotRows?: number;
  /** The sort, search, filters and page of the view on screen, when the app owns it. */
  query?: TableQuery;
  defaultQuery?: Partial<TableQuery>;
  onQueryChange?: (query: TableQuery) => void;
  /**
   * A person picked an entry. The ledger then shows the whole voucher; call
   * `details.cancel()` to show it in your own screen instead.
   */
  onOpenVoucher?: (voucher: LedgerVoucherRef, details?: Details) => void;
  /** The voucher shown (its id), or null. */
  voucher?: string | null;
  defaultVoucher?: string | null;
  onVoucherChange?: (voucher: string | null) => void;
  /** The document behind each voucher, by voucher id. */
  documents?: Record<string, LedgerDocument>;
  /** A person asked to see a voucher's document. */
  onOpenDocument?: (document: LedgerDocument & { voucherId: string }) => void;
  className?: string;
  "aria-label"?: string;
};

type RootState = {
  view: LedgerView;
  account: string | null;
  voucher: string | null;
  voucherSummary: LedgerVoucherSummary | null;
  from: string | null;
  to: string | null;
  /** The page on screen, 1-based, the same as `table.page`. */
  page: number;
  pageSize: number;
  total: number;
  balanced: boolean;
  refusal: string;
  query: TableQuery;
  table: { total: number; matching: number; page: number; pageCount: number };
  totals: Record<string, number>;
  pageRows: unknown[];
};

type Copy = (typeof COPY)[keyof typeof COPY];

/** A header cell whose label sorts the view: asc, desc, off. */
function SortHeader({
  id,
  query,
  align,
  as = "th",
  children,
}: {
  id: string;
  query: TableQuery;
  align?: "end";
  as?: "th" | "span";
  children: ReactNode;
}) {
  const sorted = query.sort?.column === id ? query.sort.direction : undefined;
  const label = (
    <LedgerTableSort value={id}>
      {children}
      <span aria-hidden="true" data-slot="ledger-table-sort-mark">
        {sortMark(sorted)}
      </span>
    </LedgerTableSort>
  );
  return as === "th" ? (
    <th scope="col" data-align={align} aria-sort={ariaSort(query.sort, id)}>
      {label}
    </th>
  ) : (
    <span role="columnheader" data-align={align} aria-sort={ariaSort(query.sort, id)}>
      {label}
    </span>
  );
}

/** Column headers people read, for the CSV. */
function headersOf(copy: Copy): Record<string, string> {
  return {
    account: copy.account,
    accountName: copy.accountName,
    openingMinor: copy.opening,
    debitMinor: copy.debit,
    creditMinor: copy.credit,
    closingMinor: copy.closing,
    date: copy.date,
    voucherNumber: copy.voucher,
    description: copy.text,
    balanceMinor: copy.balance,
  };
}

/** One voucher: every line on every account, its balance, and the document behind it. */
function VoucherView({
  summary,
  copy,
  fmt,
  backTo,
  state,
}: {
  backTo: string;
  summary: LedgerVoucherSummary;
  copy: Copy;
  fmt: (minor: number) => string;
  state: RootState;
}) {
  const lines = state.pageRows as LedgerEntry[];
  return (
    <>
      <div data-slot="ledger-table-heading">
        <LedgerTableBack>← {backTo}</LedgerTableBack>
        <h3>
          {copy.voucherHeading} <span data-slot="ledger-table-number">{summary.voucherNumber}</span> · {summary.date} ·{" "}
          {summary.description}
        </h3>
      </div>
      <div data-slot="ledger-table-voucher-meta">
        <p data-slot="ledger-table-status" role="status" data-balanced={summary.balanced ? "true" : "false"}>
          {summary.balanced
            ? copy.voucherBalanced
            : `${copy.voucherOff} ${fmt(summary.debitMinor - summary.creditMinor)}`}
          {" · "}
          {summary.lines} {copy.lines.toLowerCase()}
        </p>
        <p data-slot="ledger-table-document-row">
          <span>{copy.document}: </span>
          {summary.document ? (
            <>
              <span data-slot="ledger-table-document-name">{summary.document}</span>{" "}
              <LedgerTableDocument>{copy.openDocument}</LedgerTableDocument>
            </>
          ) : (
            <span>{copy.noDocument}</span>
          )}
        </p>
      </div>
      <div data-slot="ledger-table-scroll">
        <table data-slot="ledger-table-entries">
          <thead>
            <tr>
              <SortHeader id="account" query={state.query}>
                {copy.account}
              </SortHeader>
              <SortHeader id="description" query={state.query}>
                {copy.text}
              </SortHeader>
              <SortHeader id="debitMinor" query={state.query} align="end">
                {copy.debit}
              </SortHeader>
              <SortHeader id="creditMinor" query={state.query} align="end">
                {copy.credit}
              </SortHeader>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={4} data-slot="ledger-table-empty">
                  {copy.noMatch}
                </td>
              </tr>
            ) : null}
            {lines.map((line) => (
              <tr key={line.id}>
                <td>
                  <LedgerTableLineAccount
                    value={line.account}
                    aria-label={`${copy.openAccount} ${line.account} ${line.accountName}`}
                  >
                    <span data-slot="ledger-table-number">{line.account}</span> {line.accountName}
                  </LedgerTableLineAccount>
                </td>
                <td>{line.description}</td>
                <td data-slot="ledger-table-amount">{line.debitMinor ? fmt(line.debitMinor) : ""}</td>
                <td data-slot="ledger-table-amount">{line.creditMinor ? fmt(line.creditMinor) : ""}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={2} scope="row">
                {copy.total}
              </th>
              <td data-slot="ledger-table-amount">{fmt(state.totals.debitMinor ?? 0)}</td>
              <td data-slot="ledger-table-amount">{fmt(state.totals.creditMinor ?? 0)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

function LedgerBody({ entries, state }: { entries: LedgerEntry[]; state: RootState }) {
  const { country, profile } = useBookiLocaleOptional();
  const say = useSay();
  const copy = COPY[country === "NO" ? "NO" : "EN"];
  const fmt = (minor: number) => formatMoney(money(minor, profile.currency), { locale: profile.locale });
  // Worked out once per ledger and range, not per page.
  const summary = useMemo(() => summarizeLedger(entries, range(state.from, state.to)), [entries, state.from, state.to]);
  const ledger = useMemo(
    () => (state.account === null ? null : accountLedger(entries, state.account, range(state.from, state.to))),
    [entries, state.account, state.from, state.to],
  );
  const start = (state.table.page - 1) * state.query.pageSize;
  const end = Math.min(state.table.matching, start + state.query.pageSize);
  // Nothing searched or filtered away: the account's closing balance still stands for the rows shown.
  const whole = state.table.matching === state.table.total;
  const download = () => {
    const columns = (columnsOf(state.view) as TableColumn<unknown>[]).map((column) => ({
      ...column,
      header: headersOf(copy)[column.id] ?? column.header,
    }));
    const all: unknown[] =
      state.view === "voucher"
        ? entries.filter((entry) => entry.voucherId === state.voucher)
        : state.view === "account" && ledger
          ? ledger.rows
          : summary.rows;
    const name =
      state.view === "voucher"
        ? `voucher-${state.voucherSummary?.voucherNumber ?? ""}`
        : state.view === "account"
          ? `account-${state.account}`
          : "trial-balance";
    downloadCsv(name, matchingRows(all, columns, state.query), columns, country, minorDigitsFor(profile.currency));
  };

  return (
    <>
      <div data-slot="ledger-table-bar">
        <label data-slot="ledger-table-field">
          <span>{copy.from}</span>
          <LedgerTableFrom />
        </label>
        <label data-slot="ledger-table-field">
          <span>{copy.to}</span>
          <LedgerTableTo />
        </label>
        <label data-slot="ledger-table-field">
          <span>{copy.search}</span>
          <LedgerTableSearch placeholder={copy.search} />
        </label>
        <p data-slot="ledger-table-status" role="status">
          {state.balanced ? copy.balanced : `${copy.notBalanced} ${fmt(summary.differenceMinor)}`}
        </p>
        <button type="button" data-slot="ledger-table-export" data-variant="secondary" onClick={download}>
          {copy.exportCsv}
        </button>
      </div>

      {state.view !== "trial-balance" ? (
        <nav data-slot="ledger-table-crumbs" aria-label={copy.breadcrumb}>
          <LedgerTableCrumb value="trial-balance">{copy.trialBalance}</LedgerTableCrumb>
          {state.account !== null && ledger ? (
            <>
              <span aria-hidden="true">›</span>
              {state.view === "voucher" ? (
                <LedgerTableCrumb value="account">
                  {ledger.account} {ledger.accountName}
                </LedgerTableCrumb>
              ) : (
                <span aria-current="page">
                  {ledger.account} {ledger.accountName}
                </span>
              )}
            </>
          ) : null}
          {state.view === "voucher" && state.voucherSummary ? (
            <>
              <span aria-hidden="true">›</span>
              <span aria-current="page">
                {copy.voucherHeading} {state.voucherSummary.voucherNumber}
              </span>
            </>
          ) : null}
        </nav>
      ) : null}

      {state.view === "voucher" && state.voucherSummary ? (
        <VoucherView
          state={state}
          summary={state.voucherSummary}
          copy={copy}
          fmt={fmt}
          backTo={ledger ? `${ledger.account} ${ledger.accountName}` : copy.trialBalance}
        />
      ) : state.view === "trial-balance" || ledger === null ? (
        <div data-slot="ledger-table-scroll">
          <div data-slot="ledger-table-grid">
            <div data-slot="ledger-table-head">
              <SortHeader as="span" id="account" query={state.query}>
                {copy.account}
              </SortHeader>
              <SortHeader as="span" id="openingMinor" query={state.query} align="end">
                {copy.opening}
              </SortHeader>
              <SortHeader as="span" id="debitMinor" query={state.query} align="end">
                {copy.debit}
              </SortHeader>
              <SortHeader as="span" id="creditMinor" query={state.query} align="end">
                {copy.credit}
              </SortHeader>
              <SortHeader as="span" id="closingMinor" query={state.query} align="end">
                {copy.closing}
              </SortHeader>
            </div>
            {summary.rows.length === 0 ? (
              <p data-slot="ledger-table-empty">{copy.noEntries}</p>
            ) : state.pageRows.length === 0 ? (
              <p data-slot="ledger-table-empty">{copy.noMatch}</p>
            ) : (
              <LedgerTableList aria-label={copy.trialBalance}>
                {(state.pageRows as TrialBalanceRow[]).map((row) => (
                  <LedgerTableRow
                    key={row.account}
                    value={row.account}
                    aria-label={`${row.account} ${row.accountName}: ${copy.opening} ${fmt(row.openingMinor)}, ${copy.debit} ${fmt(row.debitMinor)}, ${copy.credit} ${fmt(row.creditMinor)}, ${copy.closing} ${fmt(row.closingMinor)}`}
                  >
                    <span data-slot="ledger-table-account">
                      <span data-slot="ledger-table-number">{row.account}</span> {row.accountName}
                    </span>
                    <span data-slot="ledger-table-amount">{fmt(row.openingMinor)}</span>
                    <span data-slot="ledger-table-amount">{fmt(row.debitMinor)}</span>
                    <span data-slot="ledger-table-amount">{fmt(row.creditMinor)}</span>
                    <span data-slot="ledger-table-amount">{fmt(row.closingMinor)}</span>
                  </LedgerTableRow>
                ))}
              </LedgerTableList>
            )}
            <div data-slot="ledger-table-total">
              <span>{copy.total}</span>
              <span data-slot="ledger-table-amount">{fmt(state.totals.openingMinor ?? 0)}</span>
              <span data-slot="ledger-table-amount">{fmt(state.totals.debitMinor ?? 0)}</span>
              <span data-slot="ledger-table-amount">{fmt(state.totals.creditMinor ?? 0)}</span>
              <span data-slot="ledger-table-amount">{fmt(state.totals.closingMinor ?? 0)}</span>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div data-slot="ledger-table-heading">
            <LedgerTableBack>{copy.back}</LedgerTableBack>
            <h3>
              <span data-slot="ledger-table-number">{ledger.account}</span> {ledger.accountName}
            </h3>
          </div>
          <div data-slot="ledger-table-scroll">
            <table data-slot="ledger-table-entries">
              <thead>
                <tr>
                  <SortHeader id="date" query={state.query}>
                    {copy.date}
                  </SortHeader>
                  <SortHeader id="voucherNumber" query={state.query}>
                    {copy.voucher}
                  </SortHeader>
                  <SortHeader id="description" query={state.query}>
                    {copy.text}
                  </SortHeader>
                  <SortHeader id="debitMinor" query={state.query} align="end">
                    {copy.debit}
                  </SortHeader>
                  <SortHeader id="creditMinor" query={state.query} align="end">
                    {copy.credit}
                  </SortHeader>
                  <SortHeader id="balanceMinor" query={state.query} align="end">
                    {copy.balance}
                  </SortHeader>
                </tr>
              </thead>
              <tbody>
                <tr data-slot="ledger-table-opening">
                  <th colSpan={5} scope="row">
                    {copy.openingBalance}
                  </th>
                  <td data-slot="ledger-table-amount">{fmt(ledger.openingMinor)}</td>
                </tr>
                {state.pageRows.length === 0 && ledger.rows.length > 0 ? (
                  <tr>
                    <td colSpan={6} data-slot="ledger-table-empty">
                      {copy.noMatch}
                    </td>
                  </tr>
                ) : null}
                {(state.pageRows as AccountLedgerRow[]).map((row) => (
                  <tr key={row.id}>
                    <td data-slot="ledger-table-date">{row.date}</td>
                    <td>
                      <LedgerTableVoucher value={row.id} aria-label={`${copy.openVoucher} ${row.voucherNumber}`}>
                        {row.voucherNumber}
                      </LedgerTableVoucher>
                    </td>
                    <td>{row.description}</td>
                    <td data-slot="ledger-table-amount">{row.debitMinor ? fmt(row.debitMinor) : ""}</td>
                    <td data-slot="ledger-table-amount">{row.creditMinor ? fmt(row.creditMinor) : ""}</td>
                    <td data-slot="ledger-table-amount">{fmt(row.balanceMinor)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th colSpan={3} scope="row">
                    {copy.total}
                  </th>
                  <td data-slot="ledger-table-amount">{fmt(state.totals.debitMinor ?? 0)}</td>
                  <td data-slot="ledger-table-amount">{fmt(state.totals.creditMinor ?? 0)}</td>
                  <td data-slot="ledger-table-amount">{whole ? fmt(ledger.closingMinor) : ""}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {state.table.matching > state.query.pageSize ? (
        <div data-slot="ledger-table-pages">
          <LedgerTablePrevious>{copy.previous}</LedgerTablePrevious>
          <p data-slot="ledger-table-range" role="status">
            {copy.rows} {start + 1}–{end} {copy.of} {state.table.matching}
          </p>
          <LedgerTableNext>{copy.next}</LedgerTableNext>
        </div>
      ) : null}
      {state.refusal ? (
        <p data-slot="ledger-table-error" role="alert">
          {say(state.refusal)}
        </p>
      ) : null}
    </>
  );
}

/**
 * Composed ledger: a date range, a search, the trial balance as a list (arrow
 * keys move, Enter opens an account), and the account's entries with a running
 * balance. Headers sort, totals cover every matching row, the CSV holds every
 * matching row of the view. Only one page of rows is in the page at a time.
 */
function LedgerTable({
  entries,
  account,
  defaultAccount,
  onAccountChange,
  from,
  defaultFrom,
  onFromChange,
  to,
  defaultTo,
  onToChange,
  pageSize = DEFAULT_PAGE_SIZE,
  snapshotRows = DEFAULT_SNAPSHOT_ROWS,
  query,
  defaultQuery,
  onQueryChange,
  onOpenVoucher,
  voucher,
  defaultVoucher,
  onVoucherChange,
  documents,
  onOpenDocument,
  className,
  "aria-label": ariaLabel,
}: LedgerTableProps) {
  const { country } = useBookiLocaleOptional();
  const copy = COPY[country === "NO" ? "NO" : "EN"];
  return (
    <LedgerTableRoot
      entries={entries}
      account={account}
      defaultAccount={defaultAccount}
      onAccountChange={onAccountChange}
      from={from}
      defaultFrom={defaultFrom}
      onFromChange={onFromChange}
      to={to}
      defaultTo={defaultTo}
      onToChange={onToChange}
      pageSize={pageSize}
      snapshotRows={snapshotRows}
      query={query}
      defaultQuery={defaultQuery}
      onQueryChange={onQueryChange}
      onOpenVoucher={onOpenVoucher}
      voucher={voucher}
      defaultVoucher={defaultVoucher}
      onVoucherChange={onVoucherChange}
      documents={documents}
      onOpenDocument={onOpenDocument}
      className={className}
      aria-label={ariaLabel ?? copy.ledger}
    >
      {(state: RootState) => <LedgerBody entries={entries} state={state} />}
    </LedgerTableRoot>
  );
}

export {
  LedgerTable,
  LedgerTableBack,
  LedgerTableFrom,
  LedgerTableList,
  LedgerTableNext,
  LedgerTablePrevious,
  LedgerTableRoot,
  LedgerTableRow,
  LedgerTableTo,
  LedgerTableVoucher,
  LedgerTableLineAccount,
  LedgerTableDocument,
  LedgerTableCrumb,
  LedgerTableSearch,
  LedgerTableSort,
  ledgerTable,
};
export type { LedgerEntry };

export {
  type LedgerVoucherRef,
  type LedgerView,
  type LedgerDocument,
  type LedgerVoucherSummary,
} from "@booki-aui/primitives/ledger-table";
