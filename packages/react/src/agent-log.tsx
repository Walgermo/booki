import { msg } from "@booki-aui/core/msg";
import { elementOf } from "@ui-sdk/react/observe";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { reportsCalls, watchCalls, type AgentCallEvent, type AgentCallStep } from "./agent-calls.js";
import { attachAudit, type AgentBridge } from "./booki-agent.js";
import { useSay } from "./say.js";

/** Where a call stands: running, waiting for a person's answer, done, or refused. */
export type AgentLogStatus = "running" | "waiting" | "done" | "refused";

/** One step an agent took, as `AgentLog` shows it. */
export type AgentLogRow = {
  id: string;
  /** What was called, short: `Total · setMinor(312500)`. A secret control's arguments read `[redacted]`. */
  call: string;
  status: AgentLogStatus;
  /** The answer: the refusal, what a person is asked to confirm, or the step's own sentence (`Pressed "Post".`). */
  detail?: string;
};

export type UseAgentLogOptions = {
  /** Keep the newest rows only. Default 200. */
  limit?: number;
};

type Entry = { ref: string; component: string; label?: string; [key: string]: unknown };

const SECRET_INPUT = /\b(password|current-password|new-password|one-time-code|cc-[a-z-]+)\b/i;

/**
 * True when the bridge keeps this control's value from the agent: it, or a part
 * of it, carries `data-agent-secret`, it is a password, card or one-time-code
 * field, or the snapshot already shows `[redacted]`. Its arguments are then
 * never shown in the log either.
 */
function isSecret(entry: Entry | undefined): boolean {
  if (!entry) return false;
  if (JSON.stringify(entry).includes('"[redacted]"')) return true;
  const root = elementOf(entry.ref);
  if (!root) return false;
  if (root.closest("[data-agent-secret]") || root.querySelector("[data-agent-secret]")) return true;
  for (const input of [root, ...root.querySelectorAll("input")]) {
    if (!(input instanceof HTMLInputElement)) continue;
    if (input.type === "password" || SECRET_INPUT.test(input.autocomplete ?? "")) return true;
  }
  return false;
}

/** The control a step names: by its ref, its label, or its component, as the bridge reads a step. */
function entryFor(agent: AgentBridge, ref: string): Entry | undefined {
  let entries: Entry[];
  try {
    entries = agent.snapshot() as unknown as Entry[];
  } catch {
    return undefined;
  }
  return (
    entries.find((entry) => entry.ref === ref) ??
    entries.find((entry) => entry.label === ref) ??
    entries.find((entry) => entry.component === ref)
  );
}

function short(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function callText(step: AgentCallStep, entry: Entry | undefined): string {
  const name = entry?.label ?? entry?.component ?? step.ref;
  const args = isSecret(entry)
    ? (step.args ?? []).map(() => '"[redacted]"').join(", ")
    : (step.args ?? []).map((arg) => JSON.stringify(arg) ?? "undefined").join(", ");
  return `${short(name, 48)} · ${step.action}(${short(args, 60)})`;
}

type Tracked = AgentLogRow & { call_: number; ref?: string };

/**
 * The live list behind `AgentLog`: each step an agent made with
 * `createBookiAgent` takes and what came of it, newest last. Use it to show the
 * rows your own way, or to pass them to `<AgentLog rows>`. An agent from plain
 * `createAgent` reports only its changes (through `attachAudit`), each as done.
 */
export function useAgentLog(agent: AgentBridge | undefined, options: UseAgentLogOptions = {}) {
  const limit = Math.max(1, options.limit ?? 200);
  const [rows, setRows] = useState<Tracked[]>([]);

  useEffect(() => {
    if (!agent) return;
    const keep = (next: Tracked[]) => (next.length > limit ? next.slice(next.length - limit) : next);

    if (!reportsCalls(agent)) {
      let seq = 0;
      return attachAudit(agent, (event) => {
        seq += 1;
        const row: Tracked = {
          id: `change-${seq}`,
          call_: 0,
          call: `${short(event.target, 48)} · ${event.action}`,
          status: "done",
          detail: event.detail,
        };
        setRows((all) => keep([...all, row]));
      });
    }

    return watchCalls(agent, (event: AgentCallEvent) => {
      if (event.type === "start") {
        const added: Tracked[] = event.steps.length
          ? event.steps.map((step, index) => {
              const entry = entryFor(agent, step.ref);
              return {
                id: `${event.id}-${index}`,
                call_: event.id,
                ref: entry?.ref,
                call: callText(step, entry),
                status: "running",
              };
            })
          : [{ id: `${event.id}-0`, call_: event.id, call: "act()", status: "running" }];
        setRows((all) => keep([...all, ...added]));
        return;
      }
      if (event.type === "waiting") {
        setRows((all) => {
          const mine = all.filter((row) => row.call_ === event.id && row.status === "running");
          const row = mine.find((item) => item.ref === event.ref) ?? mine[0];
          if (!row) return all;
          return all.map((item) =>
            item === row ? { ...item, status: "waiting" as const, detail: event.confirm } : item,
          );
        });
        return;
      }
      const { result } = event;
      setRows((all) => {
        const failed = result.ok ? undefined : (result.error?.step ?? 0);
        const out: Tracked[] = [];
        let index = 0;
        for (const row of all) {
          if (row.call_ !== event.id) {
            out.push(row);
            continue;
          }
          const at = index;
          index += 1;
          // Steps after a refused one never ran: the bridge stops the call there.
          if (failed !== undefined && at > failed) continue;
          if (failed !== undefined && at === failed) {
            out.push({ ...row, status: "refused", detail: result.error?.message });
            continue;
          }
          const said = (result.steps?.[at] as { result?: unknown } | undefined)?.result;
          out.push({
            ...row,
            status: "done",
            detail: typeof said === "string" && said !== "pending" ? said : undefined,
          });
        }
        return out;
      });
    });
  }, [agent, limit]);

  const clear = useCallback(() => setRows([]), []);
  const shown = useMemo(() => rows.map(({ call_: _call, ref: _ref, ...row }): AgentLogRow => row), [rows]);
  return { rows: shown, clear };
}

export type AgentLogProps = {
  /** An agent from `createBookiAgent`: every call it makes is listed as it happens. */
  agent?: AgentBridge;
  /** The rows to show, for a list you keep yourself (from `useAgentLog`, a server, a replay). Used instead of `agent`. */
  rows?: readonly AgentLogRow[];
  /** The tallest the list grows before it scrolls, as CSS (`"16rem"`) or pixels. Default `"16rem"`. */
  maxHeight?: string | number;
  /** The line above the list. Default "Agent calls". `null` leaves it out. */
  heading?: ReactNode;
  /** What an empty list says. Default: what will appear here. */
  emptyLabel?: string;
  /** Keep the newest rows only, when it follows `agent`. Default 200. */
  limit?: number;
  className?: string;
};

/**
 * A live list of what an agent did on the page: each call (which control,
 * which action, its arguments) and what came of it: done, refused with the
 * reason, or waiting for a person. Newest at the bottom; it follows new rows
 * unless the person has scrolled up to read. Read-only: an agent finds nothing
 * to read or call on it.
 */
export function AgentLog({
  agent,
  rows: given,
  maxHeight = "16rem",
  heading,
  emptyLabel,
  limit,
  className,
}: AgentLogProps) {
  const say = useSay();
  const followed = useAgentLog(given ? undefined : agent, { limit });
  const rows = given ?? followed.rows;
  const box = useRef<HTMLDivElement | null>(null);
  // Follows the newest row until the person scrolls up, and again once they are back at the bottom.
  const stick = useRef(true);

  // After every render: a new row or a longer answer keeps the bottom in view while it sticks.
  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  });

  const refused = rows.filter((row) => row.status === "refused").length;
  const title = heading === undefined ? say(msg("agent-log.heading")) : heading;
  const tag: Record<AgentLogStatus, string> = {
    running: say(msg("agent-log.running")),
    waiting: say(msg("agent-log.waiting")),
    done: say(msg("word.done")),
    refused: say(msg("agent-log.refused")),
  };
  const style: CSSProperties = {
    maxHeight: typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight,
    overflowY: "auto",
  };

  return (
    <section
      data-slot="agent-log"
      data-agent-hidden=""
      className={className}
      aria-label={typeof title === "string" ? title : undefined}
    >
      {title !== null ? (
        <p data-slot="agent-log-heading">
          {title}
          {refused > 0 ? (
            <span data-slot="agent-log-count"> · {say(msg("agent-log.refused-count", { count: refused }))}</span>
          ) : null}
        </p>
      ) : null}
      <div
        ref={box}
        data-slot="agent-log-scroll"
        role="log"
        aria-live="polite"
        style={style}
        onScroll={(event) => {
          const el = event.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
      >
        {rows.length === 0 ? (
          <p data-slot="agent-log-empty">{emptyLabel ?? say(msg("agent-log.empty"))}</p>
        ) : (
          <ol data-slot="agent-log-rows">
            {rows.map((row) => (
              <li key={row.id} data-slot="agent-log-row" data-status={row.status}>
                <code data-slot="agent-log-call">{row.call}</code>
                <span data-slot="agent-log-tag" data-status={row.status}>
                  {tag[row.status]}
                </span>
                {row.detail ? <span data-slot="agent-log-detail">{say(row.detail)}</span> : null}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
