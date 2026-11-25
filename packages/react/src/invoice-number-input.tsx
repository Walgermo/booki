import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field";
import { createParts } from "@ui-sdk/react/primitive";
import type { ComponentProps } from "react";
import { FormValue, type BookiFormProps } from "./form-props.js";
import { useBookiLocaleOptional } from "./locale.js";
import { invoiceNumber } from "@booki-aui/primitives/invoice-number-input";

const parts = createParts(invoiceNumber, {
  root: "div",
  input: "input",
});

const InvoiceNumberRoot = parts.Root;
const InvoiceNumberField = parts.Input;

export type InvoiceNumberInputProps = {
  /** Controlled value. Omit it (and use `defaultValue`) to let the field hold its own state. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
  className?: string;
} & Omit<BookiFormProps, "required"> &
  Omit<ComponentProps<"div">, "onChange" | "defaultValue" | "children" | "id">;

function InvoiceNumberInput({
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
}: InvoiceNumberInputProps) {
  const { profile } = useBookiLocaleOptional();

  return (
    <InvoiceNumberRoot
      {...(value !== undefined ? { value } : { defaultValue })}
      label={profile.copy.invoiceNumber}
      description={profile.copy.invoiceNumberHint}
      onValueChange={onValueChange}
      disabled={disabled}
      readOnly={readOnly}
      className={className}
      aria-label={profile.copy.invoiceNumber}
      {...props}
    >
      {(state: { value: string }) => (
        <Field>
          <FieldLabel>{profile.copy.invoiceNumber}</FieldLabel>
          <FieldDescription>{profile.copy.invoiceNumberHint}</FieldDescription>
          <InvoiceNumberField id={id} required={required} placeholder="INV-1001" />
          <FormValue name={name} value={state.value} disabled={disabled} />
        </Field>
      )}
    </InvoiceNumberRoot>
  );
}

export { InvoiceNumberInput, InvoiceNumberRoot, InvoiceNumberField, invoiceNumber };
