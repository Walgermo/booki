import { isValidKid } from "@booki/core/kid";
import { Field, FieldDescription, FieldError, FieldLabel } from "@ui-sdk/react/field";
import { createParts } from "@ui-sdk/react/primitive";
import type { ComponentProps } from "react";
import { FormValue, type BookiFormProps } from "./form-props.js";
import { useBookiLocaleOptional } from "./locale.js";
import { type RefKind, paymentReference } from "@booki/primitives/payment-reference-input";

const parts = createParts(paymentReference, {
  root: "div",
  input: "input",
});

const PaymentReferenceRoot = parts.Root;
const PaymentReferenceField = parts.Input;

export type PaymentReferenceInputProps = {
  /** Controlled value. Omit it (and use `defaultValue`) to let the field hold its own state. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
  className?: string;
} & Omit<BookiFormProps, "required"> &
  Omit<ComponentProps<"div">, "onChange" | "defaultValue" | "children" | "id">;

function kidInvalid(kind: RefKind, value: string): boolean {
  return kind === "kid" && value.length >= 4 && !isValidKid(value, 10);
}

function PaymentReferenceInput({
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
}: PaymentReferenceInputProps) {
  const { profile } = useBookiLocaleOptional();
  const kind = profile.paymentReference.kind;

  return (
    <PaymentReferenceRoot
      kind={kind}
      {...(value !== undefined ? { value } : { defaultValue })}
      label={profile.paymentReference.label}
      description={profile.paymentReference.description}
      onValueChange={onValueChange}
      disabled={disabled}
      readOnly={readOnly}
      className={className}
      aria-label={profile.paymentReference.label}
      {...props}
    >
      {(state: { kind: RefKind; value: string }) => {
        // Invalid display follows the primitive's state, so it works
        // uncontrolled and for agent writes, not only for the prop.
        const invalid = kidInvalid(state.kind, state.value);
        return (
          <Field invalid={invalid}>
            <FieldLabel>{profile.paymentReference.label}</FieldLabel>
            <FieldDescription>
              {profile.paymentReference.description}
              {kind === "kid" ? " (mod 10)" : ""}
            </FieldDescription>
            <PaymentReferenceField
              id={id}
              required={required}
              placeholder={kind === "kid" ? "12345678903" : "INV-1001"}
            />
            {invalid ? <FieldError>Ugyldig KID</FieldError> : null}
            <FormValue name={name} value={state.value} disabled={disabled} />
          </Field>
        );
      }}
    </PaymentReferenceRoot>
  );
}

export { PaymentReferenceInput, PaymentReferenceRoot, PaymentReferenceField, paymentReference };
