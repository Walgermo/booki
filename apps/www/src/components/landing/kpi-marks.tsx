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

/** Faster: one race on two lanes, labelled; with Booki the run finishes at 1/ratio of the way. */
export function TimeMark({ ratio, without, withBooki }: { ratio: number; without: string; withBooki: string }) {
  return (
    <span className="kpi-mark kpi-mark--time" aria-hidden="true">
      <span className="kpi-mark__who">{without}</span>
      <span className="kpi-mark__lane">
        <span className="kpi-mark__run" style={{ "--share": "100%" } as CSSProperties} />
      </span>
      <span className="kpi-mark__who" data-on="">
        {withBooki}
      </span>
      <span className="kpi-mark__lane">
        <span className="kpi-mark__run" data-on="" style={{ "--share": `${100 / ratio}%` } as CSSProperties} />
      </span>
    </span>
  );
}

/** One coin, drawn with its edge, at the bottom y of its rim. */
function Coin({ x, y, on }: { x: number; y: number; on?: boolean }) {
  return (
    <g className={on ? "kpi-mark__spent" : "kpi-mark__coin"}>
      <path d={`M${x - 9} ${y - 2} v2 a9 2.6 0 0 0 18 0 v-2`} />
      <ellipse cx={x} cy={y - 2} rx="9" ry="2.6" />
    </g>
  );
}

/** Cheaper: the stack of coins the task cost without Booki, and the one coin it cost with it. */
export function CostMark({ ratio }: { ratio: number }) {
  const count = Math.max(2, Math.round(ratio));
  return (
    <span className="kpi-mark kpi-mark--cost" aria-hidden="true">
      <svg viewBox="0 0 60 34" width="60" height="34">
        {Array.from({ length: count }, (_, i) => (
          <Coin key={i} x={16} y={31 - i * 2.1} />
        ))}
        <Coin x={44} y={31} on />
      </svg>
    </span>
  );
}
