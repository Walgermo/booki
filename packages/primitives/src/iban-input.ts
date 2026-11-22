import { extractNorwegianKontonummer, formatIban, isValidIban, normalizeIban } from "@booki/core/iban";
import { createChange, definePrimitive } from "@ui-sdk/core";
import { asEvent, textOf } from "./fields.js";
import { inputLockAttrs, isLocked, lockOptions, lockState } from "./lock.js";

export type IbanOptions = {
  value?: string;
  defaultValue?: string;
  label?: string;
  description?: string;
  disabled?: boolean;
  readOnly?: boolean;
  onValueChange?: (value: string) => void;
};

export type IbanState = {
  value: string;
  formatted: string;
  isValid: boolean;
  kontonummer: string | null;
  label: string;
  description: string;
  disabled: boolean;
  readOnly: boolean;
};

export function deriveState(options: IbanOptions): IbanState {
  const value = normalizeIban(options.value ?? options.defaultValue ?? "");
  return {
    value,
    formatted: formatIban(value),
    isValid: value.length === 0 || isValidIban(value),
    kontonummer: extractNorwegianKontonummer(value),
    label: options.label ?? "IBAN",
    description: options.description ?? "International bank account number",
    ...lockState(options),
  };
}

/**
 * Agent-ready IBAN: setIban / clear. Marked data-agent-secret.
 * The component is secret, so ui-sdk redacts every key it exposes, isValid
 * and kind included: an agent reads "[redacted]" for each, not just the value.
 */
export const ibanInput = definePrimitive({
  name: "iban-input",
  options: {
    value: "string",
    defaultValue: "string",
    label: "string",
    description: "string",
    ...lockOptions,
    onValueChange: "callback",
  },
  controlled: ["value", "formatted", "isValid", "kontonummer"],
  state: (options: IbanOptions): IbanState => deriveState(options),
  sync: (options: IbanOptions): Partial<IbanState> => {
    const partial: Partial<IbanState> = { ...lockState(options) };
    if (options.label !== undefined) partial.label = options.label;
    if (options.description !== undefined) {
      partial.description = options.description;
    }
    if (options.value !== undefined) {
      const value = normalizeIban(options.value);
      partial.value = value;
      partial.formatted = formatIban(value);
      partial.isValid = value.length === 0 || isValidIban(value);
      partial.kontonummer = extractNorwegianKontonummer(value);
    }
    return partial;
  },
  api: (context) => {
    const change = createChange(context);

    function commit(raw: string, reason: string, event?: Event) {
      const value = normalizeIban(String(raw)).slice(0, 34);
      const formatted = formatIban(value);
      const isValid = value.length === 0 || isValidIban(value);
      const kontonummer = extractNorwegianKontonummer(value);
      // change() calls onValueChange itself, with details
      const ok = change("value", value, { reason, event });
      if (!ok) return false;
      context.store.set({ formatted, isValid, kontonummer });
      return true;
    }

    return {
      // A person's input passes its DOM event, so the change reports their real source.
      setIban: (raw: string, event?: unknown) => commit(textOf(raw, "setIban"), "set-iban", asEvent(event)),
      clear: () => commit("", "clear"),
    };
  },
  slots: (slot) => ({
    root: slot({
      attrs: (state) => ({
        "data-slot": "iban-input",
        "data-valid": state.isValid ? "true" : "false",
        "data-disabled": state.disabled ? "" : undefined,
        "data-readonly": state.readOnly ? "" : undefined,
      }),
      state: (state) => ({ value: state.value }),
    }),
    input: slot({
      attrs: (state) => ({
        "data-slot": "iban-field",
        type: "text",
        autoComplete: "off",
        spellcheck: "false",
        value: state.formatted,
        "aria-invalid": state.value.length > 0 && !isValidIban(state.value) ? "true" : undefined,
        "data-agent-secret": "",
        "aria-label": state.label,
        ...inputLockAttrs(state),
      }),
      on: {
        input: (event, { api, store }) => {
          if (isLocked(store.get())) return;
          api.setIban((event.target as HTMLInputElement).value, event);
        },
      },
    }),
  }),
  agent: {
    actions: ["setIban", "clear"],
    secret: true,
  },
});
