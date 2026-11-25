import { BookiLocaleProvider, AgentPresence } from "@booki-aui/react";

import { agent } from "@/agent";
import { SITE_META, usePageMeta, type PageMeta } from "@/lib/lang";
import { SiteAgentCursor } from "@/components/site-agent-cursor";
import { ErpRace } from "@/components/landing/erp-race";
import { Faq } from "@/components/landing/faq";
import { Hero } from "@/components/landing/hero";

/** The home page's own title, for the tab and the share card: not the hero's turning word. */
const META: PageMeta = {
  title: { en: "Booki: agentic UI for your app", nb: "Booki: agentisk UI for appen deres" },
  description: SITE_META.description,
};

/**
 * Landing: the hero (an agent working in a demo ERP, and the measured
 * figures), the test on Tripletex and DNB Regnskap, and the FAQ. The examples
 * live in /docs/examples. Everything runs on the site's one agent bridge
 * (src/agent.ts).
 */
export function LandingPage() {
  usePageMeta(META);
  return (
    <BookiLocaleProvider country="US">
      <AgentPresence agent={agent} />
      <SiteAgentCursor />
      <main>
        <Hero agent={agent} />
        <ErpRace />
        <Faq />
      </main>
    </BookiLocaleProvider>
  );
}
