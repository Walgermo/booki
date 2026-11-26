import { TextLink } from "@booki-aui/react";
import { useRef } from "react";
import { Link } from "react-router-dom";

import { useLang } from "@/lib/lang";
import { DemoCarousel } from "./demo-carousel";
import { HeroTitle } from "./hero-title";
import { PromptButton } from "./prompt-button";
import { ProofStrip } from "./proof-strip";
import { InstallBlock } from "@/components/install-block";
import { AGENT_PROMPT, AGENT_PROMPT_FULL, REPO_URL, type LandingAgent } from "./shared";

export function Hero({ agent }: { agent: LandingAgent }) {
  const { t } = useLang();
  const markRef = useRef<HTMLSpanElement>(null);
  const proofRef = useRef<HTMLDivElement>(null);
  return (
    <section className="site-ledger grid grid-cols-[minmax(0,1fr)] gap-12 pt-12 pb-16 md:gap-20 md:pt-[76px] md:pb-24">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] justify-items-center text-center">
        <HeroTitle
          className="landing-hero__title m-0 w-full max-w-full min-w-0 text-balance"
          text={t("Get agentic UI for your ERP", "Få agentisk UI til deres ERP-system")}
          mark={t("agentic", "agentisk")}
          rotate={t(
            "ERP|CRM|invoicing tool|payments app|help desk|HR system|project tool|audit software|expense app",
            "ERP-system|CRM|fakturasystem|betalingsløsning|helpdesk|HR-system|prosjektverktøy|revisjonsverktøy|utleggssystem",
          ).split("|")}
          markRef={markRef}
        />
        <p className="landing-hero__hook">
          {t(
            "Booki is a set of UI components for your app (fields, tables and buttons) that people and AI agents both use. The agent fills them in by name, under your rules; approvals and other decisions stay with a person.",
            "Booki er et sett med UI-komponenter til appen deres (felt, tabeller og knapper) som både mennesker og AI-agenter bruker. Agenten fyller dem ut ved navn, etter reglene deres; godkjenninger og andre beslutninger blir hos en person.",
          )}
        </p>
        <dl className="landing-hero__points">
          <div>
            <dt>{t("You add", "Dere legger til")}</dt>
            <dd>
              {t(
                "Components for your app's forms, tables and buttons, in your framework.",
                "Komponenter til skjemaene, tabellene og knappene i appen, i rammeverket dere bruker.",
              )}
            </dd>
          </div>
          <div>
            <dt>{t("The agent", "Agenten")}</dt>
            <dd>
              {t(
                "Reads the screen as data and acts by name, with a visible cursor and an audit trail.",
                "Leser skjermen som data og handler ved navn, med synlig markør og revisjonsspor.",
              )}
            </dd>
          </div>
          <div>
            <dt>{t("People keep", "Mennesker beholder")}</dt>
            <dd>
              {t(
                "Approvals, sign-offs and every step you mark as theirs.",
                "Godkjenninger, signering og hvert steg dere merker som deres.",
              )}
            </dd>
          </div>
        </dl>
        <div className="mt-6 grid justify-items-center gap-2">
          <PromptButton prompt={AGENT_PROMPT} />
          <p className="m-0 max-w-[46ch] text-sm text-muted-foreground">
            {t(
              "Paste it into your coding agent. It explains Booki, suggests one screen, and asks before it changes anything. About 30 minutes.",
              "Lim den inn i kodeagenten deres. Den forklarer Booki, foreslår ett skjermbilde og spør før den endrer noe. Rundt 30 minutter.",
            )}
          </p>
          <details className="landing-hero__prompt">
            <summary>{t("What does the prompt do?", "Hva gjør prompten?")}</summary>
            <InstallBlock
              label={t("One screen (the button above)", "Ett skjermbilde (knappen over)")}
              command={AGENT_PROMPT}
            />
            <InstallBlock
              label={t("The whole app instead: takes hours", "Hele appen i stedet: tar timer")}
              command={AGENT_PROMPT_FULL}
            />
          </details>
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
