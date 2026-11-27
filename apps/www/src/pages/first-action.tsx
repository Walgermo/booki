import { Link } from "react-router-dom";
import { InstallBlock } from "@/components/install-block";
import { OnThisPage } from "@/components/on-this-page";
import { Section } from "@/components/section";
import { SiteAgentCursor } from "@/components/site-agent-cursor";
import { TaskButton } from "@/examples/task-button";
import taskSource from "@/examples/task-button.tsx?raw";
import { useLang, usePageMeta } from "@/lib/lang";

const META = {
  title: { en: "Your first agent action · Booki", nb: "Din første agenthandling · Booki" },
  description: {
    en: "Mount a React button, find it through Booki’s bridge and run the same action a person can take. Try the example in your browser.",
    nb: "Monter en knapp i React, finn den gjennom agentbroen og utfør samme handling som en person. Prøv eksemplet i nettleseren.",
  },
};

export function FirstActionPage() {
  const { t } = useLang();
  usePageMeta(META);
  const label = t("Add task", "Legg til oppgave");
  const total = t("Tasks added", "Oppgaver lagt til");
  const consoleExample = `const button = window.agent.snapshot().find(
  (entry) => entry.label === "${label}" && entry.actions.includes("press")
)
if (!button) throw new Error("${t("Open the page with the task button", "Åpne siden med oppgaveknappen")}")

const result = await window.agent.act({
  steps: [{ ref: button.ref, action: "press", args: [] }],
})
console.log(result)`;
  const main = `import { createBookiAgent } from "@booki-aui/react"
import { createRoot } from "react-dom/client"
import { TaskButton } from "./task-button"
import "@booki-aui/styles"

const agent = createBookiAgent({ agentId: "assistant" })
if (import.meta.env.DEV) Object.assign(window, { agent })

createRoot(document.getElementById("root")!).render(
  <TaskButton label="${label}" totalLabel="${total}" />
)`;
  const tryIt = t("Try it here", "Prøv her");
  const app = t("Run it in your app", "Kjør i din egen app");
  const troubleshoot = t("Troubleshooting", "Feilsøking");
  return (
    <article>
      <SiteAgentCursor />
      <h1 className="site-page-title mt-0 mb-0">{t("Your first agent action", "Din første agenthandling")}</h1>
      <p className="mt-4 max-w-prose text-lg text-muted-foreground">
        {t(
          "Give a person and an agent the same task button. Click it once, then ask the bridge to press it. Both presses update the counter through one React handler.",
          "La en person og en agent bruke den samme oppgaveknappen. Trykk én gang selv, og la så agentbroen trykke. Begge trykkene oppdaterer telleren gjennom samme React-funksjon.",
        )}
      </p>
      <OnThisPage
        links={[
          ["try", tryIt],
          ["app", app],
          ["troubleshooting", troubleshoot],
        ]}
      />
      <Section
        id="try"
        title={tryIt}
        note={t("Use this live example and your browser console.", "Bruk eksemplet her og nettleserkonsollen.")}
      >
        <div className="site-sheet p-5">
          <TaskButton label={label} totalLabel={total} />
        </div>
        <p className="mt-5">
          {t(
            "Click Add task. With the counter at 1, run this in the browser console.",
            "Trykk på Legg til oppgave. Når telleren viser 1, kjører du dette i nettleserkonsollen.",
          )}
        </p>
        <InstallBlock label={t("Browser console", "Nettleserkonsoll")} command={consoleExample} language="javascript" />
        <p>
          {t("The result has", "Resultatet har")} <code>ok: true</code>.{" "}
          {t(
            "The counter now reads 2. The snapshot supplied the current button reference and its supported action.",
            "Telleren viser nå 2. Øyeblikksbildet ga deg knappens gjeldende referanse og handlingen den støtter.",
          )}
        </p>
      </Section>
      <Section
        id="app"
        title={app}
        note={t(
          "Start in a Vite React 19+ TypeScript app.",
          "Start i en Vite-app med React 19 eller nyere og TypeScript.",
        )}
      >
        <p>
          {t("Install the packages using the pinned versions in the ", "Installer pakkene med de låste versjonene i ")}
          <a className="site-link" href="/docs/installation#install">
            {t("installation guide", "installasjonsveiledningen")}
          </a>
          .{" "}
          {t(
            "Save the two files below and start the app’s dev server.",
            "Lagre de to filene nedenfor, og start utviklingsserveren.",
          )}
        </p>
        <InstallBlock label="src/task-button.tsx" command={taskSource.trim()} language="jsx" />
        <InstallBlock label="src/main.tsx" command={main} language="jsx" />
        <p>
          {t(
            "Open the local page and repeat the console example. The bridge is created before the button mounts. The dev-only assignment lets you inspect it in the console.",
            "Åpne den lokale siden og gjenta konsolleksemplet. Broen opprettes før knappen monteres. I utviklingsmodus får du tilgang til den fra konsollen.",
          )}
        </p>
      </Section>
      <Section id="troubleshooting" title={troubleshoot}>
        <dl className="site-rows">
          <div>
            <dt>
              <code>window.agent</code> {t("is undefined", "er undefined")}
            </dt>
            <dd>
              {t(
                "Run the example in the browser console of this guide or in your local Vite dev server. Check that your main entry creates the bridge and exposes it in development.",
                "Kjør eksemplet i nettleserkonsollen på denne siden eller i den lokale Vite-appen. Sjekk at inngangsfilen oppretter broen og gjør den tilgjengelig i utviklingsmodus.",
              )}
            </dd>
          </div>
          <div>
            <dt>{t("The button is missing from the snapshot", "Knappen mangler i øyeblikksbildet")}</dt>
            <dd>
              {t(
                "Check that the Booki Button is mounted and the label matches the current language. Read a fresh snapshot after navigating or remounting the control.",
                "Sjekk at Booki-knappen er montert og at etiketten stemmer med valgt språk. Les et nytt øyeblikksbilde etter sidenavigering eller ny montering.",
              )}
            </dd>
          </div>
          <div>
            <dt>{t("An action was refused", "En handling ble avvist")}</dt>
            <dd>
              {t("Read", "Les")} <code>result.error.message</code> {t("when", "når")} <code>result.ok === false</code>.{" "}
              {t(
                "Use an action listed for the current control. For an action reserved for a person, hand the decision back to them.",
                "Bruk en handling kontrollen tilbyr nå. Når en handling er forbeholdt en person, må personen selv ta avgjørelsen.",
              )}
            </dd>
          </div>
        </dl>
        <p className="mt-6">
          {t("Next, inspect the ", "Se deretter ")}
          <Link className="site-link" to="/docs/button">
            {t("button reference", "knappereferansen")}
          </Link>
          {t(" or add ", " eller legg til ")}
          <a className="site-link" href="/docs/installation#approval">
            {t("confirmation and person-only actions", "bekreftelse og handlinger forbeholdt personer")}
          </a>
          .
        </p>
      </Section>
    </article>
  );
}
