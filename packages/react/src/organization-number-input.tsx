import { isValidOrganizationNumber, type OrganizationNumberKind } from "@booki-aui/core/organization-number";
import { Field, FieldDescription, FieldError, FieldLabel } from "@ui-sdk/react/field";
import { createParts, type Parts } from "@ui-sdk/react/primitive";
import type { ComponentProps } from "react";
import { FormValue, type BookiFormProps, splitFieldAria } from "./form-props.js";
import { useBookiLocaleOptional } from "./locale.js";
import { organizationNumber } from "@booki-aui/primitives/organization-number-input";

const TAGS = {
  root: "div",
  input: "input",
} as const;
// Typed by name, so the declarations refer to the definition instead of spelling it out per part.
const parts: Parts<typeof organizationNumber, typeof TAGS> = createParts(organizationNumber, TAGS);

const OrganizationNumberRoot: (typeof parts)["Root"] = parts.Root;
const OrganizationNumberField: (typeof parts)["Input"] = parts.Input;

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
  const { field, rest } = splitFieldAria(props);
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
      {...rest}
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
              {...field}
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
