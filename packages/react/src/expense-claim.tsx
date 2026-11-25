import {
  type ExpenseClaim as Claim,
  type ExpenseLine,
  type ExpenseLineInput,
  type ExpensePolicy,
  type ExpenseRule,
  type PolicyException,
} from "@booki-aui/core/expense";
import type { BookiChangeDetails } from "./change-details.js";
import { formatMoney, money } from "@booki-aui/core/money";
import { createParts, type Parts } from "@ui-sdk/react/primitive";
import { useAccessFor } from "./access.js";
import { useBookiLocaleOptional } from "./locale.js";
import { useSay } from "./say.js";
import { type ExpenseExceptionState, expenseClaim } from "@booki-aui/primitives/expense-claim";

const TAGS = {
  root: "div",
  cell: "input",
  pick: "select",
  add: "button",
  remove: "button",
  accept: "button",
  submit: "button",
  approve: "button",
  reject: "button",
} as const;
// Typed by name, so the declarations refer to the definition instead of spelling it out per part.
const parts: Parts<typeof expenseClaim, typeof TAGS> = createParts(expenseClaim, TAGS);
const ExpenseClaimRoot: (typeof parts)["Root"] = parts.Root;
const ExpenseClaimCell: (typeof parts)["Cell"] = parts.Cell;
const ExpenseClaimPick: (typeof parts)["Pick"] = parts.Pick;
const ExpenseClaimAdd: (typeof parts)["Add"] = parts.Add;
const ExpenseClaimRemove: (typeof parts)["Remove"] = parts.Remove;
const ExpenseClaimAccept: (typeof parts)["Accept"] = parts.Accept;
const ExpenseClaimSubmit: (typeof parts)["Submit"] = parts.Submit;
const ExpenseClaimApprove: (typeof parts)["Approve"] = parts.Approve;
const ExpenseClaimReject: (typeof parts)["Reject"] = parts.Reject;

const COPY = {
  EN: {
    label: "Expense claim",
    date: "Date",
    type: "Type",
    description: "Description",
    quantity: "Amount / km / days",
    receipt: "Receipt",
    amount: "Amount",
    total: "Total",
    remove: "Remove",
    line: "Line",
    newLine: "New line",
    addLine: "Add line",
    kind: "Kind",
    kinds: { expense: "Expense", mileage: "Mileage", "per-diem": "Per diem" },
    units: { expense: "Amount", mileage: "Kilometres", "per-diem": "Days" },
    category: "Category",
    rate: "Rate",
    exceptions: "Policy exceptions",
    rules: {
      "missing-receipt": "receipt missing",
      "over-limit": "above the limit",
      "outside-period": "outside the claim period",
      "future-date": "dated in the future",
    },
    reason: "Reason",
    accept: "Accept",
    acceptedBy: "accepted by",
    issues: "Must be fixed before submitting",
    rejectReason: "Reason for rejecting",
    submit: "Submit",
    approve: "Approve",
    reject: "Reject",
    statuses: { draft: "Draft", submitted: "Submitted", approved: "Approved", rejected: "Rejected" },
  },
  NO: {
    label: "Reiseregning",
    date: "Dato",
    type: "Type",
    description: "Beskrivelse",
    quantity: "Beløp / km / dager",
    receipt: "Kvittering",
    amount: "Beløp",
    total: "Sum",
    remove: "Fjern",
    line: "Linje",
    newLine: "Ny linje",
    addLine: "Legg til linje",
    kind: "Type",
    kinds: { expense: "Utlegg", mileage: "Kjøring", "per-diem": "Diett" },
    units: { expense: "Beløp", mileage: "Kilometer", "per-diem": "Dager" },
    category: "Kategori",
    rate: "Sats",
    exceptions: "Avvik fra retningslinjene",
    rules: {
      "missing-receipt": "kvittering mangler",
      "over-limit": "over grensen",
      "outside-period": "utenfor perioden",
      "future-date": "datert frem i tid",
    },
    reason: "Begrunnelse",
    accept: "Godta",
    acceptedBy: "godtatt av",
    issues: "Må rettes før innsending",
    rejectReason: "Begrunnelse for avvisning",
    submit: "Send inn",
    approve: "Godkjenn",
    reject: "Avvis",
    statuses: { draft: "Utkast", submitted: "Sendt inn", approved: "Godkjent", rejected: "Avvist" },
  },
} as const;

export type ExpenseClaimProps = {
  claim?: Claim;
  defaultClaim?: Claim;
  policy?: ExpensePolicy;
  today?: string;
  actor?: string;
  onClaimChange?: (claim: Claim, details: BookiChangeDetails) => void;
  className?: string;
  "aria-label"?: string;
};

type RootState = {
  claim: Claim;
  policy: ExpensePolicy;
  amounts: Record<string, number>;
  totalMinor: number;
  exceptions: ExpenseExceptionState[];
  issues: string[];
  submittable: boolean;
  approvable: boolean;
  newKind: string;
  refusal: string;
};

/** Composed claim: the lines, a new-line row, the policy exceptions, and submit / approve / reject. */
function ExpenseClaim({
  claim,
  defaultClaim,
  policy,
  today,
  actor,
  onClaimChange,
  className,
  "aria-label": ariaLabel,
}: ExpenseClaimProps) {
  const { country, profile } = useBookiLocaleOptional();
  const say = useSay();
  const access = useAccessFor(
    { approve: "expense.approve", reject: "expense.approve", acceptByPerson: "expense.approve" },
    actor,
  );
  const copy = COPY[country === "NO" ? "NO" : "EN"];
  return (
    <ExpenseClaimRoot
      claim={claim}
      defaultClaim={defaultClaim}
      policy={policy}
      today={today}
      actor={access.actor}
      denied={access.denied}
      locale={profile.locale}
      onClaimChange={onClaimChange}
      className={className}
      aria-label={ariaLabel ?? copy.label}
    >
      {(state: RootState) => {
        const doc = state.claim;
        const draft = doc.status === "draft";
        const deciding = doc.status === "submitted";
        const fmt = (minor: number) =>
          formatMoney(money(minor, doc.currency || profile.currency), { locale: profile.locale });
        const categories = Object.keys(state.policy.categories);
        const rates = Object.keys(state.policy.perDiemRates ?? {});
        const kinds = (["expense", "mileage", "per-diem"] as const).filter(
          (kind) =>
            (kind === "expense" && categories.length > 0) ||
            (kind === "mileage" && state.policy.mileageRateMinorPerKm !== undefined) ||
            (kind === "per-diem" && rates.length > 0),
        );
        const newKind = (kinds as readonly string[]).includes(state.newKind)
          ? (state.newKind as ExpenseLine["kind"])
          : "expense";
        const number = (lineId: string) => doc.lines.findIndex((line) => line.id === lineId) + 1;
        return (
          <>
            <p data-slot="expense-claim-status" role="status">
              {copy.statuses[doc.status]} · {doc.periodStart} – {doc.periodEnd} · {copy.total} {fmt(state.totalMinor)}
            </p>
            <div data-slot="expense-claim-scroll">
              <table data-slot="expense-claim-table">
                <thead>
                  <tr>
                    <th>{copy.date}</th>
                    <th>{copy.type}</th>
                    <th>{copy.description}</th>
                    <th data-align="end">{copy.quantity}</th>
                    <th>{copy.receipt}</th>
                    <th data-align="end">{copy.amount}</th>
                    <th>
                      <span data-slot="visually-hidden">{copy.remove}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {doc.lines.map((line, index) => {
                    const n = index + 1;
                    const flagged = state.exceptions.some((e) => e.lineId === line.id && !e.accepted);
                    return (
                      <tr key={line.id} data-kind={line.kind} data-exception={flagged ? "" : undefined}>
                        <td>
                          <ExpenseClaimCell value={`${line.id}|date`} aria-label={`${copy.date} ${n}`} />
                        </td>
                        <td>
                          {!draft ? (
                            line.kind === "expense" ? (
                              line.category
                            ) : line.kind === "per-diem" ? (
                              `${copy.kinds["per-diem"]}: ${line.rate}`
                            ) : (
                              copy.kinds.mileage
                            )
                          ) : line.kind === "expense" ? (
                            <ExpenseClaimPick value={`${line.id}|category`} aria-label={`${copy.category} ${n}`}>
                              {[...new Set([...categories, line.category])].map((category) => (
                                <option key={category} value={category}>
                                  {category}
                                </option>
                              ))}
                            </ExpenseClaimPick>
                          ) : line.kind === "per-diem" ? (
                            <ExpenseClaimPick value={`${line.id}|rate`} aria-label={`${copy.rate} ${n}`}>
                              {[...new Set([...rates, line.rate])].map((rate) => (
                                <option key={rate} value={rate}>
                                  {copy.kinds["per-diem"]}: {rate}
                                </option>
                              ))}
                            </ExpenseClaimPick>
                          ) : (
                            copy.kinds.mileage
                          )}
                        </td>
                        <td>
                          <ExpenseClaimCell value={`${line.id}|description`} aria-label={`${copy.description} ${n}`} />
                        </td>
                        <td>
                          <ExpenseClaimCell
                            value={`${line.id}|value`}
                            aria-label={`${copy.units[line.kind]} ${n}`}
                            inputMode="decimal"
                            data-align="end"
                          />
                        </td>
                        <td>
                          {line.kind === "expense" ? (
                            <ExpenseClaimCell value={`${line.id}|receiptId`} aria-label={`${copy.receipt} ${n}`} />
                          ) : null}
                        </td>
                        <td data-align="end" data-slot="expense-claim-amount">
                          {fmt(state.amounts[line.id] ?? 0)}
                        </td>
                        <td>
                          {draft ? (
                            <ExpenseClaimRemove value={line.id} aria-label={`${copy.remove}: ${copy.line} ${n}`}>
                              {copy.remove}
                            </ExpenseClaimRemove>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr data-slot="expense-claim-total">
                    <th colSpan={5} scope="row">
                      {copy.total}
                    </th>
                    <td data-align="end" data-slot="expense-claim-amount">
                      {fmt(state.totalMinor)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
            {draft && kinds.length > 0 ? (
              <div data-slot="expense-claim-new" role="group" aria-label={copy.newLine}>
                <label>
                  <span>{copy.kind}</span>
                  <ExpenseClaimPick value="new|kind" aria-label={copy.kind}>
                    {kinds.map((kind) => (
                      <option key={kind} value={kind}>
                        {copy.kinds[kind]}
                      </option>
                    ))}
                  </ExpenseClaimPick>
                </label>
                <label>
                  <span>{copy.date}</span>
                  <ExpenseClaimCell
                    value="new|date"
                    aria-label={`${copy.newLine}: ${copy.date}`}
                    placeholder="YYYY-MM-DD"
                  />
                </label>
                {newKind === "expense" ? (
                  <label>
                    <span>{copy.category}</span>
                    <ExpenseClaimPick value="new|category" aria-label={`${copy.newLine}: ${copy.category}`}>
                      {categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </ExpenseClaimPick>
                  </label>
                ) : null}
                {newKind === "per-diem" ? (
                  <label>
                    <span>{copy.rate}</span>
                    <ExpenseClaimPick value="new|rate" aria-label={`${copy.newLine}: ${copy.rate}`}>
                      {rates.map((rate) => (
                        <option key={rate} value={rate}>
                          {rate}
                        </option>
                      ))}
                    </ExpenseClaimPick>
                  </label>
                ) : null}
                <label>
                  <span>{copy.description}</span>
                  <ExpenseClaimCell value="new|description" aria-label={`${copy.newLine}: ${copy.description}`} />
                </label>
                <label>
                  <span>{copy.units[newKind]}</span>
                  <ExpenseClaimCell
                    value="new|value"
                    aria-label={`${copy.newLine}: ${copy.units[newKind]}`}
                    inputMode="decimal"
                    data-align="end"
                  />
                </label>
                <ExpenseClaimAdd>{copy.addLine}</ExpenseClaimAdd>
              </div>
            ) : null}
            {state.exceptions.length > 0 ? (
              <ul data-slot="expense-claim-exceptions" aria-label={copy.exceptions}>
                {state.exceptions.map((exception) => {
                  const key = `${exception.lineId}|${exception.rule}`;
                  const name = `${copy.line} ${number(exception.lineId)}: ${copy.rules[exception.rule]}`;
                  return (
                    <li key={key} data-accepted={exception.accepted ? "" : undefined} title={exception.message}>
                      <span data-slot="expense-claim-exception">{name}</span>
                      {exception.accepted ? (
                        <span data-slot="expense-claim-accepted">
                          {copy.acceptedBy} {exception.acceptedBy}: {exception.reason}
                        </span>
                      ) : draft || deciding ? (
                        <>
                          <ExpenseClaimCell
                            value={`${key}|reason`}
                            aria-label={`${copy.reason}: ${name}`}
                            placeholder={copy.reason}
                          />
                          <ExpenseClaimAccept value={key} aria-label={`${copy.accept}: ${name}`}>
                            {copy.accept}
                          </ExpenseClaimAccept>
                        </>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {draft && state.issues.length > 0 ? (
              <ul data-slot="expense-claim-issues" aria-label={copy.issues}>
                {state.issues.map((issue) => (
                  <li key={issue}>{say(issue)}</li>
                ))}
              </ul>
            ) : null}
            {doc.status === "rejected" && doc.rejectionReason ? (
              <p data-slot="expense-claim-note">
                {copy.rejectReason}: {doc.rejectionReason}
              </p>
            ) : null}
            {draft ? (
              <div data-slot="expense-claim-actions">
                <ExpenseClaimSubmit disabled={!state.submittable}>{copy.submit}</ExpenseClaimSubmit>
              </div>
            ) : null}
            {deciding ? (
              <div data-slot="expense-claim-actions">
                <ExpenseClaimApprove disabled={!state.approvable}>{copy.approve}</ExpenseClaimApprove>
                <label>
                  <span data-slot="visually-hidden">{copy.rejectReason}</span>
                  <ExpenseClaimCell
                    value="|rejectReason"
                    aria-label={copy.rejectReason}
                    placeholder={copy.rejectReason}
                  />
                </label>
                <ExpenseClaimReject>{copy.reject}</ExpenseClaimReject>
              </div>
            ) : null}
            {state.refusal ? (
              <p data-slot="expense-claim-error" role="alert">
                {say(state.refusal)}
              </p>
            ) : null}
          </>
        );
      }}
    </ExpenseClaimRoot>
  );
}

export {
  ExpenseClaim,
  ExpenseClaimAccept,
  ExpenseClaimAdd,
  ExpenseClaimApprove,
  ExpenseClaimCell,
  ExpenseClaimPick,
  ExpenseClaimReject,
  ExpenseClaimRemove,
  ExpenseClaimRoot,
  ExpenseClaimSubmit,
  expenseClaim,
};
export type { Claim as ExpenseClaimData, ExpenseLine, ExpenseLineInput, ExpensePolicy, ExpenseRule, PolicyException };

export { type ExpenseExceptionState } from "@booki-aui/primitives/expense-claim";
