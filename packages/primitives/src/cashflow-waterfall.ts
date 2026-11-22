import { createChange, definePrimitive } from "@ui-sdk/core";
import { BookiError } from "@booki/core/msg";
import { waterfall, type WaterfallInput, type WaterfallStep } from "./chart-math.js";

export type Details = { reason: string; source?: string; cancel?: () => void };

/** A movement of cash: positive in, negative out, in minor units. */
export type CashflowStep = WaterfallInput;
export type { WaterfallStep };

export type Options = {
  openingMinor?: number;
  /** The closing balance as booked. Left out, it is opening plus the steps. */
  closingMinor?: number;
  steps?: CashflowStep[];
  currency?: string;
  /** The step drilled into, by id, or null. */
  drill?: string | null;
  defaultDrill?: string | null;
  onDrillChange?: (id: string | null, details: Details) => void;
};

export function check(options: Options) {
  const issues: string[] = [];
  const ids = new Set<string>();
  const steps = (options.steps ?? []).filter((step) => {
    const id = String(step?.id ?? "");
    if (id === "" || id === "opening" || id === "closing" || ids.has(id)) {
      issues.push(
        id === ""
          ? "A step has no id and is left out."
          : ids.has(id)
            ? `Step "${id}" is given twice; the second is left out.`
            : `The id "${id}" is kept for the balance; that step is left out.`,
      );
      return false;
    }
    if (!Number.isSafeInteger(step.amountMinor)) {
      issues.push(`Step "${id}" has an amount that is not whole minor units; it is left out.`);
      return false;
    }
    ids.add(id);
    return true;
  });
  const opening = Number.isSafeInteger(options.openingMinor) ? (options.openingMinor as number) : 0;
  if (options.openingMinor !== undefined && !Number.isSafeInteger(options.openingMinor))
    issues.push("The opening balance is not whole minor units; 0 is used.");
  const closingGiven = Number.isSafeInteger(options.closingMinor);
  if (options.closingMinor !== undefined && !closingGiven)
    issues.push("The closing balance is not whole minor units; it is left out.");
  return {
    opening,
    closing: closingGiven ? (options.closingMinor as number) : null,
    steps: steps.map((step) => ({
      id: String(step.id),
      label: String(step.label ?? step.id),
      amountMinor: step.amountMinor,
    })),
    issues,
  };
}

export function derive(options: Options, drill: string | null) {
  const data = check(options);
  const flow = waterfall(
    data.opening,
    data.steps,
    data.closing ?? data.opening + data.steps.reduce((sum, step) => sum + step.amountMinor, 0),
  );
  return {
    currency: options.currency ?? "",
    openingMinor: data.opening,
    closingMinor: data.closing ?? flow.computedClosingMinor,
    closingGiven: data.closing !== null,
    steps: flow.steps,
    inflowMinor: flow.inflowMinor,
    outflowMinor: flow.outflowMinor,
    netMinor: flow.netMinor,
    computedClosingMinor: flow.computedClosingMinor,
    differenceMinor: flow.differenceMinor,
    reconciles: flow.reconciles,
    drilled: drill === null ? null : (flow.steps.find((step) => step.id === drill) ?? null),
    issues: data.issues,
  };
}

/**
 * Opening balance, cash in and out by category, closing balance. The
 * snapshot holds each step with its running `startMinor` and `endMinor`, the
 * inflow, outflow and net, and whether opening plus the steps `reconciles`
 * to the closing balance, with the `differenceMinor` when it does not. An
 * agent may `drill` into a step. Nothing here changes the figures.
 */
export const cashflowWaterfall = definePrimitive({
  name: "cashflow-waterfall",
  options: {
    openingMinor: "number",
    closingMinor: "number",
    steps: "value",
    currency: "string",
    drill: "value",
    defaultDrill: "value",
    onDrillChange: "callback",
  },
  controlled: [
    "currency",
    "openingMinor",
    "closingMinor",
    "closingGiven",
    "steps",
    "inflowMinor",
    "outflowMinor",
    "netMinor",
    "computedClosingMinor",
    "differenceMinor",
    "reconciles",
    "drill",
    "drilled",
    "issues",
  ],
  state: (options: Options) => {
    const drill = options.drill ?? options.defaultDrill ?? null;
    return { drill, refusal: "", ...derive(options, drill) };
  },
  sync: (options: Options) => (options.drill === undefined ? {} : { drill: options.drill }),
  api: (context) => {
    const change = createChange(context);

    context.onOptions((options) => {
      const drill = options.drill === undefined ? context.store.get().drill : options.drill;
      context.store.set(derive(options, drill));
    });

    const refresh = () => context.store.set({ refusal: "", ...derive(context.options(), context.store.get().drill) });
    const shown = <T>(run: () => T): T => {
      try {
        return run();
      } catch (error) {
        context.store.set({ refusal: (error as Error).message });
        throw error;
      }
    };

    function drill(value: unknown, event?: Event) {
      if (value === null || value === undefined || value === "") {
        const ok = change("drill", null, { reason: "clear-drill", event });
        if (ok) refresh();
        return ok;
      }
      const id = String(value);
      const { steps } = context.store.get();
      if (!steps.some((step) => step.id === id)) {
        const listed = steps.map((step) => step.id);
        throw id === "opening" || id === "closing"
          ? new BookiError("chart.balance-not-step", { id, ids: listed.join(", ") || "none" })
          : new BookiError("chart.no-step", {
              id,
              ids: `${listed.slice(0, 20).join(", ") || "none"}${listed.length > 20 ? `, … (${listed.length})` : ""}`,
            });
      }
      const ok = change("drill", id, { reason: "drill", event });
      if (ok) refresh();
      return ok;
    }

    return {
      /** Agent: drill into one step by id; null clears it. */
      drill: (id: string | null) => drill(id),
      drillByPerson: (id: string | null, event?: Event) => shown(() => drill(id, event)),
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state) => ({
        "data-reconciles": String(state.reconciles),
        "data-drilled": state.drilled ? "" : undefined,
      }),
      state: (state) => ({
        drill: state.drilled ? state.drill : null,
        reconciles: state.reconciles,
        refusal: state.refusal,
      }),
    }),
    // One per step. `value` is the step id and becomes the part's key.
    step: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({ type: "button", "aria-pressed": state.drilled?.id === part.key ? "true" : "false" }),
      press: ({ api, key }, event) => {
        try {
          api.drillByPerson(String(key), event);
        } catch {
          /* shown in the control */
        }
      },
    }),
  }),
  agent: { actions: ["drill"] },
});
