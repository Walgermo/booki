import type { AccountOption } from "@booki/core/voucher";
import { createParts } from "@ui-sdk/react/primitive";
import type { ComponentProps } from "react";
import { FormValue, type BookiFormProps } from "./form-props.js";
import { useBookiLocaleOptional } from "./locale.js";
import { accountPicker } from "@booki/primitives/account-picker";

const parts = createParts(accountPicker, {
  root: "div",
  input: "input",
  list: "div",
  option: "div",
  empty: "div",
  select: "select",
});

const AccountPickerRoot = parts.Root;
/** The search field: an editable combobox that filters the chart of accounts. */
const AccountPickerInput = parts.Input;
const AccountPickerList = parts.List;
const AccountPickerOption = parts.Option;
const AccountPickerEmpty = parts.Empty;
/** The native `<select>` fallback, shown by @booki/styles on touch screens. */
const AccountPickerControl = parts.Select;

export type AccountPickerProps = {
  accounts: AccountOption[];
  value?: string;
  /** Starting account when uncontrolled. Defaults to the first account. */
  defaultValue?: string;
  onValueChange?: (accountNumber: string) => void;
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
