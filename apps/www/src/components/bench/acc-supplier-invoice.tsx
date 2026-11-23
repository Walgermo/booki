import { isValidKid } from "@booki/core/kid";
import type { AccountOption, VoucherLine } from "@booki/core/voucher";
import {
  AccountPicker,
  AmountField,
  FinancialDateField,
  InvoiceNumberInput,
  PaymentReferenceInput,
  TaxCodeSelect,
  VoucherLines,
  useBookiLocale,
} from "@booki/react";
import { Button } from "@ui-sdk/react/button";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useEndState } from "./end-state";

import { setStepPolicy } from "@/agent";

/**
 * The supplier-invoice screen on Booki. The agent fills the fields; the page
 * works out the posting (cost net, input VAT, accounts payable) from the gross
 * amount and the VAT code and shows it read only. The agent posts on its own
 * when the invoice meets the company's rule; anything else goes to a person.
 * Same suppliers and accounts as the replica, in the same order, so the
 * pickers start on the same first entry.
 */

const SUPPLIERS: AccountOption[] = [
  { number: "20002", name: "Nordlys Eiendom AS" },
  { number: "20003", name: "Fjordkraft Strøm AS" },
  { number: "20001", name: "Kontorrekvisita AS" },
  { number: "20004", name: "Kontorservice Vest AS" },
  { number: "20005", name: "Datahjelp Norge AS" },
];

const COST_ACCOUNTS: AccountOption[] = [
  { number: "4000", name: "Innkjøp av råvarer og halvfabrikata" },
  { number: "6300", name: "Leie lokale" },
  { number: "6340", name: "Lys, varme" },
  { number: "6540", name: "Inventar" },
  { number: "6800", name: "Kontorrekvisita" },
  { number: "6810", name: "Datakostnader" },
  { number: "6860", name: "Møte, kurs, oppdatering" },
  { number: "7140", name: "Reisekostnad, ikke opplysningspliktig" },
  { number: "7770", name: "Bank- og kortgebyrer" },
];

const AUTO_POST_LIMIT_MINOR = 5_000_000;

export type BookiSupplierInvoiceState = {
  supplier: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  kid: string;
  grossMinor: number;
  account: string;
  taxCode: string;
  lines: VoucherLine[];
  posted: boolean;
  postedBy: string;
  checked: string[];
};

export function BookiSupplierInvoice() {
  const { profile } = useBookiLocale();
  const [supplier, setSupplier] = useState(SUPPLIERS[0]!.number);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [kid, setKid] = useState("");
  const [grossMinor, setGrossMinor] = useState(0);
  const [account, setAccount] = useState(COST_ACCOUNTS[0]!.number);
  // The replica's VAT picker starts on "no VAT"; so does this one.
  const [taxCode, setTaxCode] = useState("MVA0");
  const [posted, setPosted] = useState(false);
  const [postedBy, setPostedBy] = useState("");
  const grantedBy = useRef<string | null>(null);

  const percent = profile.tax.codes.find((code) => code.code === taxCode)?.percent ?? 0;
  const vatMinor = Math.round((grossMinor * percent) / (100 + percent));
  const netMinor = grossMinor - vatMinor;
  const accountName = COST_ACCOUNTS.find((a) => a.number === account)?.name ?? "";
  const lines: VoucherLine[] = grossMinor
    ? [
        { id: "cost", account, accountName, debitMinor: netMinor, creditMinor: 0, vatCode: taxCode },
        ...(vatMinor
          ? [
              {
                id: "vat",
                account: "2710",
                accountName: "Inngående merverdiavgift, høy sats",
                debitMinor: vatMinor,
                creditMinor: 0,
              },
            ]
          : []),
        { id: "payable", account: "2400", accountName: "Leverandørgjeld", debitMinor: 0, creditMinor: grossMinor },
      ]
    : [];

  const checks = [
    { label: "Fakturanummer og fakturadato er fylt ut", ok: invoiceNumber.trim() !== "" && invoiceDate !== "" },
    { label: "Forfall er på eller etter fakturadato", ok: dueDate !== "" && dueDate >= invoiceDate },
    { label: "KID har gyldig kontrollsiffer", ok: isValidKid(kid, 10) },
    { label: "Under 50 000 kr", ok: grossMinor > 0 && grossMinor <= AUTO_POST_LIMIT_MINOR },
  ];
  const latest = useRef(checks);
  useLayoutEffect(() => {
    latest.current = checks;
  });

  useEffect(
    () =>
      setStepPolicy(() => {
        const ok = latest.current.every((check) => check.ok);
        grantedBy.current = ok ? "agent under regelen for autobokføring" : null;
        // Outside the rule: no opinion, so the step goes to a person.
        return ok ? true : undefined;
      }),
    [],
  );

  // For the benchmark's end-state checks only.
  useEndState<BookiSupplierInvoiceState>("__accSupplierInvoice", {
    supplier,
    invoiceNumber,
    invoiceDate,
    dueDate,
    kid,
    grossMinor,
    account,
    taxCode,
    lines,
    posted,
    postedBy,
    checked: checks.filter((check) => check.ok).map((check) => check.label),
  });

  return (
    <div className="acc-invoice">
      <h1 className="mt-0 text-xl font-semibold">Registrer leverandørfaktura</h1>
      <AccountPicker accounts={SUPPLIERS} value={supplier} onValueChange={setSupplier} aria-label="Leverandør" />
      <InvoiceNumberInput value={invoiceNumber} onValueChange={setInvoiceNumber} />
      <FinancialDateField kind="invoice" value={invoiceDate} onValueChange={setInvoiceDate} />
      <FinancialDateField kind="due" value={dueDate} onValueChange={setDueDate} />
      <PaymentReferenceInput value={kid} onValueChange={setKid} />
      <AmountField
        value={grossMinor}
        onValueChange={(minor) => setGrossMinor(minor)}
        aria-label="Totalt beløp inkl. mva"
      />
      <AccountPicker accounts={COST_ACCOUNTS} value={account} onValueChange={setAccount} aria-label="Kostnadskonto" />
      <TaxCodeSelect value={taxCode} onValueChange={(code) => setTaxCode(code)} />
      <VoucherLines lines={lines} />
      <section aria-label="Regel for autobokføring" className="grid gap-1 text-sm">
        <p className="m-0 font-medium">Agenten bokfører selv når fakturaen:</p>
        <ul className="m-0 grid list-none gap-1 p-0">
          {checks.map((check) => (
            <li key={check.label} data-ok={check.ok ? "" : undefined}>
              {check.ok ? "✓" : "·"} {check.label}
            </li>
          ))}
        </ul>
        <p className="m-0 text-muted-foreground">Ellers går den til en person.</p>
      </section>
      <Button
        type="button"
        disabled={posted}
        data-agent-confirm="Bokfører leverandørfakturaen i regnskapet"
        onClick={() => {
          setPostedBy(grantedBy.current ?? "person");
          grantedBy.current = null;
          setPosted(true);
        }}
      >
        Opprett og bokfør
      </Button>
      <output>{posted ? `Fakturaen er bokført av ${postedBy}.` : ""}</output>
    </div>
  );
}
