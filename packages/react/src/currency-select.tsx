import { createParts, type Parts } from "@ui-sdk/react/primitive";
import type { ComponentProps } from "react";
import { FormValue, type BookiFormProps, splitFieldAria } from "./form-props.js";
import { useBookiLocaleOptional } from "./locale.js";
import { DEFAULT_CURRENCIES, currencySelect } from "@booki-aui/primitives/currency-select";

const TAGS = {
  root: "div",
  trigger: "button",
  list: "div",
  option: "div",
  select: "select",
} as const;
// Typed by name, so the declarations refer to the definition instead of spelling it out per part.
const parts: Parts<typeof currencySelect, typeof TAGS> = createParts(currencySelect, TAGS);

const CurrencySelectRoot: (typeof parts)["Root"] = parts.Root;
/** The select-only combobox a person opens. */
const CurrencySelectTrigger: (typeof parts)["Trigger"] = parts.Trigger;
const CurrencySelectList: (typeof parts)["List"] = parts.List;
const CurrencySelectOption: (typeof parts)["Option"] = parts.Option;
/** The native `<select>` fallback, shown by @booki-aui/styles on touch screens. */
const CurrencySelectControl: (typeof parts)["Select"] = parts.Select;

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
  const { field, rest } = splitFieldAria(props);
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
      {...rest}
    >
      {(state: { value: string }) => (
        <>
          <CurrencySelectTrigger id={id} aria-required={required || undefined} {...field}>
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
