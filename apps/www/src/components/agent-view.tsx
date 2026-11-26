import { elementOf } from "@ui-sdk/react/observe";
import { useEffect, useState, type RefObject } from "react";

import { agent } from "@/agent";
import { CodePanel } from "@/components/code-panel";
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

const HIDDEN_KEYS = new Set(["ref", "component", "label", "actions", "confirm", "offPage", "items"]);

function stateOf(entry: Entry): string {
  const state: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(entry)) {
    if (!HIDDEN_KEYS.has(key)) state[key] = value;
  }
  return JSON.stringify(state, null, 2);
}

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
 * Live agent snapshot of the control in the preview: what an agent can read
 * and which actions it may call. Updates as the preview is edited.
 */
export function AgentView({ scope }: { scope: RefObject<HTMLElement | null> }) {
  const { t } = useLang();
  // null until the bridge has been read: the build's HTML is made before any bridge runs.
  const [entries, setEntries] = useState<Entry[] | null>(null);

  useEffect(() => {
    // In the order the bridge first saw them (c1, c2, …): a part that appears later
    // (a field's error, an opened dialog) joins at the end instead of pushing the list down.
    const order = (entry: Entry) => Number(entry.ref.replace(/\D/g, "")) || 0;
    const read = () => setEntries(entriesIn(scope.current).sort((a, b) => order(a) - order(b)));
    // Read after the bridge has finished notifying, never inside a change.
    let timer = 0;
    const later = () => {
      if (timer) return;
      timer = window.setTimeout(() => {
        timer = 0;
        read();
      }, 0);
    };
    const frame = requestAnimationFrame(read);
    const unsubscribe = agent.subscribe(later);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, [scope]);

  return (
    <section data-markdown-hidden aria-labelledby="agent-view-title" className="grid min-w-0 content-start gap-2">
      <h2 id="agent-view-title" className="site-kicker">
        {t("The agent reads", "Agenten leser")}
      </h2>
      {/* As tall as the snapshot, up to a cap with its own scroll. */}
      <CodePanel label={t("Snapshot", "Øyeblikksbilde")} maxHeight="26rem">
        {entries === null ? (
          <p className="m-0 font-mono text-xs text-ink-muted">
            {t(
              "The snapshot is read from the running page: open it in a browser, or call window.agent.snapshot() there.",
              "Øyeblikksbildet leses fra siden mens den kjører: åpne den i en nettleser, eller kall window.agent.snapshot() der.",
            )}
          </p>
        ) : entries.length === 0 ? (
          <p className="m-0 font-mono text-xs text-ink-muted">
            {t(
              "Nothing from this preview is in the agent's snapshot. It only displays, so an agent has nothing to read or call on it; it works from the data you pass instead.",
              "Ingenting fra denne forhåndsvisningen er i agentens øyeblikksbilde. Den bare viser, så en agent har ingenting å lese eller kalle på den; den jobber med dataene dere sender inn i stedet.",
            )}
          </p>
        ) : (
          <ul className="site-rows site-rows--ink">
            {entries.map((entry) => (
              <li key={entry.ref} className="grid min-w-0 gap-2">
                <p className="m-0 text-sm font-medium [overflow-wrap:anywhere]">{entry.label ?? entry.ref}</p>
                <p className="m-0 font-mono text-xs text-signal [overflow-wrap:anywhere]">
                  {entry.actions.length > 0
                    ? entry.actions.join(" · ")
                    : t("no actions: it is read, not operated", "ingen handlinger: den leses, den styres ikke")}
                </p>
                {entry.confirm ? (
                  <p className="m-0 font-mono text-xs text-ink-muted [overflow-wrap:anywhere]">
                    {t("Needs a person: ", "Krever en person: ")}
                    {entry.confirm}
                  </p>
                ) : null}
                <pre className="site-readers__json">{stateOf(entry)}</pre>
              </li>
            ))}
          </ul>
        )}
      </CodePanel>
    </section>
  );
}
