import { createParts, type Parts } from "@ui-sdk/react/primitive";
import type { ComponentProps } from "react";
import { FormValue, type BookiFormProps, splitFieldAria } from "./form-props.js";
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

type AmountFieldBase = {
  /** Minor units. `null` shows the field empty, with `allowEmpty`. */
  value?: number | null;
  defaultValue?: number | null;
  /** Called when the field becomes empty, after `onValueChange(null)`. */
  onEmpty?: (details: { reason: string; source?: string }) => void;
  currency?: string;
  /** Lowest accepted amount in minor units. Defaults to 0 (no negatives). */
  minMinor?: number;
  maxMinor?: number;
  secret?: boolean;
  className?: string;
  "aria-label"?: string;
};

/**
 * `allowEmpty` decides what `onValueChange` hears. Left out or `false`: integer minor units. `true`,
 * or a `boolean` variable that may be true: `number | null`, because the field may be emptied
 * (clear, or deleting its text), which is not 0. `onEmpty` is called after it.
 */
export type AmountFieldProps<Empty extends boolean = boolean> = AmountFieldBase & {
  allowEmpty?: Empty;
  onValueChange?: (
    minor: [Empty] extends [false] ? number : number | null,
    details?: { reason: string; source?: string },
  ) => void;
} & BookiFormProps &
  Omit<ComponentProps<"div">, "onChange" | "defaultValue" | "children" | "id">;

/**
 * Composed amount field with BookiLocale defaults. Prefer this in apps;
 * use Root/Currency/Input parts when you need custom markup.
 */
function AmountField<Empty extends boolean = false>({
  value,
  defaultValue,
  allowEmpty = false as Empty,
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
}: AmountFieldProps<Empty>) {
  const { field, rest } = splitFieldAria(props);
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
      onValueChange={onValueChange as AmountFieldProps<true>["onValueChange"]}
      className={className}
      aria-label={label}
      {...rest}
    >
      {(state: { value: number | null; draftRefused: boolean }) => (
        <>
          <AmountFieldCurrency>{currency}</AmountFieldCurrency>
          <AmountFieldInput id={id} required={required} aria-label={label} {...field} />
          {/* Integer minor units, the same number the agent reads. */}
          <FormValue name={name} value={state.value ?? ""} disabled={disabled || (!readOnly && state.draftRefused)} />
        </>
      )}
    </AmountFieldRoot>
  );
}

export { AmountField, AmountFieldCurrency, AmountFieldInput, AmountFieldRoot, amountField };
