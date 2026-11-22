import { localToday } from "@booki/core/financial-date";
import {
  acceptException,
  addExpenseLine,
  approveClaim,
  assertSubmittable,
  claimIssues,
  lineAmountMinor,
  policyExceptions,
  rejectClaim,
  removeExpenseLine,
  setExpenseLine,
  submitClaim,
  type AcceptedException,
  type ExpenseClaim as Claim,
  type ExpenseLineInput,
  type ExpensePolicy,
  type ExpenseRule,
  type PolicyException,
} from "@booki/core/expense";
import { minorDigitsFor, parseToMinor } from "@booki/core/money";
import { createChange, definePrimitive } from "@ui-sdk/core";
import { refuseDenied } from "./access.js";

export type Options = {
  claim?: Claim;
  defaultClaim?: Claim;
  /** Categories, limits and rates. Mileage and per-diem amounts come from here. */
  policy?: ExpensePolicy;
  /** Today as YYYY-MM-DD, for the "in the future" rule. Defaults to the clock. */
  today?: string;
  /** Id of the person at the keyboard. The claimant cannot accept exceptions or approve. */
  actor?: string;
  /** Person's methods their role does not allow, with the reason. Filled by `BookiAccessProvider`. */
  denied?: Record<string, string>;
  /** Locale a person's typed amounts are read in, e.g. "nb-NO". */
  locale?: string;
  onClaimChange?: (claim: Claim, details: { reason: string; source?: string; cancel?: () => void }) => void;
};

export const EMPTY: Claim = {
  id: "",
  claimantId: "",
  status: "draft",
  currency: "",
  periodStart: "",
  periodEnd: "",
  lines: [],
  acceptedExceptions: [],
};
export const NO_POLICY: ExpensePolicy = { categories: {} };

/** A policy exception and, once someone accepted it, who and why. */
export type ExpenseExceptionState = PolicyException & {
  accepted: boolean;
  acceptedBy?: string;
  reason?: string;
};

export const policyOf = (options: Options) => options.policy ?? NO_POLICY;
export const todayOf = (options: Options) => options.today ?? localToday();

export function derive(claim: Claim, options: Options) {
  const policy = policyOf(options);
  const amounts: Record<string, number> = {};
  let totalMinor = 0;
  for (const line of claim.lines) {
    let minor = 0;
    try {
      minor = lineAmountMinor(line, policy);
    } catch {
      /* listed under issues */
    }
    amounts[line.id] = minor;
    totalMinor += minor;
  }
  const exceptions = policyExceptions(claim, policy, todayOf(options)).map((exception): ExpenseExceptionState => {
    const accepted = claim.acceptedExceptions.find(
      (a: AcceptedException) => a.lineId === exception.lineId && a.rule === exception.rule,
    );
    return accepted
      ? { ...exception, accepted: true, acceptedBy: accepted.acceptedBy, reason: accepted.reason }
      : { ...exception, accepted: false };
  });
  const issues = claimIssues(claim, policy);
  return {
    amounts,
    totalMinor,
    exceptions,
    issues,
    submittable: claim.status === "draft" && issues.length === 0,
    approvable: claim.status === "submitted" && issues.length === 0 && exceptions.every((e) => e.accepted),
  };
}

/** "lineId|field" → both halves, split at the last "|". */
export function splitCell(cell: string): [string, string] {
  const at = cell.lastIndexOf("|");
  return at < 0 ? [cell, ""] : [cell.slice(0, at), cell.slice(at + 1)];
}

/** Line cells close with the draft; reasons stay open while a decision can be made. */
export function closed(status: Claim["status"], cell: string): boolean {
  const [, field] = splitCell(cell);
  if (field === "rejectReason") return status !== "submitted";
  if (field === "reason") return status !== "draft" && status !== "submitted";
  return status !== "draft";
}

/** Cells that are only ever a draft: the new-line row and the reasons. */
export const heldAsDraft = (id: string, field: string) =>
  id === "new" || field === "reason" || field === "rejectReason";

/** How to write a line, shown in the snapshot. Money in minor units; distance in km as people say it. */
export const LINE_FORMAT =
  'addLine({ kind: "expense", date: "2026-01-15", category, description, amountMinor: 45000 }); mileage: distanceKm; per-diem: days, rate';

/**
 * An expense claim an agent can prepare. Mileage and per-diem amounts are
 * computed from the policy and never typed; lines that break the policy show
 * up as `exceptions`. An agent may add, change and remove lines on a draft and
 * ask `assertSubmittable`. Submitting, approving, rejecting and accepting a
 * policy exception are a person's buttons, not agent actions, and the claimant
 * cannot accept their own exception or approve their own claim.
 */
export const expenseClaim = definePrimitive({
  name: "expense-claim",
  options: {
    claim: "value",
    defaultClaim: "value",
    policy: "value",
    today: "string",
    actor: "string",
    denied: "value",
    locale: "string",
    onClaimChange: "callback",
  },
  controlled: ["claim", "amounts", "totalMinor", "exceptions", "issues", "submittable", "approvable", "lineFormat"],
  state: (options: Options) => {
    const claim = options.claim ?? options.defaultClaim ?? EMPTY;
    return {
      claim,
      policy: policyOf(options),
      locale: options.locale ?? "en-US",
      refusal: "",
      drafts: {} as Record<string, string>,
      // Read before the first try, so an agent writes a line right the first time.
      lineFormat: LINE_FORMAT,
      ...derive(claim, options),
    };
  },
  sync: (options: Options) =>
    options.claim === undefined ? {} : { claim: options.claim, ...derive(options.claim, options) },
  api: (context) => {
    const change = createChange(context);
    const policy = () => policyOf(context.options());
    const today = () => todayOf(context.options());
    context.onOptions(() => {
      const options = context.options();
      const state = context.store.get();
      if (options.locale && options.locale !== state.locale) context.store.set({ locale: options.locale });
      // A new policy reprices the lines and may change the exceptions.
      if (policyOf(options) !== state.policy) {
        context.store.set({ policy: policyOf(options), ...derive(state.claim, options) });
      }
    });
    const commit = (next: Claim, reason: string, event?: Event) => {
      const ok = change("claim", next, { reason, event });
      if (ok) context.store.set({ refusal: "", ...derive(next, context.options()) });
      return ok;
    };
    const shown = <T>(run: () => T): T => {
      try {
        return run();
      } catch (error) {
        context.store.set({ refusal: (error as Error).message });
        throw error;
      }
    };
    /** A person's button their role does not allow is refused before it runs. */
    const gated = <T>(method: string, run: () => T): T =>
      shown(() => {
        refuseDenied(context.options(), method);
        return run();
      });
    const claim = () => context.store.get().claim;
    const actor = () => String(context.options().actor ?? "");
    const add = (line: ExpenseLineInput, event?: Event) =>
      commit(addExpenseLine(claim(), line, policy()), "add-line", event);
    const set = (lineId: string, patch: Record<string, unknown>, event?: Event) =>
      commit(setExpenseLine(claim(), lineId, patch, policy()), "set-line", event);
    const remove = (lineId: string, event?: Event) => commit(removeExpenseLine(claim(), lineId), "remove-line", event);
    const amount = (text: string) => {
      const minor = parseToMinor(text, claim().currency, { locale: context.store.get().locale });
      if (minor === null) throw new Error(`"${text}" is not an amount.`);
      return minor;
    };
    /** Kilometres as typed (12,5) to whole metres. */
    const metres = (text: string) => {
      const km = Number(text.trim().replace(/\s/g, "").replace(",", "."));
      if (text.trim() === "" || !Number.isFinite(km)) throw new Error(`"${text}" is not a distance in kilometres.`);
      return Math.round(km * 1000);
    };
    const whole = (text: string) => {
      if (!/^\d+$/.test(text.trim())) throw new Error(`"${text}" is not a whole number of days.`);
      return Number(text.trim());
    };

    return {
      /**
       * Agent: add a line to a draft. One object:
       * `{kind:"expense", date, category, description, amountMinor, receiptId?}`,
       * `{kind:"mileage", date, description, distanceMeters}` or
       * `{kind:"per-diem", date, description, days, rate}`.
       */
      addLine: (line: ExpenseLineInput) => add(line),
      /** Agent: change fields of a line. Its kind stays. */
      setLine: (lineId: string, patch: Record<string, unknown>) => set(lineId, patch),
      removeLine: (lineId: string) => remove(lineId),
      /** Agent: throws with what stops the draft from being submitted; else the total and the open exceptions. */
      assertSubmittable: () => {
        assertSubmittable(claim(), policy());
        const state = context.store.get();
        return { totalMinor: state.totalMinor, exceptions: state.exceptions.filter((e) => !e.accepted) };
      },
      // Everything below is for a person using the composed claim. It is not
      // in `agent.actions`, so the bridge refuses a step that names it.
      /** Adds the line typed in the new-line row. */
      addByPerson: (event?: Event) =>
        shown(() => {
          const { drafts } = context.store.get();
          const rules = policy();
          const kind = drafts["new|kind"] ?? "expense";
          const base = { date: (drafts["new|date"] ?? "").trim(), description: drafts["new|description"] ?? "" };
          const value = drafts["new|value"] ?? "";
          const ok =
            kind === "mileage"
              ? add({ ...base, kind, distanceMeters: metres(value) }, event)
              : kind === "per-diem"
                ? add(
                    {
                      ...base,
                      kind,
                      days: whole(value),
                      rate: drafts["new|rate"] ?? Object.keys(rules.perDiemRates ?? {})[0] ?? "",
                    },
                    event,
                  )
                : add(
                    {
                      ...base,
                      kind: "expense",
                      category: drafts["new|category"] ?? Object.keys(rules.categories)[0] ?? "",
                      amountMinor: amount(value),
                    },
                    event,
                  );
          if (ok) {
            const kept = Object.fromEntries(
              Object.entries(context.store.get().drafts).filter(
                ([cell]) => !cell.startsWith("new|") || cell === "new|kind",
              ),
            );
            context.store.set({ drafts: kept });
          }
          return ok;
        }),
      removeByPerson: (lineId: string, event?: Event) => shown(() => remove(lineId, event)),
      /** A list was changed: the new-line row keeps it as a draft, a line takes it at once. */
      pick: (cell: string, value: string, event?: Event) => {
        const [id, field] = splitCell(cell);
        if (id === "new") {
          context.store.set({ drafts: { ...context.store.get().drafts, [cell]: value } });
          return true;
        }
        return shown(() => set(id, { [field]: value }, event));
      },
      /** Hold what is being typed in a cell until blur or Enter. */
      setDraft: (cell: string, text: string) => {
        if (closed(context.store.get().claim.status, cell)) return;
        context.store.set({ drafts: { ...context.store.get().drafts, [cell]: text } });
      },
      /** Commit a typed cell. Refused text is dropped and the cell shows the claim again. */
      commitDraft: (cell: string, event?: Event) => {
        const { drafts } = context.store.get();
        const [id, field] = splitCell(cell);
        if (!(cell in drafts) || heldAsDraft(id, field)) return false;
        const { [cell]: text = "", ...rest } = drafts;
        context.store.set({ drafts: rest });
        return shown(() => {
          const line = claim().lines.find((item) => item.id === id);
          if (!line) throw new Error(`No line "${id}".`);
          const same = (current: unknown, next: unknown) => (current === next ? false : null);
          if (field === "date") return same(line.date, text.trim()) ?? set(id, { date: text.trim() }, event);
          if (field === "description") return same(line.description, text) ?? set(id, { description: text }, event);
          if (field === "receiptId") {
            return (
              same((line.kind === "expense" && line.receiptId) || "", text.trim()) ??
              set(id, { receiptId: text.trim() }, event)
            );
          }
          if (line.kind === "mileage")
            return same(line.distanceMeters, metres(text)) ?? set(id, { distanceMeters: metres(text) }, event);
          if (line.kind === "per-diem") return same(line.days, whole(text)) ?? set(id, { days: whole(text) }, event);
          return same(line.amountMinor, amount(text)) ?? set(id, { amountMinor: amount(text) }, event);
        });
      },
      /** Person only. */
      submit: (event?: Event) =>
        shown(() => commit(submitClaim(claim(), actor(), new Date().toISOString(), policy()), "submit-claim", event)),
      /** Person only, and never the claimant. */
      approve: (event?: Event) =>
        gated("approve", () =>
          commit(approveClaim(claim(), actor(), new Date().toISOString(), policy(), today()), "approve-claim", event),
        ),
      /** Person only, and never the claimant. The reason is what was typed in the reason cell. */
      reject: (event?: Event) =>
        gated("reject", () => {
          const { "|rejectReason": reason = "", ...rest } = context.store.get().drafts;
          const ok = commit(rejectClaim(claim(), actor(), reason, new Date().toISOString()), "reject-claim", event);
          if (ok) context.store.set({ drafts: rest });
          return ok;
        }),
      /** Person only, and never the claimant. `key` is "lineId|rule"; the reason is that exception's reason cell. */
      acceptByPerson: (key: string, event?: Event) =>
        gated("acceptByPerson", () => {
          const [lineId, rule] = splitCell(key);
          const cell = `${key}|reason`;
          const { [cell]: reason = "", ...rest } = context.store.get().drafts;
          const ok = commit(
            acceptException(
              claim(),
              lineId,
              rule as ExpenseRule,
              actor(),
              reason,
              new Date().toISOString(),
              policy(),
              today(),
            ),
            "accept-exception",
            event,
          );
          if (ok) context.store.set({ drafts: rest });
          return ok;
        }),
    };
  },
  slots: (slot) => {
    type CellState = { claim: Claim; policy: ExpensePolicy; locale: string; drafts: Record<string, string> };
    const read = (state: CellState, cell: string) => {
      if (cell in state.drafts) return state.drafts[cell] ?? "";
      const [id, field] = splitCell(cell);
      if (id === "new") {
        if (field === "kind") return "expense";
        if (field === "category") return Object.keys(state.policy.categories)[0] ?? "";
        if (field === "rate") return Object.keys(state.policy.perDiemRates ?? {})[0] ?? "";
        return "";
      }
      const line = state.claim.lines.find((item) => item.id === id);
      if (!line || field === "reason") return "";
      if (field === "date") return line.date;
      if (field === "description") return line.description;
      if (field === "category") return line.kind === "expense" ? line.category : "";
      if (field === "rate") return line.kind === "per-diem" ? line.rate : "";
      if (field === "receiptId") return (line.kind === "expense" && line.receiptId) || "";
      if (line.kind === "mileage")
        return new Intl.NumberFormat(state.locale, { maximumFractionDigits: 3, useGrouping: false }).format(
          line.distanceMeters / 1000,
        );
      if (line.kind === "per-diem") return String(line.days);
      const digits = minorDigitsFor(state.claim.currency);
      return new Intl.NumberFormat(state.locale, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(line.amountMinor / 10 ** digits);
    };
    return {
      root: slot({
        role: "group",
        attrs: (state) => ({ "data-status": state.claim.status }),
        state: (state) => ({
          claim: state.claim,
          policy: state.policy,
          amounts: state.amounts,
          totalMinor: state.totalMinor,
          exceptions: state.exceptions,
          issues: state.issues,
          submittable: state.submittable,
          approvable: state.approvable,
          newKind: state.drafts["new|kind"] ?? "expense",
          refusal: state.refusal,
        }),
      }),
      // One text cell per line and field. `value` is "lineId|field" and is the part's key.
      // "new|field" is the new-line row; "lineId|rule|reason" and "|rejectReason" are reasons.
      cell: slot<{ value: string }>({
        props: { value: "string" },
        attrs: (state, part) => ({
          type: "text",
          autoComplete: "off",
          value: read(state, String(part.key)),
          // Read-only, not disabled: ui-sdk treats a component whose fields are
          // all disabled as switched off and would answer an agent with nothing.
          // `setDraft` ignores typing in a closed cell, so the text cannot change.
          "aria-readonly": closed(state.claim.status, String(part.key)) ? "true" : undefined,
        }),
        on: {
          // "input" is the adapter's name for React's onChange.
          input: (event, { api, key }) => {
            api.setDraft(String(key), (event.target as HTMLInputElement).value);
          },
          blur: (event, { api, key }) => {
            try {
              api.commitDraft(String(key), event);
            } catch {
              /* shown in the control */
            }
          },
          keydown: (event, { api, key }) => {
            if ((event as KeyboardEvent).key !== "Enter") return;
            event.preventDefault();
            try {
              api.commitDraft(String(key), event);
            } catch {
              /* shown in the control */
            }
          },
        },
      }),
      // A list: "lineId|category", "lineId|rate", or "new|kind", "new|category", "new|rate".
      pick: slot<{ value: string }>({
        props: { value: "string" },
        attrs: (state, part) => ({ value: read(state, String(part.key)) }),
        on: {
          input: (event, { api, key }) => {
            try {
              api.pick(String(key), (event.target as HTMLSelectElement).value, event);
            } catch {
              /* shown in the control */
            }
          },
        },
      }),
      add: slot({
        attrs: () => ({ type: "button", "data-variant": "secondary" }),
        press: ({ api }, event) => {
          try {
            api.addByPerson(event);
          } catch {
            /* shown in the control */
          }
        },
      }),
      remove: slot<{ value: string }>({
        props: { value: "string" },
        attrs: () => ({ type: "button", "data-variant": "secondary" }),
        press: ({ api, key }, event) => {
          try {
            api.removeByPerson(String(key), event);
          } catch {
            /* shown in the control */
          }
        },
      }),
      // `value` is "lineId|rule".
      accept: slot<{ value: string }>({
        props: { value: "string" },
        attrs: () => ({ type: "button", "data-variant": "secondary" }),
        press: ({ api, key }, event) => {
          try {
            api.acceptByPerson(String(key), event);
          } catch {
            /* shown in the control */
          }
        },
      }),
      submit: slot({
        attrs: () => ({ type: "button" }),
        press: ({ api }, event) => {
          try {
            api.submit(event);
          } catch {
            /* shown in the control */
          }
        },
      }),
      approve: slot({
        attrs: () => ({ type: "button" }),
        press: ({ api }, event) => {
          try {
            api.approve(event);
          } catch {
            /* shown in the control */
          }
        },
      }),
      reject: slot({
        attrs: () => ({ type: "button", "data-variant": "secondary" }),
        press: ({ api }, event) => {
          try {
            api.reject(event);
          } catch {
            /* shown in the control */
          }
        },
      }),
    };
  },
  agent: { actions: ["addLine", "setLine", "removeLine", "assertSubmittable"] },
});
