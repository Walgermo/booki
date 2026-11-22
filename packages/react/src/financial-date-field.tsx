import { type FinancialDateKind } from "@booki/core/financial-date";
import { Field, FieldError, FieldLabel } from "@ui-sdk/react/field";
import { createParts } from "@ui-sdk/react/primitive";
import type { ComponentProps } from "react";
import { FormValue, type BookiFormProps } from "./form-props.js";
import { useBookiLocaleOptional } from "./locale.js";
import { financialDate } from "@booki/primitives/financial-date-field";

const parts = createParts(financialDate, {
  root: "div",
  input: "input",
});

const FinancialDateRoot = parts.Root;
const FinancialDateControl = parts.Input;

export type FinancialDateFieldProps = {
  kind?: FinancialDateKind;
  /** Controlled value. Omit it (and use `defaultValue`) to let the field hold its own state. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
  className?: string;
} & Omit<BookiFormProps, "required"> &
  Omit<ComponentProps<"div">, "onChange" | "defaultValue" | "children" | "id">;

function FinancialDateField({
  kind = "invoice",
  value,
  defaultValue,
  onValueChange,
  required,
  name,
  id,
  disabled,
  readOnly,
  className,
  ...props
}: FinancialDateFieldProps) {
  const { profile } = useBookiLocaleOptional();
  const label =
    kind === "invoice" ? profile.copy.invoiceDate : kind === "due" ? profile.copy.dueDate : profile.copy.postingDate;
  return (
    <FinancialDateRoot
      kind={kind}
      {...(value !== undefined ? { value } : { defaultValue })}
      locale={profile.locale}
      label={label}
      onValueChange={onValueChange}
      disabled={disabled}
      readOnly={readOnly}
      className={className}
      aria-label={label}
      {...props}
    >
      {(state: { isValid: boolean; value: string }) => (
        <Field invalid={!state.isValid}>
          <FieldLabel>{label}</FieldLabel>
          <FinancialDateControl id={id} required={required} />
          {/* ISO YYYY-MM-DD. */}
          <FormValue name={name} value={state.value} disabled={disabled} />
          {!state.isValid ? <FieldError>Invalid date</FieldError> : null}
        </Field>
      )}
    </FinancialDateRoot>
  );
}

export { FinancialDateField, FinancialDateRoot, FinancialDateControl, financialDate };
