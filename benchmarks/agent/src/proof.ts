/**
 * The real-model proof in one command: every head-to-head task, run by a
 * Claude model on each of its pages, five times, against the site you already
 * have running.
 *
 *   pnpm --filter agent-benchmark proof [--url http://localhost:5183] [--runs 5] [--model claude-opus-5-5]
 *   pnpm --filter agent-benchmark proof --side api [--task supplier-invoice] [--model …]
 *
 * `--side api` runs the same tasks with the bookkeeping API's tools instead of
 * a page (src/api-bench.ts); it needs no site.
 *
 * The key comes from ANTHROPIC_API_KEY, or from apps/www/.env.local (in this
 * checkout, or in the main checkout when this is a git worktree). A Vercel AI
 * Gateway key there (AI_GATEWAY_API_KEY or API_AI_GATEWAY) routes the runs
 * through the gateway's Anthropic-compatible endpoint, with the gateway's
 * model id. The key is passed to the runs and never printed.
 * Results land in results/ like any `bench` run; the scripted head-to-head
 * (`h2h`) stays the zero-cost baseline next to them.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { API_TASKS } from "./api-tasks.js";
import { GATEWAY, gatewayPrices, readVar } from "./gateway.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const TASKS = ["voucher", "supplier-invoice", "sales-invoice", "dashboard", "inbox", "reconcile", "close"] as const;

const { values } = parseArgs({
  options: {
    url: { type: "string", default: "http://localhost:5183" },
    runs: { type: "string", default: "5" },
    model: { type: "string" },
    task: { type: "string", multiple: true },
    side: { type: "string", default: "screens" },
  },
});

const apiSide = values.side === "api";
if (!apiSide && values.side !== "screens") {
  console.error(`--side is screens or api. Got "${values.side}".`);
  process.exit(1);
}

const anthropicKey = process.env.ANTHROPIC_API_KEY || readVar(root, "ANTHROPIC_API_KEY");
const gatewayKey =
  process.env.AI_GATEWAY_API_KEY ||
  process.env.API_AI_GATEWAY ||
  readVar(root, "AI_GATEWAY_API_KEY") ||
  readVar(root, "API_AI_GATEWAY");
const viaGateway = !anthropicKey && !!gatewayKey;
const key = anthropicKey || gatewayKey;
if (!key) {
  console.error(
    "No API key. Put ANTHROPIC_API_KEY=… or AI_GATEWAY_API_KEY=… in apps/www/.env.local (git-ignored), or set it in your shell, then run this again.",
  );
  process.exit(1);
}
const model = values.model ?? (viaGateway ? "anthropic/claude-opus-5.5" : undefined);
console.log(
  viaGateway
    ? `Routing through Vercel AI Gateway (${GATEWAY}), model ${model}.`
    : "Calling the Anthropic API directly.",
);

async function siteIsUp(url: string) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return response.ok;
  } catch {
    return false;
  }
}

if (!apiSide && !(await siteIsUp(values.url!))) {
  console.error(
    `Nothing answers at ${values.url}. Start the site first: pnpm --filter @booki-aui/www dev -- --port 5183`,
  );
  process.exit(1);
}

const prices = viaGateway && model ? await gatewayPrices(model) : undefined;
if (prices)
  console.log(
    `Gateway list price for ${model}, USD per million tokens (input, output, cache write, cache read): ${prices}`,
  );
// Anthropic's effort setting is Anthropic-only; other providers get the request without it.
const anthropicModel = !model || model.startsWith("anthropic/") || model.startsWith("claude-");

const tasks = values.task?.length ? values.task : apiSide ? Object.keys(API_TASKS) : [...TASKS];
const failed: string[] = [];
for (const task of tasks) {
  console.log(`\n── ${task}${apiSide ? " (API)" : ""}: ${values.runs} runs per page ─────────────────────────────`);
  const args = apiSide
    ? ["tsx", "src/api-bench.ts", "--task", task, "--runs", values.runs!]
    : ["tsx", "src/bench.ts", "--task", task, "--url", values.url!, "--skip-build", "--runs", values.runs!];
  if (model) args.push("--model", model);
  if (prices) args.push("--prices", prices);
  if (!anthropicModel) args.push("--effort", "none");
  const run = spawnSync("npx", args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ANTHROPIC_API_KEY: key, ...(viaGateway ? { ANTHROPIC_BASE_URL: GATEWAY } : {}) },
  });
  if (run.status !== 0) failed.push(task);
}

console.log(
  failed.length
    ? `\nDone, with failures in: ${failed.join(", ")}. The tables above say what went wrong.`
    : "\nDone. Results are in benchmarks/agent/results/, one file per task.",
);
process.exit(failed.length ? 1 : 0);
