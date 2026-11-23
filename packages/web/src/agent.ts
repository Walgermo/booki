import { bookiAllow, bookiRegisterTools, type AgentDecision, type AgentPolicyOptions } from "@booki/primitives/agent-policy";
export { actAndRecord } from "@booki/primitives/agent-policy";
import { createAgent, registerTools as registerBridgeTools } from "@ui-sdk/web/agent";

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

export type CreateBookiAgentOptions = AgentPolicyOptions & {
  /** How long a step waits for `allow`, in ms. Default five minutes. */
  timeout?: number;
};

/**
 * A step marked `data-agent-confirm` (posting, paying) runs only on a yes from
 * `allow`; without `allow` it is refused with "Needs a person", which tells
 * the agent what to do next. A person's decision (approve, sign, release) is
 * refused whatever `allow` says.
 */
export function createBookiAgent(options: CreateBookiAgentOptions = {}): BookiAgent {
  const { timeout } = options;
  const allow = bookiAllow(options);
  return createAgent(allow ? { timeout, allow } : { timeout });
}

/** Registers the agent's tools with the browser's own agent (WebMCP), with the same rules. */
export const registerTools: (
  agent: BookiAgent,
  options: AgentPolicyOptions & { allow: NonNullable<AgentPolicyOptions["allow"]> },
) => () => void = bookiRegisterTools(registerBridgeTools);

export type { AgentDecision };
