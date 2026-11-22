import type { ClientRecipient, ClientRequest, ClientRequestStatus } from "@booki/core/client-request";
import { createParts } from "@ui-sdk/react/primitive";
import type { ReactNode } from "react";
import { useAccessFor } from "./access.js";
import { useBookiLocaleOptional } from "./locale.js";
import { useSay } from "./say.js";
import { buttonKey, clientRequests } from "@booki/primitives/client-requests";

const parts = createParts(clientRequests, {
  root: "div",
  send: "button",
  remind: "button",
  accept: "button",
  reason: "textarea",
  reject: "button",
});
const ClientRequestsRoot = parts.Root;
const ClientRequestsSend = parts.Send;
const ClientRequestsRemind = parts.Remind;
const ClientRequestsAccept = parts.Accept;
const ClientRequestsReason = parts.Reason;
const ClientRequestsReject = parts.Reject;

const COPY = {
  EN: {
    label: "Client requests",
    none: "No requests to the client yet.",
    to: "To",
    due: "Due",
    noDue: "No due date",
    overdue: "Overdue",
    reminders: "Reminders",
    answer: "Answer",
    rejected: "Not enough",
    send: "Send",
    remind: "Remind",
    accept: "Accept answer",
    reject: "Reject answer",
    reason: "What is missing",
    waiting: "Waiting for client",
    decidedBy: "Judged by",
    status: {
      draft: "Draft",
      sent: "Sent",
      answered: "Answered",
      accepted: "Accepted",
      rejected: "Sent back",
    } satisfies Record<ClientRequestStatus, string>,
  },
  NO: {
    label: "Forespørsler til klient",
    none: "Ingen forespørsler til klienten ennå.",
    to: "Til",
    due: "Frist",
    noDue: "Ingen frist",
    overdue: "Forfalt",
    reminders: "Purringer",
    answer: "Svar",
    rejected: "Ikke tilstrekkelig",
    send: "Send",
    remind: "Purr",
    accept: "Godta svar",
    reject: "Avvis svar",
    reason: "Hva som mangler",
    waiting: "Venter på klient",
    decidedBy: "Vurdert av",
    status: {
      draft: "Utkast",
      sent: "Sendt",
      answered: "Besvart",
      accepted: "Godtatt",
      rejected: "Sendt tilbake",
    } satisfies Record<ClientRequestStatus, string>,
  },
} as const;

export type ClientRequestsProps = {
  requests?: ClientRequest[];
  defaultRequests?: ClientRequest[];
  /** Today as YYYY-MM-DD, for what is overdue. */
  today?: string;
  actor?: string;
  agentActor?: string;
  onRequestsChange?: (requests: ClientRequest[]) => void;
  nameOf?: (id: string) => ReactNode;
  className?: string;
  "aria-label"?: string;
};

type RootState = {
  requests: ClientRequest[];
  overdue: string[];
  issues: Record<string, string[]>;
  drafts: Record<string, string>;
  refusal: string;
};

/** Composed list: each request, who it is for, its due date and answer, and a person's buttons. */
function ClientRequests({
  requests,
  defaultRequests,
  today,
  actor,
  agentActor,
  onRequestsChange,
  nameOf = (id) => id,
  className,
  "aria-label": ariaLabel,
}: ClientRequestsProps) {
  const { country, profile } = useBookiLocaleOptional();
  const say = useSay();
  const copy = COPY[country === "NO" ? "NO" : "EN"];
  const access = useAccessFor(
    { send: "request.send", remind: "request.send", accept: "request.decide", reject: "request.decide" },
    actor,
  );
  const date = (value: string) =>
    new Intl.DateTimeFormat(profile.locale, {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
  return (
    <ClientRequestsRoot
      requests={requests}
      defaultRequests={defaultRequests}
      today={today}
      actor={access.actor}
      denied={access.denied}
      agentActor={agentActor}
      onRequestsChange={onRequestsChange}
      className={className}
      aria-label={ariaLabel ?? copy.label}
    >
      {(state: RootState) => {
        const waiting = state.requests.filter(
          (request) => request.status === "sent" || request.status === "rejected",
        ).length;
        return (
          <>
            <p data-slot="client-requests-status" role="status">
              {copy.waiting} {waiting}
              {state.overdue.length ? ` · ${copy.overdue} ${state.overdue.length}` : ""}
            </p>
            {state.requests.length === 0 ? (
              <p data-slot="client-requests-empty">{copy.none}</p>
            ) : (
              <ul data-slot="client-requests-items">
                {state.requests.map((request) => {
                  const late = state.overdue.includes(request.id);
                  const issues = state.issues[request.id] ?? [];
                  return (
                    <li key={request.id} data-status={request.status} data-overdue={late ? "" : undefined}>
                      <div data-slot="client-requests-head">
                        <span data-slot="client-requests-code">{request.id}</span>
                        <span data-slot="client-requests-name">{request.title}</span>
                        {request.area ? <span data-slot="client-requests-area">{request.area}</span> : null}
                      </div>
                      <div data-slot="client-requests-tags">
                        <span data-slot="client-requests-state" data-status={request.status}>
                          {copy.status[request.status]}
                        </span>
                        <span data-slot="client-requests-due" data-overdue={late ? "" : undefined}>
                          {request.dueDate ? `${copy.due} ${date(request.dueDate)}` : copy.noDue}
                          {late ? ` · ${copy.overdue}` : ""}
                        </span>
                        {request.reminders ? (
                          <span data-slot="client-requests-reminders">
                            {copy.reminders}: {request.reminders}
                          </span>
                        ) : null}
                      </div>
                      <p data-slot="client-requests-recipient">
                        {copy.to} {request.recipient.name}
                        {request.recipient.role ? ` (${request.recipient.role})` : ""}
                        {" · "}
                        {/* The address is shown to the person only: the agent reads name and role. */}
                        <span data-slot="client-requests-email" data-agent-secret="">
                          {request.recipient.email}
                        </span>
                      </p>
                      {request.answer ? (
                        <p data-slot="client-requests-answer">
                          <span data-slot="client-requests-label">{copy.answer}:</span> {request.answer}
                        </p>
                      ) : null}
                      {request.rejectReason ? (
                        <p data-slot="client-requests-rejected">
                          <span data-slot="client-requests-label">{copy.rejected}:</span> {request.rejectReason}
                        </p>
                      ) : null}
                      {request.decidedBy ? (
                        <p data-slot="client-requests-meta">
                          {copy.decidedBy} {nameOf(request.decidedBy)}
                        </p>
                      ) : null}
                      {issues.length ? (
                        <ul data-slot="client-requests-issues">
                          {issues.map((issue) => (
                            <li key={issue}>{say(issue)}</li>
                          ))}
                        </ul>
                      ) : null}
                      <div data-slot="client-requests-actions">
                        {request.status === "draft" ? (
                          <ClientRequestsSend
                            value={buttonKey(request.id, "send")}
                            aria-label={`${copy.send}: ${request.title}`}
                          >
                            {copy.send}
                          </ClientRequestsSend>
                        ) : null}
                        {request.status === "sent" || request.status === "rejected" ? (
                          <ClientRequestsRemind
                            value={buttonKey(request.id, "remind")}
                            aria-label={`${copy.remind}: ${request.title}`}
                          >
                            {copy.remind}
                          </ClientRequestsRemind>
                        ) : null}
                        {request.status === "answered" ? (
                          <>
                            <ClientRequestsAccept
                              value={buttonKey(request.id, "accept")}
                              aria-label={`${copy.accept}: ${request.title}`}
                            >
                              {copy.accept}
                            </ClientRequestsAccept>
                            <span data-slot="client-requests-reject">
                              <ClientRequestsReason
                                value={request.id}
                                rows={2}
                                aria-label={`${copy.reason}: ${request.title}`}
                              />
                              <ClientRequestsReject
                                value={buttonKey(request.id, "reject")}
                                aria-label={`${copy.reject}: ${request.title}`}
                              >
                                {copy.reject}
                              </ClientRequestsReject>
                            </span>
                          </>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {state.refusal ? (
              <p data-slot="client-requests-error" role="alert">
                {say(state.refusal)}
              </p>
            ) : null}
          </>
        );
      }}
    </ClientRequestsRoot>
  );
}

export {
  ClientRequests,
  ClientRequestsAccept,
  ClientRequestsReason,
  ClientRequestsReject,
  ClientRequestsRemind,
  ClientRequestsRoot,
  ClientRequestsSend,
  clientRequests,
};
export type { ClientRecipient, ClientRequest, ClientRequestStatus };
