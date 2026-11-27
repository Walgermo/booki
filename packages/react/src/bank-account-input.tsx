import { isValidKontonummer } from "@booki-aui/core/kontonummer";
import { isValidRoutingNumber, isValidUsAccountNumber } from "@booki-aui/core/routing-number";
import { Field, FieldDescription, FieldError, FieldLabel } from "@ui-sdk/react/field";
import { createParts, type Parts } from "@ui-sdk/react/primitive";
import type { ComponentProps } from "react";
import { FormValue, type BookiFormProps, splitFieldAria } from "./form-props.js";
import { IbanInput } from "./iban-input.js";
import { useBookiLocaleOptional } from "./locale.js";
import { type BankAccountValue, bankAccount } from "@booki-aui/primitives/bank-account-input";

const TAGS = {
  root: "div",
  kontonummer: "input",
  routing: "input",
  account: "input",
} as const;
// Typed by name, so the declarations refer to the definition instead of spelling it out per part.
const parts: Parts<typeof bankAccount, typeof TAGS> = createParts(bankAccount, TAGS);

const BankAccountRoot: (typeof parts)["Root"] = parts.Root;
const BankAccountKontonummer: (typeof parts)["Kontonummer"] = parts.Kontonummer;
const BankAccountRouting: (typeof parts)["Routing"] = parts.Routing;
const BankAccountAccount: (typeof parts)["Account"] = parts.Account;

export type BankAccountInputProps = {
  /** For profiles whose bank account is an IBAN. */
  iban?: string;
  kontonummer?: string;
  routingNumber?: string;
  accountNumber?: string;
  onValueChange?: (value: BankAccountValue) => void;
  required?: boolean;
  className?: string;
} & Omit<BookiFormProps, "required"> &
  Omit<ComponentProps<"div">, "onChange" | "defaultValue" | "children" | "id">;

type BankDigits = {
  digits: string;
  routingNumber: string;
  accountNumber: string;
};

/**
 * Form fields: `name` submits the 11 kontonummer digits in Norway. In the US
 * it submits `${name}.routingNumber` and `${name}.accountNumber`; `id` goes to
 * the routing input and `${id}-account` to the account input.
 */
function BankAccountInput({
  iban,
  kontonummer,
  routingNumber,
  accountNumber,
  onValueChange,
  required,
  name,
  id,
  disabled,
  readOnly,
  className,
  ...props
}: BankAccountInputProps) {
  const { field, rest } = splitFieldAria(props);
  const { profile } = useBookiLocaleOptional();
  const kind = profile.bankAccount.kind;

  if (kind === "iban") {
    return (
      <IbanInput
        {...(iban !== undefined ? { value: iban } : {})}
        onValueChange={(value) => onValueChange?.({ kind: "iban", iban: value })}
        label={profile.bankAccount.label}
        description={profile.bankAccount.description}
        required={required}
        name={name}
        id={id}
        disabled={disabled}
        readOnly={readOnly}
        className={className}
        {...props}
      />
    );
  }

  if (kind === "routing-account") {
    return (
      <BankAccountRoot
        kind="routing-account"
        routingNumber={routingNumber}
        accountNumber={accountNumber}
        label={profile.bankAccount.label}
        description={profile.bankAccount.description}
        onValueChange={onValueChange}
        disabled={disabled}
        readOnly={readOnly}
        className={className}
        aria-label={profile.bankAccount.label}
        {...rest}
      >
        {(state: BankDigits) => {
          const routingInvalid = state.routingNumber.length > 0 && !isValidRoutingNumber(state.routingNumber);
          const accountInvalid = state.accountNumber.length > 0 && !isValidUsAccountNumber(state.accountNumber);
          return (
            <>
              <Field invalid={routingInvalid}>
                <FieldLabel>Routing number</FieldLabel>
                <FieldDescription>9-digit ABA routing number</FieldDescription>
                <BankAccountRouting id={id} required={required} placeholder="021000021" {...field} />
                {routingInvalid ? <FieldError>Invalid routing number</FieldError> : null}
              </Field>
              <Field invalid={accountInvalid}>
                <FieldLabel>Account number</FieldLabel>
                <FieldDescription>4–17 digits</FieldDescription>
                <BankAccountAccount
                  id={id ? `${id}-account` : undefined}
                  required={required}
                  placeholder="123456789"
                  aria-invalid={accountInvalid || undefined}
                />
                {accountInvalid ? <FieldError>Invalid account number</FieldError> : null}
              </Field>
              <FormValue
                name={name ? `${name}.routingNumber` : undefined}
                value={state.routingNumber}
                disabled={disabled}
              />
              <FormValue
                name={name ? `${name}.accountNumber` : undefined}
                value={state.accountNumber}
                disabled={disabled}
              />
            </>
          );
        }}
      </BankAccountRoot>
    );
  }

  return (
    <BankAccountRoot
      kind="kontonummer"
      kontonummer={kontonummer}
      label={profile.bankAccount.label}
      description={profile.bankAccount.description}
      onValueChange={onValueChange}
      disabled={disabled}
      readOnly={readOnly}
      className={className}
      aria-label={profile.bankAccount.label}
      {...rest}
    >
      {(state: BankDigits) => {
        const invalid = state.digits.length > 0 && !isValidKontonummer(state.digits);
        return (
          <Field invalid={invalid}>
            <FieldLabel>{profile.bankAccount.label}</FieldLabel>
            <FieldDescription>{profile.bankAccount.description}</FieldDescription>
            <BankAccountKontonummer id={id} required={required} placeholder="1234 56 78903" {...field} />
            {invalid ? <FieldError>Ugyldig kontonummer (mod11)</FieldError> : null}
            <FormValue name={name} value={state.digits} disabled={disabled} />
          </Field>
        );
      }}
    </BankAccountRoot>
  );
}

export {
  BankAccountInput,
  BankAccountRoot,
  BankAccountKontonummer,
  BankAccountRouting,
  BankAccountAccount,
  bankAccount,
};

export { type BankAccountValue } from "@booki-aui/primitives/bank-account-input";
