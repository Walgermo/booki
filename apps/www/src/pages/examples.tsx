import { catalogMeta } from "@/lib/catalog-meta";
import { usePageMeta } from "@/lib/lang";
import { AgentPresence, BookiLocaleProvider } from "@booki-aui/react";

import { agent } from "@/agent";
import { Extend } from "@/components/landing/extend";
import { Flex } from "@/components/landing/flex";
import { TokenStory } from "@/components/landing/tokens";
import { SiteAgentCursor } from "@/components/site-agent-cursor";
import { useLang } from "@/lib/lang";

/**
 * Examples: the live comparisons and control demos that used to sit on the
 * landing page. One invoice on a plain form and on Booki, with the code; the
 * controls in different setups; and a control of your own with definePrimitive.
 */
const PAGE_META = catalogMeta("examples");

export function ExamplesPage() {
  usePageMeta(PAGE_META);
  const { t } = useLang();
  return (
    <BookiLocaleProvider country="US">
      <AgentPresence agent={agent} />
      <SiteAgentCursor />
      <div className="grid gap-4">
        <h1 className="site-page-title mt-0 mb-0">{t("Examples", "Eksempler")}</h1>
        <p className="m-0 max-w-[60ch] text-muted-foreground">
          {t(
            "Try the live Booki demos on the site’s agent bridge and read the code behind them.",
            "Prøv Booki-demoene med sidens agentbro og les koden bak dem.",
          )}
        </p>
      </div>
      <TokenStory agent={agent} />
      <Flex agent={agent} />
      <Extend agent={agent} />
    </BookiLocaleProvider>
  );
}
