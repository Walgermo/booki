import type { AccountOption } from "@booki/core/voucher";
import { createChange, definePrimitive } from "@ui-sdk/core";
import { asEvent } from "./fields.js";
import { isLocked, lockOptions, lockState, restoreSelect, selectLockAttrs } from "./lock.js";
import { itemsHint, refuseUnknown, shownItems } from "./offered.js";
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
  /** Hears every change, with why and from whom: `details.source` is `"agent"` for the agent's. */
  onValueChange?: (accountNumber: string, details: { reason: string; source?: string }) => void;
};

export type AccountPickerState = {
  value: string;
  name: string;
  /** What the snapshot lists: all of a short chart, none of a long one. */
  items: AgentItem[];
  /** How to find an account in a chart too long to list. */
  itemsHint: string;
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
  controlled: ["value", "name", "items", "itemsHint"],
  state: (options: AccountPickerOptions): AccountPickerState => {
    const accounts = options.accounts ?? [];
    const selected = pickInitial(accounts, options.value, options.defaultValue);
    return {
      value: selected?.number ?? "",
      name: selected?.name ?? "",
      items: shownItems(toItems(accounts)),
      itemsHint: itemsHint(toItems(accounts)),
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
      partial.items = shownItems(toItems(options.accounts));
      partial.itemsHint = itemsHint(toItems(options.accounts));
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
      text: (state) => toItems(state.accounts.filter((a) => a.number === state.value))[0]?.label ?? "",
    });

    const methods = {
      picker,
      setAccount: (raw: string, event?: unknown) => {
        const { accounts } = context.store.get();
        const selected = resolveAccount(accounts, String(raw));
        if (!selected) refuseUnknown("select.unknown-account", toItems(accounts), raw);
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
      allItems: () => toItems(context.store.get().accounts),
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
