import { createChange, definePrimitive } from "@ui-sdk/core";
import { asEvent, textOf } from "./fields.js";
import { inputLockAttrs, isLocked, lockOptions, lockState } from "./lock.js";

export type InvoiceNumberOptions = {
  value?: string;
  defaultValue?: string;
  label?: string;
  description?: string;
  disabled?: boolean;
  readOnly?: boolean;
  onValueChange?: (value: string) => void;
};

export type InvoiceNumberState = {
  value: string;
  label: string;
  description: string;
  disabled: boolean;
  readOnly: boolean;
};

/**
 * Agent-ready invoice / document number. Actions: setInvoiceNumber / clear.
 */
export const invoiceNumber = definePrimitive({
  name: "invoice-number",
  options: {
    value: "string",
    defaultValue: "string",
    label: "string",
    description: "string",
    ...lockOptions,
    onValueChange: "callback",
  },
  controlled: ["value"],
  state: (options: InvoiceNumberOptions): InvoiceNumberState => ({
    value: String(options.value ?? options.defaultValue ?? "").trim(),
    label: options.label ?? "Invoice #",
    description: options.description ?? "Supplier or sales invoice number",
    ...lockState(options),
  }),
  sync: (options: InvoiceNumberOptions): Partial<InvoiceNumberState> => {
    const partial: Partial<InvoiceNumberState> = { ...lockState(options) };
    if (options.label !== undefined) partial.label = options.label;
    if (options.description !== undefined) {
      partial.description = options.description;
    }
    if (options.value !== undefined) {
      partial.value = String(options.value).trim();
    }
    return partial;
  },
  api: (context) => {
    const change = createChange(context);

    function commit(raw: string, reason: string, event?: Event) {
      const value = String(raw).trim().slice(0, 64);
      // change() calls onValueChange itself, with details
      const ok = change("value", value, { reason, event });
      if (!ok) return false;
      return true;
    }

    return {
      setInvoiceNumber: (raw: string, event?: unknown) =>
        commit(textOf(raw, "setInvoiceNumber"), "set-invoice-number", asEvent(event)),
      /** Same as setInvoiceNumber; lets history / staging restore key `value`. */
      setValue: (raw: string) => commit(textOf(raw, "setValue"), "set-value"),
      clear: () => commit("", "clear"),
    };
  },
  slots: (slot) => ({
    root: slot({
      attrs: (state) => ({
        "data-slot": "invoice-number-input",
        "data-disabled": state.disabled ? "" : undefined,
        "data-readonly": state.readOnly ? "" : undefined,
      }),
      state: (state) => ({ value: state.value }),
    }),
    input: slot({
      attrs: (state) => ({
        "data-slot": "invoice-number-field",
        type: "text",
        autoComplete: "off",
        value: state.value,
        "aria-label": state.label,
        ...inputLockAttrs(state),
      }),
      on: {
        input: (event, { api, store }) => {
          if (isLocked(store.get())) return;
          api.setInvoiceNumber((event.target as HTMLInputElement).value, event);
        },
      },
    }),
  }),
  agent: {
    actions: ["setInvoiceNumber", "setValue", "clear"],
  },
});
