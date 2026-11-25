/**
 * The key and the gateway list price for a real-model run, shared by `proof`
 * (screens and bridge) and its `--side api` runs. The key is never printed.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const GATEWAY = "https://ai-gateway.vercel.sh";

/** apps/www/.env.local here, and in the main checkout if this is a git worktree. */
function envFiles(root: string): string[] {
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

export function readVar(root: string, name: string): string | undefined {
  for (const file of envFiles(root)) {
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

/**
 * The gateway's list price for the model, per million tokens, so cost is right
 * for any model it serves. A model with no cache-write charge (implicit
 * caching) bills cache writes as plain input.
 */
export async function gatewayPrices(id: string): Promise<string | undefined> {
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
