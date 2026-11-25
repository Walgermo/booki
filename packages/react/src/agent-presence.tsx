import { stageChanges } from "@ui-sdk/react/history";
import { elementOf } from "@ui-sdk/react/observe";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AgentBridge } from "./booki-agent.js";
import { personOnly } from "@booki-aui/primitives/person-only";

/** The control an agent is working on right now. */
export type AgentActivity = {
  ref: string;
  component: string;
  key: string;
  label?: string;
};

export type AgentPresenceController = {
  /** Refs of controls an agent changed that no person has touched since. */
  marked: () => string[];
  /** A person has looked: clear every agent mark. */
  acknowledge: () => void;
  /** Follow which control the agent is on. `null` when it has moved on. */
  subscribe: (listener: (active: AgentActivity | null) => void) => () => void;
  detach: () => void;
};

const SET = "data-agent-set";
const PROPOSED = "data-agent-proposed";

/**
 * Make an agent's work visible in the DOM, without React.
 *
 * - While the agent changes a control, that control is the "active" one.
 * - A control the agent changed carries `data-agent-set` until a person edits
 *   it or calls `acknowledge()`. Style it however you like; `@booki-aui/styles`
 *   draws a fjord-blue line on its leading edge.
 */
export function attachAgentPresence(agent: AgentBridge, options: { linger?: number } = {}): AgentPresenceController {
  const linger = options.linger ?? 1400;
  const marked = new Set<string>();
  const listeners = new Set<(active: AgentActivity | null) => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const emit = (active: AgentActivity | null) => {
    for (const listener of listeners) listener(active);
  };

  const unsubscribe = agent.subscribe((change) => {
    const el = elementOf(change.ref);
    if (change.source === "agent") {
      el?.setAttribute(SET, "");
      marked.add(change.ref);
      emit({
        ref: change.ref,
        component: change.component,
        key: change.key,
        label: change.label,
      });
      clearTimeout(timer);
      timer = setTimeout(() => emit(null), linger);
    } else if (marked.delete(change.ref)) {
      // A person edited it: the value is theirs now.
      el?.removeAttribute(SET);
    }
  });

  return {
    marked: () => [...marked],
    acknowledge: () => {
      for (const ref of marked) elementOf(ref)?.removeAttribute(SET);
      marked.clear();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    detach: () => {
      clearTimeout(timer);
      unsubscribe();
      listeners.clear();
    },
  };
}

export type AgentPresenceProps = {
  agent: AgentBridge;
  /** Text on the marker. */
  label?: ReactNode;
  /** How long the marker stays after the agent's last change, in ms. */
  linger?: number;
  /** Called with the controller, for an "acknowledge" button of your own. */
  onController?: (controller: AgentPresenceController | null) => void;
};

/**
 * A small marker that sits on whichever control the agent is changing, and
 * the attribution marks from `attachAgentPresence`. Render it once.
 */
export function AgentPresence({ agent, label = "Agent", linger, onController }: AgentPresenceProps) {
  const [active, setActive] = useState<AgentActivity | null>(null);
  const [box, setBox] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const controller = attachAgentPresence(agent, { linger });
    onController?.(controller);
    const stop = controller.subscribe((next) => {
      setActive(next);
      if (!next) return;
      const rect = elementOf(next.ref)?.getBoundingClientRect();
      if (rect) setBox({ x: rect.left, y: rect.top });
    });
    return () => {
      stop();
      controller.detach();
      onController?.(null);
    };
    // The controller belongs to this agent and linger; onController is a callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent, linger]);

  return (
    <div
      data-slot="agent-presence"
      data-active={active ? "true" : "false"}
      role="status"
      aria-live="polite"
      style={box ? { transform: `translate(${box.x}px, ${box.y}px)` } : undefined}
    >
      <span data-slot="agent-presence-dot" aria-hidden />
      {label}
      {active?.label ? <span data-slot="agent-presence-target"> · {active.label}</span> : null}
    </div>
  );
}

type Staged = Awaited<ReturnType<typeof stageChanges>>;
export type ProposedChange = Staged["applied"][number];

/** Marks the controls of a proposal on or off. Reads the DOM only, so it lives outside the hook. */
function mark(changes: readonly ProposedChange[], on: boolean) {
  for (const change of changes) {
    const el = elementOf(change.ref);
    if (on) el?.setAttribute(PROPOSED, "");
    else el?.removeAttribute(PROPOSED);
    // A proposal is not yet "set by the agent"; that mark comes on keep.
    if (on) el?.removeAttribute(SET);
  }
}

/**
 * Put an agent's suggestion on the real controls as a proposal a person can
 * keep or revert. While it is pending, each proposed control carries
 * `data-agent-proposed` so it can look different from a committed value.
 */
export function useAgentProposal(agent: AgentBridge) {
  const [applied, setApplied] = useState<readonly ProposedChange[]>([]);
  const staged = useRef<Staged | null>(null);

  const settle = useCallback(() => {
    mark(staged.current?.applied ?? [], false);
    staged.current = null;
    setApplied([]);
  }, []);

  const propose = useCallback(
    async (changes: Parameters<typeof stageChanges>[1]) => {
      // One proposal at a time: put the previous one back first.
      if (staged.current) {
        mark(staged.current.applied, false);
        await staged.current.revert();
      }
      const next = await stageChanges(agent, changes);
      staged.current = next;
      mark(next.applied, true);
      setApplied(next.applied);
      return next;
    },
    [agent],
  );

  /** The person accepts: values stay, the proposal marks go. */
  const keep = useCallback(() => settle(), [settle]);

  /** The person declines: every control goes back to what it was. */
  const revert = useCallback(async () => {
    const current = staged.current;
    settle();
    return current ? current.revert() : [];
  }, [settle]);

  // Leaving the screen with a proposal pending: drop the marks.
  useEffect(() => () => mark(staged.current?.applied ?? [], false), []);

  return useMemo(
    () => ({ applied, pending: applied.length > 0, propose, keep, revert }),
    [applied, propose, keep, revert],
  );
}

export type AgentProposalProps = {
  /** From `useAgentProposal(agent).applied`. Renders nothing when empty. */
  applied: readonly ProposedChange[];
  onKeep: () => void;
  onRevert: () => void;
  title?: ReactNode;
  keepLabel?: ReactNode;
  revertLabel?: ReactNode;
  /** Name a changed control. Defaults to its ref. */
  describe?: (change: ProposedChange) => ReactNode;
  /** Show a value. Defaults to `String(value)`. */
  format?: (value: unknown, change: ProposedChange) => ReactNode;
  className?: string;
};

/**
 * The notice that goes with a pending proposal: what would change, from what
 * to what, and Keep / Revert. Both buttons are marked for a person, so an
 * agent cannot accept its own suggestion.
 */
export function AgentProposal({
  applied,
  onKeep,
  onRevert,
  title = "The agent proposes",
  keepLabel = "Keep",
  revertLabel = "Revert",
  describe = (change) => change.ref,
  format = (value) => String(value),
  className,
}: AgentProposalProps) {
  if (applied.length === 0) return null;
  return (
    <section data-slot="agent-proposal" className={className}>
      <p data-slot="agent-proposal-title">{title}</p>
      <ul data-slot="agent-proposal-changes">
        {applied.map((change) => (
          <li key={`${change.ref}-${change.key}`}>
            <span data-slot="agent-proposal-target">{describe(change)}</span>
            <span data-slot="agent-proposal-before">{format(change.before, change)}</span>
            <span aria-hidden>→</span>
            <span data-slot="agent-proposal-after">{format(change.value, change)}</span>
          </li>
        ))}
      </ul>
      <div data-slot="agent-proposal-actions">
        <button type="button" data-agent-confirm={personOnly("Keeping a proposal needs a person")} onClick={onKeep}>
          {keepLabel}
        </button>
        <button
          type="button"
          data-variant="secondary"
          data-agent-confirm={personOnly("Reverting a proposal needs a person")}
          onClick={onRevert}
        >
          {revertLabel}
        </button>
      </div>
    </section>
  );
}
