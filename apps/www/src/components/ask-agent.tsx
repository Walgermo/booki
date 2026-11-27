import { useEffect, useRef, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/lang";
import { askLiveAgent, liveAgentStatus, type LiveEvent } from "@/lib/live-agent";

type Row = { id: number; who: "you" | "agent" | "tool" | "note"; text: string; ok?: boolean };

const EXAMPLES = {
  en: [
    "Match the Brattli payment to the invoices it covers.",
    "Draft the voucher for the Kontorrekvisita invoice and make it postable.",
    "What is still waiting for me?",
  ],
  nb: [
    "Avstem innbetalingen fra Brattli mot fakturaene den dekker.",
    "Før bilaget for fakturaen fra Kontorrekvisita, klart til bokføring.",
    "Hva venter fortsatt på meg?",
  ],
};

/**
 * A real model working this page. Its tool calls run in the browser against
 * the agent bridge, so the controls change in front of the person asking.
 */
export function AskAgent() {
  const { lang, t } = useLang();
  const [status, setStatus] = useState<"checking" | "on" | "off" | "unavailable">("checking");

  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const seq = useRef(0);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (status !== "checking") return;
    let live = true;
    void liveAgentStatus().then(
      (result) => live && setStatus(result.enabled ? "on" : "off"),
      () => live && setStatus("unavailable"),
    );
    return () => {
      live = false;
    };
  }, [status]);

  useEffect(() => () => abort.current?.abort(), []);

  const add = (row: Omit<Row, "id">) => {
    seq.current += 1;
    const id = seq.current;
    setRows((list) => [...list, { id, ...row }]);
  };

  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setBusy(true);
    setPrompt("");
    add({ who: "you", text: question });
    abort.current = new AbortController();
    const onEvent = (event: LiveEvent) => {
      if (event.type === "text") add({ who: "agent", text: event.text });
      else if (event.type === "tool") add({ who: "tool", text: `${event.name}: ${event.summary}`, ok: event.ok });
      else add({ who: "note", text: event.reason });
    };
    try {
      await askLiveAgent(question, onEvent, { signal: abort.current.signal });
    } catch (error) {
      if (!abort.current.signal.aborted) {
        setPrompt((draft) => draft || question);
        add({ who: "note", text: error instanceof Error ? error.message : String(error) });
      }
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void ask(prompt);
  }

  if (status === "unavailable") {
    return (
      <div>
        <p role="status">{t("Couldn’t reach the agent.", "Fikk ikke kontakt med agenten.")}</p>
        <Button
          variant="secondary"
          onClick={() => {
            setStatus("checking");
          }}
        >
          {t("Try again", "Prøv igjen")}
        </Button>
      </div>
    );
  }

  if (status === "off") {
    return (
      <div className="grid max-w-prose gap-2 text-sm">
        <p className="m-0">
          {t("The live agent is switched off on this server.", "Den levende agenten er slått av på denne serveren.")}
        </p>
        <p className="m-0 text-muted-foreground">
          {t(
            "It needs a Claude API key on the server side. For local development, put",
            "Den trenger en Claude API-nøkkel på serveren. Lokalt legger dere",
          )}{" "}
          <code>ANTHROPIC_API_KEY</code> {t("in", "i")} <code>apps/www/.env.local</code>{" "}
          {t(
            "and restart the dev server. The scripted run at the top of the page works without it.",
            "og starter utviklingsserveren på nytt. Den skriptede kjøringen øverst på siden virker uten.",
          )}
        </p>
      </div>
    );
  }

  return (
    <div className="grid max-w-2xl gap-4">
      <form onSubmit={onSubmit} className="grid gap-2">
        <label htmlFor="ask-agent" className="site-label">
          {t("Tell the agent what to do", "Si hva agenten skal gjøre")}
        </label>
        <div className="flex flex-wrap gap-2">
          {/* The person's instruction to the agent: not a field the agent fills in itself. */}
          <input
            data-agent-hidden=""
            id="ask-agent"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={t("Match the Brattli payment…", "Avstem innbetalingen fra Brattli…")}
            autoComplete="off"
            disabled={busy || status !== "on"}
            className="min-h-11 min-w-0 flex-1 basis-64"
          />
          <Button type="submit" size="lg" disabled={busy || status !== "on" || !prompt.trim()}>
            {busy ? t("Working…", "Jobber…") : t("Ask", "Spør")}
          </Button>
          {busy ? (
            <Button type="button" variant="outline" size="lg" onClick={() => abort.current?.abort()}>
              {t("Stop", "Stopp")}
            </Button>
          ) : null}
        </div>
      </form>

      <div className="flex flex-wrap gap-2">
        {EXAMPLES[lang].map((example) => (
          <Button
            key={example}
            variant="outline"
            className="ask-agent__example"
            disabled={busy || status !== "on"}
            onClick={() => void ask(example)}
          >
            {example}
          </Button>
        ))}
      </div>

      {rows.length > 0 ? (
        <ol className="site-rows" aria-live="polite">
          {rows.map((row) => (
            <li key={row.id} className="grid gap-1 text-sm sm:grid-cols-[4rem_minmax(0,1fr)] sm:gap-4">
              <span className="text-muted-foreground">
                {row.who === "you"
                  ? t("You", "Du")
                  : row.who === "agent"
                    ? "Agent"
                    : row.who === "tool"
                      ? t("Action", "Handling")
                      : t("Note", "Merknad")}
              </span>
              <span
                className={
                  row.who === "tool"
                    ? `font-mono text-xs [overflow-wrap:anywhere] ${row.ok ? "" : "text-destructive"}`
                    : "whitespace-pre-wrap [overflow-wrap:anywhere]"
                }
              >
                {row.text}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}
