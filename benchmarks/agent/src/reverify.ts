/**
 * Re-checks the answers of read-only runs (the dashboard task) in saved
 * results, after a change to the answer check. Nothing is run again: the
 * check reads the model's final text, which every result file keeps. Each
 * changed run gets `reverified` with the old and new outcome, and the file a
 * `reverifiedAt`, so the change stays visible.
 *
 *   pnpm --filter agent-benchmark exec tsx src/reverify.ts
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyDashboardAnswer } from "./verify.js";

const results = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../results");

type Run = {
  page: string;
  success: boolean;
  finalText?: string;
  verification?: { ok: boolean; checks?: Record<string, boolean> };
  reverified?: { from: boolean; to: boolean; at: string };
};
type Summary = { page: string; runs: number; succeeded: number };

for (const file of readdirSync(results).filter((f) => /^bench-dashboard-.*\.json$/.test(f))) {
  const full = path.join(results, file);
  const data = JSON.parse(readFileSync(full, "utf8")) as { runs: Run[]; summary: Summary[]; reverifiedAt?: string };
  let changed = 0;
  for (const run of data.runs) {
    // Only runs that ended with an answer; a run cut off by the step cap has none to check.
    if (!run.finalText) continue;
    const verdict = await verifyDashboardAnswer(undefined as never, { answer: run.finalText });
    if (verdict.ok !== run.success) {
      run.reverified = { from: run.success, to: verdict.ok, at: new Date().toISOString() };
      run.success = verdict.ok;
      run.verification = { ...run.verification, ...verdict };
      changed += 1;
    }
  }
  if (!changed) continue;
  for (const page of data.summary) {
    page.succeeded = data.runs.filter((run) => run.page === page.page && run.success).length;
  }
  data.reverifiedAt = new Date().toISOString();
  writeFileSync(full, `${JSON.stringify(data, null, 2)}\n`);
  console.log(
    `${file}: ${changed} run(s) re-checked: ${data.summary.map((p) => `${p.page} ${p.succeeded}/${p.runs}`).join(", ")}`,
  );
}
