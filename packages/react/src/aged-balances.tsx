import { localToday } from "@booki-aui/core/financial-date";
import {
  DEFAULT_AGING_LIMITS,
  ageItems,
  partyItems,
  type AgedItem,
  type AgingBucket,
  type AgingRow,
  type OpenItem,
  type OpenItemKind,
  type OverdueParty,
} from "@booki-aui/core/aging";
import { formatMoney, minorDigitsFor, money } from "@booki-aui/core/money";
import type { TableColumn, TableQuery } from "@booki-aui/core/table";
import { createParts, type Parts } from "@ui-sdk/react/primitive";
import type { ReactNode } from "react";
import { ariaSort, downloadCsv, sortMark } from "./csv-download.js";
import { useBookiLocaleOptional } from "./locale.js";
import { useSay } from "./say.js";
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SNAPSHOT_ROWS,
  type AgedParty,
  type AgingTotals,
  agedBalances,
  itemColumns,
  matchingItems,
  matchingParties,
  partyColumns,
} from "@booki-aui/primitives/aged-balances";

const TAGS = {
  root: "div",
  date: "input",
  party: "button",
  back: "button",
  search: "input",
  bucket: "select",
  sort: "button",
  prev: "button",
  next: "button",
} as const;
// Typed by name, so the declarations refer to the definition instead of spelling it out per part.
const parts: Parts<typeof agedBalances, typeof TAGS> = createParts(agedBalances, TAGS);
const AgedBalancesRoot: (typeof parts)["Root"] = parts.Root;
const AgedBalancesDate: (typeof parts)["Date"] = parts.Date;
const AgedBalancesParty: (typeof parts)["Party"] = parts.Party;
const AgedBalancesBack: (typeof parts)["Back"] = parts.Back;
const AgedBalancesSearch: (typeof parts)["Search"] = parts.Search;
const AgedBalancesBucket: (typeof parts)["Bucket"] = parts.Bucket;
const AgedBalancesSort: (typeof parts)["Sort"] = parts.Sort;
const AgedBalancesPrev: (typeof parts)["Prev"] = parts.Prev;
const AgedBalancesNext: (typeof parts)["Next"] = parts.Next;

const COPY = {
  EN: {
    receivable: "Aged receivables",
    payable: "Aged payables",
    asOf: "As of",
    customer: "Customer",
    supplier: "Supplier",
    notDue: "Not due",
    days: "days",
    over: "Over",
    total: "Total",
    back: "Back to all",
    document: "Document",
    dueDate: "Due date",
    daysOverdue: "Days overdue",
    age: "Age",
    amount: "Amount",
    open: "Show open items",
    nothingOpen: "Nothing is open.",
    noDate: "Pick a date to age the open items.",
    search: "Search",
    ages: "Age",
    allAges: "All ages",
    exportCsv: "Download CSV",
    noMatch: "No rows match.",
    prev: "Previous page",
    next: "Next page",
    range: (from: number, to: number, of: number) => `${from}–${to} of ${of}`,
  },
  NO: {
    receivable: "Aldersfordelte kundefordringer",
    payable: "Aldersfordelt leverandørgjeld",
    asOf: "Per dato",
    customer: "Kunde",
    supplier: "Leverandør",
    notDue: "Ikke forfalt",
    days: "dager",
    over: "Over",
    total: "Sum",
    back: "Tilbake til alle",
    document: "Dokument",
    dueDate: "Forfall",
    daysOverdue: "Dager forfalt",
    age: "Alder",
    amount: "Beløp",
    open: "Vis åpne poster",
    nothingOpen: "Ingen åpne poster.",
    noDate: "Velg en dato for å aldersfordele de åpne postene.",
    search: "Søk",
    ages: "Alder",
    allAges: "Alle aldre",
    exportCsv: "Last ned CSV",
    noMatch: "Ingen rader passer.",
    prev: "Forrige side",
    next: "Neste side",
    range: (from: number, to: number, of: number) => `${from}–${to} av ${of}`,
  },
} as const;

export type AgedBalancesProps = {
  items: OpenItem[];
  /** Receivables (the default) or payables. */
  kind?: OpenItemKind;
  asOf?: string;
  /** Defaults to today in UTC when neither `asOf` nor this is given. */
  defaultAsOf?: string;
  onAsOfChange?: (asOf: string) => void;
  partyId?: string | null;
  defaultPartyId?: string | null;
  onPartyIdChange?: (partyId: string | null) => void;
  /** Day limits of the columns. Defaults to `[0, 30, 60, 90]`. */
  limits?: number[];
  /** Most rows an agent's snapshot carries. Defaults to 50. */
  snapshotRows?: number;
  /** Rows a person sees per page. Defaults to 100. */
  pageSize?: number;
  /** The sort, search, filters and page of the list on screen, when the app owns it. */
  query?: TableQuery;
  defaultQuery?: Partial<TableQuery>;
  onQueryChange?: (query: TableQuery) => void;
  className?: string;
  "aria-label"?: string;
};

type RootState = {
  kind: OpenItemKind;
  asOf: string;
  partyId: string | null;
  refusal: string;
  query: TableQuery;
  view: { total: number; matching: number; page: number; pageCount: number };
  totals: AgingTotals;
  party: AgedParty | null;
  buckets: AgingBucket[];
  pageRows: unknown[];
};

/** A header cell whose label sorts the list: asc, desc, off. */
function SortHeader({
  id,
  query,
  align,
  scope = "col",
  children,
}: {
  id: string;
  query: TableQuery;
  align?: "end";
  scope?: "col";
  children: ReactNode;
}) {
  const sorted = query.sort?.column === id ? query.sort.direction : undefined;
  return (
    <th scope={scope} data-align={align} aria-sort={ariaSort(query.sort, id)}>
      <AgedBalancesSort value={id}>
        {children}
        <span aria-hidden="true" data-slot="aged-balances-sort-mark">
          {sortMark(sorted)}
        </span>
      </AgedBalancesSort>
    </th>
  );
}

/**
 * Composed aging table: an as-of date, a search and an age filter, one row per
 * party with an amount per age column (headers sort, totals cover every
 * matching party), a party's open items when its name is pressed, pages, and a
 * CSV of every matching row.
 */
function AgedBalances({
  items,
  kind = "receivable",
  asOf,
  defaultAsOf,
  onAsOfChange,
  partyId,
  defaultPartyId,
  onPartyIdChange,
  limits,
  snapshotRows = DEFAULT_SNAPSHOT_ROWS,
  pageSize = DEFAULT_PAGE_SIZE,
  query,
  defaultQuery,
  onQueryChange,
  className,
  "aria-label": ariaLabel,
}: AgedBalancesProps) {
  const { country, profile } = useBookiLocaleOptional();
  const say = useSay();
  const copy = COPY[country === "NO" ? "NO" : "EN"];
  const fmt = (minor: number) => formatMoney(money(minor, profile.currency), { locale: profile.locale });
  const bucketName = (bucket: AgingBucket) =>
    bucket.fromDays === undefined
      ? copy.notDue
      : bucket.toDays === undefined
        ? `${copy.over} ${bucket.fromDays - 1} ${copy.days}`
        : `${bucket.fromDays}–${bucket.toDays} ${copy.days}`;
  const columnLimits = limits ?? (DEFAULT_AGING_LIMITS as number[]);
  const today = asOf === undefined && defaultAsOf === undefined ? localToday() : defaultAsOf;

  return (
    <AgedBalancesRoot
      items={items}
      kind={kind}
      asOf={asOf}
      defaultAsOf={today}
      onAsOfChange={onAsOfChange}
      partyId={partyId}
      defaultPartyId={defaultPartyId}
      onPartyIdChange={onPartyIdChange}
      limits={limits}
      snapshotRows={snapshotRows}
      pageSize={pageSize}
      query={query}
      defaultQuery={defaultQuery}
      onQueryChange={onQueryChange}
      className={className}
      aria-label={ariaLabel ?? copy[kind]}
    >
      {(state: RootState) => {
        // The page shows one page of parties (100 by default); the agent's snapshot is capped too.
        const buckets = state.buckets;
        const partyLabel = state.kind === "payable" ? copy.supplier : copy.customer;
        const aged = state.asOf !== "";
        const drilled = state.party;
        const from = state.view.matching === 0 ? 0 : (state.view.page - 1) * state.query.pageSize + 1;
        const to = Math.min(state.view.matching, state.view.page * state.query.pageSize);
        const download = () => {
          if (!aged) return;
          if (drilled) {
            const headers: Record<string, string> = {
              documentNumber: copy.document,
              dueDate: copy.dueDate,
              daysOverdue: copy.daysOverdue,
              bucket: copy.age,
              amountMinor: copy.amount,
            };
            const columns = itemColumns.map((column) => ({ ...column, header: headers[column.id] ?? column.header }));
            const own = partyItems(items, state.asOf, drilled.partyId, { buckets: columnLimits, kind: state.kind });
            downloadCsv(
              `${state.kind}-${drilled.partyId}`,
              matchingItems(own, buckets, state.query),
              columns,
              country,
              minorDigitsFor(profile.currency),
            );
            return;
          }
          const columns: TableColumn<AgingRow>[] = partyColumns(buckets).map((column) => {
            const bucket = buckets.find((item) => item.id === column.id);
            return {
              ...column,
              header: bucket ? bucketName(bucket) : column.id === "partyName" ? partyLabel : copy.total,
            };
          });
          const report = ageItems(items, state.asOf, columnLimits, state.kind);
          downloadCsv(
            `aged-${state.kind}`,
            matchingParties(report.rows, buckets, state.query),
            columns,
            country,
            minorDigitsFor(profile.currency),
          );
        };
        return (
          <>
            <div data-slot="aged-balances-toolbar">
              <label data-slot="aged-balances-field">
                <span>{copy.asOf}</span>
                <AgedBalancesDate />
              </label>
              {aged ? (
                <>
                  <label data-slot="aged-balances-field">
                    <span>{copy.search}</span>
                    <AgedBalancesSearch placeholder={copy.search} />
                  </label>
                  <label data-slot="aged-balances-field">
                    <span>{copy.ages}</span>
                    <AgedBalancesBucket>
                      <option value="">{copy.allAges}</option>
                      {buckets.map((bucket) => (
                        <option key={bucket.id} value={bucket.id}>
                          {bucketName(bucket)}
                        </option>
                      ))}
                    </AgedBalancesBucket>
                  </label>
                  <span data-slot="aged-balances-spacer" />
                  <button type="button" data-slot="aged-balances-export" data-variant="secondary" onClick={download}>
                    {copy.exportCsv}
                  </button>
                </>
              ) : null}
            </div>

            {!aged ? (
              <p data-slot="aged-balances-empty">{copy.noDate}</p>
            ) : drilled ? (
              <>
                <div data-slot="aged-balances-heading">
                  <AgedBalancesBack>{copy.back}</AgedBalancesBack>
                  <h3>{drilled.partyName}</h3>
                </div>
                <div data-slot="aged-balances-scroll">
                  <table data-slot="aged-balances-items">
                    <thead>
                      <tr>
                        <SortHeader id="documentNumber" query={state.query}>
                          {copy.document}
                        </SortHeader>
                        <SortHeader id="dueDate" query={state.query}>
                          {copy.dueDate}
                        </SortHeader>
                        <SortHeader id="daysOverdue" query={state.query} align="end">
                          {copy.daysOverdue}
                        </SortHeader>
                        <th scope="col">{copy.age}</th>
                        <SortHeader id="amountMinor" query={state.query} align="end">
                          {copy.amount}
                        </SortHeader>
                      </tr>
                    </thead>
                    <tbody>
                      {state.pageRows.length === 0 ? (
                        <tr>
                          <td colSpan={5} data-slot="aged-balances-empty">
                            {copy.noMatch}
                          </td>
                        </tr>
                      ) : null}
                      {(state.pageRows as AgedItem[]).map((item) => (
                        <tr key={item.id} data-bucket={item.bucket} data-credit={item.amountMinor < 0 ? "" : undefined}>
                          <td data-slot="aged-balances-document">{item.documentNumber}</td>
                          <td data-slot="aged-balances-due">{item.dueDate}</td>
                          <td data-slot="aged-balances-amount">{Math.max(0, item.daysOverdue)}</td>
                          <td>{bucketName(buckets.find((bucket) => bucket.id === item.bucket)!)}</td>
                          <td data-slot="aged-balances-amount">{fmt(item.amountMinor)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th colSpan={4} scope="row">
                          {copy.total}
                        </th>
                        <td data-slot="aged-balances-amount">{fmt(drilled.matchingMinor)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            ) : (
              <div data-slot="aged-balances-scroll">
                <table data-slot="aged-balances-table">
                  <thead>
                    <tr>
                      <SortHeader id="partyName" query={state.query}>
                        {partyLabel}
                      </SortHeader>
                      {buckets.map((bucket) => (
                        <SortHeader key={bucket.id} id={bucket.id} query={state.query} align="end">
                          {bucketName(bucket)}
                        </SortHeader>
                      ))}
                      <SortHeader id="totalMinor" query={state.query} align="end">
                        {copy.total}
                      </SortHeader>
                    </tr>
                  </thead>
                  <tbody>
                    {state.pageRows.length === 0 ? (
                      <tr>
                        <td colSpan={buckets.length + 2} data-slot="aged-balances-empty">
                          {state.view.total === 0 ? copy.nothingOpen : copy.noMatch}
                        </td>
                      </tr>
                    ) : (
                      (state.pageRows as AgingRow[]).map((row) => (
                        <tr key={row.partyId}>
                          <th scope="row">
                            <AgedBalancesParty value={row.partyId} aria-label={`${copy.open}: ${row.partyName}`}>
                              {row.partyName}
                            </AgedBalancesParty>
                          </th>
                          {row.amountsMinor.map((amount, index) => (
                            <td
                              key={buckets[index]!.id}
                              data-slot="aged-balances-amount"
                              data-bucket={buckets[index]!.id}
                              data-empty={amount === 0 ? "" : undefined}
                            >
                              {amount === 0 ? "" : fmt(amount)}
                            </td>
                          ))}
                          <td data-slot="aged-balances-amount">{fmt(row.totalMinor)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">{copy.total}</th>
                      {state.totals.amountsMinor.map((amount, index) => (
                        <td key={buckets[index]!.id} data-slot="aged-balances-amount">
                          {fmt(amount)}
                        </td>
                      ))}
                      <td data-slot="aged-balances-amount">{fmt(state.totals.totalMinor)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            {aged && state.view.matching > state.query.pageSize ? (
              <div data-slot="aged-balances-pagination">
                <AgedBalancesPrev aria-label={copy.prev}>←</AgedBalancesPrev>
                <span data-slot="aged-balances-range" aria-live="polite">
                  {copy.range(from, to, state.view.matching)}
                </span>
                <AgedBalancesNext aria-label={copy.next}>→</AgedBalancesNext>
              </div>
            ) : null}
            {state.refusal ? (
              <p data-slot="aged-balances-error" role="alert">
                {say(state.refusal)}
              </p>
            ) : null}
          </>
        );
      }}
    </AgedBalancesRoot>
  );
}

export {
  AgedBalances,
  AgedBalancesBack,
  AgedBalancesBucket,
  AgedBalancesDate,
  AgedBalancesNext,
  AgedBalancesParty,
  AgedBalancesPrev,
  AgedBalancesRoot,
  AgedBalancesSearch,
  AgedBalancesSort,
  agedBalances,
};
export type { AgedItem, AgingBucket, AgingRow, OpenItem, OpenItemKind, OverdueParty };

export { type AgingTotals, type AgedParty } from "@booki-aui/primitives/aged-balances";
