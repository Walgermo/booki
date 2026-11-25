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

const DROP_IN_URL = `${REPO_URL}/blob/main/docs/drop-in.md`;
const PILOT_URL = `${REPO_URL}/blob/main/docs/pilot.md`;
const CONTRACT_URL = `${REPO_URL}/blob/main/spec/agent-contract.md`;

/**
 * The launch post, as an article: why, one step end to end, the layers, what
 * is not ready, and how to start. Three diagrams carry what prose would take a
 * page for; the details live in the docs. Every figure is read from the
 * benchmark's own data (src/data/bench.json).
 */
export function AnnouncementPage() {
  const { lang, t } = useLang();
  usePageMeta(META);
  const f = formatters(lang);
  const kpi = proofKpis();
  const published = new Date("2026-11-25").toLocaleDateString(lang === "nb" ? "nb-NO" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <main className="site-article">
      <header className="site-article__head">
        <p className="site-kicker">
          {t("Announcement", "Lansering")} · <time dateTime="2026-11-25">{published}</time>
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
            `The same tasks on screens rebuilt from two accounting systems, and on Booki: Claude Opus, Sonnet and Haiku 5.5 and DeepSeek V4.1 Flash, five runs per screen and model, the result checked after every run. Cost at list price. The screens use invented data and were never run against the real systems, so your own will differ; the pilot measures them. Every page, script and call is in the repository: pnpm proof.`,
            `De samme oppgavene på skjermbilder gjenskapt fra to regnskapssystemer, og på Booki: Claude Opus, Sonnet og Haiku 5.5 og DeepSeek V4.1 Flash, fem kjøringer per skjermbilde og modell, resultatet kontrollert etter hver kjøring. Kostnad til listepris. Skjermbildene har oppdiktede data og ble aldri kjørt mot de ekte systemene, så deres egne vil gi andre tall; piloten måler dem. Hver side, hvert skript og hvert kall ligger i repoet: pnpm proof.`,
          )}
        </p>
      </section>

      <section className="site-article__section" aria-labelledby="not-ready">
        <h2 id="not-ready">{t("What is not ready", "Hva som ikke er klart")}</h2>
        <ul>
          <li>
            {t(
              "The packages are at 0.1 and not on npm yet: you build them from the repository, and the agent bridge may still change.",
              "Pakkene er på 0.1 og ikke på npm ennå: dere bygger dem fra repoet, og agentbroen kan fortsatt endre seg.",
            )}
          </li>
          <li>
            {t(
              "No production users yet, and one maintainer. Everything is MIT and runs in your app; nothing depends on a service.",
              "Ingen brukere i produksjon ennå, og én vedlikeholder. Alt er MIT og kjører i appen deres; ingenting avhenger av en tjeneste.",
            )}
          </li>
          <li>
            {t(
              "Ready-made server guards cover approvals, payments, invoices and more; other writes need a rule of your own.",
              "Ferdige serverkontroller dekker godkjenning, betalinger, fakturaer og mer; andre skriveoperasjoner trenger en egen regel.",
            )}
          </li>
        </ul>
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
          <Button asChild variant="secondary" size="lg">
            <a href={PILOT_URL} target="_blank" rel="noreferrer">
              {t("Two-week pilot", "Pilot på to uker")}
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
          "Read the docs, try the demo, or open an issue to say which screen you would pilot.",
          "Les dokumentasjonen, prøv demoen, eller opprett en issue og si hvilket skjermbilde dere ville pilotert.",
        )}
        link={{ to: "/docs", label: t("Read the docs", "Les dokumentasjonen") }}
      />
    </main>
  );
}
