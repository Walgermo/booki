import { localToday } from "@booki-aui/core/financial-date";
import { type AgingBucket, type OpenItem, type OpenItemKind } from "@booki-aui/core/aging";
import { formatMoney, money } from "@booki-aui/core/money";
import { createParts } from "@ui-sdk/react/primitive";
import { useEffect, useId, useRef, useState } from "react";
import { formatPercent, observeWidth, seriesColor, wholeAbove } from "./chart-math.js";
import { useBookiLocaleOptional } from "./locale.js";
import { useSay } from "./say.js";
import { type Details, DEFAULT_TOP, report, derive, agingChart } from "@booki-aui/primitives/aging-chart";

const parts = createParts(agingChart, { root: "div", bucket: "button", clear: "button" });
const AgingChartRoot = parts.Root;
const AgingChartBucket = parts.Bucket;
const AgingChartClear = parts.Clear;

const COPY = {
  EN: {
    receivable: "Receivables by age",
    payable: "Payables by age",
    notDue: "Not due",
    days: "days",
    over: "Over",
    total: "Total",
    overdue: "Overdue",
    ofTotal: "of the total",
    table: "Show as table",
    bucket: "Age",
    amount: "Amount",
    share: "Share",
    party: "Party",
    clear: "Show all buckets",
    inBucket: "In",
    noDate: "Pick a date to age the open items.",
    nothingOpen: "Nothing is open.",
    top: "Most overdue",
    parties: "parties",
  },
  NO: {
    receivable: "Kundefordringer etter alder",
    payable: "Leverandørgjeld etter alder",
    notDue: "Ikke forfalt",
    days: "dager",
    over: "Over",
    total: "Sum",
    overdue: "Forfalt",
    ofTotal: "av totalen",
    table: "Vis som tabell",
    bucket: "Alder",
    amount: "Beløp",
    share: "Andel",
    party: "Part",
    clear: "Vis alle aldersgrupper",
    inBucket: "I",
    noDate: "Velg en dato for å aldersfordele de åpne postene.",
    nothingOpen: "Ingen åpne poster.",
    top: "Mest forfalt",
    parties: "parter",
  },
} as const;

export type AgingChartProps = {
  items: OpenItem[];
  kind?: OpenItemKind;
  asOf?: string;
  /** Defaults to today in UTC when neither `asOf` nor this is given. */
  defaultAsOf?: string;
  limits?: number[];
  drill?: string | null;
  defaultDrill?: string | null;
  /** A bucket was drilled into, by a person's click or an agent's `drill`. */
  onDrill?: (bucket: string, details: Details) => void;
  /** Parties drawn as rows and listed as most overdue. Defaults to 5. */
  topParties?: number;
  snapshotRows?: number;
  title?: string;
  className?: string;
  "aria-label"?: string;
};

type RootState = { kind: OpenItemKind; asOf: string; drill: string | null; refusal: string };

const TOTAL_BAR = 28;
const ROW = 40;
const THIN = 8;

/**
 * Composed aging chart: one tall stacked bar of everything open, a legend
 * whose buckets drill in, thin stacked bars for the largest parties, a
 * tooltip on hover and the same figures as a table.
 */
function AgingChart({
  items,
  kind = "receivable",
  asOf,
  defaultAsOf,
  limits,
  drill,
  defaultDrill,
  onDrill,
  topParties = DEFAULT_TOP,
  snapshotRows,
  title,
  className,
  "aria-label": ariaLabel,
}: AgingChartProps) {
  const { country, profile } = useBookiLocaleOptional();
  const say = useSay();
  const copy = COPY[country === "NO" ? "NO" : "EN"];
  const locale = profile.locale;
  const fmt = (minor: number) => formatMoney(money(minor, profile.currency), { locale });
  const name = title ?? ariaLabel ?? copy[kind];
  const today = asOf === undefined && defaultAsOf === undefined ? localToday() : defaultAsOf;
  const bucketName = (bucket: AgingBucket) =>
    bucket.fromDays === undefined
      ? copy.notDue
      : bucket.toDays === undefined
        ? `${copy.over} ${bucket.fromDays - 1} ${copy.days}`
        : `${bucket.fromDays}–${bucket.toDays} ${copy.days}`;
  const id = useId();
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  const [hover, setHover] = useState<{ row: number; bucket: number } | null>(null);
  useEffect(() => observeWidth(frame.current, setWidth), []);

  return (
    <AgingChartRoot
      items={items}
      kind={kind}
      asOf={asOf}
      defaultAsOf={today}
      limits={limits}
      drill={drill}
      defaultDrill={defaultDrill}
      onDrillChange={(bucket: string | null, details: Details) => {
        if (bucket !== null) onDrill?.(bucket, details);
      }}
      topParties={topParties}
      snapshotRows={snapshotRows}
      className={className}
      aria-label={name}
    >
      {(state: RootState) => {
        const view = derive(
          { items, kind: state.kind, limits, topParties, snapshotRows: Number.MAX_SAFE_INTEGER },
          state.asOf,
          state.drill,
        );
        const { aged } = report({ items, kind: state.kind, limits }, state.asOf);
        const rows = aged
          ? [...aged.rows].sort((a, b) => b.totalMinor - a.totalMinor).slice(0, wholeAbove(topParties, DEFAULT_TOP))
          : [];
        // Credits are not drawn: a stack only holds what is owed.
        const positive = (amounts: number[]) => amounts.reduce((sum, amount) => sum + Math.max(0, amount), 0);
        const segments = (amounts: number[], y: number, height: number, row: number) => {
          const sum = positive(amounts);
          let x = 0;
          return amounts.map((amount, index) => {
            if (amount <= 0 || sum === 0) return null;
            const w = (amount / sum) * width;
            const start = x;
            x += w;
            const gap = x < width - 0.5 ? 2 : 0;
            return (
              <rect
                key={index}
                data-slot="aging-chart-segment"
                data-active={hover?.row === row && hover.bucket === index ? "" : undefined}
                x={start}
                y={y}
                width={Math.max(0, w - gap)}
                height={height}
                rx={height >= 20 ? 4 : height / 2}
                style={{ fill: seriesColor(index) }}
                onMouseEnter={() => setHover({ row, bucket: index })}
              />
            );
          });
        };
        const height = TOTAL_BAR + (rows.length > 0 ? 16 + rows.length * ROW : 0);
        const describe =
          `${copy.total} ${fmt(view.totalMinor)}; ${copy.overdue} ${fmt(view.overdueMinor)} (${formatPercent(view.overdueSharePct, locale)}). ` +
          view.buckets
            .map(
              (bucket) =>
                `${bucketName(bucket)} ${fmt(bucket.amountMinor)} (${formatPercent(bucket.sharePct, locale)})`,
            )
            .join(", ") +
          ".";
        const tip = (() => {
          if (!hover) return null;
          const bucket = view.buckets[hover.bucket];
          if (!bucket) return null;
          if (hover.row < 0)
            return {
              title: bucketName(bucket),
              value: bucket.amountMinor,
              note: `${formatPercent(bucket.sharePct, locale)} ${copy.ofTotal}`,
              top: TOTAL_BAR + 6,
            };
          const row = rows[hover.row];
          if (!row) return null;
          return {
            title: `${row.partyName} · ${bucketName(bucket)}`,
            value: row.amountsMinor[hover.bucket] ?? 0,
            note: `${copy.total} ${fmt(row.totalMinor)}`,
            top: TOTAL_BAR + 16 + hover.row * ROW + ROW,
          };
        })();
        const drilledBucket = view.drilled
          ? view.buckets.find((bucket) => bucket.id === view.drilled!.bucket)
          : undefined;

        return (
          <>
            {title ? <h3 data-slot="aging-chart-title">{title}</h3> : null}
            {state.asOf === "" ? (
              <p data-slot="aging-chart-empty">{copy.noDate}</p>
            ) : view.issues.length > 0 ? (
              <p data-slot="aging-chart-error" role="alert">
                {say(view.issues[0]!)}
              </p>
            ) : (
              <>
                <p data-slot="aging-chart-summary">
                  <span>{copy.total}</span> <strong data-slot="aging-chart-figure">{fmt(view.totalMinor)}</strong>
                  <span> · {copy.overdue}</span>{" "}
                  <strong data-slot="aging-chart-figure">{fmt(view.overdueMinor)}</strong>
                  <span data-slot="aging-chart-share"> ({formatPercent(view.overdueSharePct, locale)})</span>
                </p>
                <ul data-slot="aging-chart-legend">
                  {view.buckets.map((bucket, index) => (
                    <li key={bucket.id}>
                      <AgingChartBucket
                        value={bucket.id}
                        aria-label={`${bucketName(bucket)}: ${fmt(bucket.amountMinor)}, ${formatPercent(bucket.sharePct, locale)} ${copy.ofTotal}`}
                        onMouseEnter={() => setHover({ row: -1, bucket: index })}
                        onMouseLeave={() => setHover(null)}
                      >
                        <span
                          data-slot="aging-chart-key"
                          aria-hidden="true"
                          style={{ background: seriesColor(index) }}
                        />
                        <span data-slot="aging-chart-bucket-name">{bucketName(bucket)}</span>
                        <span data-slot="aging-chart-figure">{fmt(bucket.amountMinor)}</span>
                      </AgingChartBucket>
                    </li>
                  ))}
                </ul>
                {view.totalMinor === 0 && rows.length === 0 ? (
                  <p data-slot="aging-chart-empty">{copy.nothingOpen}</p>
                ) : (
                  <div data-slot="aging-chart-frame" ref={frame} onMouseLeave={() => setHover(null)}>
                    <svg
                      data-slot="aging-chart-svg"
                      role="img"
                      aria-labelledby={`${id}-t ${id}-d`}
                      width={width}
                      height={height}
                      viewBox={`0 0 ${width} ${height}`}
                    >
                      <title id={`${id}-t`}>{`${name} · ${state.asOf}`}</title>
                      <desc id={`${id}-d`}>{describe}</desc>
                      <g data-slot="aging-chart-total">
                        {segments(
                          view.buckets.map((bucket) => bucket.amountMinor),
                          0,
                          TOTAL_BAR,
                          -1,
                        )}
                      </g>
                      {rows.map((row, index) => {
                        const top = TOTAL_BAR + 16 + index * ROW;
                        return (
                          <g key={row.partyId} data-slot="aging-chart-row">
                            <text x={0} y={top + 14} data-slot="aging-chart-label">
                              {truncate(row.partyName, Math.floor((width - 110) / 7))}
                            </text>
                            <text x={width} y={top + 14} textAnchor="end" data-slot="aging-chart-value">
                              {fmt(row.totalMinor)}
                            </text>
                            <rect
                              data-slot="aging-chart-track"
                              x={0}
                              y={top + 22}
                              width={width}
                              height={THIN}
                              rx={THIN / 2}
                            />
                            {segments(row.amountsMinor, top + 22, THIN, index)}
                          </g>
                        );
                      })}
                    </svg>
                    {tip ? (
                      <div data-slot="aging-chart-tooltip" aria-hidden="true" style={{ top: tip.top, left: 0 }}>
                        <strong>{tip.title}</strong>
                        <span data-slot="aging-chart-figure">{fmt(tip.value)}</span>
                        <span>{tip.note}</span>
                      </div>
                    ) : null}
                  </div>
                )}

                {view.drilled && drilledBucket ? (
                  <section data-slot="aging-chart-drilled" aria-label={`${copy.inBucket} ${bucketName(drilledBucket)}`}>
                    <div data-slot="aging-chart-heading">
                      <h4>{`${bucketName(drilledBucket)} · ${fmt(drilledBucket.amountMinor)}`}</h4>
                      <AgingChartClear>{copy.clear}</AgingChartClear>
                    </div>
                    <ul data-slot="aging-chart-parties">
                      {view.drilled.parties.map((party) => (
                        <li key={party.partyId}>
                          <span>{party.partyName}</span>
                          <span data-slot="aging-chart-figure">{fmt(party.amountMinor)}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                <details data-slot="aging-chart-table">
                  <summary>{copy.table}</summary>
                  <div data-slot="aging-chart-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">{copy.bucket}</th>
                          <th scope="col" data-align="end">
                            {copy.amount}
                          </th>
                          <th scope="col" data-align="end">
                            {copy.share}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {view.buckets.map((bucket) => (
                          <tr key={bucket.id}>
                            <th scope="row">{bucketName(bucket)}</th>
                            <td data-align="end">{fmt(bucket.amountMinor)}</td>
                            <td data-align="end">{formatPercent(bucket.sharePct, locale)}</td>
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
              </>
            )}
            {state.refusal ? (
              <p data-slot="aging-chart-error" role="alert">
                {say(state.refusal)}
              </p>
            ) : null}
          </>
        );
      }}
    </AgingChartRoot>
  );
}

function truncate(text: string, max: number): string {
  if (max < 2) return "";
  return text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text;
}

export { AgingChart, AgingChartBucket, AgingChartClear, AgingChartRoot, agingChart };

export { type AgingBucketTotal, type AgingChartDrilled } from "@booki-aui/primitives/aging-chart";
