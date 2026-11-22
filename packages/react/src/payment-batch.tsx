import { formatMoney, minorDigitsFor, money } from "@booki/core/money";
import { type PaymentBatch as Batch, type PaymentItem } from "@booki/core/payment-batch";
import { matchingRows, type TableColumn, type TableQuery } from "@booki/core/table";
import { createParts } from "@ui-sdk/react/primitive";
import type { ReactNode } from "react";
import { useAccessFor } from "./access.js";
import { ariaSort, downloadCsv, sortMark } from "./csv-download.js";
import { useBookiLocaleOptional } from "./locale.js";
import { useSay } from "./say.js";
import { useWorkflowCopy } from "./workflow-copy.js";
import { DEFAULT_PAGE_SIZE, paymentBatch, paymentColumns } from "@booki/primitives/payment-batch";

const parts = createParts(paymentBatch, {
  root: "div",
  remove: "button",
  approve: "button",
  release: "button",
  search: "input",
  sort: "button",
  prev: "button",
  next: "button",
});
const PaymentBatchRoot = parts.Root;
const PaymentBatchRemove = parts.Remove;
const PaymentBatchApprove = parts.Approve;
const PaymentBatchRelease = parts.Release;
const PaymentBatchSearch = parts.Search;
const PaymentBatchSort = parts.Sort;
const PaymentBatchPrev = parts.Prev;
const PaymentBatchNext = parts.Next;

const LIST_COPY = {
  EN: {
    search: "Search",
    exportCsv: "Download CSV",
    noMatch: "No payments match.",
    shown: "Shown",
    prev: "Previous page",
    next: "Next page",
    range: (from: number, to: number, of: number) => `${from}–${to} of ${of}`,
  },
  NO: {
    search: "Søk",
    exportCsv: "Last ned CSV",
    noMatch: "Ingen betalinger passer.",
    shown: "Viste",
    prev: "Forrige side",
    next: "Neste side",
    range: (from: number, to: number, of: number) => `${from}–${to} av ${of}`,
  },
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
      <PaymentBatchSort value={id}>
        {children}
        <span aria-hidden="true" data-slot="payment-batch-sort-mark">
          {sortMark(sorted)}
        </span>
      </PaymentBatchSort>
    </th>
  );
}

export type PaymentBatchProps = {
  batch?: Batch;
  defaultBatch?: Batch;
  actor?: string;
  requiredApprovals?: number;
  onBatchChange?: (batch: Batch) => void;
  /** Payments a person sees per page. Defaults to 100. */
  pageSize?: number;
  /** The sort, search, filters and page of the list, when the app owns it. */
  query?: TableQuery;
  defaultQuery?: Partial<TableQuery>;
  onQueryChange?: (query: TableQuery) => void;
  nameOf?: (id: string) => ReactNode;
  className?: string;
  "aria-label"?: string;
};

type RootState = {
  batch: Batch;
  refusal: string;
  issues: string[];
  approvals: string[];
  releasable: boolean;
  totalMinor: number;
  query: TableQuery;
  view: { total: number; matching: number; page: number; pageCount: number };
  totals: Record<string, number>;
  pageIds: string[];
};

const mask = (account: string) => {
  const digits = account.replace(/\s/g, "");
  return digits.length > 4 ? `•••• ${digits.slice(-4)}` : "••••";
};

/**
 * Composed batch: the payments (search, sortable headers, pages, CSV with the
 * accounts masked), the batch total and the total of what is shown, what must
 * be fixed, and approve / release.
 */
function PaymentBatch({
  batch,
  defaultBatch,
  actor,
  requiredApprovals = 2,
  onBatchChange,
  pageSize = DEFAULT_PAGE_SIZE,
  query,
  defaultQuery,
  onQueryChange,
  nameOf = (id) => id,
  className,
  "aria-label": ariaLabel,
}: PaymentBatchProps) {
  const copy = useWorkflowCopy();
  const { country, profile } = useBookiLocaleOptional();
  const list = LIST_COPY[country === "NO" ? "NO" : "EN"];
  const say = useSay();
  const access = useAccessFor({ approve: "payment.approve", release: "payment.release" }, actor);
  return (
    <PaymentBatchRoot
      batch={batch}
      defaultBatch={defaultBatch}
      actor={access.actor}
      denied={access.denied}
      requiredApprovals={requiredApprovals}
      onBatchChange={onBatchChange}
      pageSize={pageSize}
      query={query}
      defaultQuery={defaultQuery}
      onQueryChange={onQueryChange}
      className={className}
      aria-label={ariaLabel ?? copy.paymentBatch}
    >
      {(state: RootState) => {
        const fmt = (minor: number) =>
          formatMoney(money(minor, (state.batch.currency || profile.currency) as typeof profile.currency), {
            locale: profile.locale,
          });
        const draft = state.batch.status === "draft";
        const page = state.pageIds
          .map((id) => state.batch.items.find((item) => item.id === id))
          .filter((item): item is PaymentItem => Boolean(item));
        const from = state.view.matching === 0 ? 0 : (state.view.page - 1) * state.query.pageSize + 1;
        const to = Math.min(state.view.matching, state.view.page * state.query.pageSize);
        const narrowed = state.view.matching !== state.view.total;
        const download = () => {
          const headers: Record<string, string> = {
            creditorName: copy.creditor,
            reference: copy.reference,
            amountMinor: copy.amount,
          };
          const digits = minorDigitsFor(state.batch.currency || profile.currency);
          const columns: TableColumn<PaymentItem>[] = [
            ...paymentColumns.map((column) => ({ ...column, header: headers[column.id] ?? column.header })),
            // The account stays masked in the file too.
            { id: "account", header: copy.account, value: (item: PaymentItem) => mask(item.creditorAccount) },
          ];
          downloadCsv(
            `payment-batch-${state.batch.id}`,
            matchingRows(state.batch.items, paymentColumns, state.query),
            columns,
            country,
            digits,
          );
        };
        return (
          <>
            <div data-slot="payment-batch-toolbar">
              <label data-slot="payment-batch-search-label">
                <span data-slot="visually-hidden">{list.search}</span>
                <PaymentBatchSearch placeholder={list.search} aria-label={list.search} />
              </label>
              <span data-slot="payment-batch-spacer" />
              <button type="button" data-slot="payment-batch-export" data-variant="secondary" onClick={download}>
                {list.exportCsv}
              </button>
            </div>
            <table data-slot="payment-batch-table">
              <thead>
                <tr>
                  <SortHeader id="creditorName" query={state.query}>
                    {copy.creditor}
                  </SortHeader>
                  <th scope="col">{copy.account}</th>
                  <SortHeader id="reference" query={state.query}>
                    {copy.reference}
                  </SortHeader>
                  <SortHeader id="amountMinor" query={state.query} align="end">
                    {copy.amount}
                  </SortHeader>
                  <th>
                    <span data-slot="visually-hidden">{copy.remove}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.length === 0 && state.batch.items.length > 0 ? (
                  <tr>
                    <td colSpan={5} data-slot="payment-batch-empty">
                      {list.noMatch}
                    </td>
                  </tr>
                ) : null}
                {page.map((item) => (
                  <tr key={item.id}>
                    <td>{item.creditorName}</td>
                    <td data-slot="payment-batch-account" data-agent-secret="">
                      {mask(item.creditorAccount)}
                    </td>
                    <td data-slot="payment-batch-reference">{item.reference ?? ""}</td>
                    <td data-align="end" data-slot="payment-batch-amount">
                      {fmt(item.amountMinor)}
                    </td>
                    <td>
                      {draft ? (
                        <PaymentBatchRemove value={item.id} aria-label={`${copy.remove}: ${item.creditorName}`}>
                          {copy.remove}
                        </PaymentBatchRemove>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {narrowed ? (
                  <tr data-slot="payment-batch-matching">
                    <th colSpan={3} scope="row">
                      {list.shown}
                    </th>
                    <td data-align="end" data-slot="payment-batch-amount">
                      {fmt(state.totals.amountMinor ?? 0)}
                    </td>
                    <td />
                  </tr>
                ) : null}
                <tr>
                  <th colSpan={3} scope="row">
                    {copy.total}
                  </th>
                  <td data-align="end" data-slot="payment-batch-amount">
                    {fmt(state.totalMinor)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
            {state.view.matching > state.query.pageSize ? (
              <div data-slot="payment-batch-pagination">
                <PaymentBatchPrev aria-label={list.prev}>←</PaymentBatchPrev>
                <span data-slot="payment-batch-range" aria-live="polite">
                  {list.range(from, to, state.view.matching)}
                </span>
                <PaymentBatchNext aria-label={list.next}>→</PaymentBatchNext>
              </div>
            ) : null}
            {state.issues.length > 0 ? (
              <ul data-slot="payment-batch-issues" aria-label={copy.issues}>
                {state.issues.map((issue) => (
                  <li key={issue}>{say(issue)}</li>
                ))}
              </ul>
            ) : null}
            <p data-slot="payment-batch-approvals" role="status">
              {draft ? (
                <>
                  {copy.approvals}: {state.approvals.length}/{requiredApprovals}
                  {state.approvals.length > 0 ? (
                    <>
                      {" "}
                      ·{" "}
                      {state.approvals.map((id, i) => (
                        <span key={id}>
                          {i > 0 ? ", " : ""}
                          {nameOf(id)}
                        </span>
                      ))}
                    </>
                  ) : null}
                </>
              ) : (
                copy.released
              )}
            </p>
            {draft ? (
              <div data-slot="payment-batch-actions">
                <PaymentBatchApprove disabled={state.issues.length > 0 || state.releasable}>
                  {copy.approve}
                </PaymentBatchApprove>
                <PaymentBatchRelease disabled={!state.releasable}>{copy.release}</PaymentBatchRelease>
              </div>
            ) : null}
            {state.refusal ? (
              <p data-slot="payment-batch-error" role="alert">
                {say(state.refusal)}
              </p>
            ) : null}
          </>
        );
      }}
    </PaymentBatchRoot>
  );
}

export {
  PaymentBatch,
  PaymentBatchApprove,
  PaymentBatchNext,
  PaymentBatchPrev,
  PaymentBatchRelease,
  PaymentBatchRemove,
  PaymentBatchRoot,
  PaymentBatchSearch,
  PaymentBatchSort,
  paymentBatch,
};
export type { Batch as PaymentBatchData, PaymentItem };

export { type PaymentSummary } from "@booki/primitives/payment-batch";
