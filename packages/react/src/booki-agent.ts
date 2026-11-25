import { createHistory as createBridgeHistory, describeEntry, stageChanges } from "@ui-sdk/react/history";
import { agentTools, createAgent, registerTools as registerBridgeTools } from "@ui-sdk/react/agent";
import { elementOf } from "@ui-sdk/react/observe";
import {
  actAndRecord,
  bookiAllow,
  bookiRegisterTools,
  markRefused,
  type AgentDecision,
  type AgentPolicyOptions,
} from "@booki/primitives/agent-policy";
import { isPersonOnly } from "@booki/primitives/person-only";
import { BookiError, type MessageLanguage } from "@booki/core/msg";
import type { AuditEvent } from "./audit-trail.js";

type AgentBridge = ReturnType<typeof createAgent>;

/**
 * The bridge `createAgent` made, behind an agent that answers in another
 * language. ui-sdk's history and WebMCP tools find the bridge's internals by
 * the object and the `act` that `createAgent` returned, so they get that one.
 */
const bridges = new WeakMap<AgentBridge, AgentBridge>();
const bridgeOf = (agent: AgentBridge): AgentBridge => bridges.get(agent) ?? agent;

/**
 * Who an undo running on a bridge is for. ui-sdk's history puts values back
 * through the bridge, so the change reports `source: "agent"`; this says it
 * was a person's undo.
 */
const restorers = new WeakMap<AgentBridge, string>();
let restoringCount = 0;

/**
 * True while a Booki history (`createBookiHistory`, `createHistory`) is putting
 * values back for an undo or a seek. Those changes report `source: "agent"`,
 * because ui-sdk restores through the bridge; check this in your own change
 * callback to record them as the person's undo, not the agent's work.
 */
function isHistoryRestoring(): boolean {
  return restoringCount > 0;
}

export type CreateBookiAgentOptions = AgentPolicyOptions & {
  /** How long a step waits for `allow`, in ms. Default five minutes. */
  timeout?: number;
  /**
   * The language of Booki's refusals in `act` results. Default `"en"`. With
   * `"nb"` a refusal from a Booki control comes back in Norwegian, and so do the
   * bridge's own ("Needs a person: …", "No component … on the page", "The person
   * said no to …"), and so does a step's own sentence (`Pressed "…".`); a sentence the
   * catalogue does not know stays as written. History
   * (`createBookiHistory`) and WebMCP tools (`registerTools`) work with such an
   * agent; what they answer themselves is in ui-sdk's words.
   */
  language?: MessageLanguage;
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
  const { timeout, agentId = "bridge", ruleVersion } = options;
  // With neither `allow` nor `audit`, leave it unset: the bridge then runs
  // unmarked steps and refuses `data-agent-confirm` steps with "Needs a
  // person: …", which tells the agent what to do next. Answering `false` here
  // would read as "The person said no" although nobody was asked.
  const allow = bookiAllow(options);
  const bridge = createAgent(allow ? { timeout, allow } : { timeout });
  const language = options.language && options.language !== "en" ? options.language : undefined;

  /** Runs steps on the bridge, noting a lone step for `attachAudit`'s rows. */
  const run = async (input: ActInput, actOptions?: ActOptions) => {
    // A call without `steps` is ui-sdk's to refuse with a sentence: read it, never assume it.
    const lone = Array.isArray(input?.steps) && input.steps.length === 1 ? input.steps[0] : undefined;
    if (lone) currentStep.set(bridge, lone.action);
    try {
      return await bridge.act(input as never, actOptions);
    } finally {
      if (lone) currentStep.delete(bridge);
    }
  };

  const act = async (input: ActInput, actOptions?: ActOptions) => {
    let result = (await run(input, actOptions)) as ActResult;
    // A press on a Booki control's button that is a person's decision (sign off,
    // release): the bridge answers "nothing to press now", which tells the agent
    // nothing and leaves no trace. Checked after the call, when the button is on
    // the page even if an earlier step in it made the button appear.
    const failed = result.ok ? undefined : result.error;
    const step = failed && Array.isArray(input?.steps) ? input.steps[failed.step] : undefined;
    const person = step ? personOnlyPress(bridge, step) : null;
    if (failed && step && person) {
      markRefused({ ref: step.ref, label: person.entry.label, action: step.action });
      options.audit?.({
        actor: `agent:${agentId}`,
        action: "agent.person-only",
        target: person.entry.label ?? person.entry.ref,
        detail: `${person.entry.component}.press: ${person.confirm}`,
        ...(ruleVersion ? { ruleVersion } : {}),
      });
      result = {
        ...result,
        error: { ...failed, message: new BookiError("agent.person-only", { confirm: person.confirm }).message },
      };
    }
    if (!language) return result;
    // Loaded only for an agent that asked for another language: the catalogue is not small.
    const { localize } = await import("@booki/core/messages");
    return inLanguage(result, (text) => localize(text, language));
  };

  const agent = { ...bridge, act } as AgentBridge;
  bridges.set(agent, bridge);
  return agent;
}

type ActInput = { steps: { ref: string; action: string; args?: unknown[] }[] };
type ActOptions = { signal?: AbortSignal };
type ActResult = { ok: boolean; steps?: unknown[]; error?: { step: number; message: string } } & Record<
  string,
  unknown
>;
type Entry = { ref: string; label?: string; component: string; actions?: string[] };

/** The step a lone `act` is running, by bridge, for `attachAudit` to name in its rows. */
const currentStep = new WeakMap<AgentBridge, string>();

/**
 * When a press step names a button on a Booki control that is a person's
 * decision, the confirm sentence and the control; otherwise null. Controls
 * that take `press` themselves (a ui-sdk Button) are left to the bridge, whose
 * `allow` refuses a person's decision already.
 */
function personOnlyPress(
  bridge: AgentBridge,
  step: ActInput["steps"][number],
): { confirm: string; entry: Entry } | null {
  if (step.action !== "press") return null;
  const text = String(step.args?.[0] ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!text) return null;
  const entries = bridge.snapshot() as unknown as Entry[];
  const entry =
    entries.find((item) => item.ref === step.ref) ??
    entries.find((item) => item.label === step.ref) ??
    entries.find((item) => item.component === step.ref);
  if (!entry || entry.actions?.includes("press")) return null;
  const root = elementOf(entry.ref);
  if (!root) return null;
  for (const button of root.querySelectorAll("button, [role='button']")) {
    const own = (button.textContent ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    const label = (button.getAttribute("aria-label") ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    if (own !== text && label !== text && !label.startsWith(`${text}:`)) continue;
    const confirm = button.closest("[data-agent-confirm]")?.getAttribute("data-agent-confirm");
    if (confirm && isPersonOnly(confirm)) return { confirm, entry };
  }
  return null;
}

/**
 * The same result with every refusal (`error.message`, at any depth) and every
 * step's own sentence (`result`, like `Pressed "Post".`) written in another language.
 */
function inLanguage<T>(value: T, say: (text: string) => string): T {
  if (Array.isArray(value)) return value.map((item) => inLanguage(item, say)) as T;
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (
      key === "error" &&
      inner &&
      typeof inner === "object" &&
      typeof (inner as { message?: unknown }).message === "string"
    ) {
      out[key] = { ...(inner as object), message: say((inner as { message: string }).message) };
    } else if (key === "result" && typeof inner === "string") {
      // A control's own answer comes back as it is when the catalogue does not know it.
      out[key] = say(inner);
    } else out[key] = inLanguage(inner, say);
  }
  return out as T;
}

export type RegisterToolsOptions = Omit<AgentPolicyOptions, "allow"> & {
  /**
   * Decides each step the browser's agent takes. `"bridge"`: the agent's own
   * `allow` (from `createBookiAgent`) decides, once, and Booki registers the
   * tools itself, so they answer in the agent's language and, with `audit`, a
   * control's own refusals are recorded. A function: a second gate after the
   * bridge's, through ui-sdk's registration. Give the same dialog to both and
   * the person is asked twice.
   */
  allow: NonNullable<AgentPolicyOptions["allow"]> | "bridge";
  /** Prefix for the tool names, like `"acme"` for `acme_snapshot`, `acme_act`, `acme_query`. Needs `allow: "bridge"`. */
  prefix?: string;
};

const registerWithGate = bookiRegisterTools<AgentBridge>((agent, options) =>
  registerBridgeTools(bridgeOf(agent), options),
);

/**
 * Registers the agent's tools with the browser's own agent (WebMCP): `snapshot`,
 * `act` and `query`. A person's decision is refused whatever `allow` says. The
 * browser's agent acts in the person's session: keep this off until your
 * server can tell it from the person.
 */
function registerTools(agent: AgentBridge, options: RegisterToolsOptions): () => void {
  if (options?.allow !== "bridge") {
    if (options?.prefix) throw new Error('registerTools: a prefix needs allow: "bridge".');
    return registerWithGate(agent, options as never);
  }
  const prefix = options.prefix ? `${String(options.prefix).replace(/[^A-Za-z0-9_-]/g, "")}_` : "";
  const context = (globalThis as { document?: { modelContext?: ModelContext } }).document?.modelContext;
  const controller = new AbortController();
  const act = (input: ActInput, signal?: AbortSignal) =>
    options.audit
      ? actAndRecord(agent as never, input as never, options, { signal })
      : agent.act(input as never, { signal });
  for (const tool of agentTools) {
    const definition = {
      ...tool,
      name: `${prefix}${tool.name}`,
      // Labels and text come from the page, which can hold what users wrote,
      // and `act` can press any button, like one that deletes.
      annotations: {
        readOnlyHint: tool.name !== "act",
        untrustedContentHint: true,
        consequentialHint: tool.name === "act",
      },
      execute: (input: unknown, call?: { signal?: AbortSignal }) =>
        tool.name === "act"
          ? act(input as ActInput, call?.signal)
          : (agent as unknown as Record<string, (input: unknown) => unknown>)[tool.name]!(input),
    };
    try {
      // A browser may answer with a promise or with nothing.
      void Promise.resolve(context?.registerTool(definition, { signal: controller.signal })).catch(() => {});
    } catch {
      /* Not allowed here: the page works without the tools. */
    }
  }
  return () => controller.abort();
}

type ModelContext = { registerTool: (tool: unknown, options: { signal: AbortSignal }) => unknown };

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
function auditValue(value: unknown, max = 200): string {
  let text: string;
  if (value === null || typeof value !== "object") text = String(value);
  else {
    try {
      text = JSON.stringify(value);
    } catch {
      text = String(value);
    }
  }
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

type Row = { id: string | number } & Record<string, unknown>;
const isRows = (value: unknown): value is Row[] =>
  Array.isArray(value) &&
  value.every(
    (item) => item && typeof item === "object" && (typeof item.id === "string" || typeof item.id === "number"),
  );
const isPlain = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const same = (a: unknown, b: unknown) => auditValue(a, 10_000) === auditValue(b, 10_000);

/** What changed between two lists of records, by id: added, removed, and each changed field. */
function rowChanges(next: Row[], before: Row[]): string[] {
  const out: string[] = [];
  for (const row of next) {
    const old = before.find((item) => item.id === row.id);
    if (!old) {
      out.push(`+${row.id}`);
      continue;
    }
    const fields = Object.keys({ ...old, ...row })
      .filter((key) => !same(row[key], old[key]))
      .map((key) => `${key}=${auditValue(row[key], 40)} (was ${auditValue(old[key], 40)})`);
    if (fields.length) out.push(`${row.id}: ${fields.join(", ")}`);
  }
  for (const old of before) if (!next.some((row) => row.id === old.id)) out.push(`-${old.id}`);
  return out;
}

/**
 * A change in words a person can follow: for a list of records, what changed
 * per record; for a record (a workpaper, a claim), each field that changed,
 * and for its lists, the same per record. Anything else as before.
 */
function changeText(key: string, value: unknown, previous: unknown): string {
  let parts: string[] | null = null;
  if (isRows(value) && isRows(previous)) parts = rowChanges(value, previous);
  else if (isPlain(value) && isPlain(previous)) {
    parts = [];
    for (const field of Object.keys({ ...previous, ...value })) {
      const now = value[field];
      const was = previous[field];
      if (same(now, was)) continue;
      if (isRows(now) && isRows(was)) parts.push(...rowChanges(now, was).map((line) => `${field} ${line}`));
      else parts.push(`${field}=${auditValue(now, 60)} (was ${auditValue(was, 60)})`);
    }
  }
  if (!parts || parts.length === 0) return `${key}=${auditValue(value)} (was ${auditValue(previous)})`;
  return auditValue(parts.join("; ").replace(/^"|"$/g, ""), 200).replace(/^"|"$/g, "");
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

  const bridge = bridgeOf(agent);
  return agent.subscribe((change) => {
    if (change.source !== "agent") return;
    // A value with secrets is reported on `<key>Shown`, the copy without them.
    const key = change.key.endsWith("Shown") ? change.key.slice(0, -"Shown".length) : change.key;
    // An undo goes through the bridge too, but it is the person's.
    const undoneBy = restorers.get(bridge);
    // The step a lone `act` ran, so the row says what the agent did, not only what changed.
    const step = undoneBy ? undefined : currentStep.get(bridge);
    push({
      actor: undoneBy ?? `agent:${agentId}`,
      action: domainAction(change.component, key),
      target: change.label ?? change.ref,
      detail: `${step ? `${step}: ` : ""}${changeText(key, change.value, change.previous)}${undoneBy ? ", undo" : ""}`,
      ruleVersion,
    });
  });
}

/**
 * Stage preview changes for a propose → allow → commit loop.
 * Thin alias over UI SDK `stageChanges` (async).
 */
async function proposeChanges(agent: AgentBridge, changes: Parameters<typeof stageChanges>[1]) {
  return stageChanges(bridgeOf(agent), changes);
}

/**
 * State keys Booki primitives report changes on, each restorable through its
 * `set<Key>` agent action: `minor` (AmountField → setMinor), `lines`
 * (VoucherComposer → setLines), `digits` (OrganizationNumberInput →
 * setDigits), plus ui-sdk's defaults. Secret fields (bank account, IBAN) are
 * recorded as redacted and can't be restored by design.
 */
const BOOKI_HISTORY_KEYS = ["value", "checked", "pressed", "minor", "lines", "digits", "matches"];

export type BookiHistoryOptions = NonNullable<Parameters<typeof createBridgeHistory>[1]> & {
  /**
   * Who an undo or a seek is for, in `attachAudit` rows: the person's actor id,
   * like `"person:kari"`, or a function that returns the one signed in at the
   * moment of the undo. Default `"person"`.
   */
  by?: string | (() => string | undefined);
};

/**
 * History bound to a finance agent (undo agent work, describe entries).
 * Records Booki's keys by default (see `BOOKI_HISTORY_KEYS`); pass `keys` to
 * replace the list.
 */
function createBookiHistory(agent: AgentBridge, options?: BookiHistoryOptions) {
  return createHistory(agent, { keys: BOOKI_HISTORY_KEYS, ...options });
}

/**
 * ui-sdk's `createHistory`, for any agent `createBookiAgent` made, also one with
 * a `language`: undo and redo run through the bridge itself, so their own
 * results are in ui-sdk's words. While `seek` or `undoSource` puts values
 * back, `attachAudit` records the changes under `by` (the person), not the
 * agent, and `isHistoryRestoring()` is true.
 */
function createHistory(agent: AgentBridge, options: BookiHistoryOptions = {}) {
  const { by, ...rest } = options;
  const bridge = bridgeOf(agent);
  const history = createBridgeHistory(bridge, rest);
  const asPerson = async <T>(run: () => Promise<T>): Promise<T> => {
    const who = (typeof by === "function" ? by() : by) || "person";
    const before = restorers.get(bridge);
    restorers.set(bridge, who);
    restoringCount++;
    try {
      return await run();
    } finally {
      restoringCount--;
      if (before === undefined) restorers.delete(bridge);
      else restorers.set(bridge, before);
    }
  };
  return {
    ...history,
    seek: (to: number) => asPerson(() => history.seek(to)),
    undoSource: (source: string) => asPerson(() => history.undoSource(source)),
  };
}

export {
  BOOKI_HISTORY_KEYS,
  attachAudit,
  createBookiAgent,
  createBookiHistory,
  createHistory,
  describeEntry,
  isHistoryRestoring,
  proposeChanges,
  registerTools,
  stageChanges,
};
export type { AgentBridge, AgentDecision };
