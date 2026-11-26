import { msg } from "@booki-aui/core/msg";
import { elementOf } from "@ui-sdk/react/observe";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import type { AgentBridge } from "./booki-agent.js";
import { useSay } from "./say.js";

/** One control as the agent's snapshot shows it. */
export type AgentSnapshotEntry = {
  ref: string;
  component: string;
  label?: string;
  actions?: string[];
  confirm?: string;
  offPage?: boolean;
  [key: string]: unknown;
};

export type AgentSnapshotProps = {
  /** The agent whose snapshot is shown, from `createBookiAgent`. */
  agent: AgentBridge;
  /** The part of the page to show: only controls inside this element. Default: the whole page. */
  scope?: RefObject<HTMLElement | null>;
  /** The tallest it grows before it scrolls, as CSS (`"24rem"`) or pixels. Default `"24rem"`. */
  maxHeight?: string | number;
  /** The line above the list. Default "What the agent reads". `null` leaves it out. */
  heading?: ReactNode;
  /** What it says when no control in scope is in the snapshot. */
  emptyLabel?: string;
  className?: string;
};

/** Keys that name the control rather than hold its state. */
const IDENTITY = new Set(["ref", "component", "label", "actions", "confirm", "offPage"]);

/** The control's state as the snapshot has it: values the bridge redacts stay `"[redacted]"`. */
function stateOf(entry: AgentSnapshotEntry): string {
  const state: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entry)) {
    if (!IDENTITY.has(key)) state[key] = value;
  }
  return JSON.stringify(state, null, 2);
}

/** In the order the bridge first saw them (c1, c2, …), so a control that appears later joins at the end. */
const order = (entry: AgentSnapshotEntry) => Number(entry.ref.replace(/\D/g, "")) || 0;

/**
 * `scope` is `undefined` for the whole page. A scope given but not on the page
 * (its ref empty, or its element detached) shows nothing, never the whole page.
 */
function read(agent: AgentBridge, scope: HTMLElement | null | undefined, own: HTMLElement | null) {
  if (scope === null || (scope && !scope.isConnected)) return [];
  let entries: AgentSnapshotEntry[];
  try {
    entries = agent.snapshot() as unknown as AgentSnapshotEntry[];
  } catch {
    return [];
  }
  return entries
    .filter((entry) => {
      if (entry.offPage) return false;
      const element = elementOf(entry.ref);
      if (!element) return false;
      if (own?.contains(element)) return false;
      return scope ? scope.contains(element) : true;
    })
    .sort((a, b) => order(a) - order(b));
}

/**
 * What the agent reads for a part of the page: for each control inside
 * `scope`, its label, the actions it may call and its state as JSON. It shows
 * the bridge's own snapshot, so a value the bridge redacts (a secret field, a
 * bank account) reads `"[redacted]"` here too. It updates as the controls
 * change. Read-only: an agent finds nothing to read or call on it.
 */
export function AgentSnapshot({
  agent,
  scope,
  maxHeight = "24rem",
  heading,
  emptyLabel,
  className,
}: AgentSnapshotProps) {
  const say = useSay();
  const root = useRef<HTMLElement | null>(null);
  const [entries, setEntries] = useState<AgentSnapshotEntry[]>([]);

  useEffect(() => {
    let last = "";
    const update = () => {
      const next = read(agent, scope ? scope.current : undefined, root.current);
      const key = JSON.stringify(next);
      if (key === last) return;
      last = key;
      setEntries(next);
    };
    // Read after the bridge has finished notifying, never inside a change; and after
    // the controls in scope have mounted, which may be after this effect runs.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const later = () => {
      if (timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        update();
      }, 0);
    };
    later();
    const unsubscribe = agent.subscribe(later);
    // A control that mounts or leaves, or a scope that is replaced or removed, reports no change:
    // watch the whole document for it (the scope is read again each time), but not this list itself.
    // Attributes too, for a confirm sentence or a name that changes on a control already there.
    const target = typeof document !== "undefined" ? document.body : null;
    const observer =
      target && typeof MutationObserver !== "undefined"
        ? new MutationObserver((records) => {
            if (records.some((record) => !root.current?.contains(record.target))) later();
          })
        : null;
    if (target) {
      observer?.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: [
          "data-agent-confirm",
          "data-agent-secret",
          "data-agent-hidden",
          "aria-label",
          "aria-labelledby",
          "disabled",
          "aria-disabled",
          "aria-readonly",
        ],
      });
    }
    return () => {
      clearTimeout(timer);
      unsubscribe();
      observer?.disconnect();
    };
  }, [agent, scope]);

  const title = heading === undefined ? say(msg("agent-snapshot.heading")) : heading;
  const style: CSSProperties = {
    maxHeight: typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight,
    overflowY: "auto",
  };

  return (
    <section
      ref={root}
      data-slot="agent-snapshot"
      data-agent-hidden=""
      className={className}
      aria-label={typeof title === "string" ? title : undefined}
    >
      {title !== null ? <p data-slot="agent-snapshot-heading">{title}</p> : null}
      <div data-slot="agent-snapshot-scroll" style={style}>
        {entries.length === 0 ? (
          <p data-slot="agent-snapshot-empty">{emptyLabel ?? say(msg("agent-snapshot.empty"))}</p>
        ) : (
          <ul data-slot="agent-snapshot-entries">
            {entries.map((entry) => (
              <li key={entry.ref} data-slot="agent-snapshot-entry">
                <p data-slot="agent-snapshot-label">{entry.label ?? entry.ref}</p>
                {entry.actions && entry.actions.length > 0 ? (
                  <p data-slot="agent-snapshot-actions">{entry.actions.join(" · ")}</p>
                ) : (
                  <p data-slot="agent-snapshot-actions" data-empty="">
                    {say(msg("agent-snapshot.no-actions"))}
                  </p>
                )}
                {entry.confirm ? (
                  <p data-slot="agent-snapshot-confirm">
                    {say(msg("agent-snapshot.confirm", { confirm: entry.confirm }))}
                  </p>
                ) : null}
                <pre data-slot="agent-snapshot-state">{stateOf(entry)}</pre>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
