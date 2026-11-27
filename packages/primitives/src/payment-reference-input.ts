import { formatKid, generateKid, isValidKid } from "@booki-aui/core/kid";
import { BookiError } from "@booki-aui/core/msg";
import { createChange, definePrimitive } from "@ui-sdk/core";
import { bindInputValidity, asEvent, textOf } from "./fields.js";
import { inputLockAttrs, isLocked, lockOptions, lockState } from "./lock.js";

export type RefKind = "kid" | "memo";

export type PaymentReferenceOptions = {
  kind?: RefKind;
  value?: string;
  defaultValue?: string;
  label?: string;
  description?: string;
  disabled?: boolean;
  readOnly?: boolean;
  /** A memo or invoice reference reads "[redacted]" to an agent too. A KID always does. */
  secretReference?: boolean;
  onValueChange?: (value: string) => void;
};

export type PaymentReferenceState = {
  kind: RefKind;
  value: string;
  isValid: boolean;
  label: string;
  description: string;
  disabled: boolean;
  readOnly: boolean;
  secretReference: boolean;
};

/** Whether an agent reads the reference as "[redacted]": a KID always, a memo when the app says so. */
export function referenceIsSecret(kind: RefKind | undefined, secretReference: boolean | undefined): boolean {
  return (kind ?? "kid") === "kid" || Boolean(secretReference);
}

export function normalizeValue(kind: RefKind, raw: string): string {
  return kind === "kid" ? formatKid(raw) : String(raw);
}

export function computeValid(kind: RefKind, value: string): boolean {
  if (kind === "memo") return value.trim().length > 0 || value.length === 0;
  if (value.length === 0) return true;
  if (value.length < 4) return true;
  return isValidKid(value, 10);
}

export function deriveState(options: PaymentReferenceOptions): PaymentReferenceState {
  const kind = options.kind ?? "kid";
  const value = normalizeValue(kind, options.value ?? options.defaultValue ?? "");
  return {
    kind,
    value,
    isValid: computeValid(kind, value),
    label: options.label ?? (kind === "kid" ? "KID" : "Payment memo"),
    description: options.description ?? (kind === "kid" ? "4–25 digits, mod 10" : "Invoice or remittance reference"),
    secretReference: Boolean(options.secretReference),
    ...lockState(options),
  };
}

/**
 * Agent-ready payment reference: setReference / generateKid / clear.
 * A KID is secret. A memo or invoice reference is not, unless the app sets
 * `secretReference`. Once marked, ui-sdk keeps the component secret (it does
 * not unmark), so kind, value and isValid all read "[redacted]" from then on.
 */
export const paymentReference = definePrimitive({
  name: "payment-reference",
  options: {
    kind: "string",
    value: "string",
    defaultValue: "string",
    label: "string",
    description: "string",
    secretReference: "boolean",
    ...lockOptions,
    onValueChange: "callback",
  },
  controlled: ["kind", "value", "isValid"],
  state: (options: PaymentReferenceOptions): PaymentReferenceState => deriveState(options),
  sync: (options: PaymentReferenceOptions): Partial<PaymentReferenceState> => {
    const partial: Partial<PaymentReferenceState> = { ...lockState(options) };
    if (options.kind !== undefined) partial.kind = options.kind;
    if (options.label !== undefined) partial.label = options.label;
    if (options.secretReference !== undefined) partial.secretReference = options.secretReference;
    if (options.description !== undefined) {
      partial.description = options.description;
    }
    if (options.value !== undefined) {
      const kind = options.kind ?? "kid";
      const value = normalizeValue(kind, options.value);
      partial.value = value;
      partial.isValid = computeValid(kind, value);
    }
    return partial;
  },
  api: (context) => {
    const change = createChange(context);

    function commit(raw: string, reason: string, event?: Event) {
      const { kind } = context.store.get();
      const value = normalizeValue(kind, raw);
      const isValid = computeValid(kind, value);
      const ok = change("value", value, { reason, event });
      if (!ok) return false;
      context.store.set({ isValid });
      return true;
    }

    return {
      setReference: (raw: string, event?: unknown) =>
        commit(textOf(raw, "setReference"), "set-reference", asEvent(event)),
      /** Same as setReference; lets history / staging restore key `value`. */
      setValue: (raw: string) => commit(String(raw ?? ""), "set-value"),
      generateKid: (body?: string) => {
        const { kind } = context.store.get();
        if (kind !== "kid") {
          throw new BookiError("reference.kid-only", { kind });
        }
        const seed = body !== undefined && String(body).length > 0 ? String(body) : "1001234";
        const kid = generateKid(seed, 10);
        if (!kid) {
          throw new BookiError("reference.kid-failed", { seed });
        }
        return commit(kid, "generate-kid");
      },
      clear: () => commit("", "clear"),
    };
  },
  slots: (slot) => ({
    root: slot({
      attrs: (state) => ({
        "data-slot": "payment-reference-input",
        "data-kind": state.kind,
        "data-valid": state.isValid ? "true" : "false",
        "data-disabled": state.disabled ? "" : undefined,
        "data-readonly": state.readOnly ? "" : undefined,
      }),
      state: (state) => ({ kind: state.kind, value: state.value }),
    }),
    input: slot({
      attrs: (state) => {
        const kidInvalid = state.kind === "kid" && state.value.length >= 4 && !isValidKid(state.value, 10);
        return {
          "data-slot": "payment-reference-field",
          type: "text",
          inputMode: state.kind === "kid" ? "numeric" : "text",
          autoComplete: "off",
          value: state.value,
          "aria-invalid": kidInvalid ? "true" : undefined,
          "data-agent-secret": referenceIsSecret(state.kind, state.secretReference) ? "" : undefined,
          "aria-label": state.label,
          ...inputLockAttrs(state),
        };
      },
      bind: bindInputValidity<PaymentReferenceState>((s) =>
        s.kind === "kid" && s.value && !isValidKid(s.value, 10) ? "Ugyldig KID" : "",
      ),
      on: {
        input: (event, { api, store }) => {
          if (isLocked(store.get())) return;
          api.setReference((event.target as HTMLInputElement).value, event);
        },
      },
    }),
  }),
  agent: {
    actions: ["setReference", "setValue", "generateKid", "clear"],
  },
});
