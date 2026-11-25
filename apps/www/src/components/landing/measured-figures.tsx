import { proofKpis } from "@/lib/bench";
import { useLang } from "@/lib/lang";
import { CallsMark, CostMark, TimeMark, TokensMark } from "./kpi-marks";

/**
 * The four measured figures, each a median over the same runs and pairs, with
 * its mark: on the home page under the hook, and in the launch post. The ranges
 * are in the strip below the demo.
 */
export function MeasuredFigures({ className = "landing-hero__stats" }: { className?: string }) {
  const { lang, t } = useLang();
  const kpi = proofKpis();
  const number = (n: number) =>
    n.toLocaleString(lang === "nb" ? "nb-NO" : "en-US", { maximumFractionDigits: n < 10 ? 1 : 0 });
  const times = (n: number) => `${number(n)}×`;
  // "95 %": how much less of something Booki needed, rounded down so it never says more than was measured.
  const fewer = ({ before, after }: { before: number; after: number }) =>
    `${Math.floor((1 - after / before) * 100)}${t("%", " %")}`;
  const thousands = (n: number) => `${number(n / 1000)}k`;
  return (
    <dl className={className}>
      <div>
        <dt>{fewer(kpi.calls)}</dt>
        <dd>{t("fewer tool calls", "færre verktøykall")}</dd>
        <CallsMark {...kpi.calls} />
      </div>
      <div>
        <dt>{fewer(kpi.tokens)}</dt>
        <dd>{t("fewer tokens", "færre tokens")}</dd>
        <TokensMark {...kpi.tokens} format={thousands} />
      </div>
      <div>
        <dt>{times(kpi.faster.median)}</dt>
        <dd>{t("faster", "raskere")}</dd>
        <TimeMark ratio={kpi.faster.median} without={t("without", "uten")} withBooki={t("with", "med")} />
      </div>
      <div>
        <dt>{times(kpi.cheaper.median)}</dt>
        <dd>{t("cheaper", "billigere")}</dd>
        <CostMark ratio={kpi.cheaper.median} />
      </div>
    </dl>
  );
}
