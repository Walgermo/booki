import { localToday } from "@booki/core/financial-date";
import { timeInStage, type PipelineStage, type StageDuration, type StageStay } from "@booki/core/pipeline";
import { definePrimitive } from "@ui-sdk/core";
import { createDrill, shownIn } from "./drill.js";

export type Details = { reason: string; source?: string; cancel?: () => void };
export type { StageDuration, StageStay };

export type Options = {
  stays?: StageStay[];
  stages?: PipelineStage[];
  /** Target days per stage id: deals in the stage longer than this are listed. */
  targets?: Record<string, number>;
  /** Today as YYYY-MM-DD, for stays still running. Defaults to the date now. */
  today?: string;
  drill?: string | null;
  defaultDrill?: string | null;
  onDrillChange?: (stageId: string | null, details: Details) => void;
};

export function derive(options: Options, drill: string | null) {
  const rows = timeInStage(options.stays ?? [], options.stages ?? [], options.today ?? localToday(), options.targets);
  return {
    rows,
    overTarget: rows.flatMap((row) => row.overTarget),
    slowestId:
      rows.reduce<StageDuration | null>(
        (best, row) =>
          row.medianDays !== null && (best === null || row.medianDays > (best.medianDays ?? -1)) ? row : best,
        null,
      )?.stageId ?? null,
    drilled: drill === null ? null : (rows.find((row) => row.stageId === drill) ?? null),
  };
}

/**
 * How long deals stay in each open stage, in whole days: the median and the
 * longest stay, the deals there now, and those longer than the stage's
 * target. An agent may `drill` into a stage. Nothing here changes the deals.
 */
export const stageDuration = definePrimitive({
  name: "stage-duration",
  options: {
    stays: "value",
    stages: "value",
    targets: "value",
    today: "string",
    drill: "value",
    defaultDrill: "value",
    onDrillChange: "callback",
  },
  controlled: ["rows", "overTarget", "slowestId", "drill", "drilled"],
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
      () => context.store.get().rows.map((row) => row.stageId),
      "pipeline.no-stage-row",
      refresh,
    );
    return {
      /** Agent: drill into one stage by id; null clears it. */
      drill: (stageId: string | null) => drill(stageId),
      drillByPerson: (stageId: string | null, event?: Event) => shownIn(context as never, () => drill(stageId, event)),
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state) => ({ "data-drilled": state.drilled ? "" : undefined }),
      state: (state) => ({ drill: state.drilled ? state.drill : null, refusal: state.refusal }),
    }),
    // One per stage. `value` is the stage id.
    stage: slot<{ value: string }>({
      props: { value: "string" },
      attrs: (state, part) => ({
        type: "button",
        "aria-pressed": state.drilled?.stageId === part.key ? "true" : "false",
      }),
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
