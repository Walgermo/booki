import { createHistory as createBridgeHistory, describeEntry, stageChanges } from "@ui-sdk/react/history";
import { agentTools, createAgent, registerTools as registerBridgeTools } from "@ui-sdk/react/agent";
import { elementOf } from "@ui-sdk/react/observe";
import {
  actAndRecord,
  bookiAllow,
  bookiRegisterTools,
  markRefused,
  noteUnrecorded,
  type AgentDecision,
  type AgentPolicyOptions,
} from "@booki-aui/primitives/agent-policy";
import { isPersonOnly } from "@booki-aui/primitives/person-only";
import { BookiError, msg, type MessageLanguage } from "@booki-aui/core/msg";
import type { AuditEvent } from "./audit-trail.js";
import { emitCall, markReporting, nextCallId, type AgentCallResult, type AgentCallStep } from "./agent-calls.js";

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
 * Each bridge's agent turns and history restores, one after another, in the
 * order they were asked for: the bridge runs them in that order too. An undo
 * asked for while an agent's turn runs is marked as the person's only when
 * its own turn starts, so the agent's remaining steps stay the agent's.
 */
const turns = new WeakMap<AgentBridge, Promise<unknown>>();
function inTurn<T>(bridge: AgentBridge, run: () => Promise<T>): Promise<T> {
  const next = (turns.get(bridge) ?? Promise.resolve()).then(run);
  turns.set(
    bridge,
    next.catch(() => undefined),
  );
  return next;
}

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
  const decide = bookiAllow(options);
  // The call `act` is running, so a step that waits for the app's `allow` (a person) is reported as waiting.
  let runningCall: number | undefined;
  const allow =
    decide && options.allow
      ? (step: Parameters<typeof decide>[0], context: Parameters<typeof decide>[1]) => {
          if (runningCall !== undefined && step.confirm && !isPersonOnly(step.confirm)) {
            emitCall(agent, { type: "waiting", id: runningCall, ref: step.ref, confirm: step.confirm });
          }
          return decide(step, context);
        }
      : decide;
  const bridge = createAgent(allow ? { timeout, allow } : { timeout });
  const language = options.language && options.language !== "en" ? options.language : undefined;

  /** Runs steps on the bridge, noting a lone step for `attachAudit`'s rows. */
  const run = (input: ActInput, actOptions: ActOptions | undefined, id: number) =>
    inTurn(bridge, async () => {
      // A call without `steps` is ui-sdk's to refuse with a sentence: read it, never assume it.
      const lone = Array.isArray(input?.steps) && input.steps.length === 1 ? input.steps[0] : undefined;
      if (lone) currentStep.set(bridge, lone.action);
      runningCall = id;
      emitCall(agent, { type: "start", id, steps: stepsOf(input) });
      try {
        return await bridge.act(input as never, actOptions);
      } finally {
        runningCall = undefined;
        if (lone) currentStep.delete(bridge);
      }
    });

  /** Each call is reported to `AgentLog`: when it starts, when a step waits for a person, and its result. */
  const act = async (input: ActInput, actOptions?: ActOptions) => {
    const id = nextCallId();
    try {
      const result = await actOnce(input, actOptions, id);
      emitCall(agent, { type: "end", id, result: result as AgentCallResult });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      emitCall(agent, { type: "end", id, result: { ok: false, error: { step: 0, message } } });
      throw error;
    }
  };

  const actOnce = async (input: ActInput, actOptions: ActOptions | undefined, id: number) => {
    let result = (await run(input, actOptions, id)) as ActResult;
    // A press on a Booki control's button that is a person's decision (sign off,
    // release): the bridge answers "nothing to press now", which tells the agent
    // nothing and leaves no trace. Checked after the call, when the button is on
    // the page even if an earlier step in it made the button appear.
    const failed = result.ok ? undefined : result.error;
    const step = failed && Array.isArray(input?.steps) ? input.steps[failed.step] : undefined;
    const person = step ? personOnlyPress(bridge, step) : null;
    const refusal = failed && step && person ? personOnlyRow(person) : undefined;
    if (failed && person && refusal) {
      if (options.audit) {
        // Written here, so `actAndRecord` does not write the same refusal again.
        markRefused({ ref: step!.ref, label: person.entry.label, action: step!.action });
        options.audit({ actor: `agent:${agentId}`, ...refusal, ...(ruleVersion ? { ruleVersion } : {}) });
      }
      result = {
        ...result,
        error: { ...failed, message: new BookiError("agent.person-only", { confirm: person.confirm }).message },
      };
    }
    if (language) {
      // Loaded only for an agent that asked for another language: the catalogue is not small.
      const { localize } = await import("@booki-aui/core/messages");
      result = inLanguage(result, (text) => localize(text, language));
    }
    // No audit of its own: `actAndRecord` (like `registerTools` with `audit`) writes the row instead.
    if (refusal && !options.audit) noteUnrecorded(result, refusal);
    return result;
  };

  const agent = { ...bridge, act } as AgentBridge;
  bridges.set(agent, bridge);
  markReporting(agent);
  // A browser agent's `act` through `registerTools` with a gate of its own runs on the
  // bridge underneath, not through `act` above: it is reported here instead.
  toolReporters.set(agent, async (input, execute) => {
    const id = nextCallId();
    emitCall(agent, { type: "start", id, steps: stepsOf(input) });
    try {
      const result = await execute();
      emitCall(agent, { type: "end", id, result: result as AgentCallResult });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      emitCall(agent, { type: "end", id, result: { ok: false, error: { step: 0, message } } });
      throw error;
    }
  });
  return agent;
}

/** How each Booki agent reports a call that does not go through its own `act`. */
const toolReporters = new WeakMap<
  AgentBridge,
  (input: ActInput, execute: () => Promise<unknown>) => Promise<unknown>
>();

type ToolDefinition = { name?: string; execute?: (input: unknown, call?: unknown) => unknown };

/**
 * Runs `register` with the browser's `registerTool` wrapped, so the `act` tool
 * it registers reports each call to `AgentLog`. Put back right after: the
 * registration is synchronous.
 */
function withReportedTools(agent: AgentBridge, register: () => () => void): () => void {
  const report = toolReporters.get(agent);
  const context = (globalThis as { document?: { modelContext?: Record<string, unknown> } }).document?.modelContext;
  const original = context?.registerTool;
  if (!report || !context || typeof original !== "function") return register();
  const own = Object.hasOwn(context, "registerTool");
  try {
    context.registerTool = function (this: unknown, tool: ToolDefinition, options: unknown) {
      const execute = tool?.execute;
      const wrapped =
        tool?.name === "act" && typeof execute === "function"
          ? {
              ...tool,
              execute: (input: unknown, call?: unknown) => report(input as ActInput, async () => execute(input, call)),
            }
          : tool;
      return (original as (tool: unknown, options: unknown) => unknown).call(this, wrapped, options);
    };
  } catch {
    // A browser that does not let it be wrapped: the tools work, unlisted.
    return register();
  }
  try {
    return register();
  } finally {
    if (own) context.registerTool = original;
    else delete context.registerTool;
  }
}

/** A call's steps as `AgentLog` reads them; anything that is not a step is left out. */
function stepsOf(input: ActInput): AgentCallStep[] {
  if (!Array.isArray(input?.steps)) return [];
  return input.steps
    .filter((step) => step !== null && typeof step === "object")
    .map((step) => ({
      ref: String(step.ref ?? ""),
      action: String(step.action ?? ""),
      args: Array.isArray(step.args) ? step.args : [],
    }));
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
    // `data-person-only` marks a component's own decision button without marking its other actions.
    const confirm =
      button.closest("[data-agent-confirm]")?.getAttribute("data-agent-confirm") ??
      button.closest("[data-person-only]")?.getAttribute("data-person-only");
    if (confirm && isPersonOnly(confirm)) return { confirm, entry };
  }
  return null;
}

/** The audit row for a press on a person's decision. */
function personOnlyRow(person: { confirm: string; entry: Entry }) {
  return {
    action: "agent.person-only",
    target: person.entry.label ?? person.entry.ref,
    detail: `${person.entry.component}.press: ${person.confirm}`,
  };
}

/**
 * The same result with its refusal (`error.message`) and each step's own
 * sentence (`steps[].result`, like `Pressed "Post".`) written in another
 * language. Nothing else is touched: a control's own data stays as it
 * returned it, and the token `pending` (an action still running) stays a token.
 */
function inLanguage(value: ActResult, say: (text: string) => string): ActResult {
  const out: ActResult = { ...value };
  if (value.error && typeof value.error.message === "string") {
    out.error = { ...value.error, message: say(value.error.message) };
  }
  if (Array.isArray(value.steps)) {
    out.steps = value.steps.map((step) => {
      const result = (step as { result?: unknown } | null)?.result;
      // A control's own answer comes back as it is when the catalogue does not know it.
      return typeof result === "string" && result !== "pending" ? { ...(step as object), result: say(result) } : step;
    });
  }
  return out;
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
    return withReportedTools(agent, () => registerWithGate(agent, options as never));
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
      out.push(`+${row.id}${rowSummary(row)}`);
      continue;
    }
    const fields = Object.keys({ ...old, ...row })
      .filter((key) => !same(row[key], old[key]))
      .map((key) => `${key}=${auditValue(row[key], 40)} (was ${auditValue(old[key], 40)})`);
    if (fields.length) out.push(`${row.id}: ${fields.join(", ")}`);
  }
  for (const old of before) if (!next.some((row) => row.id === old.id)) out.push(`-${old.id}${rowSummary(old)}`);
  return out;
}

/**
 * What a record added or removed held, short: its fields with a value, like
 * ` (account=3000, creditMinor=12500)`. Empty fields and zeros are left out, so
 * a voucher line's account and amount fit in the row.
 */
function rowSummary(row: Row): string {
  const fields = Object.entries(row)
    .filter(([key, value]) => key !== "id" && value !== undefined && value !== null && value !== "" && value !== 0)
    .filter(([, value]) => !(isPlain(value) && Object.keys(value).length === 0))
    .map(([key, value]) => `${key}=${auditValue(value, 40)}`);
  return fields.length ? ` (${fields.join(", ")})` : "";
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
  // Who it is for is read when the undo is asked for; it is marked when its turn starts,
  // after any agent turn already running or waiting on the same bridge.
  const asPerson = <T>(run: () => Promise<T>): Promise<T> => {
    const who = (typeof by === "function" ? by() : by) || "person";
    return inTurn(bridge, async () => {
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
    });
  };
  return {
    ...history,
    seek: (to: number) => asPerson(() => history.seek(to)),
    undoSource: (source: string) => asPerson(() => history.undoSource(source)),
    /**
     * Undoes one entry, by id, only while it is still the latest applied change.
     * Checked when its turn runs, not when it is asked for: a change a person
     * makes while an agent turn holds the undo back is kept, and the undo is
     * refused (`history.later-changes`). An unknown id is refused with the ids there are.
     */
    undoEntry: (id: string) =>
      asPerson(async () => {
        const entries = history.entries();
        const index = entries.findIndex((item) => item.id === id);
        if (index < 0) {
          throw new BookiError("history.no-entry", {
            id,
            entries: entries.map((item) => item.id).join(", ") || msg("word.none"),
          });
        }
        if (index !== history.position() - 1) throw new BookiError("history.later-changes", { id });
        return history.seek(index);
      }),
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
