import { Icon } from "@booki-aui/icons/react";
import { Popover, PopoverContent, PopoverTrigger } from "@ui-sdk/react/popover";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/lang";

export function DocsPageActions({ pathname }: { pathname: string }) {
  const { t } = useLang();
  const markdown = `${pathname.replace(/\/+$/, "")}.md`;
  const prompt = t(
    `Read https://booki.dev${markdown} and help me apply this documentation in my app.`,
    `Les https://booki.dev${markdown} og hjelp meg å bruke dokumentasjonen i appen min.`,
  );
  const more = t("More page actions", "Flere sidehandlinger");
  const [state, setState] = useState<"ready" | "copying" | "copied" | "failed">("ready");

  useEffect(() => {
    if (state !== "copied") return;
    const timer = window.setTimeout(() => setState("ready"), 2200);
    return () => window.clearTimeout(timer);
  }, [state]);

  async function readMarkdown() {
    const response = await fetch(markdown, { headers: { Accept: "text/markdown" } });
    if (!response.ok) throw new Error("Markdown unavailable");
    const text = await response.text();
    if (!text.startsWith("# ")) throw new Error("Expected a Markdown page");
    return text;
  }

  async function copy() {
    setState("copying");
    try {
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard.write) {
        // Safari needs the clipboard call inside the click, before the fetch resolves.
        const blob = readMarkdown().then((text) => new Blob([text], { type: "text/plain" }));
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      } else {
        await navigator.clipboard.writeText(await readMarkdown());
      }
      setState("copied");
    } catch (error) {
      setState("failed");
      throw error;
    }
  }

  const view = t("View as Markdown", "Vis som Markdown (engelsk)");
  return (
    <div className="docs-page-actions" data-markdown-hidden="">
      <div className="docs-page-actions__split">
        <Button
          variant="secondary"
          size="sm"
          onClick={copy}
          aria-busy={state === "copying"}
          title={t("Copy the full page as Markdown", "Kopier hele siden som engelsk Markdown")}
        >
          <Icon name={state === "copied" ? "copy-check" : "copy"} />
          {t("Copy for LLM", "Kopier for LLM")}
        </Button>
        <Popover data-agent-label={more}>
          <PopoverTrigger aria-label={more} className="docs-page-actions__more">
            <Icon name="chevron-down" />
          </PopoverTrigger>
          <PopoverContent aria-label={more} align="end" className="docs-page-actions__links" data-markdown-hidden="">
            <a href={markdown}>{view}</a>
            <a href={`https://chatgpt.com/?q=${encodeURIComponent(prompt)}`} target="_blank" rel="noreferrer">
              {t("Ask ChatGPT about this page", "Spør ChatGPT om siden")} <Icon name="external-link" />
            </a>
            <a href="/llms.txt">{t("Documentation index for LLMs", "Dokumentasjonsindeks for LLM-er")}</a>
          </PopoverContent>
        </Popover>
      </div>
      <span role="status" className="docs-page-actions__status">
        {state === "copied" && t("Markdown copied", "Engelsk Markdown kopiert")}
        {state === "failed" && (
          <>
            {t("Couldn’t copy.", "Kunne ikke kopiere.")} <a href={markdown}>{view}</a>
          </>
        )}
      </span>
    </div>
  );
}
