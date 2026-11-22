import type { AccountOption } from "@booki/core/voucher";
import { BookiError } from "@booki/core/msg";
import { createChange, definePrimitive } from "@ui-sdk/core";
import { asEvent } from "./fields.js";
import { isLocked, lockOptions, lockState, restoreSelect, selectLockAttrs } from "./lock.js";
import {
  createPicker,
  fallbackAttrs,
  pickerEmpty,
  pickerInput,
  pickerList,
  pickerOption,
  pickerState,
  type PickerOwnState,
} from "./picker.js";

export type AgentItem = { value: string; label: string };

export type AccountPickerOptions = {
  accounts?: AccountOption[];
  value?: string;
  defaultValue?: string;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  onValueChange?: (accountNumber: string) => void;
};

export type AccountPickerState = {
  value: string;
  name: string;
  items: AgentItem[];
  accounts: AccountOption[];
  label: string;
  placeholder: string;
  disabled: boolean;
  readOnly: boolean;
} & PickerOwnState;

export function toItems(accounts: AccountOption[]): AgentItem[] {
  return accounts.map((a) => ({
    value: a.number,
    label: `${a.number} — ${a.name}`,
  }));
}

export function resolveAccount(accounts: AccountOption[], raw: string): AccountOption | undefined {
  const text = String(raw).trim();
  return (
    accounts.find((a) => a.number === text) ??
    accounts.find((a) => a.name === text) ??
    accounts.find((a) => `${a.number} — ${a.name}` === text) ??
    accounts.find((a) => a.name.toLowerCase() === text.toLowerCase())
  );
}

export function pickInitial(
  accounts: AccountOption[],
  value?: string,
  defaultValue?: string,
): AccountOption | undefined {
  // No value, or one the chart lacks, is no selection. An account nobody chose would be posted to.
  const wanted = value ?? defaultValue;
  return wanted ? resolveAccount(accounts, wanted) : undefined;
}

/**
 * Closed chart-of-accounts picker. Agents call setAccount; unknown codes refused.
 */
export const accountPicker = definePrimitive({
  name: "account-picker",
  options: {
    accounts: "value",
    value: "string",
    defaultValue: "string",
    label: "string",
    placeholder: "string",
    ...lockOptions,
    onValueChange: "callback",
  },
  controlled: ["value", "name", "items"],
  state: (options: AccountPickerOptions): AccountPickerState => {
    const accounts = options.accounts ?? [];
    const selected = pickInitial(accounts, options.value, options.defaultValue);
    return {
      value: selected?.number ?? "",
      name: selected?.name ?? "",
      items: toItems(accounts),
      accounts,
      label: options.label ?? "Account",
      placeholder: options.placeholder ?? "Select account…",
      ...lockState(options),
      ...pickerState(selected?.number ?? ""),
    };
  },
  sync: (options: AccountPickerOptions): Partial<AccountPickerState> => {
    const partial: Partial<AccountPickerState> = { ...lockState(options) };
    if (options.label !== undefined) partial.label = options.label;
    if (options.placeholder !== undefined) {
      partial.placeholder = options.placeholder;
    }
    if (options.accounts !== undefined) {
      partial.accounts = options.accounts;
      partial.items = toItems(options.accounts);
    }
    if (options.value !== undefined) {
      const accounts = options.accounts ?? [];
      const selected = resolveAccount(accounts, options.value);
      partial.value = selected?.number ?? "";
      partial.name = selected?.name ?? "";
    }
    return partial;
  },
  api: (context) => {
    const change = createChange(context);

    function apply(account: AccountOption, reason: string, event?: Event) {
      const ok = change("value", account.number, { reason, event });
      if (!ok) return false;
      context.store.set({ name: account.name });
      return true;
    }

    // A person searches the chart of accounts and picks from the filtered list.
    const picker = createPicker(context, {
      search: true,
      commit: (key, why) => {
        const account = resolveAccount(context.store.get().accounts, key);
        return account ? apply(account, why.reason, why.event) : false;
      },
      text: (state) => state.items.find((i) => i.value === state.value)?.label ?? "",
    });

    const methods = {
      picker,
      setAccount: (raw: string, event?: unknown) => {
        const { accounts, items } = context.store.get();
        const selected = resolveAccount(accounts, String(raw));
        if (!selected) {
          const listed = items.map((i) => i.label).join(", ");
          throw new BookiError("select.unknown-account", { value: String(raw), items: listed || "(none)" });
        }
        return apply(selected, "set-account", asEvent(event));
      },
      /** Same as setAccount, and "" empties it: history and staging restore `value` through set<Key>. */
      setValue: (raw: string, event?: unknown): boolean =>
        raw === "" ? methods.clear() : methods.setAccount(raw, event),
      /** No account: never another one. */
      clear: (): boolean => {
        const ok = change("value", "", { reason: "clear" });
        if (ok) context.store.set({ name: "" });
        return ok;
      },
      allItems: () => context.store.get().items,
    };
    return methods;
  },
  slots: (slot) => ({
    root: slot({
      attrs: (state) => ({
        "data-slot": "account-picker",
        "aria-label": state.label,
        "data-disabled": state.disabled ? "" : undefined,
        "data-readonly": state.readOnly ? "" : undefined,
      }),
      state: (state) => ({ value: state.value }),
    }),
    select: slot({
      attrs: (state) => ({
        "data-slot": "account-picker-control",
        value: state.value,
        // The native fallback: the picker a finger uses (see picker.ts).
        ...fallbackAttrs(state, true),
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
          api.setAccount((event.target as HTMLSelectElement).value, event);
        },
      },
    }),
    input: pickerInput(slot),
    list: pickerList(slot),
    option: pickerOption(slot),
    empty: pickerEmpty(slot),
  }),
  agent: {
    actions: ["setAccount", "setValue", "clear"],
    // No `closed`: the bridge would refuse unknown text before our method runs,
    // in its own words. Our method refuses it too, from the catalogue, naming the valid items.
    items: (api) => api.allItems(),
  },
});
