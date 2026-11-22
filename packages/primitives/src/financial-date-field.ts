import {
  addCalendarDays,
  daysUntilDue,
  formatFinancialDate,
  normalizeIsoDate,
  type FinancialDateKind,
  localToday,
} from "@booki/core/financial-date";
import { BookiError } from "@booki/core/msg";
import { createChange, definePrimitive } from "@ui-sdk/core";
import { asEvent } from "./fields.js";
import { inputLockAttrs, isLocked, lockOptions, lockState } from "./lock.js";

export type FinancialDateOptions = {
  kind?: FinancialDateKind;
  value?: string;
  defaultValue?: string;
  locale?: string;
  label?: string;
  description?: string;
  disabled?: boolean;
  readOnly?: boolean;
  onValueChange?: (value: string) => void;
};

export type FinancialDateState = {
  kind: FinancialDateKind;
  value: string;
  formatted: string;
  isValid: boolean;
  daysUntilDue: number | null;
  locale: string;
  label: string;
  description: string;
  disabled: boolean;
  readOnly: boolean;
};

export function defaultLabel(kind: FinancialDateKind): string {
  switch (kind) {
    case "invoice":
      return "Invoice date";
    case "due":
      return "Due date";
    case "posting":
      return "Posting date";
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function deriveState(options: FinancialDateOptions): FinancialDateState {
  const kind = options.kind ?? "invoice";
  const locale = options.locale ?? "en-US";
  const raw = options.value ?? options.defaultValue;
  const value = normalizeIsoDate(raw ?? "", locale);
  return {
    kind,
    value,
    formatted: value ? formatFinancialDate(value, locale) : "",
    isValid: raw === undefined || raw === "" || value !== "",
    daysUntilDue: kind === "due" && value ? daysUntilDue(value) : null,
    locale,
    label: options.label ?? defaultLabel(kind),
    description: options.description ?? "ISO date YYYY-MM-DD",
    ...lockState(options),
  };
}

/**
 * Agent-ready financial date (invoice / due / posting).
 * Actions: setDate, setDaysFromToday (due), clear.
 */
export const financialDate = definePrimitive({
  name: "financial-date",
  options: {
    kind: "string",
    value: "string",
    defaultValue: "string",
    locale: "string",
    label: "string",
    description: "string",
    ...lockOptions,
    onValueChange: "callback",
  },
  controlled: ["kind", "value", "formatted", "isValid", "daysUntilDue"],
  state: (options: FinancialDateOptions): FinancialDateState => deriveState(options),
  sync: (options: FinancialDateOptions): Partial<FinancialDateState> => {
    const partial: Partial<FinancialDateState> = { ...lockState(options) };
    if (options.kind !== undefined) partial.kind = options.kind;
    if (options.locale !== undefined) partial.locale = options.locale;
    if (options.label !== undefined) partial.label = options.label;
    if (options.description !== undefined) {
      partial.description = options.description;
    }
    // Only a passed value re-derives the date; deriving on kind/locale
    // alone wiped an uncontrolled field on every render.
    if (options.value !== undefined) {
      const kind = options.kind ?? "invoice";
      const locale = options.locale ?? "en-US";
      const value = normalizeIsoDate(options.value, locale);
      partial.value = value;
      partial.formatted = value ? formatFinancialDate(value, locale) : "";
      partial.isValid = options.value === "" || value !== "";
      partial.daysUntilDue = kind === "due" && value ? daysUntilDue(value) : null;
    }
    return partial;
  },
  api: (context) => {
    const change = createChange(context);

    function commit(raw: string, reason: string, event?: Event) {
      const { kind, locale } = context.store.get();
      const value = normalizeIsoDate(String(raw), locale);
      if (String(raw).trim() !== "" && value === "") {
        throw new BookiError("date.invalid", { value: String(raw) });
      }
      const formatted = value ? formatFinancialDate(value, locale) : "";
      // change() calls onValueChange itself, with details
      const ok = change("value", value, { reason, event });
      if (!ok) return false;
      context.store.set({
        formatted,
        isValid: true,
        daysUntilDue: kind === "due" && value ? daysUntilDue(value) : null,
      });
      return true;
    }

    return {
      setDate: (raw: string, event?: unknown) => commit(String(raw), "set-date", asEvent(event)),
      /** Same as setDate (ISO YYYY-MM-DD); lets history / staging restore key `value`. */
      setValue: (raw: string) => commit(String(raw ?? ""), "set-value"),
      setDaysFromToday: (days: number) => {
        const { kind } = context.store.get();
        if (kind !== "due") {
          throw new BookiError("date.days-only-due", { kind });
        }
        const base = localToday();
        if (!Number.isInteger(Number(days))) throw new BookiError("date.days-not-a-number", { value: String(days) });
        const next = addCalendarDays(base, Number(days));
        if (!next) throw new BookiError("date.days-not-a-number", { value: String(days) });
        return commit(next, "set-days-from-today");
      },
      clear: () => commit("", "clear"),
    };
  },
  slots: (slot) => ({
    root: slot({
      attrs: (state) => ({
        "data-slot": "financial-date-field",
        "data-kind": state.kind,
        "data-valid": state.isValid ? "true" : "false",
        "data-disabled": state.disabled ? "" : undefined,
        "data-readonly": state.readOnly ? "" : undefined,
      }),
      state: (state) => ({ isValid: state.isValid, value: state.value }),
    }),
    input: slot({
      attrs: (state) => ({
        "data-slot": "financial-date-control",
        type: "date",
        value: state.value,
        "aria-invalid": state.isValid ? undefined : "true",
        "aria-label": state.label,
        ...inputLockAttrs(state),
      }),
      on: {
        // "input" is the adapter's name for React's onChange, which a select
        // (and a date input) fires when the person commits a choice. A
        // natively bound "change" works too, but React then warns about a
        // value without onChange.
        input: (event, { api, store }) => {
          if (isLocked(store.get())) return;
          api.setDate((event.target as HTMLInputElement).value, event);
        },
      },
    }),
  }),
  agent: {
    actions: ["setDate", "setValue", "setDaysFromToday", "clear"],
  },
});
