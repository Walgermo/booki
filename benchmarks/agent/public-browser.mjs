import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const timeout = 15_000;
const browser = await chromium.launch({ channel: "chrome" });

function numberFrom(text, pattern) {
  const value = text.match(pattern)?.[1];
  assert.ok(value, "Expected a published number in the selected text");
  return Number(value.replace(/\s/g, ""));
}

async function run(id, home, visit) {
  const context = await browser.newContext({ locale: "nb-NO", viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(timeout);
  const steps = [];
  const click = async (label, locator) => {
    await locator.click();
    steps.push({ input: "click", label });
  };
  const pressEnter = async (label, locator) => {
    await locator.press("Enter");
    steps.push({ input: "enter", label });
  };
  const verify = async (url, heading) => {
    await page.waitForURL(url, { waitUntil: "commit", timeout });
    const title = page.getByRole("heading", { level: 1, name: heading, exact: true });
    await title.waitFor({ state: "visible" });
    return { url: page.url(), heading: (await title.innerText()).trim() };
  };

  try {
    const response = await page.goto(home, { waitUntil: "domcontentloaded", timeout });
    assert.ok(response?.ok(), `Home page returned HTTP ${response?.status()}`);
    const destination = await visit({ page, click, pressEnter, verify });
    return { id, home, steps, ...destination };
  } finally {
    await context.close();
  }
}

try {
  const runs = await Promise.allSettled([
    run("nav", "https://www.nav.no/", async ({ page, click, verify }) => {
      const decline = page.getByRole("button", { name: "Nei", exact: true });
      if (await decline.isVisible()) await click("Nei", decline);
      await click("Saksbehandlingstider", page.getByRole("main").getByRole("link", { name: /Saksbehandlingstider/ }));
      const destination = await verify("https://www.nav.no/saksbehandlingstider", "Saksbehandlingstider");
      const card = page.getByRole("region", { name: "Dagpenger", exact: true });
      await click("Dagpenger · Vis mer", card.getByRole("button", { name: "Vis mer", exact: true }));
      await card.getByRole("button", { expanded: true }).waitFor({ state: "visible" });
      const table = card.getByRole("table");
      await table.first().waitFor({ state: "visible" });
      const application = await table
        .getByRole("row")
        .filter({ has: page.getByRole("cell", { name: "Søknad", exact: true }) })
        .innerText();
      const permittering = await table
        .getByRole("row")
        .filter({
          has: page.getByRole("cell", { name: "Internasjonal søknad ved permittering", exact: true }),
        })
        .innerText();
      const complaint = await table
        .getByRole("row")
        .filter({
          has: page.getByRole("cell", { name: "Klage til Nav klageinstans", exact: true }),
        })
        .innerText();
      return {
        ...destination,
        expanded: "Dagpenger",
        facts: {
          applicationWeeks: numberFrom(application, /(\d+)\s+uker/i),
          internationalLayoffApplicationWeeks: numberFrom(permittering, /(\d+)\s+uker/i),
          complaintAppealBodyMonths: numberFrom(complaint, /(\d+)\s+måneder/i),
        },
      };
    }),
    run("posten", "https://www.posten.no/", async ({ page, click, verify }) => {
      await click("Avvis alle", page.getByRole("button", { name: "Avvis alle", exact: true }));
      await click(
        "Se julens sendefrister",
        page.getByRole("main").getByRole("link", { name: "Se julens sendefrister", exact: true }),
      );
      const destination = await verify(
        "https://www.posten.no/kundeservice/sendefrister",
        "Sendefrister for julepost 2026",
      );
      const main = page.getByRole("main");
      const small = await main.getByText(/Norgespakke.*liten:.*Nord-Norge/i).innerText();
      const large = await main.getByText(/Norgespakke.*stor:\s*\d/i).innerText();
      const express = await main.getByText(/Norgespakke.*ekspress:\s*\d/i).innerText();
      return {
        ...destination,
        facts: {
          domesticSmallSameRegionDecemberDay: numberFrom(small, /(\d+)\. desember innen/i),
          domesticSmallAcrossRegionsDecemberDay: numberFrom(small, /(\d+)\. desember fra/i),
          domesticLargeDecemberDay: numberFrom(large, /(\d+)\. desember/i),
          domesticExpressDecemberDay: numberFrom(express, /(\d+)\. desember/i),
        },
      };
    }),
    run("brreg", "https://www.brreg.no/", async ({ page, pressEnter, verify }) => {
      await pressEnter("Årsregnskap", page.getByRole("link", { name: /^Årsregnskap/ }));
      const destination = await verify("https://www.brreg.no/innsending-av-arsregnskap/", "Innsending av årsregnskap");
      await page
        .getByRole("main")
        .getByRole("link", { name: /^Forsinkelsesgebyr/ })
        .waitFor({ state: "visible" });
      const main = await page.getByRole("main").innerText();
      return {
        ...destination,
        visibleLink: "Forsinkelsesgebyr",
        facts: {
          filingJulyDay: numberFrom(main, /senest\s+(\d+)\. juli/i),
          maxLateFeeNok: numberFrom(main, /bli\s+([\d\s]+)\s+kroner/i),
          correctionWeeksForTimelyFiling: numberFrom(main, /får du\s+(\d+)\s+uker til å rette/i),
        },
      };
    }),
  ]);

  const failures = runs.filter((run) => run.status === "rejected");
  if (failures.length)
    throw new AggregateError(
      failures.map((run) => run.reason),
      "Public browser checks failed",
    );

  console.log(
    JSON.stringify(
      {
        observedOn: new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo" }).format(new Date()),
        browser: `Google Chrome ${browser.version()}`,
        runs: runs.map((run) => run.value),
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
