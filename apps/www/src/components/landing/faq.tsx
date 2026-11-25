import { useEffect } from "react";

import { Section } from "@/components/section";
import { Disclosure } from "@/components/two-readers";
import { useLang } from "@/lib/lang";

type Item = { q: [en: string, nb: string]; a: [en: string, nb: string] };

const ITEMS: Item[] = [
  {
    q: ["What is Booki?", "Hva er Booki?"],
    a: [
      "Ready-made controls for accounting screens: amounts, accounts, VAT, vouchers, invoices, bank and approval. A person uses them like any form. An AI agent reads them as typed state and calls named actions, under the rules you set, and every step lands in your audit trail. The name is a small play on words: book and UI, in one.",
      "Ferdige kontroller for regnskapsskjermbilder: beløp, konto, mva, bilag, faktura, bank og attestering. En person bruker dem som et vanlig skjema. En AI-agent leser tilstanden deres som strukturerte data og kaller navngitte handlinger, under reglene dere setter, og hvert steg havner i revisjonssporet. Navnet er et lite ordspill: bok og UI, i ett.",
    ],
  },
  {
    q: ["How is this different from MCP?", "Hva er forskjellen fra MCP?"],
    a: [
      "An MCP server gives the agent your API as tools: it works behind the screen, and the person sees the result afterwards. That is a second product surface you design, secure and keep in step with the UI. Booki puts the agent on the screen the person already uses, with the same validation and rules as their own clicks, a visible cursor, and approvals that stay a person's. They go together: Booki publishes its controls as tools over WebMCP, so an agent that speaks MCP can use them directly.",
      "En MCP-server gir agenten API-et deres som verktøy: den jobber bak skjermen, og personen ser resultatet etterpå. Det er en ekstra flate i produktet som må designes, sikres og holdes i takt med UI-et. Booki setter agenten i skjermbildet personen allerede bruker, med samme validering og regler som personens egne klikk, en synlig cursor og attestering som fortsatt er en persons. De to går sammen: Booki publiserer kontrollene som verktøy over WebMCP, så en agent som snakker MCP kan bruke dem direkte.",
    ],
  },
  {
    q: ["Why not just give the agent our API?", "Hvorfor ikke bare gi agenten API-et vårt?"],
    a: [
      "For work nobody watches, like posting a thousand vouchers from a file overnight, an API is cheaper and simpler: use it. Booki is for the steps a person sees, corrects and decides in the screen they already use: the agent works there, the person watches, and approving stays theirs. Booki has not yet been measured against an agent on an API; that measurement is next, and the figures will be on this page whichever way they go.",
      "For arbeid ingen ser på, som å bokføre tusen bilag fra en fil i løpet av natten, er et API billigere og enklere: bruk det. Booki er for stegene en person ser, retter og avgjør i skjermbildet de allerede bruker: agenten jobber der, personen ser på, og attesteringen er fortsatt deres. Booki er ennå ikke målt mot en agent på et API. Den målingen kommer, og tallene havner på denne siden uansett hvordan de blir.",
    ],
  },
  {
    q: ["Do we have to rebuild our frontend?", "Må vi bygge om frontenden?"],
    a: [
      "No. Start with one screen: swap the fields that hold money, accounts, dates and references for Booki controls and keep your backend. It works in React (supported), and in Vue, Svelte, Solid and plain web components (experimental).",
      "Nei. Start med ett skjermbilde: bytt feltene som holder beløp, konto, dato og referanser til Booki-kontroller, og behold backenden. Det virker i React (støttet), og i Vue, Svelte, Solid og rene web components (eksperimentelle).",
    ],
  },
  {
    q: ["Can the agent approve or pay on its own?", "Kan agenten attestere eller betale selv?"],
    a: [
      "Only where your rule says it may. Approving, signing off and releasing payments are a person's buttons and never agent actions. A step marked for confirmation waits for a person unless your rule allows it, as with posting under 50 000 kr in the demo, and the server guards refuse the rest for an agent.",
      "Bare der regelen deres sier at den får. Attestering, signering og frigivelse av betalinger er forbeholdt en person og aldri agenthandlinger. Et steg som krever bekreftelse venter på en person med mindre regelen tillater det, slik som bokføring under 50 000 kr i demoen, og serverkontrollen avviser resten når det er en agent som prøver.",
    ],
  },
  {
    q: ["Which AI models does it work with?", "Hvilke AI-modeller fungerer det med?"],
    a: [
      "Any model that can call tools. Measured with Claude Opus, Sonnet and Haiku 5.5 and DeepSeek V4.1 Flash. Opus and Sonnet do these tasks right without Booki too; for them Booki saves cost and time. For the cheap models it is whether the books come out right: on the rebuilt screens they were right about four times in five, on Booki every time in the runs still counted. Five runs per cell is few, so read it as an indication.",
      "Alle modeller som kan kalle verktøy. Målt med Claude Opus, Sonnet og Haiku 5.5 og DeepSeek V4.1 Flash. Opus og Sonnet klarer disse oppgavene uten Booki også; for dem sparer Booki kostnad og tid. For de billige modellene er forskjellen om regnskapet blir riktig: på de gjenskapte skjermbildene ble resultatet riktig omtrent fire av fem ganger, på Booki hver gang i kjøringene som fortsatt telles. Fem kjøringer per celle er lite, så les det som en pekepinn.",
    ],
  },
  {
    q: ["Where do the numbers come from?", "Hvor kommer tallene fra?"],
    a: [
      "From real runs through Vercel AI Gateway: the same task, five runs per screen and model, the result checked after every run, cost at list price. The screens were rebuilt from DOM snapshots with invented data, never run against Tripletex or DNB themselves. Every page, script and call is in the repository: pnpm proof. The voucher and sales invoice runs are withdrawn: a control's hint held their answer. They come back when remeasured.",
      "Fra ekte kjøringer gjennom Vercel AI Gateway: samme oppgave, fem kjøringer per skjermbilde og modell, resultatet kontrollert etter hver kjøring, kostnad til listepris. Skjermbildene er gjenskapt fra DOM-øyeblikksbilder med oppdiktede data, aldri kjørt mot Tripletex eller DNB selv. Hver side, hvert skript og hvert kall ligger i repoet: pnpm proof. Kjøringene for bilag og salgsfaktura er trukket tilbake: et hint i kontrollen inneholdt svaret. De kommer tilbake når de er målt på nytt.",
    ],
  },
  {
    q: ["Does it know Norwegian accounting?", "Kan det norsk regnskap?"],
    a: [
      "Yes. The Norwegian profile checks kontonummer and organisasjonsnummer (mod 11), generates and checks KID, knows the MVA codes and terms, and posts VAT for a coded line. The US profile is supported. Starter profiles for Sweden, Denmark, the UK and Germany are experimental, and you can define your own.",
      "Ja. Den norske profilen kontrollerer kontonummer og organisasjonsnummer (mod 11), lager og kontrollerer KID, kjenner mva-kodene og terminene, og beregner mva for en linje med mva-kode. Den amerikanske profilen er støttet. Startprofilene for Sverige, Danmark, Storbritannia og Tyskland er eksperimentelle, og dere kan lage deres egen.",
    ],
  },
  {
    q: ["What does it cost?", "Hva koster det?"],
    a: [
      "Nothing. Booki is open source under the MIT licence. What you pay for is the model the agent runs on, and on Booki that is about an eighth of what it costs on an ordinary screen.",
      "Ingenting. Booki er åpen kildekode med MIT-lisens. Det dere betaler for er modellen agenten kjører på, og på Booki er det omtrent en åttendedel av det det koster på et vanlig skjermbilde.",
    ],
  },
];

/**
 * The questions a team asks before trying it, the MCP one among them. Each
 * answer sits behind a disclosure; the same text goes out as FAQPage data
 * for search engines.
 */
export function Faq() {
  const { lang, t } = useLang();
  const pick = (pair: [string, string]) => (lang === "nb" ? pair[1] : pair[0]);

  useEffect(() => {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.text = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: ITEMS.map((item) => ({
        "@type": "Question",
        name: pick(item.q),
        acceptedAnswer: { "@type": "Answer", text: pick(item.a) },
      })),
    });
    document.head.append(script);
    return () => script.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  return (
    <Section
      id="faq-title"
      title={t("Questions", "Spørsmål")}
      note={t(
        "What teams ask before they try it on one screen.",
        "Det teamene spør om før de prøver Booki på ett skjermbilde.",
      )}
    >
      <div className="site-faq">
        {ITEMS.map((item) => (
          <Disclosure key={item.q[0]} title={pick(item.q)} className="site-faq__item">
            <p className="site-faq__answer">{pick(item.a)}</p>
          </Disclosure>
        ))}
      </div>
    </Section>
  );
}
