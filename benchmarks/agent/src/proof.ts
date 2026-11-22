/**
 * The real-model proof in one command: every head-to-head task, run by a
 * Claude model on each of its pages, five times, against the site you already
 * have running.
 *
 *   pnpm --filter agent-benchmark proof [--url http://localhost:5183] [--runs 5] [--model claude-opus-5-5]
 *
 * The key comes from ANTHROPIC_API_KEY, or from apps/www/.env.local (in this
 * checkout, or in the main checkout when this is a git worktree). A Vercel AI
 * Gateway key there (AI_GATEWAY_API_KEY or API_AI_GATEWAY) routes the runs
 * through the gateway's Anthropic-compatible endpoint, with the gateway's
 * model id. The key is passed to the runs and never printed.
 * Results land in results/ like any `bench` run; the scripted head-to-head
 * (`h2h`) stays the zero-cost baseline next to them.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const TASKS = ["voucher", "supplier-invoice", "sales-invoice", "dashboard", "inbox", "reconcile", "close"] as const;

const { values } = parseArgs({
  options: {
    url: { type: "string", default: "http://localhost:5183" },
    runs: { type: "string", default: "5" },
    model: { type: "string" },
    task: { type: "string", multiple: true },
  },
});

/** apps/www/.env.local here, and in the main checkout if this is a git worktree. */
function envFiles(): string[] {
  const files = [path.resolve(root, "../../apps/www/.env.local")];
  try {
    const list = execFileSync("git", ["worktree", "list", "--porcelain"], { cwd: root, encoding: "utf8" });
    const main = /^worktree (.+)$/m.exec(list)?.[1];
    if (main) files.push(path.join(main, "apps/www/.env.local"));
  } catch {
    /* not a git checkout */
  }
  return [...new Set(files)].filter((file) => existsSync(file));
}

function readVar(name: string): string | undefined {
  for (const file of envFiles()) {
    const line = readFileSync(file, "utf8")
      .split("\n")
      .find((row) => row.startsWith(`${name}=`));
    const value = line
      ?.slice(name.length + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    if (value) return value;
  }
  return undefined;
}

const GATEWAY = "https://ai-gateway.vercel.sh";
const anthropicKey = process.env.ANTHROPIC_API_KEY || readVar("ANTHROPIC_API_KEY");
const gatewayKey =
  process.env.AI_GATEWAY_API_KEY ||
  process.env.API_AI_GATEWAY ||
  readVar("AI_GATEWAY_API_KEY") ||
  readVar("API_AI_GATEWAY");
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

if (!(await siteIsUp(values.url!))) {
  console.error(`Nothing answers at ${values.url}. Start the site first: pnpm --filter @booki/www dev -- --port 5183`);
  process.exit(1);
}

/**
 * The gateway's list price for the model, per million tokens, so cost is right
 * for any model it serves. A model with no cache-write charge (implicit
 * caching) bills cache writes as plain input.
 */
async function gatewayPrices(id: string): Promise<string | undefined> {
  try {
    const response = await fetch(`${GATEWAY}/v1/models`, { signal: AbortSignal.timeout(10_000) });
    const models = ((await response.json()) as { data: { id: string; pricing?: Record<string, string> }[] }).data;
    const pricing = models.find((m) => m.id === id)?.pricing;
    if (!pricing?.input || !pricing.output) return undefined;
    const perMillion = (value: string | undefined, fallback: string) => String(Number(value ?? fallback) * 1_000_000);
    return [
      perMillion(pricing.input, pricing.input),
      perMillion(pricing.output, pricing.output),
      perMillion(pricing.input_cache_write, pricing.input),
      perMillion(pricing.input_cache_read, pricing.input),
    ].join(",");
  } catch {
    return undefined;
  }
}

const prices = viaGateway && model ? await gatewayPrices(model) : undefined;
if (prices)
  console.log(
    `Gateway list price for ${model}, USD per million tokens (input, output, cache write, cache read): ${prices}`,
  );
// Anthropic's effort setting is Anthropic-only; other providers get the request without it.
const anthropicModel = !model || model.startsWith("anthropic/") || model.startsWith("claude-");

const tasks = values.task?.length ? values.task : [...TASKS];
const failed: string[] = [];
for (const task of tasks) {
  console.log(`\n── ${task}: ${values.runs} runs per page ─────────────────────────────`);
  const args = ["tsx", "src/bench.ts", "--task", task, "--url", values.url!, "--skip-build", "--runs", values.runs!];
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
