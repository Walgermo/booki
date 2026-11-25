import type { AccountOption } from "@booki-aui/core/voucher";
import { createParts, type Parts } from "@ui-sdk/react/primitive";
import type { ComponentProps } from "react";
import { FormValue, type BookiFormProps } from "./form-props.js";
import { useBookiLocaleOptional } from "./locale.js";
import { accountPicker } from "@booki-aui/primitives/account-picker";

const TAGS = {
  root: "div",
  input: "input",
  list: "div",
  option: "div",
  empty: "div",
  select: "select",
} as const;
// Typed by name, so the declarations refer to the definition instead of spelling it out per part.
const parts: Parts<typeof accountPicker, typeof TAGS> = createParts(accountPicker, TAGS);

const AccountPickerRoot: (typeof parts)["Root"] = parts.Root;
/** The search field: an editable combobox that filters the chart of accounts. */
const AccountPickerInput: (typeof parts)["Input"] = parts.Input;
const AccountPickerList: (typeof parts)["List"] = parts.List;
const AccountPickerOption: (typeof parts)["Option"] = parts.Option;
const AccountPickerEmpty: (typeof parts)["Empty"] = parts.Empty;
/** The native `<select>` fallback, shown by @booki-aui/styles on touch screens. */
const AccountPickerControl: (typeof parts)["Select"] = parts.Select;

export type AccountPickerProps = {
  accounts: AccountOption[];
  value?: string;
  /** Starting account when uncontrolled. Without one, no account is chosen. */
  defaultValue?: string;
  /** Hears every change, with why and from whom: `details.source` is `"agent"` for the agent's. */
  onValueChange?: (accountNumber: string, details: { reason: string; source?: string }) => void;
  className?: string;
} & BookiFormProps &
  Omit<ComponentProps<"div">, "onChange" | "defaultValue" | "children" | "id">;

function AccountPicker({
  accounts,
  value,
  defaultValue,
  onValueChange,
  name,
  id,
  disabled,
  readOnly,
  required,
  className,
  ...props
}: AccountPickerProps) {
  const { profile } = useBookiLocaleOptional();

  return (
    <AccountPickerRoot
      accounts={accounts}
      value={value}
      defaultValue={defaultValue}
      label={profile.copy.account}
      placeholder={profile.copy.selectAccount}
      onValueChange={onValueChange}
      disabled={disabled}
      readOnly={readOnly}
      className={className}
      aria-label={profile.copy.account}
      {...props}
    >
      {(state: { value: string }) => (
        <>
          <AccountPickerInput id={id} required={required} />
          <AccountPickerList>
            {accounts.map((account) => {
              const label = `${account.number} — ${account.name}`;
              return (
                <AccountPickerOption key={account.number} value={account.number} label={label}>
                  <span data-slot="account-picker-number">{account.number}</span>
                  <span data-slot="account-picker-name">{account.name}</span>
                </AccountPickerOption>
              );
            })}
          </AccountPickerList>
          <AccountPickerEmpty>
            {profile.locale.startsWith("nb") ? "Ingen kontoer passer søket" : "No accounts match"}
          </AccountPickerEmpty>
          <AccountPickerControl tabIndex={-1}>
            {state.value === "" ? <option value="" /> : null}
            {accounts.map((account) => (
              <option key={account.number} value={account.number}>
                {account.number} — {account.name}
              </option>
            ))}
          </AccountPickerControl>
          <FormValue name={name} value={state.value} disabled={disabled} />
        </>
      )}
    </AccountPickerRoot>
  );
}

export {
  AccountPicker,
  AccountPickerRoot,
  AccountPickerInput,
  AccountPickerList,
  AccountPickerOption,
  AccountPickerEmpty,
  AccountPickerControl,
  accountPicker,
};
