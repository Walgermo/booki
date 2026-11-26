#!/usr/bin/env node
/**
 * Publishes every public package whose version npm does not have yet.
 *
 * Runs in the Release workflow's publish job, which signs in to npm through
 * trusted publishing (OIDC): no token. `pnpm pack` turns `workspace:*` into the
 * released version, and `npm publish` uploads the tarball with provenance. For
 * each published version it writes a git-tag event to the file changesets/action
 * names in CHANGESETS_OUTPUT; the action reads it to push the tag and create the
 * GitHub Release.
 *
 *   node scripts/publish.mjs           publish what npm lacks
 *   node scripts/publish.mjs --check   only say whether anything is unpublished
 *                                      (writes `pending=true|false` to GITHUB_OUTPUT)
 *
 * NPM_PUBLISH_MODE=stage stages the versions instead (`npm stage publish`): a
 * person then approves each one on npmjs.com → Staged Packages before it is
 * published. Use it while a package's trusted publisher still allows only
 * staging.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const check = process.argv.includes("--check");
const stage = process.env.NPM_PUBLISH_MODE === "stage";
const run = (command, args, options = {}) =>
  execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options })?.trim();

/** True when npm already has this version: published, or (when staging) waiting in staging. */
function known(name, version) {
  try {
    if (run("npm", ["view", `${name}@${version}`, "version"]) === version) return true;
  } catch {
    // Not published (E404), or a package npm has never seen.
  }
  if (!stage) return false;
  try {
    return run("npm", ["stage", "list", name]).includes(version);
  } catch {
    return false;
  }
}

/** True when `a` is a lower release (X.Y.Z) than `b`. */
function older(a, b) {
  const [x, y] = [a, b].map((v) => v.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i];
  return false;
}

/** The version npm's `latest` dist-tag points at, or null for a package npm has never seen. */
function latest(name) {
  try {
    return run("npm", ["view", name, "dist-tags.latest"]) || null;
  } catch {
    return null;
  }
}

const packages = readdirSync(join(root, "packages"))
  .map((dir) => join(root, "packages", dir))
  .flatMap((dir) => {
    try {
      return [{ dir, manifest: JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) }];
    } catch {
      return [];
    }
  })
  .filter(({ manifest }) => !manifest.private);

const pending = packages.filter(({ manifest }) => !known(manifest.name, manifest.version));

if (check) {
  for (const { manifest } of pending) console.log(`Not on npm yet: ${manifest.name}@${manifest.version}`);
  if (!pending.length) console.log("Every package version is on npm.");
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `pending=${pending.length > 0}\n`);
  process.exit(0);
}

const out = mkdtempSync(join(tmpdir(), "booki-publish-"));
for (const { dir, manifest } of pending) {
  const { name, version } = manifest;
  const before = new Set(readdirSync(out));
  run("pnpm", ["pack", "--pack-destination", out], { cwd: dir });
  const tarball = readdirSync(out).find((file) => !before.has(file));
  if (!tarball) throw new Error(`pnpm pack wrote no tarball for ${name}`);
  // A prerelease (0.3.0-next.1) goes to the `next` dist-tag, never to `latest`. Releases
  // queue oldest first, but GitHub does not promise the start order: a release older than
  // npm's `latest` goes to `previous`, so `latest` never moves backwards.
  const current = version.includes("-") ? null : latest(name);
  const distTag = version.includes("-")
    ? ["--tag", "next"]
    : current && !current.includes("-") && older(version, current)
      ? ["--tag", "previous"]
      : [];
  const command = stage ? ["stage", "publish"] : ["publish"];
  run("npm", [...command, join(out, tarball), "--access", "public", "--provenance", ...distTag], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  const tag = `${name}@${version}`;
  // One JSON line per release, the format changesets/action v2 reads.
  if (process.env.CHANGESETS_OUTPUT) {
    appendFileSync(process.env.CHANGESETS_OUTPUT, `${JSON.stringify({ type: "git-tag", tag, packageName: name })}\n`);
  }
  console.log(`${stage ? "Staged" : "Published"} ${tag}`);
}
if (!pending.length) console.log("Nothing to publish.");
else if (stage)
  console.log(`Staged ${pending.length} package(s). Approve them on npmjs.com → Staged Packages to publish.`);
else console.log(`Published ${pending.length} package(s).`);
