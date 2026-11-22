"use client";

import { localize } from "@booki/core/messages";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { pageAgent } from "@/lib/agent";
import { askModelAgent, modelAgentStatus, type ModelEvent } from "@/lib/model-agent";
import { nameOf } from "@/lib/people";
import { runScriptedAgent, type Report } from "@/lib/script";

const SUGGESTION = "Gå gjennom innboksen, konter det du kan, og si hva som venter på oss.";

/**
 * The agent's side of the page. "Kjør agenten" runs the scripted agent (no key
 * needed); with ANTHROPIC_API_KEY on the server, "Spør agenten" hands the same
 * page to a model. Both work for the person signed in, with the agent's own
 * credential, and stop where a person's decision begins.
 */
export function AgentPanel({ me }: { me: string }) {
  const [running, setRunning] = useState<"script" | "model" | null>(null);
  const busy = running !== null;
  const [report, setReport] = useState<Report | null>(null);
  const [events, setEvents] = useState<ModelEvent[]>([]);
  const [model, setModel] = useState<{ enabled: boolean; model?: string } | null>(null);
  const [prompt, setPrompt] = useState(SUGGESTION);
  const stop = useRef<AbortController | null>(null);
  // The agent reads Booki's refusals in English; the person reads them in Norwegian.
  const say = (text: string) => localize(text, "nb");
  const line = (text: string) => {
    const split = text.indexOf(": ");
    return split < 0 ? say(text) : `${text.slice(0, split)}: ${say(text.slice(split + 2))}`;
  };

  useEffect(() => {
    void modelAgentStatus().then(setModel);
  }, []);

  const runScript = async () => {
    setRunning("script");
    setEvents([]);
    try {
      setReport(await runScriptedAgent(pageAgent()));
    } finally {
      setRunning(null);
    }
  };

  const ask = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || prompt.trim() === "") return;
    setRunning("model");
    setReport(null);
    setEvents([]);
    stop.current = new AbortController();
    try {
      await askModelAgent(pageAgent(), prompt, (next) => setEvents((all) => [...all, next]), {
        signal: stop.current.signal,
      });
    } catch (error) {
      if (!stop.current.signal.aborted) {
        setEvents((all) => [
          ...all,
          { type: "stopped", reason: error instanceof Error ? error.message : String(error) },
        ]);
      }
    } finally {
      setRunning(null);
    }
  };

  return (
    <section aria-labelledby="agent" className="grid gap-3 rounded-lg border border-[color:var(--bk-border)] p-4">
      <h2 id="agent" className="text-lg font-semibold">
        Agenten
      </h2>
      <p className="text-sm text-[color:var(--bk-muted-fg)]">
        Jobber for {nameOf(me)}, med sin egen nøkkel. Den konterer, foreslår og forbereder; attestasjon, godkjenning og
        frigivelse er personenes.
      </p>
      <button type="button" data-booki="" onClick={() => void runScript()} disabled={busy} aria-busy={busy}>
        {running === "script" ? "Agenten jobber …" : "Kjør agenten"}
      </button>

      {model?.enabled ? (
        <form onSubmit={(event) => void ask(event)} className="grid gap-2">
          <label htmlFor="agent-prompt" className="text-sm">
            Eller spør modellen ({model.model})
          </label>
          <textarea
            id="agent-prompt"
            data-booki=""
            rows={3}
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void ask(event);
            }}
          />
          <div className="flex gap-2">
            <button type="submit" data-booki="" disabled={busy}>
              Spør agenten
            </button>
            {running === "model" ? (
              <button type="button" data-booki="" data-variant="secondary" onClick={() => stop.current?.abort()}>
                Stopp
              </button>
            ) : null}
          </div>
        </form>
      ) : model ? (
        <p className="text-xs text-[color:var(--bk-muted-fg)]">
          Med <code>ANTHROPIC_API_KEY</code> i <code>.env.local</code> kan du også spørre en modell.
        </p>
      ) : null}

      <div aria-live="polite" className="grid gap-2 text-sm">
        {report ? (
          <>
            {report.did.length > 0 ? (
              <div>
                <h3 className="font-medium">Gjorde</h3>
                <ul className="list-disc pl-5">
                  {report.did.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {report.waiting.length > 0 ? (
              <div>
                <h3 className="font-medium">Venter på en person</h3>
                <ul className="list-disc pl-5">
                  {report.waiting.map((text) => (
                    <li key={text}>{line(text)}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {report.did.length === 0 && report.waiting.length === 0 ? <p>Ingenting å gjøre akkurat nå.</p> : null}
          </>
        ) : null}
        {events.map((event, index) =>
          event.type === "text" ? (
            <p key={index}>{event.text}</p>
          ) : event.type === "tool" ? (
            <p key={index} className="font-mono text-xs" data-ok={event.ok ? "" : undefined}>
              {event.ok ? "✓" : "✗"} {event.summary}
            </p>
          ) : (
            <p key={index} className="text-[color:var(--bk-muted-fg)]">
              {event.reason}
            </p>
          ),
        )}
      </div>
    </section>
  );
}
