// The pnpm version lives in package.json's `packageManager`. Vercel does not
// read that field without Corepack, so apps/www/vercel.json runs the same
// version by name. This fails when the two drift apart.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const wanted = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).packageManager.replace(/^pnpm@/, "");
const vercel = JSON.parse(readFileSync(join(root, "apps/www/vercel.json"), "utf8"));
const used = new Set(
  [vercel.installCommand, vercel.buildCommand].flatMap((command) =>
    [...String(command).matchAll(/pnpm@([\w.-]+)/g)].map((m) => m[1]),
  ),
);
const drift = [...used].filter((version) => version !== wanted);
if (used.size === 0 || drift.length > 0) {
  console.error(
    `apps/www/vercel.json runs pnpm ${[...used].join(", ") || "(none pinned)"}, but package.json's packageManager is pnpm@${wanted}. Use the same version in both.`,
  );
  process.exit(1);
}
