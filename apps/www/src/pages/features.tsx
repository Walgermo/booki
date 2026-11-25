import {
  AccountPicker,
  AmountField,
  BankAccountInput,
  FinancialDateField,
  OrganizationNumberInput,
  PaymentReferenceInput,
  TaxCodeSelect,
  TextLink,
} from "@booki-aui/react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { InstallBlock } from "@/components/install-block";
import { Section } from "@/components/section";
import { usePageMeta, useLang, type PageMeta } from "@/lib/lang";

import { GAP_PREVIEWS } from "./gap-previews";

const META: PageMeta = {
  title: { en: "Features · Booki", nb: "Funksjoner · Booki" },
  description: {
    en: "What Booki offers, with live examples: fields that know accounting, workflows people decide, audit, working papers as stacked sheets, reports an agent reads as numbers, and the same rules on the server.",
    nb: "Hva Booki tilbyr, med levende eksempler: felt som kan regnskap, arbeidsflyter mennesker bestemmer, revisjon, arbeidspapirer som stablede ark, rapporter en agent leser som tall, og de samme reglene på serveren.",
  },
};

const ACCOUNTS = [
  { number: "1500", name: "Kundefordringer" },
  { number: "1920", name: "Bankinnskudd" },
  { number: "2400", name: "Leverandørgjeld" },
  { number: "6300", name: "Leie lokale" },
  { number: "6800", name: "Kontorrekvisita" },
];

const GUARD = `import { advise, guard, toHttp } from "@booki-aui/core/server"

// The actor your sign-in established; an agent has its own credential.
const verdict = guard({ actor, scope: engagementId, locale: "nb" }, "audit.sign-off", () => sign(page))
// An agent is refused "audit.sign-off" whatever its roles: it is a person's decision.

// Where the rule is professional judgment, the findings come back as warnings.
const advice = advise({ actor, scope: engagementId }, "audit.conclude", () => assertReadyToConclude(area))

const { status, body } = toHttp(verdict)`;

const STYLES = `/* app/globals.css: under your utilities, in your colours */
@layer theme, base, booki, components, utilities;
@import "@booki-aui/styles" layer(booki);
@import "@booki-aui/styles/shadcn.css" layer(booki);`;

/** A live example on its sheet of paper, with a link to its page in the docs. */
function Example({ docs, children }: { docs: string; children: ReactNode }) {
  const { t } = useLang();
  return (
    <div className="grid gap-2">
      <div className="site-sheet min-w-0">{children}</div>
      <p className="m-0 text-sm">
        <TextLink asChild>
          <Link to={`/docs/${docs}`}>{t("In the docs", "I dokumentasjonen")}</Link>
        </TextLink>
      </p>
    </div>
  );
}

function Preview({ name }: { name: string }) {
  const Live = GAP_PREVIEWS[name];
  return Live ? <Live /> : null;
}

function Points({ items }: { items: string[] }) {
  return (
    <ul className="m-0 grid max-w-[64ch] list-disc gap-1.5 pl-5 text-muted-foreground">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/**
 * What Booki offers, one capability per section, each with the live control
 * and the rule it holds. Every example is the real component, on the site's
 * one agent bridge.
 */
export function FeaturesPage() {
  const { t } = useLang();

  usePageMeta(META);

  return (
    <article className="grid gap-4 pb-16">
      <header className="grid gap-4 pt-10 pb-6">
        <p className="site-kicker m-0">{t("Features", "Funksjoner")}</p>
        <h1 className="site-page-title m-0 max-w-[22ch] text-balance">
          {t(
            "Everything an accounting screen needs, ready for an agent",
            "Alt et regnskapsskjermbilde trenger, klart for en agent",
          )}
        </h1>
        <p className="m-0 max-w-[62ch] text-lg leading-relaxed text-muted-foreground text-pretty">
          {t(
            "Fields, vouchers, workflows, audit, reports and working papers. A person uses them like any form; an agent reads and operates the same controls by name, and the decisions that belong to people stay with people.",
            "Felt, bilag, arbeidsflyter, revisjon, rapporter og arbeidspapirer. En person bruker dem som et vanlig skjema; en agent leser og styrer de samme kontrollene ved navn, og beslutningene som hører mennesker til, blir hos mennesker.",
          )}
        </p>
      </header>

      <Section
        id="fields"
        title={t("Fields that know accounting", "Felt som kan regnskap")}
        note={t(
          "Money in whole øre, numbers checked, lists closed.",
          "Penger i hele øre, numre kontrollert, lister lukket.",
        )}
      >
        <div className="grid gap-5">
          <Points
            items={[
              t(
                "Amounts are whole minor units: a fraction is refused before it reaches a voucher.",
                "Beløp er heltall i øre: en brøkdel av en øre avvises før den når et bilag.",
              ),
              t(
                "Account numbers, KID and organisation numbers are checked (mod 10, mod 11).",
                "Kontonumre, KID og organisasjonsnumre kontrolleres (mod 10, mod 11).",
              ),
              t(
                "Accounts and VAT codes come from a closed list; the refusal names the valid ones.",
                "Kontoer og mva-koder kommer fra en lukket liste; avvisningen navngir de gyldige.",
              ),
              t(
                "Bank details read as [redacted] to an agent, in snapshots and in change events.",
                "Bankopplysninger leses som [redacted] av en agent, i øyeblikksbilder og i endringshendelser.",
              ),
            ]}
          />
          <Example docs="amount-field">
            <div className="grid gap-4 sm:grid-cols-2">
              <AmountField aria-label={t("Amount excl. VAT", "Beløp eks. mva")} defaultValue={1_550_000} />
              <FinancialDateField aria-label={t("Posting date", "Bokføringsdato")} defaultValue="2026-10-31" />
              <AccountPicker aria-label={t("Account", "Konto")} accounts={ACCOUNTS} defaultValue="6800" />
              <TaxCodeSelect aria-label={t("VAT code", "mva-kode")} />
              <BankAccountInput aria-label={t("Account number", "Kontonummer")} />
              <PaymentReferenceInput aria-label="KID" />
              <OrganizationNumberInput aria-label={t("Organisation number", "Organisasjonsnummer")} />
            </div>
          </Example>
        </div>
      </Section>

      <Section
        id="workflows"
        title={t("Workflows people decide", "Arbeidsflyter mennesker bestemmer")}
        note={t(
          "An agent prepares; a person approves, signs and releases.",
          "En agent forbereder; en person godkjenner, signerer og frigir.",
        )}
      >
        <div className="grid gap-5">
          <Points
            items={[
              t(
                "Approving, signing off, releasing and submitting are a person's buttons, never an agent's actions.",
                "Godkjenning, signering, frigivelse og innsending er forbeholdt en person, aldri en agents handlinger.",
              ),
              t(
                "Supplier invoices are coded by the agent and approved by a person; duplicates are named.",
                "Leverandørfakturaer konteres av agenten og attesteres av en person; duplikater flagges.",
              ),
              t(
                "Separation of duties is built in: who approved a payment cannot release it.",
                "Arbeidsdeling er innebygd: den som godkjente en betaling, kan ikke frigi den.",
              ),
            ]}
          />
          <Example docs="supplier-invoice-inbox">
            <Preview name="supplier-invoice-inbox" />
          </Example>
        </div>
      </Section>

      <Section
        id="audit"
        title={t("Audit, with judgment kept human", "Revisjon, med skjønnet hos mennesker")}
        note={t(
          "Materiality, samples, findings and requests to the client.",
          "Vesentlighet, utvalg, funn og forespørsler til klienten.",
        )}
      >
        <div className="grid gap-5">
          <Points
            items={[
              t(
                "A reproducible sample, tick marks and two sign-offs on every workpaper.",
                "Et reproduserbart utvalg, avkrysninger og to signaturer på hvert arbeidspapir.",
              ),
              t(
                "Findings carry their basis and evidence; a confidential finding is never read by the agent.",
                "Hvert funn har grunnlag og dokumentasjon; et fortrolig funn leses aldri av agenten.",
              ),
              t(
                "What the rules find is a warning to weigh, never a hard stop on professional judgment.",
                "Det reglene finner, er en advarsel å vurdere, aldri en hard sperre på faglig skjønn.",
              ),
            ]}
          />
          <Example docs="audit-findings">
            <Preview name="audit-findings" />
          </Example>
        </div>
      </Section>

      <Section
        id="papers"
        title={t("Working papers as stacked sheets", "Arbeidspapirer som stablede ark")}
        note={t(
          "Open a line, it lies over the page; a ledger lies beside it.",
          "Åpne en linje, den legger seg over siden; en hovedbok legger seg ved siden av.",
        )}
      >
        <div className="grid gap-5">
          <Points
            items={[
              t(
                "Sheets stack with a readable strip or a spine; only the top sheet takes input.",
                "Ark stables med en lesbar stripe eller en rygg; bare det øverste arket tar imot.",
              ),
              t(
                "Sign-off per level, bound to the version signed: a later edit marks it, never withdraws it.",
                "Signering per nivå, bundet til versjonen som ble signert: en senere endring markerer den, men trekker den aldri tilbake.",
              ),
              t(
                "Open points go with the signature instead of blocking it.",
                "Åpne punkter følger signaturen i stedet for å sperre den.",
              ),
            ]}
          />
          <Example docs="sheet-stack">
            <Preview name="sheet-stack" />
          </Example>
          <Example docs="document-signoff">
            <Preview name="document-signoff" />
          </Example>
        </div>
      </Section>

      <Section
        id="reports"
        title={t("Reports an agent reads as numbers", "Rapporter en agent leser som tall")}
        note={t(
          "Trial balance, ledger, ageing and charts: figures, not pixels.",
          "Saldobalanse, hovedbok, aldersfordeling og grafer: tall, ikke piksler.",
        )}
      >
        <div className="grid gap-5">
          <Points
            items={[
              t(
                "A trial balance with drill-down to the account and its vouchers.",
                "En saldobalanse der dere kan drille ned til kontoen og bilagene.",
              ),
              t(
                "Charts expose every period as minor units, so an agent never reads a tooltip.",
                "Grafer gir hver periode som heltall i øre, så en agent aldri leser et verktøytips.",
              ),
              t(
                "Lists sort, search, page and export to CSV the same way everywhere.",
                "Lister sorterer, søker, blar og eksporterer til CSV på samme måte overalt.",
              ),
            ]}
          />
          <Example docs="ledger-table">
            <Preview name="ledger-table" />
          </Example>
          <Example docs="trend-chart">
            <Preview name="trend-chart" />
          </Example>
        </div>
      </Section>

      <Section
        id="server"
        title={t("The same rules on the server", "De samme reglene på serveren")}
        note={t("A browser is not a security boundary.", "En nettleser er ingen sikkerhetsgrense.")}
      >
        <div className="grid gap-5">
          <Points
            items={[
              t(
                "Every write route runs through one guard, with the actor your sign-in established.",
                "Hvert skrivende API-kall går gjennom samme kontroll, med aktøren innloggingen fastslo.",
              ),
              t(
                "Roles per engagement, independence for the quality reviewer, and a required reason to withdraw.",
                "Roller per oppdrag, uavhengighet for oppdragskontrolløren og påkrevd begrunnelse for å trekke noe tilbake.",
              ),
              t(
                "The audit line names the agent, whose session it ran in, its client and its grant.",
                "Linjen i revisjonssporet navngir agenten, hvis økt den kjørte i, OAuth-klienten og tilgangen.",
              ),
            ]}
          />
          <InstallBlock label="@booki-aui/core/server" command={GUARD} />
        </div>
      </Section>

      <Section
        id="fit"
        title={t("Fits the product you have", "Passer inn i produktet dere har")}
        note={t(
          "React (supported), and Vue, Svelte, Solid and Web Components (experimental), from one definition.",
          "React (støttet), og Vue, Svelte, Solid og Web Components (eksperimentelle), fra én definisjon.",
        )}
      >
        <div className="grid gap-5">
          <Points
            items={[
              t("Client modules ready for Server Components.", "Klientmoduler klare for Server Components."),
              t(
                "Unstyled by default; the optional look stays inside Booki and takes your theme's colours.",
                "Ustylet som standard; det valgfrie utseendet holder seg inne i Booki og tar fargene fra temaet deres.",
              ),
              t(
                "Exact conversion from decimal text in your database to whole øre, and back.",
                "Eksakt omregning fra desimaltekst i databasen til hele øre, og tilbake.",
              ),
              t(
                "Norwegian and US profiles (supported), with experimental starters for Sweden, Denmark, the UK and Germany.",
                "Norsk og amerikansk profil (støttet), med eksperimentelle startprofiler for Sverige, Danmark, Storbritannia og Tyskland.",
              ),
            ]}
          />
          <InstallBlock label="CSS" command={STYLES} />
          <p className="m-0 text-sm">
            <TextLink asChild icon="docs">
              <Link to="/docs/installation">{t("Install Booki", "Installer Booki")}</Link>
            </TextLink>
          </p>
        </div>
      </Section>
    </article>
  );
}
