import type { TaxCode } from "@booki/core/locale";
import { createParts } from "@ui-sdk/react/primitive";
import type { ComponentProps } from "react";
import { FormValue, type BookiFormProps } from "./form-props.js";
import { useBookiLocaleOptional } from "./locale.js";
import { taxCodeSelect } from "@booki/primitives/tax-code-select";

const parts = createParts(taxCodeSelect, {
  root: "div",
  trigger: "button",
  list: "div",
  option: "div",
  select: "select",
});

const TaxCodeSelectRoot = parts.Root;
/** The select-only combobox a person opens. */
const TaxCodeSelectTrigger = parts.Trigger;
const TaxCodeSelectList = parts.List;
const TaxCodeSelectOption = parts.Option;
/** The native `<select>` fallback, shown by @booki/styles on touch screens. */
const TaxCodeSelectControl = parts.Select;

export type TaxCodeSelectProps = {
  value?: string;
  defaultValue?: string;
  codes?: TaxCode[];
  onValueChange?: (code: string, tax?: TaxCode) => void;
  className?: string;
} & BookiFormProps &
  Omit<ComponentProps<"div">, "onChange" | "defaultValue" | "children" | "id">;

function TaxCodeSelect({
  value,
  defaultValue,
  codes: codesProp,
  onValueChange,
  name,
  id,
  disabled,
  readOnly,
  required,
  className,
  ...props
}: TaxCodeSelectProps) {
  const { profile } = useBookiLocaleOptional();
  const codes = codesProp ?? profile.tax.codes;
  const fallback = defaultValue ?? codes.find((c) => c.percent === profile.tax.defaultPercent)?.code ?? codes[0]?.code;

  return (
    <TaxCodeSelectRoot
      // Uncontrolled, a new list of codes (another country) starts over at its
      // default, so the value never names a code the list no longer has.
      key={value === undefined ? codes.map((c) => c.code).join("|") : undefined}
      {...(value !== undefined ? { value } : { defaultValue: fallback })}
      codes={codes}
      label={profile.tax.label}
      onValueChange={(code: string) => {
        onValueChange?.(
          code,
          codes.find((entry) => entry.code === code),
        );
      }}
      disabled={disabled}
      readOnly={readOnly}
      className={className}
      aria-label={profile.tax.label}
      {...props}
    >
      {(state: { value: string }) => (
        <>
          <TaxCodeSelectTrigger id={id} aria-required={required || undefined}>
            {(trigger: { text: string }) => <span data-slot="tax-code-select-value">{trigger.text || "–"}</span>}
          </TaxCodeSelectTrigger>
          <TaxCodeSelectList>
            {codes.map((code) => (
              <TaxCodeSelectOption key={code.code} value={code.code} label={code.label}>
                {code.label}
              </TaxCodeSelectOption>
            ))}
          </TaxCodeSelectList>
          <TaxCodeSelectControl tabIndex={-1}>
            {state.value === "" ? <option value="">–</option> : null}
            {codes.map((code) => (
              <option key={code.code} value={code.code}>
                {code.label}
              </option>
            ))}
          </TaxCodeSelectControl>
          <FormValue name={name} value={state.value} disabled={disabled} />
        </>
      )}
    </TaxCodeSelectRoot>
  );
}

export {
  TaxCodeSelect,
  TaxCodeSelectRoot,
  TaxCodeSelectTrigger,
  TaxCodeSelectList,
  TaxCodeSelectOption,
  TaxCodeSelectControl,
  taxCodeSelect,
};
