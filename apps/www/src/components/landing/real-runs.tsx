import { formatters, modelName, type BenchTask, realOf } from "@/lib/bench";
import { useLang } from "@/lib/lang";

const ORDER = ["tripletex", "dnb", "acc"];

/**
 * The task run by real models through the browser tools on each screen, from
 * `pnpm proof`: how often the result was right, and what it took, end to end
 * with the model's own time included. Shown only for tasks that were run.
 */
export function RealRuns({ task }: { task: BenchTask }) {
  const { lang, t } = useLang();
  const f = formatters(lang);
  // Every model run, also one that missed on Booki.
  const sides = realOf(task);
  // Strongest first: Opus, Sonnet, Haiku, then other providers.
  const rank = (id: string) => ["opus", "sonnet", "haiku"].findIndex((name) => id.includes(name)) >>> 0;
  const models = [...new Set(sides.map((side) => side.model))].sort((a, b) => rank(a) - rank(b));
  if (models.length === 0) return null;
  const screens = ORDER.filter((key) => sides.some((side) => side.key === key));
  const nameOf = (key: string) =>
    key === "acc" ? "Booki" : sides.find((side) => side.key === key)!.name.split(" · ")[0];
  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <p className="site-kicker m-0">{t("With real models", "Med ekte modeller")}</p>
        <p className="m-0 max-w-[68ch] text-sm text-muted-foreground">
          {t(
            "The same task given to a model through the browser tools on each screen, run five times each. Right means the books ended up correct, checked after every run. Time is end to end, the model's own time included; cost is what the gateway billed at list price. Every model we ran is shown. The large models were right on both, so for them Booki saves cost and time; for the cheap ones it is whether the books come out right.",
            "Samme oppgave gitt til en modell gjennom nettleserverktøyene på hver skjerm, fem ganger hver. Riktig betyr at regnskapet ble riktig, sjekket etter hver kjøring. Tiden er fra start til slutt, med modellens egen tid; kostnaden er det gatewayen fakturerte til listepris. Alle modellene vi kjørte er med. De store modellene fikk det riktig på begge, så for dem sparer Booki kostnad og tid; for de billige gjelder det om regnskapet blir riktig.",
          )}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="site-race__table site-real">
          <thead>
            <tr>
              <th scope="col">{t("Model", "Modell")}</th>
              {screens.map((key) => (
                <th key={key} scope="col" data-ours={key === "acc" ? "" : undefined}>
                  {nameOf(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {models.map((model) => (
              <tr key={model}>
                <th scope="row">{modelName(model)}</th>
                {screens.map((key) => {
                  const side = sides.find((item) => item.model === model && item.key === key);
                  if (!side) return <td key={key}>—</td>;
                  return (
                    <td key={key} data-ours={key === "acc" ? "" : undefined}>
                      <span
                        className="site-real__right"
                        data-all={side.succeeded === side.runs ? "" : undefined}
                        data-none={side.succeeded === 0 ? "" : undefined}
                      >
                        {side.succeeded} / {side.runs}
                      </span>
                      <span className="site-real__detail">
                        {t(`${f.int(side.toolCalls)} calls`, `${f.int(side.toolCalls)} kall`)} ·{" "}
                        {f.seconds(side.wallMs)} · {side.costUsd === null ? "—" : f.usd(side.costUsd, 3)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="m-0 text-xs text-ink-muted">
        {t(
          "Medians over five runs, through Vercel AI Gateway, ",
          "Medianer over fem kjøringer, gjennom Vercel AI Gateway, ",
        )}
        {f.runDate}. <code>pnpm proof</code>
      </p>
    </div>
  );
}
