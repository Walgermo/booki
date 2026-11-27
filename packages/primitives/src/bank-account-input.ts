import { digitsOnly, formatKontonummer, isValidKontonummer } from "@booki-aui/core/kontonummer";
import {
  formatRoutingNumber,
  formatUsAccountNumber,
  isValidRoutingNumber,
  isValidUsAccountNumber,
} from "@booki-aui/core/routing-number";
import { createChange, definePrimitive, dispatch } from "@ui-sdk/core";
import { bindInputValidity, asEvent, textOf } from "./fields.js";
import { inputLockAttrs, isLocked, lockOptions, lockState } from "./lock.js";

export type BankAccountValue =
  | { kind: "iban"; iban: string }
  | {
      kind: "kontonummer";
      digits: string;
      formatted: string;
      isValid: boolean;
    }
  | {
      kind: "routing-account";
      routingNumber: string;
      accountNumber: string;
      isValid: boolean;
    };

export type BankKind = "kontonummer" | "routing-account";

export type BankAccountOptions = {
  kind?: BankKind;
  kontonummer?: string;
  routingNumber?: string;
  accountNumber?: string;
  label?: string;
  description?: string;
  disabled?: boolean;
  readOnly?: boolean;
  onValueChange?: (value: BankAccountValue) => void;
};

export type BankAccountState = {
  kind: BankKind;
  digits: string;
  routingNumber: string;
  accountNumber: string;
  formatted: string;
  isValid: boolean;
  label: string;
  description: string;
  disabled: boolean;
  readOnly: boolean;
};

export function deriveState(options: BankAccountOptions): BankAccountState {
  const kind = options.kind ?? "kontonummer";
  const digits = digitsOnly(options.kontonummer ?? "").slice(0, 11);
  const routingNumber = digitsOnly(options.routingNumber ?? "").slice(0, 9);
  const accountNumber = digitsOnly(options.accountNumber ?? "").slice(0, 17);
  if (kind === "routing-account") {
    return {
      kind,
      digits: "",
      routingNumber,
      accountNumber,
      formatted: [formatRoutingNumber(routingNumber), formatUsAccountNumber(accountNumber)].filter(Boolean).join(" / "),
      isValid: isValidRoutingNumber(routingNumber) && isValidUsAccountNumber(accountNumber),
      label: options.label ?? "Bank account",
      description: options.description ?? "ABA routing + account number",
      ...lockState(options),
    };
  }
  return {
    kind: "kontonummer",
    digits,
    routingNumber: "",
    accountNumber: "",
    formatted: formatKontonummer(digits),
    isValid: digits.length === 0 || isValidKontonummer(digits),
    label: options.label ?? "Kontonummer",
    description: options.description ?? "11 digits, mod11",
    ...lockState(options),
  };
}

export function toValue(state: BankAccountState): BankAccountValue {
  if (state.kind === "routing-account") {
    return {
      kind: "routing-account",
      routingNumber: state.routingNumber,
      accountNumber: state.accountNumber,
      isValid: state.isValid,
    };
  }
  return {
    kind: "kontonummer",
    digits: state.digits,
    formatted: state.formatted,
    isValid: state.isValid,
  };
}

/**
 * Agent-ready bank account: actions setKontonummer / setRouting / setAccount /
 * clear. Marked data-agent-secret.
 * The component is secret, so ui-sdk redacts every key it exposes, isValid
 * and kind included: an agent reads "[redacted]" for each, not just the value.
 */
export const bankAccount = definePrimitive({
  name: "bank-account",
  options: {
    kind: "string",
    kontonummer: "string",
    routingNumber: "string",
    accountNumber: "string",
    label: "string",
    description: "string",
    ...lockOptions,
    onValueChange: "callback",
  },
  controlled: ["kind", "digits", "routingNumber", "accountNumber", "formatted", "isValid"],
  state: (options: BankAccountOptions): BankAccountState => deriveState(options),
  sync: (options: BankAccountOptions): Partial<BankAccountState> => {
    const partial: Partial<BankAccountState> = { ...lockState(options) };
    if (options.kind !== undefined) partial.kind = options.kind;
    if (options.label !== undefined) partial.label = options.label;
    if (options.description !== undefined) {
      partial.description = options.description;
    }
    if (options.kontonummer !== undefined) {
      const digits = digitsOnly(options.kontonummer).slice(0, 11);
      partial.digits = digits;
      partial.formatted = formatKontonummer(digits);
      partial.isValid = digits.length === 0 || isValidKontonummer(digits);
    }
    if (options.routingNumber !== undefined) {
      partial.routingNumber = digitsOnly(options.routingNumber).slice(0, 9);
    }
    if (options.accountNumber !== undefined) {
      partial.accountNumber = digitsOnly(options.accountNumber).slice(0, 17);
    }
    // Derive only from values the caller passed. Deriving from `kind` alone
    // reset formatted/isValid to the empty value on every render when
    // uncontrolled.
    if (options.routingNumber !== undefined || options.accountNumber !== undefined) {
      const routing = partial.routingNumber ?? digitsOnly(options.routingNumber ?? "").slice(0, 9);
      const account = partial.accountNumber ?? digitsOnly(options.accountNumber ?? "").slice(0, 17);
      if (options.kind === "routing-account" || options.routingNumber !== undefined) {
        partial.formatted = [formatRoutingNumber(routing), formatUsAccountNumber(account)].filter(Boolean).join(" / ");
        partial.isValid = isValidRoutingNumber(routing) && isValidUsAccountNumber(account);
      }
    }
    return partial;
  },
  api: (context) => {
    const change = createChange(context);

    function commit(partial: Partial<BankAccountState>, reason: string, event?: Event) {
      const current = context.store.get();
      const merged: BankAccountState = { ...current, ...partial };
      let next: BankAccountState;
      if (merged.kind === "routing-account") {
        next = {
          ...merged,
          digits: "",
          formatted: [formatRoutingNumber(merged.routingNumber), formatUsAccountNumber(merged.accountNumber)]
            .filter(Boolean)
            .join(" / "),
          isValid: isValidRoutingNumber(merged.routingNumber) && isValidUsAccountNumber(merged.accountNumber),
        };
      } else {
        next = {
          ...merged,
          kind: "kontonummer",
          routingNumber: "",
          accountNumber: "",
          formatted: formatKontonummer(merged.digits),
          isValid: merged.digits.length === 0 || isValidKontonummer(merged.digits),
        };
      }
      // Report the first input field that actually changed. Gating on a
      // derived key (isValid) dropped every edit that kept validity the same,
      // because `change` returns false for an unchanged value.
      const changed = (["digits", "routingNumber", "accountNumber", "kind"] as const).find(
        (key) => next[key] !== current[key],
      );
      if (changed === undefined) return false;
      // The change is reported on the field that moved; the app's
      // onValueChange hears the whole value first, with details, and may cancel.
      if (dispatch(context, "onValueChange", toValue(next), { reason, event })) return false;
      const ok = change(changed, next[changed], { reason, event });
      if (!ok) return false;
      context.store.set(next);
      return true;
    }

    return {
      setKontonummer: (raw: string, event?: unknown) => {
        const digits = digitsOnly(textOf(raw, "setKontonummer")).slice(0, 11);
        return commit({ kind: "kontonummer", digits }, "set-kontonummer", asEvent(event));
      },
      setRouting: (raw: string, event?: unknown) => {
        const routingNumber = digitsOnly(textOf(raw, "setRouting")).slice(0, 9);
        return commit({ kind: "routing-account", routingNumber }, "set-routing", asEvent(event));
      },
      setAccount: (raw: string, event?: unknown) => {
        const accountNumber = digitsOnly(String(raw)).slice(0, 17);
        return commit({ kind: "routing-account", accountNumber }, "set-account", asEvent(event));
      },
      clear: () =>
        commit(
          {
            digits: "",
            routingNumber: "",
            accountNumber: "",
          },
          "clear",
        ),
    };
  },
  slots: (slot) => ({
    root: slot({
      attrs: (state) => ({
        "data-slot": "bank-account-input",
        "data-kind": state.kind,
        "data-valid": state.isValid ? "true" : "false",
        "data-disabled": state.disabled ? "" : undefined,
        "data-readonly": state.readOnly ? "" : undefined,
      }),
      state: (state) => ({
        digits: state.digits,
        routingNumber: state.routingNumber,
        accountNumber: state.accountNumber,
      }),
    }),
    kontonummer: slot({
      attrs: (state) => ({
        "data-slot": "bank-account-kontonummer",
        type: "text",
        inputMode: "numeric",
        autoComplete: "off",
        value:
          state.digits.length === 0
            ? ""
            : state.isValid || state.digits.length < 11
              ? formatKontonummer(state.digits)
              : formatKontonummer(state.digits),
        "aria-invalid": state.digits.length > 0 && !isValidKontonummer(state.digits) ? "true" : undefined,
        "data-agent-secret": "",
        "aria-label": state.label,
        ...inputLockAttrs(state),
      }),
      bind: bindInputValidity<BankAccountState>((s) =>
        s.digits && !isValidKontonummer(s.digits) ? "Ugyldig kontonummer (mod11)" : "",
      ),
      on: {
        input: (event, { api, store }) => {
          if (isLocked(store.get())) return;
          api.setKontonummer((event.target as HTMLInputElement).value, event);
        },
      },
    }),
    routing: slot({
      attrs: (state) => ({
        "data-slot": "bank-account-routing",
        type: "text",
        inputMode: "numeric",
        autoComplete: "off",
        value: formatRoutingNumber(state.routingNumber),
        "aria-invalid":
          state.routingNumber.length > 0 && !isValidRoutingNumber(state.routingNumber) ? "true" : undefined,
        "data-agent-secret": "",
        "aria-label": "Routing number",
        ...inputLockAttrs(state),
      }),
      bind: bindInputValidity<BankAccountState>((s) =>
        s.routingNumber && !isValidRoutingNumber(s.routingNumber) ? "Invalid routing number" : "",
      ),
      on: {
        input: (event, { api, store }) => {
          if (isLocked(store.get())) return;
          api.setRouting((event.target as HTMLInputElement).value, event);
        },
      },
    }),
    account: slot({
      attrs: (state) => ({
        "data-slot": "bank-account-account",
        type: "text",
        inputMode: "numeric",
        autoComplete: "off",
        value: formatUsAccountNumber(state.accountNumber),
        "aria-invalid":
          state.accountNumber.length > 0 && !isValidUsAccountNumber(state.accountNumber) ? "true" : undefined,
        "data-agent-secret": "",
        "aria-label": "Account number",
        ...inputLockAttrs(state),
      }),
      bind: bindInputValidity<BankAccountState>((s) =>
        s.accountNumber && !isValidUsAccountNumber(s.accountNumber) ? "Invalid account number" : "",
      ),
      on: {
        input: (event, { api, store }) => {
          if (isLocked(store.get())) return;
          api.setAccount((event.target as HTMLInputElement).value, event);
        },
      },
    }),
  }),
  agent: {
    actions: ["setKontonummer", "setRouting", "setAccount", "clear"],
    secret: true,
  },
});
