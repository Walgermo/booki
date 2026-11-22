import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  exports: Record<string, string | { default: string; types: string }>;
};
const tsup = readFileSync(join(root, "tsup.config.ts"), "utf8");

describe("package exports", () => {
  // A renamed source file once left ./booki-agent pointing at a file the build no longer wrote.
  it("every subpath export is built from an entry that exists", () => {
    for (const [subpath, target] of Object.entries(pkg.exports)) {
      const file = typeof target === "string" ? target : target.default;
      const name = file.replace(/^\.\/dist\//, "").replace(/\.js$/, "");
      const source = ["ts", "tsx"].map((ext) => `src/${name}.${ext}`).find((path) => existsSync(join(root, path)));
      expect(source, `${subpath} → ${file} has no src/${name}.ts(x)`).toBeDefined();
      expect(tsup, `${source} is not a tsup entry`).toContain(`"${source}"`);
    }
  });

  it("marks every built file as a client module, for React Server Components", () => {
    expect(tsup).toMatch(/banner: \{ js: '"use client";' \}/);
  });
});
