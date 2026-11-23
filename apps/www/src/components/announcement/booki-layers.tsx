import { useLang } from "@/lib/lang";

/**
 * Booki's layers as a figure: the framework packages over the primitives
 * they are generated from, over core; the agent's side on ink beside them;
 * the server guard under all of it. Built from boxes, not a picture, so it
 * stacks on a phone and follows the Night theme through the --bk-* tokens.
 */
export function BookiLayers() {
  const { t } = useLang();
  return (
    <figure className="site-layers m-0">
      <div className="site-layers__stack">
        <div className="site-layers__split">
          <div className="site-layers__layer">
            <p className="site-layers__name">{t("Your screen", "Skjermbildet ditt")}</p>
            <ul className="site-chips" aria-label={t("Framework packages", "Rammeverkpakker")}>
              {["@booki/react", "@booki/web", "@booki/vue", "@booki/svelte", "@booki/solid"].map((name) => (
                <li key={name} className="site-chip">
                  {name}
                </li>
              ))}
            </ul>
            <p className="site-layers__text">
              {t(
                "React controls; custom elements for Angular and server-rendered pages; parts for Vue, Svelte and Solid.",
                "React-kontroller; custom elements for Angular og serverrendrede sider; deler for Vue, Svelte og Solid.",
              )}
            </p>
          </div>
          <div className="site-layers__layer" data-optional="">
            <p className="site-layers__name">@booki/styles</p>
            <p className="site-layers__text">
              {t(
                "Optional. Scoped to Booki's components, in a cascade layer if you like, with a shadcn token bridge.",
                "Valgfritt. Avgrenset til Booki-komponentene, i et cascade layer om du vil, med en shadcn-bro for tokens.",
              )}
            </p>
          </div>
        </div>
        <p className="site-layers__link">{t("generated from", "generert fra")}</p>
        <div className="site-layers__layer">
          <p className="site-layers__name">@booki/primitives</p>
          <p className="site-layers__text">
            {t(
              "Every control's definition, with no framework: its state, its agent actions and the rules it enforces.",
              "Hver kontrolls definisjon, uten rammeverk: tilstanden, agenthandlingene og reglene den håndhever.",
            )}
          </p>
        </div>
        <p className="site-layers__link">{t("rules from", "regler fra")}</p>
        <div className="site-layers__layer">
          <p className="site-layers__name">@booki/core</p>
          <p className="site-layers__text">
            {t(
              "Money in integer minor units, vouchers, validators, approvals, periods, VAT, audit sampling, roles and country profiles.",
              "Penger i hele øre, bilag, validering, attestering, perioder, mva, revisjonsutvalg, roller og landprofiler.",
            )}
          </p>
          <ul className="site-chips" aria-label={t("Country profiles", "Landprofiler")}>
            {["NO", "US", "SE", "DK", "GB", "DE"].map((code) => (
              <li key={code} className="site-chip">
                {code}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="site-machine site-layers__agent">
        <p className="site-kicker">{t("The agent's side", "Agentens side")}</p>
        <span className="site-signal justify-self-start">agent</span>
        <ul className="site-chips" aria-label={t("Bridge calls", "Kall i broen")}>
          {["snapshot", "act", "query", "subscribe"].map((name) => (
            <li key={name} className="site-chip">
              {name}
            </li>
          ))}
        </ul>
        <p className="m-0 text-sm text-ink-muted">
          {t(
            "The agent bridge reads the screen's controls and calls their actions by name. createBookiAgent adds your allow rule, the audit trail and undo by source; the agent cursor shows each step to the person.",
            "Agentbroen leser kontrollene på skjermen og kaller handlingene deres ved navn. createBookiAgent legger til allow-regelen, revisjonssporet og angre per kilde; agentpekeren viser hvert steg til personen.",
          )}
        </p>
      </div>

      <div className="site-layers__layer site-layers__server">
        <p className="site-layers__name">@booki/core/server</p>
        <p className="site-layers__text">
          {t(
            "The same rules from @booki/core, as the gate in your API: guard, advise, PERSON_ONLY, roles per engagement, actorRecord. The bridge is for speed and clarity; the server decides.",
            "De samme reglene fra @booki/core, som porten i API-et deres: guard, advise, PERSON_ONLY, roller per oppdrag, actorRecord. Broen gir fart og tydelighet; serveren bestemmer.",
          )}
        </p>
      </div>
      <figcaption className="sr-only">
        {t(
          "Framework packages are generated from @booki/primitives, which takes its rules from @booki/core. The agent bridge reads and acts on the screen. @booki/core/server runs the same rules in your API.",
          "Rammeverkpakkene genereres fra @booki/primitives, som henter reglene fra @booki/core. Agentbroen leser og handler i skjermbildet. @booki/core/server kjører de samme reglene i API-et deres.",
        )}
      </figcaption>
    </figure>
  );
}
