import type { MessageLanguage } from "./message-render.js";

/** What an agent is doing, as `AgentStatus` shows it to a person. */
export type AgentStatusState = "idle" | "working" | "waiting" | "done" | "refused";

export const AGENT_STATUS_STATES: readonly AgentStatusState[] = ["idle", "working", "waiting", "done", "refused"];

/**
 * The status words. "waiting for a person" and "refused" are the same words
 * AgentLog shows for a step, so they keep AgentLog's codes: one sentence, one code.
 */
export const AGENT_STATUS_EN = {
  "agent-status.idle": "agent idle",
  "agent-status.working": "agent working",
  "agent-status.done": "agent done",
  "agent-log.waiting": "waiting for a person",
  "agent-log.refused": "refused",
} as const;

export const AGENT_STATUS_NB = {
  "agent-status.idle": "agent ledig",
  "agent-status.working": "agent arbeider",
  "agent-status.done": "agent ferdig",
  "agent-log.waiting": "venter på en person",
  "agent-log.refused": "avvist",
} as const satisfies Record<keyof typeof AGENT_STATUS_EN, string>;

const CODE: Record<AgentStatusState, keyof typeof AGENT_STATUS_EN> = {
  idle: "agent-status.idle",
  working: "agent-status.working",
  waiting: "agent-log.waiting",
  done: "agent-status.done",
  refused: "agent-log.refused",
};

/**
 * The words for an agent's state in the person's language. Small on purpose: a
 * status line loads these five sentences, not the whole catalogue.
 */
export function agentStatusLabel(language: MessageLanguage, state: AgentStatusState): string {
  return (language === "nb" ? AGENT_STATUS_NB : AGENT_STATUS_EN)[CODE[state]];
}
