import type { TaxCode } from "@booki-aui/core/locale";
import { createParts, type Parts } from "@ui-sdk/react/primitive";
import type { ComponentProps } from "react";
import { FormValue, type BookiFormProps, splitFieldAria } from "./form-props.js";
import { useBookiLocaleOptional } from "./locale.js";
import { taxCodeSelect } from "@booki-aui/primitives/tax-code-select";

const TAGS = {
  root: "div",
  trigger: "button",
  list: "div",
  option: "div",
  select: "select",
} as const;
// Typed by name, so the declarations refer to the definition instead of spelling it out per part.
const parts: Parts<typeof taxCodeSelect, typeof TAGS> = createParts(taxCodeSelect, TAGS);

const TaxCodeSelectRoot: (typeof parts)["Root"] = parts.Root;
/** The select-only combobox a person opens. */
const TaxCodeSelectTrigger: (typeof parts)["Trigger"] = parts.Trigger;
const TaxCodeSelectList: (typeof parts)["List"] = parts.List;
const TaxCodeSelectOption: (typeof parts)["Option"] = parts.Option;
/** The native `<select>` fallback, shown by @booki-aui/styles on touch screens. */
const TaxCodeSelectControl: (typeof parts)["Select"] = parts.Select;

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
  const { field, rest } = splitFieldAria(props);
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
      {...rest}
    >
      {(state: { value: string }) => (
        <>
          <TaxCodeSelectTrigger id={id} aria-required={required || undefined} {...field}>
            {(trigger: { text: string }) => <span data-slot="tax-code-select-value">{trigger.text || "–"}</span>}
          </TaxCodeSelectTrigger>
          <TaxCodeSelectList>
            {codes.map((code) => (
              <TaxCodeSelectOption key={code.code} value={code.code} label={code.label}>
                {code.label}
              </TaxCodeSelectOption>
            ))}
          </TaxCodeSelectList>
          <TaxCodeSelectControl tabIndex={-1} aria-required={required || undefined} {...field}>
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
