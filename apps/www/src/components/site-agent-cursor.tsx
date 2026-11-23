import { AgentCursor, narrateNorwegian } from "@booki/react";

import { useAgentCursor } from "@/agent";
import { useLang } from "@/lib/lang";

/** The agent's pointer for this page: on while the page is open, off on the benchmark pages. */
export function SiteAgentCursor() {
  const cursor = useAgentCursor();
  const { lang } = useLang();
  return (
    <AgentCursor cursor={cursor} label="Agent" narrate={lang === "nb" ? narrateNorwegian : (state) => state.action} />
  );
}
