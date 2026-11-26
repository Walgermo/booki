import { money } from "@booki-aui/core/money";
import {
  AccountingPeriodSelect,
  BookiLocaleProvider,
  FinancialDateField,
  InvoiceNumberInput,
  MoneyAmount,
  VoucherComposer,
  type AccountOption,
  type VoucherLine,
} from "@booki-aui/react";
import { useEffect, useRef, useState, type RefObject } from "react";

import { cursor, setStepPolicy, whenCursorFree } from "@/agent";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/lang";
import { ErpFrame, type FrameTab, type OtherDemo } from "./erp-frame";
import { titleLanded } from "./hero-title";
import { wait, type ActResult, type LandingAgent } from "./shared";

/** The voucher's agent label: unique on the landing page, so the agent's ref finds this one. */
const LABEL = "ERP-bilag";
const POST = "Bokfør bilaget";
/** The company's rule for posting without a person. */
const RULE_LIMIT_MINOR = 5_000_000;
const CONFIRM = "Posts the voucher to the ledger";

const CHART: AccountOption[] = [
  { number: "2400", name: "Leverandørgjeld" },
  { number: "2710", name: "Inngående mva" },
  {
    number: "6800",
    name: "Kontorrekvisita",
    vatCodes: ["MVA25", "MVA0"],
    defaultVatCode: "MVA25",
    requiresDepartment: true,
  },
];
const DEPARTMENTS = [
  { code: "10", name: "Oslo" },
  { code: "20", name: "Bergen" },
];
const NAV = ["Oversikt", "Bilag", "Faktura", "Leverandører", "Bank", "Lønn", "Rapporter"];

type Phase = "idle" | "running" | "waiting" | "posted";

/** Voucher entry for a sample invoice, using the site's agent bridge. */
export function ErpWindow({
  agent,
  from,
  to,
  tabs,
  other,
  walkthrough = true,
  autoRun = false,
}: {
  agent: LandingAgent;
  from: RefObject<HTMLElement | null>;
  to: RefObject<HTMLElement | null>;
  tabs: FrameTab[];
  other: OtherDemo;
  /** Offer the walkthrough from the hero title: only on the page's first view of this demo. */
  walkthrough?: boolean;
  /** Run as soon as it is shown: the visitor pressed this demo's button on the other one. */
  autoRun?: boolean;
}) {
  const { t } = useLang();
  const [lines, setLines] = useState<VoucherLine[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const active = useRef(false);

  /** One agent step on the voucher, then a beat for the eye. */
  async function step(action: string, args: unknown[] = [], ref = LABEL) {
    const result = (await agent.act({
      steps: [{ ref, action, args }],
    } as never)) as ActResult;
    await wait(520);
    return result;
  }

  async function run() {
    if (active.current) return false;
    active.current = true;
    setPhase("running");
    await whenCursorFree();
    await step("clear");
    await step("addLine", [{ account: "6800", debitMinor: 1_550_000 }]);
    await step("addLine", [{ account: "2400", creditMinor: 1_550_000 }]);
    // 6800 needs a department: the check says so, and the agent adds it.
    const checked = await step("assertPostable");
    if (!checked.ok) {
      const expense = (
        agent.snapshot().find((c) => c.label === LABEL) as unknown as { lines?: VoucherLine[] } | undefined
      )?.lines?.find((line) => line.account === "6800");
      if (expense) await step("setDepartment", [expense.id, "10"]);
      await step("assertPostable");
    }
    // Posting is marked for confirmation; the company's rule answers it, not a person.
    byAgent.current = true;
    const post = await step("press", [], POST);
    byAgent.current = false;
    if (!post.ok) setPhase("waiting");
    active.current = false;
    return post.ok;
  }

  // The company's rule: a balanced, dated voucher under 50 000 kr is posted by
  // the agent on its own. Anything else would go to a person.
  const byAgent = useRef(false);
  const postedBy = useRef<"agent" | "person">("agent");
  const [voucherNo, setVoucherNo] = useState(1042);
  const linesNow = useRef(lines);
  linesNow.current = lines;
  useEffect(
    () =>
      setStepPolicy((step) => {
        if (step.confirm !== CONFIRM) return undefined;
        const all = linesNow.current;
        const debit = all.reduce((sum, line) => sum + line.debitMinor, 0);
        const credit = all.reduce((sum, line) => sum + line.creditMinor, 0);
        const ok = all.length > 0 && debit === credit && debit > 0 && debit <= RULE_LIMIT_MINOR;
        return ok ? true : undefined;
      }),
    [],
  );

  // Opened from the other demo's button: run once, as if this demo's own button was pressed.
  useEffect(() => {
    if (autoRun) void run();
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- on mount only
  }, []);

  // The countdown for a screen reader: the cursor's label is decorative and hidden from it.
  const [notice, setNotice] = useState("");

  // The desktop walkthrough starts from the hero title. Touch, narrow screens, and reduced
  // motion use the demo button, so reading the task or install guide never starts a scroll.
  // Coming back from the other demo is not a new visit, so it never starts again then.
  useEffect(() => {
    const markedWord = from.current;
    if (
      !walkthrough ||
      !markedWord ||
      !window.matchMedia("(min-width: 48rem) and (pointer: fine) and (prefers-reduced-motion: no-preference)").matches
    ) {
      return;
    }
    const word = markedWord;
    const position = word.getBoundingClientRect();
    if (position.bottom <= 0 || position.top >= window.innerHeight || window.location.hash) return;

    const inputs = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    let timer = 0;
    let stopped = false;
    let showCursorMessage = false;
    function stop() {
      stopped = true;
      window.clearTimeout(timer);
      for (const input of inputs) window.removeEventListener(input, stop);
      if (showCursorMessage) cursor.settle(true);
      showCursorMessage = false;
      setNotice("");
    }
    for (const input of inputs) window.addEventListener(input, stop, { passive: true });

    async function play() {
      showCursorMessage = false;
      setNotice("");
      const posted = await run();
      const firstMetric = to.current?.querySelector("dt");
      if (!stopped && posted && firstMetric) {
        firstMetric.scrollIntoView({ block: "center", behavior: "smooth" });
        showCursorMessage = true;
        cursor.rest(firstMetric, t("Benchmark results", "Måleresultater"));
        await wait(2600);
      }
      stop();
    }

    function count(left: number) {
      if (stopped) return;
      if (left === 0) {
        void play();
        return;
      }
      showCursorMessage = true;
      // Said once, when the countdown opens: any key skips it, as any scroll or click does.
      if (left === 3) {
        setNotice(
          t(
            "The invoice demo starts in 3 seconds and scrolls the page. Press any key to skip it.",
            "Fakturademoen starter om 3 sekunder og ruller siden. Trykk en tast for å hoppe over.",
          ),
        );
      }
      cursor.rest(
        word,
        t(`Starts in ${left} · scroll or click to skip`, `Starter om ${left} · rull eller klikk for å hoppe over`),
      );
      timer = window.setTimeout(() => count(left - 1), 1000);
    }
    timer = window.setTimeout(() => count(3), titleLanded.ms);
    return stop;
    // Start once per visit to the homepage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const status =
    phase === "running"
      ? t("Agent working", "Agenten jobber")
      : phase === "waiting"
        ? t("Waiting for a person", "Venter på en person")
        : phase === "posted"
          ? t("Posted", "Bokført")
          : t("Agent ready", "Agenten er klar");

  return (
    <section id="invoice-demo" aria-labelledby="invoice-demo-title" className="grid scroll-mt-6 gap-4">
      <p className="sr-only" role="status">
        {notice}
      </p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h2 id="invoice-demo-title" className="m-0 text-lg font-semibold">
            {t("Booki in an accounting app", "Booki i et regnskapssystem")}
          </h2>
          <p className="m-0 max-w-[58ch] text-sm text-muted-foreground">
            {t(
              "Watch the agent prepare the voucher for invoice 8841, assign it to Oslo, and check that it balances.",
              "Se agenten klargjøre bilaget for faktura 8841, velge Oslo som avdeling og sjekke at bilaget balanserer.",
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="lg" disabled={phase === "running"} onClick={() => void run()}>
            {phase === "running"
              ? t("Agent working…", "Agenten jobber …")
              : phase === "idle"
                ? t("Run invoice demo", "Kjør fakturademoen")
                : t("Run again", "Kjør på nytt")}
          </Button>
          <Button variant="outline" size="lg" disabled={phase === "running"} onClick={other.onRun}>
            {other.label}
          </Button>
        </div>
      </div>
      <ErpFrame
        brand="kvadruptex"
        label={t("Demo ERP", "Demo-ERP")}
        tabs={tabs}
        path="/analog-angst/bilag/ny"
        search={t("Search vouchers, suppliers …", "Søk i bilag, leverandører …")}
        nav={NAV}
        activeNav="Bilag"
        counts={{ Leverandører: 3 }}
      >
        <BookiLocaleProvider country="NO">
          <header className="erp-doc">
            <div className="grid gap-1">
              <p className="erp-window__crumb">{t("Ledger / Vouchers / New", "Regnskap / Bilag / Nytt")}</p>
              <h2 className="erp-doc__title">
                {t("Supplier invoice 8841", "Leverandørfaktura 8841")}
                <span className="erp-window__state" data-phase={phase} role="status">
                  {status}
                </span>
              </h2>
              <p className="erp-doc__party">Kontorhuset AS · {t("office supplies", "kontorrekvisita")}</p>
            </div>
            <div className="erp-doc__total">
              <span>{t("To pay", "Å betale")}</span>
              <MoneyAmount value={money(1_550_000, "NOK")} size="lg" />
            </div>
          </header>

          <div className="erp-doc__fields">
            <FinancialDateField
              kind="posting"
              value="2026-10-31"
              onValueChange={() => {}}
              aria-label="ERP-bilagsdato"
            />
            <InvoiceNumberInput value="8841" onValueChange={() => {}} aria-label="ERP-fakturanummer" />
            <AccountingPeriodSelect granularity="month" year={2026} defaultValue="2026-10" aria-label="ERP-periode" />
          </div>

          <div className="erp-doc__lines landing-scroll">
            <VoucherComposer
              lines={lines}
              onLinesChange={setLines}
              accounts={CHART}
              departments={DEPARTMENTS}
              postingDate="2026-10-31"
              editable
              aria-label={LABEL}
            />
          </div>
        </BookiLocaleProvider>

        <footer className="erp-doc__foot">
          <div className="flex flex-wrap items-center gap-3">
            {phase === "posted" ? (
              <span className="erp-window__posted">
                {postedBy.current === "agent"
                  ? t(
                      `Posted · voucher ${voucherNo} · by the agent under your rule`,
                      `Bokført · bilag ${voucherNo} · av agenten etter regelen deres`,
                    )
                  : t(`Posted · voucher ${voucherNo} · by you`, `Bokført · bilag ${voucherNo} · av deg`)}
              </span>
            ) : phase === "waiting" ? (
              <span className="text-sm text-muted-foreground">
                {t("Outside the rule: a person posts it.", "Utenfor regelen: en person bokfører.")}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">
                {t(
                  "Posted automatically under 50 000 kr when balanced.",
                  "Bokføres automatisk under 50 000 kr når bilaget går i balanse.",
                )}
              </span>
            )}
          </div>
          <Button
            size="lg"
            disabled={lines.length === 0 || phase === "posted"}
            data-agent-confirm={CONFIRM}
            aria-label={POST}
            onClick={() => {
              const no = voucherNo + 1;
              setVoucherNo(no);
              setPhase("posted");
              postedBy.current = byAgent.current ? "agent" : "person";
            }}
          >
            {t("Post voucher", "Bokfør bilaget")}
          </Button>
        </footer>
      </ErpFrame>
    </section>
  );
}
