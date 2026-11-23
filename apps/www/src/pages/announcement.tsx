import { Link } from "react-router-dom";

import { getCatalogItem } from "@/catalog";
import { BookiLayers } from "@/components/announcement/booki-layers";
import { CATALOGUE } from "@/components/announcement/catalogue";
import { Closing } from "@/components/landing/closing";
import { REPO_URL } from "@/components/landing/shared";
import { Section } from "@/components/section";
import { CodeDisclosure } from "@/components/two-readers";
import { Button } from "@/components/ui/button";
import {
  formatters,
  modelName,
  priceLine,
  proofKpis,
  realFor,
  realSides,
  TASKS,
  USD_NOK,
  type BenchTask,
} from "@/lib/bench";
import { usePageMeta, useLang, type PageMeta } from "@/lib/lang";

type T = <V>(en: V, nb: V) => V;

const META: PageMeta = {
  title: {
    en: "Announcing agent-first UI with Booki",
    nb: "Vi lanserer agent-first UI med Booki",
  },
  description: {
    en: "Booki is an open-source, agent-first UI library for accounting and auditing: controls an agent operates by name through typed actions, under your rules, with every step in the audit trail and the same rules on your server.",
    nb: "Booki er et åpent, agent-first UI-bibliotek for regnskap og revisjon: kontroller en agent styrer med navn gjennom typede handlinger, under reglene deres, med hvert steg i revisjonssporet og de samme reglene på serveren.",
  },
};

const DROP_IN_URL = `${REPO_URL}/blob/main/docs/drop-in.md`;
const PILOT_URL = `${REPO_URL}/blob/main/docs/pilot.md`;
const CONTRACT_URL = `${REPO_URL}/blob/main/spec/agent-contract.md`;

/** What an agent does on an ordinary accounting screen, and what it costs. */
const TODAY = (t: T) => [
  {
    happens: t(
      "It reads the whole screen again after every click.",
      "Den leser hele skjermbildet på nytt etter hvert klikk.",
    ),
    costs: t("Someone pays for that in tokens and waiting time.", "Noen betaler for det i tokens og ventetid."),
  },
  {
    happens: t("It finds fields by their label and position.", "Den finner feltene ut fra ledetekst og plassering."),
    costs: t(
      "One layout change and the amount lands in the wrong field.",
      "Én endring i oppsettet, og beløpet havner i feil felt.",
    ),
  },
  {
    happens: t("It types decimals into text boxes.", "Den skriver desimaltall i tekstfelt."),
    costs: t("A rounding nobody chose ends up in the ledger.", "En avrunding ingen valgte, havner i regnskapet."),
  },
  {
    happens: t("The audit trail records the signed-in user.", "Revisjonssporet registrerer den innloggede brukeren."),
    costs: t(
      "When the auditor asks who approved, the answer is a person who never saw it.",
      "Når revisor spør hvem som attesterte, er svaret en person som aldri så bilaget.",
    ),
  },
];

/** How a Booki screen works for an agent, in the order a step goes through it. */
const HOW = (t: T) => [
  {
    label: t("Snapshot", "Øyeblikksbilde"),
    text: t(
      "Each control reports typed state: amounts in integer minor units, the balance, what is wrong, and which actions it takes right now.",
      "Hver kontroll oppgir tilstanden sin som strukturerte data: beløp i hele øre, balansen, hva som er feil, og hvilke handlinger den tar akkurat nå.",
    ),
  },
  {
    label: t("Act", "Handling"),
    text: t(
      "Named, typed actions such as setMinor, addLine and proposeCoding. Your rules run inside them, and a refusal comes back as a sentence that lists what is valid.",
      "Navngitte, typede handlinger som setMinor, addLine og proposeCoding. Reglene deres kjører inne i dem, og et avslag kommer tilbake som en setning som lister opp hva som er gyldig.",
    ),
  },
  {
    label: t("The agent's cursor", "Agentens peker"),
    text: t(
      "Before each step a visible pointer glides to the control, rings it and presses, so the person sees what the agent does. It follows reduced motion.",
      "Før hvert steg glir en synlig peker til kontrollen, ringer den inn og trykker, så personen ser hva agenten gjør. Den respekterer innstillingen for redusert bevegelse.",
    ),
  },
  {
    label: t("Propose, allow, commit", "Foreslå, tillat, utfør"),
    text: t(
      "proposeChanges stages a change the person keeps or reverts. A step marked data-agent-confirm, such as posting or paying, runs only when your allow rule says yes, for example under an amount limit.",
      "proposeChanges legger frem en endring personen beholder eller angrer. Et steg merket data-agent-confirm, som bokføring eller betaling, kjører bare når allow-regelen deres sier ja, for eksempel under en beløpsgrense.",
    ),
  },
  {
    label: t("Person-only", "Bare for personer"),
    text: t(
      "Approving, signing off, releasing, finalizing and submitting are a person's buttons. They are never in an agent's actions.",
      "Attestering, signering, frigivelse, ferdigstilling og innsending er forbeholdt en person. De er aldri blant agentens handlinger.",
    ),
  },
  {
    label: t("Secrets", "Hemmeligheter"),
    text: t(
      "Bank account numbers, KID and IBAN read as [redacted] in the snapshot, and change events never carry them.",
      "Kontonummer, KID og IBAN leses som [redacted] i øyeblikksbildet, og endringshendelser tar dem aldri med.",
    ),
  },
  {
    label: t("Attribution", "Hvem gjorde det"),
    text: t(
      "Every change carries its source. attachAudit writes agent:<id> into your audit trail, and a person's click is recorded as that person.",
      "Hver endring har med seg kilden. attachAudit skriver agent:<id> i revisjonssporet, og en persons klikk registreres som den personen.",
    ),
  },
  {
    label: t("The server", "Serveren"),
    text: t(
      "@booki/core/server runs the same rules in your API, with the caller your sign-in established. PERSON_ONLY decisions are refused for an agent whatever its roles, advise returns warnings for judgment calls, roles can differ per engagement, and actorRecord gives the audit line.",
      "@booki/core/server kjører de samme reglene i API-et deres, med avsenderen innloggingen har fastslått. PERSON_ONLY-beslutninger avvises for en agent uansett roller, advise gir advarsler der det er snakk om skjønn, roller kan variere per oppdrag, og actorRecord gir linjen til revisjonssporet.",
    ),
  },
];

const SNAPSHOT = `// agent.snapshot()
{ "ref": "Amount excl. tax", "kind": "amount-field",
  "minor": 312500, "currency": "NOK",
  "actions": ["setMinor", "clear"] }
{ "ref": "Bank account", "value": "[redacted]" }

// agent.act()
{ "ref": "Amount excl. tax", "action": "setMinor", "args": [312500] }
{ "ref": "Voucher lines", "action": "assertPostable" }`;

const CLIENT_EXAMPLE = `import { createBookiAgent, attachAudit, createAgentCursor } from "@booki/react"

const cursor = createAgentCursor()
const agent = createBookiAgent({
  agentId: "bookkeeper",
  // Posting waits for a person unless your rule says yes.
  allow: cursor.wrap(async (step) => !step.confirm || (await underLimit(step))),
})
attachAudit(agent, (event) => api.audit.append(event), "bookkeeper")

await agent.act({
  steps: [
    { ref: "Amount excl. tax", action: "setMinor", args: [312500] },
    { ref: "MVA", action: "setTaxCode", args: ["MVA25"] },
    { ref: "Voucher lines", action: "assertPostable", args: [] },
  ],
})`;

const SERVER_EXAMPLE = `import { guardPostVoucher, toHttp } from "@booki/core/server"

// POST /api/vouchers. Who is calling comes from your sign-in, never from the body.
export async function POST(request: Request) {
  const actor = await session(request) // { id, kind: "person" | "agent", roles }
  const { lines, date } = await request.json()

  const verdict = guardPostVoucher(
    { actor, entity: "nordlys-as", locale: "nb" },
    { lines, date, rules: { periods: await periods(), accounts: await chart() } },
  )
  if (verdict.ok) await books.post(lines, date, verdict.actor) // "agent:bookkeeper" or "nina"

  const { status, body } = toHttp(verdict) // 401, 403, 409 or 422 with the control's own sentence
  return Response.json(body, { status })
}`;

const SHORTFALLS = (t: T) => [
  t(
    "The packages are at 0.1 and not on npm yet. For now you build them from the repository.",
    "Pakkene er på 0.1 og ikke på npm ennå. Foreløpig bygger du dem fra repoet.",
  ),
  t(
    "The agent bridge is pre-1.0, so its API may still change.",
    "Agentbroen er før 1.0, så API-et kan fortsatt endre seg.",
  ),
  t(
    "No production users yet, and one maintainer so far. Everything is MIT and runs in your app; nothing depends on a service.",
    "Ingen brukere i produksjon ennå, og bare én vedlikeholder så langt. Alt er MIT og kjører i appen deres; ingenting avhenger av en tjeneste.",
  ),
  t(
    "Server guards cover posting, approvals, payment release, period close, invoices, VAT and findings. Other writes need guard() with a rule of your own.",
    "Serverkontrollene dekker bokføring, attestering, frigivelse av betalinger, periodeavslutning, fakturaer, mva og funn. Andre skriveoperasjoner trenger guard() med en egen regel.",
  ),
  t(
    "Labels are English and Norwegian. The four starter profiles have English labels and example VAT codes.",
    "Ledetekstene finnes på engelsk og norsk. De fire startprofilene har engelske ledetekster og eksempler på mva-koder.",
  ),
];

const DROP_IN = (t: T) => [
  t(
    "Render Booki controls from Server Components: every file ships as a client module.",
    "Bruk Booki-kontroller fra Server Components: hver fil leveres som en klientmodul.",
  ),
  t(
    "Import the styles in a cascade layer with the shadcn bridge, so your utilities win and your colours apply.",
    "Importer stilene i et cascade layer med shadcn-broen, så deres utilities vinner og deres farger gjelder.",
  ),
  t(
    "Convert decimal text from your database exactly with minorFromDecimal, never through a float.",
    "Gjør om desimaltekst fra databasen eksakt med minorFromDecimal, aldri via flyttall.",
  ),
  t(
    "Give the agent its own credential and run each write route through the server guard.",
    "Gi agenten egen innlogging og la hvert skrivende API-kall gå gjennom serverkontrollen.",
  ),
  t(
    "Start with leaf inputs and read-only views, then workflow controls once you decide which rules warn and which refuse.",
    "Begynn med enkeltfelt og visninger, og ta arbeidsflytkontrollene når dere har bestemt hvilke regler som advarer og hvilke som avviser.",
  ),
];

const PILOT = (t: T) => [
  t(
    "Baseline: measure your current screen with the benchmark in the repository.",
    "Utgangspunkt: mål dagens skjermbilde med benchmarken i repoet.",
  ),
  t(
    "Swap the amount, account, VAT, date, KID and line inputs for Booki controls.",
    "Bytt feltene for beløp, konto, mva, dato, KID og linjer til Booki-kontroller.",
  ),
  t(
    "Run the screen's write route through @booki/core/server.",
    "La skjermbildets skriverute gå gjennom @booki/core/server.",
  ),
  t(
    "Put your policy in allow: what an agent may post alone, and what goes to a person.",
    "Legg policyen i allow: hva en agent kan bokføre alene, og hva som går til en person.",
  ),
  t(
    "Measure again: tool calls, tokens, cost at list price, time, and how often it was right.",
    "Mål igjen: verktøykall, tokens, kostnad til listepris, tid, og hvor ofte den fikk det riktig.",
  ),
];

/** The four screen tasks in the order of payoff the pilot plan uses. */
const TABLE_TASKS: BenchTask[] = ["supplier-invoice", "sales-invoice", "dashboard", "voucher"];

/** A model's right answers on Booki and on the rebuilt screens, over the four screen tasks. */
function rightFor(model: string) {
  const sides = TASKS.flatMap((task) => realSides(task.id, model));
  const count = (list: typeof sides) => ({
    right: list.reduce((n, side) => n + side.succeeded, 0),
    runs: list.reduce((n, side) => n + side.runs, 0),
  });
  return {
    booki: count(sides.filter((side) => side.key === "acc")),
    rebuilt: count(sides.filter((side) => side.key !== "acc")),
  };
}

const CHEAP_MODELS = ["anthropic/claude-haiku-5.5", "deepseek/deepseek-v4.1-flash-1017"];

/**
 * The launch post: the problem, how a Booki screen works for an agent, the
 * layers, the catalogue, the measured results and how to start. Every figure
 * is read from the benchmark's own data (src/data/bench.json).
 */
export function AnnouncementPage() {
  const { lang, t } = useLang();
  usePageMeta(META);
  const f = formatters(lang);
  const kpi = proofKpis();
  const one = (n: number) => n.toLocaleString(lang === "nb" ? "nb-NO" : "en-US", { maximumFractionDigits: 1 });
  const pct = (n: number) => `${Math.round(n * 100)} %`;
  const cheap = CHEAP_MODELS.map((model) => ({ model, ...rightFor(model) }));
  const published = new Date("2026-11-22").toLocaleDateString(lang === "nb" ? "nb-NO" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const figures = [
    {
      figure: `${kpi.right.booki}/${kpi.right.bookiRuns}`,
      text: t("runs right on Booki", "riktige kjøringer på Booki"),
      source: t(
        `All ${kpi.models} models. The same models were right ${kpi.right.rebuilt} of ${kpi.right.rebuiltRuns} times (${pct(kpi.right.rebuilt / kpi.right.rebuiltRuns)}) on screens rebuilt from Tripletex and DNB Regnskap.`,
        `Alle ${kpi.models} modellene. De samme modellene fikk det riktig ${kpi.right.rebuilt} av ${kpi.right.rebuiltRuns} ganger (${pct(kpi.right.rebuilt / kpi.right.rebuiltRuns)}) på skjermbilder gjenskapt fra Tripletex og DNB Regnskap.`,
      ),
    },
    {
      figure: `${one(kpi.cheaper.median)}×`,
      text: t("cheaper per task", "billigere per oppgave"),
      source: t(
        `Median of ${kpi.pairs} pairs of model and screen, ${one(kpi.cheaper.low)}–${one(kpi.cheaper.high)}×.`,
        `Median av ${kpi.pairs} par av modell og skjerm, ${one(kpi.cheaper.low)}–${one(kpi.cheaper.high)}×.`,
      ),
    },
    {
      figure: `${one(kpi.faster.median)}×`,
      text: t("faster, start to finish", "raskere, fra start til slutt"),
      source: t(
        `Median, ${one(kpi.faster.low)}–${one(kpi.faster.high)}×, the model's own time included.`,
        `Median, ${one(kpi.faster.low)}–${one(kpi.faster.high)}×, med modellens egen tid.`,
      ),
    },
  ];

  return (
    <main className="site-post">
      <section className="site-ledger grid gap-y-8 pt-14 pb-14 md:pt-20 md:pb-20">
        <div>
          <p className="site-kicker">
            {t("Announcement", "Lansering")} · <time dateTime="2026-11-22">{published}</time>
          </p>
          <h1 className="landing-hero__title mt-6 mb-0 max-w-[16ch]">
            {/* A no-break hyphen, so "agent-first" never splits over two lines. */}
            {t(META.title.en, META.title.nb).replace("agent-first", "agent‑first")}
          </h1>
          <p className="landing-hero__lede mt-5 mb-0 max-w-[40rem]">
            {t(
              "Booki is an open-source UI library for accounting and auditing. A person uses its controls like any form. An agent operates them by name, through typed actions, under your rules, and every step lands in your audit trail as the agent's.",
              "Booki er et UI-bibliotek med åpen kildekode for regnskap og revisjon. En person bruker kontrollene som et vanlig skjema. En agent styrer dem med navn, gjennom typede handlinger, under reglene deres, og hvert steg havner i revisjonssporet som agentens.",
            )}
          </p>
          <p className="mt-4 mb-0 text-sm text-muted-foreground">
            Stian Walgermo · {t("MIT licence", "MIT-lisens")} · React, Web Components, Vue, Svelte {t("and", "og")}{" "}
            Solid
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg">
              <Link to="/docs">{t("Read the docs", "Les dokumentasjonen")}</Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <a href={REPO_URL} target="_blank" rel="noreferrer">
                {t("View on GitHub", "Se på GitHub")}
              </a>
            </Button>
          </div>
        </div>
      </section>

      <dl className="site-figures">
        {figures.map((item) => (
          <div key={item.text}>
            <dt className="site-figures__figure">{item.figure}</dt>
            <dd className="m-0 grid gap-1">
              <span className="font-medium">{item.text}</span>
              <span className="text-sm text-muted-foreground">{item.source}</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-0 mb-10 max-w-[72ch] text-sm text-muted-foreground">
        {t(
          `Claude Opus, Sonnet and Haiku 5.5 and DeepSeek V4.1 Flash, five runs per screen and model, medians, ${f.runDate}. Cost at list price.`,
          `Claude Opus, Sonnet og Haiku 5.5 og DeepSeek V4.1 Flash, fem kjøringer per skjermbilde og modell, medianer, ${f.runDate}. Kostnad til listepris, i NOK etter Norges Banks kurs ${String(USD_NOK.rate).replace(".", ",")}.`,
        )}{" "}
        <a href="#measured-title" className="site-link">
          {t("How we measured", "Slik målte vi")}
        </a>
      </p>

      <Section
        id="problem-title"
        title={t("Agents are already in the books", "Agentene er allerede i regnskapet")}
        note={t(
          "Today they work by reading pixels and guessing fields.",
          "I dag jobber de ved å lese piksler og gjette felt.",
        )}
      >
        <div className="grid gap-8">
          <div className="site-post__prose">
            <p>
              {t(
                "Agents already work in accounting software. They take a screenshot or read the page as text after every click, guess which unnamed box holds the amount, and type into it. That is slow and expensive. In accounting it is also wrong in ways that matter: an amount in the wrong field, a voucher that does not balance, an approval recorded as whoever happened to be signed in.",
                "Agenter jobber allerede i regnskapsprogrammer. De tar en skjermdump eller leser siden som tekst etter hvert klikk, gjetter hvilket navnløst felt som har beløpet, og skriver i det. Det er tregt og dyrt. I regnskap er det også feil på måter som betyr noe: et beløp i feil felt, et bilag som ikke går i balanse, en attestering registrert på den som tilfeldigvis var logget inn.",
              )}
            </p>
            <p>
              {t(
                "Money, vouchers, bank details and approvals need rules that hold whatever the agent sends. Booki puts those rules in the controls themselves, and again on your server.",
                "Penger, bilag, bankopplysninger og attesteringer trenger regler som holder uansett hva agenten sender. Booki legger reglene i selve kontrollene, og én gang til på serveren deres.",
              )}
            </p>
          </div>
          <dl className="site-rows m-0">
            {TODAY(t).map((row) => (
              <div key={row.happens} className="grid gap-1 md:grid-cols-2 md:gap-8">
                <dt className="font-medium">{row.happens}</dt>
                <dd className="m-0 text-muted-foreground">{row.costs}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Section>

      <Section
        id="how-title"
        title={t("Controls an agent operates by name", "Kontroller en agent styrer med navn")}
        note={t(
          "One control, two readers: the person sees a form on paper, the agent reads a snapshot and calls actions.",
          "Én kontroll, to lesere: personen ser et skjema på papir, agenten leser et øyeblikksbilde og kaller handlinger.",
        )}
      >
        <div className="grid gap-8">
          <div className="site-readers">
            <div className="grid min-w-0 content-start gap-3">
              <p className="site-kicker">{t("The person sees", "Personen ser")}</p>
              <div
                className="site-sheet site-post__form"
                aria-label={t("Example voucher fields", "Eksempel på bilagsfelt")}
              >
                <PostField
                  label={t("Amount excl. tax", "Beløp eks. mva")}
                  value={lang === "nb" ? "3 125,00" : "3,125.00"}
                  agent={t("set by agent", "satt av agent")}
                />
                <PostField label={t("Account", "Konto")} value={t("3000 Sales revenue", "3000 Salgsinntekt")} />
                <PostField label="MVA" value="MVA25 · 25 %" />
                <PostField label={t("Bank account", "Kontonummer")} value="1503 •• •••••" />
              </div>
            </div>
            <div className="site-machine grid min-w-0 content-start gap-4">
              <p className="site-kicker">{t("The agent reads, then acts", "Agenten leser, så handler den")}</p>
              <pre className="site-readers__json">{SNAPSHOT}</pre>
              <span className="site-signal justify-self-start">
                agent:bookkeeper · {t("2 steps done", "2 steg utført")}
              </span>
            </div>
          </div>
          <dl className="site-rows m-0">
            {HOW(t).map((row) => (
              <div key={row.label} className="grid gap-1 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-8">
                <dt className="font-medium">{row.label}</dt>
                <dd className="m-0 max-w-[62ch]">{row.text}</dd>
              </div>
            ))}
          </dl>
          <div className="grid gap-3">
            <CodeDisclosure
              title={t("The agent, its rule and the audit trail", "Agenten, regelen og revisjonssporet")}
              source={CLIENT_EXAMPLE}
            />
            <CodeDisclosure
              title={t("The same rules in an API route", "De samme reglene i en API-rute")}
              source={SERVER_EXAMPLE}
            />
          </div>
        </div>
      </Section>

      <Section
        id="layers-title"
        title={t("Defined once, rendered everywhere", "Definert én gang, vist overalt")}
        note={t(
          "Each control is defined once with no framework. Every framework package is generated from that definition, so one agent operates them all the same way.",
          "Hver kontroll er definert én gang, uten rammeverk. Hver rammeverkpakke genereres fra den definisjonen, så en agent styrer dem likt.",
        )}
      >
        <BookiLayers />
      </Section>

      <Section
        id="catalogue-title"
        title={t("What is in the box", "Hva som følger med")}
        note={t(
          "Controls for the screens agents struggle with most, each with its agent actions listed in the catalogue.",
          "Kontroller for skjermbildene agentene sliter mest med, hver med agenthandlingene sine i katalogen.",
        )}
      >
        <dl className="site-rows m-0">
          {CATALOGUE(t).map((group) => (
            <div key={group.label} className="grid gap-2 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-8">
              <dt className="text-lg font-semibold tracking-[-0.02em]">{group.label}</dt>
              <dd className="m-0 grid gap-2">
                {group.items.length ? (
                  <ul className="site-chips" aria-label={group.label}>
                    {group.items.map((name) =>
                      getCatalogItem(docSlug(name)) ? (
                        <li key={name}>
                          <Link to={`/docs/${docSlug(name)}`} className="site-chip" data-link="">
                            {name}
                          </Link>
                        </li>
                      ) : (
                        <li key={name} className="site-chip">
                          {name}
                        </li>
                      ),
                    )}
                  </ul>
                ) : null}
                <p
                  className={group.items.length ? "m-0 max-w-[62ch] text-sm text-muted-foreground" : "m-0 max-w-[62ch]"}
                >
                  {group.text}
                </p>
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section
        id="measured-title"
        title={t("Measured, not promised", "Målt, ikke lovet")}
        note={t(
          "The same task on screens rebuilt from Tripletex and DNB Regnskap, and on Booki. Real model runs, the result checked after every run.",
          "Samme oppgave på skjermbilder gjenskapt fra Tripletex og DNB Regnskap, og på Booki. Ekte modellkjøringer, resultatet kontrollert etter hver kjøring.",
        )}
      >
        <div className="grid gap-8">
          <div className="overflow-x-auto">
            <table className="site-post__table">
              <caption className="sr-only">
                {t(
                  "Claude Opus 5.5, Tripletex rebuild against Booki",
                  "Claude Opus 5.5, Tripletex-gjenskaping mot Booki",
                )}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Claude Opus 5.5</th>
                  <th scope="col" data-num="">
                    {t("Tool calls", "Verktøykall")}
                  </th>
                  <th scope="col" data-num="">
                    {t("Cheaper", "Billigere")}
                  </th>
                  <th scope="col" data-num="">
                    {t("Faster", "Raskere")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {TABLE_TASKS.map((id) => {
                  const raw = realFor(id, "anthropic/claude-opus", "tripletex");
                  const acc = realFor(id, "anthropic/claude-opus", "acc");
                  const task = TASKS.find((item) => item.id === id)!;
                  if (!raw || !acc) return null;
                  return (
                    <tr key={id}>
                      <th scope="row">{t(task.label.en, task.label.nb)}</th>
                      <td data-num="">
                        {raw.toolCalls} → {acc.toolCalls}
                      </td>
                      <td data-num="">{raw.costUsd && acc.costUsd ? `${one(raw.costUsd / acc.costUsd)}×` : "–"}</td>
                      <td data-num="">{one(raw.wallMs / acc.wallMs)}×</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="site-post__prose">
            <p>
              {t("The two cheapest models did the job too. ", "De to billigste modellene klarte jobben også. ")}
              {cheap
                .map((c) =>
                  t(
                    `${modelName(c.model)} was right ${c.booki.right} of ${c.booki.runs} times on Booki and ${c.rebuilt.right} of ${c.rebuilt.runs} on the rebuilt screens.`,
                    `${modelName(c.model)} fikk det riktig ${c.booki.right} av ${c.booki.runs} ganger på Booki og ${c.rebuilt.right} av ${c.rebuilt.runs} på de gjenskapte skjermbildene.`,
                  ),
                )
                .join(" ")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t(
                `Corrected 23 November 2026: the voucher and sales invoice runs are withdrawn, because a control's format hint held their answer; the figures here are from the supplier invoice and the dashboard. Read these with care. The screens were rebuilt from DOM snapshots with invented data and never run against Tripletex or DNB themselves. Five runs per screen and model through Vercel AI Gateway, medians, ${f.runDate}. ${priceLine(lang)}. Your own screens will differ; the pilot measures them. Every page, script and call is in the repository: pnpm proof.`,
                `Rettet 23. november 2026: kjøringene for bilag og salgsfaktura er trukket tilbake, fordi et formathint i kontrollen inneholdt svaret; tallene her er fra leverandørfakturaen og dashbordet. Les dem med forbehold. Skjermbildene er gjenskapt fra DOM-snapshots med oppdiktede data, og aldri kjørt mot Tripletex eller DNB selv. Fem kjøringer per skjermbilde og modell gjennom Vercel AI Gateway, medianer, ${f.runDate}. ${priceLine(lang)}. Deres egne skjermbilder vil gi andre tall; piloten måler dem. Hver side, hvert skript og hvert kall ligger i repoet: pnpm proof.`,
              )}{" "}
              <Link to="/#race-title" className="site-link">
                {t("See the race on the home page", "Se kappløpet på forsiden")}
              </Link>
            </p>
          </div>
        </div>
      </Section>

      <Section
        id="short-title"
        title={t("What is not ready", "Hva som ikke er klart")}
        note={t("Read this before you plan a pilot.", "Les dette før dere planlegger en pilot.")}
      >
        <ul className="site-rows m-0 list-none p-0">
          {SHORTFALLS(t).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Section>

      <Section
        id="start-title"
        title={t("Start with one screen", "Begynn med ett skjermbilde")}
        note={t(
          "Your API, database, sign-in and other screens stay as they are.",
          "API, database, innlogging og de andre skjermbildene forblir som de er.",
        )}
      >
        <div className="grid gap-x-10 gap-y-12 md:grid-cols-2">
          <StartPath
            title={t("Drop it into a Next.js and shadcn/ui app", "Legg det inn i en Next.js- og shadcn/ui-app")}
            steps={DROP_IN(t)}
            link={{ href: DROP_IN_URL, label: t("Read the drop-in guide", "Les guiden for eksisterende apper") }}
          />
          <StartPath
            title={t("Run the two-week pilot", "Kjør piloten på to uker")}
            steps={PILOT(t)}
            link={{ href: PILOT_URL, label: t("Read the pilot plan", "Les pilotplanen") }}
          />
        </div>
        <p className="mt-10 mb-0 max-w-[68ch] text-sm text-muted-foreground">
          {t(
            "Booki implements a draft specification any ERP can adopt: what a screen gives an agent, what stays with a person, how every step is recorded and how the server checks it again.",
            "Booki implementerer et utkast til spesifikasjon som ethvert ERP kan ta i bruk: hva et skjermbilde gir en agent, hva som forblir en persons, hvordan hvert steg registreres og hvordan serveren sjekker det igjen.",
          )}{" "}
          <a href={CONTRACT_URL} target="_blank" rel="noreferrer" className="site-link">
            {t("The Agent Contract for Accounting UIs", "Agentkontrakten for regnskaps-UI")}
          </a>
        </p>
      </Section>

      <Closing
        kicker={t("Open source, MIT", "Åpen kildekode, MIT")}
        title={t("Put one screen in front of an agent.", "Sett ett skjermbilde foran en agent.")}
        text={t(
          "Read the docs, try the demo ERP, or open an issue to say which screen you would pilot.",
          "Les dokumentasjonen, prøv demo-ERP-en, eller opprett en issue og si hvilket skjermbilde dere ville pilotert.",
        )}
        link={{ to: "/docs", label: t("Read the docs", "Les dokumentasjonen") }}
      />
    </main>
  );
}

/** "AuditWorkpaper" → "audit-workpaper", the docs route for a control. */
const docSlug = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

function PostField({ label, value, agent }: { label: string; value: string; agent?: string }) {
  return (
    <div className="site-post__field">
      <span className="site-label">{label}</span>
      <span className="site-post__value" data-agent={agent ? "" : undefined}>
        <span>{value}</span>
        {agent ? <span className="site-post__by">{agent}</span> : null}
      </span>
    </div>
  );
}

function StartPath({ title, steps, link }: { title: string; steps: string[]; link: { href: string; label: string } }) {
  return (
    <div className="grid content-start gap-4">
      <h3 className="m-0 text-xl font-semibold tracking-[-0.025em]">{title}</h3>
      <ol className="site-rows m-0 list-none p-0">
        {steps.map((step, index) => (
          <li key={step} className="grid grid-cols-[2.5rem_minmax(0,1fr)]">
            <span className="font-mono text-sm tabular-nums text-muted-foreground">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ol>
      <div>
        <Button asChild variant="outline">
          <a href={link.href} target="_blank" rel="noreferrer">
            {link.label}
          </a>
        </Button>
      </div>
    </div>
  );
}
