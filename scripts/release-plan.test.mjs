import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { changelogEntry, compareVersions, planRelease } from "./release-plan.mjs";

describe("compareVersions", () => {
  const ascending = [
    "0.2.5",
    "0.2.6",
    "0.2.10",
    "0.3.0-alpha",
    "0.3.0-alpha.1",
    "0.3.0-alpha.beta",
    "0.3.0-beta.2",
    "0.3.0-beta.11",
    "0.3.0-next.1",
    "0.3.0-next.2",
    "0.3.0-next.10",
    "0.3.0",
    "1.0.0",
  ];
  test("orders by semver precedence, prereleases included", () => {
    for (let i = 0; i < ascending.length - 1; i++) {
      assert.ok(compareVersions(ascending[i], ascending[i + 1]) < 0, `${ascending[i]} < ${ascending[i + 1]}`);
      assert.ok(compareVersions(ascending[i + 1], ascending[i]) > 0, `${ascending[i + 1]} > ${ascending[i]}`);
    }
    assert.deepEqual([...ascending].reverse().sort(compareVersions), ascending);
  });
  test("ignores build metadata and treats equal versions as equal", () => {
    assert.equal(compareVersions("0.3.0+build.1", "0.3.0"), 0);
    assert.equal(compareVersions("0.3.0-next.1", "0.3.0-next.1"), 0);
  });
  test("refuses what is not a version", () => {
    assert.throws(() => compareVersions("latest", "0.1.0"), /Not a semver version/);
  });
});

describe("planRelease", () => {
  test("first publish of a stable version takes latest", () => {
    assert.deepEqual(planRelease("0.1.0", {}), { tag: "latest", githubLatest: true, prerelease: false });
  });
  test("a newer stable version takes latest (the normal case)", () => {
    assert.equal(planRelease("0.2.6", { latest: "0.2.5" }).tag, "latest");
    assert.equal(planRelease("0.2.10", { latest: "0.2.9", next: "0.3.0-next.1" }).tag, "latest");
    assert.equal(planRelease("0.3.0", { latest: "0.2.9", next: "0.3.0-next.4" }).tag, "latest");
  });
  test("an older stable version goes to previous and is not GitHub's Latest", () => {
    assert.deepEqual(planRelease("0.2.5", { latest: "0.2.6" }), {
      tag: "previous",
      githubLatest: false,
      prerelease: false,
    });
    assert.equal(planRelease("0.2.9", { latest: "0.2.10" }).tag, "previous");
  });
  test("a stable version replaces a prerelease that npm made latest", () => {
    assert.equal(planRelease("0.2.0", { latest: "0.3.0-next.0" }).tag, "latest");
  });
  test("first publish of a prerelease takes next", () => {
    assert.deepEqual(planRelease("0.3.0-next.0", {}), { tag: "next", githubLatest: false, prerelease: true });
    assert.equal(planRelease("0.3.0-next.0", { latest: "0.3.0-next.0" }).tag, "next");
  });
  test("a newer prerelease takes next", () => {
    assert.equal(planRelease("0.3.0-next.2", { latest: "0.2.6", next: "0.3.0-next.1" }).tag, "next");
    assert.equal(planRelease("0.3.0-next.10", { latest: "0.2.6", next: "0.3.0-next.9" }).tag, "next");
    assert.equal(planRelease("0.4.0-next.0", { latest: "0.3.0", next: "0.3.0-next.4" }).tag, "next");
  });
  test("an older prerelease never moves next back", () => {
    assert.equal(planRelease("0.3.0-next.1", { latest: "0.2.6", next: "0.3.0-next.2" }).tag, "previous-next");
    assert.equal(planRelease("0.3.0-next.9", { latest: "0.2.6", next: "0.3.0-next.10" }).tag, "previous-next");
  });
  test("a prerelease older than the stable latest is a backfill", () => {
    assert.equal(planRelease("0.3.0-next.5", { latest: "0.3.0", next: "0.3.0-next.4" }).tag, "previous-next");
  });
  test("never targets latest with a prerelease", () => {
    for (const tags of [{}, { latest: "0.1.0" }, { latest: "9.0.0", next: "9.0.0-next.9" }]) {
      assert.notEqual(planRelease("0.3.0-next.1", tags).tag, "latest");
      assert.equal(planRelease("0.3.0-next.1", tags).githubLatest, false);
    }
  });
});

describe("changelogEntry", () => {
  const changelog = [
    "# @booki/core",
    "",
    "## 0.2.6",
    "",
    "### Patch Changes",
    "",
    "- Newer fix.",
    "",
    "## 0.2.5",
    "",
    "### Patch Changes",
    "",
    "- Older fix.",
    "",
    "## 0.2.4",
    "",
    "- Oldest.",
  ].join("\n");
  test("returns the section of that version only", () => {
    assert.equal(changelogEntry(changelog, "0.2.5"), "### Patch Changes\n\n- Older fix.");
    assert.equal(changelogEntry(changelog, "0.2.4"), "- Oldest.");
  });
  test("returns null for a version without a section", () => {
    assert.equal(changelogEntry(changelog, "0.2.7"), null);
    assert.equal(changelogEntry(changelog, "0.2"), null);
  });
});
