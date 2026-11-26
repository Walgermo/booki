import { useState, type ReactNode } from "react";

import { CodePanel } from "@/components/code-panel";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/lang";
import { cn } from "@/lib/utils";

export type InstallBlockProps = {
  command: string;
  label?: string;
  language?: "javascript" | "jsx";
  className?: string;
  trailing?: ReactNode;
  /** A single copy button (hero) or a code block with a copy action (docs). */
  variant?: "docs" | "hero";
  /** Prose (a prompt) wraps; code keeps its lines and scrolls. */
  wrap?: boolean;
  /** The hero button's look. */
  buttonVariant?: "primary" | "secondary" | "outline";
};

/** Copyable command or code. */
export function InstallBlock({
  command,
  label,
  language,
  className,
  trailing,
  variant = "docs",
  wrap,
  buttonVariant = "primary",
}: InstallBlockProps) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  if (!command) return null;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard may be blocked (permissions / insecure context).
    }
  };

  if (variant === "hero") {
    return (
      <Button
        type="button"
        variant={buttonVariant}
        size="lg"
        className={cn("min-w-[10.5rem]", className)}
        title={t(
          "Copies a setup prompt for your coding agent: skill, packages, agent bridge and a check in the running app",
          "Kopierer en oppsettsprompt til kodeagenten: skill, pakker, agentbro og en kontroll i appen mens den kjører",
        )}
        onClick={onCopy}
      >
        {copied ? t("Prompt copied", "Prompten er kopiert") : t("Copy agent prompt", "Kopier agentprompt")}
      </Button>
    );
  }

  return (
    <CodePanel
      className={cn("my-5", className)}
      wrap={wrap}
      label={label ?? t("Run", "Kjør")}
      action={
        <>
          {trailing}
          <Button type="button" variant="ghost" size="sm" className="code-panel__copy" onClick={onCopy}>
            {copied ? t("Copied", "Kopiert") : t("Copy", "Kopier")}
          </Button>
        </>
      }
    >
      <pre data-language={language}>
        <code>{command}</code>
      </pre>
    </CodePanel>
  );
}
