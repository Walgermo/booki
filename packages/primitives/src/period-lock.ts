import {
  assertPostingAllowed,
  periodStatusOn,
  setPeriodStatus,
  type PeriodState,
  type PeriodStatus,
} from "@booki-aui/core/period-lock";
import { createChange, definePrimitive } from "@ui-sdk/core";
import { refuseDenied } from "./access.js";

export type Options = {
  periods?: PeriodState[];
  defaultPeriods?: PeriodState[];
  /** A person's methods their role does not allow, each with the reason. Set by `BookiAccessProvider`. */
  denied?: Record<string, string>;
  onPeriodsChange?: (periods: PeriodState[], details: { reason: string; source?: string; cancel?: () => void }) => void;
};

/**
 * Which periods are open, closed for posting, or locked. An agent can ask
 * `assertPostingAllowed(date)` before it books anything, and reads the closed
 * periods from the snapshot. Closing, locking and reopening a period are a
 * person's buttons, not agent actions.
 */
export const periodLock = definePrimitive({
  name: "period-lock",
  options: { periods: "value", defaultPeriods: "value", denied: "value", onPeriodsChange: "callback" },
  controlled: ["periods"],
  state: (options: Options) => ({
    periods: options.periods ?? options.defaultPeriods ?? [],
    refusal: "",
  }),
  sync: (options: Options) => (options.periods === undefined ? {} : { periods: options.periods }),
  api: (context) => {
    const change = createChange(context);
    return {
      /** Person only. `status` is open, soft-closed or hard-closed. */
      setStatus: (code: string, status: PeriodStatus, event?: Event) => {
        try {
          refuseDenied(context.options(), "setStatus");
          const next = setPeriodStatus(context.store.get().periods, code, status);
          const ok = change("periods", next, { reason: `period-${status}`, event });
          if (ok) context.store.set({ refusal: "" });
          return ok;
        } catch (error) {
          context.store.set({ refusal: (error as Error).message });
          throw error;
        }
      },
      /** Agent: throws when nothing can be posted on this date. */
      assertPostingAllowed: (date: string, mayAdjustClosed?: boolean) => {
        const periods = context.store.get().periods;
        assertPostingAllowed(periods, date, { mayAdjustClosed: mayAdjustClosed === true });
        return periodStatusOn(periods, date);
      },
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      state: (state) => ({ periods: state.periods, refusal: state.refusal }),
    }),
    // One button per period and target status. `value` is "code|status".
    set: slot<{ value: string }>({
      props: { value: "string" },
      attrs: () => ({ type: "button" }),
      press: ({ api, key }, event) => {
        const [code = "", status = "open"] = String(key).split("|");
        try {
          api.setStatus(code, status as PeriodStatus, event);
        } catch {
          /* shown in the control */
        }
      },
    }),
  }),
  agent: { actions: ["assertPostingAllowed"] },
});
