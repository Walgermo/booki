import { elementOf } from "@ui-sdk/react/observe";
import { AgentSnapshot } from "@booki-aui/react";
import type { RefObject } from "react";

import { agent } from "@/agent";
import { useLang } from "@/lib/lang";

export type Entry = {
  ref: string;
  component: string;
  label?: string;
  actions: string[];
  confirm?: string;
  offPage?: boolean;
  [key: string]: unknown;
};

/**
 * The snapshot entries that belong to one preview: components whose element
 * sits inside it, and an open dialog it raised (dialogs render in a portal,
 * outside the sheet). The site's own chrome (language, theme, Copy) is left out.
 */
export function entriesIn(scope: HTMLElement | null): Entry[] {
  if (!scope) return [];
  return (agent.snapshot() as unknown as Entry[]).filter((entry) => {
    if (entry.offPage || entry.component === "more") return false;
    const element = elementOf(entry.ref);
    if (!element) return false;
    return scope.contains(element) || element.closest('[role="dialog"], [role="alertdialog"]') !== null;
  });
}

/**
 * Live agent snapshot of the control in the preview: Booki's own AgentSnapshot, scoped to
 * the preview, plus a dialog the preview raises (it renders in a portal outside it).
 */
export function AgentView({ scope }: { scope: RefObject<HTMLElement | null> }) {
  const { t } = useLang();
  return (
    <section data-markdown-hidden aria-labelledby="agent-view-title" className="grid min-w-0 content-start gap-2">
      <h2 id="agent-view-title" className="site-kicker">
        {t("The agent reads", "Agenten leser")}
      </h2>
      <AgentSnapshot
        agent={agent}
        scope={scope}
        dialogs
        heading={t("Snapshot", "Øyeblikksbilde")}
        emptyLabel={t(
          "Nothing from this preview is in the agent's snapshot. It only displays, so an agent has nothing to read or call on it; it works from the data you pass instead.",
          "Ingenting fra denne forhåndsvisningen er i agentens øyeblikksbilde. Den bare viser, så en agent har ingenting å lese eller kalle på den; den jobber med dataene dere sender inn i stedet.",
        )}
        maxHeight="26rem"
      />
    </section>
  );
}
