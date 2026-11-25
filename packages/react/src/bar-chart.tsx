import { formatMoney, money } from "@booki-aui/core/money";
import { createParts, type Parts } from "@ui-sdk/react/primitive";
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { barPath, formatPercent, linearScale, observeWidth } from "./chart-math.js";
import { useBookiLocaleOptional } from "./locale.js";
import { useSay } from "./say.js";
import { type Details, type BarItem, derive, barChart } from "@booki-aui/primitives/bar-chart";

const TAGS = { root: "div", bar: "button", more: "button" } as const;
// Typed by name, so the declarations refer to the definition instead of spelling it out per part.
const parts: Parts<typeof barChart, typeof TAGS> = createParts(barChart, TAGS);
const BarChartRoot: (typeof parts)["Root"] = parts.Root;
const BarChartBar: (typeof parts)["Bar"] = parts.Bar;
const BarChartMore: (typeof parts)["More"] = parts.More;

const COPY = {
  EN: {
    bars: "By category",
    other: "Other",
    table: "Show as table",
    category: "Category",
    amount: "Amount",
    share: "Share",
    total: "Total",
    showAll: (count: number) => `Show all ${count}`,
    showFewer: "Show fewer",
    categories: "categories",
    noData: "No figures to show yet.",
    ofTotal: "of the total",
    largest: "Largest",
  },
  NO: {
    bars: "Per kategori",
    other: "Annet",
    table: "Vis som tabell",
    category: "Kategori",
    amount: "Beløp",
    share: "Andel",
    total: "Sum",
    showAll: (count: number) => `Vis alle ${count}`,
    showFewer: "Vis færre",
    categories: "kategorier",
    noData: "Ingen tall å vise ennå.",
    ofTotal: "av totalen",
    largest: "Størst",
  },
} as const;

export type BarChartProps = {
  items: BarItem[];
  /** Defaults to the locale profile's currency. */
  currency?: string;
  limit?: number | null;
  /** Bars shown before the rest fold into "Other". Defaults to all. */
  defaultLimit?: number | null;
  onLimitChange?: (limit: number | null, details: Details) => void;
  drill?: string | null;
  defaultDrill?: string | null;
  /** A category was drilled into, by a person's click or an agent's `drill`. */
  onDrill?: (id: string, details: Details) => void;
  title?: string;
  className?: string;
  "aria-label"?: string;
};

type RootState = { limit: number | null; lastLimit: number | null; drill: string | null; refusal: string };

const ROW = 44;
const BAR = 12;

/**
 * Composed bar chart: one row per category, largest first, the name and
 * amount above a thin bar, "Other" for the rest when a limit is set, a
 * tooltip on hover or focus and the same figures as a table.
 */
function BarChart({
  items,
  currency,
  limit,
  defaultLimit,
  onLimitChange,
  drill,
  defaultDrill,
  onDrill,
  title,
  className,
  "aria-label": ariaLabel,
}: BarChartProps) {
  const { country, profile } = useBookiLocaleOptional();
  const say = useSay();
  const copy = COPY[country === "NO" ? "NO" : "EN"];
  const code = currency ?? profile.currency;
  const locale = profile.locale;
  const fmt = (minor: number) => formatMoney(money(minor, code), { locale });
  const name = title ?? ariaLabel ?? copy.bars;
  const id = useId();
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  const [hover, setHover] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  useEffect(() => observeWidth(frame.current, setWidth), []);

  return (
    <BarChartRoot
      items={items}
      currency={code}
      limit={limit}
      defaultLimit={defaultLimit}
      onLimitChange={onLimitChange}
      drill={drill}
      defaultDrill={defaultDrill}
      onDrillChange={(next: string | null, details: Details) => {
        if (next !== null) onDrill?.(next, details);
      }}
      otherLabel={copy.other}
      className={className}
      aria-label={name}
    >
      {(state: RootState) => {
        const view = derive({ items, otherLabel: copy.other }, state.limit, state.drill);
        const rows = view.rows;
        const min = Math.min(0, ...rows.map((row) => row.valueMinor));
        const max = Math.max(0, ...rows.map((row) => row.valueMinor));
        const x = linearScale([min, max === min ? min + 1 : max], [0, width]);
        const height = rows.length * ROW;
        const active = hover ?? focusIndex;
        const drilledIndex = state.drill ? rows.findIndex((row) => row.id === state.drill) : -1;
        const tabStop = drilledIndex >= 0 ? drilledIndex : 0;
        const describe =
          rows.length === 0
            ? copy.noData
            : `${copy.total} ${fmt(view.totalMinor)}, ${view.count} ${copy.categories}. ` +
              rows
                .slice(0, 5)
                .map((row) => `${row.label} ${fmt(row.valueMinor)} (${formatPercent(row.sharePct, locale)})`)
                .join(", ") +
              (rows.length > 5 ? ", …" : ".");
        const onKeys = (event: ReactKeyboardEvent<HTMLDivElement>) => {
          const keys: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
          const current = focusIndex ?? tabStop;
          let next: number | null = null;
          if (event.key in keys) next = Math.min(rows.length - 1, Math.max(0, current + keys[event.key]!));
          if (event.key === "Home") next = 0;
          if (event.key === "End") next = rows.length - 1;
          if (next === null) return;
          event.preventDefault();
          event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
        };
        const canFold =
          view.otherCount > 0 || (state.limit === null && state.lastLimit !== null && state.lastLimit < view.count);

        return (
          <>
            {title ? <h3 data-slot="bar-chart-title">{title}</h3> : null}
            {rows.length === 0 ? (
              <p data-slot="bar-chart-empty">{copy.noData}</p>
            ) : (
              <div data-slot="bar-chart-frame" ref={frame} onMouseLeave={() => setHover(null)}>
                <svg
                  data-slot="bar-chart-svg"
                  role="img"
                  aria-labelledby={`${id}-t ${id}-d`}
                  width={width}
                  height={height}
                  viewBox={`0 0 ${width} ${height}`}
                >
                  <title id={`${id}-t`}>{name}</title>
                  <desc id={`${id}-d`}>{describe}</desc>
                  {min < 0 ? <line data-slot="bar-chart-baseline" x1={x(0)} x2={x(0)} y1={0} y2={height} /> : null}
                  {rows.map((row, index) => {
                    const top = index * ROW;
                    const w = x(row.valueMinor) - x(0);
                    return (
                      <g
                        key={row.id}
                        data-slot="bar-chart-row"
                        data-other={row.id === "other" ? "" : undefined}
                        data-active={active === index || drilledIndex === index ? "" : undefined}
                      >
                        <text x={0} y={top + 14} data-slot="bar-chart-label">
                          {truncate(row.label, Math.floor((width - 120) / 7))}
                        </text>
                        <text x={width} y={top + 14} textAnchor="end" data-slot="bar-chart-value">
                          {fmt(row.valueMinor)}
                        </text>
                        <rect data-slot="bar-chart-track" x={0} y={top + 24} width={width} height={BAR} rx={2} />
                        <path data-slot="bar-chart-fill" d={barPath(x(0), top + 24, w, BAR)} />
                      </g>
                    );
                  })}
                </svg>
                {/* Arrow keys bubble up from the bar buttons inside; the container takes no focus itself. */}
                {/* oxlint-disable-next-line jsx-a11y/no-static-element-interactions */}
                <div data-slot="bar-chart-hits" onKeyDown={onKeys}>
                  {rows.map((row, index) => (
                    <BarChartBar
                      key={row.id}
                      value={row.id}
                      aria-label={`${row.label}: ${fmt(row.valueMinor)}, ${formatPercent(row.sharePct, locale)} ${copy.ofTotal}`}
                      tabIndex={index === (focusIndex ?? tabStop) ? 0 : -1}
                      onMouseEnter={() => setHover(index)}
                      onFocus={() => setFocusIndex(index)}
                      onBlur={() => setFocusIndex(null)}
                      style={{ top: index * ROW, height: ROW }}
                    />
                  ))}
                </div>
                {active !== null && rows[active] ? (
                  <div
                    data-slot="bar-chart-tooltip"
                    aria-hidden="true"
                    style={{
                      top: active * ROW + ROW,
                      left: Math.min(Math.max(0, x(rows[active]!.valueMinor) - 80), Math.max(0, width - 180)),
                    }}
                  >
                    <strong>{rows[active]!.label}</strong>
                    <span data-slot="bar-chart-tooltip-value">{fmt(rows[active]!.valueMinor)}</span>
                    <span>
                      {`${formatPercent(rows[active]!.sharePct, locale)} ${copy.ofTotal}`}
                      {rows[active]!.id === "other" ? ` · ${rows[active]!.count} ${copy.categories}` : ""}
                    </span>
                  </div>
                ) : null}
              </div>
            )}
            {canFold ? (
              <BarChartMore>{view.otherCount > 0 ? copy.showAll(view.count) : copy.showFewer}</BarChartMore>
            ) : null}
            {rows.length > 0 ? (
              <details data-slot="bar-chart-table">
                <summary>{copy.table}</summary>
                <div data-slot="bar-chart-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">{copy.category}</th>
                        <th scope="col" data-align="end">
                          {copy.amount}
                        </th>
                        <th scope="col" data-align="end">
                          {copy.share}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id}>
                          <th scope="row">{row.label}</th>
                          <td data-align="end">{fmt(row.valueMinor)}</td>
                          <td data-align="end">{formatPercent(row.sharePct, locale)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th scope="row">{copy.total}</th>
                        <td data-align="end">{fmt(view.totalMinor)}</td>
                        <td data-align="end">{formatPercent(view.totalMinor === 0 ? null : 100, locale)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </details>
            ) : null}
            {state.refusal ? (
              <p data-slot="bar-chart-error" role="alert">
                {say(state.refusal)}
              </p>
            ) : null}
          </>
        );
      }}
    </BarChartRoot>
  );
}

function truncate(text: string, max: number): string {
  if (max < 2) return "";
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text;
}

export { BarChart, BarChartBar, BarChartMore, BarChartRoot, barChart };

export { type BarItem, type BarRow } from "@booki-aui/primitives/bar-chart";
