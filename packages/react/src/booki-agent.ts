import { createHistory, describeEntry, stageChanges } from "@ui-sdk/react/history";
import { createAgent, registerTools as registerBridgeTools } from "@ui-sdk/react/agent";
import {
  bookiAllow,
  bookiRegisterTools,
  type AgentDecision,
  type AgentPolicyOptions,
} from "@booki/primitives/agent-policy";
import type { AuditEvent } from "./audit-trail.js";

type AgentBridge = ReturnType<typeof createAgent>;

export type CreateBookiAgentOptions = AgentPolicyOptions & {
  /** How long a step waits for `allow`, in ms. Default five minutes. */
  timeout?: number;
};

/**
 * Finance-tuned agent bridge: irreversible `data-agent-confirm` steps need an
 * explicit `allow` answer (no silent approve), and a person's decision
 * (approve, sign, send, release) is refused whatever `allow` says. With
 * `audit`, every refused step and every confirmed one is recorded, with who
 * decided when `allow` answers `{ allow, by }`. Same snapshot/act/query/subscribe
 * surface as `createAgent`.
 */
function createBookiAgent(options: CreateBookiAgentOptions = {}): AgentBridge {
  const { timeout } = options;
  // With neither `allow` nor `audit`, leave it unset: the bridge then runs
  // unmarked steps and refuses `data-agent-confirm` steps with "Needs a
  // person: …", which tells the agent what to do next. Answering `false` here
  // would read as "The person said no" although nobody was asked.
  const allow = bookiAllow(options);
  return createAgent(allow ? { timeout, allow } : { timeout });
}

/**
 * Registers the agent's tools with the browser's own agent (WebMCP). `allow`
 * decides each step; a person's decision is refused whatever it says.
 */
const registerTools = bookiRegisterTools(registerBridgeTools);

export type AttachAuditPush = (event: Omit<AuditEvent, "id" | "at">) => void;

export type AttachAuditOptions = {
  agentId?: string;
  ruleVersion?: string;
};

function domainAction(component: string, key: string): string {
  switch (component) {
    case "amount-field":
      if (key === "value" || key === "minor") return "amount.setMinor";
      return `amount.${key}`;
    case "voucher-composer":
      if (key === "lines") return "voucher.lines";
      return `voucher.${key}`;
    case "bank-account":
      return `bank.${key}`;
    case "payment-reference":
      return `paymentRef.${key}`;
    case "tax-code-select":
      return `tax.${key}`;
    case "account-picker":
      return `account.${key}`;
    case "currency-select":
      return `currency.${key}`;
    default:
      return `${component}.${key}`;
  }
}

/** A change's value as audit text: objects as JSON (not "[object Object]"), capped. */
function auditValue(value: unknown): string {
  let text: string;
  if (value === null || typeof value !== "object") text = String(value);
  else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  }
  return text.length > 200 ? `${text.slice(0, 199)}…` : text;
}

/**
 * Subscribe to bridge changes and push audit rows when `source === "agent"`.
 * Returns the unsubscribe function.
 */
function attachAudit(
  agent: AgentBridge,
  push: AttachAuditPush,
  agentIdOrOptions: string | AttachAuditOptions = "bridge",
): () => void {
  const options: AttachAuditOptions =
    typeof agentIdOrOptions === "string" ? { agentId: agentIdOrOptions } : agentIdOrOptions;
  const agentId = options.agentId ?? "bridge";
  const ruleVersion = options.ruleVersion;

  return agent.subscribe((change) => {
    if (change.source !== "agent") return;
    // A value with secrets is reported on `<key>Shown`, the copy without them.
    const key = change.key.endsWith("Shown") ? change.key.slice(0, -"Shown".length) : change.key;
    push({
      actor: `agent:${agentId}`,
      action: domainAction(change.component, key),
      target: change.label ?? change.ref,
      detail: `${key}=${auditValue(change.value)} (was ${auditValue(change.previous)})`,
      ruleVersion,
    });
  });
}

/**
 * Stage preview changes for a propose → allow → commit loop.
 * Thin alias over UI SDK `stageChanges` (async).
 */
async function proposeChanges(agent: AgentBridge, changes: Parameters<typeof stageChanges>[1]) {
  return stageChanges(agent, changes);
}

/**
 * State keys Booki primitives report changes on, each restorable through its
 * `set<Key>` agent action: `minor` (AmountField → setMinor), `lines`
 * (VoucherComposer → setLines), `digits` (OrganizationNumberInput →
 * setDigits), plus ui-sdk's defaults. Secret fields (bank account, IBAN) are
 * recorded as redacted and can't be restored by design.
 */
const BOOKI_HISTORY_KEYS = ["value", "checked", "pressed", "minor", "lines", "digits", "matches"];

/**
 * History bound to a finance agent (undo agent work, describe entries).
 * Records Booki's keys by default (see `BOOKI_HISTORY_KEYS`); pass `keys` to
 * replace the list.
 */
function createBookiHistory(agent: AgentBridge, options?: Parameters<typeof createHistory>[1]) {
  return createHistory(agent, { keys: BOOKI_HISTORY_KEYS, ...options });
}

export {
  BOOKI_HISTORY_KEYS,
  attachAudit,
  createBookiAgent,
  createBookiHistory,
  createHistory,
  describeEntry,
  proposeChanges,
  registerTools,
  stageChanges,
};
export type { AgentBridge, AgentDecision };
