#!/usr/bin/env node
/**
 * Publishes every public package whose version npm does not have yet.
 *
 * Runs in the Release workflow's publish job, which signs in to npm through
 * trusted publishing (OIDC): no token. `pnpm pack` turns `workspace:*` into the
 * released version, and `npm publish` uploads the tarball with provenance. For
 * each published version it writes a git-tag event to the file changesets/action
 * names in CHANGESETS_OUTPUT; the action reads it to push the tag and create the
 * GitHub Release. The dist-tag comes from release-plan.mjs: a version older than
 * the one npm already serves never moves `latest` or `next` back. The action
 * cannot create a release that is not GitHub's Latest, so for an older stable
 * version this script creates the tag and release itself (`gh release create
 * --latest=false`) and writes no event.
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
import { changelogEntry, planRelease } from "./release-plan.mjs";

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

/** npm's dist-tags for a package ({ latest, next, … }), or {} for one npm has never seen. */
function distTags(name) {
  try {
    return JSON.parse(run("npm", ["view", name, "dist-tags", "--json"]) || "{}");
  } catch {
    return {};
  }
}

/**
 * Tags and releases an older stable version on GitHub without making it Latest. A
 * failure only warns: the version is on npm, and stopping would leave the packages
 * after it unpublished.
 */
function releaseNotLatest(dir, tag, version) {
  let notes = "";
  try {
    notes = changelogEntry(readFileSync(join(dir, "CHANGELOG.md"), "utf8"), version) ?? "";
  } catch {
    // No CHANGELOG: an empty release body.
  }
  const args = ["release", "create", tag, "--title", tag, "--notes", notes, "--latest=false"];
  if (process.env.GITHUB_SHA) args.push("--target", process.env.GITHUB_SHA);
  if (process.env.GITHUB_REPOSITORY) args.push("--repo", process.env.GITHUB_REPOSITORY);
  try {
    run("gh", args, { stdio: ["ignore", "inherit", "inherit"] });
  } catch (error) {
    console.log(`::warning::Could not create the GitHub Release ${tag}: ${error.message}`);
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
  // Releases queue oldest first, but GitHub does not promise the start order: a version
  // older than the one npm serves goes to `previous` / `previous-next` (release-plan.mjs).
  const plan = planRelease(version, distTags(name));
  const distTag = plan.tag === "latest" ? [] : ["--tag", plan.tag];
  const command = stage ? ["stage", "publish"] : ["publish"];
  run("npm", [...command, join(out, tarball), "--access", "public", "--provenance", ...distTag], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  const tag = `${name}@${version}`;
  if (process.env.CHANGESETS_OUTPUT) {
    // changesets/action would make an older stable release GitHub's Latest.
    if (!plan.prerelease && !plan.githubLatest) releaseNotLatest(dir, tag, version);
    // One JSON line per release, the format changesets/action v2 reads.
    else
      appendFileSync(process.env.CHANGESETS_OUTPUT, `${JSON.stringify({ type: "git-tag", tag, packageName: name })}\n`);
  }
  console.log(`${stage ? "Staged" : "Published"} ${tag}`);
}
if (!pending.length) console.log("Nothing to publish.");
else if (stage)
  console.log(`Staged ${pending.length} package(s). Approve them on npmjs.com → Staged Packages to publish.`);
else console.log(`Published ${pending.length} package(s).`);
