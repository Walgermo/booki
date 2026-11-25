#!/usr/bin/env node
/**
 * Stages every public package whose version npm does not have yet. A person
 * then approves each one on npmjs.com (Staged Packages), with 2FA, before it
 * is published: releasing is a person's decision, as it is in Booki.
 *
 * Runs in the Release workflow, which signs in to npm through trusted
 * publishing (OIDC): no token. `pnpm pack` turns `workspace:*` into the
 * released version, and `npm stage publish` uploads the tarball with
 * provenance. For each staged version it writes a git-tag event to the file
 * changesets/action names in CHANGESETS_OUTPUT; the action reads it to push
 * the tag and create the GitHub Release.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const run = (command, args, options = {}) =>
  execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options })?.trim();

/** True when npm already has this version, published or waiting in staging. */
function known(name, version) {
  try {
    if (run("npm", ["view", `${name}@${version}`, "version"]) === version) return true;
  } catch {
    // Not published (E404), or a package npm has never seen.
  }
  try {
    return run("npm", ["stage", "list", name]).includes(version);
  } catch {
    return false;
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

const out = mkdtempSync(join(tmpdir(), "booki-stage-"));
let staged = 0;
for (const { dir, manifest } of packages) {
  const { name, version } = manifest;
  if (known(name, version)) {
    console.log(`${name}@${version} is already on npm or staged`);
    continue;
  }
  const before = new Set(readdirSync(out));
  run("pnpm", ["pack", "--pack-destination", out], { cwd: dir });
  const tarball = readdirSync(out).find((file) => !before.has(file));
  if (!tarball) throw new Error(`pnpm pack wrote no tarball for ${name}`);
  // A prerelease (0.3.0-next.1) goes to the `next` dist-tag, never to `latest`.
  const distTag = version.includes("-") ? ["--tag", "next"] : [];
  run("npm", ["stage", "publish", join(out, tarball), "--access", "public", "--provenance", ...distTag], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  const tag = `${name}@${version}`;
  // One JSON line per release, the format changesets/action v2 reads.
  if (process.env.CHANGESETS_OUTPUT) {
    appendFileSync(process.env.CHANGESETS_OUTPUT, `${JSON.stringify({ type: "git-tag", tag, packageName: name })}\n`);
  }
  console.log(`Staged ${tag}`);
  staged++;
}
console.log(
  staged ? `Staged ${staged} package(s). Approve them on npmjs.com → Staged Packages to publish.` : "Nothing to stage.",
);
