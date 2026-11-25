import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { formatters, proofKpis, USD_NOK } from "@/lib/bench";
import { useLang } from "@/lib/lang";

/** ms for one figure to travel from before to after, and between figures. */
const TRAVEL = 900;
const STAGGER = 150;
/** Strong ease-out: quick to move, long to settle (emil-animations). */
const ease = (t: number) => 1 - Math.pow(1 - t, 4);

type Figure = {
  key: string;
  label: string;
  before: number;
  after: number;
  /** Bar length as a share of the track, for a value. */
  share: (value: number) => number;
  show: (value: number) => string;
  beforeText: string;
  note: string;
};

/**
 * Three figures from the real-model runs, each told as a move: the same task
 * before (screens rebuilt from Tripletex) and with Booki. The before bar stands
 * still; Booki's bar starts at the same length and travels to its result while
 * the number counts with it, one figure after the other. It plays once, when
 * the strip comes into view; with reduced motion it shows the result at once.
 */
const REDUCED = "(prefers-reduced-motion: reduce)";
const watchMotion = (notify: () => void) => {
  const query = window.matchMedia(REDUCED);
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
};

export function ProofStrip() {
  const { lang, t } = useLang();
  const f = formatters(lang);
  const kpi = proofKpis();
  const root = useRef<HTMLDivElement>(null);
  const [travelled, setProgress] = useState<number[]>([0, 0, 0]);
  // Reduced motion: the result, no travel. The build's HTML is rendered as if motion were fine.
  const reduced = useSyncExternalStore(
    watchMotion,
    () => window.matchMedia(REDUCED).matches,
    () => false,
  );
  const progress = reduced ? [1, 1, 1] : travelled;

  const pct = (share: number) => `${Math.round(share * 100)} %`;
  const times = (n: number) => `${n.toLocaleString(lang === "nb" ? "nb-NO" : "en-US", { maximumFractionDigits: 1 })}×`;
  const short = (n: number) =>
    n.toLocaleString(lang === "nb" ? "nb-NO" : "en-US", { maximumFractionDigits: n < 10 ? 1 : 0 });
  const range = (s: { low: number; high: number }) => `${short(s.low)}–${short(s.high)}×`;
  const right = { before: kpi.right.rebuilt / kpi.right.rebuiltRuns, after: kpi.right.booki / kpi.right.bookiRuns };

  const figures: Figure[] = [
    {
      key: "right",
      label: t("Right", "Riktig"),
      before: right.before,
      after: right.after,
      share: (v) => v,
      show: pct,
      beforeText: pct(right.before),
      note: t(
        `all ${kpi.models} models, ${kpi.right.booki}/${kpi.right.bookiRuns} runs`,
        `alle ${kpi.models} modellene, ${kpi.right.booki}/${kpi.right.bookiRuns} kjøringer`,
      ),
    },
    {
      key: "cost",
      label: t("Cost per task", "Kostnad per oppgave"),
      before: kpi.cost.before,
      after: kpi.cost.after,
      share: (v) => v / kpi.cost.before,
      show: (v) => f.usd(v, 3),
      beforeText: f.usd(kpi.cost.before, 3),
      note: t(
        `median ${times(kpi.cheaper.median)} cheaper, ${range(kpi.cheaper)} over ${kpi.pairs} pairs of model and screen`,
        `median ${times(kpi.cheaper.median)} billigere, ${range(kpi.cheaper)} over ${kpi.pairs} par av modell og skjerm`,
      ),
    },
    {
      key: "time",
      label: t("Start to finish", "Fra start til slutt"),
      before: kpi.wallMs.before,
      after: kpi.wallMs.after,
      share: (v) => v / kpi.wallMs.before,
      show: (v) => f.seconds(v),
      beforeText: f.seconds(kpi.wallMs.before),
      note: t(
        `median ${times(kpi.faster.median)} faster, ${range(kpi.faster)}, the model's own time included`,
        `median ${times(kpi.faster.median)} raskere, ${range(kpi.faster)}, med modellens egen tid`,
      ),
    },
  ];

  // Play once when it comes into view.
  useEffect(() => {
    const node = root.current;
    if (!node || reduced) return;
    let frame = 0;
    const seen = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        seen.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const next = [0, 1, 2].map((i) => ease(Math.min(1, Math.max(0, (now - start - i * STAGGER) / TRAVEL))));
          setProgress(next);
          if (next[2]! < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    seen.observe(node);
    return () => {
      seen.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [reduced]);

  return (
    <div ref={root} className="grid gap-6">
      <dl className="site-figures site-proof m-0">
        {figures.map((figure, i) => {
          const p = progress[i] ?? 0;
          const value = figure.before + (figure.after - figure.before) * p;
          return (
            <div key={figure.key} data-done={p >= 1 ? "" : undefined}>
              <dt className="site-proof__label">{figure.label}</dt>
              <dd className="m-0 grid gap-3">
                {/* The figure's text is the result, so a reader or a screen reader never sees a passing value. */}
                <span className="site-figures__figure tabular-nums" aria-hidden="true">
                  {figure.show(value)}
                </span>
                <span className="sr-only">
                  {figure.beforeText} → {figure.show(figure.after)}
                </span>
                <span className="site-proof__bars" aria-hidden="true">
                  <span className="site-proof__row">
                    <span className="site-proof__name">{t("Before", "Før")}</span>
                    <span className="site-proof__track">
                      <span
                        className="site-proof__bar"
                        data-before=""
                        style={{ transform: `scaleX(${figure.share(figure.before)})` }}
                      />
                    </span>
                    <span className="site-proof__value tabular-nums">{figure.beforeText}</span>
                  </span>
                  <span className="site-proof__row">
                    <span className="site-proof__name">Booki</span>
                    <span className="site-proof__track">
                      <span className="site-proof__bar" style={{ transform: `scaleX(${figure.share(value)})` }} />
                    </span>
                    <span className="site-proof__value tabular-nums">{figure.show(figure.after)}</span>
                  </span>
                </span>
                <span className="site-proof__note">{figure.note}</span>
              </dd>
            </div>
          );
        })}
      </dl>
      {/* What the figures were measured on, one quiet click away; native details, so the text stays in the page. */}
      <details className="site-proof-about">
        <summary>{t("About the measurements", "Om målingene")}</summary>
        <p>
          {t(
            `Before: screens rebuilt from two Norwegian accounting systems. With Booki: the same tasks, a supplier invoice and a dashboard. Claude Opus, Sonnet and Haiku 5.5 and DeepSeek V4.1 Flash, five runs each, medians, ${f.runDate}. The voucher and sales invoice runs are withdrawn: a control's hint gave their answer away.`,
            `Før: skjermbilder gjenskapt fra to norske regnskapssystemer. Med Booki: de samme oppgavene, en leverandørfaktura og et dashbord. Claude Opus, Sonnet og Haiku 5.5 og DeepSeek V4.1 Flash, fem kjøringer hver, medianer, ${f.runDate}. Kjøringene for bilag og salgsfaktura er trukket tilbake: et hint i kontrollen røpet svaret. Kostnad i NOK etter Norges Banks kurs ${String(USD_NOK.rate).replace(".", ",")}.`,
          )}{" "}
          <a href="#race-title" className="site-link">
            {t("How it was measured", "Slik ble det målt")}
          </a>
        </p>
      </details>
    </div>
  );
}
