/**
 * Reads Skatteetaten's tax calculator for a few salaries and writes what it
 * shows: the estimate and the breakdown. The Booki rebuild is tested against
 * these numbers (compare/fixtures/tax-2026.json), so it gives the same answer
 * as the real page. Unmarried, born 1990, salary only, 2026.
 *
 *   node benchmarks/agent/compare/capture-tax.mjs
 *
 * One fresh page per salary, one after the other, with a pause between: the
 * calculator stores nothing and this is a handful of requests.
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const START = "https://skattekalkulator.formueinntekt.skatt.skatteetaten.no/";
const SALARIES = [100_000, 250_000, 400_000, 650_000, 800_000, 1_100_000, 1_500_000, 2_500_000];
const out = new URL("./fixtures/tax-2026.json", import.meta.url);

const kroner = (text) => Number(text.replace(/[^\d-]/g, ""));

const browser = await chromium.launch({ channel: "chrome" });
const samples = [];
for (const salary of SALARIES) {
  const context = await browser.newContext({ locale: "nb-NO" });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  await page.goto(START);
  await page.locator("#input_sivilstand").selectOption("ugift");
  await page.locator("#input_foedselsaar").fill("1990");
  await page.getByRole("button", { name: "Neste" }).click();
  await page.getByRole("heading", { name: "Beregn skatten din" }).waitFor();
  await page.getByRole("button", { name: "Åpne og endre" }).first().click();
  // The editor is not marked as a dialog; its field is named "Lønn".
  await page.getByRole("textbox", { name: /^Lønn/ }).fill(String(salary));
  await page.getByRole("button", { name: "Ok", exact: true }).click();
  await page.waitForFunction(
    (expected) =>
      !/Estimert skatt for 2026\s*0 kr/.test(document.querySelector("main")?.innerText ?? "") || expected === 0,
    salary,
  );
  await page.getByRole("button", { name: "Se detaljer" }).click();
  await page.getByText("SKATTEBEREGNING").waitFor();
  const text = await page.locator("main").innerText();
  const row = (label) => {
    const match = text.match(new RegExp(`${label}\\t([\\d\\s]+)\\t([\\d\\s]+)`));
    return match ? { basis: kroner(match[1]), amount: kroner(match[2]) } : null;
  };
  const line = (label) => {
    const match = text.match(new RegExp(`${label}\\n([\\d\\s]+)\\n`));
    return match ? kroner(match[1]) : null;
  };
  const sample = {
    salary,
    estimate: kroner(text.match(/Estimert skatt for 2026\s*\n*\s*([\d\s]+) kr/)[1]),
    minstefradrag: line("Minstefradrag i egen inntekt"),
    alminneligInntekt: line("INNTEKT ETTER FRADRAG \\(Alminnelig inntekt\\)"),
    fellesskatt: row("Staten, fellesskatt"),
    kommuneOgFylke: row("Kommune og fylke"),
    trinnskatt: row("Staten, trinnskatt av personinntekt"),
    trygdeavgift: row("Trygdeavgift av lønnsinntekt"),
  };
  samples.push(sample);
  console.log(JSON.stringify(sample));
  await context.close();
  await new Promise((resolve) => setTimeout(resolve, 1500));
}
await browser.close();

writeFileSync(
  out,
  `${JSON.stringify(
    {
      source: START,
      capturedAt: new Date().toISOString(),
      person: { year: 2026, status: "ugift", birthYear: 1990, only: "salary" },
      samples,
    },
    null,
    2,
  )}\n`,
);
console.log(`Wrote ${samples.length} samples.`);
