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
  disabled?: boolean;
  readOnly?: boolean;
  onValueChange?: (date: string, details: { reason: string; source?: string }) => void;
};

export type BookiFieldDateState = {
  date: string;
  refusal: string | null;
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
    ...lockOptions,
    onValueChange: "callback",
  },
  controlled: ["date", "refusal"],
  state: (options: BookiFieldDateOptions): BookiFieldDateState => ({
    date: options.value ?? "",
    refusal: null,
    ...lockState(options),
  }),
  sync: (options: BookiFieldDateOptions): Partial<BookiFieldDateState> => {
    const next: Partial<BookiFieldDateState> = { ...lockState(options) };
    if (options.value !== undefined) next.date = options.value;
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
      // Controlled: the product passes the value back through sync; until it
      // does, the field keeps the value it holds.
      if (ok && context.options().value !== undefined) context.store.set({ date });
      return ok;
    }

    return {
      /** Agent and product path: an ISO date that exists. Throws a sentence that says the format. */
      setDate: (value: string, event?: Event): boolean => {
        if (!isIsoDate(value)) throw new BookiError("date.invalid", { value: String(value).slice(0, 80) });
        return commit(value, "set-date", event);
      },
      showRefusal: (message: string | null) => context.store.set({ refusal: message }),
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state) => ({
        "data-slot": "field-date",
        "data-disabled": state.disabled ? "" : undefined,
        "data-readonly": state.readOnly ? "" : undefined,
      }),
      state: (state) => ({ date: state.date, refusal: state.refusal }),
    }),
  }),
  agent: { actions: ["setDate"] },
});
