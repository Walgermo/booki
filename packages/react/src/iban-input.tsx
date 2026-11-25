import { isValidIban } from "@booki-aui/core/iban";
import { Field, FieldDescription, FieldError, FieldLabel } from "@ui-sdk/react/field";
import { createParts, type Parts } from "@ui-sdk/react/primitive";
import type { ComponentProps } from "react";
import { FormValue, type BookiFormProps, splitFieldAria } from "./form-props.js";
import { ibanInput } from "@booki-aui/primitives/iban-input";

const TAGS = {
  root: "div",
  input: "input",
} as const;
// Typed by name, so the declarations refer to the definition instead of spelling it out per part.
const parts: Parts<typeof ibanInput, typeof TAGS> = createParts(ibanInput, TAGS);

const IbanRoot: (typeof parts)["Root"] = parts.Root;
const IbanField: (typeof parts)["Input"] = parts.Input;

export type IbanInputProps = {
  /** Controlled value. Omit it (and use `defaultValue`) to let the field hold its own state. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  label?: string;
  description?: string;
  required?: boolean;
  className?: string;
} & Omit<BookiFormProps, "required"> &
  Omit<ComponentProps<"div">, "onChange" | "defaultValue" | "children" | "id">;

function IbanInput({
  value,
  defaultValue,
  onValueChange,
  label = "IBAN",
  description = "International bank account number",
  required,
  name,
  id,
  disabled,
  readOnly,
  className,
  ...props
}: IbanInputProps) {
  const { field, rest } = splitFieldAria(props);
  return (
    <IbanRoot
      {...(value !== undefined ? { value } : { defaultValue })}
      label={label}
      description={description}
      onValueChange={onValueChange}
      disabled={disabled}
      readOnly={readOnly}
      className={className}
      aria-label={label}
      {...rest}
    >
      {(state: { value: string }) => {
        const invalid = state.value.length > 0 && !isValidIban(state.value);
        return (
          <Field invalid={invalid}>
            <FieldLabel>{label}</FieldLabel>
            <FieldDescription>{description}</FieldDescription>
            <IbanField id={id} required={required} placeholder="NO93 8601 1117 947" {...field} />
            {/* The IBAN without spaces. */}
            <FormValue name={name} value={state.value} disabled={disabled} />
            {invalid ? <FieldError>Invalid IBAN</FieldError> : null}
          </Field>
        );
      }}
    </IbanRoot>
  );
}

export { IbanInput, IbanRoot, IbanField, ibanInput };
