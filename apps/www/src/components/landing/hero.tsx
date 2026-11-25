import { TextLink } from "@booki-aui/react";
import { useRef } from "react";
import { Link } from "react-router-dom";

import { useLang } from "@/lib/lang";
import { ErpWindow } from "./agentify-erp";
import { HeroTitle } from "./hero-title";
import { MeasuredFigures } from "./measured-figures";
import { PromptButton } from "./prompt-button";
import { ProofStrip } from "./proof-strip";
import { AGENT_PROMPT, REPO_URL, type LandingAgent } from "./shared";

/**
 * The landing page's hero: the title, one line on what it gives, two measured
 * figures, the Install button, the demo ERP the agent works in, and the three
 * figures told in full.
 */
export function Hero({ agent }: { agent: LandingAgent }) {
  const { t } = useLang();
  const markRef = useRef<HTMLSpanElement | null>(null);
  const proofRef = useRef<HTMLDivElement | null>(null);
  return (
    <section className="site-ledger grid grid-cols-[minmax(0,1fr)] gap-16 pt-[76px] pb-16 md:gap-28 md:pb-24">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] justify-items-center text-center">
        <HeroTitle
          className="landing-hero__title m-0 w-full max-w-full min-w-0 text-balance"
          text={t("Get agentic UI for your ERP", "Få agentisk UI til deres ERP-system")}
          mark={t("agentic", "agentisk")}
          // Booki is for more than an ERP: the last word turns through the business SaaS it fits,
          // from the books to the CRM. No word longer than the longest here, or the title shrinks.
          rotate={t(
            "ERP|CRM|invoicing tool|payments app|help desk|HR system|project tool|audit software|expense app",
            "ERP-system|CRM|fakturasystem|betalingsløsning|helpdesk|HR-system|prosjektverktøy|revisjonsverktøy|utleggssystem",
          ).split("|")}
          markRef={markRef}
        />
        <p className="landing-hero__hook">
          {t("Make your code agentic with Booki.", "Gjør koden deres agentisk med Booki.")}
        </p>
        <MeasuredFigures />
        {/* The section's 76px sits under the header (logo and the news link), then 20 to the hook, 28 to the figures, 56 to the button. */}
        <div className="mt-14 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
          <PromptButton prompt={AGENT_PROMPT} />
        </div>
        <nav aria-label={t("Read more", "Les mer")} className="mt-5 flex items-center gap-6 text-sm">
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

      {/* The product on a stage, like a photograph on a backdrop. */}
      <div className="erp-stage">
        <ErpWindow agent={agent} from={markRef} to={proofRef} />
      </div>

      {/* After the demo, the agent's cursor goes on to the measured figures. */}
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
