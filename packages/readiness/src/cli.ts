#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import { audit, type AuditOptions } from "./audit.js";
import { toConsole, toHtml, toJson } from "./report.js";

const HELP = `Usage: npx @booki/readiness <url | file.html> [options]

Checks what stops an AI agent on a screen and scores it 0-100 against the
Agent Contract.

Options
  --storage-state <file>  Playwright storage state of a signed-in session
  --profile <dir>         Run in this browser profile (signed in already; close the browser first)
  --out <file>            HTML report (default: readiness-report.html); JSON goes next to it
  --json <file>           JSON report path (default: the --out path with .json)
  --no-report             Print the summary only
  --browser <channel>     chrome (default), msedge, chromium
  --executable <path>     A browser binary instead of a channel
  --wait <ms>             Wait after load, for late rendering (default 500)
  --wait-for <selector>   Wait until this selector is on the page
  --headed                Show the browser
  --fail-under <score>    Exit with code 1 when the score is below this
  --snapshot              Include the full accessibility snapshot in the JSON
  -h, --help              This text
`;

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "storage-state": { type: "string" },
      profile: { type: "string" },
      out: { type: "string" },
      json: { type: "string" },
      "no-report": { type: "boolean" },
      browser: { type: "string" },
      executable: { type: "string" },
      wait: { type: "string" },
      "wait-for": { type: "string" },
      headed: { type: "boolean" },
      "fail-under": { type: "string" },
      snapshot: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help || positionals.length !== 1) {
    process.stdout.write(HELP);
    return values.help ? 0 : 2;
  }
  const options: AuditOptions = {
    storageState: values["storage-state"],
    profile: values.profile,
    channel: values.browser,
    executablePath: values.executable,
    wait: values.wait ? Number(values.wait) : undefined,
    waitFor: values["wait-for"],
    headed: values.headed,
  };
  const report = await audit(positionals[0]!, options);
  process.stdout.write(`${toConsole(report)}\n`);

  if (!values["no-report"]) {
    const html = path.resolve(values.out ?? "readiness-report.html");
    const json = path.resolve(values.json ?? html.replace(/\.html?$/i, "") + ".json");
    writeFileSync(html, toHtml(report));
    writeFileSync(json, toJson(report, { snapshot: values.snapshot }));
    process.stdout.write(`\nReport: ${html}\nJSON:   ${json}\n`);
  }

  const floor = values["fail-under"] ? Number(values["fail-under"]) : null;
  return floor !== null && report.score < floor ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`readiness: ${message}\n`);
    if (/Executable doesn't exist|Chromium distribution|channel/i.test(message)) {
      process.stderr.write(
        "Install Google Chrome, or pass --browser msedge, or --executable <path to a Chromium browser>.\n",
      );
    }
    process.exit(2);
  },
);
