import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/lang";

type Text = { en: string; nb: string };

/** Requests against the demo company's real API (/api/books), each as a different caller. */
const CASES: { id: string; who: Text; token: string; what: Text; body: unknown }[] = [
  {
    id: "post",
    who: { en: "Agent", nb: "Agenten" },
    token: "demo-agent",
    what: { en: "posts a balanced voucher dated 31 October", nb: "bokfører et bilag i balanse datert 31. oktober" },
    body: {
      action: "post-voucher",
      date: "2026-10-31",
      lines: [
        { account: "6800", debitMinor: 1_550_000 },
        { account: "2400", creditMinor: 1_550_000 },
      ],
    },
  },
  {
    id: "unbalanced",
    who: { en: "Agent", nb: "Agenten" },
    token: "demo-agent",
    what: { en: "posts a voucher that does not balance", nb: "bokfører et bilag som ikke går i balanse" },
    body: {
      action: "post-voucher",
      date: "2026-10-31",
      lines: [
        { account: "6800", debitMinor: 1_550_000 },
        { account: "2400", creditMinor: 1_000_000 },
      ],
    },
  },
  {
    id: "closed",
    who: { en: "Agent", nb: "Agenten" },
    token: "demo-agent",
    what: { en: "posts into September, which is closed", nb: "bokfører i september, som er lukket" },
    body: {
      action: "post-voucher",
      date: "2026-09-30",
      lines: [
        { account: "6800", debitMinor: 1_550_000 },
        { account: "2400", creditMinor: 1_550_000 },
      ],
    },
  },
  {
    id: "approve-agent",
    who: { en: "Agent", nb: "Agenten" },
    token: "demo-agent",
    what: { en: "approves a supplier invoice", nb: "attesterer en leverandørfaktura" },
    body: { action: "decide-approval", decision: "approved" },
  },
  {
    id: "approve-kari",
    who: { en: "Kari, manager", nb: "Kari, leder" },
    token: "demo-kari",
    what: { en: "approves the same invoice", nb: "attesterer den samme fakturaen" },
    body: { action: "decide-approval", decision: "approved" },
  },
  {
    id: "release",
    who: { en: "Ola, controller", nb: "Ola, controller" },
    token: "demo-ola",
    what: { en: "releases a payment run he approved", nb: "frigir en betalingsbunt han selv har godkjent" },
    body: { action: "release-payments" },
  },
];

type Answer = { status: number; body: string };

/**
 * The rules the screens enforce, checked again by the server with
 * `@booki-aui/core/server`. Each button sends a real request; the bearer token is
 * the caller, as a sign-in would set it, never a field the client fills in.
 */
export function ServerRules() {
  const { lang, t } = useLang();
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  // An answer is in the language it was asked in; a new language starts the panel over.
  const [askedIn, setAskedIn] = useState(lang);
  if (askedIn !== lang) {
    setAskedIn(lang);
    setAnswers({});
  }

  const send = async (item: (typeof CASES)[number]) => {
    const response = await fetch("/api/books", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${item.token}`,
        // The API answers in the caller's language: the page's own ("nb" for Norwegian).
        "accept-language": lang,
      },
      body: JSON.stringify(item.body),
    });
    const body = await response.text();
    setAnswers((prev) => ({ ...prev, [item.id]: { status: response.status, body } }));
  };

  return (
    <div className="grid gap-4">
      <ul className="site-rows m-0 list-none p-0">
        {CASES.map((item) => {
          const answer = answers[item.id];
          let line = "";
          if (answer) {
            try {
              const parsed = JSON.parse(answer.body) as { actor?: string; code?: string; message?: string };
              line =
                parsed.message ??
                (parsed.actor ? t(`Recorded as ${parsed.actor}`, `Registrert som ${parsed.actor}`) : "");
              if (parsed.code) line = `${parsed.code} · ${line}`;
            } catch {
              line = answer.body.slice(0, 160);
            }
          }
          return (
            <li key={item.id} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-6">
              <div className="grid min-w-0 gap-1">
                <span>
                  <span className="font-medium">{item.who[lang]}</span> {item.what[lang]}
                </span>
                {answer ? (
                  <span className="site-server-answer" data-ok={answer.status < 300 ? "" : undefined}>
                    <span className="site-server-answer__status">{answer.status}</span> {line}
                  </span>
                ) : null}
              </div>
              <Button variant="outline" size="sm" onClick={() => send(item)}>
                {t("Send to the API", "Send til API-et")}
              </Button>
            </li>
          );
        })}
      </ul>
      <p className="m-0 text-sm text-muted-foreground">
        {t("Live:", "Live:")} <code>POST /api/books</code> {t("on this site, with", "på denne siden, med")}{" "}
        <code>guardPostVoucher</code>, <code>guardDecideApproval</code> {t("and", "og")}{" "}
        <code>guardReleasePayments</code> {t("from", "fra")} <code>@booki-aui/core/server</code>.{" "}
        {t(
          "The agent holds every role and is still refused a person's decision.",
          "Agenten har alle roller og får likevel nei til en persons beslutning.",
        )}
      </p>
    </div>
  );
}
