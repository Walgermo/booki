import { BookiError } from "@booki/core/msg";
import { localToday } from "@booki/core/financial-date";
import {
  activityIssues,
  completeTask,
  findActivity,
  lastTouch,
  logActivity,
  openTasks,
  overdueTasks,
  rescheduleTask,
  scheduleTask,
  timeline,
  type Activity,
  type ActivityKind,
} from "@booki/core/activity";
import { createChange, definePrimitive } from "@ui-sdk/core";
import { refuseDenied } from "./access.js";
import { asEvent, checkFields, recordOf } from "./fields.js";
import { personOnly } from "./person-only.js";

export { buttonKey } from "./fields.js";

/** How to log and schedule, shown in the snapshot. */
export const ACTIVITY_FORMAT =
  'logActivity({ kind: "call", subject, at: "2026-03-02" }); scheduleTask({ subject, dueDate: "2026-03-09" })';

/** What `logActivity` takes. */
export const LOG_FIELDS = ["kind", "subject", "body", "at", "evidence"] as const;

/** What `scheduleTask` takes. */
export const TASK_FIELDS = ["subject", "dueDate", "body", "assigneeId"] as const;

const LOG_EXAMPLE = '{ "kind": "call", "subject": "Intro call", "at": "2026-03-02T09:30:00Z" }';
const TASK_EXAMPLE = '{ "subject": "Send the quote", "dueDate": "2026-03-09" }';

export type TimelinePerson = { id: string; name: string };

export type Options = {
  activities?: Activity[];
  defaultActivities?: Activity[];
  /** Who a task may be for. When given, `assigneeId` takes only these ids. */
  people?: TimelinePerson[];
  /** Today as YYYY-MM-DD, for overdue tasks. Defaults to the date now. */
  today?: string;
  /** Id of the person at the keyboard. */
  actor?: string;
  /** What an agent's entries are recorded as. Defaults to "agent". */
  agentActor?: string;
  /** A person's methods their role does not allow, each with the reason. Set by `BookiAccessProvider`. */
  denied?: Record<string, string>;
  onActivitiesChange?: (
    activities: Activity[],
    details: { reason: string; source?: string; cancel?: () => void },
  ) => void;
};

const todayOf = (options: Options) => options.today ?? localToday();

export function derive(activities: Activity[], today: string) {
  const touch = lastTouch(activities);
  const open = openTasks(activities);
  return {
    timeline: timeline(activities),
    openTasks: open.map((task) => task.id),
    nextTask: open[0]?.id ?? null,
    overdue: overdueTasks(activities, today),
    lastTouch: touch ? { id: touch.id, kind: touch.kind, at: touch.at } : null,
    issues: Object.fromEntries(activities.map((item) => [item.id, activityIssues(item, today)])) as Record<
      string,
      string[]
    >,
  };
}

/** The first free id of the form A-1 (logged) or T-1 (task). */
export function nextId(activities: Activity[], prefix: "A" | "T"): string {
  const taken = new Set(activities.map((item) => item.id));
  let n = activities.filter((item) => item.id.startsWith(`${prefix}-`)).length + 1;
  while (taken.has(`${prefix}-${n}`)) n += 1;
  return `${prefix}-${n}`;
}

/**
 * A customer's history and what is to be done next. An agent logs calls,
 * emails, meetings and notes, schedules tasks, reschedules and completes
 * them, each recorded as the agent's. Removing an entry is a person's button.
 * The snapshot has the timeline newest first, the open and overdue tasks, the
 * next task and the last contact.
 */
export const activityTimeline = definePrimitive({
  name: "activity-timeline",
  options: {
    activities: "value",
    defaultActivities: "value",
    people: "value",
    today: "string",
    actor: "string",
    agentActor: "string",
    denied: "value",
    onActivitiesChange: "callback",
  },
  controlled: ["timeline", "openTasks", "nextTask", "overdue", "lastTouch", "issues", "people", "activityFormat"],
  state: (options: Options) => {
    const activities = options.activities ?? options.defaultActivities ?? [];
    const today = todayOf(options);
    return {
      activities,
      people: options.people ?? [],
      today,
      refusal: "",
      activityFormat: ACTIVITY_FORMAT,
      ...derive(activities, today),
    };
  },
  sync: (options: Options) => ({
    ...(options.people !== undefined ? { people: options.people } : {}),
    ...(options.activities !== undefined
      ? { activities: options.activities, ...derive(options.activities, todayOf(options)) }
      : {}),
  }),
  api: (context) => {
    const change = createChange(context);
    const rederive = () => {
      const { activities, today } = context.store.get();
      context.store.set(derive(activities, today));
    };
    context.onOptions((options) => {
      const today = todayOf(options);
      if (today !== context.store.get().today) {
        context.store.set({ today });
        rederive();
      }
    });
    const now = () => new Date().toISOString();
    const agent = () => context.options().agentActor ?? "agent";
    const person = (permission: string) => {
      const actor = String(context.options().actor ?? "").trim();
      if (actor === "") throw new BookiError("permissions.signed-out", { permission });
      return actor;
    };
    const commit = (next: Activity[], reason: string, event?: Event) => {
      const ok = change("activities", next, { reason, event });
      if (!ok) return false;
      context.store.set({ refusal: "" });
      rederive();
      return true;
    };
    const put = (next: Activity, reason: string, event?: Event) =>
      commit(
        context.store.get().activities.map((item) => (item.id === next.id ? next : item)),
        reason,
        event,
      );
    const find = (id: unknown) => findActivity(context.store.get().activities, id);
    const shown = <T>(run: () => T): T => {
      try {
        return run();
      } catch (error) {
        context.store.set({ refusal: (error as Error).message });
        throw error;
      }
    };
    const assignee = (taskId: string, raw: unknown): string | undefined => {
      if (raw === undefined || raw === null || String(raw).trim() === "") return undefined;
      const wanted = String(raw).trim();
      const people = context.store.get().people;
      if (people.length === 0) return wanted;
      const found =
        people.find((item) => item.id === wanted) ??
        people.find((item) => item.name.trim().toLowerCase() === wanted.toLowerCase());
      if (!found) {
        throw new BookiError("activity.no-assignee", {
          id: taskId,
          assignee: wanted,
          people: people.map((item) => `${item.id} (${item.name})`).join(", "),
        });
      }
      return found.id;
    };
    return {
      /** Agent: log a call, email, meeting or note that happened. `at` defaults to now. Returns its id. */
      logActivity: (input: { kind: ActivityKind; subject: string; body?: string; at?: string; evidence?: string }) =>
        shown(() => {
          const fields = checkFields("logActivity", input, LOG_FIELDS, LOG_EXAMPLE) as typeof input;
          const activities = context.store.get().activities;
          const id = nextId(activities, "A");
          const stamp = now();
          const activity = logActivity({ ...fields, id, at: fields.at ?? stamp }, agent(), stamp);
          return commit([...activities, activity], "log-activity") ? { id } : false;
        }),
      /** Agent: a task for later, with a due date. Returns its id. */
      scheduleTask: (input: { subject: string; dueDate: string; body?: string; assigneeId?: string }) =>
        shown(() => {
          const fields = checkFields("scheduleTask", input, TASK_FIELDS, TASK_EXAMPLE) as typeof input;
          const activities = context.store.get().activities;
          const id = nextId(activities, "T");
          const task = scheduleTask({ ...fields, id, assigneeId: assignee(id, fields.assigneeId) }, agent(), now());
          return commit([...activities, task], "schedule-task") ? { id } : false;
        }),
      /** Agent and person: mark an open task done. */
      completeTask: (id: string, event?: Event) =>
        shown(() => {
          const from = asEvent(event);
          const by = from ? person("activity.complete") : agent();
          return put(completeTask(find(id), by, now()), "complete-task", from);
        }),
      /** Agent: a new due date for an open task, YYYY-MM-DD. */
      rescheduleTask: (id: string, dueDate: string) =>
        shown(() => put(rescheduleTask(find(id), String(dueDate ?? "")), "reschedule-task")),
      items: () => context.store.get().activities.map((item) => ({ value: item.id, label: item.subject })),
      // For a person only: not in `agent.actions`, so the bridge refuses a step that names it.
      /** Person only: take an entry out of the customer's history. */
      remove: (id: string, event?: Event) =>
        shown(() => {
          refuseDenied(context.options(), "remove");
          person("activity.remove");
          const activity = find(id);
          return commit(
            context.store.get().activities.filter((item) => item !== activity),
            "remove-activity",
            event,
          );
        }),
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state) => ({ "data-overdue": state.overdue.length ? "" : undefined }),
      state: (state) => ({
        timeline: state.timeline,
        openTasks: state.openTasks,
        overdue: state.overdue,
        issues: state.issues,
        people: state.people,
        refusal: state.refusal,
      }),
    }),
    // `value` is the task id.
    complete: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button" }),
      press: ({ api, key }, event) => {
        try {
          api.completeTask(String(key), event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    // `value` is the entry's `buttonKey`, e.g. "A-1#remove".
    remove: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({
        type: "button",
        "data-variant": "secondary",
        "data-agent-confirm": personOnly("Removing an entry from a customer's history needs a person"),
      }),
      press: ({ api, key }, event) => {
        try {
          api.remove(recordOf(key), event);
        } catch {
          /* shown in the control */
        }
      },
    }),
  }),
  agent: {
    actions: ["logActivity", "scheduleTask", "completeTask", "rescheduleTask"],
    items: (api) => api.items(),
  },
});
