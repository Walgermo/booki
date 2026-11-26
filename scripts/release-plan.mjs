/**
 * Where a version goes on npm and GitHub, decided from the version alone and npm's
 * current dist-tags. Pure, so scripts/release-plan.test.mjs can cover every order in
 * which queued releases may reach npm.
 */

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

function parse(version) {
  const match = SEMVER.exec(String(version).trim());
  if (!match) throw new Error(`Not a semver version: ${version}`);
  const [, major, minor, patch, pre] = match;
  return { core: [major, minor, patch].map(Number), pre: pre ? pre.split(".") : [] };
}

/** True for a prerelease such as 0.3.0-next.1. */
export function isPrerelease(version) {
  return parse(version).pre.length > 0;
}

/**
 * Semver precedence: negative when `a` is lower than `b`, positive when higher, 0 when
 * equal. A prerelease is lower than its release; numeric identifiers compare as numbers
 * and rank below alphanumeric ones; build metadata is ignored.
 */
export function compareVersions(a, b) {
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) if (x.core[i] !== y.core[i]) return x.core[i] - y.core[i];
  if (!x.pre.length || !y.pre.length) return y.pre.length - x.pre.length;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    if (i >= x.pre.length) return -1;
    if (i >= y.pre.length) return 1;
    const [p, q] = [x.pre[i], y.pre[i]];
    if (p === q) continue;
    const [pn, qn] = [/^\d+$/.test(p), /^\d+$/.test(q)];
    if (pn && qn) return Number(p) - Number(q);
    if (pn !== qn) return pn ? -1 : 1;
    return p < q ? -1 : 1;
  }
  return 0;
}

const stable = (version) => (version && !isPrerelease(version) ? version : null);

/**
 * The npm dist-tag for `version` and whether its GitHub Release may become Latest.
 *
 * - A release newer than npm's stable `latest` (or the first one) takes `latest`.
 * - An older release published late goes to `previous`, so `latest` never moves back,
 *   and its GitHub Release is created with make_latest false.
 * - A prerelease newer than `next` and than the stable `latest` takes `next`.
 * - An older prerelease goes to `previous-next`, so `next` never moves back.
 *
 * GitHub never marks a prerelease Latest, so only a stable backfill needs its own
 * GitHub Release. `distTags` is npm's dist-tags object ({} for a new package).
 */
export function planRelease(version, distTags = {}) {
  const latest = stable(distTags.latest);
  if (!isPrerelease(version)) {
    const backfill = latest !== null && compareVersions(version, latest) < 0;
    return { tag: backfill ? "previous" : "latest", githubLatest: !backfill, prerelease: false };
  }
  const behind = [distTags.next, latest].some((current) => current && compareVersions(version, current) < 0);
  return { tag: behind ? "previous-next" : "next", githubLatest: false, prerelease: true };
}

/** The body of `## <version>` in a CHANGELOG written by Changesets, or null. */
export function changelogEntry(markdown, version) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => /^##\s/.test(line) && line.replace(/^##\s+v?/, "").trim() === version);
  if (start < 0) return null;
  const end = lines.findIndex((line, i) => i > start && /^#{1,2}\s/.test(line));
  return lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join("\n")
    .trim();
}
