import { closeBlockers, type CloseSummary, type CloseTask } from "@booki-aui/core/close";
import type { BookiChangeDetails } from "./change-details.js";
import { createParts } from "@ui-sdk/react/primitive";
import type { ReactNode } from "react";
import { useAccessFor } from "./access.js";
import { useWorkflowCopy } from "./workflow-copy.js";
import { useSay } from "./say.js";
import { closeChecklist } from "@booki-aui/primitives/close-checklist";

const parts = createParts(closeChecklist, {
  root: "div",
  complete: "button",
  signOff: "button",
  reopen: "button",
});
const CloseChecklistRoot = parts.Root;
const CloseChecklistComplete = parts.Complete;
const CloseChecklistSignOff = parts.SignOff;
const CloseChecklistReopen = parts.Reopen;

export type CloseChecklistProps = {
  tasks?: CloseTask[];
  defaultTasks?: CloseTask[];
  actor?: string;
  agentActor?: string;
  onTasksChange?: (tasks: CloseTask[], details: BookiChangeDetails) => void;
  nameOf?: (id: string) => ReactNode;
  className?: string;
  "aria-label"?: string;
};

type RootState = { tasks: CloseTask[]; refusal: string; summary: CloseSummary };

/** Composed checklist: every task, what it waits for, who did it, and its buttons. */
function CloseChecklist({
  tasks,
  defaultTasks,
  actor,
  agentActor,
  onTasksChange,
  nameOf = (id) => id,
  className,
  "aria-label": ariaLabel,
}: CloseChecklistProps) {
  const copy = useWorkflowCopy();
  const say = useSay();
  const access = useAccessFor({ signOff: "close.sign-off" }, actor);
  return (
    <CloseChecklistRoot
      tasks={tasks}
      defaultTasks={defaultTasks}
      actor={access.actor}
      denied={access.denied}
      agentActor={agentActor}
      onTasksChange={onTasksChange}
      className={className}
      aria-label={ariaLabel ?? copy.closeChecklist}
    >
      {(state: RootState) => (
        <>
          <p data-slot="close-checklist-status" role="status">
            {state.summary.readyToClose ? copy.readyToClose : copy.notReadyToClose}
            {" · "}
            {state.summary.total - state.summary.open}/{state.summary.total}
          </p>
          <ul data-slot="close-checklist-tasks">
            {state.tasks.map((task) => {
              const blockers = task.status === "open" ? closeBlockers(state.tasks, task.id) : [];
              return (
                <li key={task.id} data-status={task.status} data-blocked={blockers.length > 0 ? "" : undefined}>
                  <span data-slot="close-checklist-title">{task.title}</span>
                  <span data-slot="close-checklist-detail">
                    {task.status === "open"
                      ? blockers.length > 0
                        ? `${copy.waitsFor}: ${blockers.map((b) => b.title).join(", ")}`
                        : copy.open
                      : null}
                    {task.status !== "open" ? (
                      <>
                        {copy.done}
                        {task.doneBy ? (
                          <>
                            {" "}
                            {copy.doneBy} {nameOf(task.doneBy)}
                          </>
                        ) : null}
                        {task.status === "signed" ? (
                          <>
                            {" "}
                            · {copy.signed}
                            {task.signedBy ? (
                              <>
                                {" "}
                                {copy.doneBy} {nameOf(task.signedBy)}
                              </>
                            ) : null}
                          </>
                        ) : null}
                      </>
                    ) : null}
                  </span>
                  <span data-slot="close-checklist-actions">
                    {task.status === "open" ? (
                      <CloseChecklistComplete
                        value={task.id}
                        disabled={blockers.length > 0}
                        aria-label={`${copy.markDone}: ${task.title}`}
                      >
                        {copy.markDone}
                      </CloseChecklistComplete>
                    ) : null}
                    {task.status === "done" && task.needsSignOff ? (
                      <CloseChecklistSignOff value={task.id} aria-label={`${copy.signOff}: ${task.title}`}>
                        {copy.signOff}
                      </CloseChecklistSignOff>
                    ) : null}
                    {task.status !== "open" ? (
                      <CloseChecklistReopen value={task.id} aria-label={`${copy.reopen}: ${task.title}`}>
                        {copy.reopen}
                      </CloseChecklistReopen>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
          {state.refusal ? (
            <p data-slot="close-checklist-error" role="alert">
              {say(state.refusal)}
            </p>
          ) : null}
        </>
      )}
    </CloseChecklistRoot>
  );
}

export {
  CloseChecklist,
  CloseChecklistComplete,
  CloseChecklistReopen,
  CloseChecklistRoot,
  CloseChecklistSignOff,
  closeChecklist,
};
export type { CloseTask };
