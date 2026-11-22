import {
  formatPeriod,
  isValidPeriodCode,
  parsePeriodCode,
  periodItemsForYear,
  yearPeriod,
  type PeriodGranularity,
} from "@booki/core/period";
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

export type AccountingPeriodOptions = {
  value?: string;
  defaultValue?: string;
  year?: number;
  granularity?: PeriodGranularity;
  locale?: string;
  label?: string;
  disabled?: boolean;
  readOnly?: boolean;
  onValueChange?: (code: string) => void;
};

export type AccountingPeriodState = {
  value: string;
  labelText: string;
  year: number;
  granularity: PeriodGranularity;
  items: AgentItem[];
  locale: string;
  label: string;
  disabled: boolean;
  readOnly: boolean;
} & PickerOwnState;

export function buildItems(year: number, granularity: PeriodGranularity, locale: string): AgentItem[] {
  if (granularity === "year") {
    const period = yearPeriod(year);
    return [{ value: period.code, label: formatPeriod(period, locale) }];
  }
  return periodItemsForYear(year, granularity, locale);
}

export function resolveInitial(items: AgentItem[], value?: string, defaultValue?: string): string {
  if (value && items.some((i) => i.value === value)) return value;
  if (defaultValue && items.some((i) => i.value === defaultValue)) {
    return defaultValue;
  }
  return items[0]?.value ?? "";
}

/**
 * Closed accounting period picker (year / month / VAT term).
 * Agents call setPeriod; inventing codes is refused.
 */
export const accountingPeriod = definePrimitive({
  name: "accounting-period",
  options: {
    value: "string",
    defaultValue: "string",
    year: "number",
    granularity: "string",
    locale: "string",
    label: "string",
    ...lockOptions,
    onValueChange: "callback",
  },
  controlled: ["value", "labelText", "items"],
  state: (options: AccountingPeriodOptions): AccountingPeriodState => {
    const year = options.year ?? new Date().getUTCFullYear();
    const granularity = options.granularity ?? "month";
    const locale = options.locale ?? "en-US";
    const items = buildItems(year, granularity, locale);
    const value = resolveInitial(items, options.value, options.defaultValue);
    const parsed = parsePeriodCode(value);
    return {
      value,
      labelText: parsed ? formatPeriod(parsed, locale) : value,
      year,
      granularity,
      items,
      locale,
      label: options.label ?? "Period",
      ...lockState(options),
      ...pickerState(value),
    };
  },
  sync: (options: AccountingPeriodOptions): Partial<AccountingPeriodState> => {
    const partial: Partial<AccountingPeriodState> = {
      ...lockState(options),
    };
    if (options.label !== undefined) partial.label = options.label;
    if (options.locale !== undefined) partial.locale = options.locale;
    if (options.year !== undefined) partial.year = options.year;
    if (options.granularity !== undefined) {
      partial.granularity = options.granularity;
    }
    if (options.year !== undefined || options.granularity !== undefined || options.locale !== undefined) {
      const year = options.year ?? new Date().getUTCFullYear();
      const granularity = options.granularity ?? "month";
      const locale = options.locale ?? "en-US";
      partial.items = buildItems(year, granularity, locale);
    }
    if (options.value !== undefined) {
      const locale = options.locale ?? "en-US";
      partial.value = options.value;
      const parsed = parsePeriodCode(options.value);
      partial.labelText = parsed ? formatPeriod(parsed, locale) : options.value;
    }
    return partial;
  },
  api: (context) => {
    const change = createChange(context);

    function apply(code: string, reason: string, event?: Event) {
      const { locale } = context.store.get();
      const parsed = parsePeriodCode(code);
      const ok = change("value", code, { reason, event });
      if (!ok) return false;
      context.store.set({
        labelText: parsed ? formatPeriod(parsed, locale) : code,
      });
      return true;
    }

    const picker = createPicker(context, {
      commit: (key, why) =>
        context.store.get().items.some((i) => i.value === key) ? apply(key, why.reason, why.event) : false,
      text: (state) => state.items.find((i) => i.value === state.value)?.label ?? state.labelText,
    });

    const methods = {
      picker,
      setPeriod: (raw: string, event?: unknown) => {
        const code = String(raw).trim();
        const { items } = context.store.get();
        const listed = items.find((i) => i.value === code || i.label.toLowerCase() === code.toLowerCase());
        if (!listed) {
          if (!isValidPeriodCode(code)) {
            throw new BookiError("select.unknown-period", {
              value: String(raw),
              items: items.map((i) => `${i.value} (${i.label})`).join(", ") || "(none)",
            });
          }
          // Allow exact valid codes even if year list is narrow.
          return apply(code, "set-period", asEvent(event));
        }
        return apply(listed.value, "set-period", asEvent(event));
      },
      /** Same as setPeriod: history and staging restore `value` through set<Key>. */
      setValue: (raw: string, event?: unknown): boolean => methods.setPeriod(raw, event),
      clear: () => {
        const { items } = context.store.get();
        const first = items[0];
        if (!first) return change("value", "", { reason: "clear" });
        return apply(first.value, "clear");
      },
      allItems: () => context.store.get().items,
    };
    return methods;
  },
  slots: (slot) => ({
    root: slot({
      attrs: (state) => ({
        "data-slot": "accounting-period-select",
        "aria-label": state.label,
        "data-disabled": state.disabled ? "" : undefined,
        "data-readonly": state.readOnly ? "" : undefined,
      }),
      state: (state) => ({ value: state.value }),
    }),
    select: slot({
      attrs: (state) => ({
        "data-slot": "accounting-period-control",
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
          api.setPeriod((event.target as HTMLSelectElement).value, event);
        },
      },
    }),
    trigger: pickerTrigger(slot),
    list: pickerList(slot),
    option: pickerOption(slot),
  }),
  agent: {
    actions: ["setPeriod", "setValue", "clear"],
    // No `closed`: the bridge would refuse unknown text before our method runs,
    // in its own words. Our method refuses it too, from the catalogue, naming the valid items.
    items: (api) => api.allItems(),
  },
});
