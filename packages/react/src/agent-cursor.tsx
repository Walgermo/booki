import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { cursorLabelRoom, type AgentCursorController, type AgentCursorState } from "@booki/primitives/agent-cursor";
import { useBookiLocaleOptional } from "./locale.js";
import { narrateNorwegian } from "./narrate-nb.js";

export {
  createAgentCursor,
  type AgentCursorController,
  type AgentCursorOptions,
  type AgentCursorPhase,
  type AgentCursorState,
  type AgentCursorStep,
} from "@booki/primitives/agent-cursor";
export { narrateNorwegian } from "./narrate-nb.js";

export type AgentCursorProps = {
  cursor: AgentCursorController;
  /** Who is working: shown on the label. */
  label?: ReactNode;
  /**
   * Show what the agent does next to its name. Default true: in Norwegian under
   * a Norwegian profile (`BookiLocaleProvider`), otherwise plain English from the
   * action's name. Pass a function to narrate in your own words or language:
   * `(state) => "setter beløp"`.
   */
  narrate?: boolean | ((state: AgentCursorState) => ReactNode);
};

/**
 * The overlay for `createAgentCursor`: a pointer, a ring on the control and a
 * label saying what the agent does. Render it once, near the root. It is
 * decoration for people watching; `AgentPresence` announces changes to
 * screen readers, so this stays out of the accessibility tree.
 */
export function AgentCursor({ cursor, label = "Agent", narrate = true }: AgentCursorProps) {
  // The previous phase rides with the state, so "first appearance" is known at render.
  const [view, setView] = useState(() => ({ state: cursor.state(), previous: "idle" as AgentCursorState["phase"] }));
  useEffect(() => cursor.subscribe((next) => setView((now) => ({ state: next, previous: now.state.phase }))), [cursor]);
  const { state } = view;
  const { profile } = useBookiLocaleOptional();
  const say =
    typeof narrate === "function"
      ? narrate
      : profile.locale.toLowerCase().startsWith("nb")
        ? narrateNorwegian
        : (now: AgentCursorState) => now.action;

  // The first appearance jumps; after that the pointer glides between controls.
  const first = state.phase !== "idle" && view.previous === "idle";

  const { box, point } = state;
  // Near the right edge the label goes left of the pointer, and it never runs out of the window.
  const fit = point && typeof window !== "undefined" ? cursorLabelRoom(point.x, window.innerWidth) : undefined;
  return (
    <div
      data-slot="agent-cursor"
      data-phase={state.phase}
      data-first={first ? "" : undefined}
      data-follow={state.follow ? "" : undefined}
      aria-hidden="true"
    >
      {box ? (
        <span
          data-slot="agent-cursor-ring"
          style={{
            transform: `translate(${box.x - 4}px, ${box.y - 4}px)`,
            width: box.width + 8,
            height: box.height + 8,
          }}
        />
      ) : null}
      {point ? (
        <span
          data-slot="agent-cursor-pointer"
          data-flip={fit?.flip ? "" : undefined}
          style={
            {
              transform: `translate(${point.x}px, ${point.y}px)`,
              "--agent-cursor-room": fit ? `${fit.room}px` : undefined,
            } as CSSProperties
          }
        >
          <svg data-slot="agent-cursor-arrow" viewBox="0 0 20 22" width="20" height="22">
            <path d="M2 1.5 L2 18.5 L6.6 14.3 L9.6 20.6 L12.6 19.2 L9.7 13.1 L16 12.6 Z" />
          </svg>
          <span data-slot="agent-cursor-ripple" />
          <span data-slot="agent-cursor-label">
            {label}
            {narrate && state.action ? (
              <span data-slot="agent-cursor-action">
                {" · "}
                {say(state)}
                {state.target ? ` · ${state.target}` : ""}
              </span>
            ) : null}
          </span>
        </span>
      ) : null}
    </div>
  );
}
