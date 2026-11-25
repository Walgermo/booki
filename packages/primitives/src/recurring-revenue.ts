import { BookiError } from "@booki-aui/core/msg";
import {
  RECURRING_MOVEMENTS,
  assertAgreements,
  recurringBridge,
  recurringCurrencies,
  recurringIssues,
  type RecurringAgreement,
  type RecurringMovement,
} from "@booki-aui/core/recurring";
import { createChange, definePrimitive } from "@ui-sdk/core";
import { createDrill, shownIn } from "./drill.js";

export type Details = { reason: string; source?: string; cancel?: () => void };
export type RecurringView = "mrr" | "arr";
export type { RecurringAgreement, RecurringMovement };

const VIEWS: readonly RecurringView[] = ["mrr", "arr"];

export type Options = {
  agreements?: RecurringAgreement[];
  /** The currency shown. Defaults to the first the agreements are in. */
  currency?: string;
  /** The bridge's start date, YYYY-MM-DD. */
  from?: string;
  /** The bridge's end date, YYYY-MM-DD. */
  to?: string;
  view?: RecurringView;
  defaultView?: RecurringView;
  onViewChange?: (view: RecurringView, details: Details) => void;
  drill?: RecurringMovement | null;
  defaultDrill?: RecurringMovement | null;
  onDrillChange?: (movement: RecurringMovement | null, details: Details) => void;
};

export function derive(options: Options, view: RecurringView, drill: string | null) {
  const agreements = options.agreements ?? [];
  assertAgreements(agreements);
  const currency = options.currency ?? recurringCurrencies(agreements)[0] ?? "NOK";
  const ready = Boolean(options.from && options.to);
  const bridge = ready ? recurringBridge(agreements, options.from!, options.to!, currency) : null;
  const figures = bridge ? bridge[view] : null;
  const movements = RECURRING_MOVEMENTS.map((id) => ({
    id,
    amountMinor: figures ? (figures[`${id}Minor` as `${RecurringMovement}Minor`] as number) : 0,
    customers: bridge ? bridge.customers[id] : [],
  }));
  return {
    currency,
    view,
    from: options.from ?? "",
    to: options.to ?? "",
    openingMinor: figures?.openingMinor ?? 0,
    closingMinor: figures?.closingMinor ?? 0,
    netMinor: figures ? figures.closingMinor - figures.openingMinor : 0,
    roundingMinor: figures?.roundingMinor ?? 0,
    movements,
    reconciles: bridge?.reconciles ?? true,
    issues: recurringIssues(agreements, currency),
    drilled: drill === null ? null : (movements.find((movement) => movement.id === drill) ?? null),
  };
}

/**
 * Recurring revenue from one date to another: opening MRR (or ARR), new,
 * expansion, contraction and churn, and closing, adding up exactly. ARR is
 * summed exactly; MRR is each figure / 12, rounded, and `roundingMinor` says
 * what that moved. Each movement names its customers. An agent may `setView` to "mrr" or "arr"
 * and `drill` into a movement. Nothing here changes the agreements.
 */
export const recurringRevenue = definePrimitive({
  name: "recurring-revenue",
  options: {
    agreements: "value",
    currency: "string",
    from: "string",
    to: "string",
    view: "string",
    defaultView: "string",
    onViewChange: "callback",
    drill: "value",
    defaultDrill: "value",
    onDrillChange: "callback",
  },
  controlled: [
    "currency",
    "view",
    "from",
    "to",
    "openingMinor",
    "closingMinor",
    "netMinor",
    "roundingMinor",
    "movements",
    "reconciles",
    "issues",
    "drill",
    "drilled",
  ],
  state: (options: Options) => {
    const view = options.view ?? options.defaultView ?? "mrr";
    const drill = options.drill ?? options.defaultDrill ?? null;
    return { drill, refusal: "", ...derive(options, view, drill) };
  },
  sync: (options: Options) => ({
    ...(options.view === undefined ? {} : { view: options.view }),
    ...(options.drill === undefined ? {} : { drill: options.drill }),
  }),
  api: (context) => {
    const change = createChange(context);
    const refresh = () => {
      const { view, drill } = context.store.get();
      context.store.set({ refusal: "", ...derive(context.options(), view, drill) });
    };
    context.onOptions((options) => {
      const view = options.view ?? context.store.get().view;
      const drill = options.drill === undefined ? context.store.get().drill : options.drill;
      context.store.set(derive(options, view, drill));
    });
    const drill = createDrill(context as never, () => [...RECURRING_MOVEMENTS], "recurring.no-movement", refresh);
    const setView = (value: unknown, event?: Event) => {
      if (!VIEWS.includes(value as RecurringView)) throw new BookiError("recurring.bad-view", { value: String(value) });
      const ok = change("view", value as RecurringView, { reason: "set-view", event });
      if (ok) refresh();
      return ok;
    };
    return {
      /** Agent: "mrr" (per month) or "arr" (per year, MRR × 12). */
      setView: (view: RecurringView) => setView(view),
      /** Agent: drill into new, expansion, contraction or churn; null clears it. */
      drill: (movement: RecurringMovement | null) => drill(movement),
      setViewByPerson: (view: RecurringView, event?: Event) => shownIn(context as never, () => setView(view, event)),
      drillByPerson: (movement: string | null, event?: Event) =>
        shownIn(context as never, () => drill(movement, event)),
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state) => ({
        "data-view": state.view,
        "data-reconciles": String(state.reconciles),
        "data-drilled": state.drilled ? "" : undefined,
      }),
      state: (state) => ({ view: state.view, drill: state.drilled ? state.drill : null, refusal: state.refusal }),
    }),
    // `value` is the view this button picks.
    view: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({ type: "button", "aria-pressed": state.view === part.key ? "true" : "false" }),
      press: ({ api, key }, event) => {
        try {
          api.setViewByPerson(String(key) as RecurringView, event);
        } catch {
          /* shown in the control */
        }
      },
    }),
    // One per movement. `value` is the movement id.
    movement: slot<{ value: string }>({
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
  agent: { actions: ["setView", "drill"] },
});
