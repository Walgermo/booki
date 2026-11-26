import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const build = fileURLToPath(new URL("./build.mjs", import.meta.url));
const dist = (file) => fileURLToPath(new URL(`../dist/${file}`, import.meta.url));

test("a build over the base.css budget fails and leaves the last good dist as it was", () => {
  const before = statSync(dist("booki.css")).mtimeMs;
  const controls = readdirSync(dist("controls")).length;
  for (const attempt of [1, 2]) {
    const run = spawnSync(process.execPath, [build], {
      env: { ...process.env, BOOKI_STYLES_BASE_BUDGET: "1" },
      encoding: "utf8",
    });
    assert.notEqual(run.status, 0, `attempt ${attempt} should fail`);
    assert.match(run.stderr, /over its size budget/);
  }
  assert.equal(statSync(dist("booki.css")).mtimeMs, before);
  assert.equal(readdirSync(dist("controls")).length, controls);
  for (const file of ["base.css", "layered.css", "shadcn.css", "css.d.ts"]) assert.ok(existsSync(dist(file)), file);
});
