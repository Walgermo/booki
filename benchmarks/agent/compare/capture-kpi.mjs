/**
 * Fetches the consumer price index SSB's price calculator uses, from SSB's
 * open API, into apps/www/src/components/bench/compare/kpi.json:
 * table 14709 (by month, 1920 on) and 14711 (yearly averages, 1865 on).
 * Both are 2025 = 100.
 *
 *   node benchmarks/agent/compare/capture-kpi.mjs
 */
import { writeFileSync } from "node:fs";

const API = "https://data.ssb.no/api/pxwebapi/v2/tables";
const out = new URL("../../../apps/www/src/components/bench/compare/kpi.json", import.meta.url);

async function table(id, query) {
  const response = await fetch(`${API}/${id}/data?lang=no&outputFormat=json-stat2&${query}`);
  if (!response.ok) throw new Error(`SSB table ${id}: ${response.status}`);
  return response.json();
}

/** json-stat2 → { "code,code,…": value }, in the table's dimension order. */
function cells(data) {
  const ids = data.id;
  const codes = ids.map((id) =>
    Object.entries(data.dimension[id].category.index)
      .sort((a, b) => a[1] - b[1])
      .map(([code]) => code),
  );
  const result = [];
  data.value.forEach((value, position) => {
    const key = {};
    let rest = position;
    for (let i = ids.length - 1; i >= 0; i -= 1) {
      key[ids[i]] = codes[i][rest % data.size[i]];
      rest = Math.floor(rest / data.size[i]);
    }
    result.push({ key, value });
  });
  return result;
}

const monthly = {};
for (const { key, value } of cells(
  await table(14709, "valueCodes[Maaned]=*&valueCodes[ContentsCode]=KpiIndMnd&valueCodes[Tid]=*"),
)) {
  if (value === null || key.Maaned === "90") continue;
  monthly[`${key.Tid}-${key.Maaned}`] = value;
}
const yearly = {};
for (const { key, value } of cells(await table(14711, "valueCodes[ContentsCode]=KpiAar&valueCodes[Tid]=*"))) {
  if (value !== null) yearly[key.Tid] = value;
}
const months = Object.keys(monthly).sort();
writeFileSync(
  out,
  `${JSON.stringify({
    source: "SSB tables 14709 and 14711, 2025=100",
    fetchedAt: new Date().toISOString().slice(0, 10),
    latestMonth: months.at(-1),
    monthly,
    yearly,
  })}\n`,
);
console.log(`${months.length} months (${months[0]}–${months.at(-1)}), ${Object.keys(yearly).length} years.`);
