import { PERSON_ONLY_PERMISSIONS } from "../conformance/permissions.js";
import type {
  ActResult,
  ActStep,
  BridgeComponent,
  BridgeEvent,
  ServerActor,
  ServerAnswer,
} from "../conformance/types.js";

/**
 * A small in-memory implementation of the Agent Contract. It shows how little an
 * implementer needs: four controls, a bridge, an audit log and a server check.
 * It imports nothing but the contract's own types and permission list, and the
 * conformance suite is run against it.
 */

export type Locale = "en" | "nb";

export type ReferenceOptions = {
  agentId?: string;
  onBehalfOf?: string;
  locale?: Locale;
};

// The reference answers synchronously, which is a valid AgentBridge.
export type SyncBridge = {
  snapshot(): BridgeComponent[];
  act(input: { steps: ActStep[] }): ActResult;
  subscribe(listener: (event: BridgeEvent) => void): () => void;
};

export type Reference = {
  bridge: SyncBridge;
  person: { click(ref: string, action: string, args?: unknown[]): ActResult; id: string };
  audit: BridgeEvent[];
  server(actor: ServerActor | null, permission: string): ServerAnswer;
};

const PERSON_ID = "person:anna";
const ACCOUNTS = ["1920", "6800"];
const MAX_MINOR = 99_999_999_999;
const REDACTED = "[redacted]";

type Messages = {
  noSteps: string;
  unknownRef: (ref: string, refs: string[]) => string;
  unknownAction: (ref: string, action: string, actions: string[]) => string;
  minorUnits: string;
  unknownAccount: (code: string) => string;
  bankText: string;
  pending: string;
  notSignedIn: string;
  personOnly: (permission: string) => string;
  role: (permission: string) => string;
};

const MESSAGES: Record<Locale, Messages> = {
  en: {
    noSteps: "Send a list of steps.",
    unknownRef: (ref, refs) => `No control named "${ref}". Controls: ${refs.join(", ")}.`,
    unknownAction: (ref, action, actions) => `"${ref}" has no action "${action}". Actions: ${actions.join(", ")}.`,
    minorUnits: "Amount must be a whole number of minor units (ore), for example 155000 for 1550.00, not 12.5.",
    unknownAccount: (code) => `Unknown account "${code}". Valid accounts: ${ACCOUNTS.join(", ")}.`,
    bankText: "Bank account must be a text value.",
    pending: "Approval is still pending.",
    notSignedIn: "Sign in first.",
    personOnly: (permission) => `An agent cannot do "${permission}". A person must do it.`,
    role: (permission) => `Your role does not allow "${permission}".`,
  },
  nb: {
    noSteps: "Send en liste med steg.",
    unknownRef: (ref, refs) => `Finner ingen kontroll som heter "${ref}". Kontroller: ${refs.join(", ")}.`,
    unknownAction: (ref, action, actions) =>
      `"${ref}" har ingen handling "${action}". Handlinger: ${actions.join(", ")}.`,
    minorUnits: "Beløpet må være et helt antall minorenheter (øre), for eksempel 155000 for 1550,00, ikke 12,5.",
    unknownAccount: (code) => `Ukjent konto "${code}". Gyldige kontoer: ${ACCOUNTS.join(", ")}.`,
    bankText: "Bankkontoen må være en tekstverdi.",
    pending: "Godkjenningen venter fortsatt.",
    notSignedIn: "Logg inn først.",
    personOnly: (permission) => `En agent kan ikke gjøre "${permission}". En person må gjøre det.`,
    role: (permission) => `Rollen din gir ikke tilgang til "${permission}".`,
  },
};

type ControlDef = { ref: string; component: string; actions: string[] };

const CONTROLS: ControlDef[] = [
  { ref: "Amount", component: "amount-field", actions: ["clear", "setMinor"] },
  { ref: "Account", component: "account-picker", actions: ["clear", "setAccount"] },
  { ref: "Bank account", component: "bank-account", actions: ["clear", "setAccount"] },
  { ref: "Approval", component: "approval-chain", actions: ["assertApproved"] },
];

type State = {
  minor: number | null;
  account: string | null;
  bankAccount: string | null;
  status: "pending" | "approved";
};

const isMinor = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= MAX_MINOR;

const isAccount = (value: unknown): value is string => typeof value === "string" && ACCOUNTS.includes(value);

export function createReference(options: ReferenceOptions = {}): Reference {
  const agentId = options.agentId ?? "reference-agent";
  const locale: Locale = options.locale ?? "en";
  const msg = MESSAGES[locale];

  const state: State = { minor: null, account: null, bankAccount: null, status: "pending" };
  const audit: BridgeEvent[] = [];
  const listeners = new Set<(event: BridgeEvent) => void>();

  // Returns a refusal sentence, or null when the change was made.
  function apply(ref: string, action: string, args: unknown[], by: "agent" | "person"): string | null {
    const def = CONTROLS.find((c) => c.ref === ref);
    if (!def)
      return msg.unknownRef(
        ref,
        CONTROLS.map((c) => c.ref),
      );

    // The one place approval happens: a person's click. Agents never get this action.
    const personApprove = by === "person" && ref === "Approval" && action === "approve";
    if (!personApprove && !def.actions.includes(action)) {
      return msg.unknownAction(ref, action, def.actions);
    }

    const [value] = args;
    switch (ref) {
      case "Amount":
        if (action === "clear") state.minor = null;
        else if (!isMinor(value)) return msg.minorUnits;
        else state.minor = value;
        return null;
      case "Account":
        if (action === "clear") state.account = null;
        else if (!isAccount(value)) return msg.unknownAccount(String(value));
        else state.account = value;
        return null;
      case "Bank account":
        if (action === "clear") state.bankAccount = null;
        else if (typeof value !== "string" || value.trim() === "") return msg.bankText;
        else state.bankAccount = value;
        return null;
      case "Approval":
        if (personApprove) {
          state.status = "approved";
          return null;
        }
        return state.status === "pending" ? msg.pending : null;
    }
    return null;
  }

  function perform(ref: string, action: string, args: unknown[], by: "agent" | "person"): ActResult {
    const refusal = apply(ref, action, args, by);
    if (refusal !== null) return { ok: false, error: { message: refusal } };

    const event: BridgeEvent =
      by === "agent"
        ? {
            source: "agent",
            ref,
            action,
            actor: `agent:${agentId}`,
            ...(options.onBehalfOf !== undefined ? { onBehalfOf: options.onBehalfOf } : {}),
          }
        : { source: "person", ref, action, actor: PERSON_ID };
    audit.push(event);
    for (const listener of listeners) listener(event);
    return { ok: true };
  }

  // Fresh objects on every call, so a caller mutating them changes nothing here.
  // The bank account value is never returned, only whether one is set.
  function snapshot(): BridgeComponent[] {
    return [
      {
        ref: "Amount",
        component: "amount-field",
        label: "Amount",
        actions: [...CONTROLS[0].actions],
        minor: state.minor,
        currency: "NOK",
        unit: "minor",
      },
      {
        ref: "Account",
        component: "account-picker",
        label: "Account",
        actions: [...CONTROLS[1].actions],
        account: state.account,
        options: [...ACCOUNTS],
      },
      {
        ref: "Bank account",
        component: "bank-account",
        label: "Bank account",
        actions: [...CONTROLS[2].actions],
        account: REDACTED,
        isSet: state.bankAccount !== null,
      },
      {
        ref: "Approval",
        component: "approval-chain",
        label: "Approval",
        actions: [...CONTROLS[3].actions],
        status: state.status,
      },
    ];
  }

  const bridge: SyncBridge = {
    snapshot,
    act(input) {
      const steps: unknown = input?.steps;
      if (!Array.isArray(steps)) return { ok: false, error: { message: msg.noSteps } };
      for (const step of steps as Array<Partial<ActStep> | null>) {
        const args = Array.isArray(step?.args) ? (step?.args as unknown[]) : [];
        const result = perform(String(step?.ref ?? ""), String(step?.action ?? ""), args, "agent");
        if (!result.ok) return result;
      }
      return { ok: true };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  const person = {
    id: PERSON_ID,
    click: (ref: string, action: string, args: unknown[] = []) => perform(ref, action, args, "person"),
  };

  function server(actor: ServerActor | null, permission: string): ServerAnswer {
    if (actor === null) return { status: 401, code: "not-signed-in", message: msg.notSignedIn };
    if (actor.kind === "agent" && PERSON_ONLY_PERMISSIONS.includes(permission)) {
      return { status: 403, code: "person-only", message: msg.personOnly(permission) };
    }
    if (actor.kind === "person" && !actor.roles.includes(permission)) {
      return { status: 403, code: "role", message: msg.role(permission) };
    }
    return { status: 200 };
  }

  return { bridge, person, audit, server };
}
