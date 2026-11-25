import { ReceiptRace } from "./receipt-race";
import { useEffect, useRef, useState } from "react";

import { SegmentedControl, SegmentedControlIndicator, SegmentedControlItem } from "@ui-sdk/react/segmented-control";

import { Section } from "@/components/section";
import { Disclosure } from "@/components/two-readers";
import {
  WITHDRAWN,
  BENCH,
  RUNS,
  TASKS,
  billed,
  cheapModel,
  cheaperThanOpus,
  modelName,
  realFor,
  realSides,
  type RealSide,
  fairCost,
  formatters,
  priceLine,
  screenshotsFor,
  sideName,
  sidesFor,
  versus,
  type BenchSide,
  type BenchTask,
} from "@/lib/bench";
import { useLang } from "@/lib/lang";
import { RealRuns } from "./real-runs";
import { REPO_URL } from "./shared";

/**
 * The head-to-head from benchmarks/agent (`pnpm --filter agent-benchmark h2h`):
 * the same task done by a scripted agent that never errs, through Playwright
 * MCP on screens rebuilt from Tripletex and DNB Regnskap, and over the bridge
 * on Booki. Every figure comes from src/data/bench.json.
 */
const COLOR: Record<string, string> = {
  tripletex: "var(--bk-chart-1)",
  dnb: "var(--bk-chart-2)",
  acc: "var(--bk-chart-3)",
};

/** What made each screen hard, from the DOM maps. Shown once that side is done. */
const WHY: Record<string, { en: string; nb: string }> = {
  "voucher:tripletex": {
    en: "It found the debit, VAT and credit pickers and the amount field by their order on the page.",
    nb: "Den fant velgerne for debet, mva og kredit og beløpsfeltet ut fra rekkefølgen på siden.",
  },
  "voucher:dnb": {
    en: "One unnamed editor for every cell, so it found each field by counting columns.",
    nb: "Én navnløs editor for hver celle, så den fant hvert felt ved å telle kolonner.",
  },
  "supplier-invoice:tripletex": {
    en: "The supplier and account pickers are named “[object Object]”, so it picked them by position.",
    nb: "Velgerne for leverandør og konto heter «[object Object]», så den valgte dem etter plassering.",
  },
  "sales-invoice:tripletex": {
    en: "The customer picker is “[object Object] (Velg kunde)” and line inputs have no names, so it counted.",
    nb: "Kundevelgeren heter «[object Object] (Velg kunde)», og linjefeltene har ingen navn, så den telte.",
  },
  "dashboard:tripletex": {
    en: "The monthly figures are only in a tooltip, so it hovered every bar, switched year for last December, and read each tooltip.",
    nb: "Månedstallene står bare i et verktøytips, så den holdt pekeren over hver søyle, byttet år for desember i fjor og leste hvert verktøytips.",
  },
  "dashboard:dnb": {
    en: "Canvas bars, and the tooltip never names the month, so it moved the pointer bar by bar and kept count.",
    nb: "Søylene er tegnet på canvas, og verktøytipset sier aldri hvilken måned det er, så den flyttet pekeren søyle for søyle og telte.",
  },
  "dashboard:acc": {
    en: "One snapshot: every month, the overdue buckets and the KPIs as numbers. No pixels.",
    nb: "Ett øyeblikksbilde: hver måned, forfalte poster per aldersgruppe og nøkkeltallene som tall. Ingen piksler.",
  },
  "voucher:acc": {
    en: "One snapshot, then one act of named steps. Your rule posted it.",
    nb: "Ett øyeblikksbilde, så ett act med navngitte steg. Regelen deres bokførte det.",
  },
  "supplier-invoice:acc": {
    en: "One snapshot, then one act of named steps.",
    nb: "Ett øyeblikksbilde, så ett act med navngitte steg.",
  },
  "sales-invoice:acc": {
    en: "One snapshot, then one act of named steps.",
    nb: "Ett øyeblikksbilde, så ett act med navngitte steg.",
  },
};

const DURATION = 2600;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Progress in model requests, 0 → max. The chart loads finished: it only
 * runs when the visitor asks (Replay, or another task), never on scroll.
 * Reduced motion jumps straight to the end.
 */
function useProgress(max: number, replay: string) {
  // The share of the run that has played; at rest it is all of it.
  const [played, setPlayed] = useState(1);
  // A new key starts the run over, before the next paint.
  const [asked, setAsked] = useState(replay);
  if (asked !== replay) {
    setAsked(replay);
    setPlayed(reducedMotion() ? 1 : 0);
  }
  // The key it loaded with: matching it means nobody asked yet (safe under StrictMode's double effects).
  const initial = useRef<string | null>(replay);
  useEffect(() => {
    if (replay === initial.current) return;
    initial.current = null;
    if (reducedMotion()) return;
    let frame = 0;
    const began = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - began) / DURATION));
      setPlayed(p);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [replay]);
  return max * (1 - (1 - played) ** 2);
}

/** Billed input after `t` requests (linear between requests, flat once that side is done). */
const at = (values: number[], t: number) => {
  if (t <= 0) return 0;
  const i = Math.min(Math.floor(t), values.length);
  const done = values[i - 1] ?? 0;
  if (i >= values.length) return values[values.length - 1]!;
  return done + ((values[i] ?? done) - done) * (t - i);
};

function Figures({ task, t, max }: { task: BenchTask; t: number; max: number }) {
  const { t: tr } = useLang();
  const opusRaw = realFor(task, "anthropic/", "tripletex");
  const opusAcc = realFor(task, "anthropic/", "acc");
  if (opusRaw && opusAcc) {
    return (
      <div className="grid gap-3">
        <h4 className="m-0 text-sm font-semibold">{tr("Measured model results", "Målte modellresultater")}</h4>
        <RealFigures task={task} raw={opusRaw} acc={opusAcc} />
      </div>
    );
  }
  return (
    <div className="grid gap-3">
      <h4 className="m-0 text-sm font-semibold">{tr("Scripted estimates", "Anslag fra skriptede kjøringer")}</h4>
      {WITHDRAWN.includes(task) && (
        <p className="m-0 max-w-[68ch] text-sm text-muted-foreground">
          {tr(
            "A Booki format hint revealed the answer for this task, so we withdrew the model results. The scripted run starts with the answer on each screen.",
            "Et formathint i Booki røpet svaret på denne oppgaven, så vi trakk tilbake modellresultatene. Skriptet starter med svaret på hvert skjermbilde.",
          )}
        </p>
      )}
      <EstimateFigures task={task} t={t} max={max} />
    </div>
  );
}

/** The four figures from real runs: Claude Opus 5.5 on each screen, and the cheap model's success. */
function RealFigures({ task, raw, acc }: { task: BenchTask; raw: RealSide; acc: RealSide }) {
  const { lang, t: tr } = useLang();
  const { usd, seconds } = formatters(lang);
  const rawName = raw.name.split(" · ")[0];
  const cheap = cheapModel(task);
  const cheapRaw = cheap ? realSides(task, cheap).filter((side) => side.key !== "acc") : [];
  const cheapAcc = cheap ? realFor(task, cheap, "acc") : undefined;
  const ratio = raw.costUsd && acc.costUsd ? raw.costUsd / acc.costUsd : null;
  const one = (n: number) =>
    n.toLocaleString(lang === "nb" ? "nb-NO" : "en-US", {
      maximumFractionDigits: 1,
    });
  return (
    <dl className="site-figures site-figures--tight site-figures--four">
      <div>
        <dt className="site-figures__figure tabular-nums">{ratio ? `${one(ratio)}×` : "—"}</dt>
        <dd className="m-0 grid gap-1">
          <span className="font-medium">{tr("cheaper per task, measured", "billigere per oppgave, målt")}</span>
          <span className="text-sm text-muted-foreground">
            {tr(
              `${usd(acc.costUsd ?? 0, 3)} against ${usd(raw.costUsd ?? 0, 3)} on ${rawName}, Claude Opus 5.5, median of ${acc.runs} runs, billed at list price.`,
              `${usd(acc.costUsd ?? 0, 3)} mot ${usd(raw.costUsd ?? 0, 3)} på ${rawName}, Claude Opus 5.5, median av ${acc.runs} kjøringer, fakturert til listepris.`,
            )}
          </span>
        </dd>
      </div>
      <div>
        <dt className="site-figures__figure tabular-nums">
          <span className="site-figures__from">{raw.toolCalls}</span>
          <span className="site-figures__to"> → </span>
          {acc.toolCalls}
        </dt>
        <dd className="m-0 grid gap-1">
          <span className="font-medium">{tr("tool calls", "verktøykall")}</span>
          <span className="text-sm text-muted-foreground">
            {tr(
              `${raw.requests} model turns against ${acc.requests}, by the same model on the same task.`,
              `${raw.requests} modellturer mot ${acc.requests}, samme modell på samme oppgave.`,
            )}
          </span>
        </dd>
      </div>
      <div>
        <dt className="site-figures__figure tabular-nums">
          <span className="site-figures__from">{seconds(raw.wallMs)}</span>
          <span className="site-figures__to"> → </span>
          {seconds(acc.wallMs)}
        </dt>
        <dd className="m-0 grid gap-1">
          <span className="font-medium">{tr("start to finish", "fra start til slutt")}</span>
          <span className="text-sm text-muted-foreground">
            {tr("The model's own time included.", "Med modellens egen tid.")}{" "}
            {tr(
              `Right ${raw.succeeded}/${raw.runs} on ${rawName}, ${acc.succeeded}/${acc.runs} on Booki.`,
              `Riktig ${raw.succeeded}/${raw.runs} på ${rawName}, ${acc.succeeded}/${acc.runs} på Booki.`,
            )}
          </span>
        </dd>
      </div>
      {cheap && cheapAcc ? (
        <div>
          <dt className="site-figures__figure tabular-nums">
            {cheapAcc.succeeded}/{cheapAcc.runs}
          </dt>
          <dd className="m-0 grid gap-1">
            <span className="font-medium">{tr("right with a cheap model", "riktig med en billig modell")}</span>
            <span className="text-sm text-muted-foreground">
              {tr(
                `${modelName(cheap)} on Booki, ${cheaperThanOpus(task, cheap) ?? "many"}× cheaper input than Opus, at ${usd(cheapAcc.costUsd ?? 0, 4)} a run. On the rebuilt screens: ${cheapRaw.map((side) => `${side.succeeded}/${side.runs}`).join(" and ")}.`,
                `${modelName(cheap)} på Booki, ${cheaperThanOpus(task, cheap) ?? "mange"}× billigere input enn Opus, til ${usd(cheapAcc.costUsd ?? 0, 4)} per kjøring. På de gjenskapte skjermene: ${cheapRaw.map((side) => `${side.succeeded}/${side.runs}`).join(" og ")}.`,
              )}
            </span>
          </dd>
        </div>
      ) : null}
    </dl>
  );
}

/** The scripted best case, as estimates, for a task with no real runs yet. */
function EstimateFigures({ task, t, max }: { task: BenchTask; t: number; max: number }) {
  const { lang, t: tr } = useLang();
  const { int, usd, seconds } = formatters(lang);
  const { raw, acc } = versus(task);
  const done = t >= max;
  const ratio = Math.round(billed(raw) / billed(acc));
  const shown = done ? ratio : Math.max(1, Math.round((at(raw.billedInput, t) || 1) / (at(acc.billedInput, t) || 1)));
  const perRun = (side: BenchSide) => fairCost(side) * RUNS;
  const saved = perRun(raw) - perRun(acc);
  const what = TASKS.find((item) => item.id === task)!.plural[lang];
  const rawName = raw.name.split(" · ")[0];
  return (
    <dl className="site-figures site-figures--tight site-figures--four">
      <div>
        <dt className="site-figures__figure tabular-nums">{shown}×</dt>
        <dd className="m-0 grid gap-1">
          <span className="font-medium">
            {tr(`less input billed than on ${rawName}`, `mindre fakturert input enn på ${rawName}`)}
          </span>
          <span className="text-sm text-muted-foreground">
            {tr(
              `${int(billed(acc))} against ${int(billed(raw))} tokens. Every model turn re-sends the transcript.`,
              `${int(billed(acc))} mot ${int(billed(raw))} tokens. Hver modelltur sender hele transkripsjonen på nytt.`,
            )}
          </span>
        </dd>
      </div>
      <div>
        <dt className="site-figures__figure tabular-nums">
          <span className="site-figures__from">{raw.calls}</span>
          <span className="site-figures__to"> → </span>
          {acc.calls}
        </dt>
        <dd className="m-0 grid gap-1">
          <span className="font-medium">{tr("tool calls", "verktøykall")}</span>
          <span className="text-sm text-muted-foreground">
            {tr(
              `${raw.requests} model turns against ${acc.requests}.`,
              `${raw.requests} modellturer mot ${acc.requests}.`,
            )}{" "}
            {task === "dashboard"
              ? tr(
                  "Figures that only show on hover mean one pointer move per bar.",
                  "Tall som bare vises når pekeren er over, betyr én pekerbevegelse per søyle.",
                )
              : tr(
                  "Unnamed pickers mean click, search, pick, check.",
                  "Velgere uten navn betyr klikk, søk, velg, kontroller.",
                )}
          </span>
        </dd>
      </div>
      <div>
        <dt className="site-figures__figure tabular-nums">{usd(saved)}</dt>
        <dd className="m-0 grid gap-1">
          <span className="font-medium">{tr(`saved per ${int(RUNS)} runs`, `spart per ${int(RUNS)} kjøringer`)}</span>
          <span className="text-sm text-muted-foreground">
            {tr(
              `${usd(perRun(raw))} against ${usd(perRun(acc))} for ${int(RUNS)} ${what} at Opus 5.5 prices. Caching on the rebuilt screens, none on Booki: its runs are too short to cache.`,
              `${usd(perRun(raw))} mot ${usd(perRun(acc))} for ${int(RUNS)} ${what} med Opus 5.5-priser. Caching for de gjenskapte skjermbildene, ingen for Booki: kjøringene er for korte til å caches.`,
            )}
          </span>
        </dd>
      </div>
      <div>
        <dt className="site-figures__figure tabular-nums">
          <span className="site-figures__from">{seconds(raw.toolMs)}</span>
          <span className="site-figures__to"> → </span>
          {seconds(acc.toolMs)}
        </dt>
        <dd className="m-0 grid gap-1">
          <span className="font-medium">{tr("in the browser tools", "i nettleserverktøyene")}</span>
          <span className="text-sm text-muted-foreground">
            {tr(
              `Median of ${acc.repeats} runs, tool time only. Each of the ${raw.requests} model turns adds its own wait on top.`,
              `Median av ${acc.repeats} kjøringer, bare verktøytid. Hver av de ${raw.requests} modellturene legger til sin egen ventetid i tillegg.`,
            )}
          </span>
        </dd>
      </div>
    </dl>
  );
}

export function ErpRace() {
  const { lang, t: tr } = useLang();
  const { int, usd, seconds, calls, runDate } = formatters(lang);
  const name = (side: BenchSide) => sideName(side.name, lang);
  const [task, setTask] = useState<BenchTask>("supplier-invoice");

  const sides = sidesFor(task);
  const max = Math.max(...sides.map((side) => side.requests));
  const t = useProgress(max, task);

  return (
    <Section
      id="race-title"
      title={tr(
        "Tested on screens rebuilt from two Norwegian accounting systems",
        "Testet på skjermbilder gjenskapt fra to norske regnskapssystemer",
      )}
      note={tr(
        "Each comparison uses the same task and sample data in Booki and on screens rebuilt from Tripletex or DNB Regnskap.",
        "Hver sammenligning bruker samme oppgave og eksempeldata i Booki og på skjermbilder gjenskapt fra Tripletex eller DNB Regnskap.",
      )}
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
          <p className="site-label" aria-hidden="true">
            {tr("Task", "Oppgave")}
          </p>
          <SegmentedControl
            className="site-segmented"
            aria-label={tr("Task", "Oppgave")}
            value={task}
            onValueChange={(next) => {
              if (next) {
                setTask(next as BenchTask);
              }
            }}
          >
            <SegmentedControlIndicator />
            {TASKS.map((item) => (
              <SegmentedControlItem key={item.id} value={item.id}>
                {item.short[lang]}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
        </div>

        <div className="site-panel grid grid-cols-[minmax(0,1fr)] gap-4">
          <div className="grid gap-2">
            <h3 id="benchmark-method" className="m-0 scroll-mt-6 text-lg font-semibold">
              {tr("Method and receipts", "Metode og kvitteringer")}
            </h3>
            <p className="m-0 max-w-[68ch] text-sm text-muted-foreground">
              {tr(
                "The measured results use actual token counts and provider list prices. The scripted receipts below replay a known sequence of steps and estimate tokens from character counts.",
                "Modellresultatene bruker målte tokenantall og listepriser fra modellleverandørene. Kvitteringene nedenfor viser skriptede steg og anslår tokenantallet ut fra antall tegn.",
              )}{" "}
              <a href={`${REPO_URL}/blob/main/benchmarks/agent/METHOD.md`} className="site-link">
                {tr("Read the benchmark method", "Les hele målemetoden")}
              </a>
            </p>
          </div>
          <div className="site-figures-compact race-figures">
            <Figures task={task} t={t} max={max} />
          </div>

          <ReceiptRace task={task} />

          <Disclosure title={tr("Show run details", "Vis detaljer om kjøringene")} className="site-disclosure--ink">
            <div className="grid gap-6 pt-2">
              <ul className="site-rows site-rows--ink">
                {sides
                  .map((side) => ({ side, color: COLOR[side.key] ?? "var(--bk-chart-1)", done: true }))
                  .map(({ side, color, done }) => (
                    <li key={side.key} className="grid gap-1 md:grid-cols-[16rem_minmax(0,1fr)] md:gap-6">
                      <span className="text-sm">{name(side)}</span>
                      <span
                        className="site-outcome text-sm"
                        data-tone={done ? "series" : undefined}
                        style={{ "--series": color } as React.CSSProperties}
                      >
                        {done
                          ? tr(
                              `${calls(side.calls)}, ${side.requests} model turns. ${WHY[`${task}:${side.key}`]?.en ?? ""}`,
                              `${calls(side.calls)}, ${side.requests} modellturer. ${WHY[`${task}:${side.key}`]?.nb ?? ""}`,
                            )
                          : tr("Agent working…", "Agenten jobber …")}
                      </span>
                    </li>
                  ))}
              </ul>

              {screenshotsFor(task).length > 0 ? (
                <div className="site-shot-note text-sm">
                  <p className="m-0 font-medium">{tr("Why not a screenshot?", "Hvorfor ikke en skjermdump?")}</p>
                  <ul className="m-0 grid list-none gap-1 p-0">
                    {screenshotsFor(task).map((shot) => (
                      <li key={shot.key}>
                        {tr(
                          `${shot.name.split(" · ")[0]}: ${calls(shot.calls)}, ${int(billed(shot))} tokens billed (${int(shot.imageTokens)} of them image), ${usd(fairCost(shot), 3)}. Cheaper than hovering, but bar heights only give round numbers: it could not answer exactly, so it does not count as done.`,
                          `${shot.name.split(" · ")[0]}: ${calls(shot.calls)}, ${int(billed(shot))} fakturerte tokens (${int(shot.imageTokens)} av dem bilde), ${usd(fairCost(shot), 3)}. Billigere enn å holde pekeren over hver søyle, men søylehøyder gir bare runde tall: den kunne ikke svare eksakt, så den teller ikke som ferdig.`,
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <RealRuns task={task} />

              <div className="overflow-x-auto">
                <table className="site-race__table">
                  <thead>
                    <tr>
                      <th scope="col">{tr("Per run", "Per kjøring")}</th>
                      {sides.map((side) => (
                        <th key={side.key} scope="col">
                          {side.name.split(" · ")[0]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        [tr("Tool calls", "Verktøykall"), (side) => int(side.calls)],
                        [tr("Model turns", "Modellturer"), (side) => int(side.requests)],
                        [
                          tr("Tool definitions, tokens", "Verktøydefinisjoner, tokens"),
                          (side) => int(side.toolDefinitions),
                        ],
                        [tr("Transcript, tokens", "Transkripsjon, tokens"), (side) => int(side.transcript)],
                        [tr("Input billed, tokens", "Fakturert input, tokens"), (side) => int(billed(side))],
                        [tr("Output, tokens (at least)", "Output, tokens (minst)"), (side) => int(side.output)],
                        [tr("Cost, no caching", "Kostnad, uten caching"), (side) => usd(side.costUsd.noCache, 4)],
                        [tr("Cost, with caching", "Kostnad, med caching"), (side) => usd(side.costUsd.withCache, 4)],
                        [
                          tr(
                            `Cost of ${int(RUNS)} runs, as compared`,
                            `Kostnad for ${int(RUNS)} kjøringer, slik vi sammenligner`,
                          ),
                          (side) => usd(fairCost(side) * RUNS),
                        ],
                        [tr("Tool time, median", "Verktøytid, median"), (side) => seconds(side.toolMs)],
                        [
                          tr("Result checked", "Resultat kontrollert"),
                          (side) => (side.ok ? tr("Correct", "Riktig") : tr("Wrong", "Feil")),
                        ],
                      ] as [string, (side: BenchSide) => string][]
                    ).map(([label, cell]) => (
                      <tr key={label}>
                        <th scope="row">{label}</th>
                        {sides.map((side) => (
                          <td key={side.key}>{cell(side)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <dl className="site-bench-meta" aria-label={tr("Benchmark details", "Detaljer om målingen")}>
                {(
                  [
                    [tr("Run", "Kjøring"), `Claude Code · ${runDate}`],
                    ["Agent", tr("Scripted steps with the answer supplied", "Skriptede steg med svaret oppgitt")],
                    [tr("Task", "Oppgave"), BENCH.tasks[task as keyof typeof BENCH.tasks] ?? task],
                    [
                      tr("Browser tools", "Nettleserverktøy"),
                      `Playwright MCP ${BENCH.versions.playwrightMcp} · Chrome ${BENCH.versions.chrome.split(".")[0]}`,
                    ],
                    ["Booki", tr("Booki agent bridge", "Booki-agentbroen")],
                    [
                      "Tokens",
                      tr(
                        "Characters ÷ 4. Input billed = every turn re-sends the transcript",
                        "Tegn ÷ 4. Fakturert input = hver tur sender hele transkripsjonen på nytt",
                      ),
                    ],
                    [tr("Prices", "Priser"), priceLine(lang)],
                    [
                      tr("Speed", "Fart"),
                      tr(
                        `Tool time, median of ${sides[0]?.repeats ?? 3} runs. No model time`,
                        `Verktøytid, median av ${sides[0]?.repeats ?? 3} kjøringer. Ingen modelltid`,
                      ),
                    ],
                    [tr("Rerun", "Kjør på nytt"), "pnpm --filter agent-benchmark h2h"],
                  ] as [string, string][]
                ).map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </Disclosure>
        </div>
      </div>
    </Section>
  );
}
