import { PERSON_ACTION } from "../person-action.js";
import { findSecrets } from "../secrets.js";
import type { ConformanceTarget } from "./run.js";
import { PERSON_ONLY_PERMISSIONS } from "./permissions.js";
import type { ActResult, ActStep, BridgeComponent, BridgeEvent } from "./types.js";

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
// Controls whose `value` is a date, or an amount in minor units.
const DATE_COMPONENTS = new Set(["financial-date", "field-date"]);
const AMOUNT_COMPONENTS = new Set(["amount-field", "field-amount"]);

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
      // Every level, arrays too (a voucher's lines). A date control's canonical `value` is a
      // date as well; its `formatted` is for people and is not checked.
      const visit = (value: unknown, path: string, key: string, dateValue: boolean) => {
        if (isMinorKey(key) && !(value === null || Number.isInteger(value)))
          bad.push(`${path}=${JSON.stringify(value)}`);
        const isDate = value === null || (typeof value === "string" && DATE.test(value));
        // "" is a date control's "no date".
        if ((isDateKey(key) && !isDate) || (dateValue && !isDate && value !== "")) {
          bad.push(`${path}=${JSON.stringify(value)}`);
        }
        if (Array.isArray(value)) value.forEach((item, i) => visit(item, `${path}[${i}]`, "", false));
        else if (value !== null && typeof value === "object") {
          for (const [inner, innerValue] of Object.entries(value as Record<string, unknown>))
            visit(innerValue, `${path}.${inner}`, inner, false);
        }
      };
      for (const c of snap) {
        const dateControl = DATE_COMPONENTS.has(c.component) || c.kind === "date";
        for (const [key, value] of Object.entries(c))
          visit(value, `${c.ref}.${key}`, key, dateControl && key === "value");
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
      // An amount in minor units can pass a bank account's checksum, so the patterns skip
      // monetary values (and an amount control's `value`, the same number). Literal secrets
      // are still looked for everywhere.
      const withoutAmounts = snap.map((c) =>
        JSON.stringify(c, (key, value) =>
          typeof value === "number" && (isMinorKey(key) || (key === "value" && AMOUNT_COMPONENTS.has(c.component)))
            ? null
            : value,
        ),
      );
      const found = findSecrets(`[${withoutAmounts.join(",")}]`).map((hit) => hit.kind);
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
        // Attribution is per change: a step that changes two values may record two events.
        const agentEvents = events.filter((e) => e.source === "agent");
        if (agentEvents.length === 0) return fail("The drive step recorded no agent event.");
        const unattributed = agentEvents.find((e) => typeof e.actor !== "string" || !e.actor.startsWith("agent:"));
        if (unattributed) {
          return fail(`An agent event has actor ${JSON.stringify(unattributed.actor)}; it must start with "agent:".`);
        }
        const actors = [...new Set(agentEvents.map((e) => e.actor))].join(", ");
        return pass(`${agentEvents.length} agent event(s) recorded, each with an agent actor (${actors}).`);
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
      // An agent holding the roles that would let a person do it, so a 403 comes from the
      // person-only rule and not from a role the probe lacks. A person with the same roles
      // must be let through, or the permission is not verified.
      const notRefused: string[] = [];
      const unverified: string[] = [];
      for (const permission of PERSON_ONLY_PERMISSIONS) {
        const fixture = target.serverActor?.(permission) ?? { id: "conformance", roles: [permission] };
        const answer = await target.server({ kind: "agent", ...fixture }, permission);
        if (answer?.status !== 403) {
          notRefused.push(`${permission} (${answer?.status})`);
          continue;
        }
        const person = await target.server({ kind: "person", ...fixture }, permission);
        const status = person?.status;
        if (!(typeof status === "number" && status >= 200 && status < 300))
          unverified.push(`${permission} (${status})`);
      }
      if (notRefused.length > 0) {
        return fail(`The server did not refuse an agent for: ${notRefused.join(", ")}.`);
      }
      const verified = PERSON_ONLY_PERMISSIONS.length - unverified.length;
      const note =
        unverified.length > 0
          ? ` Not verified, because a person with the same roles was refused too (give serverActor the roles that grant each): ${unverified.join(", ")}.`
          : "";
      if (verified === 0) return skip(`No person-only permission could be verified.${note}`);
      return pass(
        `The server refuses an agent with 403, and lets a person with the same roles through, for ${verified} of ${PERSON_ONLY_PERMISSIONS.length} person-only permissions.${note}`,
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
