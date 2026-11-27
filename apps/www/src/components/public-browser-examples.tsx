import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { BookiMark } from "@/components/booki-logo";
import { Button } from "@/components/ui/button";
import summary from "@/data/public-browser-summary.json";
import modelReceiptUrl from "@/data/public-browser-models.json?url";
import receiptUrl from "@/data/public-browser-pairs.json?url";
import originals from "@/data/public-browser.json";
import { useLang } from "@/lib/lang";
import { runPublicArm } from "@/lib/public-browser-run";

const tasks = {
  nav: {
    name: "Nav",
    en: "Find the processing times for an unemployment benefits application and for an appeal.",
    nb: "Finn behandlingstiden for en dagpengesøknad og for en klage hos Nav klageinstans.",
  },
  posten: {
    name: "Posten",
    en: "Find the domestic Christmas deadlines for a small parcel within one region and across regions.",
    nb: "Finn julefristene for Norgespakke liten innen én region og mellom Nord- og Sør-Norge.",
  },
  brreg: {
    name: "Brønnøysundregistrene",
    en: "Find the annual filing deadline and maximum late fee.",
    nb: "Finn innsendingsfristen for årsregnskap og høyeste forsinkelsesgebyr.",
  },
} as const;

type Task = keyof typeof tasks;
const taskIds = Object.keys(tasks) as Task[];
const sides = ["booki", "browser"] as const;
type Side = (typeof sides)[number];
type Result = "waiting" | "running" | "passed" | "failed";
const initial: Record<Side, Result> = { booki: "waiting", browser: "waiting" };

type ToolCall = { tool: string; input: unknown; output: string };
type CallPair = { id: string; arms: { side: string; calls: ToolCall[] }[] };

function CallDetails({ task }: { task: Task }) {
  const { t } = useLang();
  const [receipt, setReceipt] = useState<CallPair>();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(receiptUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as { pairs: CallPair[] };
        if (!controller.signal.aborted) setReceipt(data.pairs.find((pair) => pair.id === task));
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [task]);
  if (!receipt)
    return (
      <p role="status">
        {failed
          ? t(
              "Could not load the calls. Close and reopen to retry.",
              "Kunne ikke laste kallene. Lukk og åpne for å prøve igjen.",
            )
          : t("Loading calls…", "Laster verktøykall …")}
      </p>
    );
  return (
    <>
      {sides.map((side) => (
        <div key={side} className="grid min-w-0 gap-1">
          <strong>{side === "booki" ? "Booki" : "Playwright MCP"}</strong>
          {receipt.arms
            .find((arm) => arm.side === side)
            ?.calls.map((call, i) => (
              <CallOutput key={i} call={call} index={i} />
            ))}
        </div>
      ))}
    </>
  );
}

function CallOutput({ call, index }: { call: ToolCall; index: number }) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer py-1 font-mono text-xs">
        {index + 1}. {call.tool}
      </summary>
      {open && (
        <pre className="m-0 max-h-80 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs [overflow-wrap:anywhere]">
          {JSON.stringify(call.input)}
          {"\n\n"}
          {call.output}
        </pre>
      )}
    </details>
  );
}

function ModelRun({ task }: { task: Task }) {
  const { lang, t } = useLang();
  const pair = summary.models.find((p) => p.id === task)!;
  const arms = sides.map((side) => pair.arms.find((arm) => arm.side === side)!);
  const number = new Intl.NumberFormat(lang === "nb" ? "nb-NO" : "en-US");
  const rows = [
    [
      t("Destination and both answers", "Riktig side og begge svar"),
      ...arms.map((a) => (a.passed ? t("Passed", "Bestått") : t("Failed", "Feilet"))),
    ],
    [t("Tool calls", "Verktøykall"), ...arms.map((a) => number.format(a.toolCalls))],
  ];
  const sessionRows = [
    [t("Total input tokens", "Inputtokens totalt"), ...arms.map((a) => number.format(a.usage.input_tokens))],
    [t("Cached input", "Bufret input"), ...arms.map((a) => number.format(a.usage.cached_input_tokens))],
    [
      t("Uncached input", "Ubufret input"),
      ...arms.map((a) => number.format(a.usage.input_tokens - a.usage.cached_input_tokens)),
    ],
    [t("Output tokens", "Outputtokens"), ...arms.map((a) => number.format(a.usage.output_tokens))],
  ];
  return (
    <div className="grid min-w-0 gap-2">
      <table className="w-full text-left text-sm tabular-nums">
        <caption className="pb-2 text-left text-lg font-semibold">
          {t("Measured with GPT-6.2 Sol", "Målt med GPT-6.2 Sol")}
        </caption>
        <thead>
          <tr>
            <th scope="col">{t("One run per side", "Én kjøring per side")}</th>
            <th scope="col">Booki</th>
            <th scope="col">{t("Browser", "Nettleser")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, booki, browser]) => (
            <tr className="border-t border-border" key={label}>
              <th scope="row" className="py-1 font-normal">
                {label}
              </th>
              <td>{booki}</td>
              <td>{browser}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="m-0 text-sm text-muted-foreground">
        {t(
          "The model chose its own steps. We checked both reported values against the source and verified the final page state.",
          "Modellen valgte stegene selv. Vi sjekket begge svarene mot originalkilden og kontrollerte hvilken side modellen endte på.",
        )}
      </p>
      <details>
        <summary className="cursor-pointer">
          {t("Token usage for both Codex sessions", "Tokenbruk i de to Codex-øktene")}
        </summary>
        <p className="my-2 text-sm text-muted-foreground">
          {t(
            "One session per version. Codex counts the instructions, tool definitions and conversation history sent with each model request. Cached input is included in the total. The scripted receipts above count only tool replies, in bytes.",
            "Én økt per utgave. Codex teller instruksjoner, verktøybeskrivelser og samtalehistorikk som sendes ved hvert modellkall. Bufret input inngår i totalen. Kvitteringene over viser størrelsen på selve verktøysvarene fra skriptet, i byte.",
          )}
        </p>
        <table className="w-full text-left text-sm tabular-nums">
          <caption className="sr-only">{t("Full-session token counts", "Tokentall for hele økten")}</caption>
          <thead>
            <tr>
              <th scope="col">{t("Token count", "Antall tokens")}</th>
              <th scope="col">Booki</th>
              <th scope="col">{t("Browser", "Nettleser")}</th>
            </tr>
          </thead>
          <tbody>
            {sessionRows.map(([label, booki, browser]) => (
              <tr className="border-t border-border" key={label}>
                <th scope="row" className="py-1 font-normal">
                  {label}
                </th>
                <td>{booki}</td>
                <td>{browser}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <details>
        <summary className="cursor-pointer">
          {t("See the task and model answers", "Se oppgaven og modellsvarene")}
        </summary>
        <div className="grid gap-2 pt-2 text-sm">
          <p className="m-0" lang="en">
            {pair.prompt}
          </p>
          {arms.map((arm) => (
            <p key={arm.side} className="m-0">
              <strong>{arm.side === "booki" ? "Booki" : t("Browser", "Nettleser")}</strong>
              {" · "}
              {arm.answer}
            </p>
          ))}
          <a href={modelReceiptUrl} download="public-browser-models.json" className="site-link justify-self-start">
            {t("Download model runs (JSON)", "Last ned modellkjøringene (JSON)")}
          </a>
        </div>
      </details>
    </div>
  );
}

function Comparison({ task }: { task: Task }) {
  const { lang, t } = useLang();
  const [run, setRun] = useState(0);
  const [showCalls, setShowCalls] = useState(false);
  const [results, setResults] = useState(initial);
  const [steps, setSteps] = useState<Record<Side, string[]>>({ browser: [], booki: [] });
  const frames = useRef<Partial<Record<Side, HTMLIFrameElement | null>>>({});
  const pair = summary.scripts.find((item) => item.id === task)!;
  const original = originals.runs.find((item) => item.id === task)!;
  const details = tasks[task];
  const facts = original.facts;
  const answer =
    task === "nav"
      ? t(
          `Application: ${facts.applicationWeeks} weeks. Appeal: ${facts.complaintAppealBodyMonths} months.`,
          `Søknad: ${facts.applicationWeeks} uker. Klage hos Nav klageinstans: ${facts.complaintAppealBodyMonths} måneder.`,
        )
      : task === "posten"
        ? t(
            `Within one region: ${facts.domesticSmallSameRegionDecemberDay} December. Across regions: ${facts.domesticSmallAcrossRegionsDecemberDay} December.`,
            `Innen én region: ${facts.domesticSmallSameRegionDecemberDay}. desember. Mellom regionene: ${facts.domesticSmallAcrossRegionsDecemberDay}. desember.`,
          )
        : t(
            `Filing deadline: ${facts.filingJulyDay} July. Maximum late fee: NOK ${facts.maxLateFeeNok?.toLocaleString("en-US")}.`,
            `Frist: ${facts.filingJulyDay}. juli. Høyeste gebyr: ${facts.maxLateFeeNok?.toLocaleString("nb-NO")} kr.`,
          );
  const busy = sides.some((side) => results[side] === "running");
  const done = sides.every((side) => results[side] === "passed");

  useEffect(() => {
    if (run === 0) return;
    const controller = new AbortController();
    const { signal } = controller;
    for (const side of sides) {
      const frame = frames.current[side]!;
      const finish = (ok: boolean) => {
        if (!signal.aborted) setResults((previous) => ({ ...previous, [side]: ok ? "passed" : "failed" }));
      };
      runPublicArm(frame, task, side, signal, (label) => {
        if (!signal.aborted) setSteps((previous) => ({ ...previous, [side]: [...previous[side], label] }));
      }).then(finish, () => finish(false));
    }
    return () => controller.abort();
  }, [task, run]);

  function start() {
    setResults({ booki: "running", browser: "running" });
    setSteps({ browser: [], booki: [] });
    setRun((value) => value + 1);
  }

  return (
    <div className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="receipt-race__intro">
          <h3>{details.name}</h3>
          <p>{t(details.en, details.nb)}</p>
        </div>
        <Button onClick={start} disabled={busy}>
          {busy
            ? t("Running…", "Kjører …")
            : run
              ? t("Run again", "Kjør på nytt")
              : t("Run comparison", "Kjør sammenligning")}
        </Button>
      </div>
      <div className="receipt-race">
        {sides.map((side) => {
          const arm = pair.arms.find((item) => item.side === side)!;
          const bytes = arm.replyBytes;
          const title = side === "booki" ? t("Booki bridge", "Booki-agentbro") : t("Browser", "Nettleser");
          const frameTitle = `${details.name} · ${title}`;
          return (
            <div
              className="receipt min-w-0"
              key={side}
              data-bk-theme="light"
              data-ours={side === "booki" ? "" : undefined}
            >
              <p className="receipt__head">
                <b className="receipt__brand">
                  {side === "booki" && <BookiMark size={21} />}
                  {title}
                </b>
                <span>
                  {t("Scripted run", "Skriptet kjøring")} · {summary.observedOn}
                </span>
              </p>
              <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-2 gap-y-1">
                <dt>{t("Actions", "Handlinger")}</dt>
                <dd className="m-0 tabular-nums">{arm.actions}</dd>
                <dt>{t("Tool calls", "Verktøykall")}</dt>
                <dd className="m-0 tabular-nums">{arm.toolCalls}</dd>
                <dt>{t("Reply size", "Svarstørrelse")}</dt>
                <dd className="m-0 tabular-nums">{bytes.toLocaleString(lang === "nb" ? "nb-NO" : "en-US")} B</dd>
              </dl>
              <p className="m-0">{arm.passed ? answer : t("Result check failed", "Resultatkontrollen feilet")}</p>
              <a
                className="site-link mt-auto self-start"
                href={arm.path}
                aria-label={t(`Open test page · ${frameTitle}`, `Åpne testsiden · ${frameTitle}`)}
              >
                {t("Open test page", "Åpne testsiden")}
              </a>
              {run > 0 && (
                <div className="grid gap-2" key={run}>
                  {/* The driver operates these first-party fixtures through their same-origin bridge. */}
                  {/* oxlint-disable-next-line react/iframe-missing-sandbox */}
                  <iframe
                    className="w-full rounded border border-border"
                    height={220}
                    title={frameTitle}
                    ref={(frame) => {
                      frames.current[side] = frame;
                    }}
                    src={arm.path}
                  />
                  <p className="m-0" lang="nb">
                    {steps[side].join(" → ")}
                  </p>
                  <strong>
                    {results[side] === "passed"
                      ? t("Result verified", "Resultat bekreftet")
                      : results[side] === "failed"
                        ? t("Result check failed", "Resultatkontrollen feilet")
                        : t("Running…", "Kjører …")}
                  </strong>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div role="status" className="empty:hidden">
        {busy
          ? t("Running both test pages…", "Kjører begge testsidene …")
          : done
            ? t("Both reached the same result.", "Begge nådde samme resultat.")
            : run > 0
              ? t(
                  "The comparison could not be verified. Run it again to retry.",
                  "Sammenligningen kunne ikke bekreftes. Kjør på nytt for å prøve igjen.",
                )
              : ""}
      </div>
      <details className="min-w-0" onToggle={(e) => setShowCalls(e.currentTarget.open)}>
        <summary className="cursor-pointer">
          {t("See the calls and original route", "Se verktøykallene og ruten på originalnettstedet")}
        </summary>
        <div className="grid gap-3 pt-3 text-sm">
          <p className="m-0">
            <a href={original.url} className="site-link">
              {details.name} · {original.heading}
            </a>
            {" — "}
            <span lang="nb">{original.steps.map((step) => step.label).join(" → ")}</span>.
          </p>
          <div>
            <strong>{t("Captured page states", "Lagrede sidetilstander")}</strong>
            <ul className="mt-1 list-disc pl-5">
              {pair.pages.map((page) => (
                <li key={page.state}>
                  {
                    (
                      {
                        homeConsent: t("Home with cookie choices", "Forside med samtykkevalg"),
                        home: t("Home", "Forside"),
                        guidance: t("Guidance page", "Veiledningsside"),
                        guidanceExpanded: t("Guidance with the panel open", "Veiledningsside med åpent panel"),
                      } as Record<string, string>
                    )[page.state]
                  }{" "}
                  · {page.elements.toLocaleString(lang === "nb" ? "nb-NO" : "en-US")}{" "}
                  {t("DOM elements retained", "bevarte DOM-elementer")} · {page.visibleText}{" "}
                  {t("visible text nodes", "synlige tekstnoder")} · {page.controls} {t("controls", "kontroller")}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-muted-foreground">
              {t(
                "The local pages preserve the document structure, visible content and collapsed sections. Scripts, styling and decorative SVG artwork were excluded. The replay covers the recorded transitions on this route.",
                "De lokale sidene bevarer dokumentstrukturen, synlig innhold og lukkede seksjoner. Skript, stilark og dekorativ SVG-grafikk er utelatt. Avspillingen følger de innspilte overgangene på denne ruten.",
              )}
            </p>
          </div>
          {showCalls && <CallDetails task={task} />}
          <p className="m-0 text-muted-foreground">
            {t(
              "Reply size is the UTF-8 byte length of the recorded tool responses. These runs used a script and incurred no model token charges.",
              "Svarstørrelsen er antall byte i de lagrede verktøysvarene, målt som UTF-8. Kjøringene brukte et skript og medførte ingen kostnad for modelltokens.",
            )}
          </p>
          <a href={receiptUrl} download="public-browser-pairs.json" className="site-link justify-self-start">
            {t("Download calls and checks (JSON)", "Last ned kall og kontroller (JSON)")}
          </a>
        </div>
      </details>
      <ModelRun task={task} />
    </div>
  );
}

export function PublicBrowserExamples() {
  const { t } = useLang();
  const { hash } = useLocation();
  const [task, setTask] = useState<Task>("nav");
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    if (hash === "#public-browser") section.current?.scrollIntoView();
  }, [hash]);

  return (
    <section
      id="public-browser"
      ref={section}
      className="site-panel grid min-w-0 scroll-mt-24 gap-4"
      aria-labelledby="public-browser-title"
    >
      <h2 id="public-browser-title" className="m-0 text-xl font-semibold tracking-tight">
        {t("Three Norwegian websites, with and without Booki", "Tre norske nettsteder, med og uten Booki")}
      </h2>
      <p className="m-0 max-w-[65ch] text-muted-foreground">
        {t(
          "Both versions use the same captured pages, including navigation, tables, forms and footers. The browser reads the accessibility tree. Booki exposes the document sections and named controls on its agent bridge. Replay the recorded route or inspect the two independent model runs.",
          "Begge utgavene bruker de samme lagrede sidene, med navigasjon, tabeller, skjemaer og bunntekst. Nettleserverktøyet leser tilgjengelighetstreet. Booki tilbyr dokumentets seksjoner og navngitte kontroller gjennom agentbroen. Spill av ruten eller se hva modellen svarte i hver utgave.",
        )}
      </p>
      <fieldset className="m-0 flex min-w-0 flex-wrap gap-1 border-0 p-0">
        <legend className="sr-only">{t("Choose a website", "Velg nettsted")}</legend>
        {taskIds.map((id) => (
          <Button
            size="sm"
            variant={id === task ? "primary" : "outline"}
            aria-pressed={id === task}
            key={id}
            onClick={() => setTask(id)}
          >
            {tasks[id].name}
          </Button>
        ))}
      </fieldset>
      <Comparison key={task} task={task} />
    </section>
  );
}
