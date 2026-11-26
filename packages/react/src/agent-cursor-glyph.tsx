import { AGENT_CURSOR_PATH, AGENT_CURSOR_VIEW_BOX } from "@booki-aui/primitives/agent-cursor";
import type { ReactElement } from "react";

const pointer = { "data-slot": "agent-cursor-arrow", width: 20, height: 22, viewBox: AGENT_CURSOR_VIEW_BOX };
const inline = { width: 16, height: 16, viewBox: "0 0 24 24", stroke: "currentColor", strokeWidth: 1.5 };

/** The live pointer, with room for a status badge when drawn inline. */
export function AgentCursorGlyph({ badge }: { badge?: ReactElement }) {
  return (
    <svg
      {...(badge ? inline : pointer)}
      aria-hidden="true"
      focusable="false"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={AGENT_CURSOR_PATH} fill={badge ? "currentColor" : undefined} fillOpacity={badge ? 0.2 : undefined} />
      {badge && (
        <g data-slot="agent-status-badge" fill="none">
          {badge}
        </g>
      )}
    </svg>
  );
}
