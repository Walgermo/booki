/**
 * Pure helpers shared by the chart controls: periods, scales, ticks and the
 * summaries an agent reads. No React, no DOM (apart from `observeWidth`,
 * which only wraps ResizeObserver).
 */

export type ChartRange = "6m" | "12m" | "ytd" | "all";
export const CHART_RANGES: readonly ChartRange[] = ["6m", "12m", "ytd", "all"];

/** A value at a period, both as an agent reads them. */
export type PeriodValue = { period: string; valueMinor: number };

/** A month written YYYY-MM. */
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isPeriod(value: unknown): value is string {
  return typeof value === "string" && PERIOD.test(value);
}

/** Months since year 0: `2026-03` is 2026 * 12 + 2. */
export function monthIndex(period: string): number {
  return Number(period.slice(0, 4)) * 12 + Number(period.slice(5, 7)) - 1;
}

export function periodAt(index: number): string {
  const year = Math.floor(index / 12);
  const month = index - year * 12 + 1;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

export function isChartRange(value: unknown): value is ChartRange {
  return typeof value === "string" && (CHART_RANGES as readonly string[]).includes(value);
}

/**
 * The months a range shows, oldest first, ending at `latest`. `6m` and `12m`
 * count back from the latest month, `ytd` starts in January of its year and
 * `all` starts at `earliest`. Never earlier than `earliest`.
 */
export function rangePeriods(range: ChartRange, earliest: string, latest: string): string[] {
  const end = monthIndex(latest);
  const first = monthIndex(earliest);
  const start =
    range === "6m" ? end - 5 : range === "12m" ? end - 11 : range === "ytd" ? Math.floor(end / 12) * 12 : first;
  const periods: string[] = [];
  for (let index = Math.max(start, first); index <= end; index += 1) periods.push(periodAt(index));
  return periods;
}

/**
 * Change in percent from `previous` to `current`, one decimal. Null when there
 * is no previous value or it is zero: a percentage of nothing means nothing.
 * Measured against the size of the previous value, so a loss that shrinks is
 * a rise.
 */
export function percentChange(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined || previous === 0) return null;
  return round1(((current - previous) / Math.abs(previous)) * 100);
}

/** `part` as a percent of `whole`, one decimal; null when the whole is zero. */
export function sharePercent(part: number, whole: number): number | null {
  if (whole === 0) return null;
  return round1((part / whole) * 100);
}

export function round1(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export type Direction = "up" | "down" | "flat";

export function directionOf(delta: number): Direction {
  return delta > 0 ? "up" : delta < 0 ? "down" : "flat";
}

export type SeriesSummary = {
  latest: PeriodValue | null;
  previous: PeriodValue | null;
  changeMinor: number | null;
  changePct: number | null;
  direction: Direction | null;
  min: PeriodValue | null;
  max: PeriodValue | null;
  totalMinor: number;
  count: number;
};

/**
 * Latest, previous, change, extremes and total of the points in a range.
 * `before` is the point just before the range, used as `previous` when the
 * range holds a single point. Ties in min and max go to the earliest period.
 */
export function summarize(points: PeriodValue[], before: PeriodValue | null = null): SeriesSummary {
  const sorted = [...points].sort((a, b) => monthIndex(a.period) - monthIndex(b.period));
  const latest = sorted.at(-1) ?? null;
  const previous = sorted.length > 1 ? sorted.at(-2)! : latest ? before : null;
  let min: PeriodValue | null = null;
  let max: PeriodValue | null = null;
  let totalMinor = 0;
  for (const point of sorted) {
    totalMinor += point.valueMinor;
    if (!min || point.valueMinor < min.valueMinor) min = point;
    if (!max || point.valueMinor > max.valueMinor) max = point;
  }
  const changeMinor = latest && previous ? latest.valueMinor - previous.valueMinor : null;
  return {
    latest,
    previous,
    changeMinor,
    changePct: latest && previous ? percentChange(latest.valueMinor, previous.valueMinor) : null,
    direction: changeMinor === null ? null : directionOf(changeMinor),
    min,
    max,
    totalMinor,
    count: sorted.length,
  };
}

/** A tidy step for an axis: 1, 2, 2.5 or 5 times a power of ten. */
export function niceStep(span: number, count = 4): number {
  if (!(span > 0) || !Number.isFinite(span)) return 1;
  const raw = span / Math.max(1, count);
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return Math.max(1, nice * power);
}

export type Ticks = { min: number; max: number; step: number; ticks: number[] };

/**
 * Axis ticks covering `min`..`max` and always zero, so bars and areas grow
 * from a real baseline. Steps are whole minor units.
 */
export function niceTicks(min: number, max: number, count = 4): Ticks {
  let lo = Math.min(0, min);
  let hi = Math.max(0, max);
  if (lo === hi) hi = lo + 100;
  const step = niceStep(hi - lo, count);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let value = lo; value <= hi + step / 2; value += step) ticks.push(Math.round(value));
  return { min: lo, max: hi, step, ticks };
}

/** Maps a domain onto a range of pixels, linearly. */
export function linearScale([d0, d1]: [number, number], [r0, r1]: [number, number]): (value: number) => number {
  const span = d1 - d0 || 1;
  return (value: number) => r0 + ((value - d0) / span) * (r1 - r0);
}

/**
 * An SVG path through points; a null breaks the line, so a missing month
 * shows as a gap rather than a made-up slope.
 */
export function linePath(points: ({ x: number; y: number } | null)[]): string {
  let path = "";
  let pen = false;
  for (const point of points) {
    if (!point) {
      pen = false;
      continue;
    }
    path += `${pen ? "L" : "M"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`;
    pen = true;
  }
  return path;
}

/**
 * A bar with its data end rounded and its baseline end square, for a bar
 * growing right (or left, when `width` is negative).
 */
export function barPath(x: number, y: number, width: number, height: number, radius = 4): string {
  const w = Math.abs(width);
  const r = Math.max(0, Math.min(radius, w, height / 2));
  if (w === 0) return "";
  if (width >= 0) {
    return `M${x} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + height - r}Q${x + w} ${y + height} ${x + w - r} ${y + height}H${x}Z`;
  }
  const left = x - w;
  return `M${x} ${y}H${left + r}Q${left} ${y} ${left} ${y + r}V${y + height - r}Q${left} ${y + height} ${left + r} ${y + height}H${x}Z`;
}

export type RankedItem = { id: string; label: string; valueMinor: number };
export type RankedRow = RankedItem & { sharePct: number | null; count: number };

/**
 * Items largest first. With a `limit`, the rest fold into one `other` row
 * whose `count` says how many it holds. Shares are of the total of all items.
 */
export function rankWithOther(
  items: RankedItem[],
  limit: number | null,
  otherLabel = "Other",
): { rows: RankedRow[]; totalMinor: number; otherCount: number } {
  const sorted = [...items].sort(
    (a, b) => b.valueMinor - a.valueMinor || a.label.localeCompare(b.label, "en") || (a.id < b.id ? -1 : 1),
  );
  const totalMinor = sorted.reduce((sum, item) => sum + item.valueMinor, 0);
  const keep = limit === null || limit >= sorted.length ? sorted : sorted.slice(0, limit);
  const rest = limit === null || limit >= sorted.length ? [] : sorted.slice(limit);
  const rows: RankedRow[] = keep.map((item) => ({
    ...item,
    sharePct: sharePercent(item.valueMinor, totalMinor),
    count: 1,
  }));
  if (rest.length > 0) {
    const valueMinor = rest.reduce((sum, item) => sum + item.valueMinor, 0);
    rows.push({
      id: "other",
      label: otherLabel,
      valueMinor,
      sharePct: sharePercent(valueMinor, totalMinor),
      count: rest.length,
    });
  }
  return { rows, totalMinor, otherCount: rest.length };
}

export type WaterfallInput = { id: string; label: string; amountMinor: number };
export type WaterfallStep = WaterfallInput & { startMinor: number; endMinor: number; direction: "in" | "out" };

/**
 * Running balance from the opening through each step. `reconciles` says
 * whether opening plus every step lands on the closing balance given.
 */
export function waterfall(openingMinor: number, steps: WaterfallInput[], closingMinor: number) {
  let running = openingMinor;
  let inflowMinor = 0;
  let outflowMinor = 0;
  const rows: WaterfallStep[] = steps.map((step) => {
    const startMinor = running;
    running += step.amountMinor;
    if (step.amountMinor >= 0) inflowMinor += step.amountMinor;
    else outflowMinor += step.amountMinor;
    return { ...step, startMinor, endMinor: running, direction: step.amountMinor >= 0 ? "in" : "out" };
  });
  return {
    steps: rows,
    inflowMinor,
    outflowMinor,
    netMinor: inflowMinor + outflowMinor,
    computedClosingMinor: running,
    differenceMinor: closingMinor - running,
    reconciles: closingMinor === running,
  };
}

/** Pushes labels apart so none sit closer than `gap`, keeping their order. */
export function spreadLabels(ys: number[], gap: number, min: number, max: number): number[] {
  const order = ys.map((y, index) => ({ y, index })).sort((a, b) => a.y - b.y);
  const placed = order.map((item) => item.y);
  for (let i = 1; i < placed.length; i += 1) placed[i] = Math.max(placed[i]!, placed[i - 1]! + gap);
  const overflow = (placed.at(-1) ?? 0) - max;
  if (overflow > 0) for (let i = 0; i < placed.length; i += 1) placed[i] = placed[i]! - overflow;
  for (let i = placed.length - 2; i >= 0; i -= 1) placed[i] = Math.min(placed[i]!, placed[i + 1]! - gap);
  if ((placed[0] ?? min) < min) {
    const shift = min - placed[0]!;
    for (let i = 0; i < placed.length; i += 1) placed[i] = placed[i]! + shift;
  }
  const out = Array.from({ length: ys.length }, () => 0);
  order.forEach((item, i) => {
    out[item.index] = placed[i]!;
  });
  return out;
}

/** Every `k`-th index to label so `count` labels of `labelWidth` fit in `width`. */
export function labelEvery(count: number, width: number, labelWidth: number): number {
  if (count <= 1) return 1;
  const fit = Math.max(1, Math.floor(width / labelWidth));
  return Math.max(1, Math.ceil(count / fit));
}

/** Most points per series an agent's snapshot carries. */
export const DEFAULT_SNAPSHOT_POINTS = 36;

export const wholeAbove = (value: number | undefined, fallback: number) =>
  Number.isSafeInteger(value) && (value as number) > 0 ? (value as number) : fallback;

/** Calls `onWidth` with the element's width now and whenever it changes. */
export function observeWidth(el: Element | null, onWidth: (width: number) => void): () => void {
  if (!el) return () => {};
  const read = () => {
    const width = el.getBoundingClientRect().width;
    if (width > 0) onWidth(Math.round(width));
  };
  read();
  if (typeof ResizeObserver === "undefined") return () => {};
  const observer = new ResizeObserver(read);
  observer.observe(el);
  return () => observer.disconnect();
}

/** A month as a person reads it: `Mar 2026`, or `Mar` with `short`. */
export function periodName(period: string, locale: string, short = false): string {
  if (!isPeriod(period)) return period;
  const date = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)) - 1, 1));
  return new Intl.DateTimeFormat(
    locale,
    short ? { month: "short", timeZone: "UTC" } : { month: "short", year: "numeric", timeZone: "UTC" },
  ).format(date);
}

/** An axis figure: `$12K`, `1,2 mill. kr`. */
export function compactMoney(minor: number, currency: string, locale: string, digits = 2): string {
  const major = minor / 10 ** digits;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(major);
  } catch {
    return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(major);
  }
}

/** A signed percent for people: `+4.2 %` style per locale. */
export function formatPercent(value: number | null, locale: string, signed = false): string {
  if (value === null) return "–";
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
    signDisplay: signed ? "exceptZero" : "auto",
  }).format(value / 100);
}

/** How many series get a hue of their own. More fold into "Other". */
export const SERIES_HUES = 6;

/**
 * The series token for slot `index` (0-based). Six validated hues in a fixed
 * order, never repeated: a seventh series would share a colour with the first
 * and the two could not be told apart, so any slot past the sixth gets the
 * neutral "other" colour. Charts fold extra series into one "Other" series
 * before they get here.
 */
export function seriesColor(index: number): string {
  return index < SERIES_HUES ? `var(--bk-series-${index + 1})` : "var(--bk-series-other)";
}
