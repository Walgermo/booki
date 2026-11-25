import { formatters, proofKpis, USD_NOK } from "@/lib/bench";
import { useLang } from "@/lib/lang";

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

export function ProofStrip() {
  const { lang, t } = useLang();
  const f = formatters(lang);
  const kpi = proofKpis();
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

  return (
    <section aria-labelledby="benchmark-summary" className="grid gap-6">
      <h2 id="benchmark-summary" className="sr-only">
        {t("Benchmark results", "Måleresultater")}
      </h2>
      <dl className="site-figures site-proof m-0">
        {figures.map((figure) => (
          <div key={figure.key} data-done="">
            <dt className="site-proof__label">{figure.label}</dt>
            <dd className="m-0 grid gap-3">
              <span className="site-figures__figure tabular-nums" aria-hidden="true">
                {figure.show(figure.after)}
              </span>
              <span className="sr-only">
                {t("Rebuilt screens", "Gjenskapte skjermbilder")} {figure.beforeText}. Booki {figure.show(figure.after)}
                .
              </span>
              <span className="site-proof__bars" aria-hidden="true">
                <span className="site-proof__row">
                  <span className="site-proof__name">{t("Rebuilt", "Gjenskapt")}</span>
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
                    <span className="site-proof__bar" style={{ transform: `scaleX(${figure.share(figure.after)})` }} />
                  </span>
                  <span className="site-proof__value tabular-nums">{figure.show(figure.after)}</span>
                </span>
              </span>
              <span className="site-proof__note">{figure.note}</span>
            </dd>
          </div>
        ))}
      </dl>
      <details className="site-proof-about">
        <summary>{t("About the measurements", "Om målingene")}</summary>
        <p>
          {t(
            "We asked the models to read a dashboard or enter a supplier invoice. They used the same sample data in Booki and on screens rebuilt from Tripletex and DNB Regnskap.",
            "Vi ba modellene lese et dashbord eller registrere en leverandørfaktura. De brukte de samme eksempeldataene i Booki og på gjenskapte skjermbilder fra Tripletex og DNB Regnskap.",
          )}
        </p>
        <p>
          {t(
            `We ran Claude Opus, Sonnet and Haiku 5.5 and DeepSeek V4.1 Flash five times per model, task and screen on ${f.runDate}. We withdrew the voucher and sales invoice results after we found that a control hint revealed the answers.`,
            `Vi kjørte Claude Opus, Sonnet og Haiku 5.5 og DeepSeek V4.1 Flash fem ganger per modell, oppgave og skjermbilde den ${f.runDate}. Vi trakk tilbake resultatene for bilag og salgsfaktura fordi et hint i kontrollen røpet svarene. Kostnad i NOK etter Norges Banks kurs ${String(USD_NOK.rate).replace(".", ",")}.`,
          )}
        </p>
        <p>
          <a href="#benchmark-method" className="site-link">
            {t("See the method and run receipts", "Se metoden og kvitteringene fra kjøringene")}
          </a>
        </p>
      </details>
    </section>
  );
}
