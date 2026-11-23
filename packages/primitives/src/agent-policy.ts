import { BookiError } from "@booki/core/msg";
import { isPersonOnly } from "./person-only.js";

/** A step as the bridge's `allow` sees it. */
export type AgentPolicyStep = {
  ref: string;
  component: string;
  label?: string;
  action: string;
  args?: readonly unknown[];
  /** What `data-agent-confirm` says the step does, when a person must approve it. */
  confirm?: string;
};

/**
 * What `allow` answers. `by` is who decided: the person who said yes in your
 * dialog, or the rule that did (`"rule:under-5000"`). It goes in the audit row.
 */
export type AgentDecision = boolean | { allow: boolean; by?: string };

/** One decision about a step, as an audit row (the fields of `AuditEvent`). */
export type AgentDecisionRow = {
  actor: string;
  /** `agent.confirmed`, `agent.refused` (by `allow`), `agent.person-only` or `agent.cancelled` (nobody answered in time). */
  action: string;
  target: string;
  detail?: string;
  /** Who said yes or no, when `allow` told. */
  decidedBy?: string;
  ruleVersion?: string;
};

type AskedStep = { ref: string; component: string; label?: string; action: string; args: unknown[]; confirm?: string };

export type AgentPolicyOptions = {
  /** Decides each step. A step marked `data-agent-confirm` runs only on a yes. */
  allow?: (step: AskedStep, context: { signal: AbortSignal }) => AgentDecision | Promise<AgentDecision>;
  /**
   * Called with every step that was refused, and every marked step that was
   * confirmed. The changes that followed come from `attachAudit`. If it throws,
   * the step does not run. A step's arguments are never in the row: they can
   * be account numbers.
   */
  audit?: (row: AgentDecisionRow) => void;
  /** The audit row's actor, `agent:<agentId>`. Default `bridge`. */
  agentId?: string;
  /** Stamped on every audit row. */
  ruleVersion?: string;
};

/** True when a decision lets the step run. */
export const isAllowed = (decision: AgentDecision): boolean =>
  typeof decision === "object" && decision !== null ? decision.allow === true : decision === true;

/**
 * The bridge's `allow`, with Booki's own rules around yours: a person's
 * decision (approve, sign, send, release) is refused whatever `allow` says,
 * and every refusal and confirmation is recorded. Undefined when there is
 * nothing to add, so the bridge keeps its own answer for marked steps.
 */
export function bookiAllow(
  options: AgentPolicyOptions,
): ((step: AskedStep, context: { signal: AbortSignal }) => Promise<boolean>) | undefined {
  const { allow, audit, agentId = "bridge", ruleVersion } = options;
  if (!allow && !audit) return undefined;
  const record = (step: AskedStep, action: string, by?: string) => {
    audit?.({
      actor: `agent:${agentId}`,
      action,
      target: step.label ?? step.ref,
      detail: `${step.component}.${step.action}${step.confirm ? `: ${step.confirm}` : ""}`,
      ...(by ? { decidedBy: by } : {}),
      ...(ruleVersion ? { ruleVersion } : {}),
    });
  };
  return async (step, context) => {
    if (isPersonOnly(step.confirm)) {
      record(step, "agent.person-only");
      throw new BookiError("agent.person-only", { confirm: String(step.confirm) });
    }
    if (!allow) {
      if (!step.confirm) return true;
      record(step, "agent.refused");
      throw new BookiError("agent.needs-person", { confirm: step.confirm });
    }
    // The bridge stops waiting on abort; an answer after that changes nothing, so it is not recorded.
    let over = false;
    const cancelled = () => {
      over = true;
      record(step, "agent.cancelled");
    };
    context.signal.addEventListener("abort", cancelled, { once: true });
    try {
      const decision = await allow(step, context);
      const yes = isAllowed(decision);
      if (over) return false;
      const by = typeof decision === "object" && decision !== null ? decision.by : undefined;
      if (!yes) record(step, "agent.refused", by);
      else if (step.confirm) record(step, "agent.confirmed", by);
      return yes;
    } finally {
      context.signal.removeEventListener("abort", cancelled);
    }
  };
}

type Register<A> = (
  agent: A,
  options: { allow: (step: AskedStep, context: { signal: AbortSignal }) => boolean | Promise<boolean> },
) => () => void;

/**
 * `registerTools` with the same rules: the browser's own agent never makes a
 * person's decision either, whatever the `allow` given here says.
 */
export function bookiRegisterTools<A>(register: Register<A>) {
  return (
    agent: A,
    options: AgentPolicyOptions & { allow: NonNullable<AgentPolicyOptions["allow"]> },
  ): (() => void) => {
    if (typeof options?.allow !== "function") return register(agent, options as never);
    return register(agent, { allow: bookiAllow(options)! });
  };
}

type Actable = {
  act: (
    input: { steps: { ref: string; action: string; args?: unknown[] }[] },
    options?: { signal?: AbortSignal },
  ) => Promise<{ ok: boolean; error?: { step: number; message: string } }>;
};

/**
 * `agent.act`, and an audit row for a step the control itself refused (a
 * fraction of an øre, an account not in the chart): `bookiAllow` only sees
 * what `allow` decided, not what the control did after. Use it where your
 * code calls `act` for a model. The row holds the refusal sentence, which the
 * bridge has already redacted for a secret field, never the step's arguments.
 */
export async function actAndRecord<A extends Actable>(
  agent: A,
  input: Parameters<A["act"]>[0],
  options: Pick<AgentPolicyOptions, "audit" | "agentId" | "ruleVersion">,
  actOptions?: { signal?: AbortSignal },
): Promise<Awaited<ReturnType<A["act"]>>> {
  const result = (await agent.act(input, actOptions)) as Awaited<ReturnType<A["act"]>>;
  const failed = (result as { ok: boolean; error?: { step: number; message: string } }).error;
  if (!(result as { ok: boolean }).ok && failed && options.audit) {
    const step = input.steps[failed.step];
    options.audit({
      actor: `agent:${options.agentId ?? "bridge"}`,
      action: "agent.failed",
      target: step?.ref ?? "?",
      detail: `${step?.action ?? "?"}: ${failed.message.replace(/\s+/g, " ").slice(0, 200)}`,
      ...(options.ruleVersion ? { ruleVersion: options.ruleVersion } : {}),
    });
  }
  return result;
}
