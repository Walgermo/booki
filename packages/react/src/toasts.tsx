import {
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastRegion,
  ToastTitle,
  createToaster,
  toast,
} from "@ui-sdk/react/toast";
import { useEffect, useLayoutEffect, useRef } from "react";
import type { AgentBridge } from "./booki-agent.js";
import { formatMoney, money } from "@booki-aui/core/money";
import { createBookiHistory } from "./booki-agent.js";
import { useBookiLocaleOptional } from "./locale.js";

const COPY = {
  EN: {
    region: "Notifications",
    close: "Dismiss",
    agent: "Agent",
    undo: "Undo",
    pending: "Still working",
    set: (label: string, value: string) => `Set ${label} to ${value}`,
    hidden: "a hidden value",
    empty: "empty",
    later: "Later changes came after this one; undo those first.",
  },
  NO: {
    region: "Varsler",
    close: "Lukk",
    agent: "Agent",
    undo: "Angre",
    pending: "Arbeider fortsatt",
    set: (label: string, value: string) => `Satte ${label} til ${value}`,
    hidden: "en skjult verdi",
    empty: "tom",
    later: "Det er gjort endringer etter denne; angre dem først.",
  },
} as const;

/** What a Booki toast carries beyond its text. */
export type BookiToastData = {
  /** Something an agent did: the toast wears the agent's mark. */
  agent?: boolean;
};

/** Any toaster from `createToaster()`, as the region takes it. */
type Toaster = NonNullable<Parameters<typeof ToastRegion>[0]["toaster"]>;

export type BookiToastsProps = {
  /** The queue to show. Default: the shared `toast()`. */
  toaster?: Toaster;
  side?: "top" | "bottom";
  align?: "start" | "center" | "end";
  className?: string;
};

/**
 * Where receipts land: "Voucher 1042 posted", "Payment run sent". Put it once
 * near the root. A toast an agent caused carries the agent's mark, in words
 * and in its colour. Timers pause while the pointer or focus is on them and
 * while the page is hidden; F6 moves focus to them and back.
 */
function BookiToasts({ toaster, side = "bottom", align = "end", className }: BookiToastsProps) {
  const { country } = useBookiLocaleOptional();
  const copy = COPY[country === "NO" ? "NO" : "EN"];
  return (
    <ToastRegion
      toaster={toaster}
      side={side}
      align={align}
      aria-label={copy.region}
      pendingAnnouncement={copy.pending}
      className={className}
      data-booki=""
      data-booki-toasts=""
      // Receipts are the person's: an agent must not read them or press Undo on them.
      data-agent-hidden=""
    >
      {(item) => {
        const agent = (item.data as BookiToastData | undefined)?.agent === true;
        return (
          <Toast data-booki-toast="" data-agent={agent ? "" : undefined}>
            <div data-booki-toast="text">
              {agent ? <span data-booki-toast="agent">{copy.agent}</span> : null}
              <ToastTitle data-booki-toast="title" />
              <ToastDescription data-booki-toast="description" />
            </div>
            <ToastAction data-booki-toast="action" />
            <ToastClose data-booki-toast="close" aria-label={copy.close}>
              ×
            </ToastClose>
          </Toast>
        );
      }}
    </ToastRegion>
  );
}

export type AgentToastOptions = {
  /** The queue to use. Default: the shared `toast()`. */
  toaster?: Toaster;
  /**
   * The history to describe and undo from. Default: one this hook records
   * with `createBookiHistory`. Undo puts the page back to just before that
   * change, so later changes are undone with it.
   */
  history?: ReturnType<typeof createBookiHistory>;
  /** How long each receipt shows, in ms. Default 6000. */
  duration?: number;
};

/**
 * A receipt for every change an agent makes on the page: "Agent set Amount
 * to 1 250,00", with Undo. A person sees what the agent did as it happens,
 * not only in the audit trail. Redacted changes (bank details) are described
 * without their value and cannot be undone.
 */
function useAgentToasts(agent: AgentBridge | null | undefined, options: AgentToastOptions = {}) {
  const { country, profile } = useBookiLocaleOptional();
  const copy = COPY[country === "NO" ? "NO" : "EN"];
  const latest = useRef({ copy, options, profile });
  // The subscription reads the newest copy and options; write them after render, not during it.
  useLayoutEffect(() => {
    latest.current = { copy, options, profile };
  });
  useEffect(() => {
    if (!agent) return;
    const own = latest.current.options.history ? null : createBookiHistory(agent);
    const history = latest.current.options.history ?? own!;
    // By entry id and the value toasted: the history folds repeated changes to
    // one field into one entry and drops undone ones, so its length is no guide.
    const toasted = new Map<string, string>();
    for (const entry of history.entries()) toasted.set(entry.id, JSON.stringify(entry.value));
    const unsubscribe = history.subscribe(() => {
      const { copy: words, options: now, profile: locale } = latest.current;
      for (const entry of history.entries()) {
        if (entry.source !== "agent" || entry.reverted) continue;
        const seen = JSON.stringify(entry.value);
        if (toasted.get(entry.id) === seen) continue;
        toasted.set(entry.id, seen);
        const value = entry.redacted
          ? words.hidden
          : entry.key === "minor" && typeof entry.value === "number"
            ? formatMoney(money(entry.value, locale.currency), { locale: locale.locale })
            : entry.value === "" || entry.value === null || entry.value === undefined
              ? words.empty
              : typeof entry.value === "object"
                ? JSON.stringify(entry.value).slice(0, 80)
                : String(entry.value);
        (now.toaster ?? toast)({
          // The same id updates the receipt in place when the agent changes the field again.
          id: `agent-${entry.id}`,
          title: words.set(entry.label, value),
          data: { agent: true } satisfies BookiToastData,
          duration: now.duration ?? 6000,
          ...(entry.redacted
            ? {}
            : {
                action: {
                  label: words.undo,
                  onAction: () => {
                    const entries = history.entries();
                    const index = entries.findIndex((item) => item.id === entry.id);
                    if (index < 0) return undefined;
                    // Going back past later changes would undo a person's work too: only the latest change undoes.
                    if (index !== history.position() - 1) return Promise.reject(new Error(words.later));
                    return history.seek(index);
                  },
                },
              }),
        });
      }
    });
    return () => {
      unsubscribe();
      own?.destroy();
    };
  }, [agent]);
}

export { BookiToasts, createToaster, toast, useAgentToasts };
