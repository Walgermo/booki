import { elementOf } from "@ui-sdk/react/observe";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { ariaTree } from "./aria-tree";
import { BookiInvoice } from "./acc-invoice";
import accSource from "./acc-invoice.tsx?raw";
import { SemanticInvoice } from "./semantic-invoice";
import semanticSource from "./semantic-invoice.tsx?raw";
import { setStepPolicy, withoutCursor } from "@/agent";

import { Section } from "@/components/section";
import { CodeDisclosure, Disclosure } from "@/components/two-readers";
import { wait, type LandingAgent } from "./shared";
import { useLang, type Lang } from "@/lib/lang";

/** One tool call: what the agent sent and what came back, as the model sees it. */
type Call = { request: string; response: string };

const NET = 312_500;
const TAX = 27_734; // 8.875% of 3,125.00, rounded to the cent
const LINES: [account: string, name: string, debit: number, credit: number][] = [
  ["1200", "Accounts receivable", NET + TAX, 0],
  ["4000", "Sales revenue", 0, NET],
  ["2150", "Sales tax payable", 0, TAX],
];
/** The same account names in Norwegian, for the lines the agent adds. */
const NAMES_NB = ["Kundefordringer", "Salgsinntekt", "Skyldig omsetningsavgift"];
const major = (minor: number) => (minor / 100).toFixed(2);
const size = (calls: Call[]) => calls.reduce((n, call) => n + call.request.length + call.response.length, 0);
const fmt = (n: number, lang: Lang) => n.toLocaleString(lang === "nb" ? "nb-NO" : "en-US");

function typeInto(input: HTMLInputElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, text);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Book the invoice with browser tools: snapshot the page, then type, select
 * and click by ref. Each action returns the page again, as Playwright MCP does.
 */
async function bookWithBrowserTools(form: HTMLFormElement, emit: (call: Call) => void, pace: number) {
  const named = <T extends Element>(name: string) => form.elements.namedItem(name) as unknown as T;
  const refOf = (el: Element) => [...ariaTree(form).refs].find(([, node]) => node === el)?.[0] ?? "";
  const step = async (request: string, action?: () => void) => {
    action?.();
    await wait(pace);
    emit({ request, response: ariaTree(form).text });
  };
  const type = (name: string, text: string) => {
    const input = named<HTMLInputElement>(name);
    return step(`browser_type(${JSON.stringify({ ref: refOf(input), text })})`, () => typeInto(input, text));
  };

  await step("browser_snapshot()");
  await type("amount", major(NET));
  const tax = named<HTMLSelectElement>("tax");
  // The option's visible text, in whichever language the page shows.
  const taxLabel = [...tax.options].find((option) => option.value === "TAX8875")?.text ?? "8.875% tax";
  await step(`browser_select_option(${JSON.stringify({ ref: refOf(tax), values: [taxLabel] })})`, () => {
    tax.value = "TAX8875";
    tax.dispatchEvent(new Event("change", { bubbles: true }));
  });
  for (const [i, [account, , debit, credit]] of LINES.entries()) {
    await type(`account${i + 1}`, account);
    await type(debit ? `debit${i + 1}` : `credit${i + 1}`, major(debit || credit));
  }
  const pay = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
  await step(`browser_click(${JSON.stringify({ ref: refOf(pay) })})`, () => pay.click());
}

/** Book the same invoice over the ui-sdk bridge: one snapshot, one act. */
async function bookWithBridge(
  agent: LandingAgent,
  container: HTMLElement,
  emit: (call: Call) => void,
  pace: number,
  lang: Lang,
) {
  const mine = agent.snapshot().filter((entry) => container.contains(elementOf(entry.ref) ?? null));
  await wait(pace);
  emit({ request: "snapshot()", response: JSON.stringify(mine) });

  const ref = (component: string) => mine.find((entry) => entry.component === component)?.ref ?? component;
  const steps = [
    { ref: ref("amount-field"), action: "setMinor", args: [NET] },
    { ref: ref("tax-code-select"), action: "setTaxCode", args: ["TAX8875"] },
    ...LINES.map(([account, name, debit, credit], i) => ({
      ref: ref("voucher-composer"),
      action: "addLine",
      args: [account, lang === "nb" ? NAMES_NB[i]! : name, debit, credit],
    })),
    { ref: ref("voucher-composer"), action: "assertBalance", args: [] },
    { ref: ref("button"), action: "press", args: [] },
  ];
  const result = await agent.act({ steps } as never);
  await wait(pace);
  emit({
    request: `act(${JSON.stringify({ steps })})`,
    response: JSON.stringify(result),
  });
}

function Calls({ calls }: { calls: Call[] }) {
  const { lang, t } = useLang();
  return (
    <Disclosure
      title={t(`${calls.length} calls, as the model sees them`, `${calls.length} kall, slik modellen ser dem`)}
      meta={`≈ ${fmt(Math.round(size(calls) / 4), lang)} tokens`}
    >
      <ol className="site-machine mt-3 grid list-none gap-4 p-4">
        {calls.map((call, i) => (
          <li
            key={i}
            className="grid min-w-0 gap-1 border-t border-[var(--bk-ink-border)] pt-3 first:border-t-0 first:pt-0"
          >
            <pre className="landing-snippet text-signal">{call.request}</pre>
            <pre className="landing-snippet max-h-32 overflow-y-auto">{call.response}</pre>
          </li>
        ))}
      </ol>
    </Disclosure>
  );
}

/**
 * "One invoice, two ways", on the docs' examples page. The same booking task runs against a
 * plain HTML form with browser tools and against Booki with the bridge, and
 * the page counts every character the agent had to read and write.
 */
export function TokenStory({ agent }: { agent: LandingAgent }) {
  const { lang, t } = useLang();
  const formRef = useRef<HTMLFormElement | null>(null);
  const accRef = useRef<HTMLDivElement | null>(null);
  // One measurement, on load and without the cursor; the hero's card that replayed it is gone.
  const round = 0;
  const [running, setRunning] = useState(true);
  const [semantic, setSemantic] = useState<Call[]>([]);
  const [fin, setAcc] = useState<Call[]>([]);
  // Read by the run without restarting it when the language changes.
  const langRef = useRef(lang);
  useLayoutEffect(() => {
    langRef.current = lang;
  });

  // The company's payment rule: an agent may pay a balanced invoice under
  // $5,000 on its own. Anything else goes to a person.
  useEffect(
    () =>
      setStepPolicy((step) => {
        if (step.confirm !== "Pays the invoice from the company account") return undefined;
        const container = accRef.current;
        const composer = agent
          .snapshot()
          .find(
            (entry) => entry.component === "voucher-composer" && container?.contains(elementOf(entry.ref) ?? null),
          ) as { lines?: { debitMinor: number; creditMinor: number }[] } | undefined;
        const lines = composer?.lines ?? [];
        const debit = lines.reduce((sum, line) => sum + line.debitMinor, 0);
        const credit = lines.reduce((sum, line) => sum + line.creditMinor, 0);
        return lines.length > 0 && debit === credit && debit <= 500_000 ? true : undefined;
      }),
    [agent],
  );

  useEffect(() => {
    let cancelled = false;
    const pace = round === 0 ? 0 : 160;
    (async () => {
      await wait(0);
      const form = formRef.current;
      const container = accRef.current;
      if (cancelled || !form || !container) return;
      const run = () =>
        Promise.all([
          bookWithBrowserTools(form, (call) => !cancelled && setSemantic((p) => [...p, call]), pace),
          bookWithBridge(agent, container, (call) => !cancelled && setAcc((p) => [...p, call]), pace, langRef.current),
        ]);
      // The first run, on load, is quiet; "Run again" shows the agent's cursor.
      await (round === 0 ? withoutCursor(run) : run());
      if (!cancelled) setRunning(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [agent, round]);

  const sides = [
    {
      key: "semantic",
      title: t("Plain HTML + browser tools", "Vanlig HTML + nettleserverktøy"),
      calls: semantic,
      source: semanticSource,
      outcome: t(
        "Paid, after reading the whole form again on every call.",
        "Betalt, etter å ha lest hele skjemaet på nytt ved hvert kall.",
      ),
      form: (
        <div className="landing-form site-sheet">
          <SemanticInvoice key={round} formRef={formRef} />
        </div>
      ),
    },
    {
      key: "fin",
      title: t("Booki + the agent bridge", "Booki + agentbroen"),
      calls: fin,
      source: accSource,
      outcome: t(
        "Paid, through named actions on one snapshot.",
        "Betalt, gjennom navngitte handlinger på ett øyeblikksbilde.",
      ),
      form: (
        <div ref={accRef} className="landing-form landing-stage site-sheet">
          <BookiInvoice key={round} />
        </div>
      ),
    },
  ];

  return (
    <>
      <Section
        id="tokens-title"
        title={t("One invoice, two ways", "Én faktura, to måter")}
        note={t(
          "Both forms are live. An agent booked the same invoice on each, and the page counted every character it read and wrote. Both paid. Compare what it took.",
          "Begge skjemaene er ekte. En agent bokførte den samme fakturaen på hvert av dem, og siden telte hvert tegn den leste og skrev. Fakturaen ble betalt i begge. Sammenlign hva det krevde.",
        )}
      >
        <div className="grid items-start gap-x-10 gap-y-12 md:grid-cols-2">
          {sides.map((side) => (
            <div key={side.key} className="grid min-w-0 content-start gap-4">
              <div className="grid gap-2">
                <p className="site-kicker">{side.title}</p>
                <p
                  className="site-outcome min-h-7"
                  data-tone={running ? undefined : side.key === "fin" ? "agent" : "bad"}
                >
                  {running ? t("Agent working…", "Agenten jobber …") : side.outcome}
                </p>
              </div>
              {side.form}
              <Calls calls={side.calls} />
              <CodeDisclosure title={t("The code", "Koden")} source={side.source} />
            </div>
          ))}
        </div>
        <p className="mt-8 mb-0 max-w-prose text-sm text-muted-foreground">
          {t(
            "Form only, on both sides. Tokens are characters ÷ 4. Browser tools return the page after each action.",
            "Bare skjemaet, på begge sider. Tokens er tegn ÷ 4. Nettleserverktøyene returnerer hele siden etter hver handling.",
          )}
        </p>
      </Section>
    </>
  );
}
