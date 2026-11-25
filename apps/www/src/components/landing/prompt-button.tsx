import { Button } from "@ui-sdk/react/button";
import { useEffect, useRef, useState } from "react";

import { useLang } from "@/lib/lang";

/** ms the slip stays once nobody is reading it. Paused while hovered, focused or the tab is hidden. */
const LIFETIME = 7000;

type State = "idle" | "copied" | "manual";

const isMac = () =>
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(
    (navigator as { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? "",
  );

/**
 * A click copies the setup prompt, and the button
 * prints a receipt: a paper slip unrolls from under it with the start of the
 * prompt and the one thing left to do, paste it into a coding agent. The slip
 * waits while it is read (hover, focus, hidden tab), closes on Escape or a
 * click outside, and falls back to the whole prompt, selected, when the
 * browser refuses the clipboard.
 */
export function PromptButton({ prompt }: { prompt: string }) {
  const { lang, t } = useLang();
  const [state, setState] = useState<State>("idle");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const manual = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<{ id: number | null; left: number; since: number }>({ id: null, left: LIFETIME, since: 0 });
  const holds = useRef(new Set<string>());

  const stopTimer = () => {
    const clock = timer.current;
    if (clock.id !== null) {
      window.clearTimeout(clock.id);
      clock.id = null;
      clock.left = Math.max(0, clock.left - (performance.now() - clock.since));
    }
  };
  const startTimer = () => {
    const clock = timer.current;
    if (clock.id !== null || holds.current.size > 0) return;
    clock.since = performance.now();
    clock.id = window.setTimeout(() => setOpen(false), clock.left);
  };
  const hold = (reason: string, on: boolean) => {
    if (on) {
      holds.current.add(reason);
      stopTimer();
    } else {
      holds.current.delete(reason);
      startTimer();
    }
  };

  async function copy() {
    let ok = true;
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      ok = false;
    }
    stopTimer();
    timer.current = { id: null, left: LIFETIME, since: 0 };
    setState(ok ? "copied" : "manual");
    setOpen(true);
  }

  // The countdown runs while the slip is open and nobody holds it; a failed copy stays until closed.
  useEffect(() => {
    if (!open || state !== "copied") return;
    startTimer();
    return stopTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, state]);

  useEffect(() => {
    if (!open) return;
    if (state === "manual") manual.current?.select();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    // A press that starts inside never closes it, wherever it ends.
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onVisible = () => hold("hidden", document.hidden);
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, state]);

  // Back to the plain label once the slip has gone, so the next visit to the button reads as an offer again.
  useEffect(() => {
    if (open || state === "idle") return;
    const id = window.setTimeout(() => setState("idle"), 600);
    return () => window.clearTimeout(id);
  }, [open, state]);

  const chars = prompt.length.toLocaleString(lang === "nb" ? "nb-NO" : "en-US");
  const preview = prompt.split("\n").filter(Boolean).slice(0, 4);
  const mod = isMac() ? "⌘" : "Ctrl";
  const done = state !== "idle";

  return (
    <div
      ref={root}
      className="prompt-button"
      data-open={open ? "" : undefined}
      onPointerEnter={(event) => event.pointerType === "mouse" && hold("hover", true)}
      onPointerLeave={(event) => event.pointerType === "mouse" && hold("hover", false)}
      onFocus={() => hold("focus", true)}
      onBlur={(event) => {
        if (!root.current?.contains(event.relatedTarget as Node)) hold("focus", false);
      }}
    >
      {/* A ui-sdk Button, so an agent on the page presses it through the bridge like a person. */}
      <Button
        className="prompt-button__trigger"
        data-done={done ? "" : undefined}
        aria-expanded={open}
        aria-controls="prompt-slip"
        onClick={copy}
      >
        <span className="prompt-button__face" data-face="idle" aria-hidden={done}>
          <span className="prompt-button__caret" aria-hidden="true" />
          <span className="prompt-button__label">{t("Copy agent prompt", "Kopier agentprompt")}</span>
          <span className="prompt-button__copy">
            <CopyIcon />
          </span>
        </span>
        <span className="prompt-button__face" data-face="done" aria-hidden={!done}>
          <CheckIcon />
          {state === "manual" ? t("Copy it below", "Kopier den under") : t("Copied", "Kopiert")}
        </span>
      </Button>

      <div id="prompt-slip" className="prompt-slip" role="status" aria-live="polite" hidden={!open}>
        {open ? (
          <div className="prompt-slip__paper">
            <p className="prompt-slip__head">
              <span>
                {state === "manual" ? t("Not copied", "Ikke kopiert") : t("On your clipboard", "I utklippstavlen")}
              </span>
              <span>
                1 prompt · {chars} {t("chars", "tegn")}
              </span>
            </p>

            {state === "manual" ? (
              <>
                <p className="prompt-slip__lead">
                  {t(
                    "Your browser blocked the clipboard. Copy it from here:",
                    "Nettleseren stoppet utklippstavlen. Kopier den herfra:",
                  )}
                </p>
                <textarea
                  ref={manual}
                  className="prompt-slip__manual"
                  readOnly
                  value={prompt}
                  rows={6}
                  aria-label={t("Agent prompt", "Agentprompt")}
                />
              </>
            ) : (
              <div className="prompt-slip__preview" aria-hidden="true">
                {preview.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            )}

            <div className="prompt-slip__cut" aria-hidden="true" />

            <p className="prompt-slip__step">
              <span className="prompt-slip__num">→</span>
              <span>
                {t("Paste it into your coding agent", "Lim den inn i kodeagenten deres")}
                <span className="prompt-slip__keys" aria-label={`${mod} V`}>
                  <kbd>{mod}</kbd>
                  <kbd>V</kbd>
                </span>
              </span>
            </p>
            <p className="prompt-slip__then">
              {t(
                "The prompt asks your coding agent to integrate Booki wherever it fits across your app and test which tasks an agent can carry out with the permissions you give it.",
                "Prompten ber kodeagenten bruke Booki der det passer i hele appen og teste hvilke oppgaver en agent kan utføre med tilgangene dere gir den.",
              )}
            </p>
            <p className="prompt-slip__agents">Claude Code · Cursor · Codex · Copilot</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="5" y="5" width="8.5" height="8.5" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M10.5 3.5V3A1.5 1.5 0 0 0 9 1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        className="prompt-button__tick"
        d="M3 8.5l3 3 7-7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength="1"
      />
    </svg>
  );
}
