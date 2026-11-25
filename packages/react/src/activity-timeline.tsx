import type { Activity, ActivityKind } from "@booki-aui/core/activity";
import { createParts, type Parts } from "@ui-sdk/react/primitive";
import type { ReactNode } from "react";
import type { BookiChangeDetails } from "./change-details.js";
import { useAccessFor } from "./access.js";
import { useBookiLocaleOptional } from "./locale.js";
import { useSay } from "./say.js";
import { activityTimeline, buttonKey, type TimelinePerson } from "@booki-aui/primitives/activity-timeline";

const TAGS = { root: "div", complete: "button", remove: "button" } as const;
// Typed by name, so the declarations refer to the definition instead of spelling it out per part.
const parts: Parts<typeof activityTimeline, typeof TAGS> = createParts(activityTimeline, TAGS);
const ActivityTimelineRoot: (typeof parts)["Root"] = parts.Root;
const ActivityTimelineComplete: (typeof parts)["Complete"] = parts.Complete;
const ActivityTimelineRemove: (typeof parts)["Remove"] = parts.Remove;

const COPY = {
  EN: {
    label: "Activity",
    tasks: "Open tasks",
    noTasks: "No open tasks.",
    history: "History",
    none: "Nothing logged yet.",
    lastTouch: "Last contact",
    never: "No contact yet",
    overdue: "Overdue",
    due: "Due",
    for: "for",
    by: "by",
    done: "Done",
    complete: "Mark done",
    remove: "Remove",
    evidence: "Checked against",
    agent: "Agent",
    kind: { call: "Call", email: "Email", meeting: "Meeting", note: "Note", task: "Task" } satisfies Record<
      ActivityKind,
      string
    >,
  },
  NO: {
    label: "Aktivitet",
    tasks: "Åpne oppgaver",
    noTasks: "Ingen åpne oppgaver.",
    history: "Historikk",
    none: "Ingenting logget ennå.",
    lastTouch: "Siste kontakt",
    never: "Ingen kontakt ennå",
    overdue: "Forfalt",
    due: "Frist",
    for: "for",
    by: "av",
    done: "Gjort",
    complete: "Marker gjort",
    remove: "Fjern",
    evidence: "Kontrollert mot",
    agent: "Agent",
    kind: { call: "Samtale", email: "E-post", meeting: "Møte", note: "Notat", task: "Oppgave" } satisfies Record<
      ActivityKind,
      string
    >,
  },
} as const;

export type ActivityTimelineProps = {
  activities?: Activity[];
  defaultActivities?: Activity[];
  /** Who a task may be for; the agent's `assigneeId` takes only these. */
  people?: TimelinePerson[];
  /** Today as YYYY-MM-DD, for overdue tasks. */
  today?: string;
  actor?: string;
  agentActor?: string;
  onActivitiesChange?: (activities: Activity[], details: BookiChangeDetails) => void;
  /** A name for an id in `by`, `doneBy` and `assigneeId`. Defaults to the `people` list, then the id. */
  nameOf?: (id: string) => ReactNode;
  className?: string;
  "aria-label"?: string;
};

type RootState = {
  timeline: Activity[];
  openTasks: string[];
  overdue: string[];
  issues: Record<string, string[]>;
  people: TimelinePerson[];
  refusal: string;
};

/** Composed timeline: the open tasks first, then what happened, newest first. */
function ActivityTimeline({
  activities,
  defaultActivities,
  people,
  today,
  actor,
  agentActor,
  onActivitiesChange,
  nameOf,
  className,
  "aria-label": ariaLabel,
}: ActivityTimelineProps) {
  const { country, profile } = useBookiLocaleOptional();
  const say = useSay();
  const copy = COPY[country === "NO" ? "NO" : "EN"];
  const access = useAccessFor({ remove: "activity.remove" }, actor);
  const agentId = agentActor ?? "agent";
  const when = (value: string) =>
    value.length === 10
      ? new Intl.DateTimeFormat(profile.locale, {
          day: "numeric",
          month: "short",
          year: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${value}T00:00:00Z`))
      : new Intl.DateTimeFormat(profile.locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  return (
    <ActivityTimelineRoot
      activities={activities}
      defaultActivities={defaultActivities}
      people={people}
      today={today}
      actor={access.actor}
      agentActor={agentActor}
      denied={access.denied}
      onActivitiesChange={onActivitiesChange}
      className={className}
      aria-label={ariaLabel ?? copy.label}
    >
      {(state: RootState) => {
        const name = (id: string): ReactNode =>
          id === agentId ? copy.agent : nameOf ? nameOf(id) : (state.people.find((p) => p.id === id)?.name ?? id);
        const tasks = state.openTasks
          .map((id) => state.timeline.find((item) => item.id === id))
          .filter((item): item is Activity => item !== undefined);
        const history = state.timeline.filter((item) => item.kind !== "task" || item.doneAt);
        const touch = state.timeline.find(
          (item) => item.kind === "call" || item.kind === "email" || item.kind === "meeting",
        );
        const issuesOf = (item: Activity) =>
          (state.issues[item.id] ?? []).length ? (
            <ul data-slot="activity-timeline-issues">
              {(state.issues[item.id] ?? []).map((issue) => (
                <li key={issue}>{say(issue)}</li>
              ))}
            </ul>
          ) : null;
        return (
          <>
            <p data-slot="activity-timeline-status" role="status">
              {touch ? `${copy.lastTouch}: ${copy.kind[touch.kind]} ${when(touch.at)}` : copy.never}
              {state.overdue.length ? ` · ${copy.overdue} ${state.overdue.length}` : ""}
            </p>
            <section data-slot="activity-timeline-tasks" aria-label={copy.tasks}>
              <h3 data-slot="activity-timeline-heading">{copy.tasks}</h3>
              {tasks.length === 0 ? (
                <p data-slot="activity-timeline-empty">{copy.noTasks}</p>
              ) : (
                <ul data-slot="activity-timeline-items">
                  {tasks.map((task) => {
                    const late = state.overdue.includes(task.id);
                    return (
                      <li
                        key={task.id}
                        data-kind="task"
                        data-overdue={late ? "" : undefined}
                        data-by={task.by === agentId ? "agent" : undefined}
                      >
                        <div data-slot="activity-timeline-head">
                          <span data-slot="activity-timeline-subject">{task.subject}</span>
                          <span data-slot="activity-timeline-due" data-overdue={late ? "" : undefined}>
                            {copy.due} {task.dueDate ? when(task.dueDate) : "–"}
                            {late ? ` · ${copy.overdue}` : ""}
                          </span>
                        </div>
                        {task.body ? <p data-slot="activity-timeline-body">{task.body}</p> : null}
                        <p data-slot="activity-timeline-meta">
                          {task.assigneeId ? (
                            <>
                              {copy.for} {name(task.assigneeId)} ·{" "}
                            </>
                          ) : null}
                          {copy.by} {name(task.by)}
                        </p>
                        {issuesOf(task)}
                        <div data-slot="activity-timeline-actions">
                          <ActivityTimelineComplete value={task.id} aria-label={`${copy.complete}: ${task.subject}`}>
                            {copy.complete}
                          </ActivityTimelineComplete>
                          <ActivityTimelineRemove
                            value={buttonKey(task.id, "remove")}
                            aria-label={`${copy.remove}: ${task.subject}`}
                          >
                            {copy.remove}
                          </ActivityTimelineRemove>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            <section data-slot="activity-timeline-history" aria-label={copy.history}>
              <h3 data-slot="activity-timeline-heading">{copy.history}</h3>
              {history.length === 0 ? (
                <p data-slot="activity-timeline-empty">{copy.none}</p>
              ) : (
                <ol data-slot="activity-timeline-items">
                  {history.map((item) => (
                    <li key={item.id} data-kind={item.kind} data-by={item.by === agentId ? "agent" : undefined}>
                      <div data-slot="activity-timeline-head">
                        <span data-slot="activity-timeline-kind">{copy.kind[item.kind]}</span>
                        <span data-slot="activity-timeline-subject">{item.subject}</span>
                        <time data-slot="activity-timeline-at" dateTime={item.doneAt ?? item.at}>
                          {when(item.doneAt ?? item.at)}
                        </time>
                      </div>
                      {item.body ? <p data-slot="activity-timeline-body">{item.body}</p> : null}
                      <p data-slot="activity-timeline-meta">
                        {item.doneAt ? `${copy.done} · ` : ""}
                        {copy.by} {name(item.doneBy ?? item.by)}
                        {item.evidence ? (
                          <>
                            {" · "}
                            <span data-slot="activity-timeline-evidence">
                              {copy.evidence} {item.evidence}
                            </span>
                          </>
                        ) : null}
                      </p>
                      {issuesOf(item)}
                      <div data-slot="activity-timeline-actions">
                        <ActivityTimelineRemove
                          value={buttonKey(item.id, "remove")}
                          aria-label={`${copy.remove}: ${item.subject}`}
                        >
                          {copy.remove}
                        </ActivityTimelineRemove>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            {state.refusal ? (
              <p data-slot="activity-timeline-error" role="alert">
                {say(state.refusal)}
              </p>
            ) : null}
          </>
        );
      }}
    </ActivityTimelineRoot>
  );
}

export { ActivityTimeline, ActivityTimelineComplete, ActivityTimelineRemove, ActivityTimelineRoot, activityTimeline };
export type { Activity, ActivityKind, TimelinePerson };
