import { Link } from "react-router-dom";

import { reactInstallCommand } from "../catalog";
import { OnThisPage } from "../components/on-this-page";
import { InstallBlock } from "../components/install-block";
import { PromptButton } from "../components/landing/prompt-button";
import { AGENT_PROMPT } from "../components/landing/shared";
import { Section } from "../components/section";
import { useLang } from "@/lib/lang";

const NEEDS = [
  [
    { en: "Your app's framework", nb: "Rammeverket appen bruker" },
    {
      en: "React 19 or later with the NO and US profiles is supported. Vue, Svelte, Solid, Web Components and the SE, DK, GB and DE profiles are experimental.",
      nb: "React 19 eller nyere med NO- og US-profilene er støttet. Vue, Svelte, Solid, Web Components og profilene for SE, DK, GB og DE er eksperimentelle.",
    },
  ],
  [
    { en: "Two pinned dependencies", nb: "To låste avhengigheter" },
    {
      en: "Run these commands in a POSIX shell such as Bash or Zsh. They read the exact UI SDK version required by the published Booki release.",
      nb: "Kjør kommandoene i et POSIX-skall som Bash eller Zsh. De henter den eksakte UI SDK-versjonen som den publiserte Booki-utgaven krever.",
    },
  ],
] as const;

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
const unregister = registerTools(agent, { allow: "bridge" })

if (import.meta.hot) {
  import.meta.hot.dispose(unregister)
}

export { agent }`;

const MAIN = `// Create the agent bridge before anything renders, so it sees every control.
import "./agent"
import { createRoot } from "react-dom/client"`;

const CONFIRM = `import { useEffect } from "react"
import { Button } from "@ui-sdk/react/button"
import { personOnly } from "@booki-aui/react"
import { setPersonPrompt } from "./agent"

type Props = {
  saveDraft: () => void
  postVoucher: () => void
}

export function VoucherActions({ saveDraft, postVoucher }: Props) {
  useEffect(() => setPersonPrompt((text) => window.confirm(text)), [])

  return (
    <>
      <Button
        data-agent-confirm="Save changes to draft 1042?"
        onClick={saveDraft}
      >
        Save draft
      </Button>
      <Button
        data-agent-confirm={personOnly("Post voucher 1042?")}
        onClick={postVoucher}
      >
        Post voucher
      </Button>
    </>
  )
}`;

const CHECK = `window.agent.snapshot()

await window.agent.act({
  steps: [{ ref: "Amount excl. tax", action: "setMinor", args: [125000] }],
})`;

/** Five-minute integration guide for a team with an existing product. The agent prompt comes first. */
export function InstallationPage() {
  const { lang, t } = useLang();
  const p = "m-0 max-w-prose text-sm text-muted-foreground";
  return (
    <article className="installation-guide">
      <h1 className="site-page-title mt-0 mb-0">{t("Add Booki to your app", "Legg Booki inn i appen deres")}</h1>
      <p className="mt-4 mb-6 max-w-prose text-lg leading-relaxed text-muted-foreground text-pretty">
        {t(
          "Quickest: copy the prompt into your coding agent. It explains Booki, suggests one screen and asks before changing anything.",
          "Raskest: kopier prompten inn i kodeagenten deres. Den forklarer Booki, foreslår ett skjermbilde og spør før den endrer noe.",
        )}
      </p>
      <div className="mb-10 grid justify-items-center gap-2 lg:justify-items-start">
        <PromptButton prompt={AGENT_PROMPT} />
      </div>
      <p className="mt-0 mb-10 max-w-prose text-muted-foreground text-pretty">
        {t(
          "By hand, five steps: install, wrap the app, replace one amount input and one voucher table, then give an agent a bridge with your approval rules. The code below uses the React package; the same controls ship for Vue, Svelte, Solid and Web Components.",
          "For hånd, fem steg: installer, pakk inn appen, bytt ut ett beløpsfelt og én bilagstabell, og gi så en agent en bro med reglene deres for godkjenning. Koden under bruker React-pakken; de samme kontrollene finnes for Vue, Svelte, Solid og Web Components.",
        )}
      </p>

      <p className="max-w-prose">
        {t("To start with a single button, try ", "For å begynne med én knapp, prøv ")}
        <Link className="site-link" to="/docs/first-action">
          {t("your first agent action", "din første agenthandling")}
        </Link>
        .
      </p>
      <OnThisPage
        links={[
          ["install", t("Install", "Installer")],
          ["provider", t("Provider", "Provider")],
          ["amount", t("Amount input", "Beløpsfelt")],
          ["voucher", t("Voucher table", "Bilagstabell")],
          ["bridge", t("Agent bridge", "Agentbro")],
          ["approval", t("Approval rules", "Godkjenningsregler")],
          ["check", t("Verify", "Kontroller")],
        ]}
      />
      <Section
        id="install"
        title={t("Install", "Installer")}
        note={t(
          "Install Booki and its pinned dependencies together.",
          "Installer Booki og de låste avhengighetene sammen.",
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
        <InstallBlock label="npm" command={reactInstallCommand("npm install")} />
        <InstallBlock label="pnpm" command={reactInstallCommand("pnpm add")} />
        <p className={p}>
          {t(
            "The optional @booki-aui/styles package provides the default look.",
            "Den valgfrie pakken @booki-aui/styles gir standardutseendet.",
          )}
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
            "Mark the draft save with data-agent-confirm so it can run after the person agrees. Posting the voucher is a person's action. ",
            "Merk lagring av utkastet med data-agent-confirm slik at agenten kan lagre etter samtykke. Bokføring er en handling personen må utføre. ",
          )}
          <code>personOnly</code>{" "}
          {t(
            "makes the bridge refuse that action even if the policy allows other marked steps.",
            "gjør at broen avviser handlingen selv om reglene tillater andre merkede steg.",
          )}
        </p>
        <InstallBlock label={t("On a voucher screen", "På et bilagsskjermbilde")} command={CONFIRM} />
        <p className={p}>
          {t("The bridge passes ", "Broen sender ")}
          <code>step.confirm</code>
          {t(" to its ", " til sin ")}
          <code>allow</code>
          {t(
            " callback. The example refuses marked steps until a prompt is registered. WebMCP delegates to the same callback with ",
            ". Eksemplet avviser merkede steg frem til en dialog er registrert. WebMCP bruker den samme funksjonen med ",
          )}
          <code>{'allow: "bridge"'}</code>
          {t(", so the person is asked once.", ", slik at personen blir spurt én gang.")}
        </p>
        <p className={p}>
          {t(
            "Enforce person-only decisions on the server too. Pass the authenticated actor to the write guard from ",
            "Håndhev handlingene som krever en person også på serveren. Send den autentiserte aktøren til skrivevakten fra ",
          )}
          <code>@booki-aui/core/server</code>.
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
