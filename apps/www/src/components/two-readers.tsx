import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@ui-sdk/react/collapsible";
import { useState, type ReactNode } from "react";

import { CodePanel } from "@/components/code-panel";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/lang";
import { cn } from "@/lib/utils";

/**
 * The site's core figure: what a person sees, on paper, beside what the
 * agent reads, on ink. Agent actions go in `actions`; inside ink a primary
 * button is the agent's (signal).
 */
export function TwoReaders({
  person,
  machine,
  actions,
  status,
  personLabel,
  machineLabel,
}: {
  person: ReactNode;
  machine: string;
  actions?: ReactNode;
  status?: ReactNode;
  personLabel?: string;
  machineLabel?: string;
}) {
  const { t } = useLang();
  return (
    <div className="site-readers">
      <div className="grid min-w-0 content-start gap-3">
        <p className="site-kicker">{personLabel ?? t("The person sees", "Personen ser")}</p>
        <div className="landing-form site-sheet">{person}</div>
      </div>
      <div className="site-machine grid min-w-0 content-start gap-4">
        <p className="site-kicker">{machineLabel ?? t("The agent reads", "Agenten leser")}</p>
        <pre className="site-readers__json">{machine}</pre>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
        {status !== undefined ? (
          <p className="m-0 min-h-5 font-mono text-xs text-ink-muted" role="status">
            {status}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A ui-sdk Collapsible in the site's disclosure look. The trigger is a real
 * button an agent finds in the snapshot and can open over the bridge, the
 * same as the person's click; `hiddenUntilFound` keeps the panel searchable.
 */
export function Disclosure({
  title,
  meta,
  children,
  className,
}: {
  title: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Collapsible className={cn("site-disclosure", className)}>
      <CollapsibleTrigger className="site-disclosure__trigger">
        <span>{title}</span>
        {/* A space so the agent's label reads "title meta", not "titlemeta". */}
        {meta ? " " : null}
        {meta ? <span className="font-mono text-xs tabular-nums text-muted-foreground">{meta}</span> : null}
      </CollapsibleTrigger>
      <CollapsiblePanel hiddenUntilFound>{children}</CollapsiblePanel>
    </Collapsible>
  );
}

/** Code behind a disclosure: a page shows what happens first, and how second. Code comes with a copy button. */
export function CodeDisclosure({ title, source }: { title: string; source: string }) {
  const { t } = useLang();
  const lines = source.trimEnd().split("\n").length;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard blocked (permissions or an insecure context): the code is still selectable.
    }
  };
  return (
    <Disclosure title={title} meta={t(`${lines} lines`, `${lines} linjer`)}>
      <CodePanel
        className="mt-3"
        label={title}
        maxHeight="28rem"
        action={
          <Button type="button" variant="ghost" size="sm" className="code-panel__copy" onClick={copy}>
            {copied ? t("Copied", "Kopiert") : t("Copy", "Kopier")}
          </Button>
        }
      >
        <pre>{source}</pre>
      </CodePanel>
    </Disclosure>
  );
}
