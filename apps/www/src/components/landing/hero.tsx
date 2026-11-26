import { TextLink } from "@booki-aui/react";
import { Button } from "@ui-sdk/react/button";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useLang } from "@/lib/lang";
import { DemoCarousel } from "./demo-carousel";
import { HeroTitle } from "./hero-title";
import { PromptButton } from "./prompt-button";
import { ProofStrip } from "./proof-strip";
import { InstallBlock } from "@/components/install-block";
import { AgentName } from "./agent-names";
import { AGENT_PROMPT, AGENT_PROMPT_FULL, REPO_URL, type LandingAgent } from "./shared";

export function Hero({ agent }: { agent: LandingAgent }) {
  const { t } = useLang();
  const markRef = useRef<HTMLSpanElement>(null);
  const proofRef = useRef<HTMLDivElement>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  return (
    <section className="site-ledger grid grid-cols-[minmax(0,1fr)] gap-12 pt-12 pb-16 md:gap-20 md:pt-[76px] md:pb-24">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] justify-items-center text-center">
        <HeroTitle
          className="landing-hero__title m-0 w-full max-w-full min-w-0 text-balance"
          text={t("Get agentic UI for your app", "Få agentisk UI til appen deres")}
          mark={t("agentic", "agentisk")}
          markRef={markRef}
        />
        <p className="landing-hero__hook">
          {t("UI components that let ", "UI-komponenter som lar ")}
          <AgentName id="claude" after="," /> <AgentName id="chatgpt" after="," /> <AgentName id="gemini" after="," />{" "}
          <AgentName id="grok" />{" "}
          {t(
            "and others work in your app, next to your customers.",
            "og andre jobbe i appen deres, side om side med kundene deres.",
          )}
        </p>
        <ol
          className="landing-hero__timeline"
          aria-label={t("One amount field, three ways to fill it in", "Ett beløpsfelt, tre måter å fylle det ut")}
        >
          <li>
            <span className="landing-hero__date">1995</span>
            <span className="landing-hero__era">{t("People type", "Mennesker skriver")}</span>
            <span className="landing-hero__scene" aria-hidden="true">
              <span className="landing-hero__field">
                <span className="landing-hero__field-label">{t("Amount", "Beløp")}</span>
                <span className="landing-hero__field-value">
                  {t("12,500.00", "12 500,00")}
                  <i className="landing-hero__caret" />
                </span>
              </span>
              <svg className="landing-hero__pointer" viewBox="0 0 16 16" width="16" height="16">
                <path d="M3 2v11l3-3 2.2 4.5 1.8-.9L7.8 9.2H12z" />
              </svg>
            </span>
            <span className="landing-hero__note">
              {t("HTML 2.0 gives every web page an <input>.", "HTML 2.0 gir hver nettside en <input>.")}
            </span>
          </li>
          <li>
            <span className="landing-hero__gap" aria-hidden="true">
              {t("29 years of clicking", "29 år med klikking")}
            </span>
            <span className="landing-hero__date">2024</span>
            <span className="landing-hero__era">{t("Agents guess", "Agenter gjetter")}</span>
            <span className="landing-hero__scene" aria-hidden="true">
              <span className="landing-hero__field" data-wrong="">
                <span className="landing-hero__field-label">{t("Amount", "Beløp")}</span>
                <span className="landing-hero__field-value">
                  <s>{t("125.00", "125,00")}</s>
                </span>
              </span>
              <span className="landing-hero__detect">{t("Amount field? 82% sure", "Beløpsfelt? 82 % sikker")}</span>
            </span>
            <span className="landing-hero__note">
              {t(
                "AI agents start using apps by reading screenshots and DOM snapshots.",
                "AI-agenter begynner å bruke apper ved å lese skjermbilder og DOM-snapshots.",
              )}
            </span>
          </li>
          <li data-current="">
            <span className="landing-hero__gap" aria-hidden="true">
              {t("2 years of guessing", "2 år med gjetting")}
            </span>
            <span className="landing-hero__date">{t("Today", "I dag")}</span>
            <span className="landing-hero__era">
              {t("With Booki, agents act by name", "Med Booki handler agenter ved navn")}
            </span>
            <span className="landing-hero__scene" aria-hidden="true">
              <span className="landing-hero__field" data-agent="">
                <span className="landing-hero__field-label">{t("Amount", "Beløp")}</span>
                <span className="landing-hero__field-value">{t("12,500.00", "12 500,00")}</span>
              </span>
              <span className="landing-hero__agent">
                <svg viewBox="0 0 16 16" width="16" height="16">
                  <path d="M3 2v11l3-3 2.2 4.5 1.8-.9L7.8 9.2H12z" />
                </svg>
                <span>{t("Agent · sets Amount", "Agent · setter Beløp")}</span>
              </span>
            </span>
            <span className="landing-hero__note">
              {t(
                "The exact amount, checked. Posted by the agent, within your rules.",
                "Eksakt beløp, sjekket. Bokført av agenten, innenfor reglene deres.",
              )}
            </span>
          </li>
        </ol>
        <div className="mt-6 grid w-full grid-cols-[minmax(0,1fr)] justify-items-center gap-2">
          <div className="landing-hero__cta">
            <PromptButton prompt={AGENT_PROMPT} />
            <Button
              type="button"
              className="landing-hero__see"
              aria-expanded={promptOpen}
              aria-controls="hero-prompts"
              onClick={() => setPromptOpen((open) => !open)}
            >
              {promptOpen ? t("Hide the prompt", "Skjul prompten") : t("See the prompt", "Se prompten")}
            </Button>
          </div>
          <p className="m-0 text-sm text-muted-foreground">
            {t(
              "Your agent explains Booki and asks before changing anything. About 30 min.",
              "Agenten forklarer Booki og spør før den endrer noe. Rundt 30 min.",
            )}
          </p>
          {/* In the page either way, so the prompts are part of its text; shown on request. */}
          <div id="hero-prompts" className="landing-hero__prompt" hidden={!promptOpen}>
            <InstallBlock
              label={t("One screen (the button above)", "Ett skjermbilde (knappen over)")}
              command={AGENT_PROMPT}
            />
            <InstallBlock
              label={t("The whole app instead: takes hours", "Hele appen i stedet: tar timer")}
              command={AGENT_PROMPT_FULL}
            />
          </div>
        </div>
        <nav
          aria-label={t("Read more", "Les mer")}
          className="mt-5 flex flex-wrap items-center justify-center gap-6 text-sm"
        >
          <TextLink asChild icon={<FeaturesIcon />}>
            <Link to="/features">{t("Features", "Funksjoner")}</Link>
          </TextLink>
          <TextLink asChild icon="docs">
            <Link to="/docs">Docs</Link>
          </TextLink>
          <TextLink href={REPO_URL} target="_blank" rel="noreferrer" icon="github">
            GitHub
          </TextLink>
        </nav>
      </div>

      <DemoCarousel agent={agent} from={markRef} to={proofRef} />

      <div ref={proofRef}>
        <ProofStrip />
      </div>
    </section>
  );
}

/** Four tiles: the controls, side by side. Same 16px grid as the docs and GitHub icons. */
function FeaturesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" data-slot="text-link-icon">
      <rect x="2" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="2" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="2" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="9" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
