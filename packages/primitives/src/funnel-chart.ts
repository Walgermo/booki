import { funnel, type FunnelStep, type FunnelStepInput } from "@booki/core/funnel";
import { definePrimitive } from "@ui-sdk/core";
import { createDrill, shownIn } from "./drill.js";

export type Details = { reason: string; source?: string; cancel?: () => void };
export type { FunnelStep, FunnelStepInput };

export type Options = {
  steps?: FunnelStepInput[];
  /** The currency of `valueMinor`, when the steps carry one. */
  currency?: string;
  drill?: string | null;
  defaultDrill?: string | null;
  onDrillChange?: (id: string | null, details: Details) => void;
};

export function derive(options: Options, drill: string | null) {
  const view = funnel(options.steps ?? []);
  return {
    currency: options.currency ?? "",
    steps: view.steps,
    biggestDropId: view.biggestDropId,
    issues: view.issues,
    drilled: drill === null ? null : (view.steps.find((step) => step.id === drill) ?? null),
  };
}

/**
 * A conversion funnel: how many records reached each step, the share of the
 * step before (`stepConversionPct`) and of the first (`overallConversionPct`),
 * the drop-off, and the step that loses the largest share. An agent may
 * `drill` into a step. Nothing here changes the figures.
 */
export const funnelChart = definePrimitive({
  name: "funnel-chart",
  options: {
    steps: "value",
    currency: "string",
    drill: "value",
    defaultDrill: "value",
    onDrillChange: "callback",
  },
  controlled: ["currency", "steps", "biggestDropId", "issues", "drill", "drilled"],
  state: (options: Options) => {
    const drill = options.drill ?? options.defaultDrill ?? null;
    return { drill, refusal: "", ...derive(options, drill) };
  },
  sync: (options: Options) => (options.drill === undefined ? {} : { drill: options.drill }),
  api: (context) => {
    context.onOptions((options) => {
      const drill = options.drill === undefined ? context.store.get().drill : options.drill;
      context.store.set(derive(options, drill));
    });
    const refresh = () => context.store.set({ refusal: "", ...derive(context.options(), context.store.get().drill) });
    const drill = createDrill(
      context as never,
      () => context.store.get().steps.map((step) => step.id),
      "funnel.no-step",
      refresh,
    );
    return {
      /** Agent: drill into one step by id; null clears it. */
      drill: (id: string | null) => drill(id),
      drillByPerson: (id: string | null, event?: Event) => shownIn(context as never, () => drill(id, event)),
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state) => ({ "data-drilled": state.drilled ? "" : undefined }),
      state: (state) => ({ drill: state.drilled ? state.drill : null, refusal: state.refusal }),
    }),
    // One per step. `value` is the step id.
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
