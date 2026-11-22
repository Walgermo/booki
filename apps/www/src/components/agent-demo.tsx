import { localize } from "@booki/core/messages";
import { formatMoney, money } from "@booki/core/money";
import { useBookiLocale } from "@booki/react";
import { elementOf } from "@ui-sdk/react/observe";
import { useEffect, useRef, useState, type RefObject } from "react";

import { agent, cursor, whenCursorFree } from "@/agent";
import { entriesIn, type Entry } from "@/components/agent-view";
import { Button } from "@/components/ui/button";
import { useLang, type Lang } from "@/lib/lang";
import { AGENT_DEMOS, type Said } from "@/pages/agent-demos";

type Word = "done" | "refused" | "read" | "stopped";
type Row = { id: number; call: string; text: Said | string; word: Word };
type ActResult = { ok: boolean; error?: { message: string } };

const WORDS: Record<Word, Said> = {
  done: { en: "done", nb: "utført" },
  refused: { en: "refused", nb: "avvist" },
  read: { en: "read", nb: "lest" },
  stopped: { en: "stopped", nb: "stoppet" },
};
const TONE: Record<Word, string> = { done: "good", refused: "bad", read: "neutral", stopped: "neutral" };

/** The bridge's own refusal of a step marked for a person, which Booki's messages do not cover. */
const SAID_NO = /^The person said no to "(.*)"\.$/;

/** A library answer in the reader's language: Booki's sentences, and the bridge's refusal of a gated step. */
/** The bridge's answer to an action a component does not offer (a person's decision, say). */
const TAKES_NO = /^(\S+) (\S+) takes no (\S+) now\. It takes: (.*)\.$/;

/** The bridge's answer to a press on a button that is disabled (an answer that waits for a typed word). */
const DISABLED = /^"(.*)" in (\S+) is disabled now\.$/;

function readable(text: string, lang: Lang) {
  if (lang === "nb" && SAID_NO.test(text)) return text.replace(SAID_NO, "Personen sa nei til «$1».");
  if (lang === "nb" && DISABLED.test(text)) return text.replace(DISABLED, "«$1» i $2 er deaktivert nå.");
  if (lang === "nb" && TAKES_NO.test(text)) return text.replace(TAKES_NO, "$1 $2 tar ikke imot $3 nå. Den tar: $4.");
  return localize(text, lang);
}

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** Let React render the change before the next read. */
const settle = () => new Promise<void>((resolve) => requestAnimationFrame(() => window.setTimeout(resolve, 0)));

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function callText(entry: Entry | undefined, action: string, args: unknown[]) {
  const shown = args.map((arg) => JSON.stringify(arg) ?? "undefined").join(", ");
  const call = `${action}(${shown.length > 80 ? `${shown.slice(0, 77)}…` : shown})`;
  return entry ? `${entry.component} · ${call}` : call;
}

/**
 * "See the agent work": runs the page's script through the site's one agent
 * bridge, with the visible cursor, on the control in the preview only. Every
 * call and the library's answer go in the log below the buttons.
 */
export function AgentDemo({
  name,
  scope,
  onReset,
}: {
  name: string;
  scope: RefObject<HTMLElement | null>;
  onReset: () => void;
}) {
  const { lang, t } = useLang();
  const { country, profile } = useBookiLocale();
  const [running, setRunning] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const stop = useRef(false);
  const seq = useRef(0);
  const alive = useRef(true);
  const logBox = useRef<HTMLDivElement | null>(null);
  const demo = AGENT_DEMOS[name];

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      stop.current = true;
    };
  }, []);

  // A new page or country is a fresh start.
  useEffect(() => {
    stop.current = true;
    setRows([]);
  }, [name, country]);

  // Keep the latest step in view, inside the log's own box.
  useEffect(() => {
    const box = logBox.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [rows]);

  if (!demo) return null;

  const push = (row: Omit<Row, "id">) => {
    seq.current += 1;
    const id = seq.current;
    if (alive.current) setRows((all) => [...all, { id, ...row }]);
  };

  async function run() {
    if (running || !demo) return;
    stop.current = false;
    setRunning(true);
    setRows([]);
    const pace = reducedMotion() ? 200 : 700;
    const fmt = (minor: number) => formatMoney(money(minor, profile.currency), { locale: profile.locale });
    try {
      await whenCursorFree();
      for (const step of demo({ country, profile, fmt })) {
        if (stop.current) {
          if (alive.current)
            push({ call: "—", text: { en: "Stopped by you.", nb: "Stoppet av deg." }, word: "stopped" });
          break;
        }
        const all = entriesIn(scope.current);
        const target = step.on ? all.filter((entry) => entry.component === step.on)[step.nth ?? 0] : undefined;

        if (step.kind === "read") {
          const element = target ? elementOf(target.ref) : scope.current;
          if (element instanceof HTMLElement) cursor.rest(element, t("reads", "leser"));
          push({
            call: target ? `snapshot() · ${target.component}` : "snapshot()",
            text: step.said(target, all),
            word: "read",
          });
          await wait(pace);
          continue;
        }

        if (!target) {
          push({
            call: `${step.on} · ${step.action}()`,
            text: {
              en: `No ${step.on} in this preview to call.`,
              nb: `Ingen ${step.on} i denne forhåndsvisningen å kalle.`,
            },
            word: "refused",
          });
          break;
        }
        const args = typeof step.args === "function" ? step.args(target) : (step.args ?? []);
        const result = (await agent.act({
          steps: [{ ref: target.ref, action: step.action, args }],
        } as never)) as ActResult;
        await settle();
        const after = entriesIn(scope.current).find((entry) => entry.ref === target.ref);
        push({
          call: callText(target, step.action, args),
          text: result.ok
            ? typeof step.done === "function"
              ? step.done(after)
              : step.done
            : (result.error?.message ?? { en: "Refused", nb: "Avvist" }),
          word: result.ok ? "done" : "refused",
        });
        await wait(pace);
      }
    } finally {
      if (alive.current) setRunning(false);
    }
  }

  const refusals = rows.filter((row) => row.word === "refused").length;
  const runLabels = [
    t("Agent working…", "Agenten jobber…"),
    t("Run it again", "Kjør på nytt"),
    t("See the agent work", "Se agenten jobbe"),
  ];
  const runShown = running ? 0 : rows.length ? 1 : 2;
  const stopLabels = [t("Stop", "Stopp"), t("Reset", "Tilbakestill")];

  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={running} aria-label={runLabels[runShown]} onClick={() => void run()}>
          <Same show={runShown} labels={runLabels} />
        </Button>
        <Button
          variant={running ? "outline" : "ghost"}
          aria-label={stopLabels[running ? 0 : 1]}
          disabled={!running && rows.length === 0}
          onClick={() => {
            if (running) {
              stop.current = true;
              return;
            }
            setRows([]);
            onReset();
          }}
        >
          <Same show={running ? 0 : 1} labels={stopLabels} />
        </Button>
        <span className="site-signal" data-state={running ? "working" : rows.length ? "done" : "idle"}>
          <Same
            show={running ? 0 : rows.length ? 1 : 2}
            labels={[
              t("agent running", "agenten kjører"),
              t("agent done", "agenten er ferdig"),
              t("agent idle", "agenten venter"),
            ]}
          />
        </span>
      </div>
      <div className="site-machine grid min-w-0 grid-rows-[auto_minmax(0,1fr)] !p-4" style={{ height: "12.5rem" }}>
        <p className="site-kicker m-0 mb-3">
          {t("Agent calls", "Agentens kall")}
          <span className="tabular-nums">
            {refusals > 0 ? ` · ${t(`${refusals} refused`, `${refusals} avvist`)}` : ""}
          </span>
        </p>
        <div
          ref={logBox}
          className="min-h-0 overflow-y-auto [overscroll-behavior:contain] [scrollbar-gutter:stable]"
          aria-live="polite"
        >
          {rows.length === 0 ? (
            <p className="m-0 font-mono text-xs text-ink-muted">
              {t(
                "No steps yet. Each call and the library's answer will be listed here.",
                "Ingen steg ennå. Hvert kall og bibliotekets svar listes her.",
              )}
            </p>
          ) : (
            <ol className="site-rows site-rows--ink m-0 list-none p-0 font-mono">
              {rows.map((row) => (
                <li key={row.id} className="grid min-w-0 gap-1 text-xs">
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <code className="min-w-0 text-ink-foreground [overflow-wrap:anywhere]">{row.call}</code>
                    <span className="landing-tag shrink-0" data-tone={TONE[row.word]}>
                      {WORDS[row.word][lang]}
                    </span>
                  </div>
                  <span className="text-ink-muted [overflow-wrap:anywhere]">
                    {typeof row.text === "string" ? readable(row.text, lang) : row.text[lang]}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

/** Several labels in one grid cell, one visible: the box is as wide as the longest, so it never jumps. */
function Same({ labels, show }: { labels: string[]; show: number }) {
  return (
    <span className="grid">
      {labels.map((label, index) => (
        <span
          key={index}
          className="[grid-area:1/1] text-center"
          style={{ visibility: index === show ? "visible" : "hidden" }}
        >
          {label}
        </span>
      ))}
    </span>
  );
}
