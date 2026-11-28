import { refIn, type Recorder } from "./scripted.js";
import { amountsIn, verdict, type Verification } from "./verify.js";

/**
 * The side-by-side comparison (compare.ts): one task on a live public
 * Norwegian page, driven with browser tools, and on the same calculator
 * rebuilt on Booki, driven through the bridge. Internal only. The Booki
 * pages give the live pages' answers (src/compare-rules.test.ts).
 */

export type CompareSide = {
  label: string;
  /** "browser": Playwright MCP on the live page. "bridge": the Booki page. */
  tools: "browser" | "bridge";
  /** An absolute URL for the live page; a path on the benchmark site for Booki. */
  url: string;
  /** Every origin the live page needs; the browser may request nothing else. */
  origins?: string[];
  ready: string;
  /** A scripted agent that never errs, for a run without a model (`--scripted`). */
  script: (r: Recorder) => Promise<string>;
};

export type CompareTask = {
  id: "tax" | "price";
  title: string;
  text: string;
  /** The answer that counts as right. */
  verify: (answer: string) => Verification;
  live: CompareSide;
  booki: CompareSide;
};

const bridgeReady = (component: string) =>
  `!!window.agent && window.agent.snapshot().some((entry) => entry.component === ${JSON.stringify(component)})`;

/** The snapshot's text from a browser_snapshot or an action's result. */
const snapshotOf = async (r: Recorder) => await r.call("browser_snapshot");

/** The bridge's ref for a component, from a snapshot call. */
async function bridgeRef(r: Recorder, component: string) {
  const out = await r.call("snapshot");
  const match = out.match(new RegExp(`"ref"\\s*:\\s*"([^"]+)"[^}]*"component"\\s*:\\s*"${component}"`));
  if (!match) throw new Error(`No ${component} in the bridge snapshot:\n${out.slice(0, 800)}`);
  return match[1]!;
}

const TAX_EXPECTED_KR = 160_982;
const PRICE_EXPECTED_MINOR = 1_927_911;
const PRICE_EXPECTED_PCT = 92.8;

export const COMPARE_TASKS: Record<CompareTask["id"], CompareTask> = {
  tax: {
    id: "tax",
    title: "Skatteetaten: skattekalkulator",
    text:
      "Bruk skattekalkulatoren for 2026. Jeg er ugift, født i 1990, bor i Norge hele året og har 650 000 kroner " +
      "i lønn, ingen andre inntekter, fradrag eller formue. Hva er estimert skatt for 2026? Svar med beløpet i kroner. " +
      "Ikke send inn eller lagre noe.",
    verify: (answer) =>
      verdict({ estimate: amountsIn(answer).has(TAX_EXPECTED_KR * 100) }, false, {
        answer,
        expectedKr: TAX_EXPECTED_KR,
      }),
    live: {
      label: "skatteetaten.no + browser tools",
      tools: "browser",
      url: "https://skattekalkulator.formueinntekt.skatt.skatteetaten.no/",
      origins: ["https://skattekalkulator.formueinntekt.skatt.skatteetaten.no"],
      ready: "!!document.querySelector('#input_sivilstand')",
      script: async (r) => {
        let snap = await snapshotOf(r);
        await r.call("browser_select_option", {
          element: "Hva er din sivilstatus?",
          target: refIn(snap, /combobox "Hva er din sivilstatus/),
          values: ["Ugift"],
        });
        await r.call("browser_type", {
          element: "I hvilket år er du født",
          target: refIn(snap, /textbox "I hvilket år er du født/),
          text: "1990",
        });
        await r.call("browser_click", { element: "Neste", target: refIn(snap, /button "Neste"/) });
        snap = await snapshotOf(r);
        await r.call("browser_click", {
          element: "Åpne og endre (lønn)",
          target: refIn(snap, /button "Åpne og endre"/),
        });
        snap = await snapshotOf(r);
        await r.call("browser_type", { element: "Lønn", target: refIn(snap, /textbox "Lønn/), text: "650000" });
        await r.call("browser_click", { element: "Ok", target: refIn(snap, /button "Ok"/) });
        const after = await r.call("browser_wait_for", { text: "Estimert skatt for 2026" });
        const shown = (await snapshotOf(r)) + after;
        const estimate = shown.match(/Estimert skatt for 2026[^\d]*([\d\s ]+) kr/)?.[1]?.trim();
        return `Estimert skatt for 2026 er ${estimate} kr.`;
      },
    },
    booki: {
      label: "Booki + bridge",
      tools: "bridge",
      url: "/bench/tax-acc",
      ready: bridgeReady("tax-calculator"),
      script: async (r) => {
        const ref = await bridgeRef(r, "tax-calculator");
        const out = await r.call("act", {
          steps: [
            { ref, action: "setProfile", args: [{ status: "ugift", birthYear: 1990 }] },
            { ref, action: "setSalary", args: [65_000_000] },
          ],
        });
        const shown = out.includes("estimateMinor") ? out : await r.call("snapshot");
        // The act result lists every change in order; the last estimate is the one after the salary.
        const minor = Number([...shown.matchAll(/"estimateMinor"\s*:\s*(\d+)/g)].at(-1)?.[1]);
        return `Estimert skatt for 2026 er ${new Intl.NumberFormat("nb-NO").format(minor / 100)} kr.`;
      },
    },
  },
  price: {
    id: "price",
    title: "SSB: priskalkulator",
    text:
      "Bruk priskalkulatoren: hva tilsvarer 10 000 kroner i januar 2000 i oktober 2026, og hvor stor er prisstigningen? " +
      "Svar med beløpet i kroner og øre og prisstigningen i prosent.",
    verify: (answer) => {
      const amounts = amountsIn(answer);
      return verdict(
        { amount: amounts.has(PRICE_EXPECTED_MINOR), percent: amounts.has(Math.round(PRICE_EXPECTED_PCT * 100)) },
        false,
        { answer },
      );
    },
    live: {
      label: "ssb.no + browser tools",
      tools: "browser",
      url: "https://www.ssb.no/kalkulatorer/priskalkulator",
      origins: ["https://www.ssb.no"],
      ready: "!!document.querySelector('#button_start-month')",
      script: async (r) => {
        let snap = await snapshotOf(r);
        // The cookie banner covers the form until it is answered: only what is needed.
        if (/button "Kun nødvendige"/.test(snap)) {
          await r.call("browser_click", { element: "Kun nødvendige", target: refIn(snap, /button "Kun nødvendige"/) });
          snap = await snapshotOf(r);
        }
        await r.call("browser_type", {
          element: "Beløp",
          target: refIn(snap, /textbox "Skriv inn beløp"/),
          text: "10000",
        });
        await r.call("browser_type", {
          element: "Fra år",
          target: refIn(snap, /textbox "Skriv inn fra år/),
          text: "2000",
        });
        await r.call("browser_click", {
          element: "Måned (fra)",
          target: refIn(snap, /button "Velg måned Gjennomsnitt for året"/, 0),
        });
        snap = await snapshotOf(r);
        await r.call("browser_click", {
          element: "Januar",
          target: refIn(snap, /(option|button|listitem|menuitem)[^"]*"Januar"/),
        });
        snap = await snapshotOf(r);
        await r.call("browser_type", {
          element: "Til år",
          target: refIn(snap, /textbox "Skriv inn til år/),
          text: "2026",
        });
        await r.call("browser_click", {
          element: "Måned (til)",
          target: refIn(snap, /button "Velg måned Gjennomsnitt for året"/, 0),
        });
        snap = await snapshotOf(r);
        await r.call("browser_click", {
          element: "Oktober",
          target: refIn(snap, /(option|button|listitem|menuitem)[^"]*"Oktober"/),
        });
        snap = await snapshotOf(r);
        await r.call("browser_click", { element: "Se prisendring", target: refIn(snap, /button "Se prisendring"/) });
        const shown = (await r.call("browser_wait_for", { text: "Beløpet tilsvarer" })) + (await snapshotOf(r));
        const amount = shown.match(/Beløpet tilsvarer ([\d\s,]+) kroner/)?.[1]?.trim();
        const pct = shown.match(/Prisstigningen er på ([\d,]+) prosent/)?.[1];
        return `10 000 kr i januar 2000 tilsvarer ${amount} kr i oktober 2026. Prisstigningen er ${pct} %.`;
      },
    },
    booki: {
      label: "Booki + bridge",
      tools: "bridge",
      url: "/bench/price-acc",
      ready: bridgeReady("price-calculator"),
      script: async (r) => {
        const ref = await bridgeRef(r, "price-calculator");
        const out = await r.call("act", {
          steps: [{ ref, action: "calculate", args: [{ amountMinor: 1_000_000, from: "2000-01", to: "2026-10" }] }],
        });
        const shown = out.includes("resultMinor") ? out : await r.call("snapshot");
        const minor = Number([...shown.matchAll(/"resultMinor"\s*:\s*(\d+)/g)].at(-1)?.[1]);
        const pct = Number([...shown.matchAll(/"changePct"\s*:\s*([\d.]+)/g)].at(-1)?.[1]);
        const nb = new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return `10 000 kr i januar 2000 tilsvarer ${nb.format(minor / 100)} kr i oktober 2026. Prisstigningen er ${String(pct).replace(".", ",")} %.`;
      },
    },
  },
};
