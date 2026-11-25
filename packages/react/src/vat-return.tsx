import { formatMoney, money } from "@booki-aui/core/money";
import type { BookiChangeDetails } from "./change-details.js";
import { formatPeriod } from "@booki-aui/core/period";
import {
  type VatReturnComputation,
  type VatReturnFiling,
  type VatReturnSchema,
  type VatReturnStatus,
  type VatTransaction,
} from "@booki-aui/core/vat-return";
import { createParts } from "@ui-sdk/react/primitive";
import { useAccessFor } from "./access.js";
import { useBookiLocaleOptional } from "./locale.js";
import { useSay } from "./say.js";
import { type VatReturnSubmission, DEFAULT_SNAPSHOT_ROWS, vatReturn } from "@booki-aui/primitives/vat-return";

const parts = createParts(vatReturn, { root: "div", box: "button", back: "button", ready: "button", submit: "button" });
const VatReturnRoot = parts.Root;
const VatReturnBoxButton = parts.Box;
const VatReturnBack = parts.Back;
const VatReturnReady = parts.Ready;
const VatReturnSubmit = parts.Submit;

const COPY = {
  EN: {
    vatReturn: "VAT return",
    draft: "Draft",
    ready: "Ready",
    submitted: "Submitted",
    toPay: "To pay",
    toGetBack: "To get back",
    nothingDue: "Nothing to pay",
    box: "Box",
    amount: "Amount",
    vouchers: "Vouchers",
    showVouchers: "Show vouchers",
    back: "Back to boxes",
    date: "Date",
    voucher: "Voucher",
    code: "VAT code",
    base: "Base",
    tax: "Tax",
    inBox: "In box",
    unmapped: "Transactions no box takes",
    issues: "What blocks the return",
    markReady: "Mark ready",
    submit: "Submit",
    noVouchers: "No vouchers in this box.",
    readyBy: "marked ready by",
    submittedBy: "submitted by",
  },
  NO: {
    vatReturn: "Mva-melding",
    draft: "Utkast",
    ready: "Klar",
    submitted: "Sendt inn",
    toPay: "Å betale",
    toGetBack: "Til gode",
    nothingDue: "Ingenting å betale",
    box: "Post",
    amount: "Beløp",
    vouchers: "Bilag",
    showVouchers: "Vis bilag",
    back: "Tilbake til postene",
    date: "Dato",
    voucher: "Bilag",
    code: "Mva-kode",
    base: "Grunnlag",
    tax: "Mva",
    inBox: "I posten",
    unmapped: "Transaksjoner ingen post tar",
    issues: "Dette hindrer meldingen",
    markReady: "Merk som klar",
    submit: "Send inn",
    noVouchers: "Ingen bilag i denne posten.",
    readyBy: "klarmeldt av",
    submittedBy: "sendt inn av",
  },
} as const;

export type VatReturnProps = {
  /** The boxes of the return. Supply your own; the exported examples are for demos. */
  schema: VatReturnSchema;
  transactions: VatTransaction[];
  /** A period code: `2026`, `2026-03` or `2026-T2`. */
  period: string;
  /** Id of the person at the keyboard. */
  actor?: string;
  /** When true, whoever marked the return ready cannot also submit it. */
  requireSecondPerson?: boolean;
  filing?: VatReturnFiling;
  defaultFiling?: VatReturnFiling;
  onFilingChange?: (filing: VatReturnFiling, details: BookiChangeDetails) => void;
  box?: string | null;
  defaultBox?: string | null;
  onBoxChange?: (box: string | null, details: BookiChangeDetails) => void;
  /** Most rows an agent's snapshot carries. Defaults to 50. */
  snapshotRows?: number;
  /** A person submitted the return: file it. The library only changes the status. */
  onSubmit?: (submission: VatReturnSubmission) => void;
  /** Show a person's name for an id. */
  nameOf?: (id: string) => string;
  className?: string;
  "aria-label"?: string;
};

type RootState = {
  computation: VatReturnComputation | null;
  period: string;
  status: VatReturnStatus;
  filing: VatReturnFiling;
  issues: string[];
  ready: boolean;
  box: string | null;
  refusal: string;
};

/**
 * Composed return: status and the amount to pay, each box with its amount,
 * the vouchers behind a box, what blocks the return, and the two buttons a
 * person presses.
 */
function VatReturn({
  schema,
  transactions,
  period,
  actor,
  requireSecondPerson = false,
  filing,
  defaultFiling,
  onFilingChange,
  box,
  defaultBox,
  onBoxChange,
  snapshotRows = DEFAULT_SNAPSHOT_ROWS,
  onSubmit,
  nameOf = (id) => id,
  className,
  "aria-label": ariaLabel,
}: VatReturnProps) {
  const { country, profile } = useBookiLocaleOptional();
  const say = useSay();
  const access = useAccessFor({ markReady: "vat.prepare", submit: "vat.submit" }, actor);
  const copy = COPY[country === "NO" ? "NO" : "EN"];
  const fmt = (minor: number) => formatMoney(money(minor, profile.currency), { locale: profile.locale });
  return (
    <VatReturnRoot
      schema={schema}
      transactions={transactions}
      period={period}
      actor={access.actor}
      denied={access.denied}
      requireSecondPerson={requireSecondPerson}
      filing={filing}
      defaultFiling={defaultFiling}
      onFilingChange={onFilingChange}
      box={box}
      defaultBox={defaultBox}
      onBoxChange={onBoxChange}
      snapshotRows={snapshotRows}
      onSubmit={onSubmit}
      className={className}
      aria-label={ariaLabel ?? copy.vatReturn}
    >
      {(state: RootState) => {
        const computation = state.computation;
        const opened = state.box === null ? undefined : computation?.boxes.find((item) => item.id === state.box);
        const due = computation?.payableMinor ?? 0;
        const who =
          state.status === "submitted" && state.filing.submittedBy
            ? ` · ${copy.submittedBy} ${nameOf(state.filing.submittedBy)}`
            : state.status === "ready" && state.filing.readyBy
              ? ` · ${copy.readyBy} ${nameOf(state.filing.readyBy)}`
              : "";
        return (
          <>
            <p data-slot="vat-return-status" role="status">
              {copy[state.status]}
              {" · "}
              {formatPeriod(state.period, profile.locale)}
              {" · "}
              {due > 0 ? `${copy.toPay} ${fmt(due)}` : due < 0 ? `${copy.toGetBack} ${fmt(-due)}` : copy.nothingDue}
              {who}
            </p>

            {opened ? (
              <>
                <div data-slot="vat-return-heading">
                  <VatReturnBack>{copy.back}</VatReturnBack>
                  <h3>{opened.label}</h3>
                </div>
                <div data-slot="vat-return-scroll">
                  <table data-slot="vat-return-vouchers">
                    <thead>
                      <tr>
                        <th>{copy.date}</th>
                        <th>{copy.voucher}</th>
                        <th>{copy.code}</th>
                        <th data-align="end">{copy.base}</th>
                        <th data-align="end">{copy.tax}</th>
                        <th data-align="end">{copy.inBox}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {opened.vouchers.length === 0 ? (
                        <tr>
                          <td colSpan={6} data-slot="vat-return-empty">
                            {copy.noVouchers}
                          </td>
                        </tr>
                      ) : (
                        opened.vouchers.map((voucher, index) => (
                          <tr key={`${voucher.voucherId}|${voucher.vatCode}|${index}`}>
                            <td data-slot="vat-return-date">{voucher.date}</td>
                            <td data-slot="vat-return-code">{voucher.voucherId}</td>
                            <td data-slot="vat-return-code">{voucher.vatCode}</td>
                            <td data-slot="vat-return-amount">{fmt(voucher.baseMinor)}</td>
                            <td data-slot="vat-return-amount">{fmt(voucher.taxMinor)}</td>
                            <td data-slot="vat-return-amount">{fmt(voucher.amountMinor)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th colSpan={5} scope="row">
                          {opened.label}
                        </th>
                        <td data-slot="vat-return-amount">{fmt(opened.amountMinor)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            ) : (
              <div data-slot="vat-return-scroll">
                <table data-slot="vat-return-boxes">
                  <thead>
                    <tr>
                      <th>{copy.box}</th>
                      <th data-align="end">{copy.vouchers}</th>
                      <th data-align="end">{copy.amount}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(computation?.boxes ?? []).map((item) => (
                      <tr key={item.id} data-kind={item.kind}>
                        <th scope="row">
                          {item.kind === "total" ? (
                            item.label
                          ) : (
                            <VatReturnBoxButton value={item.id} aria-label={`${copy.showVouchers}: ${item.label}`}>
                              {item.label}
                            </VatReturnBoxButton>
                          )}
                        </th>
                        <td data-slot="vat-return-amount">{item.kind === "total" ? "" : item.vouchers.length}</td>
                        <td data-slot="vat-return-amount">{fmt(item.amountMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {computation && computation.unmapped.length > 0 ? (
              <div data-slot="vat-return-scroll">
                <table data-slot="vat-return-unmapped">
                  <caption>{copy.unmapped}</caption>
                  <thead>
                    <tr>
                      <th>{copy.date}</th>
                      <th>{copy.voucher}</th>
                      <th>{copy.code}</th>
                      <th data-align="end">{copy.base}</th>
                      <th data-align="end">{copy.tax}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {computation.unmapped.map((voucher, index) => (
                      <tr key={`${voucher.voucherId}|${voucher.vatCode}|${index}`}>
                        <td data-slot="vat-return-date">{voucher.date}</td>
                        <td data-slot="vat-return-code">{voucher.voucherId}</td>
                        <td data-slot="vat-return-code">{voucher.vatCode}</td>
                        <td data-slot="vat-return-amount">{fmt(voucher.baseMinor)}</td>
                        <td data-slot="vat-return-amount">{fmt(voucher.taxMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {state.issues.length > 0 ? (
              <ul data-slot="vat-return-issues" aria-label={copy.issues}>
                {state.issues.map((issue) => (
                  <li key={issue}>{say(issue)}</li>
                ))}
              </ul>
            ) : null}

            {state.status !== "submitted" ? (
              <div data-slot="vat-return-actions">
                <VatReturnReady>{copy.markReady}</VatReturnReady>
                <VatReturnSubmit>{copy.submit}</VatReturnSubmit>
              </div>
            ) : null}
            {state.refusal ? (
              <p data-slot="vat-return-error" role="alert">
                {say(state.refusal)}
              </p>
            ) : null}
          </>
        );
      }}
    </VatReturnRoot>
  );
}

export { VatReturn, VatReturnBack, VatReturnBoxButton, VatReturnReady, VatReturnRoot, VatReturnSubmit, vatReturn };
export type { VatReturnFiling, VatReturnSchema, VatReturnStatus, VatTransaction };

export { type VatBoxSummary, type VatReturnSubmission } from "@booki-aui/primitives/vat-return";
