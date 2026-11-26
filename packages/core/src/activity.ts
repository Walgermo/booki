import { BookiError, msg } from "./msg.js";

/**
 * What happened with a customer, and what is to be done next: calls, emails,
 * meetings and notes that are logged, and tasks with a due date. An agent may
 * log what happened, schedule and complete tasks; removing an entry is a
 * person's. Logging an email records one that was sent or received; sending
 * it is not this control's.
 *
 * A call or meeting may carry `evidence`: where it can be checked (a calendar
 * event, a call log line, minutes). One without it is still logged, and the
 * timeline says it has nothing to check it against.
 */
export type ActivityKind = "call" | "email" | "meeting" | "note" | "task";

export const ACTIVITY_KINDS: readonly ActivityKind[] = ["call", "email", "meeting", "note", "task"];

/** The kinds `logActivity` takes: what already happened. A task is scheduled. */
export const LOGGED_KINDS: readonly ActivityKind[] = ["call", "email", "meeting", "note"];

/** The kinds that touch the customer: the last of them is the last contact. */
const TOUCHES: readonly ActivityKind[] = ["call", "email", "meeting"];

export type Activity = {
  id: string;
  kind: ActivityKind;
  subject: string;
  body?: string;
  /** When it happened (logged) or was created (task): an ISO timestamp, or YYYY-MM-DD when only the day is known. */
  at: string;
  /** Who logged or scheduled it. */
  by: string;
  /** Where a call or meeting can be checked: a calendar event, a call log line, minutes. */
  evidence?: string;
  /** A task's due date, YYYY-MM-DD. */
  dueDate?: string;
  /** Whom a task is for. */
  assigneeId?: string;
  /** When a task was done, ISO. */
  doneAt?: string;
  doneBy?: string;
};

export type NewLoggedActivity = {
  id: string;
  kind: ActivityKind;
  subject: string;
  body?: string;
  at: string;
  evidence?: string;
};

export type NewTask = { id: string; subject: string; dueDate: string; body?: string; assigneeId?: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

function realDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function realTime(value: string): boolean {
  return (
    realDate(value.slice(0, 10)) && (value.length === 10 || (TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value))))
  );
}

const who = (by: unknown) => {
  const id = String(by ?? "").trim();
  if (id === "") throw new BookiError("activity.actor-required");
  return id;
};

function text(id: string, field: string, value: unknown, required: boolean): string | undefined {
  if (value === undefined || value === null) {
    if (required) throw new BookiError("activity.field-empty", { id, field });
    return undefined;
  }
  if (typeof value !== "string") {
    throw new BookiError("activity.field-text", { id, field, value: JSON.stringify(value) ?? String(value) });
  }
  const trimmed = value.trim();
  if (required && trimmed === "") throw new BookiError("activity.field-empty", { id, field });
  return trimmed === "" ? undefined : trimmed;
}

function dueDate(id: string, value: unknown): string {
  const date = String(value ?? "").trim();
  if (!realDate(date)) throw new BookiError("activity.due-date-format", { id, value: String(value ?? "") });
  return date;
}

function tidy<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

/**
 * Log something that happened. `now` is the current ISO time: an entry dated
 * after it is refused, since what is still to come is a task. An entry with a
 * date and no time is checked against `today`, the person's own calendar date
 * as YYYY-MM-DD; without it, against the UTC date of `now`.
 */
export function logActivity(input: NewLoggedActivity, by: string, now: string, today?: string): Activity {
  const id = String(input?.id ?? "").trim();
  if (id === "") throw new BookiError("activity.id-required");
  if (!LOGGED_KINDS.includes(input.kind)) {
    throw new BookiError("activity.kind", { id, kind: String(input.kind), kinds: LOGGED_KINDS.join(", ") });
  }
  const at = String(input.at ?? "").trim();
  if (!realTime(at)) throw new BookiError("activity.at-format", { id, value: at });
  const future = at.length === 10 ? at > (today ?? now.slice(0, 10)) : Date.parse(at) > Date.parse(now);
  if (future) throw new BookiError("activity.in-future", { id, at });
  return tidy({
    id,
    kind: input.kind,
    subject: text(id, "subject", input.subject, true) as string,
    body: text(id, "body", input.body, false),
    at,
    by: who(by),
    evidence: text(id, "evidence", input.evidence, false),
  });
}

/** Schedule a task for later. */
export function scheduleTask(input: NewTask, by: string, at: string): Activity {
  const id = String(input?.id ?? "").trim();
  if (id === "") throw new BookiError("activity.id-required");
  return tidy({
    id,
    kind: "task" as ActivityKind,
    subject: text(id, "subject", input.subject, true) as string,
    body: text(id, "body", input.body, false),
    at,
    by: who(by),
    dueDate: dueDate(id, input.dueDate),
    assigneeId: text(id, "assigneeId", input.assigneeId, false),
  });
}

function openTask(activity: Activity): void {
  if (activity.kind !== "task") throw new BookiError("activity.not-task", { id: activity.id, kind: activity.kind });
  if (activity.doneAt) throw new BookiError("activity.task-done", { id: activity.id, at: activity.doneAt });
}

/** Mark an open task done. */
export function completeTask(activity: Activity, by: string, at: string): Activity {
  openTask(activity);
  return { ...activity, doneAt: at, doneBy: who(by) };
}

/** Give an open task a new due date. */
export function rescheduleTask(activity: Activity, date: string): Activity {
  openTask(activity);
  return { ...activity, dueDate: dueDate(activity.id, date) };
}

/** Newest first: by `at`, a day-only entry counting as the start of its day. */
export function timeline(activities: readonly Activity[]): Activity[] {
  const time = (activity: Activity) => Date.parse(activity.at.length === 10 ? `${activity.at}T00:00:00Z` : activity.at);
  return [...activities].sort((a, b) => time(b) - time(a));
}

/** Open tasks, the earliest due first. */
export function openTasks(activities: readonly Activity[]): Activity[] {
  return activities
    .filter((activity) => activity.kind === "task" && !activity.doneAt)
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
}

/** Ids of open tasks due before `today` (YYYY-MM-DD). */
export function overdueTasks(activities: readonly Activity[], today: string): string[] {
  return openTasks(activities)
    .filter((task) => task.dueDate !== undefined && task.dueDate < today)
    .map((task) => task.id);
}

/** The last call, email or meeting, or undefined when there has been none. */
export function lastTouch(activities: readonly Activity[]): Activity | undefined {
  return timeline(activities).find((activity) => TOUCHES.includes(activity.kind));
}

/** What a person should know about an entry, as sentences. Warnings, never refusals. */
export function activityIssues(activity: Activity, today: string): string[] {
  const issues: string[] = [];
  if ((activity.kind === "call" || activity.kind === "meeting") && !activity.evidence) {
    issues.push(msg("activity.issue.no-evidence", { id: activity.id }));
  }
  if (activity.kind === "task" && !activity.doneAt && activity.dueDate && activity.dueDate < today) {
    issues.push(msg("activity.issue.overdue", { id: activity.id, due: activity.dueDate }));
  }
  return issues;
}

/** The entry with this id, or a refusal listing the ones there are. */
export function findActivity(activities: readonly Activity[], id: unknown): Activity {
  const activity = activities.find((item) => item.id === String(id));
  if (!activity) {
    throw new BookiError("activity.no-activity", {
      id: String(id),
      ids: activities.map((item) => item.id).join(", ") || "none",
    });
  }
  return activity;
}
