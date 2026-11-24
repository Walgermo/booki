import { createChange, definePrimitive } from "@ui-sdk/core";
import { asEvent } from "./fields.js";
import { isLocked, lockOptions, lockState, restoreSelect, selectLockAttrs } from "./lock.js";
import { itemsHint, refuseUnknown, shownItems } from "./offered.js";
import {
  createPicker,
  fallbackAttrs,
  pickerList,
  pickerOption,
  pickerState,
  pickerTrigger,
  type PickerOwnState,
} from "./picker.js";

export const DEFAULT_CURRENCIES = ["NOK", "USD"] as const;

export type AgentItem = { value: string; label: string };

export type CurrencySelectOptions = {
  value?: string;
  defaultValue?: string;
  currencies?: readonly string[];
  /** Names the trigger and list for assistive tech. Defaults to "Currency". */
  label?: string;
  disabled?: boolean;
  readOnly?: boolean;
  onValueChange?: (currency: string) => void;
};

export type CurrencySelectState = {
  value: string;
  items: AgentItem[];
  itemsHint: string;
  currencies: string[];
  disabled: boolean;
  readOnly: boolean;
  /** Names the trigger and list for assistive tech. */
  label: string;
} & PickerOwnState;

export function toItems(currencies: readonly string[]): AgentItem[] {
  return currencies.map((code) => ({ value: code, label: code }));
}

/**
 * Closed currency picker (NOK/USD MVP). Agents call setCurrency.
 */
export const currencySelect = definePrimitive({
  name: "currency-select",
  options: {
    value: "string",
    defaultValue: "string",
    currencies: "value",
    label: "string",
    ...lockOptions,
    onValueChange: "callback",
  },
  controlled: ["value", "items", "itemsHint"],
  state: (options: CurrencySelectOptions): CurrencySelectState => {
    const currencies = [...(options.currencies ?? DEFAULT_CURRENCIES)];
    const value = options.value ?? options.defaultValue ?? currencies[0] ?? "NOK";
    return {
      value,
      items: shownItems(toItems(currencies)),
      itemsHint: itemsHint(toItems(currencies)),
      currencies,
      ...lockState(options),
      label: options.label ?? "Currency",
      ...pickerState(value),
    };
  },
  sync: (options: CurrencySelectOptions): Partial<CurrencySelectState> => {
    const partial: Partial<CurrencySelectState> = { ...lockState(options) };
    if (options.label !== undefined) partial.label = options.label;
    if (options.currencies !== undefined) {
      partial.currencies = [...options.currencies];
      partial.items = shownItems(toItems(options.currencies));
      partial.itemsHint = itemsHint(toItems(options.currencies));
    }
    if (options.value !== undefined) partial.value = options.value;
    return partial;
  },
  api: (context) => {
    const change = createChange(context);

    const picker = createPicker(context, {
      commit: (key, why) => {
        if (!context.store.get().currencies.includes(key)) return false;
        return change("value", key, { reason: why.reason, event: why.event });
      },
      text: (state) => state.value,
    });

    const methods = {
      picker,
      setCurrency: (raw: string, event?: unknown) => {
        const code = String(raw).trim().toUpperCase();
        const { currencies } = context.store.get();
        if (!currencies.includes(code)) refuseUnknown("select.unknown-currency", toItems(currencies), raw);
        return change("value", code, { reason: "set-currency", event: asEvent(event) });
      },
      /** Same as setCurrency: history and staging restore `value` through set<Key>. */
      setValue: (raw: string, event?: unknown): boolean => methods.setCurrency(raw, event),
      clear: () => {
        const { currencies } = context.store.get();
        const first = currencies[0] ?? "NOK";
        return change("value", first, { reason: "clear" });
      },
      allItems: () => toItems(context.store.get().currencies),
    };
    return methods;
  },
  slots: (slot) => ({
    root: slot({
      attrs: (state) => ({
        "data-slot": "currency-select",
        "aria-label": "Currency",
        "data-disabled": state.disabled ? "" : undefined,
        "data-readonly": state.readOnly ? "" : undefined,
      }),
      state: (state) => ({ value: state.value }),
    }),
    select: slot({
      attrs: (state) => ({
        "data-slot": "currency-select-control",
        value: state.value,
        // The native fallback: the picker a finger uses (see picker.ts).
        ...fallbackAttrs(state),
        "aria-label": "Currency",
        ...selectLockAttrs(state),
      }),
      on: {
        // "input" is the adapter's name for React's onChange, which a select
        // (and a date input) fires when the person commits a choice. A
        // natively bound "change" works too, but React then warns about a
        // value without onChange.
        input: (event, { api, store }) => {
          const state = store.get();
          if (isLocked(state)) return restoreSelect(event, state.value);
          api.setCurrency((event.target as HTMLSelectElement).value, event);
        },
      },
    }),
    trigger: pickerTrigger(slot),
    list: pickerList(slot),
    option: pickerOption(slot),
  }),
  agent: {
    actions: ["setCurrency", "setValue", "clear"],
    // No `closed`: the bridge would refuse unknown text before our method runs,
    // in its own words. Our method refuses it too, from the catalogue, naming the valid items.
    items: (api) => api.allItems(),
  },
});
