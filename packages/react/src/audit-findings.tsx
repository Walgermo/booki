import {
  FINDING_BASES,
  FINDING_CATEGORIES,
  WITHDRAW_REASON_MIN,
  type Finding,
  type FindingBasis,
  type FindingCategory,
  type FindingStatus,
} from "@booki-aui/core/findings";
import type { BookiChangeDetails } from "./change-details.js";
import { createParts, type Parts } from "@ui-sdk/react/primitive";
import type { ReactNode } from "react";
import { useAccessFor } from "./access.js";
import { useBookiLocaleOptional } from "./locale.js";
import { MoneyAmount } from "./money-amount.js";
import { useSay } from "./say.js";
import { auditFindings, buttonKey, type FindingEvidence } from "@booki-aui/primitives/audit-findings";

const TAGS = {
  root: "div",
  confirm: "button",
  reason: "textarea",
  withdraw: "button",
  reopen: "button",
} as const;
// Typed by name, so the declarations refer to the definition instead of spelling it out per part.
const parts: Parts<typeof auditFindings, typeof TAGS> = createParts(auditFindings, TAGS);
const AuditFindingsRoot: (typeof parts)["Root"] = parts.Root;
const AuditFindingsConfirm: (typeof parts)["Confirm"] = parts.Confirm;
const AuditFindingsReason: (typeof parts)["Reason"] = parts.Reason;
const AuditFindingsWithdraw: (typeof parts)["Withdraw"] = parts.Withdraw;
const AuditFindingsReopen: (typeof parts)["Reopen"] = parts.Reopen;

const COPY = {
  EN: {
    label: "Audit findings",
    none: "No findings raised.",
    confidential: "Confidential",
    evidence: "Evidence",
    noEvidence: "No evidence cited",
    raisedBy: "Raised by",
    confirmedBy: "confirmed by",
    withdrawnBy: "withdrawn by",
    toWeigh: "To weigh before confirming",
    confirm: "Confirm",
    withdraw: "Withdraw",
    reopen: "Reopen",
    reason: "Reason for withdrawing",
    reasonHint: `At least ${WITHDRAW_REASON_MIN} characters. Kept with the file.`,
    status: { draft: "Draft", confirmed: "Confirmed", withdrawn: "Withdrawn" } satisfies Record<FindingStatus, string>,
    category: {
      misstatement: "Misstatement",
      "control-deficiency": "Control deficiency",
      compliance: "Compliance",
      other: "Other",
    } satisfies Record<FindingCategory, string>,
    basis: { documented: "Documented", reported: "Reported by a party", hypothesis: "Hypothesis" } satisfies Record<
      FindingBasis,
      string
    >,
  },
  NO: {
    label: "Revisjonsfunn",
    none: "Ingen funn er registrert.",
    confidential: "Fortrolig",
    evidence: "Dokumentasjon",
    noEvidence: "Ingen dokumentasjon",
    raisedBy: "Registrert av",
    confirmedBy: "bekreftet av",
    withdrawnBy: "trukket tilbake av",
    toWeigh: "Vurder før bekreftelse",
    confirm: "Bekreft",
    withdraw: "Trekk tilbake",
    reopen: "Åpne igjen",
    reason: "Begrunnelse for å trekke tilbake",
    reasonHint: `Minst ${WITHDRAW_REASON_MIN} tegn. Lagres i arkivet.`,
    status: { draft: "Utkast", confirmed: "Bekreftet", withdrawn: "Trukket tilbake" } satisfies Record<
      FindingStatus,
      string
    >,
    category: {
      misstatement: "Feilinformasjon",
      "control-deficiency": "Svakhet i internkontroll",
      compliance: "Etterlevelse",
      other: "Annet",
    } satisfies Record<FindingCategory, string>,
    basis: { documented: "Dokumentert", reported: "Opplyst av en part", hypothesis: "Hypotese" } satisfies Record<
      FindingBasis,
      string
    >,
  },
} as const;

export type AuditFindingsProps = {
  findings?: Finding[];
  defaultFindings?: Finding[];
  /** Evidence a finding can cite. When given, an agent can cite nothing else. */
  evidence?: FindingEvidence[];
  /** Currency of an amount drafted without one. Defaults to the country's. */
  currency?: string;
  actor?: string;
  agentActor?: string;
  onFindingsChange?: (findings: Finding[], details: BookiChangeDetails) => void;
  nameOf?: (id: string) => ReactNode;
  className?: string;
  "aria-label"?: string;
};

type RootState = {
  findings: Finding[];
  issues: Record<string, string[]>;
  drafts: Record<string, string>;
  refusal: string;
};

/** Composed register: each finding, its basis and evidence, what to weigh, and a person's buttons. */
function AuditFindings({
  findings,
  defaultFindings,
  evidence,
  currency,
  actor,
  agentActor,
  onFindingsChange,
  nameOf = (id) => id,
  className,
  "aria-label": ariaLabel,
}: AuditFindingsProps) {
  const { country, profile } = useBookiLocaleOptional();
  const say = useSay();
  const copy = COPY[country === "NO" ? "NO" : "EN"];
  const access = useAccessFor(
    { confirm: "finding.confirm", withdraw: "finding.withdraw", reopen: "finding.confirm" },
    actor,
  );
  const labelOf = (id: string) => evidence?.find((item) => item.id === id)?.label ?? id;
  return (
    <AuditFindingsRoot
      findings={findings}
      defaultFindings={defaultFindings}
      evidence={evidence}
      currency={currency ?? profile.currency}
      actor={access.actor}
      denied={access.denied}
      agentActor={agentActor}
      onFindingsChange={onFindingsChange}
      className={className}
      aria-label={ariaLabel ?? copy.label}
    >
      {(state: RootState) => {
        const count = (status: FindingStatus) => state.findings.filter((finding) => finding.status === status).length;
        return (
          <>
            <p data-slot="audit-findings-status" role="status">
              {(["draft", "confirmed", "withdrawn"] as const)
                .map((status) => `${copy.status[status]} ${count(status)}`)
                .join(" · ")}
            </p>
            {state.findings.length === 0 ? (
              <p data-slot="audit-findings-empty">{copy.none}</p>
            ) : (
              <ul data-slot="audit-findings-items">
                {state.findings.map((finding) => {
                  // Buttons are named by code or id, never by a confidential title.
                  const name = finding.code ?? finding.id;
                  const secret = finding.confidential ? "" : undefined;
                  const issues = state.issues[finding.id] ?? [];
                  const reasonId = `${finding.id}-withdraw-hint`;
                  return (
                    <li
                      key={finding.id}
                      data-status={finding.status}
                      data-basis={finding.basis}
                      data-confidential={secret}
                    >
                      <div data-slot="audit-findings-head">
                        <span data-slot="audit-findings-code">{name}</span>
                        <span data-slot="audit-findings-name" data-agent-secret={secret}>
                          {finding.title}
                        </span>
                        {finding.amountMinor !== undefined ? (
                          <span data-slot="audit-findings-amount" data-agent-secret={secret}>
                            <MoneyAmount value={finding.amountMinor} currency={finding.currency ?? profile.currency} />
                          </span>
                        ) : null}
                      </div>
                      <div data-slot="audit-findings-tags">
                        <span data-slot="audit-findings-state" data-status={finding.status}>
                          {copy.status[finding.status]}
                        </span>
                        <span data-slot="audit-findings-tag">{copy.category[finding.category]}</span>
                        <span data-slot="audit-findings-tag" data-basis={finding.basis}>
                          {copy.basis[finding.basis]}
                        </span>
                        {finding.confidential ? (
                          <span data-slot="audit-findings-tag" data-confidential="">
                            {copy.confidential}
                          </span>
                        ) : null}
                      </div>
                      {finding.description ? (
                        <p data-slot="audit-findings-text" data-agent-secret={secret}>
                          {finding.description}
                        </p>
                      ) : null}
                      <p data-slot="audit-findings-meta">
                        {copy.evidence}:{" "}
                        <span data-agent-secret={secret}>
                          {finding.sources.length ? finding.sources.map(labelOf).join(", ") : copy.noEvidence}
                        </span>
                        {" · "}
                        {copy.raisedBy} {nameOf(finding.raisedBy)}
                        {finding.confirmedBy ? (
                          <>
                            , {copy.confirmedBy} {nameOf(finding.confirmedBy)}
                          </>
                        ) : null}
                        {finding.withdrawnBy ? (
                          <>
                            , {copy.withdrawnBy} {nameOf(finding.withdrawnBy)}
                          </>
                        ) : null}
                      </p>
                      {finding.withdrawReason ? (
                        <p data-slot="audit-findings-withdrawn" data-agent-secret={secret}>
                          {finding.withdrawReason}
                        </p>
                      ) : null}
                      {finding.status !== "withdrawn" && issues.length ? (
                        <ul data-slot="audit-findings-issues" aria-label={`${copy.toWeigh}: ${name}`}>
                          {issues.map((issue) => (
                            <li key={issue}>{say(issue)}</li>
                          ))}
                        </ul>
                      ) : null}
                      <div data-slot="audit-findings-actions">
                        {finding.status === "draft" ? (
                          <AuditFindingsConfirm
                            value={buttonKey(finding.id, "confirm")}
                            aria-label={`${copy.confirm}: ${name}`}
                          >
                            {copy.confirm}
                          </AuditFindingsConfirm>
                        ) : null}
                        {finding.status !== "withdrawn" ? (
                          <span data-slot="audit-findings-withdraw">
                            <AuditFindingsReason
                              value={finding.id}
                              rows={2}
                              aria-label={`${copy.reason}: ${name}`}
                              aria-describedby={reasonId}
                            />
                            <small id={reasonId} data-slot="audit-findings-hint">
                              {copy.reasonHint}
                            </small>
                            <AuditFindingsWithdraw
                              value={buttonKey(finding.id, "withdraw")}
                              aria-label={`${copy.withdraw}: ${name}`}
                            >
                              {copy.withdraw}
                            </AuditFindingsWithdraw>
                          </span>
                        ) : null}
                        {finding.status !== "draft" ? (
                          <AuditFindingsReopen
                            value={buttonKey(finding.id, "reopen")}
                            aria-label={`${copy.reopen}: ${name}`}
                          >
                            {copy.reopen}
                          </AuditFindingsReopen>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {state.refusal ? (
              <p data-slot="audit-findings-error" role="alert">
                {say(state.refusal)}
              </p>
            ) : null}
          </>
        );
      }}
    </AuditFindingsRoot>
  );
}

export {
  AuditFindings,
  AuditFindingsConfirm,
  AuditFindingsReason,
  AuditFindingsReopen,
  AuditFindingsRoot,
  AuditFindingsWithdraw,
  FINDING_BASES,
  FINDING_CATEGORIES,
  auditFindings,
};
export type { Finding, FindingBasis, FindingCategory, FindingEvidence, FindingStatus };
