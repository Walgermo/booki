"use client";

import { createAgentCursor, createBookiAgent, type AgentBridge, type AgentDecisionRow } from "@booki/react";

/**
 * The agent's visible pointer: it leads every step, so the person sees where
 * the agent is working. Rendered by <AgentCursor cursor={cursor} />.
 */
export const cursor = createAgentCursor();

/**
 * The company's policy for steps marked `data-agent-confirm`. Unmarked steps
 * run. This page has no marked step an agent may take alone, so a marked step
 * is refused and stays with the person. A step a person must take (approve,
 * release) is refused by Booki before this is asked.
 */
const allow = (step: { confirm?: string }) => !step.confirm;

/**
 * Every step that was refused, and every marked one that was confirmed, on its
 * way to the audit trail. The page shows what the server logs; this is what
 * never reached the server.
 */
type DecisionListener = (row: AgentDecisionRow) => void;
let onDecision: DecisionListener = () => {};
export const listenToDecisions = (listener: DecisionListener): (() => void) => {
  onDecision = listener;
  return () => {
    onDecision = () => {};
  };
};
export const logDecision = (row: AgentDecisionRow) => onDecision(row);

/**
 * The page's agent bridge, one per browser tab. The bridge is not a security
 * boundary: every write still goes through the server's guard with the
 * agent's own credential (lib/handler.ts).
 */
let bridge: AgentBridge | null = null;

export function pageAgent(): AgentBridge {
  bridge ??= createBookiAgent({ agentId: "bookkeeper", allow: cursor.wrap(allow), audit: logDecision });
  return bridge;
}
