import { money } from "@booki/core/money";
import {
  AccountingPeriodSelect,
  BookiLocaleProvider,
  FinancialDateField,
  InvoiceNumberInput,
  MoneyAmount,
  VoucherComposer,
  type AccountOption,
  type VoucherLine,
} from "@booki/react";
import { useEffect, useRef, useState, type RefObject } from "react";

import { cursor, setStepPolicy, whenCursorFree } from "@/agent";
import { Button as SdkButton } from "@ui-sdk/react/button";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/lang";
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

/** Input that stops the countdown: the visitor is doing something of their own. */
const INPUTS = ["wheel", "touchstart", "pointerdown", "keydown"] as const;

/**
 * The hero's demo: an ordinary ERP screen in a browser window, with Booki's
 * VoucherComposer where the voucher form was. When the window scrolls into
 * view the site's agent starts on its own, through the same bridge and with
 * the same visible cursor as everywhere else: it fills in the voucher, adds
 * the department the account asks for, checks it, and posts it: the company's
 * rule (balanced, dated, under 50 000 kr) answers the marked Post step, so no
 * person is in the loop. The cursor shows each step as it happens.
 */
export function ErpWindow({
  agent,
  from,
  to,
}: {
  agent: LandingAgent;
  /** Where the cursor starts: the hero's marked word. */
  from?: RefObject<HTMLElement | null>;
  /** Where the cursor goes after the demo: the measured figures below it. */
  to?: RefObject<HTMLElement | null>;
}) {
  const { t } = useLang();
  const [lines, setLines] = useState<VoucherLine[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const frame = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  // The visitor stopped the countdown: the demo waits for them to start it.
  const [skipped, setSkipped] = useState(false);

  /** One agent step on the voucher, then a beat for the eye. */
  async function step(action: string, args: unknown[] = [], ref = LABEL) {
    const result = (await agent.act({
      steps: [{ ref, action, args }],
    } as never)) as ActResult;
    await wait(520);
    return result;
  }

  async function run() {
    setPhase("running");
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

  // The agent starts from the hero's marked word: its cursor rests there once
  // the title has landed, and the first step glides from it into the window.
  useEffect(() => {
    const word = from?.current;
    if (!word) return;
    const id = window.setTimeout(() => {
      // Once the countdown or the demo has begun, the cursor is theirs.
      if (started.current) return;
      cursor.rest(word, t("starts here", "starter her"));
    }, titleLanded.ms);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Start once, when the window is on screen; a visit that never gets there runs nothing.
  // On a phone the window sits below the hero, under the fold: waiting for it to show
  // means the visitor has scrolled the hero's word away, and the cursor never leads from
  // it. There it starts once the title has landed, and its first step scrolls the window
  // into view while the cursor glides down from the word.
  //
  // Before it starts, the cursor counts down on the word, and any scroll, tap, click or
  // key stops it: motion the visitor did not ask for gives way to them at once. After
  // the demo, the cursor goes on to the measured figures below the window.
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    let cancelled = false;
    // Set once the countdown is on screen; until then a cleanup (React runs effects twice
    // in development) hands the start back to the next run of this effect.
    let began = false;
    let stop = () => {};
    const tap = window.matchMedia?.("(pointer: coarse)").matches;
    const countdown = (seconds: number) =>
      new Promise<boolean>((resolve) => {
        const word = from?.current;
        if (!word) return resolve(true);
        let left = seconds;
        let tick = 0;
        let done = false;
        const show = () =>
          cursor.rest(
            word,
            tap
              ? t(`Starts in ${left} · scroll or tap to skip`, `Starter om ${left} · rull eller trykk for å hoppe over`)
              : t(
                  `Starts in ${left} · scroll or click to skip`,
                  `Starter om ${left} · rull eller klikk for å hoppe over`,
                ),
          );
        const finish = (go: boolean) => {
          if (done) return;
          done = true;
          window.clearInterval(tick);
          for (const type of INPUTS) window.removeEventListener(type, skip);
          resolve(go);
        };
        const skip = () => {
          cursor.rest(word, t("Skipped · run it below when you like", "Hoppet over · kjør den nedenfor når du vil"));
          cursor.settle(true);
          finish(false);
        };
        stop = () => finish(false);
        // A beat of grace: a scroll still coasting from reaching the demo is not a "skip".
        window.setTimeout(() => {
          if (!done) for (const type of INPUTS) window.addEventListener(type, skip, { passive: true, once: true });
        }, 300);
        show();
        tick = window.setInterval(() => {
          left -= 1;
          if (left > 0) show();
          else {
            cursor.rest(word, t("Starting now", "Starter nå"));
            finish(true);
          }
        }, 1000);
      });
    // The visitor scrolling during the demo keeps the page: the last move only follows.
    let tookOver = false;
    const took = () => {
      tookOver = true;
    };
    const toFigures = async () => {
      const figures = to?.current?.querySelector("dt") ?? to?.current;
      if (!figures || cancelled) return;
      // Straight on, before the last step's ring fades: the pointer glides down while
      // the page scrolls, and follows the figures until they settle.
      if (!tookOver) {
        const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        figures.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
      }
      cursor.rest(figures, t("Measured on real tasks", "Målt på ekte oppgaver"));
      await wait(2600);
      cursor.settle(true);
    };
    const start = async () => {
      if (started.current) return;
      started.current = true;
      await wait(titleLanded.ms);
      if (cancelled) return;
      began = true;
      if (!(await countdown(3))) {
        if (!cancelled) setSkipped(true);
        return;
      }
      await whenCursorFree();
      if (cancelled) return;
      window.addEventListener("wheel", took, { passive: true });
      window.addEventListener("touchmove", took, { passive: true });
      try {
        if (await run()) await toFigures();
      } finally {
        window.removeEventListener("wheel", took);
        window.removeEventListener("touchmove", took);
      }
    };
    if (window.matchMedia?.("(max-width: 767px)").matches) {
      void start();
      return () => {
        cancelled = true;
        if (!began) started.current = false;
        stop();
      };
    }
    const seen = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        seen.disconnect();
        void start();
      },
      { threshold: 0.2 },
    );
    seen.observe(node);
    return () => {
      cancelled = true;
      if (!began) started.current = false;
      stop();
      seen.disconnect();
    };
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
    <div
      ref={frame}
      className="erp-window"
      role="group"
      aria-label={t("Demo ERP in a browser window", "Demo-ERP i et nettleservindu")}
    >
      {/* Browser chrome: a Chrome window on macOS. Decorative, so hidden from assistive tech. */}
      <div className="erp-chrome" aria-hidden="true">
        <div className="erp-chrome__tabs">
          <span className="erp-chrome__lights">
            <i data-light="close" />
            <i data-light="min" />
            <i data-light="max" />
          </span>
          <span className="erp-chrome__tab" data-active="">
            <KvadruptexMark className="erp-chrome__favicon" />
            <span className="erp-chrome__title">{t("New voucher – Kvadruptex", "Nytt bilag – Kvadruptex")}</span>
            <span className="erp-chrome__close">×</span>
          </span>
          <span className="erp-chrome__tab">
            <KvadruptexMark className="erp-chrome__favicon" muted />
            <span className="erp-chrome__title">{t("Bank – Kvadruptex", "Bank – Kvadruptex")}</span>
            <span className="erp-chrome__close">×</span>
          </span>
          <span className="erp-chrome__new">+</span>
        </div>
        <div className="erp-chrome__toolbar">
          <span className="erp-chrome__nav">
            <Icon d="M10 3 5 8l5 5" />
            <Icon d="m6 3 5 5-5 5" muted />
            <Icon d="M13 8a5 5 0 1 1-1.5-3.6M13 3v3h-3" />
          </span>
          <span className="erp-chrome__omnibox">
            <Icon d="M5 7V5a3 3 0 0 1 6 0v2M4 7h8v6H4z" small />
            <span>
              <span className="erp-chrome__host">kvadruptex.example</span>
              /analog-angst/bilag/ny
            </span>
          </span>
          <span className="erp-chrome__profile">AA</span>
        </div>
      </div>

      <div className="erp-app">
        <div className="erp-app__top">
          <span className="erp-app__logo">
            <KvadruptexMark className="erp-app__mark" />
            <span className="erp-app__word">
              Kvadrup<span>tex</span>
            </span>
          </span>
          <span className="erp-app__search">
            {t("Search vouchers, suppliers …", "Søk i bilag, leverandører …")}
            <kbd>⌘K</kbd>
          </span>
          <span className="erp-app__company">
            Analog Angst AS
            <span>{t("Fiscal year 2026 · Oslo", "Regnskapsår 2026 · Oslo")}</span>
          </span>
          <span className="erp-app__avatar" aria-hidden="true">
            KN
          </span>
        </div>

        <div className="erp-window__body">
          <nav className="erp-window__nav" aria-label={t("ERP menu", "ERP-meny")}>
            <ul>
              {NAV.map((item) => (
                <li key={item} data-active={item === "Bilag" ? "" : undefined}>
                  {item}
                  {item === "Leverandører" ? <span className="erp-window__count">3</span> : null}
                </li>
              ))}
            </ul>
          </nav>

          <div className="erp-window__main">
            <BookiLocaleProvider country="NO">
              <header className="erp-doc">
                <div className="grid gap-1">
                  <p className="erp-window__crumb">{t("Ledger / Vouchers / New", "Regnskap / Bilag / Nytt")}</p>
                  <h3 className="erp-doc__title">
                    {t("Supplier invoice 8841", "Leverandørfaktura 8841")}
                    <span className="erp-window__state" data-phase={phase}>
                      {status}
                    </span>
                  </h3>
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
                <AccountingPeriodSelect
                  granularity="month"
                  year={2026}
                  defaultValue="2026-10"
                  aria-label="ERP-periode"
                />
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
                {phase === "idle" && skipped ? (
                  <SdkButton
                    className="site-link site-text-button text-sm"
                    onClick={() => {
                      setSkipped(false);
                      void run();
                    }}
                  >
                    {t("Run the demo", "Kjør demoen")}
                  </SdkButton>
                ) : null}
                {phase === "waiting" || phase === "posted" ? (
                  <SdkButton
                    className="site-link site-text-button text-sm"
                    onClick={() => {
                      setLines([]);
                      void run();
                    }}
                  >
                    {t("Run again", "Kjør på nytt")}
                  </SdkButton>
                ) : null}
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
          </div>
        </div>
      </div>
    </div>
  );
}

function Icon({ d, muted, small }: { d: string; muted?: boolean; small?: boolean }) {
  const size = small ? 12 : 16;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" data-muted={muted ? "" : undefined}>
      <path d={d} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * Kvadruptex, the demo's made-up ERP: one better than triple. The mark is four
 * ticks in a tile, for an ERP that checks everything four times. Drawn in the
 * page's tokens, so it follows the theme.
 */
function KvadruptexMark({ className, muted }: { className?: string; muted?: boolean }) {
  const tick = (x: number, y: number) => `M${x} ${y + 2.2}l1.8 1.8 3.4-3.6`;
  return (
    <svg className={className} data-muted={muted ? "" : undefined} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="var(--kvx-blue)" />
      <path
        d={[tick(4.6, 5), tick(13, 5), tick(4.6, 13.4), tick(13, 13.4)].join(" ")}
        fill="none"
        stroke="var(--kvx-on-blue)"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
