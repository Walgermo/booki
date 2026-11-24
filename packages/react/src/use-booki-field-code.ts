import { closest, LISTED_WHOLE } from "@booki/core/closest";
import { BookiError } from "@booki/core/msg";
import { lockOptions, lockState } from "@booki/primitives/lock";
import { createChange, definePrimitive, dispatch } from "@ui-sdk/core";

/**
 * The code kind of `useBookiField`: a select the product already has, whose
 * value is one of a closed list. The snapshot lists the items of a short list
 * and none of a long one; `query({ within })` searches all of them.
 *
 * The list helpers are those of `@booki/primitives/offered` (`shownItems`,
 * `itemsHint`, `refuseUnknown`). That module has no subpath export, so they
 * are written out here from the same `@booki/core/closest` helpers.
 *
 * Renders as `<div role="group" data-slot="field-code">`.
 */

export type BookiFieldCodeItem = { value: string; label: string };

export type BookiFieldCodeOptions = {
  value?: string;
  options?: BookiFieldCodeItem[];
  /** The field may hold no code: `setCode("")` or `setCode(null)` clears it. */
  allowEmpty?: boolean;
  /**
   * Values only a person may choose, such as a deal's won and lost stages. An
   * agent's `setCode` to one of them is refused; a person's change (with its
   * DOM event) goes through.
   */
  personOnly?: string[];
  disabled?: boolean;
  readOnly?: boolean;
  onValueChange?: (code: string, details: { reason: string; source?: string }) => void;
};

export type BookiFieldCodeState = {
  code: string;
  /** Every item, which the agent's `query` searches. */
  options: BookiFieldCodeItem[];
  /** The items the snapshot shows: all of a short list, none of a long one. */
  items: BookiFieldCodeItem[];
  itemsHint: string;
  allowEmpty: boolean;
  /** The values only a person may choose. */
  personOnly: string[];
  refusal: string | null;
  disabled: boolean;
  readOnly: boolean;
};

const shownItems = (items: BookiFieldCodeItem[]): BookiFieldCodeItem[] => (items.length <= LISTED_WHOLE ? items : []);

const itemsHint = (items: BookiFieldCodeItem[]): string =>
  items.length <= LISTED_WHOLE
    ? ""
    : `${items.length} items, not listed here: query({ within: <this ref>, text: "a code or a whole word" }) finds one; without text it lists the first 50.`;

/** How an option is named in a refusal: the value `setCode` takes, then its label when that differs. */
const named = (item: BookiFieldCodeItem): string =>
  item.label === item.value ? item.value : `${item.value} (${item.label})`;

/** The option a value names: its `value` exactly, else its label in any case. */
function optionFor(items: BookiFieldCodeItem[], raw: unknown): BookiFieldCodeItem | undefined {
  if (typeof raw !== "string") return undefined;
  const byValue = items.find((item) => item.value === raw);
  if (byValue) return byValue;
  const wanted = raw.trim().toLowerCase();
  const byLabel = items.filter((item) => item.label.trim().toLowerCase() === wanted);
  // Two options with the same label: the label names neither.
  return byLabel.length === 1 ? byLabel[0] : undefined;
}

/** Throws the refusal for a value the list lacks: every option of a short list, the nearest of a long one. */
function refuseUnknown(items: BookiFieldCodeItem[], raw: unknown): never {
  const value = String(raw).slice(0, 80);
  if (items.length <= LISTED_WHOLE) {
    throw new BookiError("field.unknown-code", {
      value,
      items: items.map(named).join(", ") || "(none)",
    });
  }
  const near = closest(items, raw, (item) => item.label, 8);
  throw new BookiError("field.unknown-code-more", {
    value,
    items: near.map(named).join(", "),
    count: items.length,
  });
}

export const bookiFieldCode = definePrimitive({
  name: "field-code",
  options: {
    value: "string",
    options: "value",
    allowEmpty: "boolean",
    personOnly: "value",
    ...lockOptions,
    onValueChange: "callback",
  },
  controlled: ["code", "items", "itemsHint", "personOnly", "refusal"],
  state: (options: BookiFieldCodeOptions): BookiFieldCodeState => {
    const all = options.options ?? [];
    return {
      code: options.value ?? "",
      options: all,
      items: shownItems(all),
      itemsHint: itemsHint(all),
      allowEmpty: options.allowEmpty ?? false,
      personOnly: options.personOnly ?? [],
      refusal: null,
      ...lockState(options),
    };
  },
  sync: (options: BookiFieldCodeOptions): Partial<BookiFieldCodeState> => {
    const next: Partial<BookiFieldCodeState> = { ...lockState(options) };
    if (options.allowEmpty !== undefined) next.allowEmpty = options.allowEmpty;
    if (options.personOnly !== undefined) next.personOnly = options.personOnly;
    if (options.value !== undefined) next.code = options.value;
    if (options.options !== undefined) {
      next.options = options.options;
      next.items = shownItems(options.options);
      next.itemsHint = itemsHint(options.options);
    }
    return next;
  },
  api: (context) => {
    const change = createChange(context);

    function commit(next: string, reason: string, event?: Event): boolean {
      const { code } = context.store.get();
      if (next === code) return false;
      // The product hears the change first and may cancel it.
      if (dispatch(context, "onValueChange", next, { reason, event })) return false;
      const ok = change("code", next, { reason, event });
      // Controlled: the product passes the value back through sync; until it
      // does, the field keeps the value it holds.
      if (ok && context.options().value !== undefined) context.store.set({ code });
      return ok;
    }

    return {
      /**
       * Agent and product path: one of the options, by its `value` or its label (any case).
       * With `allowEmpty`, "" or null clears it. Throws a sentence that lists each option as `value (label)`.
       * A value in `personOnly` is refused unless the call carries a person's DOM event.
       */
      setCode: (code: string | null, event?: Event): boolean => {
        const { options, allowEmpty } = context.store.get();
        if (allowEmpty && (code === null || code === "")) return commit("", "clear", event);
        const option = optionFor(options, code);
        if (!option) refuseUnknown(options, code);
        // An agent's call carries no DOM event; a person's change does.
        const fromPerson = typeof Event !== "undefined" && event instanceof Event;
        if (!fromPerson && context.store.get().personOnly.includes(option.value)) {
          throw new BookiError("field.person-only-code", { item: named(option) });
        }
        return commit(option.value, "set-code", event);
      },
      items: (): BookiFieldCodeItem[] => context.store.get().options,
      showRefusal: (message: string | null) => context.store.set({ refusal: message }),
    };
  },
  slots: (slot) => ({
    root: slot({
      role: "group",
      attrs: (state) => ({
        "data-slot": "field-code",
        "data-disabled": state.disabled ? "" : undefined,
        "data-readonly": state.readOnly ? "" : undefined,
      }),
      state: (state) => ({ code: state.code, refusal: state.refusal }),
    }),
  }),
  agent: { actions: ["setCode"], items: (api) => api.items() },
});
