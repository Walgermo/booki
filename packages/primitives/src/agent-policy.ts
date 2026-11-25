import { BookiError } from "@booki-aui/core/msg";
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

/**
 * Steps `bookiAllow` has recorded as refused, newest last, so `actAndRecord`
 * does not record the same step a second time when `act` then fails on it.
 */
let sequence = 0;
const refusedSteps: { seq: number; ref: string; label?: string; action: string }[] = [];

/**
 * Notes a step refused outside `bookiAllow` (a person-only press the bridge
 * caught before running it), so `actAndRecord` does not record it a second time.
 */
export function markRefused(step: { ref: string; label?: string; action: string }): void {
  refusedSteps.push({ seq: ++sequence, ref: step.ref, label: step.label, action: step.action });
  if (refusedSteps.length > 50) refusedSteps.shift();
}

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
    if (action !== "agent.confirmed") {
      refusedSteps.push({ seq: ++sequence, ref: step.ref, label: step.label, action: step.action });
      if (refusedSteps.length > 50) refusedSteps.shift();
    }
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
  snapshot?: () => { ref: string; label?: string }[];
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
  const from = sequence;
  const result = (await agent.act(input, actOptions)) as Awaited<ReturnType<A["act"]>>;
  const failed = (result as { ok: boolean; error?: { step: number; message: string } }).error;
  if (!(result as { ok: boolean }).ok && failed && options.audit) {
    const step = Array.isArray(input?.steps) ? input.steps[failed.step] : undefined;
    // A check that did not hold changed nothing and was not refused: the agent reads why, the audit trail stays about changes.
    if (step?.action === "expect") return result;
    // `allow` refused it, and `bookiAllow` has already recorded that: one row per decision.
    const already = refusedSteps.some(
      (refused) =>
        refused.seq > from &&
        refused.action === step?.action &&
        (refused.ref === step?.ref || refused.label === step?.ref),
    );
    if (already) return result;
    // The control's name, as a person reads it, rather than its ref.
    const label = step ? agent.snapshot?.().find((entry) => entry.ref === step.ref)?.label : undefined;
    // A call in the wrong shape: ui-sdk's sentence quotes what the agent sent, which can be an account
    // number, so the row says only that no step ran.
    const shape = /(?:No step ran|Ingen steg ble kjørt)\.$/.test(failed.message);
    options.audit({
      actor: `agent:${options.agentId ?? "bridge"}`,
      action: "agent.failed",
      target: shape ? "act" : (label ?? step?.ref ?? "?"),
      detail: shape
        ? "act: the call was not in the shape act takes; no step ran"
        : `${step?.action ?? "?"}: ${failed.message.replace(/\s+/g, " ").slice(0, 200)}`,
      ...(options.ruleVersion ? { ruleVersion: options.ruleVersion } : {}),
    });
  }
  return result;
}

/**
 * The same bridge, with `act` going through `actAndRecord`: give this to
 * `window.agent` and to any code of yours that calls `act` for a model.
 * The browser's own agent (`registerTools`, WebMCP) does not go through it:
 * its refusals by `allow` are recorded, a control's own refusal is not.
 */
export function withRecordedAct<A extends Actable>(
  agent: A,
  options: Pick<AgentPolicyOptions, "audit" | "agentId" | "ruleVersion">,
): A {
  return {
    ...agent,
    act: (input: Parameters<A["act"]>[0], actOptions?: { signal?: AbortSignal }) =>
      actAndRecord(agent, input, options, actOptions),
  } as A;
}
