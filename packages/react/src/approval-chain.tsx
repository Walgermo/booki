import {
  type ApprovalDecision,
  type ApprovalLevel,
  type ApprovalRequest,
  type ApprovalState,
} from "@booki-aui/core/approval";
import type { BookiChangeDetails } from "./change-details.js";
import { createParts, type Parts } from "@ui-sdk/react/primitive";
import type { ReactNode } from "react";
import { useAccessFor } from "./access.js";
import { useWorkflowCopy } from "./workflow-copy.js";
import { useSay } from "./say.js";
import { approvalChain } from "@booki-aui/primitives/approval-chain";

const TAGS = {
  root: "div",
  approve: "button",
  reject: "button",
  escalate: "button",
} as const;
// Typed by name, so the declarations refer to the definition instead of spelling it out per part.
const parts: Parts<typeof approvalChain, typeof TAGS> = createParts(approvalChain, TAGS);

const ApprovalChainRoot: (typeof parts)["Root"] = parts.Root;
const ApprovalChainApprove: (typeof parts)["Approve"] = parts.Approve;
const ApprovalChainReject: (typeof parts)["Reject"] = parts.Reject;
const ApprovalChainEscalate: (typeof parts)["Escalate"] = parts.Escalate;

export type ApprovalChainProps = {
  chain: ApprovalLevel[];
  request?: ApprovalRequest;
  defaultRequest?: ApprovalRequest;
  /** Id of the person at the keyboard. */
  actor?: string;
  onRequestChange?: (request: ApprovalRequest, details: BookiChangeDetails) => void;
  /** Show a person's name instead of their id. */
  nameOf?: (id: string) => ReactNode;
  className?: string;
  "aria-label"?: string;
};

type RootState = { request: ApprovalRequest; refusal: string; approval?: ApprovalState };

/** Composed approval chain: one row per level, who decided, and the three buttons. */
function ApprovalChain({
  chain,
  request,
  defaultRequest,
  actor,
  onRequestChange,
  nameOf = (id) => id,
  className,
  "aria-label": ariaLabel,
}: ApprovalChainProps) {
  const copy = useWorkflowCopy();
  const say = useSay();
  const access = useAccessFor({ decide: "approval.decide" }, actor);
  return (
    <ApprovalChainRoot
      chain={chain}
      request={request}
      defaultRequest={defaultRequest}
      actor={access.actor}
      denied={access.denied}
      onRequestChange={onRequestChange}
      className={className}
      aria-label={ariaLabel ?? copy.approvalChain}
    >
      {(state: RootState) => {
        const approval = state.approval;
        if (!approval) return null;
        const label = { pending: copy.pending, approved: copy.approved, rejected: copy.rejected }[approval.status];
        return (
          <>
            <p data-slot="approval-chain-status" role="status">
              {label}
            </p>
            <ol data-slot="approval-chain-levels">
              {approval.levels.map((level) => {
                const decisions = state.request.decisions.filter((d) => d.levelId === level.id);
                const last = decisions.at(-1);
                const current = approval.current?.id === level.id;
                const stage =
                  last?.decision === "approved" || last?.decision === "rejected"
                    ? last.decision
                    : current
                      ? approval.escalated
                        ? "escalated"
                        : "pending"
                      : "waiting";
                return (
                  <li key={level.id} data-stage={stage} aria-current={current ? "step" : undefined}>
                    <span data-slot="approval-chain-level">{level.name}</span>
                    <span data-slot="approval-chain-detail">
                      {last && last.decision !== "escalated" ? (
                        <>
                          {last.decision === "approved" ? copy.approved : copy.rejected}
                          {" · "}
                          {nameOf(last.approverId)}
                          {last.onBehalfOf ? (
                            <>
                              {" "}
                              {copy.onBehalfOf} {nameOf(last.onBehalfOf)}
                            </>
                          ) : null}
                        </>
                      ) : current ? (
                        <>
                          {approval.escalated ? `${copy.escalated} · ` : ""}
                          {copy.mayDecide}:{" "}
                          {approval.mayDecide.length === 0
                            ? copy.nobody
                            : approval.mayDecide.map((id, i) => (
                                <span key={id}>
                                  {i > 0 ? ", " : ""}
                                  {nameOf(id)}
                                </span>
                              ))}
                        </>
                      ) : (
                        copy.pending
                      )}
                    </span>
                  </li>
                );
              })}
            </ol>
            {approval.status === "pending" ? (
              <div data-slot="approval-chain-actions">
                <ApprovalChainApprove>{copy.approve}</ApprovalChainApprove>
                <ApprovalChainReject>{copy.reject}</ApprovalChainReject>
                {approval.current?.escalateTo && !approval.escalated ? (
                  <ApprovalChainEscalate>{copy.escalate}</ApprovalChainEscalate>
                ) : null}
              </div>
            ) : null}
            {state.refusal ? (
              <p data-slot="approval-chain-error" role="alert">
                {say(state.refusal)}
              </p>
            ) : null}
          </>
        );
      }}
    </ApprovalChainRoot>
  );
}

export {
  ApprovalChain,
  ApprovalChainApprove,
  ApprovalChainEscalate,
  ApprovalChainReject,
  ApprovalChainRoot,
  approvalChain,
};
export type { ApprovalDecision, ApprovalLevel, ApprovalRequest };
