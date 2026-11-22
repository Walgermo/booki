import {
  assertReadyToClose,
  completeCloseTask,
  reopenCloseTask,
  signOffCloseTask,
  summarizeClose,
  type CloseTask,
} from "@booki/core/close";
import { createChange, definePrimitive } from "@ui-sdk/core";
import { refuseDenied } from "./access.js";

export type Options = {
  tasks?: CloseTask[];
  defaultTasks?: CloseTask[];
  /** Id of the person at the keyboard. */
  actor?: string;
  /** A person's methods their role does not allow, each with the reason. Set by `BookiAccessProvider`. */
  denied?: Record<string, string>;
  /** What an agent's work is recorded as. Defaults to "agent". */
  agentActor?: string;
  onTasksChange?: (tasks: CloseTask[], details: { reason: string; source?: string; cancel?: () => void }) => void;
};

export function derive(tasks: CloseTask[]) {
  const summary = summarizeClose(tasks);
  return {
    ready: summary.ready,
    awaitingSignOff: summary.awaitingSignOff,
    readyToClose: summary.readyToClose,
  };
}

/**
 * A period-close checklist an agent can work through. It may mark a task done
 * once the tasks before it are done, and ask `assertReadyToClose`. Its work is
 * recorded as the agent's, so a sign-off always comes from a person: signing
 * off and reopening are a person's buttons, not agent actions.
 */
export const closeChecklist = definePrimitive({
  name: "close-checklist",
  options: {
    tasks: "value",
    defaultTasks: "value",
    actor: "value",
    denied: "value",
    agentActor: "value",
    onTasksChange: "callback",
  },
  controlled: ["tasks", "ready", "awaitingSignOff", "readyToClose"],
  state: (options: Options) => {
    const tasks = options.tasks ?? options.defaultTasks ?? [];
    return { tasks, refusal: "", ...derive(tasks) };
  },
  sync: (options: Options) => (options.tasks === undefined ? {} : { tasks: options.tasks, ...derive(options.tasks) }),
  api: (context) => {
    const change = createChange(context);
    const commit = (next: CloseTask[], reason: string, event?: Event) => {
      const ok = change("tasks", next, { reason, event });
      if (ok) context.store.set({ refusal: "", ...derive(next) });
      return ok;
    };
    const person = () => {
      const actor = String(context.options().actor ?? "").trim();
      if (actor === "") throw new Error("Nobody is signed in. Pass `actor` with the person's id.");
      return actor;
    };
    const shown = <T>(run: () => T): T => {
      try {
        return run();
      } catch (error) {
        context.store.set({ refusal: (error as Error).message });
        throw error;
      }
    };
    return {
      /** Agent: mark a task done. Recorded as the agent's work. */
      completeTask: (id: string) =>
        commit(
          completeCloseTask(context.store.get().tasks, String(id), context.options().agentActor ?? "agent"),
          "complete-task",
        ),
      /** Person only. */
      completeByPerson: (id: string, event?: Event) =>
        shown(() => commit(completeCloseTask(context.store.get().tasks, id, person()), "complete-task", event)),
      /** Person only. The person who did the task cannot sign it off. */
      signOff: (id: string, event?: Event) =>
        shown(() => {
          refuseDenied(context.options(), "signOff");
          return commit(signOffCloseTask(context.store.get().tasks, id, person()), "sign-off", event);
        }),
      /** Person only. */
      reopen: (id: string, event?: Event) =>
        shown(() => commit(reopenCloseTask(context.store.get().tasks, id), "reopen-task", event)),
      /** Agent: throws while a task is open or a sign-off is missing. */
      assertReadyToClose: () => assertReadyToClose(context.store.get().tasks),
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state) => ({ "data-ready": state.readyToClose ? "" : undefined }),
      state: (state) => ({ tasks: state.tasks, refusal: state.refusal, summary: summarizeClose(state.tasks) }),
    }),
    complete: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button" }),
      press: ({ api, key }, event) => {
        try {
          api.completeByPerson(String(key), event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    signOff: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button" }),
      press: ({ api, key }, event) => {
        try {
          api.signOff(String(key), event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    reopen: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button", "data-variant": "secondary" }),
      press: ({ api, key }, event) => {
        try {
          api.reopen(String(key), event);
        } catch {
          /* shown in the control */
        }
      },
    }),
  }),
  agent: { actions: ["completeTask", "assertReadyToClose"] },
});
