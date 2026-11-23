import { formatMoney, money } from "@booki/core/money";
import { createParts } from "@ui-sdk/react/primitive";
import { useId } from "react";
import { formatPercent, linePath, linearScale, periodName, type Direction, type PeriodValue } from "./chart-math.js";
import { useBookiLocaleOptional } from "./locale.js";
import { type KpiGood, derive, kpiStat } from "@booki/primitives/kpi-stat";

const parts = createParts(kpiStat, { root: "div" });
const KpiStatRoot = parts.Root;

const COPY = {
  EN: {
    vs: "vs",
    previous: "previous period",
    up: "Up",
    down: "Down",
    flat: "Unchanged",
    trend: "Trend",
    noPrevious: "No comparison",
    notSet: "Not set",
  },
  NO: {
    vs: "mot",
    previous: "forrige periode",
    up: "Opp",
    down: "Ned",
    flat: "Uendret",
    trend: "Utvikling",
    noPrevious: "Ingen sammenligning",
    notSet: "Ikke satt",
  },
} as const;

export type KpiStatProps = {
  label: string;
  /** Undefined or null shows "Not set". */
  valueMinor?: number | null;
  previousMinor?: number | null;
  /** Defaults to the locale profile's currency. */
  currency?: string;
  /** What the comparison is against: "Feb 2026", "last year". */
  previousLabel?: string;
  /** Which way is good news. Defaults to "up"; use "down" for costs. */
  good?: KpiGood;
  /** A short series for the sparkline, oldest first. */
  series?: PeriodValue[];
  /** Show "No comparison" when there is no previous value. Default false: the line is left out. */
  showNoComparison?: boolean;
  /** Show whole amounts without ",00". Default true: a figure, not a ledger line. */
  trimZeroFraction?: boolean;
  className?: string;
};

type RootState = { direction: Direction | null; favourable: boolean | null };

const SPARK_W = 120;
const SPARK_H = 32;

/** Composed figure: the label, the value, the change against before and a sparkline. */
function KpiStat({
  label,
  valueMinor,
  previousMinor,
  currency,
  previousLabel,
  good = "up",
  series,
  showNoComparison = false,
  trimZeroFraction = true,
  className,
}: KpiStatProps) {
  const { country, profile } = useBookiLocaleOptional();
  const copy = COPY[country === "NO" ? "NO" : "EN"];
  const code = currency ?? profile.currency;
  const locale = profile.locale;
  const fmt = (minor: number) => formatMoney(money(minor, code), { locale, trimZeroFraction });
  const id = useId();

  return (
    <KpiStatRoot
      label={label}
      valueMinor={valueMinor}
      previousMinor={previousMinor}
      currency={code}
      previousLabel={previousLabel}
      good={good}
      series={series}
      className={className}
      aria-label={label}
    >
      {(_state: RootState) => {
        const view = derive({ label, valueMinor, previousMinor, currency: code, previousLabel, good, series });
        const against = previousLabel ?? copy.previous;
        const sign = view.deltaMinor === null ? "" : view.deltaMinor > 0 ? "+" : view.deltaMinor < 0 ? "−" : "±";
        const arrow =
          view.direction === "up" ? "▲" : view.direction === "down" ? "▼" : view.direction === "flat" ? "■" : "";
        const word = view.direction === "up" ? copy.up : view.direction === "down" ? copy.down : copy.flat;
        const spark = view.sparkline;
        const values = spark.map(([, value]) => value);
        const y = linearScale(
          [
            Math.min(...values),
            Math.max(...values) === Math.min(...values) ? Math.min(...values) + 1 : Math.max(...values),
          ],
          [SPARK_H - 4, 4],
        );
        const x = (index: number) =>
          spark.length > 1 ? 4 + (index * (SPARK_W - 8)) / (spark.length - 1) : SPARK_W / 2;
        return (
          <>
            <p data-slot="kpi-stat-label" id={`${id}-l`}>
              {label}
            </p>
            <p data-slot="kpi-stat-value" data-state={view.set ? undefined : "not-set"}>
              {view.valueMinor !== null ? fmt(view.valueMinor) : view.set ? "–" : copy.notSet}
            </p>
            {view.deltaMinor === null ? (
              showNoComparison && view.set ? (
                <p data-slot="kpi-stat-delta" data-direction="none">
                  {copy.noPrevious}
                </p>
              ) : null
            ) : (
              <p
                data-slot="kpi-stat-delta"
                data-direction={view.direction ?? undefined}
                data-favourable={view.favourable === null ? undefined : String(view.favourable)}
              >
                <span aria-hidden="true" data-slot="kpi-stat-arrow">
                  {arrow}
                </span>
                <span data-slot="visually-hidden">{`${word} `}</span>
                <span data-slot="kpi-stat-change">
                  {`${sign}${fmt(Math.abs(view.deltaMinor))}`}
                  {view.deltaPct === null ? "" : ` (${sign}${formatPercent(Math.abs(view.deltaPct), locale)})`}
                </span>
                <span data-slot="kpi-stat-against">{` ${copy.vs} ${against}`}</span>
              </p>
            )}
            {spark.length > 1 ? (
              <svg
                data-slot="kpi-stat-spark"
                role="img"
                aria-label={`${copy.trend}: ${spark.map(([period, value]) => `${periodName(period, locale)} ${fmt(value)}`).join(", ")}`}
                width={SPARK_W}
                height={SPARK_H}
                viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
              >
                <path
                  data-slot="kpi-stat-spark-line"
                  d={linePath(spark.map(([, value], index) => ({ x: x(index), y: y(value) })))}
                />
                <circle data-slot="kpi-stat-spark-end" cx={x(spark.length - 1)} cy={y(spark.at(-1)![1])} r={3} />
              </svg>
            ) : null}
          </>
        );
      }}
    </KpiStatRoot>
  );
}

export { KpiStat, KpiStatRoot, kpiStat };

export { type KpiGood } from "@booki/primitives/kpi-stat";
