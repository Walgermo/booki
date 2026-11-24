import { createBookiAgent, createAgentCursor, registerTools } from "@booki/react";
import { useEffect } from "react";

/**
 * The site's one agent bridge, set up as in ui-sdk's "Connect an Agent" guide:
 * created once, imported by main.tsx before the app renders, exposed as
 * `window.agent` for the console, and published to browser agents over WebMCP.
 */

type PersonPrompt = (text: string) => Promise<boolean> | boolean;

let prompt: PersonPrompt | null = null;

/**
 * A page that can put a question to the person registers its prompt here.
 * While none is registered, steps marked `data-agent-confirm` are refused.
 * Returns a cleanup for effects.
 */
export function setPersonPrompt(next: PersonPrompt): () => void {
  prompt = next;
  return () => {
    if (prompt === next) prompt = null;
  };
}

/**
 * A page's rules for what an agent may do on its own. Return true to let a
 * marked step run without a person, false to send it to the person, or
 * undefined to have no opinion.
 */
type StepPolicy = (step: { confirm?: string }) => boolean | undefined;

const policies = new Set<StepPolicy>();

/**
 * Register a policy for marked steps. Several parts of a page may each have
 * one; the first that has an opinion decides. Returns a cleanup for effects.
 */
export function setStepPolicy(next: StepPolicy): () => void {
  policies.add(next);
  return () => {
    policies.delete(next);
  };
}

/**
 * Unmarked steps run. A marked step runs when the page's policy allows it;
 * otherwise it waits for the person, or is refused when nobody can answer.
 */
const allow = (step: { confirm?: string }) => {
  if (!step.confirm) return true;
  let ruled: boolean | undefined;
  for (const policy of policies) {
    ruled = policy(step);
    if (ruled !== undefined) break;
  }
  if (ruled !== undefined) return ruled;
  return prompt ? prompt(step.confirm) : false;
};

/**
 * The agent's visible cursor. Off by default, so the benchmark pages run at
 * full speed; a page that renders <AgentCursor cursor={cursor} /> turns it on
 * with useAgentCursor(). It leads every step, then the rules above decide.
 */
const cursor = createAgentCursor();
cursor.setEnabled(false);

/** Show the agent's cursor while the calling component is mounted. */
export function useAgentCursor() {
  useEffect(() => {
    cursor.setEnabled(true);
    return () => cursor.setEnabled(false);
  }, []);
  return cursor;
}

let quiet = 0;

/**
 * Run agent work without the cursor, for a run the visitor did not ask for
 * (the landing page's first measurement on load). Motion follows input.
 */
export async function withoutCursor<T>(work: () => Promise<T>): Promise<T> {
  quiet += 1;
  try {
    return await work();
  } finally {
    quiet -= 1;
  }
}

/** Resolves once no quiet run is going, so the next run shows the cursor. */
export async function whenCursorFree(): Promise<void> {
  while (quiet > 0) await new Promise((resolve) => window.setTimeout(resolve, 150));
}

const led = cursor.wrap(allow);
const allowWithCursor: typeof led = (step, context) => (quiet > 0 ? allow(step) : led(step, context));

const agent = createBookiAgent({ agentId: "site", allow: allowWithCursor });

// In the browser only: the build also renders the pages to HTML, with no window.
if (typeof window !== "undefined") {
  // Try it in the console: window.agent.snapshot()
  Object.assign(window, { agent });

  // The same snapshot / act / query tools, for the browser's own agent: it gets the cursor too.
  // The bridge's allow (with the cursor) decides; a second one here would lead the cursor twice.
  const unregister = registerTools(agent, { allow: "bridge" });

  if (import.meta.hot) {
    import.meta.hot.dispose(unregister);
  }
}

export { agent, cursor };
