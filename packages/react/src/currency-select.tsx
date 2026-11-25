import { createParts } from "@ui-sdk/react/primitive";
import type { ComponentProps } from "react";
import { FormValue, type BookiFormProps } from "./form-props.js";
import { useBookiLocaleOptional } from "./locale.js";
import { DEFAULT_CURRENCIES, currencySelect } from "@booki-aui/primitives/currency-select";

const parts = createParts(currencySelect, {
  root: "div",
  trigger: "button",
  list: "div",
  option: "div",
  select: "select",
});

const CurrencySelectRoot = parts.Root;
/** The select-only combobox a person opens. */
const CurrencySelectTrigger = parts.Trigger;
const CurrencySelectList = parts.List;
const CurrencySelectOption = parts.Option;
/** The native `<select>` fallback, shown by @booki-aui/styles on touch screens. */
const CurrencySelectControl = parts.Select;

export type CurrencySelectProps = {
  value?: string;
  defaultValue?: string;
  currencies?: readonly string[];
  onValueChange?: (currency: string) => void;
  className?: string;
} & BookiFormProps &
  Omit<ComponentProps<"div">, "onChange" | "defaultValue" | "children" | "id">;

function CurrencySelect({
  value,
  defaultValue,
  currencies = DEFAULT_CURRENCIES,
  onValueChange,
  name,
  id,
  disabled,
  readOnly,
  required,
  className,
  ...props
}: CurrencySelectProps) {
  const { country } = useBookiLocaleOptional();
  const label = country === "NO" ? "Valuta" : "Currency";
  return (
    <CurrencySelectRoot
      value={value}
      // A controlled select takes no default: ui-sdk warns when it gets both.
      defaultValue={value === undefined ? (defaultValue ?? "NOK") : undefined}
      currencies={currencies}
      label={label}
      onValueChange={onValueChange}
      disabled={disabled}
      readOnly={readOnly}
      className={className}
      aria-label={label}
      {...props}
    >
      {(state: { value: string }) => (
        <>
          <CurrencySelectTrigger id={id} aria-required={required || undefined}>
            {(trigger: { text: string }) => <span data-slot="currency-select-value">{trigger.text}</span>}
          </CurrencySelectTrigger>
          <CurrencySelectList>
            {currencies.map((code) => (
              <CurrencySelectOption key={code} value={code} label={code}>
                {code}
              </CurrencySelectOption>
            ))}
          </CurrencySelectList>
          <CurrencySelectControl tabIndex={-1}>
            {currencies.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </CurrencySelectControl>
          <FormValue name={name} value={state.value} disabled={disabled} />
        </>
      )}
    </CurrencySelectRoot>
  );
}

export {
  CurrencySelect,
  CurrencySelectRoot,
  CurrencySelectTrigger,
  CurrencySelectList,
  CurrencySelectOption,
  CurrencySelectControl,
  currencySelect,
};
