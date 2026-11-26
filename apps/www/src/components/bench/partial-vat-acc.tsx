import { voucherIssues, type AccountOption, type VoucherLine } from "@booki-aui/core/voucher";
import { FinancialDateField, VoucherComposer, useBookiLocale } from "@booki-aui/react";
import { Button } from "@ui-sdk/react/button";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useEndState } from "./end-state";

import { setStepPolicy } from "@/agent";

import { HARD_ACCOUNTS, PARTIAL_VAT_RULE } from "./hard-data";

/**
 * The partial-VAT voucher on Booki, with the same composer as the other
 * voucher screens and no helper for the deduction. The composer treats a
 * line with a VAT code as a gross amount and splits the full VAT on that
 * rate (see vatPostings in @booki-aui/core/voucher); it has no option for a
 * share of the VAT. So the lines here are entered as they stand, without a
 * VAT code. The agent posts on its own when the voucher meets the company's
 * rule: it balances, it is dated, and it is at most 50 000 kr.
 */

const CHART: AccountOption[] = HARD_ACCOUNTS.map((account) => ({
  number: account.number,
  name: account.name,
}));
const AUTO_POST_LIMIT_MINOR = 5_000_000;

export type BookiPartialVatState = {
  voucher: {
    date: string;
    lines: VoucherLine[];
    posted: boolean;
    postedBy: string;
  };
  events: string[];
};

export function BookiPartialVat() {
  const { profile } = useBookiLocale();
  const [date, setDate] = useState("");
  const [lines, setLines] = useState<VoucherLine[]>([]);
  const [posted, setPosted] = useState(false);
  const [postedBy, setPostedBy] = useState("");
  // What was posted, kept as it was at the click: an edit after posting changes the draft, not the posting.
  const [postedDraft, setPostedDraft] = useState<{ date: string; lines: VoucherLine[] } | null>(null);
  const voucherNow = postedDraft ?? { date, lines };
  const [events, setEvents] = useState<string[]>([]);
  const grantedBy = useRef<string | null>(null);
  const latest = useRef({ date, lines });
  useLayoutEffect(() => {
    latest.current = { date, lines };
  });

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
    {
      label: "Under 50 000 kr",
      ok: total > 0 && total <= AUTO_POST_LIMIT_MINOR,
    },
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

  // For the benchmark's end-state checks only.
  useEndState<BookiPartialVatState>("__accPartialVat", {
    voucher: { date: voucherNow.date, lines: voucherNow.lines, posted, postedBy },
    events,
  });

  return (
    <div className="acc-invoice">
      <h1 className="mt-0 text-xl font-semibold">Registrer bilag</h1>
      <section aria-label="Regel" className="grid gap-1 text-sm">
        <p className="m-0">{PARTIAL_VAT_RULE}</p>
      </section>
      <section aria-label="Bilag" className="grid gap-3">
        <h2 className="m-0 text-base font-semibold">Bilag</h2>
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
