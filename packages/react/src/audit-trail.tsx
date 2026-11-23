import { useBookiLocaleOptional } from "./locale.js";

export type AuditEvent = {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  detail?: string;
  /** Optional rule/workflow version for agent auditability */
  ruleVersion?: string;
  /** Who confirmed or refused the step: a person's id, or a rule such as `rule:under-5000`. */
  decidedBy?: string;
};

export type AuditTrailProps = {
  events: AuditEvent[];
  className?: string;
  emptyLabel?: string;
};

function AuditTrail({ events, className, emptyLabel }: AuditTrailProps) {
  const { profile } = useBookiLocaleOptional();
  const empty = emptyLabel ?? profile.copy.emptyAudit;

  if (events.length === 0) {
    return (
      <p data-slot="audit-trail-empty" className={className}>
        {empty}
      </p>
    );
  }

  return (
    <ol data-slot="audit-trail" className={className}>
      {events.map((event) => (
        <li key={event.id} data-slot="audit-event">
          <div data-slot="audit-event-header">
            <span>
              {event.action} · {event.target}
            </span>
            <time dateTime={event.at}>{new Date(event.at).toLocaleString(profile.locale)}</time>
          </div>
          <div data-slot="audit-event-body">
            {event.actor}
            {event.decidedBy ? ` → ${event.decidedBy}` : ""}
            {event.detail ? ` — ${event.detail}` : ""}
            {event.ruleVersion ? ` · v${event.ruleVersion}` : ""}
          </div>
        </li>
      ))}
    </ol>
  );
}

export { AuditTrail };
