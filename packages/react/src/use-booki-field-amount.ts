import { BookiError } from "@booki/core/msg";
import { rangeError } from "@booki/primitives/amount-field";
import { lockOptions, lockState } from "@booki/primitives/lock";
import { createChange, definePrimitive, dispatch } from "@ui-sdk/core";

/**
 * The amount kind of `useBookiField`: a field the product already has, held
 * as integer minor units. Its snapshot key is `minor`, so no number can be
 * read as major units. One definition per file: the contract and ergonomics
 * tests read each file's first `actions` and `controlled` lists.
 *
 * Renders as `<div role="group" data-slot="field-amount">`.
 */

export type BookiFieldAmountOptions = {
  value?: number;
  currency?: string;
  minMinor?: number;
  maxMinor?: number;
  disabled?: boolean;
  readOnly?: boolean;
  onValueChange?: (minor: number, details: { reason: string; source?: string }) => void;
};

export type BookiFieldAmountState = {
  minor: number;
  currency: string;
  minMinor: number;
  maxMinor: number | undefined;
  refusal: string | null;
  disabled: boolean;
  readOnly: boolean;
};

export const bookiFieldAmount = definePrimitive({
  name: "field-amount",
  options: {
    value: "number",
    currency: "string",
    minMinor: "number",
    maxMinor: "number",
    ...lockOptions,
    onValueChange: "callback",
  },
  // The product owns the value: the snapshot shows these, the product sets them.
  controlled: ["minor", "currency", "refusal"],
  state: (options: BookiFieldAmountOptions): BookiFieldAmountState => ({
    minor: options.value ?? 0,
    currency: options.currency ?? "NOK",
    minMinor: options.minMinor ?? 0,
    maxMinor: options.maxMinor,
    refusal: null,
    ...lockState(options),
  }),
  sync: (options: BookiFieldAmountOptions): Partial<BookiFieldAmountState> => {
    const next: Partial<BookiFieldAmountState> = { ...lockState(options) };
    if (options.value !== undefined) next.minor = options.value;
    if (options.currency !== undefined) next.currency = options.currency;
    if (options.minMinor !== undefined) next.minMinor = options.minMinor;
    if (options.maxMinor !== undefined) next.maxMinor = options.maxMinor;
    return next;
  },
  api: (context) => {
    const change = createChange(context);

    function commit(next: number, reason: string, event?: Event): boolean {
      const { minor } = context.store.get();
      if (next === minor) return false;
      // The product hears the change first and may cancel it.
      if (dispatch(context, "onValueChange", next, { reason, event })) return false;
      const ok = change("minor", next, { reason, event });
      if (ok) {
        // Controlled: the product passes the value back through sync; until it
        // does, the field keeps the value it holds.
        if (context.options().value !== undefined) context.store.set({ minor });
      }
      return ok;
    }

    return {
      /** Agent and product path: integer minor units. Throws a sentence that says what is allowed. */
      setMinor: (minor: unknown, event?: Event): boolean => {
        const { currency, minMinor, maxMinor } = context.store.get();
        const n = typeof minor === "string" && /^\s*-?\d+\s*$/.test(minor) ? Number(minor) : minor;
        if (typeof n !== "number" || !Number.isSafeInteger(n)) {
          throw new BookiError("amount.not-minor", {
            currency,
            value: typeof minor === "string" ? JSON.stringify(minor) : String(minor),
          });
        }
        if (rangeError(n, minMinor, maxMinor)) {
          if (n < minMinor) throw new BookiError("amount.below-min", { minor: n, min: minMinor });
          throw new BookiError("amount.above-max", { minor: n, max: maxMinor ?? "" });
        }
        return commit(n, "set-minor", event);
      },
      showRefusal: (message: string | null) => context.store.set({ refusal: message }),
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state) => ({
        "data-slot": "field-amount",
        "data-disabled": state.disabled ? "" : undefined,
        "data-readonly": state.readOnly ? "" : undefined,
      }),
      state: (state) => ({ minor: state.minor, refusal: state.refusal }),
    }),
  }),
  agent: { actions: ["setMinor"] },
});
