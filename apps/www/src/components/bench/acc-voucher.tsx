import { voucherIssues, type AccountOption, type VoucherLine } from "@booki-aui/core/voucher";
import { FinancialDateField, VoucherComposer, useBookiLocale } from "@booki-aui/react";
import { Button } from "@ui-sdk/react/button";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useEndState } from "./end-state";

import { setStepPolicy } from "@/agent";

/** The same chart as the raw screens offer, as a closed list. */
const CHART: AccountOption[] = [
  { number: "1500", name: "Kundefordringer" },
  { number: "1920", name: "Bankinnskudd" },
  { number: "2400", name: "Leverandørgjeld" },
  { number: "2700", name: "Utgående merverdiavgift, høy sats" },
  { number: "2710", name: "Inngående merverdiavgift, høy sats" },
  { number: "2711", name: "Inngående merverdiavgift, middels sats" },
  { number: "3000", name: "Salgsinntekt, avgiftspliktig" },
  { number: "6300", name: "Leie lokale" },
  { number: "6800", name: "Kontorrekvisita", vatCodes: ["MVA25", "MVA15", "MVA0"], defaultVatCode: "MVA25" },
  { number: "6810", name: "Datakostnader" },
  { number: "7770", name: "Bank- og kortgebyrer" },
];

/** The company's rule for posting without a person. Above it, a person posts. */
const AUTO_POST_LIMIT_MINOR = 5_000_000;

export type BookiVoucherState = {
  date: string;
  lines: VoucherLine[];
  posted: boolean;
  postedBy: string;
  checked: string[];
};

/**
 * The voucher screen on Booki. The agent posts on its own when the voucher
 * meets the company's rule: it balances, every line passes the account
 * rules, it is dated, and the total is under the limit. Anything else goes
 * to a person. Every posting records who did it and which rule allowed it.
 */
export function BookiVoucher() {
  const { profile } = useBookiLocale();
  const [date, setDate] = useState("");
  const [lines, setLines] = useState<VoucherLine[]>([]);
  const [posted, setPosted] = useState(false);
  const [postedBy, setPostedBy] = useState("");
  const latest = useRef({ date, lines });
  useLayoutEffect(() => {
    latest.current = { date, lines };
  });
  const grantedBy = useRef<string | null>(null);

  const total = lines.reduce((sum, line) => sum + line.debitMinor, 0);
  const issues = voucherIssues(lines, { accounts: CHART, vatCodes: profile.tax.codes.map((code) => code.code) });
  const checks = [
    { label: "Balanserer, og hver linje følger kontoreglene", ok: lines.length > 0 && issues.length === 0 },
    { label: "Har bilagsdato", ok: date !== "" },
    { label: "Under 50 000 kr", ok: total > 0 && total <= AUTO_POST_LIMIT_MINOR },
  ];

  useEffect(
    () =>
      setStepPolicy(() => {
        const { date: d, lines: l } = latest.current;
        const sum = l.reduce((n, line) => n + line.debitMinor, 0);
        const ok =
          l.length > 0 &&
          voucherIssues(l, { accounts: CHART, vatCodes: profile.tax.codes.map((code) => code.code) }).length === 0 &&
          d !== "" &&
          sum <= AUTO_POST_LIMIT_MINOR;
        grantedBy.current = ok ? "agent under regelen for autobokføring" : null;
        // Outside the rule: no opinion, so the step goes to a person.
        return ok ? true : undefined;
      }),
    [profile],
  );

  // For the benchmark's end-state checks only.
  useEndState<BookiVoucherState>("__accVoucher", {
    date,
    lines,
    posted,
    postedBy,
    checked: checks.filter((check) => check.ok).map((check) => check.label),
  });

  return (
    <div className="acc-invoice">
      <h1 className="mt-0 text-xl font-semibold">Registrer bilag</h1>
      <FinancialDateField kind="posting" value={date} onValueChange={setDate} aria-label="Bilagsdato" />
      <VoucherComposer accounts={CHART} lines={lines} onLinesChange={setLines} aria-label="Bilag" />
      <section aria-label="Regel for autobokføring" className="grid gap-1 text-sm">
        <p className="m-0 font-medium">Agenten bokfører selv når bilaget:</p>
        <ul className="m-0 grid list-none gap-1 p-0">
          {checks.map((check) => (
            <li key={check.label} data-ok={check.ok ? "" : undefined}>
              {check.ok ? "✓" : "·"} {check.label}
            </li>
          ))}
        </ul>
        <p className="m-0 text-muted-foreground">Ellers går det til en person.</p>
      </section>
      <Button
        type="button"
        disabled={posted}
        data-agent-confirm="Bokfører bilaget i regnskapet"
        onClick={() => {
          setPostedBy(grantedBy.current ?? "person");
          grantedBy.current = null;
          setPosted(true);
        }}
      >
        Opprett og bokfør
      </Button>
      <output>{posted ? `Bilaget er bokført av ${postedBy}.` : ""}</output>
    </div>
  );
}
