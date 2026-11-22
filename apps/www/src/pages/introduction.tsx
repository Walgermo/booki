import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/lang";

type Text = { en: string; nb: string };

const CONTRACT: { rule: Text; how: Text }[] = [
  {
    rule: { en: "Money is whole minor units", nb: "Penger er hele minor units" },
    how: {
      en: "Amounts are integers of øre or cents. A fraction is rejected at the action, before it reaches a voucher.",
      nb: "Beløp er heltall i øre eller cent. En brøk avvises i handlingen, før den når et bilag.",
    },
  },
  {
    rule: { en: "A voucher balances or it is not posted", nb: "Et bilag balanserer, ellers bokføres det ikke" },
    how: {
      en: "Debit and credit are summed on every change. assertBalance fails with the exact difference.",
      nb: "Debet og kredit summeres ved hver endring. assertBalance feiler med den nøyaktige differansen.",
    },
  },
  {
    rule: { en: "Codes come from a closed list", nb: "Koder kommer fra en lukket liste" },
    how: {
      en: "Tax codes, accounts, periods and currencies only accept listed values. The error names the valid ones.",
      nb: "MVA-koder, kontoer, perioder og valutaer tar bare imot verdier fra listen. Feilen navngir de gyldige.",
    },
  },
  {
    rule: { en: "People approve what leaves the account", nb: "Mennesker godkjenner det som forlater kontoen" },
    how: {
      en: "Posting, paying and attesting are marked for a person. An agent’s press fails unless your app says yes.",
      nb: "Bokføring, betaling og attestering er merket for en person. Et trykk fra en agent feiler med mindre appen din sier ja.",
    },
  },
  {
    rule: { en: "Bank details stay unread", nb: "Bankopplysninger forblir uleste" },
    how: {
      en: "Account numbers, IBAN and KID read as [redacted] in snapshots, results and change events.",
      nb: "Kontonumre, IBAN og KID leses som [redacted] i snapshots, resultater og endringshendelser.",
    },
  },
  {
    rule: { en: "Agent edits are attributable", nb: "Endringer fra en agent kan spores" },
    how: {
      en: "Every change reports whether an agent or a person made it, so your audit log can name the actor.",
      nb: "Hver endring sier om en agent eller en person gjorde den, så revisjonssporet ditt kan navngi hvem.",
    },
  },
];

const PACKAGES: [string, Text][] = [
  [
    "@booki/core",
    {
      en: "Integer money, country profiles, validators and voucher helpers. No framework.",
      nb: "Penger i heltall, landprofiler, validatorer og bilagshjelpere. Uten rammeverk.",
    },
  ],
  [
    "@booki/react",
    {
      en: "Unstyled React controls that agents operate through typed actions.",
      nb: "Ustylede React-kontroller som agenter styrer gjennom typede handlinger.",
    },
  ],
  [
    "@booki/styles",
    {
      en: "Optional default look: CSS variables and data-slot selectors.",
      nb: "Valgfritt standarduttrykk: CSS-variabler og data-slot-selektorer.",
    },
  ],
];

/** Docs overview: what the library guarantees, then where to go. */
export function IntroductionPage() {
  const { lang, t } = useLang();
  return (
    <article>
      <h1 className="site-page-title mt-0 mb-0">
        {t("A posting contract for accounting agents", "En bokføringskontrakt for regnskapsagenter")}
      </h1>
      <p className="mt-4 mb-0 max-w-prose text-lg leading-relaxed text-muted-foreground text-pretty">
        {t(
          "Booki is a set of React controls for money, vouchers, bank details and approvals. Agents operate them through typed actions, and the controls hold six rules whatever the agent sends.",
          "Booki er et sett React-kontroller for penger, bilag, bankopplysninger og godkjenninger. Agenter styrer dem gjennom typede handlinger, og kontrollene holder seks regler uansett hva agenten sender.",
        )}
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button asChild>
          <Link to="/docs/installation">{t("Install", "Installer")}</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link to="/demo">{t("Open the demo", "Åpne demoen")}</Link>
        </Button>
      </div>

      <h2 className="mt-16 mb-0 text-2xl font-semibold tracking-[-0.03em]">{t("The contract", "Kontrakten")}</h2>
      <dl className="site-rows mt-4 mb-0">
        {CONTRACT.map((row) => (
          <div key={row.rule.en} className="grid gap-1 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:gap-8">
            <dt className="text-sm font-medium">{row.rule[lang]}</dt>
            <dd className="m-0 text-sm text-muted-foreground">{row.how[lang]}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 mb-0 max-w-prose text-sm text-muted-foreground">
        {t(
          "Every component page shows what the agent reads beside what the person sees, so you can check each rule against the real control.",
          "Hver komponentside viser hva agenten leser ved siden av det personen ser, så du kan sjekke hver regel mot den ekte kontrollen.",
        )}
      </p>

      <h2 className="mt-16 mb-0 text-2xl font-semibold tracking-[-0.03em]">{t("Packages", "Pakker")}</h2>
      <dl className="site-rows mt-4 mb-0 max-w-prose">
        {PACKAGES.map(([name, role]) => (
          <div key={name}>
            <dt>
              <code>{name}</code>
            </dt>
            <dd className="m-0 max-w-prose text-sm text-muted-foreground">{role[lang]}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
