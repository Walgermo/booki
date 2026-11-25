import { version } from "../../../../packages/react/package.json";
import { Link } from "react-router-dom";

import { InstallBlock } from "../components/install-block";
import { Section } from "../components/section";
import { useLang } from "@/lib/lang";

const REPO_URL = "https://github.com/Walgermo/booki";

const NEEDS = [
  [
    { en: "React 19 or later", nb: "React 19 eller nyere" },
    { en: "The controls take ref as a plain prop.", nb: "Kontrollene tar ref som en vanlig prop." },
  ],
  [
    { en: "Supported: React 19 with the NO and US profiles", nb: "Støttet: React 19 med NO- og US-profilene" },
    {
      en: "Vue, Svelte, Solid, Web Components and the SE, DK, GB and DE profiles are experimental.",
      nb: "Vue, Svelte, Solid, Web Components og profilene for SE, DK, GB og DE er eksperimentelle.",
    },
  ],
  [
    { en: "@ui-sdk/core and @ui-sdk/react 0.1.0-beta.17", nb: "@ui-sdk/core og @ui-sdk/react 0.1.0-beta.17" },
    {
      en: "Peer dependencies; pnpm and npm install them for you.",
      nb: "Peer-avhengigheter; pnpm og npm installerer dem for deg.",
    },
  ],
  [
    { en: "pnpm", nb: "pnpm" },
    { en: "Used to pack the packages from the repo.", nb: "Brukes til å bygge pakkene fra repoet." },
  ],
] as const;

const BUILD = `git clone ${REPO_URL}.git
cd booki
pnpm install
pnpm pack:local --out ../your-product/vendor/booki`;

// What `pnpm pack:local` names the files: the packages share one version.
const ADD = `# pnpm-workspace.yaml
overrides:
  "@booki-aui/core": "file:./vendor/booki/booki-core-${version}.tgz"
  "@booki-aui/primitives": "file:./vendor/booki/booki-primitives-${version}.tgz"
  "@booki-aui/react": "file:./vendor/booki/booki-react-${version}.tgz"
  "@booki-aui/styles": "file:./vendor/booki/booki-styles-${version}.tgz"

# then
pnpm add @booki-aui/core @booki-aui/react @booki-aui/styles`;

const PROVIDER = `import { BookiLocaleProvider } from "@booki-aui/react"
import "@booki-aui/styles"

createRoot(root).render(
  <BookiLocaleProvider defaultCountry="NO">
    <App />
  </BookiLocaleProvider>,
)`;

const AMOUNT = `import { AmountField } from "@booki-aui/react"

// Before: <input name="amount" type="number" step="0.01" />
<form action="/invoices" method="post">
  <AmountField
    name="amount"
    aria-label="Amount excl. tax"
    defaultValue={312500}
    required
  />
  <button type="submit">Save</button>
</form>`;

const VOUCHER = `import { VoucherComposer, type VoucherLine } from "@booki-aui/react"

const [lines, setLines] = useState<VoucherLine[]>(voucher.lines)

<VoucherComposer
  editable
  aria-label="Voucher lines"
  lines={lines}
  onLinesChange={setLines}
  accounts={chartOfAccounts}
  departments={departments}
  projects={projects}
/>`;

const AGENT = `import { createBookiAgent, registerTools } from "@booki-aui/react"

type PersonPrompt = (text: string) => Promise<boolean> | boolean

let prompt: PersonPrompt | null = null

/** A page that can ask the person registers its prompt here. */
export function setPersonPrompt(next: PersonPrompt): () => void {
  prompt = next
  return () => {
    if (prompt === next) prompt = null
  }
}

/** Unmarked steps run. Marked steps wait for the person, or are refused. */
const allow = (step: { confirm?: string }) =>
  step.confirm ? (prompt ? prompt(step.confirm) : false) : true

const agent = createBookiAgent({ agentId: "bookkeeper", allow })

// Try it in the console: window.agent.snapshot()
Object.assign(window, { agent })

// The same snapshot / act / query tools, for the browser's own agent.
const unregister = registerTools(agent, { allow })

if (import.meta.hot) {
  import.meta.hot.dispose(unregister)
}

export { agent }`;

const MAIN = `// Create the agent bridge before anything renders, so it sees every control.
import "./agent"
import { createRoot } from "react-dom/client"`;

const CONFIRM = `import { setPersonPrompt } from "./agent"

// Once, where your confirmation dialog lives.
useEffect(() => setPersonPrompt((text) => confirmDialog.ask(text)), [])

<button
  data-agent-confirm="Posts voucher 1042 to the ledger. This cannot be undone."
  onClick={postVoucher}
>
  Post voucher
</button>`;

const CHECK = `window.agent.snapshot()

await window.agent.act({
  steps: [{ ref: "Amount excl. tax", action: "setMinor", args: [125000] }],
})`;

/** Five-minute integration guide for a team with an existing React product. */
export function InstallationPage() {
  const { lang, t } = useLang();
  const p = "m-0 max-w-prose text-sm text-muted-foreground";
  return (
    <article>
      <h1 className="site-page-title mt-0 mb-0">
        {t("Add Booki to a React product", "Legg Booki inn i et React-produkt")}
      </h1>
      <p className="mt-4 mb-10 max-w-prose text-lg leading-relaxed text-muted-foreground text-pretty">
        {t(
          "Five steps: install, wrap the app, replace one amount input and one voucher table, then give an agent a bridge with your approval rules. About five minutes once the packages are packed.",
          "Fem steg: installer, pakk inn appen, bytt ut ett beløpsfelt og én bilagstabell, og gi så en agent en bro med dine godkjenningsregler. Omtrent fem minutter når pakkene er pakket.",
        )}
      </p>

      <Section
        id="install"
        title={t("Install", "Installer")}
        note={t(
          "The packages are not on npm yet. For now you pack them from the repo.",
          "Pakkene er ikke på npm ennå. Foreløpig pakker du dem fra repoet.",
        )}
      >
        <ul className="site-rows mb-6">
          {NEEDS.map(([need, why]) => (
            <li key={need.en} className="grid gap-1 sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] sm:gap-8">
              <span className="text-sm font-medium">{need[lang]}</span>
              <span className="text-sm text-muted-foreground">{why[lang]}</span>
            </li>
          ))}
        </ul>
        <p className={p}>
          {t("Clone ", "Klon ")}
          <a className="site-link" href={REPO_URL}>
            {t("the repo", "repoet")}
          </a>{" "}
          {t(
            "next to your product and pack it into your product, as npm would deliver it.",
            "ved siden av produktet ditt, og pakk det inn i produktet ditt slik npm ville levert det.",
          )}
        </p>
        <InstallBlock label={t("Next to your product", "Ved siden av produktet ditt")} command={BUILD} />
        <p className={p}>
          {t(
            "Then add the packages. The command above prints this block with your own paths, and one line for npm.",
            "Legg så til pakkene. Kommandoen over skriver ut denne blokken med dine egne stier, og én linje for npm.",
          )}
        </p>
        <InstallBlock label={t("In your product", "I produktet ditt")} command={ADD} />
        <p className={p}>
          {t("When the packages are published this becomes one ", "Når pakkene er publisert, blir dette én ")}
          <code>pnpm add @booki-aui/core @booki-aui/react @booki-aui/styles</code>.
        </p>
      </Section>

      <Section
        id="provider"
        title={t("Wrap the app", "Pakk inn appen")}
        note={t(
          "The provider sets currency, VAT codes, bank formats and language.",
          "Provideren setter valuta, mva-koder, bankformater og språk.",
        )}
      >
        <InstallBlock label="src/main.tsx" command={PROVIDER} />
        <p className={p}>
          {t("Use ", "Bruk ")}
          <code>NO</code>
          {t(" or ", " eller ")}
          <code>US</code>.{" "}
          {t(
            "The stylesheet is optional: the controls are unstyled without it, and it reads ",
            "Stilarket er valgfritt: kontrollene er ustylet uten det, og det leser ",
          )}
          <code>--bk-*</code>
          {t(
            " variables you can override on any wrapper.",
            "-variabler du kan overstyre på hvilken som helst innpakning.",
          )}
        </p>
      </Section>

      <Section
        id="amount"
        title={t("Replace an amount input", "Bytt ut et beløpsfelt")}
        note={t("Amounts are whole minor units: 312500 is 3 125,00.", "Beløp er heltall i øre: 312500 er 3 125,00.")}
      >
        <InstallBlock label={t("An invoice form", "Et fakturaskjema")} command={AMOUNT} />
        <p className={p}>
          {t("With ", "Med ")}
          <code>name</code>
          {t(
            " the field submits with the form as integer minor units, so the server never parses a formatted number. It also takes ",
            " sendes feltet med skjemaet som heltall i øre, så serveren aldri tolker et formatert tall. Det tar også ",
          )}
          <code>id</code>, <code>disabled</code>, <code>readOnly</code> {t("and", "og")} <code>required</code>.{" "}
          {t(
            "A disabled or read-only field refuses an agent as well as a person. The other inputs and selects take the same props; see ",
            "Et deaktivert eller skrivebeskyttet felt avviser en agent like mye som en person. De andre feltene og velgerne tar de samme propsene; se ",
          )}
          <Link className="site-link" to="/docs/amount-field">
            AmountField
          </Link>
          .
        </p>
      </Section>

      <Section
        id="voucher"
        title={t("Replace a voucher table", "Bytt ut en bilagstabell")}
        note={t(
          "One table for the person and the agent, held to the same rules.",
          "Én tabell for personen og agenten, underlagt de samme reglene.",
        )}
      >
        <InstallBlock label={t("A voucher screen", "Et bilagsskjermbilde")} command={VOUCHER} />
        <p className={p}>
          {t("With ", "Med ")}
          <code>editable</code>{" "}
          {t(
            "a person can change account, VAT code, department, project, debit and credit, and add or remove lines. Without it the table is read-only and only an agent edits. An edit that breaks a rule leaves the line as it was and says why on that row. See ",
            "kan en person endre konto, mva-kode, avdeling, prosjekt, debet og kredit, og legge til eller fjerne linjer. Uten den er tabellen skrivebeskyttet, og bare en agent redigerer. En endring som bryter en regel lar linjen være som den var og sier hvorfor på den raden. Se ",
          )}
          <Link className="site-link" to="/docs/voucher-composer">
            VoucherComposer
          </Link>
          .
        </p>
      </Section>

      <Section
        id="bridge"
        title={t("Create the bridge", "Lag broen")}
        note={t("Once, in its own module, before the app renders.", "Én gang, i en egen modul, før appen tegnes.")}
      >
        <InstallBlock label="src/agent.ts" command={AGENT} />
        <p className={p}>
          {t(
            "Import it first in your entry file, so the bridge sees every control as it mounts.",
            "Importer den først i inngangsfilen, så broen ser hver kontroll når den monteres.",
          )}
        </p>
        <InstallBlock label="src/main.tsx" command={MAIN} />
        <p className={p}>
          <code>registerTools</code> {t("publishes", "publiserer")} <code>snapshot</code>, <code>query</code>{" "}
          {t("and", "og")} <code>act</code>{" "}
          {t(
            "over WebMCP, so an agent in a browser that supports it can use your product with no tools of your own to write. In other browsers the call does nothing. The bridge's actions per control are in ",
            "over WebMCP, så en agent i en nettleser som støtter det kan bruke produktet ditt uten at du skriver egne verktøy. I andre nettlesere gjør kallet ingenting. Broens handlinger per kontroll står i ",
          )}
          <a className="site-link" href="https://github.com/Walgermo/booki/blob/main/packages/react/docs/llms.txt">
            {t("the agent catalog", "agentkatalogen")}
          </a>
          .
        </p>
      </Section>

      <Section
        id="approval"
        title={t("Approval rules", "Godkjenningsregler")}
        note={t(
          "What an agent may do alone is decided in allow, in one place.",
          "Hva en agent kan gjøre alene bestemmes i allow, på ett sted.",
        )}
      >
        <p className="mt-0 mb-0 max-w-prose text-sm text-muted-foreground">
          {t(
            "Mark every control that posts, pays or approves with ",
            "Merk hver kontroll som bokfører, betaler eller godkjenner med ",
          )}
          <code>data-agent-confirm</code>
          {t(
            " and a sentence that says what it does. The bridge passes that sentence to ",
            " og en setning som sier hva den gjør. Broen sender den setningen til ",
          )}
          <code>allow</code> {t("as", "som")} <code>step.confirm</code>.{" "}
          {t("Show it to the person and return their answer.", "Vis den til personen og returner svaret.")}
        </p>
        <InstallBlock label={t("A screen that posts", "Et skjermbilde som bokfører")} command={CONFIRM} />
        <p className={p}>
          {t(
            "While no prompt is registered, marked steps are refused. An ",
            "Så lenge ingen prompt er registrert, avvises merkede steg. En ",
          )}
          <code>allow</code>
          {t(" that returns true without reading ", " som returnerer true uten å lese ")}
          <code>step.confirm</code>
          {t(" answers yes for the person, so read it in every ", " svarer ja på personens vegne, så les den i hver ")}
          <code>allow</code>
          {t(" you write, including the one you pass to ", " du skriver, også den du gir til ")}
          <code>registerTools</code>.
        </p>
      </Section>

      <Section
        id="check"
        title={t("Check it", "Sjekk det")}
        note={t(
          "In the browser console, with your screen open.",
          "I nettleserens konsoll, med skjermbildet ditt åpent.",
        )}
      >
        <InstallBlock label={t("Console", "Konsoll")} command={CHECK} />
        <p className={p}>
          {t(
            "The snapshot lists each control with its value and the actions it takes. The step sets the amount to 1 250,00 and reports the change with ",
            "Øyeblikksbildet lister hver kontroll med verdien og handlingene den tar. Steget setter beløpet til 1 250,00 og rapporterer endringen med ",
          )}
          <code>source: &quot;agent&quot;</code>
          {t(
            ", which is what your audit log should record. Next: ",
            ", som er det revisjonssporet ditt bør registrere. Neste: ",
          )}
          <Link className="site-link" to="/demo">
            {t("the demo", "demoen")}
          </Link>{" "}
          {t("shows a full posting flow.", "viser en hel bokføringsflyt.")}
        </p>
      </Section>
    </article>
  );
}
