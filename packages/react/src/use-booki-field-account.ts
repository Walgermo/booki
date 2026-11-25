import { closest, LISTED_WHOLE } from "@booki-aui/core/closest";
import { BookiError } from "@booki-aui/core/msg";
import { lockOptions, lockState } from "@booki-aui/primitives/lock";
import { createChange, definePrimitive, dispatch } from "@ui-sdk/core";
import { itemsHint, shownItems, type BookiFieldCodeItem } from "./use-booki-field-code.js";

/**
 * The account kind of `useBookiField`: an account-number field the product
 * already has, held as digits. Without a `chart` it is open: any run of digits
 * of the right length. With a `chart` it is closed: an unknown number is
 * refused, and the refusal names the nearest ones. One definition per file: the
 * contract and ergonomics tests read each file's first `actions` and
 * `controlled` lists.
 *
 * Renders as `<div role="group" data-slot="field-account">`.
 */

export type BookiFieldAccountEntry = { number: string; name: string };

export type BookiFieldAccountOptions = {
  /** The account number, digits only. `""` is none, with `allowEmpty`. */
  value?: string;
  /** A closed chart of accounts. Without one, any number of the right length is accepted. */
  chart?: BookiFieldAccountEntry[];
  /** Fewest digits of an open account number. Default 4. Not read with a `chart`. */
  minLength?: number;
  /** Most digits of an open account number. Default 10. Not read with a `chart`. */
  maxLength?: number;
  /** The field may hold no account: `setAccount("")` or `setAccount(null)` clears it to `""`. */
  allowEmpty?: boolean;
  /** `false`: the root takes no `role="group"`, for a field that has its own labelled group. */
  group?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  onValueChange?: (account: string, details: { reason: string; source?: string }) => void;
};

export type BookiFieldAccountState = {
  account: string;
  chart: BookiFieldAccountEntry[];
  /** The chart entries the snapshot shows: all of a short chart, none of a long one. */
  items: BookiFieldCodeItem[];
  itemsHint: string;
  minLength: number;
  maxLength: number;
  allowEmpty: boolean;
  refusal: string | null;
  /** The root is a `role="group"`; false when the product's field has its own. */
  group: boolean;
  disabled: boolean;
  readOnly: boolean;
};

const DEFAULT_MIN = 4;
const DEFAULT_MAX = 10;

const toItems = (chart: BookiFieldAccountEntry[]): BookiFieldCodeItem[] =>
  chart.map((entry) => ({ value: entry.number, label: `${entry.number} — ${entry.name}` }));

const named = (entry: BookiFieldAccountEntry): string => `${entry.number} (${entry.name})`;

export const bookiFieldAccount = definePrimitive({
  name: "field-account",
  options: {
    value: "string",
    chart: "value",
    minLength: "number",
    maxLength: "number",
    allowEmpty: "boolean",
    group: "boolean",
    ...lockOptions,
    onValueChange: "callback",
  },
  // The product owns the value: the snapshot shows these, the product sets them.
  controlled: ["account", "items", "itemsHint", "minLength", "maxLength", "refusal"],
  state: (options: BookiFieldAccountOptions): BookiFieldAccountState => {
    const chart = options.chart ?? [];
    return {
      account: options.value ?? "",
      chart,
      items: shownItems(toItems(chart)),
      itemsHint: itemsHint(toItems(chart)),
      minLength: options.minLength ?? DEFAULT_MIN,
      maxLength: options.maxLength ?? DEFAULT_MAX,
      allowEmpty: options.allowEmpty ?? false,
      refusal: null,
      group: options.group ?? true,
      ...lockState(options),
    };
  },
  sync: (options: BookiFieldAccountOptions): Partial<BookiFieldAccountState> => {
    const next: Partial<BookiFieldAccountState> = { ...lockState(options) };
    if (options.group !== undefined) next.group = options.group;
    if (options.allowEmpty !== undefined) next.allowEmpty = options.allowEmpty;
    if (options.value !== undefined) next.account = options.value;
    if (options.minLength !== undefined) next.minLength = options.minLength;
    if (options.maxLength !== undefined) next.maxLength = options.maxLength;
    if (options.chart !== undefined) {
      next.chart = options.chart;
      next.items = shownItems(toItems(options.chart));
      next.itemsHint = itemsHint(toItems(options.chart));
    }
    return next;
  },
  api: (context) => {
    const change = createChange(context);

    function commit(next: string, reason: string, event?: Event): boolean {
      const { account } = context.store.get();
      if (next === account) return false;
      // The product hears the change first and may cancel it.
      if (dispatch(context, "onValueChange", next, { reason, event })) return false;
      const ok = change("account", next, { reason, event });
      // Controlled: the product passes the value back through sync; until it
      // does, the field keeps the value it holds.
      if (ok && context.options().value !== undefined) context.store.set({ account });
      return ok;
    }

    return {
      /**
       * Agent and product path: an account number as digits. Throws a sentence that says what is
       * allowed: digits only, the length range, or with a chart the nearest accounts it has.
       * With `allowEmpty`, "" or null clears it.
       */
      setAccount: (raw: unknown, event?: Event): boolean => {
        const { chart, minLength, maxLength, allowEmpty } = context.store.get();
        if (allowEmpty && (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === ""))) {
          return commit("", "clear", event);
        }
        if (typeof raw !== "string" && typeof raw !== "number") {
          throw new BookiError("field.account-not-text", {
            got: Array.isArray(raw) ? "a list" : typeof raw,
          });
        }
        const text = String(raw).replace(/\s+/g, "");
        if (text === "") {
          if (chart.length > 0) throw new BookiError("field.account-empty-chart", { count: chart.length });
          throw new BookiError("field.account-empty", { min: minLength, max: maxLength });
        }
        if (!/^\d+$/.test(text)) throw new BookiError("field.account-not-digits", { value: String(raw).slice(0, 80) });
        if (chart.length > 0) {
          const entry = chart.find((candidate) => candidate.number === text);
          if (!entry) {
            if (chart.length <= LISTED_WHOLE) {
              throw new BookiError("field.unknown-account", { value: text, items: chart.map(named).join(", ") });
            }
            const near = closest(chart, text, (candidate) => `${candidate.number} ${candidate.name}`, 8);
            throw new BookiError("field.unknown-account-more", {
              value: text,
              items: near.map(named).join(", "),
              count: chart.length,
            });
          }
          return commit(entry.number, "set-account", event);
        }
        if (minLength > maxLength) throw new BookiError("field.account-range", { min: minLength, max: maxLength });
        if (text.length < minLength || text.length > maxLength) {
          throw new BookiError("field.account-length", { value: text, min: minLength, max: maxLength });
        }
        return commit(text, "set-account", event);
      },
      items: (): BookiFieldCodeItem[] => toItems(context.store.get().chart),
      showRefusal: (message: string | null) => context.store.set({ refusal: message }),
    };
  },
  slots: (slot) => ({
    root: slot({
      role: (state) => (state.group ? "group" : undefined),
      roles: ["group"],
      attrs: (state) => ({
        "data-slot": "field-account",
        "data-disabled": state.disabled ? "" : undefined,
        "data-readonly": state.readOnly ? "" : undefined,
      }),
      state: (state) => ({ account: state.account, refusal: state.refusal }),
    }),
  }),
  agent: { actions: ["setAccount"], items: (api) => api.items() },
});
