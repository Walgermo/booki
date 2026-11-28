import { createChange, definePrimitive, usePart, usePrimitive } from "@booki-aui/react";
import { useEffect, useId, useMemo, useState } from "react";

import { FIRST_YEAR, LATEST_MONTH, PERIOD_FORMAT, indexFor, priceChange, type PriceChange } from "./price-change";

/**
 * SSB's price calculator on Booki, for the side-by-side comparison
 * (benchmarks/agent/compare): an amount, a period to move it from and one to
 * move it to, by the consumer price index SSB's calculator uses (kpi.json).
 * An agent sets all three by name in one call and reads the result from the
 * snapshot. The amount is øre on the bridge, as everywhere in Booki.
 */

const CALCULATE_FIELDS = ["amountMinor", "from", "to"] as const;
const CALCULATE_FORMAT = `{ amountMinor: øre (10 000 kr is 1000000), from: period, to: period }; a period is ${PERIOD_FORMAT}`;

const MONTHS = [
  "januar",
  "februar",
  "mars",
  "april",
  "mai",
  "juni",
  "juli",
  "august",
  "september",
  "oktober",
  "november",
  "desember",
];

type PriceState = {
  amountMinor: number;
  from: string;
  to: string;
  calculateFormat: string;
  latestMonth: string;
  /** Null until amount and both periods are set. */
  result: Omit<PriceChange, "amountMinor" | "from" | "to"> | null;
};

type PriceOptions = {
  amountMinor: number;
  from: string;
  to: string;
  onAmountMinorChange?: (value: number) => void;
  onFromChange?: (value: string) => void;
  onToChange?: (value: string) => void;
};

function resultFor(amountMinor: number, from: string, to: string): PriceState["result"] {
  if (!from || !to) return null;
  try {
    const { resultMinor, changePct, fromIndex, toIndex } = priceChange(amountMinor, from, to);
    return { resultMinor, changePct, fromIndex, toIndex };
  } catch {
    return null;
  }
}

const stateOf = (options: PriceOptions): PriceState => ({
  amountMinor: options.amountMinor,
  from: options.from,
  to: options.to,
  calculateFormat: CALCULATE_FORMAT,
  latestMonth: LATEST_MONTH,
  result: resultFor(options.amountMinor, options.from, options.to),
});

const priceCalculator = definePrimitive({
  name: "price-calculator",
  options: {
    amountMinor: "number",
    from: "string",
    to: "string",
    onAmountMinorChange: "callback",
    onFromChange: "callback",
    onToChange: "callback",
  },
  controlled: ["amountMinor", "from", "to", "calculateFormat", "latestMonth", "result"],
  state: stateOf,
  sync: stateOf,
  api: (context) => {
    const change = createChange(context);
    const personEvent = (event: unknown) => (event instanceof Event ? event : undefined);
    const recompute = () => {
      const { amountMinor, from, to } = context.store.get();
      context.store.set({ result: resultFor(amountMinor, from, to) });
    };
    const checkAmount = (minor: unknown) => {
      if (!Number.isInteger(minor) || (minor as number) < 0) {
        throw new Error(`The amount is øre, a whole number 0 or more (10 000 kr is 1000000); got ${String(minor)}.`);
      }
    };
    // indexFor throws with the form that works when a period is not in the index.
    const checkPeriod = (period: unknown) => indexFor(String(period));
    return {
      /** Amount and both periods at once. */
      calculate: (input: { amountMinor: number; from: string; to: string }): boolean => {
        if (!input || typeof input !== "object") throw new Error(`calculate takes ${CALCULATE_FORMAT}.`);
        const unknown = Object.keys(input).filter((key) => !(CALCULATE_FIELDS as readonly string[]).includes(key));
        if (unknown.length)
          throw new Error(`Unknown field ${unknown.join(", ")}. calculate takes ${CALCULATE_FORMAT}.`);
        checkAmount(input.amountMinor);
        checkPeriod(input.from);
        checkPeriod(input.to);
        const ok =
          change("amountMinor", input.amountMinor, { reason: "calculate" }) &&
          change("from", input.from, { reason: "calculate" }) &&
          change("to", input.to, { reason: "calculate" });
        recompute();
        return ok;
      },
      setAmount: (minor: number, event?: Event): boolean => {
        checkAmount(minor);
        const ok = change("amountMinor", minor, { reason: "set-amount", event: personEvent(event) });
        recompute();
        return ok;
      },
      setFrom: (period: string, event?: Event): boolean => {
        checkPeriod(period);
        const ok = change("from", period, { reason: "set-from", event: personEvent(event) });
        recompute();
        return ok;
      },
      setTo: (period: string, event?: Event): boolean => {
        checkPeriod(period);
        const ok = change("to", period, { reason: "set-to", event: personEvent(event) });
        recompute();
        return ok;
      },
    };
  },
  slots: (slot) => ({ root: slot({ role: "group", attrs: () => ({ "data-slot": "price-calculator" }) }) }),
  agent: { actions: ["calculate", "setAmount", "setFrom", "setTo"] },
});

const kr = (minor: number) =>
  `${new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(minor / 100)} kr`;

function periodLabel(period: string) {
  const [year, month] = period.split("-");
  return month ? `${MONTHS[Number(month) - 1]} ${year}` : `gjennomsnitt ${year}`;
}

/** A year and a month (or the year's average), for a person. */
function PeriodInput(props: { label: string; value: string; onChange: (period: string, event: Event) => void }) {
  const id = useId();
  const [year, month = ""] = props.value.split("-");
  const [yearText, setYearText] = useState(year ?? "");
  // An agent's change shows in the box too.
  useEffect(() => {
    if (year && year !== yearText) setYearText(year);
    // Only when the value changes, not while a person types.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);
  const emit = (nextYear: string, nextMonth: string, event: Event) => {
    if (/^\d{4}$/.test(nextYear)) props.onChange(nextMonth ? `${nextYear}-${nextMonth}` : nextYear, event);
  };
  return (
    <fieldset className="m-0 grid grid-cols-[6rem_1fr] gap-2 border-0 p-0">
      <legend className="mb-1">{props.label}</legend>
      <label htmlFor={`${id}-year`} className="sr-only">
        {props.label}, år (åååå)
      </label>
      <input
        id={`${id}-year`}
        inputMode="numeric"
        placeholder="åååå"
        value={yearText}
        onChange={(event) => {
          setYearText(event.target.value);
          emit(event.target.value, month, event.nativeEvent);
        }}
      />
      <label htmlFor={`${id}-month`} className="sr-only">
        {props.label}, måned
      </label>
      <select
        id={`${id}-month`}
        value={month}
        onChange={(event) => emit(yearText, event.target.value, event.nativeEvent)}
      >
        <option value="">Gjennomsnitt for året</option>
        {MONTHS.map((name, index) => (
          <option key={name} value={String(index + 1).padStart(2, "0")}>
            {name[0]!.toUpperCase() + name.slice(1)}
          </option>
        ))}
      </select>
    </fieldset>
  );
}

export function BookiPriceCalculator() {
  const [amountMinor, setAmountMinor] = useState(0);
  const [amountText, setAmountText] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const amountId = useId();

  const handle = usePrimitive(priceCalculator, {
    amountMinor,
    from,
    to,
    onAmountMinorChange: (minor) => {
      setAmountMinor(minor);
      setAmountText(String(minor / 100));
    },
    onFromChange: setFrom,
    onToChange: setTo,
  });
  const result = useMemo(() => resultFor(amountMinor, from, to), [amountMinor, from, to]);

  return usePart(
    handle,
    "root",
    {},
    {
      "aria-label": "Priskalkulator",
      className: "grid gap-6",
      children: (
        <>
          <header className="grid gap-1">
            <h1 className="text-2xl font-semibold">Beregn prisendring</h1>
            <p className="m-0 text-muted-foreground">
              Etter konsumprisindeksen, fra {FIRST_YEAR}. Siste tall er for {periodLabel(LATEST_MONTH)}.
            </p>
          </header>
          <div className="grid gap-1">
            <label htmlFor={amountId}>Beløp (kr)</label>
            <input
              id={amountId}
              inputMode="decimal"
              className="tabular-nums"
              value={amountText}
              onChange={(event) => setAmountText(event.target.value)}
              onBlur={(event) => {
                const kroner = Number(amountText.replace(/\s/g, "").replace(",", "."));
                if (Number.isFinite(kroner) && kroner >= 0)
                  handle.api.setAmount(Math.round(kroner * 100), event.nativeEvent);
              }}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <PeriodInput label="Fra" value={from} onChange={(period, event) => handle.api.setFrom(period, event)} />
            <PeriodInput label="Til" value={to} onChange={(period, event) => handle.api.setTo(period, event)} />
          </div>
          <section aria-label="Resultat" className="site-sheet grid gap-2 p-5">
            {result ? (
              <>
                <p className="m-0 text-sm text-muted-foreground">
                  {kr(amountMinor)} i {periodLabel(from)} tilsvarer i {periodLabel(to)}
                </p>
                <p className="m-0 text-3xl font-semibold tabular-nums">{kr(result.resultMinor)}</p>
                <p className="m-0 text-sm tabular-nums">
                  Prisendring {new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 1 }).format(result.changePct)} %
                </p>
              </>
            ) : (
              <p className="m-0 text-sm text-muted-foreground">Skriv inn beløp og to perioder.</p>
            )}
          </section>
        </>
      ),
    },
    "div",
  );
}
