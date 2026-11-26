import { voucherIssues, type AccountOption, type VoucherLine } from "@booki-aui/core/voucher";
import { CurrencySelect, DataTable, FinancialDateField, VoucherComposer, useBookiLocale } from "@booki-aui/react";
import { Button } from "@ui-sdk/react/button";
import { useEffect, useRef, useState } from "react";
import { useEndState } from "./end-state";

import { setStepPolicy } from "@/agent";

import { FX_RATES_EUR_NOK, HARD_ACCOUNTS } from "./hard-data";

/**
 * The foreign-currency voucher on Booki. VoucherComposer books a line in
 * another currency with its own `setForeign` action: the base amount is
 * worked out from the foreign amount and the rate, and the line keeps
 * `foreign` (currency, amount, rate). The page only mirrors what the composer
 * holds; it does not convert anything. The currency select chooses the
 * currency of the voucher for the agent to read; it is not a line field.
 * The agent posts on its own when the voucher meets the company's rule: it
 * balances, it is dated, and it is at most 50 000 kr.
 */

const CHART: AccountOption[] = HARD_ACCOUNTS.map((account) => ({
  number: account.number,
  name: account.name,
}));
const AUTO_POST_LIMIT_MINOR = 5_000_000;
const BASE_CURRENCY = "NOK";
const CURRENCIES = [BASE_CURRENCY, "EUR", "USD"];

/** NOK per EUR as a person reads it: 11,7250. */
const rateText = (rateScaled: number) => (rateScaled / 1_000_000).toFixed(4).replace(".", ",");

/** An ISO date as the table shows it: 14.10.2026. */
const dateNb = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};

const RATE_COLUMNS = [
  { id: "date", header: "Dato", value: (row: (typeof FX_RATES_EUR_NOK)[number]) => dateNb(row.date) },
  {
    id: "rate",
    header: "Kurs (NOK per EUR)",
    value: (row: (typeof FX_RATES_EUR_NOK)[number]) => rateText(row.rateScaled),
  },
];

export type BookiForeignState = {
  voucher: {
    date: string;
    lines: {
      account: string;
      debitMinor: number;
      creditMinor: number;
      foreignMinor?: number;
      currency?: string;
    }[];
    rateScaled: number | null;
    posted: boolean;
    postedBy: string;
  };
  events: string[];
};

export function BookiForeign() {
  const { profile } = useBookiLocale();
  const [date, setDate] = useState("");
  const [voucherCurrency, setVoucherCurrency] = useState(BASE_CURRENCY);
  const [lines, setLines] = useState<VoucherLine[]>([]);
  const [posted, setPosted] = useState(false);
  const [postedBy, setPostedBy] = useState("");
  // What was posted, kept as it was at the click: an edit after posting changes the draft, not the posting.
  const [postedDraft, setPostedDraft] = useState<{ date: string; lines: VoucherLine[] } | null>(null);
  const voucherNow = postedDraft ?? { date, lines };
  const [events, setEvents] = useState<string[]>([]);
  const grantedBy = useRef<string | null>(null);
  const latest = useRef({ date, lines });
  latest.current = { date, lines };

  const vatCodes = profile.tax.codes.map((code) => code.code);
  const ruleHolds = (d: string, l: VoucherLine[]) => {
    const total = l.reduce((sum, line) => sum + line.debitMinor, 0);
    return (
      l.length > 0 &&
      voucherIssues(l, { accounts: CHART, vatCodes }).length === 0 &&
      d !== "" &&
      total > 0 &&
      total <= AUTO_POST_LIMIT_MINOR
    );
  };
  const total = lines.reduce((sum, line) => sum + line.debitMinor, 0);
  const checks = [
    {
      label: "Balanserer, og hver linje følger kontoreglene",
      ok: lines.length > 0 && voucherIssues(lines, { accounts: CHART, vatCodes }).length === 0,
    },
    { label: "Har bilagsdato", ok: date !== "" },
    { label: "Under 50 000 kr", ok: total > 0 && total <= AUTO_POST_LIMIT_MINOR },
  ];

  useEffect(
    () =>
      setStepPolicy(() => {
        const { date: d, lines: l } = latest.current;
        const ok = ruleHolds(d, l);
        grantedBy.current = ok ? "agent under regelen for autobokføring" : null;
        // Outside the rule: no opinion, so the step goes to a person.
        return ok ? true : undefined;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile],
  );

  // For the benchmark's end-state checks only. The lines carry their foreign
  // amount and currency as flat fields; the rate is the one a line records.
  useEndState<BookiForeignState>("__accForeign", {
    voucher: {
      date: voucherNow.date,
      lines: voucherNow.lines.map((line) => ({
        account: line.account,
        debitMinor: line.debitMinor,
        creditMinor: line.creditMinor,
        foreignMinor: line.foreign?.amountMinor,
        currency: line.foreign?.currency,
      })),
      rateScaled: voucherNow.lines.find((line) => line.foreign)?.foreign?.rateScaled ?? null,
      posted,
      postedBy,
    },
    events,
  });

  return (
    <div className="acc-invoice">
      <h1 className="mt-0 text-xl font-semibold">Registrer valutafaktura</h1>
      <section aria-label="Valutakurser" className="grid gap-2">
        <h2 className="m-0 text-base font-semibold">Valutakurser (NOK per EUR)</h2>
        <DataTable
          rows={FX_RATES_EUR_NOK}
          columns={RATE_COLUMNS}
          rowKey="date"
          noExport
          noSearch
          aria-label="Valutakurser"
        />
      </section>
      <section aria-label="Bilag" className="grid gap-3">
        <h2 className="m-0 text-base font-semibold">Bilag</h2>
        <FinancialDateField kind="posting" value={date} onValueChange={setDate} aria-label="Bilagsdato" />
        <CurrencySelect
          value={voucherCurrency}
          onValueChange={setVoucherCurrency}
          currencies={CURRENCIES}
          aria-label="Valuta på bilaget"
        />
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
            setPostedDraft({ date: latest.current.date, lines: latest.current.lines });
            setEvents((all) => [...all, "posted"]);
          }}
        >
          Bokfør bilag
        </Button>
        <output>{posted ? `Bilaget er bokført av ${postedBy}.` : ""}</output>
      </section>
    </div>
  );
}
