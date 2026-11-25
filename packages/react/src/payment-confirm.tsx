import { formatMoney, fromMajor, type Money } from "@booki-aui/core/money";
import { Button } from "@ui-sdk/react/button";
import { Input } from "@ui-sdk/react/input";
import { useState } from "react";
import { MoneyAmount } from "./money-amount.js";
import { useBookiLocaleOptional } from "./locale.js";
import { personOnly } from "@booki-aui/primitives/person-only";

export type PaymentConfirmProps = {
  payee: string;
  /** Major units or Money */
  amount: number | Money;
  bankAccount?: string;
  paymentReference?: string;
  message?: string;
  feeMajor?: number;
  confirmWord?: string;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void;
  className?: string;
};

function PaymentConfirm({
  payee,
  amount,
  bankAccount,
  paymentReference,
  message,
  feeMajor = 0,
  confirmWord = "APPROVE",
  onConfirm,
  onCancel,
  className,
}: PaymentConfirmProps) {
  const { profile } = useBookiLocaleOptional();
  const [typed, setTyped] = useState("");
  const m = typeof amount === "number" ? fromMajor(amount, profile.currency) : amount;
  const canConfirm = typed.trim().toUpperCase() === confirmWord.toUpperCase();

  return (
    <section data-slot="payment-confirm" className={className}>
      <div>
        <p data-slot="payment-confirm-label">{profile.copy.amount}</p>
        <MoneyAmount value={m} size="lg" />
      </div>
      <dl data-slot="payment-confirm-details">
        <div>
          <dt>{profile.copy.payee}</dt>
          <dd>{payee}</dd>
        </div>
        {bankAccount ? (
          <div>
            <dt>{profile.copy.bankAccount}</dt>
            <dd>{bankAccount}</dd>
          </div>
        ) : null}
        {paymentReference ? (
          <div>
            <dt>{profile.copy.paymentReference}</dt>
            <dd>{paymentReference}</dd>
          </div>
        ) : null}
        {message ? (
          <div>
            <dt>{profile.copy.memo}</dt>
            <dd>{message}</dd>
          </div>
        ) : null}
        <div>
          <dt>{profile.copy.fee}</dt>
          <dd>
            {formatMoney(fromMajor(feeMajor, profile.currency), {
              locale: profile.locale,
            })}
          </dd>
        </div>
      </dl>

      {/* The typed word is the person's confirmation: an agent may not type it either. */}
      <label data-slot="payment-confirm-type" data-agent-confirm={personOnly("Confirm this payment with a person")}>
        <span>{profile.copy.typeToConfirm.replace("APPROVE", confirmWord)}</span>
        <Input
          value={typed}
          autoComplete="off"
          onValueChange={(v: string) => setTyped(v)}
          aria-label={profile.copy.typeToConfirm}
        />
      </label>

      <div data-slot="payment-confirm-actions">
        {onCancel ? (
          <Button data-variant="secondary" type="button" onClick={onCancel}>
            {profile.copy.cancel}
          </Button>
        ) : null}
        {onConfirm ? (
          <Button
            type="button"
            disabled={!canConfirm}
            data-agent-confirm={personOnly("Confirm this payment with a person")}
            onClick={() => onConfirm()}
          >
            {profile.copy.confirmPayment}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

export { PaymentConfirm };
