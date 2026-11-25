import type { BankLine, OpenPost, ReconciliationMatch } from "@booki-aui/core/reconciliation";
import { suggestMatches } from "@booki-aui/core/reconciliation";
import { voucherIssues, type AccountOption, type VoucherLine } from "@booki-aui/core/voucher";
import {
  AgentPresence,
  AgentProposal,
  AmountField,
  BankReconciliation,
  BookiLocaleProvider,
  useAgentProposal,
  useBookiLocale,
  VoucherComposer,
  type AgentPresenceController,
  type ProposedChange,
} from "@booki-aui/react";
import { localize } from "@booki-aui/core/messages";
import { formatMoney, money } from "@booki-aui/core/money";
import { Button as GateButton } from "@ui-sdk/react/button";
import { useRef, useState } from "react";

import { agent } from "@/agent";
import { SiteAgentCursor } from "@/components/site-agent-cursor";
import { AskAgent } from "@/components/ask-agent";
import { Section } from "@/components/section";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/lang";

type Tone = "good" | "bad" | "neutral";
type Word = "done" | "refused" | "left" | "proposed" | "queued";
/** A log line: our own words in both languages, or the library's answer as it came back. */
type Said = string | { en: string; nb: string };
type LogRow = { id: number; text: Said; tone: Tone; word: Word };

const WORDS: Record<Word, { en: string; nb: string }> = {
  done: { en: "done", nb: "utført" },
  refused: { en: "refused", nb: "avvist" },
  left: { en: "left", nb: "utelatt" },
  proposed: { en: "proposed", nb: "foreslått" },
  queued: { en: "queued", nb: "venter" },
};

const both = (en: string, nb: string) => ({ en, nb });

/** The bridge's own refusal for a gated step, which Booki's messages do not cover. */
const SAID_NO = /^The person said no to "(.*)"\.$/;

/** A library answer in the reader's language: Booki's sentences, and the bridge's refusal of a gated step. */
function readable(text: string, lang: "en" | "nb") {
  if (lang === "nb" && SAID_NO.test(text)) return text.replace(SAID_NO, "Personen sa nei til «$1».");
  return localize(text, lang);
}
type ActResult = { ok: boolean; error?: { message: string } };

const BANK: BankLine[] = [
  { id: "b1", date: "2026-10-01", description: "Nordlys AS", amountMinor: 1_250_000, reference: "10012342" },
  {
    id: "b2",
    date: "2026-10-02",
    description: "Samlebetaling Brattli Entreprenør og Anlegg AS",
    amountMinor: 3_000_000,
  },
  { id: "b3", date: "2026-10-03", description: "Husleie oktober", amountMinor: -1_500_000 },
  { id: "b4", date: "2026-10-04", description: "Mobilbetaling 48213", amountMinor: 49_900 },
  { id: "b5", date: "2026-10-04", description: "Mobilbetaling 48219", amountMinor: 49_900 },
];

const POSTS: OpenPost[] = [
  { id: "p1", date: "2026-09-20", description: "Faktura 1001", amountMinor: 1_250_000, reference: "10012342" },
  { id: "p2", date: "2026-09-21", description: "Faktura 1002", amountMinor: 1_000_000 },
  { id: "p3", date: "2026-09-22", description: "Faktura 1003", amountMinor: 2_000_000 },
  { id: "p4", date: "2026-09-25", description: "Leverandørfaktura husleie", amountMinor: -1_500_000 },
  { id: "p5", date: "2026-09-28", description: "Faktura 1004", amountMinor: 49_900 },
  { id: "p6", date: "2026-09-29", description: "Faktura 1005", amountMinor: 49_900 },
];

/** A small chart. Office supplies must carry a department and a VAT code. */
const CHART: AccountOption[] = [
  { number: "2400", name: "Leverandørgjeld" },
  { number: "2711", name: "Inngående mva" },
  {
    number: "6800",
    name: "Kontorrekvisita",
    vatCodes: ["MVA25", "MVA15", "MVA0"],
    defaultVatCode: "MVA25",
    requiresDepartment: true,
  },
];
const DEPARTMENTS = [
  { code: "10", name: "Oslo" },
  { code: "20", name: "Bergen" },
];

const RECONCILIATION = "Bankavstemming";
const VOUCHER = "Leverandørbilag";
const AMOUNT = "Fakturabeløp eks. mva";
const POST = "Bokfør bilag";
const NET = 1_240_000;
const VAT = 310_000;

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * Month-end for one small company, on real Booki controls. An agent does the
 * routine part in the open; a person is left a short list of decisions.
 */
export function ClosePage() {
  return (
    <BookiLocaleProvider country="NO">
      <Close />
    </BookiLocaleProvider>
  );
}

function Close() {
  const { profile } = useBookiLocale();
  const { lang, t } = useLang();
  const [matches, setMatches] = useState<ReconciliationMatch[]>(() => suggestMatches(BANK, POSTS));
  const [amount, setAmount] = useState(1_000_000);
  const [lines, setLines] = useState<VoucherLine[]>([]);
  const [posted, setPosted] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogRow[]>([]);
  const [agentMarks, setAgentMarks] = useState(0);
  const presence = useRef<AgentPresenceController | null>(null);
  const proposal = useAgentProposal(agent);
  const seq = useRef(0);

  const fmt = (minor: number) => formatMoney(money(minor, profile.currency), { locale: profile.locale });
  const rules = { accounts: CHART, vatCodes: profile.tax.codes.map((c) => c.code), departments: DEPARTMENTS };
  const issues = voucherIssues(lines, rules);
  const postable = issues.length === 0;
  const suggestions = matches.filter((m) => m.status === "suggested").length;
  const approved = new Set(matches.filter((m) => m.status === "approved").flatMap((m) => m.bankLineIds));
  const syncMarks = () => setAgentMarks(presence.current?.marked().length ?? 0);

  function say(text: Said, tone: Tone, word: Word) {
    seq.current += 1;
    const id = seq.current;
    setLog((rows) => [...rows, { id, text, tone, word }]);
  }

  /** One agent step: send it, show what came back, give the eye a moment. */
  async function step(text: Said, ref: string, action: string, args: unknown[]) {
    const r = (await agent.act({ steps: [{ ref, action, args }] } as never)) as ActResult;
    say(
      r.ok ? text : (r.error?.message ?? both("Refused", "Avvist")),
      r.ok ? "good" : "bad",
      r.ok ? "done" : "refused",
    );
    syncMarks();
    await wait(520);
    return r.ok;
  }

  async function runMonthEnd() {
    if (running) return;
    setRunning(true);
    setLog([]);
    try {
      // Bank: one clear one-to-many, and two lines it has no basis to choose between.
      await step(
        both(
          "Bank: matched the Brattli payment to invoices 1002 and 1003",
          "Bank: koblet innbetalingen fra Brattli mot faktura 1002 og 1003",
        ),
        RECONCILIATION,
        "suggestMatch",
        ["b2", ["p2", "p3"]],
      );
      say(
        both(
          "Bank: left the two mobile payments. Same amount, no reference, nothing to tell them apart.",
          "Bank: lot de to mobilinnbetalingene stå. Samme beløp, ingen referanse, ingenting som skiller dem.",
        ),
        "neutral",
        "left",
      );
      await wait(520);

      // Supplier invoice: propose the amount, then draft the voucher.
      const staged = await proposal.propose([{ ref: AMOUNT, key: "minor", value: NET }]);
      say(
        staged.applied.length
          ? both(
              `Invoice: proposed ${fmt(NET)} from the PDF, replacing ${fmt(amount)}`,
              `Faktura: foreslo ${fmt(NET)} fra PDF-en, i stedet for ${fmt(amount)}`,
            )
          : both("Invoice: could not stage the amount", "Faktura: kunne ikke foreslå beløpet"),
        staged.applied.length ? "neutral" : "bad",
        staged.applied.length ? "proposed" : "refused",
      );
      await wait(520);

      await step(both("Voucher: cleared the draft", "Bilag: tømte utkastet"), VOUCHER, "clear", []);
      await step(both("Voucher: debit 6800 Kontorrekvisita", "Bilag: debet 6800 Kontorrekvisita"), VOUCHER, "addLine", [
        "6800",
        undefined,
        NET,
        0,
      ]);
      await step(both("Voucher: debit 2711 Inngående mva", "Bilag: debet 2711 Inngående mva"), VOUCHER, "addLine", [
        "2711",
        undefined,
        VAT,
        0,
      ]);
      await step(
        both("Voucher: credit 2400 Leverandørgjeld", "Bilag: kredit 2400 Leverandørgjeld"),
        VOUCHER,
        "addLine",
        ["2400", undefined, 0, NET + VAT],
      );

      // The control tells it what is missing; it repairs and checks again.
      const first = (await agent.act({
        steps: [{ ref: VOUCHER, action: "assertPostable", args: [] }],
      } as never)) as ActResult;
      if (!first.ok) {
        say(first.error?.message ?? both("Not postable", "Kan ikke bokføres"), "bad", "refused");
        await wait(520);
        const snapshot = agent.snapshot().find((c) => c.label === VOUCHER) as unknown as { lines: VoucherLine[] };
        const expense = snapshot.lines.find((line) => line.account === "6800");
        if (expense) {
          await step(
            both("Voucher: set department 10 Oslo on the 6800 line", "Bilag: satte avdeling 10 Oslo på 6800-linjen"),
            VOUCHER,
            "setDepartment",
            [expense.id, "10"],
          );
          await step(
            both("Voucher: checked again. Postable.", "Bilag: sjekket på nytt. Kan bokføres."),
            VOUCHER,
            "assertPostable",
            [],
          );
        }
      }

      // The line it may not cross.
      await step(both("Posted the voucher", "Bokførte bilaget"), POST, "press", []);
      say(
        both("Done. Two decisions are queued for you below.", "Ferdig. To beslutninger venter på deg nedenfor."),
        "neutral",
        "queued",
      );
    } finally {
      syncMarks();
      setRunning(false);
    }
  }

  const describe = (change: ProposedChange) =>
    (agent.snapshot().find((c) => c.ref === change.ref)?.label as string | undefined) ?? change.ref;

  return (
    <main>
      <AgentPresence agent={agent} onController={(controller) => (presence.current = controller)} />
      <SiteAgentCursor />

      <section className="site-ledger grid gap-x-12 gap-y-8 pt-14 pb-14 md:pt-24 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-end">
        <div>
          <p className="site-kicker">Nordlys AS · oktober 2026</p>
          <h1 className="landing-hero__title mt-6 mb-0 max-w-[13ch]">
            {t("Month-end, with an agent in the room.", "Månedsavslutning, med en agent i rommet.")}
          </h1>
          <p className="landing-hero__lede mt-5 mb-0">
            {t(
              "It does the routine part where you can see it, and stops where a person has to decide.",
              "Den gjør rutinearbeidet der dere ser det, og stopper der en person må bestemme.",
            )}
          </p>
        </div>
        <div className="grid gap-3">
          <div className="flex flex-wrap gap-3">
            <Button size="lg" disabled={running} onClick={() => void runMonthEnd()}>
              {running
                ? t("Agent working…", "Agenten jobber…")
                : log.length
                  ? t("Run it again", "Kjør på nytt")
                  : t("Run month-end", "Kjør månedsavslutning")}
            </Button>
          </div>
          <p className="m-0 text-sm text-muted-foreground">
            {t(
              "This run is a fixed script sending real actions. To use a real model, ask it yourself at the bottom of the page.",
              "Denne kjøringen er et fast skript som sender ekte handlinger. Vil dere bruke en ekte modell, spør den selv nederst på siden.",
            )}
          </p>
        </div>
      </section>

      <Section
        id="close-queue"
        title={t("Waiting for you", "Venter på deg")}
        note={t(
          "What the agent could not, or may not, decide.",
          "Det agenten ikke kunne, eller ikke får lov til å, bestemme.",
        )}
      >
        <ul className="site-rows">
          <li className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {t("Bank matches to approve", "Bankkoblinger til godkjenning")}
              <span className="text-muted-foreground">
                {" · "}
                {t(
                  `${approved.size} of ${BANK.length} bank lines reconciled`,
                  `${approved.size} av ${BANK.length} banklinjer avstemt`,
                )}
              </span>
            </span>
            <span className="tabular-nums">{suggestions}</span>
          </li>
          <li className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{t("Supplier invoice amount", "Beløp på leverandørfaktura")}</span>
              <span className="text-muted-foreground">
                {proposal.pending
                  ? t("proposal pending", "forslag venter")
                  : t("nothing proposed", "ingenting foreslått")}
              </span>
            </div>
            <AgentProposal
              applied={proposal.applied}
              describe={describe}
              format={(value) => fmt(Number(value))}
              title={t("The agent proposes", "Agenten foreslår")}
              keepLabel={t("Keep", "Behold")}
              revertLabel={t("Revert", "Angre")}
              onKeep={() => {
                proposal.keep();
                syncMarks();
              }}
              onRevert={() => void proposal.revert().then(syncMarks)}
            />
          </li>
          <li className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {t("Supplier voucher", "Leverandørbilag")}
              <span className="text-muted-foreground">
                {" · "}
                {posted
                  ? t("posted", "bokført")
                  : postable
                    ? t("ready to post", "klart til bokføring")
                    : lines.length
                      ? localize(issues[0], lang)
                      : t("not drafted yet", "ikke laget ennå")}
              </span>
            </span>
            <GateButton
              type="button"
              className="min-h-11"
              disabled={!postable || posted}
              data-agent-confirm={t("Posting needs a person", "Bokføring krever en person")}
              onClick={() => setPosted(true)}
            >
              {POST}
            </GateButton>
          </li>
          <li className="flex flex-wrap items-center justify-between gap-3">
            <span>
              {t("Values the agent set", "Verdier agenten satte")}
              <span className="text-muted-foreground">
                {" · "}
                {t(
                  "marked with a lime edge until you have looked",
                  "merket med en limegrønn kant til dere har sett på dem",
                )}
              </span>
            </span>
            <Button
              variant="outline"
              disabled={agentMarks === 0}
              onClick={() => {
                presence.current?.acknowledge();
                syncMarks();
              }}
            >
              {t(`Mark ${agentMarks} reviewed`, `Merk ${agentMarks} som gjennomgått`)}
            </Button>
          </li>
        </ul>
      </Section>

      <Section
        id="close-log"
        title={t("What the agent did", "Hva agenten gjorde")}
        note={t(
          "Each line is a real action and the library's real answer.",
          "Hver linje er en ekte handling og bibliotekets ekte svar.",
        )}
      >
        <div className="site-machine">
          {log.length === 0 ? (
            <p className="m-0 font-mono text-sm text-ink-muted">
              {t(
                "Waiting. Run month-end and each step is listed here as it happens.",
                "Venter. Kjør månedsavslutningen, så vises hvert steg her mens det skjer.",
              )}
            </p>
          ) : (
            <ol className="site-rows site-rows--ink font-mono" aria-live="polite">
              {log.map((row) => (
                <li key={row.id} className="flex items-start justify-between gap-4 text-sm">
                  <span className="[overflow-wrap:anywhere]">
                    {typeof row.text === "string" ? readable(row.text, lang) : row.text[lang]}
                  </span>
                  <span className="landing-tag" data-tone={row.tone}>
                    {WORDS[row.word][lang]}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </Section>

      <Section
        id="close-bank"
        title={t("Bank", "Bank")}
        note={t(
          "A rule matched what was unambiguous. The agent suggests the rest; you approve.",
          "En regel koblet det som var entydig. Agenten foreslår resten; dere godkjenner.",
        )}
      >
        <BankReconciliation
          bankLines={BANK}
          openPosts={POSTS}
          matches={matches}
          onMatchesChange={setMatches}
          aria-label={RECONCILIATION}
        />
      </Section>

      <Section
        id="close-invoice"
        title={t("Supplier invoice", "Leverandørfaktura")}
        note={t(
          "Kontorrekvisita AS, 15 500,00 including 25% VAT. Account 6800 needs a department.",
          "Kontorrekvisita AS, 15 500,00 inkludert 25 % mva. Konto 6800 krever avdeling.",
        )}
      >
        <div className="grid gap-6">
          <label className="grid max-w-sm gap-1 text-sm font-medium">
            {AMOUNT}
            <AmountField value={amount} onValueChange={setAmount} aria-label={AMOUNT} />
          </label>
          <div className="landing-scroll">
            <VoucherComposer
              lines={lines}
              onLinesChange={setLines}
              accounts={CHART}
              departments={DEPARTMENTS}
              aria-label={VOUCHER}
            />
          </div>
        </div>
      </Section>

      <Section
        id="close-ask"
        title={t("Ask it yourself", "Spør den selv")}
        note={t(
          "A real model, working these same controls through the same bridge.",
          "En ekte modell som jobber i de samme kontrollene gjennom den samme agentbroen.",
        )}
      >
        <AskAgent />
      </Section>
    </main>
  );
}
