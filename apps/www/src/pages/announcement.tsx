import { Link } from "react-router-dom";

import { BookiLayers } from "@/components/announcement/booki-layers";
import { BeforeAfter, OneStep } from "@/components/announcement/diagrams";
import { Closing } from "@/components/landing/closing";
import { MeasuredFigures } from "@/components/landing/measured-figures";
import { REPO_URL } from "@/components/landing/shared";
import { Button } from "@/components/ui/button";
import { formatters, proofKpis } from "@/lib/bench";
import { usePageMeta, useLang, type PageMeta } from "@/lib/lang";

const META: PageMeta = {
  title: {
    en: "Agent-first UI with Booki is here",
    nb: "Agent-first UI med Booki er her",
  },
  description: {
    en: "Booki is an open-source UI library a person and an agent use together: controls an agent operates by name, under your rules, with every step in the audit trail and the same rules on your server.",
    nb: "Booki er et UI-bibliotek med åpen kildekode som en person og en agent bruker sammen: kontroller en agent styrer ved navn, under reglene deres, med hvert steg i revisjonssporet og de samme reglene på serveren.",
  },
};

const PUBLICATION_DATE = "2026-11-27";
const DROP_IN_URL = `${REPO_URL}/blob/main/docs/drop-in.md`;
const CONTRACT_URL = `${REPO_URL}/blob/main/spec/agent-contract.md`;

/**
 * The launch post, as an article: why, one step end to end, the layers,
 * the measurements and how to start. Three diagrams carry what prose would take a
 * page for; the details live in the docs. Every figure is read from the
 * benchmark's own data (src/data/bench.json).
 */
export function AnnouncementPage() {
  const { lang, t } = useLang();
  usePageMeta(META);
  const f = formatters(lang);
  const kpi = proofKpis();
  const published = new Date(PUBLICATION_DATE).toLocaleDateString(lang === "nb" ? "nb-NO" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    // The build renders this date too: one time zone, so the browser's first render matches the HTML.
    timeZone: "UTC",
  });

  return (
    <main className="site-article">
      <header className="site-article__head">
        <p className="site-kicker">
          {t("Announcement", "Lansering")} · <time dateTime={PUBLICATION_DATE}>{published}</time>
        </p>
        <h1 className="site-article__title">
          {/* A no-break hyphen, so "agent-first" never splits over two lines. */}
          {t(META.title.en, META.title.nb).replace("agent-first", "agent‑first")}
        </h1>
        <p className="site-article__dek">
          {t(
            "Booki is open-source UI a person and an agent use together. The person sees an ordinary form. The agent operates the same controls by name, under your rules, and every step lands in your audit trail as the agent's.",
            "Booki er UI med åpen kildekode som en person og en agent bruker sammen. Personen ser et vanlig skjema. Agenten styrer de samme kontrollene ved navn, under reglene deres, og hvert steg havner i revisjonssporet som agentens.",
          )}
        </p>
      </header>

      <div className="site-article__wide">
        <MeasuredFigures className="landing-hero__stats site-article__figures" />
      </div>
      <p className="site-article__note">
        {t(
          `Medians over ${kpi.tasks} tasks and ${kpi.models} models, five runs each, against the same screens without Booki, ${f.runDate}.`,
          `Medianer over ${kpi.tasks} oppgaver og ${kpi.models} modeller, fem kjøringer hver, mot de samme skjermbildene uten Booki, ${f.runDate}.`,
        )}{" "}
        <a href="#measured" className="site-link">
          {t("How it was measured", "Slik ble det målt")}
        </a>
      </p>

      <section className="site-article__section" aria-labelledby="why">
        <h2 id="why">{t("Agents are already in your software", "Agentene er allerede i programvaren deres")}</h2>
        <p>
          {t(
            "An agent on an ordinary screen reads it again after every click, guesses which unnamed box holds the value, and types into it. That is slow and expensive, and in software that runs a business it is wrong in ways that matter: a value in the wrong field, a rounding nobody chose, an approval recorded as whoever was signed in.",
            "En agent på et vanlig skjermbilde leser det på nytt etter hvert klikk, gjetter hvilket navnløst felt som har verdien, og skriver i det. Det er tregt og dyrt, og i programvare som driver en virksomhet er det feil på måter som betyr noe: en verdi i feil felt, en avrunding ingen valgte, en godkjenning registrert på den som var logget inn.",
          )}
        </p>
      </section>
      <div className="site-article__wide">
        <BeforeAfter />
      </div>

      <section className="site-article__section" aria-labelledby="step">
        <h2 id="step">{t("One step, end to end", "Ett steg, fra start til slutt")}</h2>
        <p>
          {t(
            "Each control tells the agent what it holds and which actions it takes right now. The agent calls one by name; your rule runs inside it; a step that needs a person waits for one. The audit trail records the agent as itself, and your server checks the same rules again, refusing an agent the decisions that are a person's: approving, signing, releasing.",
            "Hver kontroll forteller agenten hva den inneholder og hvilke handlinger den tar akkurat nå. Agenten kaller én ved navn; regelen deres kjører inne i den; et steg som trenger en person, venter på en. Revisjonssporet registrerer agenten som seg selv, og serveren sjekker de samme reglene igjen og nekter en agent de beslutningene som er en persons: godkjenning, signering, frigivelse.",
          )}
        </p>
      </section>
      <div className="site-article__wide">
        <OneStep />
      </div>

      <section className="site-article__section" aria-labelledby="layers">
        <h2 id="layers">{t("Defined once, rendered everywhere", "Definert én gang, vist overalt")}</h2>
        <p>
          {t(
            "Each control is defined once, with no framework, and every framework package is generated from that definition. One agent operates them all the same way.",
            "Hver kontroll er definert én gang, uten rammeverk, og hver rammeverkpakke genereres fra den definisjonen. Én agent styrer dem likt.",
          )}
        </p>
      </section>
      <div className="site-article__wide">
        <BookiLayers />
      </div>

      <section className="site-article__section" aria-labelledby="measured">
        <h2 id="measured">{t("How it was measured", "Slik ble det målt")}</h2>
        <p>
          {t(
            "We recreated screens from two accounting systems, populated them with sample data and ran the same tasks on those screens and on Booki. Claude Opus, Sonnet and Haiku 5.5 and DeepSeek V4.1 Flash each ran every task five times per screen. We checked the result after each run and calculated cost at list prices.",
            "Vi gjenskapte skjermbilder fra to regnskapssystemer, fylte dem med eksempeldata og kjørte de samme oppgavene der og i Booki. Claude Opus, Sonnet og Haiku 5.5 og DeepSeek V4.1 Flash kjørte hver oppgave fem ganger per skjermbilde. Vi kontrollerte resultatet etter hver kjøring og beregnet kostnaden med leverandørenes listepriser.",
          )}
        </p>
        <p>
          {t(
            "You can also try three routes captured from Nav, Posten and Brønnøysundregistrene. In the Nav example, GPT-6.2 Sol has to open the unemployment benefits panel and read two processing times from its tables. Both versions returned the right answers on all three routes. In one run per version, the Booki bridge took 3 tool calls on each route. The browser took 11 on Nav, 6 on Posten and 3 on Brønnøysundregistrene. You can inspect every call.",
            "Du kan også prøve tre ruter vi tok opp hos Nav, Posten og Brønnøysundregistrene. I Nav-eksemplet skal GPT-6.2 Sol åpne dagpengepanelet og finne to behandlingstider i tabellene. Modellen svarte riktig på alle tre rutene med begge verktøysettene. I én kjøring per utgave brukte Booki-agentbroen tre verktøykall på hver rute. Nettleserverktøyet brukte elleve hos Nav, seks hos Posten og tre hos Brønnøysundregistrene. Du kan se hvert kall i eksemplene.",
          )}{" "}
          <a href="/docs/examples#public-browser" className="site-link">
            {t("See the routes and results", "Se rutene og resultatene")}
          </a>
        </p>
      </section>

      <section className="site-article__section" aria-labelledby="start">
        <h2 id="start">{t("Start with one screen", "Begynn med ett skjermbilde")}</h2>
        <p>
          {t(
            "Your API, database, sign-in and other screens stay as they are. Swap one screen's inputs for Booki controls, run its write route through the server guard, and measure before and after.",
            "API, database, innlogging og de andre skjermbildene forblir som de er. Bytt ett skjermbildes felt til Booki-kontroller, la skriveruten gå gjennom serverkontrollen, og mål før og etter.",
          )}
        </p>
        <div className="site-article__actions">
          <Button asChild size="lg">
            <Link to="/docs">{t("Read the docs", "Les dokumentasjonen")}</Link>
          </Button>
          <Button asChild variant="secondary" size="lg">
            <a href={DROP_IN_URL} target="_blank" rel="noreferrer">
              {t("Drop-in guide", "Guide for eksisterende apper")}
            </a>
          </Button>
        </div>
        <p className="site-article__note">
          {t(
            "Booki implements a draft specification any product can adopt: what a screen gives an agent, what stays with a person, and how every step is recorded and checked again.",
            "Booki implementerer et utkast til spesifikasjon som ethvert produkt kan ta i bruk: hva et skjermbilde gir en agent, hva som forblir en persons, og hvordan hvert steg registreres og sjekkes igjen.",
          )}{" "}
          <a href={CONTRACT_URL} target="_blank" rel="noreferrer" className="site-link">
            {t("The Agent Contract", "Agentkontrakten")}
          </a>
        </p>
      </section>

      <Closing
        kicker={t("Open source, MIT", "Åpen kildekode, MIT")}
        title={t("Put one screen in front of an agent.", "Sett ett skjermbilde foran en agent.")}
        text={t(
          "Copy the setup prompt to try Booki on a screen in your app.",
          "Kopier oppsettprompten for å prøve Booki på et skjermbilde i appen deres.",
        )}
        link={{ to: "/docs", label: t("Read the docs", "Les dokumentasjonen") }}
      />
    </main>
  );
}
