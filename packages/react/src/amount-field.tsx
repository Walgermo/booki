import { createParts, type Parts } from "@ui-sdk/react/primitive";
import type { ComponentProps } from "react";
import { FormValue, type BookiFormProps } from "./form-props.js";
import { useBookiLocaleOptional } from "./locale.js";
import { amountField } from "@booki-aui/primitives/amount-field";

const TAGS = {
  root: "div",
  currency: "span",
  input: "input",
} as const;
// Typed by name, so the declarations refer to the definition instead of spelling it out per part.
const parts: Parts<typeof amountField, typeof TAGS> = createParts(amountField, TAGS);

const AmountFieldRoot: (typeof parts)["Root"] = parts.Root;
const AmountFieldCurrency: (typeof parts)["Currency"] = parts.Currency;
const AmountFieldInput: (typeof parts)["Input"] = parts.Input;

export type AmountFieldProps = {
  /** Minor units. `null` shows the field empty, with `allowEmpty`. */
  value?: number | null;
  defaultValue?: number | null;
  /** The field may be empty, which is not 0: `clear` and deleting the text empty it. */
  allowEmpty?: boolean;
  /** Called when the field becomes empty. */
  onEmpty?: (details: { reason: string; source?: string }) => void;
  currency?: string;
  /** Lowest accepted amount in minor units. Defaults to 0 (no negatives). */
  minMinor?: number;
  maxMinor?: number;
  secret?: boolean;
  onValueChange?: (minor: number, details?: { reason: string; source?: string }) => void;
  className?: string;
  "aria-label"?: string;
} & BookiFormProps &
  Omit<ComponentProps<"div">, "onChange" | "defaultValue" | "children" | "id">;

/**
 * Composed amount field with BookiLocale defaults. Prefer this in apps;
 * use Root/Currency/Input parts when you need custom markup.
 */
function AmountField({
  value,
  defaultValue,
  allowEmpty = false,
  onEmpty,
  currency: currencyProp,
  minMinor,
  maxMinor,
  secret = false,
  onValueChange,
  name,
  id,
  disabled,
  readOnly,
  required,
  className,
  "aria-label": ariaLabel,
  ...props
}: AmountFieldProps) {
  const { profile } = useBookiLocaleOptional();
  const currency = currencyProp ?? profile.currency;
  // The name goes on the input too: a screen reader reads the text box, not the wrapper.
  const label = ariaLabel ?? `${profile.copy.amount} (${currency})`;

  return (
    <AmountFieldRoot
      {...(value !== undefined ? { value } : { defaultValue: defaultValue ?? (allowEmpty ? null : 0) })}
      allowEmpty={allowEmpty}
      onEmpty={onEmpty}
      currency={currency}
      locale={profile.locale}
      minMinor={minMinor}
      maxMinor={maxMinor}
      secret={secret}
      disabled={disabled}
      readOnly={readOnly}
      onValueChange={onValueChange}
      className={className}
      aria-label={label}
      {...props}
    >
      {(state: { value: number | null; empty: boolean }) => (
        <>
          <AmountFieldCurrency>{currency}</AmountFieldCurrency>
          <AmountFieldInput id={id} required={required} aria-label={label} />
          {/* Integer minor units, the same number the agent reads. */}
          <FormValue name={name} value={state.value ?? ""} disabled={disabled} />
        </>
      )}
    </AmountFieldRoot>
  );
}

export { AmountField, AmountFieldCurrency, AmountFieldInput, AmountFieldRoot, amountField };
