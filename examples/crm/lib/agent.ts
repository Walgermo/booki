"use client";

import { createAgentCursor, createBookiAgent, type AgentBridge, type AgentDecisionRow } from "@booki/react";
import { AGENT_ID } from "./people";

/** The agent's visible pointer: it leads every step, so the person sees where the agent works. */
export const cursor = createAgentCursor();

/**
 * The company's policy for steps marked `data-agent-confirm`: none here may be
 * taken by the agent alone. Marking a deal won or lost, reopening it and
 * removing an activity are a person's in Booki and are refused before this is
 * asked.
 */
const allow = (step: { confirm?: string }) => !step.confirm;

type DecisionListener = (row: AgentDecisionRow) => void;
let onDecision: DecisionListener = () => {};
export const listenToDecisions = (listener: DecisionListener): (() => void) => {
  onDecision = listener;
  return () => {
    onDecision = () => {};
  };
};
/** A step refused in the page never reaches the server: it goes to the audit trail from here. */
export const logDecision = (row: AgentDecisionRow) => onDecision(row);

let bridge: AgentBridge | null = null;

/**
 * The page's agent bridge, one per tab. Not a security boundary: every write
 * still goes through the server's guard with the agent's own credential.
 */
export function pageAgent(): AgentBridge {
  bridge ??= createBookiAgent({ agentId: AGENT_ID, allow: cursor.wrap(allow), audit: logDecision, language: "nb" });
  return bridge;
}
