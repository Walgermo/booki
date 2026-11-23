import { Link } from "react-router-dom";

import { Closing } from "@/components/landing/closing";
import { ErpRace } from "@/components/landing/erp-race";
import { Section } from "@/components/section";
import { CodeDisclosure } from "@/components/two-readers";
import { Button } from "@/components/ui/button";
import { ServerRules } from "@/components/server-rules";
import { RUNS, billed, cheapModel, fairCost, modelName, realFor, formatters, versus } from "@/lib/bench";
import { useLang, type Lang } from "@/lib/lang";

const REPO_URL = "https://github.com/Walgermo/booki";

type T = <V>(en: V, nb: V) => V;

/** What a browser agent does on an ordinary accounting screen, and what it costs the vendor. */
const TODAY = (t: T): { happens: string; costs: string }[] => [
  {
    happens: t(
      "It reads the whole screen as text, again after every click.",
      "Den leser hele skjermbildet som tekst, på nytt etter hvert klikk.",
    ),
    costs: t(
      "Someone pays for that in tokens and waiting time: your customer, or you if it is your assistant.",
      "Noen betaler for det i tokens og ventetid: kundene deres, eller dere selv hvis det er deres egen assistent.",
    ),
  },
  {
    happens: t(
      "It guesses which field is which from labels and layout.",
      "Den gjetter hvilket felt som er hvilket ut fra ledetekster og plassering.",
    ),
    costs: t(
      "A wrong account or amount gets posted, and your support team hears about it.",
      "Feil konto eller feil beløp blir bokført, og det er kundestøtten deres som får høre om det.",
    ),
  },
  {
    happens: t(
      "Fields have no names, so it finds them by their position on the page.",
      "Feltene har ikke navn, så den finner dem etter hvor de står på siden.",
    ),
    costs: t(
      "One layout change and the amount goes into the wrong field.",
      "Én endring i oppsettet, og beløpet havner i feil felt.",
    ),
  },
  {
    happens: t("Your audit trail records the signed-in user.", "Revisjonssporet registrerer den innloggede brukeren."),
    costs: t(
      "When the auditor asks who approved, the answer is a person who never saw it.",
      "Når revisor spør hvem som attesterte, er svaret en person som aldri så bilaget.",
    ),
  },
];

/** What one screen built on Booki gives an agent instead. */
const CHANGES = (t: T): { label: string; text: string }[] => [
  {
    label: t("Reads", "Leser"),
    text: t(
      "One compact snapshot of each control: amounts in minor units, the balance, what is wrong, and which actions are allowed right now.",
      "Ett kompakt øyeblikksbilde av hver kontroll: beløp i øre, balansen, hva som er feil, og hvilke handlinger som er tillatt akkurat nå.",
    ),
  },
  {
    label: t("Acts", "Handler"),
    text: t(
      "Named actions such as setMinor, addLine and proposeCoding. Your rules run inside them, and a refusal comes back as a sentence the agent can act on.",
      "Navngitte handlinger som setMinor, addLine og proposeCoding. Reglene deres kjører inne i dem, og et avslag kommer tilbake som en setning agenten kan handle på.",
    ),
  },
  {
    label: t("Governs", "Styrer"),
    text: t(
      "Posting and paying run on their own when your rules allow them: a balanced voucher, an open period, under an amount limit. What falls outside goes to a person. Approving and signing off stay a person's decision.",
      "Bokføring og betaling går av seg selv når reglene deres tillater det: et bilag i balanse, en åpen periode, under en beløpsgrense. Det som faller utenfor, går til en person. Attestering og godkjenning er fortsatt en persons beslutning.",
    ),
  },
  {
    label: t("Records", "Logger"),
    text: t(
      "Every change the agent makes carries the actor agent:<id>, so the audit log tells an agent's work from a person's.",
      "Hver endring agenten gjør, får aktøren agent:<id>, så revisjonssporet skiller agentens arbeid fra en persons.",
    ),
  },
  {
    label: t("Serves both", "Tjener begge"),
    text: t(
      "Your customers' agents and the assistant you build into the product use the same contract. You describe a screen once, in the screen.",
      "Kundenes agenter og assistenten dere bygger inn i produktet, bruker samme kontrakt. Dere beskriver et skjermbilde én gang, i selve skjermbildet.",
    ),
  },
];

const WHY_NOW = (t: T): { title: string; text: string }[] => [
  {
    title: t(
      "You no longer decide whether agents use your product",
      "Dere bestemmer ikke lenger om agenter bruker produktet",
    ),
    text: t(
      "Agents that drive web pages now ship inside browsers and assistants your customers already pay for. What you still decide is whether your screens are safe and cheap for them to work.",
      "Agenter som styrer nettsider, følger nå med nettlesere og assistenter kundene allerede betaler for. Det dere fortsatt bestemmer, er om skjermbildene er trygge og billige for dem å jobbe i.",
    ),
  },
  {
    title: t(
      "Your own assistant needs a tool for every screen",
      "Deres egen assistent trenger et verktøy for hvert skjermbilde",
    ),
    text: t(
      "Without this, that means a second API layer for the model, kept in step with the UI by hand. With Booki the screen is the tool, and it changes when the screen changes.",
      "Uten dette betyr det et ekstra API-lag for modellen, som må holdes i takt med brukergrensesnittet for hånd. Med Booki er skjermbildet verktøyet, og det endrer seg når skjermbildet endrer seg.",
    ),
  },
  {
    title: t(
      "Accounting has rules generic agent tooling does not know",
      "Regnskap har regler generelle agentverktøy ikke kjenner",
    ),
    text: t(
      "Separation of duties, attestation, locked periods, VAT boxes, an audit trail. These controls carry those rules, so you do not teach them to each agent.",
      "Arbeidsdeling, attestering, låste perioder, mva-poster, revisjonsspor. Kontrollene har disse reglene innebygd, så dere slipper å lære opp hver agent i dem.",
    ),
  },
];

const PILOT = (t: T): { step: string; detail: string }[] => [
  {
    step: t("Pick one screen", "Velg ett skjermbilde"),
    detail: t(
      "One where customers ask for automation or agents already struggle: supplier invoice approval, bank reconciliation, expense claims.",
      "Et der kundene ber om automatisering eller agentene allerede sliter: attestering av leverandørfakturaer, bankavstemming, reiseregninger og utlegg.",
    ),
  },
  {
    step: t("Swap its fields, or define your own", "Bytt feltene, eller definer deres egne"),
    detail: t(
      "Use the Booki controls, under your own tags and names if you like, or give a control of your own a primitive: its behaviour once, then its parts in your framework. The controls are unstyled; the default look is a set of --bk-* tokens you map to your own.",
      "Bruk Booki-kontrollene, gjerne med egne tagger og navn, eller lag en primitiv av en kontroll dere allerede har: oppførselen defineres én gang, og delene i rammeverket deres. Kontrollene er ustylet; standardutseendet er et sett --bk-*-tokens dere kobler til deres egne.",
    ),
  },
  {
    step: t("Keep your backend", "Behold backenden"),
    detail: t(
      "Each control reports changes through callbacks such as onInvoicesChange, and you save the way you do today. Your API checks the same rules with @booki/core/server.",
      "Hver kontroll melder endringer gjennom callbacks som onInvoicesChange, og dere lagrer slik dere gjør i dag. API-et deres sjekker de samme reglene med @booki/core/server.",
    ),
  },
  {
    step: t("Connect the agent and the audit log", "Koble til agenten og revisjonssporet"),
    detail: t(
      "createBookiAgent for your assistant, or WebMCP for agents in the browser. attachAudit sends every agent change to your audit log.",
      "createBookiAgent for deres egen assistent, eller WebMCP for agenter i nettleseren. attachAudit sender hver endring agenten gjør, til revisjonssporet deres.",
    ),
  },
  {
    step: t("Measure one task, before and after", "Mål én oppgave, før og etter"),
    detail: t(
      "Tokens, steps, wrong postings, and person-only steps the agent took. The benchmark in the repository runs that comparison against a real model with your API key.",
      "Tokens, steg, feilføringer og steg som bare en person skulle ha tatt, men som agenten tok. Benchmarken i repoet kjører den sammenligningen mot en ekte modell med deres API-nøkkel.",
    ),
  },
];

/** The three numbers a leader asks for first, from the benchmark run itself (src/data/bench.json). */
const VOUCHER = versus("voucher");
/** Measured with real models (pnpm proof); the scripted estimate where a task has no real runs. */
const REAL_RAW = realFor("supplier-invoice", "anthropic/", "tripletex");
const REAL_ACC = realFor("supplier-invoice", "anthropic/", "acc");
const CHEAP = cheapModel("supplier-invoice");
const CHEAP_ACC = CHEAP ? realFor("supplier-invoice", CHEAP, "acc") : undefined;
const CHEAP_RAW = CHEAP ? realFor("supplier-invoice", CHEAP, "tripletex") : undefined;
const FIGURES = (t: T, lang: Lang): { figure: string; text: string; source: string }[] => {
  const { int, usd, seconds } = formatters(lang);
  const one = (n: number) => n.toLocaleString(lang === "nb" ? "nb-NO" : "en-US", { maximumFractionDigits: 1 });
  const pilot = {
    figure: "1",
    text: t("screen to start a pilot", "skjermbilde for å starte en pilot"),
    source: t("Your API, database and sign-in stay as they are.", "API, database og innlogging forblir som de er."),
  };
  if (REAL_RAW?.costUsd && REAL_ACC?.costUsd) {
    return [
      {
        figure: `${one(REAL_RAW.costUsd / REAL_ACC.costUsd)}×`,
        text: t(
          "cheaper to register one supplier invoice, measured",
          "billigere å registrere én leverandørfaktura, målt",
        ),
        source: t(
          `Claude Opus 5.5 on our rebuild of Tripletex's supplier-invoice screen against Booki: ${usd(REAL_RAW.costUsd, 3)} against ${usd(REAL_ACC.costUsd, 3)} an invoice, ${REAL_RAW.toolCalls} tool calls against ${REAL_ACC.toolCalls}, ${seconds(REAL_RAW.wallMs)} against ${seconds(REAL_ACC.wallMs)}. Right ${REAL_RAW.succeeded}/${REAL_RAW.runs} and ${REAL_ACC.succeeded}/${REAL_ACC.runs}.`,
          `Claude Opus 5.5 på vår gjenskaping av leverandørfakturaskjermen i Tripletex mot Booki: ${usd(REAL_RAW.costUsd, 3)} mot ${usd(REAL_ACC.costUsd, 3)} per faktura, ${REAL_RAW.toolCalls} verktøykall mot ${REAL_ACC.toolCalls}, ${seconds(REAL_RAW.wallMs)} mot ${seconds(REAL_ACC.wallMs)}. Riktig ${REAL_RAW.succeeded}/${REAL_RAW.runs} og ${REAL_ACC.succeeded}/${REAL_ACC.runs}.`,
        ),
      },
      ...(CHEAP_ACC && CHEAP_RAW
        ? [
            {
              figure: `${CHEAP_ACC.succeeded}/${CHEAP_ACC.runs}`,
              text: t("invoices right with a far cheaper model", "fakturaer riktig med en langt billigere modell"),
              source: t(
                `${modelName(CHEAP!)} got ${CHEAP_ACC.succeeded} of ${CHEAP_ACC.runs} right on Booki and ${CHEAP_RAW.succeeded} of ${CHEAP_RAW.runs} on our Tripletex rebuild, at ${usd(CHEAP_ACC.costUsd ?? 0, 4)} an invoice. On agent-first screens a cheaper model does the job.`,
                `${modelName(CHEAP!)} fikk ${CHEAP_ACC.succeeded} av ${CHEAP_ACC.runs} riktig på Booki og ${CHEAP_RAW.succeeded} av ${CHEAP_RAW.runs} på vår Tripletex-gjenskaping, til ${usd(CHEAP_ACC.costUsd ?? 0, 4)} per faktura. På agent-first-skjermer gjør en billigere modell jobben.`,
              ),
            },
          ]
        : []),
      pilot,
    ];
  }
  return [
    {
      figure: `${Math.round(billed(VOUCHER.raw) / billed(VOUCHER.acc))}×`,
      text: t(
        "less input billed to post one voucher (estimate)",
        "mindre fakturert input for å bokføre ett bilag (anslag)",
      ),
      source: t(
        `Scripted best case against a DOM snapshot of Tripletex's voucher screen: ${int(billed(VOUCHER.acc))} tokens against ${int(billed(VOUCHER.raw))}, ${VOUCHER.acc.calls} tool calls against ${VOUCHER.raw.calls}.`,
        `Skriptet beste tilfelle mot et DOM-øyeblikksbilde av bilagsskjermbildet i Tripletex: ${int(billed(VOUCHER.acc))} tokens mot ${int(billed(VOUCHER.raw))}, ${VOUCHER.acc.calls} verktøykall mot ${VOUCHER.raw.calls}.`,
      ),
    },
    {
      figure: usd((fairCost(VOUCHER.raw) - fairCost(VOUCHER.acc)) * RUNS),
      text: t(`saved per ${int(RUNS)} vouchers (estimate)`, `spart per ${int(RUNS)} bilag (anslag)`),
      source: t("At Opus 5.5 prices, characters ÷ 4.", "Med Opus 5.5-priser, tegn ÷ 4."),
    },
    pilot,
  ];
};

/** Facts an engineer checks before a pilot. Each one was measured or tested in this repository. */
const STACK = (t: T): { label: string; text: string }[] => [
  {
    label: t("Frameworks", "Rammeverk"),
    text: t(
      "React 19, Vue 3.5, Svelte 5, Solid 2, or Web Components for Angular and pages rendered on the server. One set of definitions, so the same control has the same actions everywhere.",
      "React 19, Vue 3.5, Svelte 5, Solid 2, eller Web Components for Angular og serverrendrede sider. Ett sett definisjoner, så samme kontroll har samme handlinger overalt.",
    ),
  },
  {
    label: t("Size", "Størrelse"),
    text: t(
      "AmountField is 14.7 kB gzip, the whole of @booki/react 99.7 kB, plus 15 kB for the agent bridge. Import per control: @booki/react/amount-field.",
      "AmountField er 14,7 kB gzip, hele @booki/react 99,7 kB, pluss 15 kB for agentbroen. Importer per kontroll: @booki/react/amount-field.",
    ),
  },
  {
    label: t("Server", "Server"),
    text: t(
      "Renders on the server with renderToString; a test does it with no DOM present.",
      "Rendres på serveren med renderToString; en test gjør det uten noe DOM til stede.",
    ),
  },
  {
    label: t("Styling", "Styling"),
    text: t(
      "Unstyled. The optional stylesheet is CSS variables and data-slot selectors, so your design tokens can replace it.",
      "Ustylet. Det valgfrie stilarket er CSS-variabler og data-slot-selektorer, så deres egne design-tokens kan erstatte det.",
    ),
  },
  {
    label: t("Network", "Nettverk"),
    text: t(
      "None. The library makes no requests; the agent bridge runs in the page.",
      "Ingen. Biblioteket gjør ingen forespørsler; agentbroen kjører i siden.",
    ),
  },
  {
    label: t("Tests", "Tester"),
    text: t(
      "About 500 unit and bridge tests, run on every change.",
      "Rundt 500 enhetstester og brotester, som kjøres ved hver endring.",
    ),
  },
  { label: t("Licence", "Lisens"), text: "MIT." },
];

/** What an agent can and cannot do on a Booki screen. */
const SECURITY = (t: T): { label: string; text: string }[] => [
  {
    label: t("Reads", "Leser"),
    text: t(
      "Only the state a control declares. A secret part (account number, IBAN, KID) redacts that control's whole snapshot.",
      "Bare tilstanden en kontroll oppgir. En hemmelig del (kontonummer, IBAN, KID) skjuler hele øyeblikksbildet til den kontrollen.",
    ),
  },
  {
    label: t("Does", "Gjør"),
    text: t(
      "Only the actions a control lists, with typed arguments. Your rules run inside them and refuse with a sentence.",
      "Bare handlingene en kontroll lister opp, med typede argumenter. Reglene deres kjører inne i dem og avslår med en setning.",
    ),
  },
  {
    label: t("Within your rules", "Innenfor reglene deres"),
    text: t(
      "Steps marked data-agent-confirm, such as posting or paying, run when your allow function says yes, for example under an amount limit. Approving, signing off and releasing are not agent actions at all.",
      "Steg merket data-agent-confirm, som bokføring og betaling, kjører når allow-funksjonen deres sier ja, for eksempel under en beløpsgrense. Attestering, godkjenning og frigivelse er ikke agenthandlinger i det hele tatt.",
    ),
  },
  {
    label: t("Text on screen", "Tekst på skjermen"),
    text: t(
      "An agent may be told things by text on a page. Booki cannot stop a model from reading that, but it limits what the model can do with it to the actions above.",
      "Tekst på en side kan gi en agent instruksjoner. Booki kan ikke hindre en modell i å lese det, men begrenser hva modellen kan gjøre med det, til handlingene over.",
    ),
  },
  {
    label: t("Your server", "Serveren deres"),
    text: t(
      "Still decides. The screen checks role, period and approvals for speed and clarity; @booki/core/server runs the same rules in your API, with the caller your sign-in established. An agent with every role is still refused a person's decision.",
      "Bestemmer fortsatt. Skjermbildet sjekker rolle, periode og attesteringer for fart og tydelighet; @booki/core/server kjører de samme reglene i API-et deres, med den innloggingen deres har fastslått som avsender. En agent får fortsatt nei til beslutninger som er forbeholdt en person, uansett roller.",
    ),
  },
];

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
}
`;

const WRAP = `import { createChange, createParts, definePrimitive } from "@booki/react"
import { amountField } from "@booki/primitives/amount-field"

// A Booki control under your own names and tags: the primitive, your parts.
export const Belop = createParts(amountField, { root: "div", currency: "span", input: "input" })

// A control of your own: its behaviour once as a primitive, then its parts.
// The same primitive renders in React, Vue, Svelte, Solid and Web Components.
const projectPicker = definePrimitive({
  name: "project-picker",
  options: { projects: "value", value: "string", onValueChange: "callback" },
  state: (options) => ({ value: options.value ?? "" }),
  api: (context) => {
    const change = createChange(context)
    return {
      setProject: (id: string, event?: Event) => {
        if (!context.options().projects.some((p) => p.id === id)) {
          throw new Error(\`No project "\${id}".\`)
        }
        return change("value", id, { reason: "set-project", event })
      },
    }
  },
  slots: (slot) => ({
    root: slot({ role: "group" }),
    select: slot({
      attrs: (state) => ({ value: state.value }),
      on: { input: (event, { api }) => api.setProject(event.target.value, event) },
    }),
  }),
  agent: { actions: ["setProject"] },
})

export const ProjectPicker = createParts(projectPicker, { root: "div", select: "select" })`;

const FOUND = (t: T): string[] => [
  t(
    "Account and VAT pickers are jQuery UI widgets with no names, so an agent picks them by their order on the page.",
    "Konto- og mva-velgerne er jQuery UI-widgets uten navn, så en agent velger dem etter rekkefølgen på siden.",
  ),
  t(
    "Every pick opens a dialog with an unlabeled search box and one list mixing accounts, customers, suppliers and employees.",
    "Hvert valg åpner en dialog med et søkefelt uten ledetekst og én liste som blander kontoer, kunder, leverandører og ansatte.",
  ),
  t("The amount field has no label.", "Beløpsfeltet har ingen ledetekst."),
  t(
    "Icon buttons are named by their icon font: “close”, “content_copy”.",
    "Ikonknappene heter det ikonfonten kaller dem: «close», «content_copy».",
  ),
  t(
    "“Bokfør bilaget ved lagring” is ticked by default, so “Opprett” posts at once, with no rule in between.",
    "«Bokfør bilaget ved lagring» er krysset av som standard, så «Opprett» bokfører med en gang, uten noen regel imellom.",
  ),
  t(
    "The menu and the older forms live in Shadow DOM, which tools that read a flattened page can miss.",
    "Menyen og de eldre skjemaene ligger i Shadow DOM, som verktøy som leser en flatet side, kan gå glipp av.",
  ),
];

const SHORTFALLS = (t: T): string[] => [
  t(
    "The agent bridge it is built on is in beta (0.1.0-beta.14). Its API may still change.",
    "Agentbroen den bygger på, er i beta (0.1.0-beta.14). API-et kan fortsatt endre seg.",
  ),
  t(
    "Outside React the controls come as parts, so you write the markup around them (rows, options). The agent cursor works everywhere through <booki-agent-cursor>.",
    "Utenfor React kommer kontrollene som deler, så dere skriver markupen rundt dem (rader, valg). Agentpekeren virker overalt via <booki-agent-cursor>.",
  ),
  t(
    "Not published to npm yet. Install from the repository for now.",
    "Ikke publisert på npm ennå. Installer fra repoet inntil videre.",
  ),
  t(
    "No production users yet. The real-model runs are small, five per screen and model, on screens we rebuilt ourselves, and two tasks are withdrawn until they are run again.",
    "Ingen brukere i produksjon ennå. Målingene med ekte modeller er små, fem kjøringer per skjermbilde og modell, på skjermbilder vi har gjenskapt selv, og to oppgaver er trukket tilbake til de er målt på nytt.",
  ),
  t(
    "Server guards cover posting, approvals, payment release, period close, invoices and VAT. Other writes need guard() with a rule of your own, and you wire the caller from your own sign-in.",
    "Serverkontrollene dekker bokføring, attestering, frigivelse av betalinger, periodeavslutning, fakturaer og mva. Andre skriveoperasjoner trenger guard() med en egen regel, og dere kobler avsenderen fra deres egen innlogging.",
  ),
  t(
    "Labels are English and Norwegian. Sweden, Denmark, the UK and Germany have English labels and example VAT codes.",
    "Ledetekstene finnes på engelsk og norsk. Sverige, Danmark, Storbritannia og Tyskland har engelske ledetekster og eksempler på mva-koder.",
  ),
  t(
    "One maintainer so far. If the project stops, you keep an MIT copy of plain React code running against your own backend; nothing depends on a service.",
    "Bare én vedlikeholder så langt. Stopper prosjektet, beholder dere en MIT-kopi av vanlig React-kode som kjører mot deres egen backend; ingenting avhenger av en tjeneste.",
  ),
];

const SAMPLE = `import {
  BookiAccessProvider,
  BookiLocaleProvider,
  SupplierInvoiceInbox,
  attachAudit,
  createBookiAgent,
} from "@booki/react"
import "@booki/styles"

const agent = createBookiAgent({ agentId: "assistant" })
attachAudit(agent, (event) => api.audit.append(event), "assistant")

export function InvoiceApproval({ user, invoices }) {
  return (
    <BookiLocaleProvider defaultCountry="NO">
      <BookiAccessProvider actor={{ id: user.id, roles: user.roles }}>
        <SupplierInvoiceInbox
          invoices={invoices}
          onInvoicesChange={(next) => api.invoices.save(next)}
        />
      </BookiAccessProvider>
    </BookiLocaleProvider>
  )
}`;

/**
 * The case for an ERP or accounting SaaS team: what agents do to their
 * product today, what one Booki screen changes, what a pilot takes, and
 * what is not ready yet.
 */
export function ErpTeamsPage() {
  const { lang, t } = useLang();
  return (
    <main>
      <section className="site-ledger grid gap-y-8 pt-14 pb-16 md:pt-24 md:pb-24">
        <div>
          <p className="site-kicker">{t("For ERP and accounting teams", "For ERP- og regnskapsteam")}</p>
          <h1 className="landing-hero__title mt-6 mb-0 max-w-[14ch]">
            {t("Agents already use your product.", "Agenter bruker allerede produktet deres.")}
          </h1>
          <p className="landing-hero__lede mt-5 mb-0 max-w-[60ch]">
            {t(
              "Your customers point browser agents at your screens today. Booki makes a screen something an agent can work cheaply and safely, under your rules and in your audit trail. You adopt it one screen at a time.",
              "Kundene deres setter allerede nettleseragenter på skjermbildene deres. Booki gjør et skjermbilde til noe en agent kan jobbe i billig og trygt, under reglene deres og i revisjonssporet deres. Dere tar det i bruk ett skjermbilde om gangen.",
            )}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg">
              <Link to="/demo">{t("Open the demo ERP", "Åpne demo-ERP-en")}</Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <a href="#pilot-title">{t("What a pilot takes", "Hva en pilot krever")}</a>
            </Button>
          </div>
        </div>
      </section>

      <dl className="site-figures">
        {FIGURES(t, lang).map((item) => (
          <div key={item.text}>
            <dt className="site-figures__figure">{item.figure}</dt>
            <dd className="m-0 grid gap-1">
              <span className="font-medium">{item.text}</span>
              <span className="text-sm text-muted-foreground">{item.source}</span>
            </dd>
          </div>
        ))}
      </dl>

      {lang === "nb" ? null : (
        <Section id="nb-title" title="Kort fortalt" note="For ledere i norske ERP- og regnskapsselskaper.">
          <div lang="nb" className="grid max-w-[68ch] gap-4 text-lg leading-relaxed">
            <p className="m-0">
              Kundene deres bruker allerede AI-agenter i nettleseren mot skjermbildene deres. Agentene leser hele siden
              etter hvert klikk, gjetter hvilket felt som er hvilket, og bokfører uten at noen regel blir sjekket.
            </p>
            <p className="m-0">
              Med Booki jobber agenten gjennom navngitte handlinger med reglene deres innebygd. Den bokfører og betaler
              innenfor reglene dere setter, som beløpsgrenser og åpne perioder, og sender resten til en person.
              Revisjonssporet viser hva agenten gjorde og hva en person gjorde.
            </p>
            <p className="m-0">
              Dere tar det i bruk ett skjermbilde om gangen, med samme API og backend. Koden er åpen (MIT), og en pilot
              kan måles før og etter på én oppgave.
            </p>
          </div>
        </Section>
      )}

      <Section
        id="today-title"
        title={t("What happens today", "Slik er det i dag")}
        note={t(
          "A browser agent on an ordinary accounting screen.",
          "En nettleseragent i et vanlig regnskapsskjermbilde.",
        )}
      >
        <div className="mb-3 hidden gap-8 md:grid md:grid-cols-2">
          <p className="site-kicker">{t("The agent", "Agenten")}</p>
          <p className="site-kicker">{t("What it costs you", "Hva det koster dere")}</p>
        </div>
        <dl className="site-rows m-0">
          {TODAY(t).map((row) => (
            <div key={row.happens} className="grid gap-1 md:grid-cols-2 md:gap-8">
              <dt className="font-medium">{row.happens}</dt>
              <dd className="m-0 text-muted-foreground">{row.costs}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 mb-0 text-sm text-muted-foreground">
          <Link to="/" className="site-link">
            {t("See it measured on the home page", "Se det målt på forsiden")}
          </Link>
          {t(
            ": the same invoice, booked once with browser tools and once through Booki.",
            ": samme faktura, bokført én gang med nettleserverktøy og én gang gjennom Booki.",
          )}
        </p>
      </Section>

      <ErpRace />

      <Section
        id="found-title"
        title={t("Why the Tripletex screen was hard", "Hvorfor skjermbildet i Tripletex var vanskelig")}
        note={t(
          "What we found mapping its voucher screen, read only. Each one costs an agent calls, or lets it do what it should not.",
          "Det vi fant da vi kartla bilagsskjermbildet, bare med lesetilgang. Hvert punkt koster en agent kall, eller lar den gjøre noe den ikke skal.",
        )}
      >
        <ul className="site-rows m-0 list-none p-0">
          {FOUND(t).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </Section>

      <Section
        id="changes-title"
        title={t("What one screen changes", "Hva ett skjermbilde endrer")}
        note={t("The same screen, built on Booki controls.", "Samme skjermbilde, bygget med Booki-kontroller.")}
      >
        <dl className="site-rows m-0">
          {CHANGES(t).map((row) => (
            <div key={row.label} className="grid gap-1 md:grid-cols-[12rem_minmax(0,1fr)] md:items-baseline md:gap-8">
              <dt className="text-2xl font-semibold tracking-[-0.03em]">{row.label}</dt>
              <dd className="m-0 max-w-[62ch]">{row.text}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section id="now-title" title={t("Why now", "Hvorfor nå")}>
        <div className="grid gap-x-10 gap-y-8 md:grid-cols-3">
          {WHY_NOW(t).map((item) => (
            <div key={item.title} className="grid content-start gap-2">
              <h3 className="m-0 text-xl font-semibold tracking-[-0.025em]">{item.title}</h3>
              <p className="m-0 text-muted-foreground">{item.text}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        id="pilot-title"
        title={t("What a pilot takes", "Hva en pilot krever")}
        note={t(
          "One screen. Your API, database, sign-in and other screens stay as they are.",
          "Ett skjermbilde. API, database, innlogging og de andre skjermbildene forblir som de er.",
        )}
      >
        <ol className="site-rows m-0 list-none p-0">
          {PILOT(t).map((item, index) => (
            <li
              key={item.step}
              className="grid gap-1 md:grid-cols-[3rem_14rem_minmax(0,1fr)] md:items-baseline md:gap-6"
            >
              <span className="font-mono text-sm tabular-nums text-muted-foreground">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="font-medium">{item.step}</span>
              <span className="max-w-[62ch] text-muted-foreground">{item.detail}</span>
            </li>
          ))}
        </ol>
        <div className="mt-8 grid min-w-0 gap-2">
          <p className="site-kicker">
            {t("The whole screen, wired to your API", "Hele skjermbildet, koblet til API-et deres")}
          </p>
          <pre className="site-code m-0 overflow-x-auto text-xs">{SAMPLE}</pre>
        </div>
      </Section>

      <Section
        id="stack-title"
        title={t("Fits your stack", "Passer i stacken deres")}
        note={t(
          "Measured or tested in this repository, not promised.",
          "Målt eller testet i dette repoet, ikke lovet.",
        )}
      >
        <dl className="site-rows m-0">
          {STACK(t).map((row) => (
            <div key={row.label} className="grid gap-1 md:grid-cols-[10rem_minmax(0,1fr)] md:gap-8">
              <dt className="site-kicker pt-0.5">{row.label}</dt>
              <dd className="m-0 max-w-[62ch]">{row.text}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6">
          <CodeDisclosure
            title={t("Your own tags and names, and a control of your own", "Egne tagger og navn, og en egen kontroll")}
            source={WRAP}
          />
        </div>
      </Section>

      <Section
        id="security-title"
        title={t("Security model", "Sikkerhetsmodell")}
        note={t(
          "What an agent can reach on a Booki screen, and what it cannot.",
          "Hva en agent har tilgang til i et Booki-skjermbilde, og hva den ikke kan.",
        )}
      >
        <dl className="site-rows m-0">
          {SECURITY(t).map((row) => (
            <div key={row.label} className="grid gap-1 md:grid-cols-[10rem_minmax(0,1fr)] md:gap-8">
              <dt className="site-kicker pt-0.5">{row.label}</dt>
              <dd className="m-0 max-w-[62ch]">{row.text}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section
        id="server-title"
        title={t("The same rules on your server", "De samme reglene på serveren deres")}
        note={t(
          "The screen is for speed and clarity; the server is the gate. Try it against this site's API.",
          "Skjermbildet gir fart og tydelighet; serveren er porten. Prøv det mot API-et til denne siden.",
        )}
      >
        <ServerRules />
        <div className="mt-6">
          <CodeDisclosure
            title={t("An API route with @booki/core/server", "En API-rute med @booki/core/server")}
            source={SERVER_EXAMPLE}
          />
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
        <p className="mt-6 mb-0 text-sm text-muted-foreground">
          {t(
            "Open source under the MIT licence. The library runs in your app and sends nothing anywhere.",
            "Åpen kildekode under MIT-lisensen. Biblioteket kjører i appen deres og sender ingenting noe sted.",
          )}{" "}
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="site-link">
            {t("Open an issue", "Opprett en issue")}
          </a>{" "}
          {t("to say which screen you would pilot.", "og si hvilket skjermbilde dere ville pilotert.")}
        </p>
      </Section>

      <Closing
        kicker={t("Pilot one screen", "Pilot på ett skjermbilde")}
        title={t("Pick the screen agents struggle with most.", "Velg skjermbildet agentene sliter mest med.")}
        text={t(
          "Tell us which one in an issue, or open the demo ERP and run a whole month-end first.",
          "Si hvilket i en issue, eller åpne demo-ERP-en og kjør en hel månedsavslutning først.",
        )}
        link={{ to: "/demo", label: t("Open the demo ERP", "Åpne demo-ERP-en") }}
      />
    </main>
  );
}
