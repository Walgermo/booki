import { useState, type FormEvent, type RefObject } from "react";

import { useLang } from "@/lib/lang";

const sum = (form: HTMLFormElement, column: string) =>
  [1, 2, 3].reduce((total, line) => {
    const cell = form.elements.namedItem(`${column}${line}`) as HTMLInputElement;
    return total + (Number.parseFloat(cell.value) || 0);
  }, 0);

/** The invoice as plain semantic HTML: labels, inputs, a select, a table. */
export function SemanticInvoice({ formRef }: { formRef: RefObject<HTMLFormElement | null> }) {
  const { t } = useLang();
  const [totals, setTotals] = useState({ debit: 0, credit: 0 });
  const [paid, setPaid] = useState(false);

  function onInput(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    setTotals({ debit: sum(form, "debit"), credit: sum(form, "credit") });
  }

  return (
    <form
      ref={formRef}
      aria-label={t("Invoice", "Faktura")}
      onInput={onInput}
      onSubmit={(event) => {
        event.preventDefault();
        setPaid(true);
      }}
    >
      <label>
        {t("Amount excl. tax", "Beløp eks. avgift")}
        <input name="amount" inputMode="decimal" defaultValue="2490.00" />
      </label>
      <label>
        {t("Sales tax", "Omsetningsavgift")}
        <select name="tax" defaultValue="TAX0">
          <option value="TAX0">{t("0% tax", "0 % avgift")}</option>
          <option value="TAX8875">{t("8.875% tax", "8,875 % avgift")}</option>
        </select>
      </label>
      <table>
        <thead>
          <tr>
            <th>{t("Account", "Konto")}</th>
            <th>{t("Debit", "Debet")}</th>
            <th>{t("Credit", "Kredit")}</th>
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3].map((line) => (
            <tr key={line}>
              <td>
                <input name={`account${line}`} aria-label={t(`Account, line ${line}`, `Konto, linje ${line}`)} />
              </td>
              <td>
                <input name={`debit${line}`} aria-label={t(`Debit, line ${line}`, `Debet, linje ${line}`)} />
              </td>
              <td>
                <input name={`credit${line}`} aria-label={t(`Credit, line ${line}`, `Kredit, linje ${line}`)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <output>
        {t("Debit", "Debet")} {totals.debit.toFixed(2)} · {t("Credit", "Kredit")} {totals.credit.toFixed(2)}
      </output>
      <button type="submit" disabled={paid}>
        {t("Pay invoice", "Betal faktura")}
      </button>
      <output>{paid ? t("Payment sent.", "Betaling sendt.") : ""}</output>
    </form>
  );
}
