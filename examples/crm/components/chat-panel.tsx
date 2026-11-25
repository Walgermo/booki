"use client";

import { localize } from "@booki/core/messages";
import { useState } from "react";
import { useAssistant } from "@/lib/assistant";
import { nameOf } from "@/lib/people";

const TOOL_LABEL: Record<string, string> = {
  crm_snapshot: "leste siden",
  crm_query: "leste oppføringer",
  crm_act: "handlet",
};

/** What a tool returned, as one line for the person: a refusal in Norwegian, otherwise nothing. */
function toolNote(part: { state: string; output?: unknown; errorText?: string }): string | null {
  if (part.state === "output-error") return part.errorText ? localize(part.errorText, "nb") : "feilet";
  if (part.state !== "output-available") return "…";
  const content = (part.output as { content?: { type: string; text?: string }[] } | undefined)?.content;
  const raw = content?.find((item) => item.type === "text")?.text;
  if (!raw) return null;
  try {
    const result = JSON.parse(raw) as { ok?: boolean; error?: { message?: string } };
    return result.ok === false && result.error?.message ? localize(result.error.message, "nb") : null;
  } catch {
    return null;
  }
}

/**
 * Chat with the page. The model gets no tools written for this app: it gets
 * what the page's controls offer, through Booki's bridge, and it stops where a
 * person's decision begins, the same as the scripted tasks.
 */
export function ChatPanel({ me }: { me: string }) {
  const { messages, sendMessage, status, error, ready, setupError } = useAssistant(me);
  const [input, setInput] = useState("");
  const busy = status === "submitted" || status === "streaming";

  return (
    <section
      data-booki=""
      aria-labelledby="chat"
      className="grid content-start gap-3 rounded-lg border border-[color:var(--bk-border)] p-4"
    >
      <h2 id="chat" className="text-lg font-semibold">
        Spør agenten
      </h2>
      <p className="text-sm text-[color:var(--bk-muted-fg)]">
        En modell bruker sidens egne verktøy gjennom WebMCP: ingen skjermbilder, ingen klikk, og de samme reglene som
        oppgavene over.
      </p>
      {setupError ? (
        <p role="status" className="text-sm">
          {setupError}
        </p>
      ) : null}
      <ol aria-live="polite" className="grid gap-2 text-sm">
        {messages.map((message) => (
          <li key={message.id} className="grid gap-1">
            <span className="text-xs text-[color:var(--bk-muted-fg)]">
              {message.role === "user" ? nameOf(me) : "Agenten"}
            </span>
            {message.parts.map((part, index) => {
              if (part.type === "text") return <p key={index}>{part.text}</p>;
              if (part.type === "dynamic-tool") {
                const note = toolNote(part);
                return (
                  <p key={index} data-slot="tool" className="font-mono text-xs text-[color:var(--bk-muted-fg)]">
                    {TOOL_LABEL[part.toolName] ?? part.toolName}
                    {note ? `: ${note}` : ""}
                  </p>
                );
              }
              return null;
            })}
          </li>
        ))}
      </ol>
      {error ? (
        <p role="alert" className="text-sm">
          {error.message}
        </p>
      ) : null}
      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const text = input.trim();
          if (!ready || busy || !text) return;
          void sendMessage({ text });
          setInput("");
        }}
      >
        <label className="grid gap-1 text-sm" htmlFor="chat-input">
          Melding
          <input
            id="chat-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Flytt Konsernrapportering til forhandling"
            autoComplete="off"
          />
        </label>
        <button type="submit" disabled={!ready || busy} aria-busy={busy}>
          {busy ? "Agenten jobber …" : "Send"}
        </button>
      </form>
    </section>
  );
}
