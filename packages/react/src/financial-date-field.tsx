import { type FinancialDateKind } from "@booki-aui/core/financial-date";
import { Field, FieldError, FieldLabel } from "@ui-sdk/react/field";
import { createParts, type Parts } from "@ui-sdk/react/primitive";
import type { ComponentProps } from "react";
import { FormValue, type BookiFormProps } from "./form-props.js";
import { useBookiLocaleOptional } from "./locale.js";
import { financialDate } from "@booki-aui/primitives/financial-date-field";

const TAGS = {
  root: "div",
  input: "input",
} as const;
// Typed by name, so the declarations refer to the definition instead of spelling it out per part.
const parts: Parts<typeof financialDate, typeof TAGS> = createParts(financialDate, TAGS);

const FinancialDateRoot: (typeof parts)["Root"] = parts.Root;
const FinancialDateControl: (typeof parts)["Input"] = parts.Input;

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
