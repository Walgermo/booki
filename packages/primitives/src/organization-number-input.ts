import {
  formatOrganizationNumber,
  isValidOrganizationNumber,
  normalizeOrganizationNumber,
  type OrganizationNumberKind,
} from "@booki-aui/core/organization-number";
import { createChange, definePrimitive, dispatch } from "@ui-sdk/core";
import { asEvent } from "./fields.js";
import { inputLockAttrs, isLocked, lockOptions, lockState } from "./lock.js";

export type OrganizationNumberOptions = {
  kind?: OrganizationNumberKind;
  value?: string;
  defaultValue?: string;
  label?: string;
  description?: string;
  disabled?: boolean;
  readOnly?: boolean;
  onValueChange?: (value: string) => void;
};

export type OrganizationNumberState = {
  kind: OrganizationNumberKind;
  digits: string;
  formatted: string;
  isValid: boolean;
  label: string;
  description: string;
  disabled: boolean;
  readOnly: boolean;
};

export function deriveState(options: OrganizationNumberOptions): OrganizationNumberState {
  const kind = options.kind ?? "orgnr";
  const digits = normalizeOrganizationNumber(options.value ?? options.defaultValue ?? "", kind);
  return {
    kind,
    digits,
    formatted: formatOrganizationNumber(digits, kind),
    isValid: digits.length === 0 || isValidOrganizationNumber(digits, kind),
    label: options.label ?? (kind === "ein" ? "EIN" : "Organisasjonsnummer"),
    description: options.description ?? (kind === "ein" ? "XX-XXXXXXX" : "9 digits, mod11"),
    ...lockState(options),
  };
}

/**
 * Agent-ready organization id: NO orgnr (mod11) or US EIN.
 * Actions: setOrganizationNumber / clear. Snapshot: kind, digits, formatted, isValid.
 */
export const organizationNumber = definePrimitive({
  name: "organization-number",
  options: {
    kind: "string",
    value: "string",
    defaultValue: "string",
    label: "string",
    description: "string",
    ...lockOptions,
    onValueChange: "callback",
  },
  controlled: ["kind", "digits", "formatted", "isValid"],
  state: (options: OrganizationNumberOptions): OrganizationNumberState => deriveState(options),
  sync: (options: OrganizationNumberOptions): Partial<OrganizationNumberState> => {
    const partial: Partial<OrganizationNumberState> = {
      ...lockState(options),
    };
    if (options.kind !== undefined) partial.kind = options.kind;
    if (options.label !== undefined) partial.label = options.label;
    if (options.description !== undefined) {
      partial.description = options.description;
    }
    // Only a passed value re-derives digits; deriving on `kind` alone wiped
    // an uncontrolled field on every render.
    if (options.value !== undefined) {
      const kind = options.kind ?? "orgnr";
      const digits = normalizeOrganizationNumber(options.value, kind);
      partial.digits = digits;
      partial.formatted = formatOrganizationNumber(digits, kind);
      partial.isValid = digits.length === 0 || isValidOrganizationNumber(digits, kind);
    }
    return partial;
  },
  api: (context) => {
    const change = createChange(context);

    function commit(raw: string, reason: string, event?: Event) {
      const { kind } = context.store.get();
      const digits = normalizeOrganizationNumber(String(raw), kind);
      const formatted = formatOrganizationNumber(digits, kind);
      const isValid = digits.length === 0 || isValidOrganizationNumber(digits, kind);
      if (digits === context.store.get().digits) return false;
      // The change is reported on `digits`; the app's onValueChange hears it
      // first, with details, and may cancel it.
      if (dispatch(context, "onValueChange", digits, { reason, event })) return false;
      const ok = change("digits", digits, { reason, event });
      if (!ok) return false;
      context.store.set({ formatted, isValid });
      return true;
    }

    return {
      setOrganizationNumber: (raw: string, event?: unknown) =>
        commit(String(raw), "set-organization-number", asEvent(event)),
      /** Same as setOrganizationNumber; lets history / staging restore key `digits`. */
      setDigits: (raw: string) => commit(String(raw ?? ""), "set-digits"),
      clear: () => commit("", "clear"),
    };
  },
  slots: (slot) => ({
    root: slot({
      attrs: (state) => ({
        "data-slot": "organization-number-input",
        "data-kind": state.kind,
        "data-valid": state.isValid ? "true" : "false",
        "data-disabled": state.disabled ? "" : undefined,
        "data-readonly": state.readOnly ? "" : undefined,
      }),
      state: (state) => ({ kind: state.kind, digits: state.digits }),
    }),
    input: slot({
      attrs: (state) => ({
        "data-slot": "organization-number-field",
        type: "text",
        inputMode: "numeric",
        autoComplete: "off",
        value: state.formatted,
        "aria-invalid":
          state.digits.length > 0 && !isValidOrganizationNumber(state.digits, state.kind) ? "true" : undefined,
        "aria-label": state.label,
        ...inputLockAttrs(state),
      }),
      on: {
        input: (event, { api, store }) => {
          if (isLocked(store.get())) return;
          api.setOrganizationNumber((event.target as HTMLInputElement).value, event);
        },
      },
    }),
  }),
  agent: {
    actions: ["setOrganizationNumber", "setDigits", "clear"],
  },
});
