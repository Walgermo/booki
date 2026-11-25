"use client";

import { localize } from "@booki/core/messages";
import { useState } from "react";
import { asAgentWork, pageAgent } from "@/lib/agent";
import { nameOf } from "@/lib/people";
import { TASKS, runTask, type Report, type TaskId } from "@/lib/tasks";

/**
 * The agent's side of the page: common sales tasks, each a button. The agent
 * works for the person signed in, with its own credential, and stops where a
 * person's decision begins.
 */
export function AgentPanel({ me, dealId }: { me: string; dealId: string }) {
  const [running, setRunning] = useState<TaskId | null>(null);
  const [report, setReport] = useState<{ task: TaskId; report: Report } | null>(null);
  // The agent reads Booki's refusals in English; the person reads them in Norwegian.
  const line = (text: string) => {
    const split = text.indexOf(": ");
    return split < 0 ? localize(text, "nb") : `${text.slice(0, split)}: ${localize(text.slice(split + 2), "nb")}`;
  };

  const run = async (task: TaskId) => {
    setRunning(task);
    try {
      setReport({ task, report: await asAgentWork(() => runTask(pageAgent(), task, { dealId, me })) });
    } finally {
      setRunning(null);
    }
  };

  return (
    <section
      data-booki=""
      aria-labelledby="agent"
      className="grid content-start gap-3 rounded-lg border border-[color:var(--bk-border)] p-4"
    >
      <h2 id="agent" className="text-lg font-semibold">
        Agenten
      </h2>
      <p className="text-sm text-[color:var(--bk-muted-fg)]">
        Jobber for {nameOf(me)}, med sin egen nøkkel. Den logger, planlegger, verdsetter og flytter; å lukke en avtale
        og å fjerne historikk er personens.
      </p>
      <ul className="grid gap-2">
        {TASKS.map((task) => (
          <li key={task.id} className="grid gap-1">
            <button
              type="button"
              onClick={() => void run(task.id)}
              disabled={running !== null}
              aria-busy={running === task.id}
            >
              {running === task.id ? "Agenten jobber …" : task.title}
            </button>
            <span className="text-xs text-[color:var(--bk-muted-fg)]">«{task.ask}»</span>
          </li>
        ))}
      </ul>
      <div aria-live="polite" className="grid gap-2 text-sm">
        {report ? (
          <>
            {report.report.did.length > 0 ? (
              <div>
                <h3 className="font-medium">Gjorde</h3>
                <ul className="list-disc pl-5">
                  {report.report.did.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {report.report.waiting.length > 0 ? (
              <div>
                <h3 className="font-medium">Venter på en person</h3>
                <ul className="list-disc pl-5">
                  {report.report.waiting.map((text) => (
                    <li key={text}>{line(text)}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </section>
  );
}
