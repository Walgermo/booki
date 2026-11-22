"use client";

import { createAgentCursor, createBookiAgent, type AgentBridge } from "@booki/react";

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
 * The page's agent bridge, one per browser tab. The bridge is not a security
 * boundary: every write still goes through the server's guard with the
 * agent's own credential (lib/handler.ts).
 */
let bridge: AgentBridge | null = null;

export function pageAgent(): AgentBridge {
  bridge ??= createBookiAgent({ agentId: "bookkeeper", allow: cursor.wrap(allow) });
  return bridge;
}

/**
 * Whose credential the next write carries. While an agent step runs, a change
 * a control reports is the agent's; otherwise it is the person's at the
 * keyboard. Every call into the bridge goes through `runAsAgent`.
 */
let agentDepth = 0;

export const actingAsAgent = () => agentDepth > 0;

export async function runAsAgent<T>(work: () => Promise<T>): Promise<T> {
  agentDepth += 1;
  try {
    return await work();
  } finally {
    agentDepth -= 1;
  }
}
