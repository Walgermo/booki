import { formatMoney, money } from "@booki/core/money";
import {
  type BankLine,
  type OpenPost,
  type ReconciliationMatch,
  type ReconciliationSummary,
} from "@booki/core/reconciliation";
import { createParts } from "@ui-sdk/react/primitive";
import { useState, type ReactNode } from "react";
import { useBookiLocaleOptional } from "./locale.js";
import { bankReconciliation } from "@booki/primitives/bank-reconciliation";

const parts = createParts(bankReconciliation, {
  root: "div",
  match: "button",
  approve: "button",
  reject: "button",
});

const BankReconciliationRoot = parts.Root;
const BankReconciliationMatch = parts.Match;
const BankReconciliationApprove = parts.Approve;
const BankReconciliationReject = parts.Reject;

type RootState = {
  matches: ReconciliationMatch[];
  unmatchedBankLines: BankLine[];
  unmatchedPosts: OpenPost[];
  summary: ReconciliationSummary;
};

export type BankReconciliationProps = {
  bankLines: BankLine[];
  openPosts: OpenPost[];
  matches?: ReconciliationMatch[];
  defaultMatches?: ReconciliationMatch[];
  onMatchesChange?: (matches: ReconciliationMatch[]) => void;
  className?: string;
  "aria-label"?: string;
  children?: ReactNode;
};

type Row = { id: string; date: string; description: string; amountMinor: number };

/**
 * Composed reconciliation: two tables of what is still unmatched, a bar to
 * match the selected rows, the suggestions waiting for a person, and a status
 * line. Use the Root and button parts for your own layout.
 */
function BankReconciliation({
  bankLines,
  openPosts,
  matches,
  defaultMatches,
  onMatchesChange,
  className,
  "aria-label": ariaLabel,
  children,
}: BankReconciliationProps) {
  const { profile } = useBookiLocaleOptional();
  const copy = profile.copy;
  const [lineIds, setLineIds] = useState<string[]>([]);
  const [postIds, setPostIds] = useState<string[]>([]);

  const fmt = (minor: number) => formatMoney(money(minor, profile.currency), { locale: profile.locale });
  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
  const sum = (rows: Row[], picked: string[]) =>
    rows.filter((row) => picked.includes(row.id)).reduce((n, row) => n + row.amountMinor, 0);

  function table(title: string, rows: Row[], picked: string[], onToggle: (id: string) => void, slot: string) {
    return (
      <div data-slot={slot}>
        <table data-slot="bank-reconciliation-table">
          <caption>{title}</caption>
          <thead>
            <tr>
              <th>
                <span data-slot="visually-hidden">{copy.select}</span>
              </th>
              <th>{copy.date}</th>
              <th>{copy.text}</th>
              <th data-align="end">{copy.amount}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} data-slot="bank-reconciliation-empty">
                  {copy.nothingUnmatched}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} data-selected={picked.includes(row.id) ? "true" : undefined}>
                  <td>
                    {/* The label is the 44px target; the box itself stays small. */}
                    <label data-slot="bank-reconciliation-check">
                      <input
                        type="checkbox"
                        aria-label={`${copy.select}: ${row.description}`}
                        checked={picked.includes(row.id)}
                        onChange={() => onToggle(row.id)}
                      />
                    </label>
                  </td>
                  <td data-slot="bank-reconciliation-date">{row.date}</td>
                  <td>{row.description}</td>
                  <td data-align="end" data-slot="bank-reconciliation-amount">
                    {fmt(row.amountMinor)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <BankReconciliationRoot
      bankLines={bankLines}
      openPosts={openPosts}
      matches={matches}
      defaultMatches={defaultMatches}
      onMatchesChange={(next: ReconciliationMatch[]) => {
        // Rows that just left the tables can no longer be selected.
        setLineIds([]);
        setPostIds([]);
        onMatchesChange?.(next);
      }}
      className={className}
      aria-label={ariaLabel ?? copy.reconciliation}
    >
      {(state: RootState) => {
        const pickedLines = lineIds.filter((id) => state.unmatchedBankLines.some((l) => l.id === id));
        const pickedPosts = postIds.filter((id) => state.unmatchedPosts.some((p) => p.id === id));
        const difference = sum(state.unmatchedBankLines, pickedLines) - sum(state.unmatchedPosts, pickedPosts);
        const canMatch = pickedLines.length > 0 && pickedPosts.length > 0 && difference === 0;
        const suggestions = state.matches.filter((match) => match.status === "suggested");
        const describe = (ids: string[], rows: Row[]) =>
          ids.map((id) => rows.find((row) => row.id === id)?.description ?? id).join(" + ");

        return (
          <>
            <p data-slot="bank-reconciliation-status" role="status">
              {state.summary.reconciled ? copy.reconciled : copy.notReconciled}
              {" · "}
              {state.summary.matchedCount}/{state.summary.bankLineCount}
              {" · "}
              {suggestions.length} {copy.suggestions.toLowerCase()}
            </p>

            <div data-slot="bank-reconciliation-tables">
              {table(
                copy.bankStatement,
                state.unmatchedBankLines,
                pickedLines,
                (id) => setLineIds((list) => toggle(list, id)),
                "bank-reconciliation-bank",
              )}
              {table(
                copy.ledger,
                state.unmatchedPosts,
                pickedPosts,
                (id) => setPostIds((list) => toggle(list, id)),
                "bank-reconciliation-ledger",
              )}
            </div>

            <div data-slot="bank-reconciliation-bar">
              <BankReconciliationMatch bankLineIds={pickedLines} postIds={pickedPosts} disabled={!canMatch}>
                {copy.matchSelected}
              </BankReconciliationMatch>
              <p data-slot="bank-reconciliation-difference">
                {pickedLines.length + pickedPosts.length === 0
                  ? copy.selectToMatch
                  : `${copy.difference} ${fmt(difference)}`}
              </p>
            </div>

            <section data-slot="bank-reconciliation-suggestions" aria-label={copy.suggestions}>
              <h3>{copy.suggestions}</h3>
              {suggestions.length === 0 ? (
                <p data-slot="bank-reconciliation-empty">{copy.noSuggestions}</p>
              ) : (
                <ul>
                  {suggestions.map((match) => {
                    const amount = bankLines
                      .filter((line) => match.bankLineIds.includes(line.id))
                      .reduce((n, line) => n + line.amountMinor, 0);
                    return (
                      <li key={match.id} data-source={match.source}>
                        <div data-slot="bank-reconciliation-pair">
                          <span>{describe(match.bankLineIds, bankLines)}</span>
                          <span aria-hidden>↔</span>
                          <span>{describe(match.postIds, openPosts)}</span>
                        </div>
                        <span data-slot="bank-reconciliation-amount">{fmt(amount)}</span>
                        <div data-slot="bank-reconciliation-actions">
                          <BankReconciliationApprove value={match.id}>{copy.approve}</BankReconciliationApprove>
                          <BankReconciliationReject value={match.id}>{copy.reject}</BankReconciliationReject>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            {children}
          </>
        );
      }}
    </BankReconciliationRoot>
  );
}

export {
  BankReconciliation,
  BankReconciliationApprove,
  BankReconciliationMatch,
  BankReconciliationReject,
  BankReconciliationRoot,
  bankReconciliation,
};
export type { BankLine, OpenPost, ReconciliationMatch };
