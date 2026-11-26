import type { CatalogItem } from "./catalog";
import type { Lang } from "./lib/lang";

/**
 * The docs catalogue in Norwegian. A component keeps its code name as its
 * title (AmountField is what you import); pages and groups get Norwegian names.
 */
const NB: Record<string, { title?: string; description: string }> = {
  introduction: {
    title: "Oversikt",
    description: "Pakkekart og inngangspunkter for @booki-aui/core, react og styles.",
  },
  installation: {
    title: "Installasjon",
    description: "Installer @booki-aui/core, @booki-aui/react og valgfrie stiler.",
  },
  examples: {
    title: "Eksempler",
    description:
      "Én faktura på et vanlig skjema og på Booki, kontrollene i ulike oppsett, og en kontroll dere lager selv.",
  },
  icons: {
    title: "Ikoner",
    description:
      "Duotone-ikoner for regnskaps-UI: søk i dem, kopier importen, bruk dem i React eller et annet rammeverk.",
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
  money: { title: "Penger", description: "Money-hjelpere for heltall i øre fra @booki-aui/core." },
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
  "attestation-status": {
    description: "Viser om en post venter, er godkjent eller avvist. En person tar beslutningen.",
  },
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
      "Saldobalanse der dere kan drille ned til en konto og dens bilag. Skrivebeskyttet, og begrenset for en agent.",
  },
  "aged-balances": {
    description: "Kundefordringer eller leverandørgjeld etter alder. En agent spør hvilke poster som har forfalt.",
  },
  "vat-return": {
    description:
      "En mva-melding regnet ut fra et oppsett dere leverer. En agent kontrollerer den; en person sender inn.",
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
  "deal-pipeline": {
    description:
      "En salgstavle: avtaler i faser, summen per fase og valuta og en vektet prognose. En agent flytter, verdsetter og fordeler avtaler; en verdi uten kilde vises, men summeres aldri; vunnet og tapt er en persons.",
  },
  "activity-timeline": {
    description:
      "En kundes historikk og neste steg: samtaler, e-post, møter, notater og oppgaver. En agent logger og planlegger, merket som agentens; en samtale sier hva den kan kontrolleres mot; å fjerne noe er en persons.",
  },
  "funnel-chart": {
    description:
      "Hvor mange avtaler som nådde hvert steg, konverteringen fra steget før og fra starten, og hvor flest faller fra. En agent leser hvert tall og borer seg ned i et steg.",
  },
  "forecast-chart": {
    description:
      "Vunnet, sikker, beste fall og vektet inntekt per måned eller kvartal, fra de samme avtalene som salgsløpet. Tapte avtaler og beløp uten kilde holdes utenfor, og avtaler uten dato navngis.",
  },
  "recurring-revenue": {
    description:
      "Løpende inntekter fra én dato til en annen: inngående, nye, økning, reduksjon, tapt og utgående, som går nøyaktig opp, som MRR eller ARR. Hver bevegelse navngir kundene sine.",
  },
  "stage-duration": {
    description:
      "Hvor lenge avtaler blir i hver fase: median og lengste opphold, et mål per fase, og avtalene som er over det.",
  },
  button: {
    description:
      "En vanlig knapp i tre tyngder: primary for den ene handlingen som betyr mest i en seksjon, secondary for de andre valgene, ghost for en stille handling inne i en annen flate. En agent trykker den etter ordene; data-agent-confirm holder et steg for personen.",
  },
  "confirm-dialog": {
    description:
      "Et spørsmål en person svarer på før noe skjer: bokføre, betale, frigi. En agent kan lese det og avbryte, aldri si ja; bekreftelsesord og asynkront arbeid er innebygd.",
  },
  toasts: {
    description:
      "Kvitteringer for det som nettopp skjedde. Det en agent gjorde, merkes med agentens tegn og kan angres, gjennom useAgentToasts.",
  },
  "agent-status": {
    description:
      "Én kort linje som forteller en person hva agenten gjør: ledig, arbeider, venter på en person, ferdig eller avvist. Limegrønt bare for agentens eget arbeid; agenten selv leser den aldri.",
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
  "document-editor": {
    description:
      "En blokkeditor for arbeidspapirer: «/» åpner kommandoer og «@» nevner filene, bilagene, personene og sidene appen gir den. Angre og Gjør om gjelder både tekst og blokkendringer. En agent leser siden som blokker og foreslår å sette inn, endre, flytte og fjerne; hvert forslag venter i agentens farge til en person godtar eller avviser det.",
  },
  "data-table": {
    description:
      "Enhver liste med poster, med det folk forventer: sortering, søk, filter per kolonne, sider, kolonner, utvalg, summer, CSV og tomme, lastende og feilende tilstander. Kolonnene er data; agenter leser siden og tellingene, og kaller de samme handlingene.",
  },
  "kpi-stat": {
    description:
      "Ett tall mot perioden før, med en sparkline. Dere angir om en økning er positiv; agenten leser verdien, endringen og om den er gunstig.",
  },
  "trend-chart": {
    description:
      "Måneder eller kvartaler for én eller flere serier, med periodevalg og drilling. Agenten leser hver periode som heltall i øre, ikke piksler.",
  },
  "bar-chart": {
    description:
      "Største først, resten samlet i Annet. Kostnad per konto, omsetning per kunde; agenten kan endre grensen og drille inn i en søyle.",
  },
  "aging-chart": {
    description:
      "Fordringer eller gjeld etter alder: ikke forfalt, 1–30, 31–60, 61–90, over 90 dager, med andelen forfalt og motpartene med mest forfalt.",
  },
  "cashflow-waterfall": {
    description: "Inngående saldo, hver inn- og utbetaling, utgående saldo, og en kontroll på at det går opp.",
  },
  "chart-of-accounts": {
    description:
      "Hele kontoplanen under kontoklassene, med søk, filtre, redigering i linjen og kontroller: doble kontonumre, numre utenfor klassen, manglende SAF-T-kobling. En agent foreslår; en person tar endringen i bruk.",
  },
  "account-picker": { description: "Entydig valg fra kontoplanen." },
  "tax-code-select": { description: "Norske mva-koder / amerikanske sales tax-koder fra BookiLocale-profilen." },
  "payment-confirm": { description: "Skriv APPROVE + data-agent-confirm." },
  "approval-gate": { description: "Attestasjonsdialog for forslag fra en agent." },
  "exception-banner": { description: "Eskaler / stopp for menneskelig gjennomgang." },
  "sca-prompt": { description: "Simulert sterk autentisering med BankID (NO) eller passkey (US)." },
  "audit-trail": { description: "Hvem endret hva, også når det var en agent." },
  "country-toggle": { description: "Bytt BookiLocale mellom Norge og USA." },
  "icon-button": {
    description:
      "En knapp som viser et ikon og har navn etter hva den gjør. Etiketten er navnet og verktøytipset, så agenten trykker på den med de ordene.",
  },
  "text-link": {
    description: "En lenke i Bookis utseende, med valgfritt ikon. Navigasjon, ikke en agenthandling.",
  },
  card: {
    description:
      "En papirflate for én arbeidsoppgave: en tittel som gir den navn, handlinger ved tittelen, innholdet og en bunnlinje.",
  },
  field: {
    description:
      "En etikett, én kontroll, et hint og en feilmelding, koblet sammen. Et vanlig tekstfelt inni blir et agenten fyller ut etter etiketten.",
  },
  toolbar: {
    description:
      "En rad med handlinger med ett tabulatorstopp og piltaster mellom dem. Agenten leser den som én navngitt liste med knapper.",
  },
  "agent-cursor": {
    description: "Agentens synlige peker: før hvert steg glir den til kontrollen, markerer den og trykker.",
  },
  "agent-presence": {
    description: "En liten merkelapp på kontrollen agenten endrer, lest opp for skjermlesere.",
  },
  "agent-proposal": {
    description: "Agentens forslag vist i de ekte kontrollene, med Behold og Angre for personen.",
  },
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
