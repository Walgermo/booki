// Builds the packages whose dist is missing or older than their source, and
// every package built on them. The workspace packages find each other through
// dist, so a fresh clone or a stale dist fails with "Cannot find module
// '@booki/core/…'" in typecheck and tests. `pnpm test`, `pnpm typecheck` and
// `pnpm dev` run this first; when everything is current it does nothing.
//
//   node scripts/ensure-built.mjs           build what is stale
//   node scripts/ensure-built.mjs --check   list what is stale, build nothing
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// In build order. `after` is what a package is built on.
const PACKAGES = [
  { name: "core", after: [] },
  { name: "primitives", after: ["core"] },
  { name: "react", after: ["core", "primitives"] },
  { name: "styles", after: [] },
  { name: "web", after: ["core", "primitives"] },
  { name: "vue", after: ["core", "primitives", "react"] },
  { name: "svelte", after: ["core", "primitives", "react"] },
  { name: "solid", after: ["core", "primitives", "react"] },
  { name: "readiness", after: [] },
];

// vue, svelte and solid are generated from react's sources, web from the primitives'.
const GENERATED_FROM = new Set(["primitives", "react"]);

function newest(path) {
  if (!existsSync(path)) return 0;
  const stat = statSync(path);
  if (!stat.isDirectory()) return stat.mtimeMs;
  let latest = 0;
  for (const entry of readdirSync(path)) {
    if (entry === "node_modules" || entry === "dist") continue;
    latest = Math.max(latest, newest(join(path, entry)));
  }
  return latest;
}

function oldestOutput(dist) {
  if (!existsSync(dist)) return 0;
  const files = readdirSync(dist).filter((file) => /\.(js|css)$/.test(file));
  if (files.length === 0) return 0;
  return Math.min(...files.map((file) => statSync(join(dist, file)).mtimeMs));
}

const stale = new Set();
for (const pkg of PACKAGES) {
  const dir = join(root, "packages", pkg.name);
  const inputs = Math.max(
    newest(join(dir, "src")),
    newest(join(dir, "scripts")),
    newest(join(dir, "package.json")),
    newest(join(dir, "tsup.config.ts")),
  );
  if (oldestOutput(join(dir, "dist")) < inputs || pkg.after.some((dep) => stale.has(dep))) stale.add(pkg.name);
}

if (stale.size === 0) process.exit(0);
const list = PACKAGES.filter((pkg) => stale.has(pkg.name)).map((pkg) => pkg.name);
if (process.argv.includes("--check")) {
  console.log(`Stale: ${list.join(", ")}. Run: node scripts/ensure-built.mjs`);
  process.exit(1);
}
console.log(`Building ${list.map((name) => `@booki/${name}`).join(", ")} (dist missing or older than src)…`);
const run = (args) => execFileSync("pnpm", args, { cwd: root, stdio: "inherit" });
if (list.some((name) => GENERATED_FROM.has(name))) run(["generate:frameworks"]);
for (const name of list) run(["--filter", `@booki/${name}`, "build"]);
