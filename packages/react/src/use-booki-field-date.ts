import { BookiError } from "@booki-aui/core/msg";
import { lockOptions, lockState } from "@booki-aui/primitives/lock";
import { createChange, definePrimitive, dispatch } from "@ui-sdk/core";

/**
 * The date kind of `useBookiField`: a date field the product already has,
 * held as an ISO `YYYY-MM-DD` string.
 *
 * `isIsoDate` is that of `@booki-aui/core/iso-date`, which has no subpath export,
 * so it is written out here: a date must match the pattern and read back the
 * same, so "2026-02-30" is refused.
 *
 * Renders as `<div role="group" data-slot="field-date">`.
 */

export type BookiFieldDateOptions = {
  value?: string;
  /** The field may hold no date: `setDate("")` or `setDate(null)` clears it. */
  allowEmpty?: boolean;
  /** `false`: the root takes no `role="group"`, for a field that has its own labelled group. */
  group?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  onValueChange?: (date: string, details: { reason: string; source?: string }) => void;
};

export type BookiFieldDateState = {
  date: string;
  /** The same date, under the key `expect` compares. */
  value: string;
  refusal: string | null;
  allowEmpty: boolean;
  /** The root is a `role="group"`; false when the product's field has its own. */
  group: boolean;
  disabled: boolean;
  readOnly: boolean;
};

function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export const bookiFieldDate = definePrimitive({
  name: "field-date",
  options: {
    value: "string",
    allowEmpty: "boolean",
    group: "boolean",
    ...lockOptions,
    onValueChange: "callback",
  },
  controlled: ["value", "date", "refusal"],
  state: (options: BookiFieldDateOptions): BookiFieldDateState => ({
    date: options.value ?? "",
    value: options.value ?? "",
    refusal: null,
    allowEmpty: options.allowEmpty ?? false,
    group: options.group ?? true,
    ...lockState(options),
  }),
  sync: (options: BookiFieldDateOptions): Partial<BookiFieldDateState> => {
    const next: Partial<BookiFieldDateState> = { ...lockState(options) };
    if (options.group !== undefined) next.group = options.group;
    if (options.allowEmpty !== undefined) next.allowEmpty = options.allowEmpty;
    if (options.value !== undefined) {
      next.date = options.value;
      next.value = options.value;
    }
    return next;
  },
  api: (context) => {
    const change = createChange(context);

    function commit(next: string, reason: string, event?: Event): boolean {
      const { date } = context.store.get();
      if (next === date) return false;
      // The product hears the change first and may cancel it.
      if (dispatch(context, "onValueChange", next, { reason, event })) return false;
      const ok = change("date", next, { reason, event });
      if (ok) context.store.set({ value: next });
      // Controlled: the product passes the value back through sync; until it
      // does, the field keeps the value it holds.
      if (ok && context.options().value !== undefined) context.store.set({ date, value: date });
      return ok;
    }

    return {
      /**
       * Agent and product path: an ISO date that exists. Throws a sentence that says the format.
       * With `allowEmpty`, "" or null clears it.
       */
      setDate: (value: string | null, event?: Event): boolean => {
        if (context.store.get().allowEmpty && (value === null || value === "")) return commit("", "clear", event);
        if (!isIsoDate(value)) throw new BookiError("date.invalid", { value: String(value).slice(0, 80) });
        return commit(value, "set-date", event);
      },
      showRefusal: (message: string | null) => context.store.set({ refusal: message }),
    };
  },
  slots: (slot) => ({
    // Names the field for the agent when the root takes no `aria-label` (`group: false`).
    label: slot({ attrs: () => ({ "data-slot": "visually-hidden" }) }),
    root: slot({
      role: (state) => (state.group ? "group" : undefined),
      roles: ["group"],
      attrs: (state) => ({
        "data-slot": "field-date",
        "data-disabled": state.disabled ? "" : undefined,
        "data-readonly": state.readOnly ? "" : undefined,
      }),
      state: (state) => ({ date: state.date, value: state.value, refusal: state.refusal }),
    }),
  }),
  agent: { actions: ["setDate"] },
});
