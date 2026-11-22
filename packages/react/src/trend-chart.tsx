import { formatMoney, minorDigitsFor, money } from "@booki/core/money";
import { createParts } from "@ui-sdk/react/primitive";
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  CHART_RANGES,
  compactMoney,
  formatPercent,
  labelEvery,
  linePath,
  linearScale,
  niceTicks,
  observeWidth,
  periodName,
  rangePeriods,
  seriesColor,
  spreadLabels,
  type ChartRange,
  type PeriodValue,
} from "./chart-math.js";
import { useBookiLocaleOptional } from "./locale.js";
import { useSay } from "./say.js";
import { type Details, type TrendSeries, OTHER_SERIES, clean, derive, trendChart } from "@booki/primitives/trend-chart";

const parts = createParts(trendChart, { root: "div", range: "button", point: "button" });
const TrendChartRoot = parts.Root;
const TrendChartRange = parts.Range;
const TrendChartPoint = parts.Point;

const COPY = {
  EN: {
    trend: "Trend",
    ranges: { "6m": "6M", "12m": "12M", ytd: "YTD", all: "All" } as Record<ChartRange, string>,
    rangesLong: { "6m": "Last 6 months", "12m": "Last 12 months", ytd: "Year to date", all: "All months" } as Record<
      ChartRange,
      string
    >,
    rangeGroup: "Range",
    table: "Show as table",
    month: "Month",
    latest: "latest",
    other: "Other",
    from: "from",
    highest: "highest",
    lowest: "lowest",
    in: "in",
    noData: "No figures to show yet.",
    flat: "unchanged",
    up: "up",
    down: "down",
    total: "Total",
  },
  NO: {
    trend: "Utvikling",
    ranges: { "6m": "6 mnd", "12m": "12 mnd", ytd: "Hittil i år", all: "Alle" } as Record<ChartRange, string>,
    rangesLong: {
      "6m": "Siste 6 måneder",
      "12m": "Siste 12 måneder",
      ytd: "Hittil i år",
      all: "Alle måneder",
    } as Record<ChartRange, string>,
    rangeGroup: "Periode",
    table: "Vis som tabell",
    month: "Måned",
    latest: "sist",
    other: "Annet",
    from: "fra",
    highest: "høyest",
    lowest: "lavest",
    in: "i",
    noData: "Ingen tall å vise ennå.",
    flat: "uendret",
    up: "opp",
    down: "ned",
    total: "Sum",
  },
} as const;

export type TrendChartProps = {
  series: TrendSeries[];
  /** Defaults to the locale profile's currency. */
  currency?: string;
  range?: ChartRange;
  /** Defaults to `12m`. */
  defaultRange?: ChartRange;
  onRangeChange?: (range: ChartRange, details: Details) => void;
  drill?: string | null;
  defaultDrill?: string | null;
  /** A month was drilled into, by a person's click or an agent's `drill`. */
  onDrill?: (period: string, details: Details) => void;
  /** Most points per series an agent's snapshot carries. Defaults to 36. */
  snapshotPoints?: number;
  /** Heading and accessible name. */
  title?: string;
  className?: string;
  "aria-label"?: string;
};

type RootState = { range: ChartRange; drill: string | null; refusal: string };

const HEIGHT = 220;
const PAD = { top: 12, bottom: 26, left: 56 };

/**
 * Composed trend chart: range buttons, a line per series on one axis with
 * direct end labels, a legend for two or more series, a tooltip on hover or
 * focus, and the same figures as a table.
 */
function TrendChart({
  series,
  currency,
  range,
  defaultRange,
  onRangeChange,
  drill,
  defaultDrill,
  onDrill,
  snapshotPoints,
  title,
  className,
  "aria-label": ariaLabel,
}: TrendChartProps) {
  const { country, profile } = useBookiLocaleOptional();
  const say = useSay();
  const copy = COPY[country === "NO" ? "NO" : "EN"];
  const code = currency ?? profile.currency;
  const locale = profile.locale;
  const fmt = (minor: number) => formatMoney(money(minor, code), { locale });
  const axis = (minor: number) => compactMoney(minor, code, locale, minorDigitsFor(code));
  const name = title ?? ariaLabel ?? copy.trend;
  const id = useId();
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  useEffect(() => observeWidth(frame.current, setWidth), []);

  return (
    <TrendChartRoot
      series={series}
      currency={code}
      range={range}
      defaultRange={defaultRange}
      onRangeChange={onRangeChange}
      drill={drill}
      defaultDrill={defaultDrill}
      onDrillChange={(period: string | null, details: Details) => {
        if (period !== null) onDrill?.(period, details);
      }}
      snapshotPoints={snapshotPoints}
      className={className}
      aria-label={name}
    >
      {(state: RootState) => {
        const view = derive(
          { series, currency: code, snapshotPoints: Number.MAX_SAFE_INTEGER },
          state.range,
          state.drill,
        );
        const periods = view.from && view.to ? rangePeriods(state.range, view.from, view.to) : [];
        const lookup = clean(series).series.map(
          (item) => new Map(item.points.map((point) => [point.period, point.valueMinor])),
        );
        // The series that folds every one past the fifth reads in the person's language.
        const visibleSeries = view.series.map((item) =>
          item.id === OTHER_SERIES ? { ...item, name: copy.other } : item,
        );
        const values = visibleSeries.flatMap((item) => item.points.map(([, value]) => value));
        const ticks = niceTicks(Math.min(...values, 0), Math.max(...values, 0), width < 420 ? 3 : 4);
        const multi = visibleSeries.length > 1;
        const endGutter = visibleSeries.length > 0 ? Math.round(Math.min(120, Math.max(64, width * 0.24))) : 12;
        const plotLeft = PAD.left;
        const plotRight = Math.max(plotLeft + 40, width - endGutter);
        const plotBottom = HEIGHT - PAD.bottom;
        const step = periods.length > 1 ? (plotRight - plotLeft) / (periods.length - 1) : 0;
        const xAt = (index: number) => (periods.length > 1 ? plotLeft + index * step : (plotLeft + plotRight) / 2);
        const y = linearScale([ticks.min, ticks.max], [plotBottom, PAD.top]);
        const every = labelEvery(periods.length, plotRight - plotLeft, width < 420 ? 44 : 56);
        const band = periods.length > 1 ? step : plotRight - plotLeft;
        const active = hover ?? focusIndex;
        const drilledIndex = state.drill ? periods.indexOf(state.drill) : -1;
        const marker = active ?? (drilledIndex >= 0 ? drilledIndex : null);
        const lastIndex = periods.length - 1;
        const ends = visibleSeries.map((item, index) => {
          const last = item.latest;
          return last ? y(last.valueMinor) : y(0) + index;
        });
        const endY = spreadLabels(ends, 14, PAD.top + 4, plotBottom);
        const valueAt = (seriesIndex: number, period: string) => lookup[seriesIndex]?.get(period) ?? null;
        const pointLabel = (index: number) => {
          const period = periods[index]!;
          const parts = visibleSeries.map((item, s) => {
            const value = valueAt(s, period);
            return `${item.name} ${value === null ? "–" : fmt(value)}`;
          });
          return `${periodName(period, locale)}: ${parts.join(", ")}`;
        };
        const describe = visibleSeries
          .map((item) => {
            if (!item.latest) return `${item.name}: –`;
            const move =
              item.changeMinor === null || !item.previous
                ? ""
                : item.changeMinor === 0
                  ? `, ${copy.flat} ${copy.from} ${periodName(item.previous.period, locale)}`
                  : `, ${item.changeMinor > 0 ? copy.up : copy.down} ${fmt(Math.abs(item.changeMinor))}${item.changePct === null ? "" : ` (${formatPercent(Math.abs(item.changePct), locale)})`} ${copy.from} ${periodName(item.previous.period, locale)}`;
            const extremes =
              item.max && item.min
                ? `. ${copy.highest} ${fmt(item.max.valueMinor)} ${copy.in} ${periodName(item.max.period, locale)}, ${copy.lowest} ${fmt(item.min.valueMinor)} ${copy.in} ${periodName(item.min.period, locale)}`
                : "";
            return `${item.name}: ${copy.latest} ${fmt(item.latest.valueMinor)} ${copy.in} ${periodName(item.latest.period, locale)}${move}${extremes}.`;
          })
          .join(" ");
        const onKeys = (event: ReactKeyboardEvent<HTMLDivElement>) => {
          const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
          const current = focusIndex ?? (drilledIndex >= 0 ? drilledIndex : lastIndex);
          let next: number | null = null;
          if (event.key in keys) next = Math.min(lastIndex, Math.max(0, current + keys[event.key]!));
          if (event.key === "Home") next = 0;
          if (event.key === "End") next = lastIndex;
          if (next === null) return;
          event.preventDefault();
          const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>("button");
          buttons[next]?.focus();
        };
        const tabStop = drilledIndex >= 0 ? drilledIndex : lastIndex;
        const tipLeft = active === null ? 0 : Math.min(Math.max(8, xAt(active) + 12), Math.max(8, width - 188));

        return (
          <>
            <div data-slot="trend-chart-header">
              {title ? <h3 data-slot="trend-chart-title">{title}</h3> : null}
              <div role="group" aria-label={copy.rangeGroup} data-slot="trend-chart-ranges">
                {CHART_RANGES.map((item) => (
                  <TrendChartRange key={item} value={item} aria-label={copy.rangesLong[item]}>
                    {copy.ranges[item]}
                  </TrendChartRange>
                ))}
              </div>
            </div>

            {multi ? (
              <ul data-slot="trend-chart-legend">
                {visibleSeries.map((item, index) => (
                  <li key={item.id}>
                    <span data-slot="trend-chart-key" aria-hidden="true" style={{ background: seriesColor(index) }} />
                    {item.name}
                  </li>
                ))}
              </ul>
            ) : null}

            {periods.length === 0 ? (
              <p data-slot="trend-chart-empty">{copy.noData}</p>
            ) : (
              <div data-slot="trend-chart-frame" ref={frame} onMouseLeave={() => setHover(null)}>
                <svg
                  data-slot="trend-chart-svg"
                  role="img"
                  aria-labelledby={`${id}-t ${id}-d`}
                  width={width}
                  height={HEIGHT}
                  viewBox={`0 0 ${width} ${HEIGHT}`}
                >
                  <title id={`${id}-t`}>{`${name} · ${copy.rangesLong[state.range]}`}</title>
                  <desc id={`${id}-d`}>{describe}</desc>
                  <g data-slot="trend-chart-grid">
                    {ticks.ticks.map((tick) => (
                      <g key={tick}>
                        <line
                          x1={plotLeft}
                          x2={plotRight}
                          y1={y(tick)}
                          y2={y(tick)}
                          data-zero={tick === 0 ? "" : undefined}
                        />
                        <text x={plotLeft - 8} y={y(tick)} dy="0.32em" textAnchor="end">
                          {axis(tick)}
                        </text>
                      </g>
                    ))}
                  </g>
                  <g data-slot="trend-chart-axis">
                    {periods.map((period, index) =>
                      (lastIndex - index) % every === 0 ? (
                        <text key={period} x={xAt(index)} y={HEIGHT - 8} textAnchor="middle">
                          {periodName(period, locale, !(index === 0 || period.endsWith("-01")))}
                        </text>
                      ) : null,
                    )}
                  </g>
                  {marker !== null ? (
                    <line
                      data-slot="trend-chart-cursor"
                      x1={xAt(marker)}
                      x2={xAt(marker)}
                      y1={PAD.top}
                      y2={plotBottom}
                    />
                  ) : null}
                  {visibleSeries.map((item, s) => (
                    <path
                      key={item.id}
                      data-slot="trend-chart-line"
                      d={linePath(
                        periods.map((period, index) => {
                          const value = valueAt(s, period);
                          return value === null ? null : { x: xAt(index), y: y(value) };
                        }),
                      )}
                      style={{ stroke: seriesColor(s) }}
                    />
                  ))}
                  {visibleSeries.map((item, s) => {
                    const lastPeriod = item.latest?.period;
                    const index = lastPeriod ? periods.indexOf(lastPeriod) : -1;
                    if (index < 0 || !item.latest) return null;
                    const ly = endY[s]!;
                    const py = y(item.latest.valueMinor);
                    return (
                      <g key={item.id} data-slot="trend-chart-end">
                        <circle cx={xAt(index)} cy={py} r={4} style={{ fill: seriesColor(s) }} />
                        {Math.abs(ly - py) > 3 ? (
                          <line x1={xAt(index) + 6} x2={xAt(index) + 12} y1={py} y2={ly} />
                        ) : null}
                        <text x={xAt(index) + 14} y={ly} dy="0.32em">
                          {multi ? truncate(item.name, Math.floor((endGutter - 18) / 7)) : axis(item.latest.valueMinor)}
                        </text>
                      </g>
                    );
                  })}
                  {marker !== null
                    ? visibleSeries.map((item, s) => {
                        const value = valueAt(s, periods[marker]!);
                        return value === null ? null : (
                          <circle
                            key={item.id}
                            data-slot="trend-chart-marker"
                            cx={xAt(marker)}
                            cy={y(value)}
                            r={4}
                            style={{ fill: seriesColor(s) }}
                          />
                        );
                      })
                    : null}
                </svg>
                {/* Arrow keys bubble up from the bar buttons inside; the container takes no focus itself. */}
                {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions */}
                <div data-slot="trend-chart-hits" onKeyDown={onKeys}>
                  {periods.map((period, index) => (
                    <TrendChartPoint
                      key={period}
                      value={period}
                      aria-label={pointLabel(index)}
                      tabIndex={index === (focusIndex ?? tabStop) ? 0 : -1}
                      onMouseEnter={() => setHover(index)}
                      onFocus={() => setFocusIndex(index)}
                      onBlur={() => setFocusIndex(null)}
                      style={{ left: xAt(index) - band / 2, width: band, top: PAD.top, height: plotBottom - PAD.top }}
                    />
                  ))}
                </div>

                {active !== null && periods[active] ? (
                  <div data-slot="trend-chart-tooltip" aria-hidden="true" style={{ left: tipLeft, top: PAD.top }}>
                    <strong>{periodName(periods[active]!, locale)}</strong>
                    {visibleSeries.map((item, s) => {
                      const value = valueAt(s, periods[active]!);
                      return (
                        <span key={item.id} data-slot="trend-chart-tooltip-row">
                          <span data-slot="trend-chart-key" style={{ background: seriesColor(s) }} />
                          <span>{item.name}</span>
                          <span data-slot="trend-chart-value">{value === null ? "–" : fmt(value)}</span>
                        </span>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            )}

            {periods.length > 0 ? (
              <details data-slot="trend-chart-table">
                <summary>{copy.table}</summary>
                <div data-slot="trend-chart-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">{copy.month}</th>
                        {visibleSeries.map((item) => (
                          <th key={item.id} scope="col" data-align="end">
                            {item.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {periods.map((period) => (
                        <tr key={period} data-drilled={state.drill === period ? "" : undefined}>
                          <th scope="row">{periodName(period, locale)}</th>
                          {visibleSeries.map((item, s) => {
                            const value = valueAt(s, period);
                            return (
                              <td key={item.id} data-align="end">
                                {value === null ? "–" : fmt(value)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th scope="row">{copy.total}</th>
                        {visibleSeries.map((item) => (
                          <td key={item.id} data-align="end">
                            {fmt(item.totalMinor)}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </details>
            ) : null}
            {state.refusal ? (
              <p data-slot="trend-chart-error" role="alert">
                {say(state.refusal)}
              </p>
            ) : null}
          </>
        );
      }}
    </TrendChartRoot>
  );
}

function truncate(text: string, max: number): string {
  if (max < 2) return "";
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text;
}

export { TrendChart, TrendChartPoint, TrendChartRange, TrendChartRoot, trendChart };
export type { ChartRange, PeriodValue };

export { type TrendSeries, type TrendSeriesSnapshot, type TrendDrilled } from "@booki/primitives/trend-chart";
