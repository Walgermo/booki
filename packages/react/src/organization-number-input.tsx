import { isValidOrganizationNumber, type OrganizationNumberKind } from "@booki/core/organization-number";
import { Field, FieldDescription, FieldError, FieldLabel } from "@ui-sdk/react/field";
import { createParts } from "@ui-sdk/react/primitive";
import type { ComponentProps } from "react";
import { FormValue, type BookiFormProps } from "./form-props.js";
import { useBookiLocaleOptional } from "./locale.js";
import { organizationNumber } from "@booki/primitives/organization-number-input";

const parts = createParts(organizationNumber, {
  root: "div",
  input: "input",
});

const OrganizationNumberRoot = parts.Root;
const OrganizationNumberField = parts.Input;

export type OrganizationNumberInputProps = {
  /** Controlled value. Omit it (and use `defaultValue`) to let the field hold its own state. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  required?: boolean;
  className?: string;
} & Omit<BookiFormProps, "required"> &
  Omit<ComponentProps<"div">, "onChange" | "defaultValue" | "children" | "id">;

function OrganizationNumberInput({
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
}: OrganizationNumberInputProps) {
  const { profile } = useBookiLocaleOptional();
  const kind = profile.organizationNumber.kind;

  return (
    <OrganizationNumberRoot
      kind={kind}
      {...(value !== undefined ? { value } : { defaultValue })}
      label={profile.organizationNumber.label}
      description={profile.organizationNumber.description}
      onValueChange={onValueChange}
      disabled={disabled}
      readOnly={readOnly}
      className={className}
      aria-label={profile.organizationNumber.label}
      {...props}
    >
      {(state: { kind: OrganizationNumberKind; digits: string }) => {
        const invalid = state.digits.length > 0 && !isValidOrganizationNumber(state.digits, state.kind);
        return (
          <Field invalid={invalid}>
            <FieldLabel>{profile.organizationNumber.label}</FieldLabel>
            <FieldDescription>{profile.organizationNumber.description}</FieldDescription>
            {/* Digits only, without the display grouping. */}
            <FormValue name={name} value={state.digits} disabled={disabled} />
            <OrganizationNumberField
              id={id}
              required={required}
              placeholder={profile.organizationNumber.placeholder ?? (kind === "ein" ? "12-3456789" : "974 760 673")}
            />
            {invalid ? (
              <FieldError>
                {profile.organizationNumber.invalid ?? (kind === "ein" ? "Invalid EIN" : "Ugyldig organisasjonsnummer")}
              </FieldError>
            ) : null}
          </Field>
        );
      }}
    </OrganizationNumberRoot>
  );
}

export { OrganizationNumberInput, OrganizationNumberRoot, OrganizationNumberField, organizationNumber };
