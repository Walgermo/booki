import type { CSSProperties } from "react";

/**
 * A small drawing above each hero figure, of what the figure claims. One
 * language for all four: what the same task took on a screen without Booki is
 * faint, what it took with Booki is ink. Each is drawn to the measured ratio,
 * never to a rounder one. Decoration only: the figure and its label carry the
 * meaning for a screen reader.
 */

/** Tool calls: one box per call, one of them filled. */
export function CallsMark({ before, after }: { before: number; after: number }) {
  const count = Math.max(2, Math.round(before / after));
  return (
    <span className="kpi-mark kpi-mark--calls" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <i key={i} data-on={i === 0 ? "" : undefined} style={{ "--i": i } as CSSProperties} />
      ))}
    </span>
  );
}

/** Tokens: a long strip of token chips, a sliver of it read, with both counts at its ends. */
export function TokensMark({
  before,
  after,
  format,
}: {
  before: number;
  after: number;
  format: (n: number) => string;
}) {
  return (
    <span className="kpi-mark kpi-mark--tokens" aria-hidden="true">
      <span className="kpi-mark__strip">
        <span className="kpi-mark__read" style={{ "--share": `${(after / before) * 100}%` } as CSSProperties} />
      </span>
      <span className="kpi-mark__ends">
        <b>{format(after)}</b>
        <span>{format(before)}</span>
      </span>
    </span>
  );
}

/** Faster: a stopwatch whose dial is the old time; the new time is the filled wedge. */
export function TimeMark({ ratio }: { ratio: number }) {
  const [cx, cy, r] = [16, 18, 8.5];
  const angle = (2 * Math.PI) / ratio;
  const x = cx + r * Math.sin(angle);
  const y = cy - r * Math.cos(angle);
  const wedge = `M${cx} ${cy} L${cx} ${cy - r} A${r} ${r} 0 ${angle > Math.PI ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`;
  return (
    <span className="kpi-mark kpi-mark--time" aria-hidden="true">
      <svg viewBox="0 0 32 32" width="32" height="32">
        <rect x="13.5" y="0.5" width="5" height="3" rx="1" className="kpi-mark__crown" />
        <circle cx={cx} cy={cy} r="12" className="kpi-mark__dial" />
        <path d={wedge} className="kpi-mark__lap" />
      </svg>
    </span>
  );
}

/** Cheaper: the coins the same task cost without Booki, one of them spent with it. */
export function CostMark({ ratio }: { ratio: number }) {
  const count = Math.max(2, Math.round(ratio));
  return (
    <span className="kpi-mark kpi-mark--cost" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <i key={i} data-on={i === 0 ? "" : undefined} style={{ "--i": i } as CSSProperties} />
      ))}
    </span>
  );
}
