import type { TaxCode } from "@booki/core/locale";
import { BookiError } from "@booki/core/msg";
import { createChange, definePrimitive } from "@ui-sdk/core";
import { asEvent } from "./fields.js";
import { isLocked, lockOptions, lockState, restoreSelect, selectLockAttrs } from "./lock.js";
import {
  createPicker,
  fallbackAttrs,
  pickerList,
  pickerOption,
  pickerState,
  pickerTrigger,
  type PickerOwnState,
} from "./picker.js";

export type AgentItem = { value: string; label: string };

export type TaxCodeSelectOptions = {
  value?: string;
  defaultValue?: string;
  codes?: TaxCode[];
  label?: string;
  disabled?: boolean;
  readOnly?: boolean;
  onValueChange?: (code: string, tax?: TaxCode) => void;
};

export type TaxCodeSelectState = {
  value: string;
  percent: number;
  codeLabel: string;
  items: AgentItem[];
  codes: TaxCode[];
  label: string;
  disabled: boolean;
  readOnly: boolean;
} & PickerOwnState;

export function resolveCode(codes: TaxCode[], raw: string): TaxCode | undefined {
  const text = String(raw).trim();
  return (
    codes.find((c) => c.code === text) ??
    codes.find((c) => c.label === text) ??
    codes.find((c) => c.label.toLowerCase() === text.toLowerCase())
  );
}

export function toItems(codes: TaxCode[]): AgentItem[] {
  return codes.map((c) => ({ value: c.code, label: c.label }));
}

export function pickInitial(codes: TaxCode[], value?: string, defaultValue?: string): TaxCode | undefined {
  // A controlled value is the owner's: "" (or an unknown code) is no selection, never the first code.
  if (value !== undefined) return value === "" ? undefined : resolveCode(codes, value);
  if (defaultValue) return resolveCode(codes, defaultValue) ?? codes[0];
  return codes[0];
}

/**
 * Closed tax / MVA picker. Agents call setTaxCode; inventing codes is refused.
 * Snapshot includes value, percent, codeLabel, items.
 */
export const taxCodeSelect = definePrimitive({
  name: "tax-code-select",
  options: {
    value: "string",
    defaultValue: "string",
    codes: "value",
    label: "string",
    ...lockOptions,
    onValueChange: "callback",
  },
  controlled: ["value", "percent", "codeLabel", "items"],
  state: (options: TaxCodeSelectOptions): TaxCodeSelectState => {
    const codes = options.codes ?? [];
    const selected = pickInitial(codes, options.value, options.defaultValue);
    return {
      value: selected?.code ?? "",
      percent: selected?.percent ?? 0,
      codeLabel: selected?.label ?? "",
      items: toItems(codes),
      codes,
      label: options.label ?? "Tax",
      ...lockState(options),
      ...pickerState(selected?.code ?? ""),
    };
  },
  sync: (options: TaxCodeSelectOptions): Partial<TaxCodeSelectState> => {
    const partial: Partial<TaxCodeSelectState> = { ...lockState(options) };
    if (options.label !== undefined) partial.label = options.label;
    if (options.codes !== undefined) {
      partial.codes = options.codes;
      partial.items = toItems(options.codes);
    }
    if (options.value !== undefined) {
      const codes = options.codes ?? [];
      const selected = resolveCode(codes, options.value);
      partial.value = selected?.code ?? "";
      partial.percent = selected?.percent ?? 0;
      partial.codeLabel = selected?.label ?? "";
    }
    return partial;
  },
  api: (context) => {
    const change = createChange(context);

    function apply(code: TaxCode, reason: string, event?: Event) {
      const ok = change("value", code.code, { reason, event });
      if (!ok) return false;
      context.store.set({
        percent: code.percent,
        codeLabel: code.label,
      });
      return true;
    }

    const picker = createPicker(context, {
      commit: (key, why) => {
        const code = resolveCode(context.store.get().codes, key);
        return code ? apply(code, why.reason, why.event) : false;
      },
      text: (state) => state.codeLabel,
    });

    const methods = {
      picker,
      setTaxCode: (raw: string, event?: unknown) => {
        const { codes, items } = context.store.get();
        const selected = resolveCode(codes, String(raw));
        if (!selected) {
          const listed = items.map((i) => i.label).join(", ");
          throw new BookiError("select.unknown-tax-code", { value: String(raw), items: listed || "(none)" });
        }
        return apply(selected, "set-tax-code", asEvent(event));
      },
      /** Same as setTaxCode: history and staging restore `value` through set<Key>. */
      setValue: (raw: string, event?: unknown): boolean => methods.setTaxCode(raw, event),
      clear: () => {
        const { codes } = context.store.get();
        const first = codes[0];
        if (!first) return change("value", "", { reason: "clear" });
        return apply(first, "clear");
      },
      allItems: () => context.store.get().items,
    };
    return methods;
  },
  slots: (slot) => ({
    root: slot({
      attrs: (state) => ({
        "data-slot": "tax-code-select",
        "aria-label": state.label,
        "data-disabled": state.disabled ? "" : undefined,
        "data-readonly": state.readOnly ? "" : undefined,
      }),
      state: (state) => ({ value: state.value }),
    }),
    select: slot({
      attrs: (state) => ({
        "data-slot": "tax-code-select-control",
        value: state.value,
        // The native fallback: the picker a finger uses (see picker.ts).
        ...fallbackAttrs(state),
        "aria-label": state.label,
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
          api.setTaxCode((event.target as HTMLSelectElement).value, event);
        },
      },
    }),
    trigger: pickerTrigger(slot),
    list: pickerList(slot),
    option: pickerOption(slot),
  }),
  agent: {
    actions: ["setTaxCode", "setValue", "clear"],
    // No `closed`: the bridge would refuse unknown text before our method runs,
    // in its own words. Our method refuses it too, from the catalogue, naming the valid items.
    items: (api) => api.allItems(),
  },
});
