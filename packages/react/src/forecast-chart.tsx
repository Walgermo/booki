import { formatMoney } from "@booki-aui/core/money";
import type { Deal, PipelineStage } from "@booki-aui/core/pipeline";
import { createParts } from "@ui-sdk/react/primitive";
import { compactMoney, periodName } from "./chart-math.js";
import { useBookiLocaleOptional } from "./locale.js";
import { useSay } from "./say.js";
import {
  derive,
  forecastChart,
  type Details,
  type ForecastGrouping,
  type ForecastPeriod,
} from "@booki-aui/primitives/forecast-chart";

const parts = createParts(forecastChart, { root: "div", grouping: "button", period: "button" });
const ForecastChartRoot = parts.Root;
const ForecastChartGrouping = parts.Grouping;
const ForecastChartPeriod = parts.Period;

const COPY = {
  EN: {
    forecast: "Forecast",
    month: "Month",
    quarter: "Quarter",
    grouping: "Group by",
    won: "Won",
    committed: "Committed",
    bestCase: "Best case",
    weighted: "Weighted",
    period: "Period",
    deals: "Deals",
    total: "Total",
    table: "Show as table",
    undated: (n: number) =>
      `${n} open ${n === 1 ? "deal has" : "deals have"} no expected close date and ${n === 1 ? "is" : "are"} left out.`,
    overdue: (n: number) =>
      `${n} open ${n === 1 ? "deal is" : "deals are"} past ${n === 1 ? "its" : "their"} expected close date.`,
    other: (n: number, code: string) => `${n} ${n === 1 ? "deal" : "deals"} in another currency than ${code} left out.`,
    unverified: (n: number) =>
      `${n} open ${n === 1 ? "deal is" : "deals are"} left out: no amount, or one without a source.`,
    none: "No deals in the range.",
  },
  NO: {
    forecast: "Prognose",
    month: "Måned",
    quarter: "Kvartal",
    grouping: "Grupper per",
    won: "Vunnet",
    committed: "Sikker",
    bestCase: "Beste fall",
    weighted: "Vektet",
    period: "Periode",
    deals: "Avtaler",
    total: "Sum",
    table: "Vis som tabell",
    undated: (n: number) => `${n} åpne ${n === 1 ? "avtale" : "avtaler"} uten forventet lukkedato holdes utenfor.`,
    overdue: (n: number) => `${n} åpne ${n === 1 ? "avtale" : "avtaler"} har passert forventet lukkedato.`,
    other: (n: number, code: string) =>
      `${n} ${n === 1 ? "avtale" : "avtaler"} i annen valuta enn ${code} holdes utenfor.`,
    unverified: (n: number) =>
      `${n} åpne ${n === 1 ? "avtale" : "avtaler"} holdes utenfor: uten beløp, eller med beløp uten kilde.`,
    none: "Ingen avtaler i perioden.",
  },
} as const;

export type ForecastChartProps = {
  deals: Deal[];
  stages: PipelineStage[];
  /** First and last day of the range, YYYY-MM-DD. */
  from: string;
  to: string;
  /** Defaults to the locale profile's currency. */
  currency?: string;
  today?: string;
  grouping?: ForecastGrouping;
  defaultGrouping?: ForecastGrouping;
  onGroupingChange?: (grouping: ForecastGrouping, details: Details) => void;
  drill?: string | null;
  defaultDrill?: string | null;
  onDrill?: (period: string, details: Details) => void;
  title?: string;
  className?: string;
  "aria-label"?: string;
};

type RootState = { grouping: ForecastGrouping; drill: string | null; refusal: string };

const SERIES = ["won", "committed", "bestCase"] as const;

/** Composed forecast: per period a stacked bar of won, committed and best case, the weighted figure, and what is left out. */
function ForecastChart({
  deals,
  stages,
  from,
  to,
  currency,
  today,
  grouping,
  defaultGrouping,
  onGroupingChange,
  drill,
  defaultDrill,
  onDrill,
  title,
  className,
  "aria-label": ariaLabel,
}: ForecastChartProps) {
  const { country, profile } = useBookiLocaleOptional();
  const say = useSay();
  const copy = COPY[country === "NO" ? "NO" : "EN"];
  const code = currency ?? profile.currency;
  const locale = profile.locale;
  const fmt = (minor: number) => formatMoney({ minor, currency: code }, { locale, trimZeroFraction: true });
  const short = (minor: number) => compactMoney(minor, code, locale);
  const name = (period: string) => (period.includes("Q") ? period.replace("-", " ") : periodName(period, locale, true));
  return (
    <ForecastChartRoot
      deals={deals}
      stages={stages}
      from={from}
      to={to}
      currency={code}
      today={today}
      grouping={grouping}
      defaultGrouping={defaultGrouping}
      onGroupingChange={onGroupingChange}
      drill={drill}
      defaultDrill={defaultDrill}
      onDrillChange={(next: string | null, details: Details) => {
        if (next !== null) onDrill?.(next, details);
      }}
      className={className}
      aria-label={ariaLabel ?? title ?? copy.forecast}
    >
      {(state: RootState) => {
        const view = derive({ deals, stages, from, to, currency: code, today }, state.grouping, state.drill);
        const top = Math.max(1, ...view.periods.map((row) => row.wonMinor + row.committedMinor + row.bestCaseMinor));
        const amount = (row: ForecastPeriod, series: (typeof SERIES)[number]) =>
          series === "won" ? row.wonMinor : series === "committed" ? row.committedMinor : row.bestCaseMinor;
        return (
          <>
            {title ? <h3 data-slot="forecast-chart-title">{title}</h3> : null}
            <div data-slot="forecast-chart-toolbar">
              <span data-slot="forecast-chart-legend">
                {SERIES.map((series) => (
                  <span key={series} data-series={series}>
                    {copy[series]}
                  </span>
                ))}
              </span>
              <span role="group" aria-label={copy.grouping} data-slot="forecast-chart-groupings">
                <ForecastChartGrouping value="month">{copy.month}</ForecastChartGrouping>
                <ForecastChartGrouping value="quarter">{copy.quarter}</ForecastChartGrouping>
              </span>
            </div>
            <p data-slot="forecast-chart-summary" role="status">
              {copy.won} {fmt(view.totals.wonMinor)} · {copy.committed} {fmt(view.totals.committedMinor)} ·{" "}
              {copy.bestCase} {fmt(view.totals.bestCaseMinor)} · {copy.weighted} {fmt(view.totals.weightedMinor)}
            </p>
            {view.periods.length === 0 ? (
              <p data-slot="forecast-chart-empty">{copy.none}</p>
            ) : (
              <div data-slot="forecast-chart-columns">
                {view.periods.map((row) => {
                  const sum = row.wonMinor + row.committedMinor + row.bestCaseMinor;
                  return (
                    <ForecastChartPeriod
                      key={row.period}
                      value={row.period}
                      aria-label={`${name(row.period)}: ${copy.won} ${fmt(row.wonMinor)}, ${copy.committed} ${fmt(row.committedMinor)}, ${copy.bestCase} ${fmt(row.bestCaseMinor)}, ${copy.weighted} ${fmt(row.weightedMinor)}`}
                    >
                      <span data-slot="forecast-chart-figure">{sum ? short(sum) : "–"}</span>
                      <span data-slot="forecast-chart-stack">
                        {SERIES.map((series) =>
                          amount(row, series) > 0 ? (
                            <span
                              key={series}
                              data-slot="forecast-chart-segment"
                              data-series={series}
                              style={{ height: `${(amount(row, series) / top) * 100}%` }}
                            />
                          ) : null,
                        )}
                      </span>
                      <span data-slot="forecast-chart-period">{name(row.period)}</span>
                    </ForecastChartPeriod>
                  );
                })}
              </div>
            )}
            {view.undated.length || view.overdue.length || view.otherCurrency.length || view.unverified.length ? (
              <ul data-slot="forecast-chart-notes">
                {view.unverified.length ? <li>{copy.unverified(view.unverified.length)}</li> : null}
                {view.undated.length ? <li>{copy.undated(view.undated.length)}</li> : null}
                {view.overdue.length ? <li>{copy.overdue(view.overdue.length)}</li> : null}
                {view.otherCurrency.length ? <li>{copy.other(view.otherCurrency.length, code)}</li> : null}
              </ul>
            ) : null}
            {view.periods.length ? (
              <details data-slot="forecast-chart-table">
                <summary>{copy.table}</summary>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">{copy.period}</th>
                      <th scope="col" data-align="end">
                        {copy.won}
                      </th>
                      <th scope="col" data-align="end">
                        {copy.committed}
                      </th>
                      <th scope="col" data-align="end">
                        {copy.bestCase}
                      </th>
                      <th scope="col" data-align="end">
                        {copy.weighted}
                      </th>
                      <th scope="col" data-align="end">
                        {copy.deals}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {view.periods.map((row) => (
                      <tr key={row.period}>
                        <th scope="row">{name(row.period)}</th>
                        <td data-align="end">{fmt(row.wonMinor)}</td>
                        <td data-align="end">{fmt(row.committedMinor)}</td>
                        <td data-align="end">{fmt(row.bestCaseMinor)}</td>
                        <td data-align="end">{fmt(row.weightedMinor)}</td>
                        <td data-align="end">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope="row">{copy.total}</th>
                      <td data-align="end">{fmt(view.totals.wonMinor)}</td>
                      <td data-align="end">{fmt(view.totals.committedMinor)}</td>
                      <td data-align="end">{fmt(view.totals.bestCaseMinor)}</td>
                      <td data-align="end">{fmt(view.totals.weightedMinor)}</td>
                      <td data-align="end">{view.totals.count}</td>
                    </tr>
                  </tfoot>
                </table>
              </details>
            ) : null}
            {state.refusal ? (
              <p data-slot="forecast-chart-error" role="alert">
                {say(state.refusal)}
              </p>
            ) : null}
          </>
        );
      }}
    </ForecastChartRoot>
  );
}

export { ForecastChart, ForecastChartGrouping, ForecastChartPeriod, ForecastChartRoot, forecastChart };
export type { ForecastGrouping, ForecastPeriod };
