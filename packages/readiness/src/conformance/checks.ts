import { PERSON_ACTION } from "../audit.js";
import { findSecrets } from "../secrets.js";
import type { ConformanceTarget } from "./run.js";
import { PERSON_ONLY_PERMISSIONS } from "./permissions.js";
import type { ActResult, ActStep, BridgeComponent, BridgeEvent, ServerActor } from "./types.js";

export type CheckOutcome = { status: "pass" | "fail" | "skip"; message: string };

export type ConformanceCheck = {
  id: string;
  section: string;
  level: "MUST" | "SHOULD";
  run: (target: ConformanceTarget) => Promise<CheckOutcome>;
};

const pass = (message: string): CheckOutcome => ({ status: "pass", message });
const fail = (message: string): CheckOutcome => ({ status: "fail", message });
const skip = (message: string): CheckOutcome => ({ status: "skip", message });

const UNKNOWN = "__conformance_unknown__";

async function components(target: ConformanceTarget): Promise<BridgeComponent[]> {
  const snap = await target.bridge.snapshot();
  if (!Array.isArray(snap)) throw new Error("snapshot() did not return an array");
  return snap as BridgeComponent[];
}

async function act(target: ConformanceTarget, step: ActStep): Promise<ActResult> {
  return await target.bridge.act({ steps: [step] });
}

const isRefusal = (result: ActResult | undefined): boolean =>
  result !== undefined &&
  result !== null &&
  result.ok === false &&
  typeof result.error?.message === "string" &&
  result.error.message.length > 0;

const isNamed = (value: unknown): value is string => typeof value === "string" && value.length > 0;

// A state key that holds an amount in minor units, or a date.
const isMinorKey = (key: string) => key === "minor" || key.endsWith("Minor");
const isDateKey = (key: string) => key === "date" || key.endsWith("Date");
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const checks: ConformanceCheck[] = [
  {
    id: "bridge-shape",
    section: "2",
    level: "MUST",
    run: async (target) => {
      const bridge = target.bridge as unknown as Record<string, unknown> | undefined;
      const missing = ["snapshot", "act", "subscribe"].filter((name) => typeof bridge?.[name] !== "function");
      if (missing.length > 0) return fail(`Missing functions: ${missing.join(", ")}.`);
      const snap = await target.bridge.snapshot();
      if (!Array.isArray(snap)) return fail("snapshot() must return an array of components.");
      return pass(`snapshot, act and subscribe are functions; snapshot returns ${snap.length} components.`);
    },
  },
  {
    id: "snapshot-named",
    section: "3.1",
    level: "MUST",
    run: async (target) => {
      const snap = await components(target);
      const offenders: string[] = [];
      for (const [index, c] of snap.entries()) {
        const name = isNamed(c?.ref) ? c.ref : `#${index}`;
        const ok =
          isNamed(c?.ref) &&
          isNamed(c.component) &&
          isNamed(c.label) &&
          Array.isArray(c.actions) &&
          c.actions.every((a) => typeof a === "string");
        if (!ok) offenders.push(name);
      }
      const labels = snap.map((c) => c?.label).filter(isNamed);
      const duplicates = [...new Set(labels.filter((label, i) => labels.indexOf(label) !== i))];
      if (offenders.length > 0) {
        return fail(`Components without a non-empty ref, component, label or string actions: ${offenders.join(", ")}.`);
      }
      if (duplicates.length > 0) return fail(`Labels shared by more than one component: ${duplicates.join(", ")}.`);
      return pass(`All ${snap.length} components have a ref, component, label and string actions; labels are unique.`);
    },
  },
  {
    id: "snapshot-values",
    section: "3.2",
    level: "MUST",
    run: async (target) => {
      const snap = await components(target);
      const bad: string[] = [];
      for (const c of snap) {
        for (const [key, value] of Object.entries(c)) {
          if (isMinorKey(key) && !(value === null || Number.isInteger(value))) {
            bad.push(`${c.ref}.${key}=${JSON.stringify(value)}`);
          }
          if (isDateKey(key) && !(value === null || (typeof value === "string" && DATE.test(value)))) {
            bad.push(`${c.ref}.${key}=${JSON.stringify(value)}`);
          }
          if (value !== null && typeof value === "object" && !Array.isArray(value)) {
            for (const [inner, innerValue] of Object.entries(value as Record<string, unknown>)) {
              if (isMinorKey(inner) && !(innerValue === null || Number.isInteger(innerValue))) {
                bad.push(`${c.ref}.${key}.${inner}=${JSON.stringify(innerValue)}`);
              }
            }
          }
        }
      }
      if (bad.length > 0) {
        return fail(`Minor-unit values must be integers or null, dates YYYY-MM-DD or null: ${bad.join("; ")}.`);
      }
      return pass("Minor-unit values are integers or null, and dates are YYYY-MM-DD or null.");
    },
  },
  {
    id: "snapshot-secrets",
    section: "3.5",
    level: "MUST",
    run: async (target) => {
      const snap = await components(target);
      const json = JSON.stringify(snap);
      const literal = (target.secrets ?? []).filter((s) => typeof s === "string" && s.length > 0);
      const leaked = literal.filter((s) => json.includes(s));
      const found = findSecrets(json).map((hit) => hit.kind);
      if (leaked.length > 0 || found.length > 0) {
        const parts: string[] = [];
        if (leaked.length > 0) parts.push(`${leaked.length} literal secret(s)`);
        if (found.length > 0) parts.push(`secret pattern(s): ${[...new Set(found)].join(", ")}`);
        return fail(`The snapshot shows secrets: ${parts.join("; ")}.`);
      }
      const note = literal.length === 0 ? " No literal secrets were given, so only patterns were checked." : "";
      return pass(`The snapshot shows no secrets.${note}`);
    },
  },
  {
    id: "act-never-throws",
    section: "4.5",
    level: "MUST",
    run: async (target) => {
      const snap = await components(target);
      const probes: Array<{ name: string; step: ActStep }> = [
        { name: "unknown ref", step: { ref: UNKNOWN, action: UNKNOWN } },
      ];
      if (snap.length === 0) {
        return skip("The bridge has no components, so the unknown-action probe was not run.");
      }
      probes.push({ name: "unknown action", step: { ref: snap[0].ref, action: UNKNOWN } });
      const bad: string[] = [];
      for (const probe of probes) {
        let result: ActResult;
        try {
          result = await act(target, probe.step);
        } catch (error) {
          return fail(`act() threw on ${probe.name}: ${error instanceof Error ? error.message : String(error)}`);
        }
        if (!isRefusal(result)) bad.push(probe.name);
      }
      if (bad.length > 0) return fail(`act() did not refuse with ok:false and a message on: ${bad.join(", ")}.`);
      return pass("act() refuses unknown refs and actions with ok:false and a message, without throwing.");
    },
  },
  {
    id: "refusal-names-valid",
    section: "12.2",
    level: "MUST",
    run: async (target) => {
      const snap = await components(target);
      if (snap.length === 0) return skip("The bridge has no components to check refusals against.");
      const first = snap[0];
      const actions = first.actions;
      const needed = actions.length > 5 ? 5 : actions.length;
      const unknownAction = await act(target, { ref: first.ref, action: UNKNOWN });
      const actionMessage = unknownAction?.error?.message ?? "";
      const named = actions.filter((a) => actionMessage.includes(a));
      if (named.length < needed) {
        return fail(
          `The refusal for an unknown action on "${first.ref}" names ${named.length} of ${actions.length} actions; expected at least ${needed}.`,
        );
      }
      const unknownRef = await act(target, { ref: UNKNOWN, action: UNKNOWN });
      const refMessage = unknownRef?.error?.message ?? "";
      const labels = snap.map((c) => c.label);
      if (!labels.some((label) => refMessage.includes(label))) {
        return fail(`The refusal for an unknown ref names none of the existing labels: ${labels.join(", ")}.`);
      }
      return pass(`Refusals name the valid actions (${named.length} of ${actions.length}) and existing controls.`);
    },
  },
  {
    id: "amount-minor-only",
    section: "4.2",
    level: "MUST",
    run: async (target) => {
      const snap = await components(target);
      const amounts = snap.filter((c) => c.actions.includes("setMinor"));
      if (amounts.length === 0) return skip("No component offers setMinor.");
      const accepted: string[] = [];
      for (const c of amounts) {
        for (const value of [12.5, "1 500,00"]) {
          const result = await act(target, { ref: c.ref, action: "setMinor", args: [value] });
          if (result?.ok !== false) accepted.push(`${c.ref} setMinor(${JSON.stringify(value)})`);
        }
      }
      if (accepted.length > 0) {
        return fail(`setMinor accepted a value that is not whole minor units: ${accepted.join("; ")}.`);
      }
      return pass(`setMinor refuses fractions and formatted text on ${amounts.length} component(s).`);
    },
  },
  {
    id: "closed-list",
    section: "4.3",
    level: "MUST",
    run: async (target) => {
      if (!target.closedList) return skip("No closedList probe was given.");
      const { step, valid } = target.closedList;
      const result = await act(target, step);
      if (result?.ok !== false) return fail(`A bad value for ${step.ref} was accepted.`);
      const message = result.error?.message ?? "";
      const missing = valid.filter((choice) => !message.includes(choice));
      if (missing.length > 0) {
        return fail(`The refusal does not name the valid choices: ${missing.join(", ")}.`);
      }
      return pass(`The refusal for ${step.ref} names all ${valid.length} valid choices.`);
    },
  },
  {
    id: "person-only-not-offered",
    section: "5.1",
    level: "MUST",
    run: async (target) => {
      const snap = await components(target);
      const offered = snap.flatMap((c) => c.actions.filter((a) => PERSON_ACTION.test(a)).map((a) => `${c.ref}.${a}`));
      if (offered.length > 0) {
        return fail(`An agent is offered person-only actions: ${offered.join(", ")}.`);
      }
      if (!target.personOnly) {
        return pass("No person-only action is offered. personOnly was not given, so the refusal part was skipped.");
      }
      const accepted: string[] = [];
      for (const step of target.personOnly) {
        const result = await act(target, step);
        if (result?.ok !== false) accepted.push(`${step.ref}.${step.action}`);
      }
      if (accepted.length > 0) {
        return fail(`An agent was allowed to perform person-only steps: ${accepted.join(", ")}.`);
      }
      return pass(`No person-only action is offered, and ${target.personOnly.length} person-only step(s) are refused.`);
    },
  },
  {
    id: "recording-agent",
    section: "6.1",
    level: "MUST",
    run: async (target) => {
      if (!target.drive) return skip("No drive step was given.");
      const normalize = target.normalizeEvent ?? ((raw: unknown) => raw as BridgeEvent);
      const events: BridgeEvent[] = [];
      const unsubscribe = target.bridge.subscribe((raw) => {
        events.push(normalize(raw));
      });
      try {
        const result = await act(target, target.drive);
        if (result?.ok !== true) {
          return fail(`The drive step was not performed: ${result?.error?.message ?? "no message"}.`);
        }
        const agentEvents = events.filter((e) => e.source === "agent");
        if (agentEvents.length !== 1) {
          return fail(`Expected exactly one agent event for the drive step, got ${agentEvents.length}.`);
        }
        const [event] = agentEvents;
        if (typeof event.actor !== "string" || !event.actor.startsWith("agent:")) {
          return fail(`The agent event has actor ${JSON.stringify(event.actor)}; it must start with "agent:".`);
        }
        return pass(`One agent event recorded with actor ${event.actor}.`);
      } finally {
        if (typeof unsubscribe === "function") unsubscribe();
      }
    },
  },
  {
    id: "server-person-only",
    section: "5.1",
    level: "MUST",
    run: async (target) => {
      if (!target.server) return skip("No server gate was given.");
      const actor: ServerActor = { kind: "agent", id: "conformance", roles: ["owner"] };
      const notRefused: string[] = [];
      for (const permission of PERSON_ONLY_PERMISSIONS) {
        const answer = await target.server(actor, permission);
        if (answer?.status !== 403) notRefused.push(`${permission} (${answer?.status})`);
      }
      if (notRefused.length > 0) {
        return fail(`The server did not refuse an agent for: ${notRefused.join(", ")}.`);
      }
      return pass(
        `The server refuses an agent with 403 for all ${PERSON_ONLY_PERMISSIONS.length} person-only permissions.`,
      );
    },
  },
  {
    id: "server-unsigned",
    section: "7.3",
    level: "SHOULD",
    run: async (target) => {
      if (!target.server) return skip("No server gate was given.");
      const answer = await target.server(null, "approval.decide");
      if (answer?.status !== 401) return fail(`An unsigned request got ${answer?.status}, expected 401.`);
      return pass("An unsigned request is refused with 401.");
    },
  },
];

export const CONFORMANCE_CHECKS: readonly ConformanceCheck[] = checks;
