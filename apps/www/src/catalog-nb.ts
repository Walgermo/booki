import type { CatalogItem } from "./catalog";
import type { Lang } from "./lib/lang";

/**
 * The docs catalogue in Norwegian. A component keeps its code name as its
 * title (AmountField is what you import); pages and groups get Norwegian names.
 */
const NB: Record<string, { title?: string; description: string }> = {
  introduction: { title: "Oversikt", description: "Pakkekart og inngangspunkter for @booki/core, react og styles." },
  installation: { title: "Installasjon", description: "Installer @booki/core, @booki/react og valgfrie stiler." },
  examples: {
    title: "Eksempler",
    description:
      "Én faktura på et vanlig skjema og på Booki, kontrollene i ulike oppsett, og en kontroll du lager selv.",
  },
  demo: {
    title: "Demo",
    description:
      "Et fungerende skjermbilde for utgående faktura som en agent kan styre, med menneskelige kontrollpunkter på plass.",
  },
  "month-end": {
    title: "Månedsavslutning",
    description:
      "En månedsavslutning en agent jobber seg gjennom: sjekkliste, periodelås, avstemming og avslutningsbilaget.",
  },
  "erp-teams": {
    title: "For ERP-team",
    description: "Hva en pilot på ett skjermbilde krever, og hva som ikke er klart ennå.",
  },
  money: { title: "Penger", description: "Money-hjelpere for heltall i øre fra @booki/core." },
  "amount-field": {
    description: "definePrimitive-beløp: agenten bruker setMinor / clear; heltall i øre inn og ut.",
  },
  "amount-input": { description: "Kompatibilitetsinnpakning rundt AmountField (eldre Money-tilbakekall)." },
  "money-amount": { description: "Viser Money med tabulære tall og valuta etter land- og språkinnstillingen." },
  "currency-select": { description: "Valutavelger for NOK / USD (kan utvides)." },
  "bank-account-input": { description: "Kontonummer (NO) eller ABA-routing og konto (US)." },
  "payment-reference-input": { description: "KID (NO) eller betalingsmelding (US)." },
  "organization-number-input": { description: "Norsk organisasjonsnummer (mod11) eller amerikansk EIN." },
  "iban-input": { description: "IBAN med kontrollsifre; hemmelig; utleder norsk kontonummer." },
  "financial-date-field": { description: "Faktura-, forfalls- eller bokføringsdato (ISO) for agenter." },
  "accounting-period-select": { description: "Velger for år, måned eller mva-termin fra en fast liste." },
  "invoice-number-input": { description: "Leverandør- eller salgsfakturanummer / dokumentnummer." },
  "attestation-status": { description: "Venter / godkjent / avvist, med handlinger som krever bekreftelse." },
  "voucher-lines": { description: "Skrivebeskyttet debet/kredit-tabell med balanse i bunnen." },
  "voucher-composer": { description: "Bilag en agent kan føre: addLine, setDebit/Credit, assertBalance." },
  "bank-reconciliation": {
    description: "Avstem banktransaksjoner mot åpne poster. En agent foreslår treff; en person godkjenner dem.",
  },
  "approval-chain": {
    description:
      "Godkjenning i nivåer med beløpsgrenser og stedfortredere. En agent leser hvor saken står; bare rett person bestemmer.",
  },
  "period-lock": {
    description: "Åpne, lukkede og låste perioder. En agent spør om en dato kan bokføres; en person lukker og låser.",
  },
  "close-checklist": {
    description: "Oppgavene i en periodeavslutning i rekkefølge. En agent forbereder dem; en annen person signerer.",
  },
  "invoice-editor": {
    description:
      "Faktura- og kreditnotalinjer med summer regnet ut fra dem. En agent lager utkast; en person ferdigstiller.",
  },
  "payment-batch": {
    description:
      "En betalingskjøring som krever to personer. Kontonumre holdes skjult for agenten; duplikater flagges.",
  },
  "supplier-invoice-inbox": {
    description:
      "Innkommende leverandørfakturaer med utleste felt. En agent retter og konterer; en person attesterer. Duplikater flagges.",
  },
  "evidence-list": {
    description:
      "Vedlegg knyttet til en postering. En agent kobler og klassifiserer; posteringen vet hvilken dokumentasjon som mangler.",
  },
  "expense-claim": {
    description: "Utlegg, kjøregodtgjørelse og diett mot et regelverk. Unntak krever en annen person.",
  },
  "ledger-table": {
    description:
      "Saldobalanse der du kan drille ned til en konto og dens bilag. Skrivebeskyttet, og begrenset for en agent.",
  },
  "aged-balances": {
    description: "Kundefordringer eller leverandørgjeld etter alder. En agent spør hvilke poster som har forfalt.",
  },
  "vat-return": {
    description: "En mva-melding regnet ut fra et oppsett du leverer. En agent kontrollerer den; en person sender inn.",
  },
  "audit-workpaper": {
    description:
      "Vesentlighet, et reproduserbart utvalg, avkrysninger og to signaturer. En agent tester; mennesker konkluderer og signerer.",
  },
  "audit-findings": {
    description:
      "Oppdragets funn, hvert med grunnlag og dokumentasjon. En agent lager utkast og viser til kilder; en person bekrefter eller trekker tilbake, og et fortrolig funn forblir ulest.",
  },
  "client-requests": {
    description:
      "Forespørsler til klienten, med frister og svar. En agent lager utkast og registrerer svar; en person sender, purrer og vurderer. E-postadressen når aldri agenten.",
  },
  "confirm-dialog": {
    description:
      "Et spørsmål en person svarer på før noe skjer: bokføre, betale, frigi. En agent kan lese det og avbryte, aldri si ja; bekreftelsesord og asynkront arbeid er innebygd.",
  },
  toasts: {
    description:
      "Kvitteringer for det som nettopp skjedde. Det en agent gjorde, merkes med agentens tegn og kan angres, gjennom useAgentToasts.",
  },
  "document-signoff": {
    description:
      "Signeringslinjen som avslutter et arbeidspapir: utført, gjennomgått, godkjent, hver bundet til versjonen som ble signert. Åpne punkter følger signaturen som standard; et firma kan sette blockOpenPoints for å nekte signering til de er lukket. En senere endring markerer den, men trekker den aldri tilbake.",
  },
  "sheet-stack": {
    description:
      "En side og arkene som åpnes fra den, stablet, med hovedboken ved siden av på en bred skjerm. Bare det øverste arket tar imot; en agent kan gå tilbake og lukke.",
  },
  "fixed-asset-register": {
    description: "Driftsmidler, avskrivningsplaner og en foreslått kjøring. En agent foreslår; en person bekrefter.",
  },
  "data-table": {
    description:
      "Enhver liste med poster, med det folk forventer: sortering, søk, filter per kolonne, sider, kolonner, utvalg, summer, CSV og tomme, lastende og feilende tilstander. Kolonnene er data; agenter leser siden og tellingene, og kaller de samme handlingene.",
  },
  "kpi-stat": {
    description:
      "Ett tall mot perioden før, med en sparkline. Du angir om en økning er positiv; agenten leser verdien, endringen og om den er gunstig.",
  },
  "trend-chart": {
    description:
      "Måneder eller kvartaler for én eller flere serier, med periodevalg og drilling. Agenten leser hver periode som heltall i øre, ikke piksler.",
  },
  "bar-chart": {
    description:
      "Største først, resten samlet i Annet. Kostnad per konto, omsetning per kunde; agenten kan endre grensen og drille inn i en stolpe.",
  },
  "aging-chart": {
    description:
      "Fordringer eller gjeld etter alder: ikke forfalt, 1–30, 31–60, 61–90, over 90 dager, med andelen forfalt og motpartene med mest forfalt.",
  },
  "cashflow-waterfall": {
    description: "Inngående saldo, hver inn- og utbetaling, utgående saldo, og en kontroll på at det går opp.",
  },
  "account-picker": { description: "Entydig valg fra kontoplanen." },
  "tax-code-select": { description: "Norske mva-koder / amerikanske sales tax-koder fra BookiLocale-profilen." },
  "payment-confirm": { description: "Skriv APPROVE + data-agent-confirm." },
  "approval-gate": { description: "Attestasjonsdialog for forslag fra en agent." },
  "exception-banner": { description: "Eskaler / stopp for menneskelig gjennomgang." },
  "sca-prompt": { description: "Simulert sterk autentisering med BankID (NO) eller passkey (US)." },
  "audit-trail": { description: "Hvem endret hva, også når det var en agent." },
  "country-toggle": { description: "Bytt BookiLocale mellom Norge og USA." },
};

const GROUP_NB: Record<CatalogItem["group"], string> = {
  "Getting started": "Kom i gang",
  Core: "Core",
  React: "React",
};

/** An entry's title and description in the site's language. */
export function catalogText(item: CatalogItem, lang: Lang): { title: string; description: string } {
  if (lang !== "nb") return { title: item.title, description: item.description };
  const nb = NB[item.name];
  return { title: nb?.title ?? item.title, description: nb?.description ?? item.description };
}

/** A sidebar group's name in the site's language. */
export function groupName(group: CatalogItem["group"], lang: Lang): string {
  return lang === "nb" ? GROUP_NB[group] : group;
}
