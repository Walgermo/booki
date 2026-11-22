import { money, type Money } from "@booki/core/money";
import { AmountField, type AmountFieldProps } from "./amount-field.js";

export type AmountInputProps = Omit<AmountFieldProps, "onValueChange"> & {
  /** @deprecated Prefer AmountField + onValueChange(minor). Kept for apps that need Money. */
  onValueChange?: (minor: number | null, money: Money | null) => void;
};

/**
 * Compatibility wrapper around AmountField (definePrimitive).
 * New code should import AmountField for agent `setMinor` / snapshot `value`.
 */
function AmountInput({ onValueChange, currency, ...props }: AmountInputProps) {
  return (
    <AmountField
      currency={currency}
      {...props}
      onValueChange={(minor) => {
        if (!onValueChange) return;
        const code = currency ?? "NOK";
        onValueChange(minor, money(minor, code));
      }}
    />
  );
}

export { AmountInput };
