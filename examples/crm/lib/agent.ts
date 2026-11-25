"use client";

import { createAgentCursor, createBookiAgent, type AgentBridge, type AgentDecisionRow } from "@booki-aui/react";
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

/**
 * Steps the agent is running now, from the tasks or the chat. A step's change
 * goes to the server with the credential of whoever is signed in when it
 * lands, so the person switch waits while one runs: a step Kari asked for is
 * never recorded as Ola's.
 */
let working = 0;
const workListeners = new Set<() => void>();
const changed = () => {
  for (const listener of workListeners) listener();
};

/** Runs `work` as one of the agent's steps. */
export async function asAgentWork<T>(work: () => Promise<T>): Promise<T> {
  working += 1;
  changed();
  try {
    return await work();
  } finally {
    working -= 1;
    changed();
  }
}

export const agentWorking = {
  subscribe(listener: () => void) {
    workListeners.add(listener);
    return () => {
      workListeners.delete(listener);
    };
  },
  now: () => working > 0,
};
