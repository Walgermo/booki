import { formatMoney, money, type Money } from "@booki/core/money";
import { useBookiLocaleOptional } from "./locale.js";
import type { HTMLAttributes } from "react";

export type MoneyAmountProps = {
  value: Money | number;
  currency?: string;
  withCurrency?: boolean;
  accounting?: boolean;
  size?: "md" | "lg";
  className?: string;
} & Omit<HTMLAttributes<HTMLSpanElement>, "children">;

function MoneyAmount({
  value,
  currency,
  withCurrency = true,
  accounting = false,
  size = "md",
  className,
  ...props
}: MoneyAmountProps) {
  const { profile } = useBookiLocaleOptional();
  const m = typeof value === "number" ? money(value, currency ?? profile.currency) : value;

  return (
    <span data-slot="money-amount" data-size={size} className={className} {...props}>
      {formatMoney(m, {
        locale: profile.locale,
        withCurrency,
        accounting,
      })}
    </span>
  );
}

export { MoneyAmount };
