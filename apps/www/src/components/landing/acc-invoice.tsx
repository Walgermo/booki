import type { VoucherLine } from "@booki-aui/core/voucher";
import { AmountField, TaxCodeSelect, VoucherComposer } from "@booki-aui/react";
import { Button } from "@ui-sdk/react/button";
import { useState } from "react";

import { useLang } from "@/lib/lang";

/** The same invoice as Booki controls on the agent bridge. */
export function BookiInvoice() {
  const { t } = useLang();
  const [minor, setMinor] = useState(249_000);
  const [code, setCode] = useState("TAX0");
  const [lines, setLines] = useState<VoucherLine[]>([]);
  const [paid, setPaid] = useState(false);

  return (
    <div className="acc-invoice">
      <label>
        {t("Amount excl. tax", "Beløp eks. avgift")}
        <AmountField value={minor} onValueChange={setMinor} aria-label={t("Amount excl. tax", "Beløp eks. avgift")} />
      </label>
      <label>
        {t("Sales tax", "Omsetningsavgift")}
        <TaxCodeSelect value={code} onValueChange={setCode} />
      </label>
      <VoucherComposer lines={lines} onLinesChange={setLines} aria-label={t("Voucher", "Bilag")} />
      <Button
        type="button"
        disabled={paid}
        data-agent-confirm="Pays the invoice from the company account"
        onClick={() => setPaid(true)}
      >
        {t("Pay invoice", "Betal faktura")}
      </Button>
      <output>{paid ? t("Payment sent.", "Betaling sendt.") : ""}</output>
    </div>
  );
}
