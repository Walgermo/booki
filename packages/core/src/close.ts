import { BookiError, msg } from "./msg.js";

/**
 * - `open`: not done yet.
 * - `done`: the preparer says it is finished.
 * - `signed`: a second person has reviewed it.
 */
export type CloseTaskStatus = "open" | "done" | "signed";

/** One step in a period close: reconcile the bank, file VAT, post accruals. */
export type CloseTask = {
  id: string;
  title: string;
  status: CloseTaskStatus;
  /** Tasks that must be done before this one can be. */
  dependsOn?: string[];
  ownerId?: string;
  /** Who marked it done. */
  doneBy?: string;
  /** Who signed it off. Never the same person as `doneBy`. */
  signedBy?: string;
  /** True when the task needs a second person's sign-off before the close. */
  needsSignOff?: boolean;
};

export type CloseSummary = {
  total: number;
  open: number;
  done: number;
  signed: number;
  /** Tasks that can be worked on now: open, with every dependency finished. */
  ready: string[];
  /** Done tasks still waiting for a sign-off. */
  awaitingSignOff: string[];
  readyToClose: boolean;
};

const finished = (task: CloseTask) => task.status !== "open";

function find(tasks: CloseTask[], id: string): CloseTask {
  const task = tasks.find((item) => item.id === id);
  if (!task) {
    throw new BookiError("close.no-task", {
      id: String(id),
      tasks: tasks.map((item) => item.id).join(", ") || msg("word.none"),
    });
  }
  return task;
}

/** Throws when a dependency points at a missing task or the tasks form a loop. */
export function checkCloseTasks(tasks: CloseTask[]): void {
  const ids = new Set<string>();
  for (const task of tasks) {
    if (ids.has(task.id)) throw new BookiError("close.task-twice", { id: String(task.id) });
    ids.add(task.id);
  }
  for (const task of tasks) {
    for (const dep of task.dependsOn ?? []) {
      if (!ids.has(dep)) throw new BookiError("close.missing-dependency", { id: String(task.id), dep: String(dep) });
    }
  }
  const state = new Map<string, 1 | 2>();
  const visit = (id: string, path: string[]): void => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) {
      throw new BookiError("close.loop", { path: [...path, id].join(" → ") });
    }
    state.set(id, 1);
    for (const dep of find(tasks, id).dependsOn ?? []) visit(dep, [...path, id]);
    state.set(id, 2);
  };
  for (const task of tasks) visit(task.id, []);
}

/** Unfinished tasks that stand in the way of `id`. */
export function closeBlockers(tasks: CloseTask[], id: string): CloseTask[] {
  return (find(tasks, id).dependsOn ?? []).map((dep) => find(tasks, dep)).filter((dep) => !finished(dep));
}

const replace = (tasks: CloseTask[], next: CloseTask) => tasks.map((task) => (task.id === next.id ? next : task));

/** Mark a task done. Refused while a task it depends on is still open. */
export function completeCloseTask(tasks: CloseTask[], id: string, rawBy: string): CloseTask[] {
  const by = actorOf(rawBy);
  checkCloseTasks(tasks);
  const task = find(tasks, id);
  if (finished(task)) throw new BookiError("close.already-finished", { id: String(id), status: task.status });
  const blockers = closeBlockers(tasks, id);
  if (blockers.length > 0) {
    throw new BookiError("close.waits-for", {
      id: String(id),
      blockers: blockers.map((b) => `${b.id} (${b.title})`).join(", "),
    });
  }
  return replace(tasks, { ...task, status: "done", doneBy: by });
}

/** Who acted, trimmed: "alice " is alice, so she cannot sign her own work with a trailing space. */
function actorOf(by: unknown): string {
  const id = String(by ?? "").trim();
  if (id === "") throw new BookiError("close.no-actor", {});
  return id;
}

/** A second person signs a finished task off. The preparer cannot sign their own work. */
export function signOffCloseTask(tasks: CloseTask[], id: string, rawBy: string): CloseTask[] {
  const by = actorOf(rawBy);
  const task = find(tasks, id);
  if (task.status === "open") throw new BookiError("close.not-done", { id: String(id) });
  if (task.status === "signed")
    throw new BookiError("close.already-signed", { id: String(id), by: String(task.signedBy) });
  if (task.doneBy?.trim() === by) {
    throw new BookiError("close.doer-cannot-sign", { by: String(by), id: String(id) });
  }
  return replace(tasks, { ...task, status: "signed", signedBy: by });
}

/** Put a task back to open. Refused while a finished task depends on it. */
export function reopenCloseTask(tasks: CloseTask[], id: string): CloseTask[] {
  const task = find(tasks, id);
  const dependents = tasks.filter((item) => finished(item) && item.dependsOn?.includes(id));
  if (dependents.length > 0) {
    throw new BookiError("close.reopen-blocked", {
      id: String(id),
      dependents: dependents.map((d) => d.id).join(", "),
    });
  }
  const { doneBy: _doneBy, signedBy: _signedBy, ...rest } = task;
  return replace(tasks, { ...rest, status: "open" });
}

export function summarizeClose(tasks: CloseTask[]): CloseSummary {
  checkCloseTasks(tasks);
  const awaitingSignOff = tasks.filter((task) => task.status === "done" && task.needsSignOff).map((task) => task.id);
  const open = tasks.filter((task) => task.status === "open");
  return {
    total: tasks.length,
    open: open.length,
    done: tasks.filter((task) => task.status === "done").length,
    signed: tasks.filter((task) => task.status === "signed").length,
    ready: open.filter((task) => closeBlockers(tasks, task.id).length === 0).map((task) => task.id),
    awaitingSignOff,
    readyToClose: tasks.length > 0 && open.length === 0 && awaitingSignOff.length === 0,
  };
}

/** Throws unless every task is finished and every required sign-off is in. */
export function assertReadyToClose(tasks: CloseTask[]): CloseSummary {
  const summary = summarizeClose(tasks);
  if (!summary.readyToClose) {
    const counts = { open: summary.open, awaiting: summary.awaitingSignOff.length };
    if (summary.ready.length) {
      throw new BookiError("close.not-ready-with-ready", { ...counts, ready: summary.ready.join(", ") });
    }
    throw new BookiError("close.not-ready", counts);
  }
  return summary;
}
