import { agentStatusLabel, type AgentStatusState } from "@booki-aui/core/msg/agent-status";
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { useBookiLocaleOptional } from "./locale.js";

export type { AgentStatusState };

export type AgentStatusProps = Omit<ComponentProps<"span">, "children" | "role"> & {
  /** What the agent is doing now. */
  state: AgentStatusState;
  /**
   * The words a person reads and a screen reader announces. Default: from the
   * catalogue in the person's language ("agent working", "waiting for a person"…).
   */
  label?: ReactNode;
};

// The geometry of the icons in @booki-aui/icons (agent-idle, agent-working, …),
// inlined so this package needs no icon package. agent-status.test.tsx keeps
// them equal to the drawings.
const CURSOR =
  "M9.75 8.25L13.689 12.189A1.5 1.5 0 0 1 12.629 14.75L8.371 14.75A1.5 1.5 0 0 0 7.311 15.189L5.811 16.689A1.5 1.5 0 0 1 3.25 15.629L3.25 5.371A1.5 1.5 0 0 1 5.811 4.311Z";

const BADGE: Record<AgentStatusState, ReactNode> = {
  idle: <circle cx="19" cy="19" r="3.25" />,
  working: <path d="M19 15.75A3.25 3.25 0 1 1 15.75 19" />,
  waiting: (
    <>
      <path d="M17.25 15.75v6.5" />
      <path d="M20.75 15.75v6.5" />
    </>
  ),
  done: <path d="M15.75 19.25l2 2 4.5-4.5" pathLength={1} />,
  refused: (
    <>
      <circle cx="19" cy="19" r="3.25" />
      <path d="M16.75 16.75l4.5 4.5" />
    </>
  ),
};

function StatusIcon({ state }: { state: AgentStatusState }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={CURSOR} fill="currentColor" stroke="none" opacity="0.2" />
      <path d={CURSOR} />
      <g data-slot="agent-status-badge">{BADGE[state]}</g>
    </svg>
  );
}

export type SpinnerProps = Omit<ComponentProps<"svg">, "children"> & {
  /** Pixels. The icons are drawn for 16 and 20. Default 16. */
  size?: 16 | 20;
};

/**
 * A ring that turns while something is under way, from the `spinner` icon. It is
 * decoration (`aria-hidden`): the words beside it, or a busy control's own state,
 * say what is happening. `@booki-aui/styles` turns it at 0.9 s per turn and holds
 * it still for people who ask for reduced motion; still, it reads as a whole ring.
 */
export function Spinner({ size = 16, ...props }: SpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
      data-slot="spinner"
    >
      <path
        d="M12 2A10 10 0 1 1 12 22A10 10 0 1 1 12 2ZM12 3.5A8.5 8.5 0 1 0 12 20.5A8.5 8.5 0 1 0 12 3.5Z"
        fill="currentColor"
        stroke="none"
        opacity="0.2"
      />
      <path d="M12 2.75A9.25 9.25 0 0 1 21.25 12" />
    </svg>
  );
}

/** How long the outgoing icon stays for its fade, in ms (the stylesheet's 150 ms, plus a frame). */
const LEAVE_MS = 170;

/**
 * A short line telling a person what an agent is doing: idle, working, waiting
 * for a person, done or refused. It is for people: `role="status"` announces a
 * change politely, the icon is hidden and the words carry the meaning, and
 * `data-agent-hidden` keeps it out of the agent's snapshot (the agent knows its
 * own state). Style it as `[data-slot="agent-status"][data-state="…"]`.
 *
 * Motion (with `@booki-aui/styles`) plays only when the state changes, never on
 * first render: the icons cross-fade, the check draws in once on `done`, the
 * badge turns while `working` and breathes while `waiting`.
 */
export function AgentStatus({ state, label, className, ...props }: AgentStatusProps) {
  const { profile } = useBookiLocaleOptional();
  const language = profile.locale.toLowerCase().startsWith("nb") ? "nb" : "en";

  // Adjusted during render, so the first paint already knows whether this is a change.
  const [shown, setShown] = useState(state);
  const [leaving, setLeaving] = useState<AgentStatusState | null>(null);
  const [changed, setChanged] = useState(false);
  if (shown !== state) {
    setLeaving(shown);
    setShown(state);
    setChanged(true);
  }

  useEffect(() => {
    if (leaving === null) return;
    const timer = setTimeout(() => setLeaving(null), LEAVE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  return (
    <span
      {...props}
      className={className}
      role="status"
      aria-live="polite"
      data-slot="agent-status"
      data-state={state}
      data-changed={changed ? "" : undefined}
      data-agent-hidden=""
    >
      <span data-slot="agent-status-icons" aria-hidden="true">
        {leaving !== null && leaving !== state ? (
          <span key={`out-${leaving}`} data-slot="agent-status-icon" data-state={leaving} data-leaving="">
            <StatusIcon state={leaving} />
          </span>
        ) : null}
        <span key={state} data-slot="agent-status-icon" data-state={state}>
          <StatusIcon state={state} />
        </span>
      </span>
      <span data-slot="agent-status-label">{label ?? agentStatusLabel(language, state)}</span>
    </span>
  );
}
