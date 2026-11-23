// Prints the test coverage of core, primitives and react as a Markdown table, and
// writes the shields.io endpoint JSON for the README badge.
//
//   node scripts/coverage-summary.mjs                    table to stdout
//   node scripts/coverage-summary.mjs --badge out.json   and the badge JSON too
//
// Reads packages/<name>/coverage/coverage-summary.json, written by `pnpm coverage`.
// When GITHUB_STEP_SUMMARY is set (GitHub Actions), the table is appended there too.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const PACKAGES = ["core", "primitives", "react"];
const METRICS = ["lines", "statements", "functions", "branches"];

export function summaryPath(name, base = root) {
  return join(base, "packages", name, "coverage", "coverage-summary.json");
}

// Turns a vitest json-summary document into { lines, statements, functions, branches }
// with covered and total counts. Percentages are computed later from these counts.
export function countsFromSummary(summary) {
  const counts = {};
  for (const metric of METRICS) {
    const total = summary?.total?.[metric];
    if (!total || typeof total.total !== "number" || typeof total.covered !== "number") {
      throw new Error(`coverage summary has no total.${metric} with covered and total counts`);
    }
    counts[metric] = { covered: total.covered, total: total.total };
  }
  return counts;
}

// Rows for the table: one per package, then an All row that sums the counts.
export function buildRows(perPackage) {
  const rows = perPackage.map(({ name, counts }) => ({ name, counts }));
  const all = {};
  for (const metric of METRICS) {
    all[metric] = { covered: 0, total: 0 };
    for (const { counts } of perPackage) {
      all[metric].covered += counts[metric].covered;
      all[metric].total += counts[metric].total;
    }
  }
  rows.push({ name: "All", counts: all });
  return rows;
}

export function percent(metricCounts) {
  if (metricCounts.total === 0) return 100;
  return (metricCounts.covered / metricCounts.total) * 100;
}

function formatPercent(metricCounts) {
  return `${percent(metricCounts).toFixed(1)}%`;
}

export function renderTable(rows) {
  const lines = ["| Package | Lines | Statements | Functions | Branches |", "| --- | ---: | ---: | ---: | ---: |"];
  for (const { name, counts } of rows) {
    lines.push(
      `| ${name} | ${formatPercent(counts.lines)} | ${formatPercent(counts.statements)} | ${formatPercent(counts.functions)} | ${formatPercent(counts.branches)} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

export function badgeColor(pct) {
  if (pct >= 90) return "brightgreen";
  if (pct >= 80) return "green";
  if (pct >= 70) return "yellowgreen";
  if (pct >= 60) return "yellow";
  if (pct >= 50) return "orange";
  return "red";
}

// shields.io endpoint JSON, from the lines percentage of the All row.
export function badgeJson(allRow) {
  const pct = Math.round(percent(allRow.counts.lines));
  return {
    schemaVersion: 1,
    label: "coverage",
    message: `${pct}%`,
    color: badgeColor(pct),
  };
}

function readPackage(name, base) {
  const file = summaryPath(name, base);
  let text;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw new Error(`Missing ${file}. Run "pnpm coverage" first.`);
  }
  return { name, counts: countsFromSummary(JSON.parse(text)) };
}

export function collect(base = root) {
  return buildRows(PACKAGES.map((name) => readPackage(name, base)));
}

function main(argv) {
  const badgeAt = argv.indexOf("--badge");
  const badgeFile = badgeAt >= 0 ? argv[badgeAt + 1] : undefined;
  if (badgeAt >= 0 && !badgeFile) throw new Error("--badge needs an output file.");

  const rows = collect();
  const table = renderTable(rows);
  process.stdout.write(table);

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Test coverage\n\n${table}\n`);
  }

  if (badgeFile) {
    const allRow = rows.at(-1);
    writeFileSync(resolve(badgeFile), `${JSON.stringify(badgeJson(allRow), null, 2)}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}
