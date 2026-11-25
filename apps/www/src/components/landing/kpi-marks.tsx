import type { CSSProperties } from "react";

/**
 * A small drawing under each hero figure, of what the figure claims. One
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

/** Faster: a race, the same task on two lanes; with Booki it finishes at 1/ratio of the way. */
export function TimeMark({ ratio }: { ratio: number }) {
  return (
    <span className="kpi-mark kpi-mark--time" aria-hidden="true">
      <span className="kpi-mark__lane" />
      <span className="kpi-mark__lane">
        <span className="kpi-mark__run" style={{ "--share": `${100 / ratio}%` } as CSSProperties} />
      </span>
    </span>
  );
}

/** Cheaper: a stack of coins the task cost without Booki, and the one coin it cost with it. */
export function CostMark({ ratio }: { ratio: number }) {
  const count = Math.max(2, Math.round(ratio));
  const step = 2.2;
  return (
    <span className="kpi-mark kpi-mark--cost" aria-hidden="true">
      <svg viewBox="0 0 64 34" width="64" height="34">
        {Array.from({ length: count }, (_, i) => (
          <ellipse key={i} cx="20" cy={30 - i * step} rx="10" ry="3" className="kpi-mark__coin" />
        ))}
        <ellipse cx="48" cy="30" rx="10" ry="3" className="kpi-mark__spent" />
      </svg>
    </span>
  );
}
