import { createAgent, registerTools } from "@ui-sdk/web/agent";

/**
 * The agent bridge for Booki's custom elements: the same snapshot, act, query
 * and subscribe as in @booki/react, with the same rule for marked steps.
 *
 * ```ts
 * import "@booki/web"
 * import { createBookiAgent, registerTools } from "@booki/web"
 *
 * const agent = createBookiAgent({ agentId: "bookkeeper", allow })
 * registerTools(agent, { allow })
 * ```
 */
export type BookiAgent = ReturnType<typeof createAgent>;

type Allow = NonNullable<NonNullable<Parameters<typeof createAgent>[0]>["allow"]>;

export type CreateBookiAgentOptions = {
  /**
   * Decides each step. A step marked `data-agent-confirm` (posting, paying)
   * runs only when this returns true. Without it, marked steps are refused
   * with "Needs a person", which tells the agent what to do next.
   */
  allow?: Allow;
  /** Used in audit events as `agent:<agentId>`. */
  agentId?: string;
  /** How long a step waits for `allow`, in ms. Default five minutes. */
  timeout?: number;
};

export function createBookiAgent(options: CreateBookiAgentOptions = {}): BookiAgent {
  const { allow, timeout } = options;
  return createAgent(allow ? { timeout, allow } : { timeout });
}

export { registerTools };
