import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as primitives from "./index.js";

/**
 * @booki/primitives is the one definition every framework renders, so it may
 * not depend on any of them. A file here that imports React, or ui-sdk's
 * React bindings, fails this test.
 */

const SRC = path.dirname(new URL(import.meta.url).pathname);
const FORBIDDEN = /^(react|react-dom)(\/.*)?$|^@ui-sdk\/react(\/.*)?$/;
const SPECIFIER =
  /\b(?:import|export)\s[^"']*?from\s*["']([^"']+)["']|\bimport\s*["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)|\brequire\s*\(\s*["']([^"']+)["']\s*\)/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(c|m)?[jt]sx?$/.test(entry.name) ? [full] : [];
  });
}

describe("framework-free", () => {
  const files = sourceFiles(SRC);

  it("scans every source file", () => {
    expect(files.length).toBeGreaterThan(30);
  });

  for (const file of files) {
    const name = path.relative(SRC, file);
    it(`${name} imports neither react nor @ui-sdk/react`, () => {
      const text = readFileSync(file, "utf8");
      const imported = [...text.matchAll(SPECIFIER)].map((match) => match[1] ?? match[2] ?? match[3] ?? match[4] ?? "");
      expect(imported.filter((specifier) => FORBIDDEN.test(specifier))).toEqual([]);
      expect(name.endsWith(".tsx"), "no JSX files").toBe(false);
    });
  }

  it("exports every control's definition from the package root", async () => {
    type Definition = { name: string; options: Record<string, unknown>; slots: unknown };
    const isDefinition = (value: unknown): value is Definition =>
      (typeof value === "object" || typeof value === "function") &&
      value !== null &&
      "slots" in value &&
      "options" in value &&
      typeof (value as { name?: unknown }).name === "string";
    const controls = files.filter(
      (file) => !file.includes(".test.") && readFileSync(file, "utf8").includes("definePrimitive("),
    );
    expect(controls.length).toBeGreaterThan(30);
    const fromRoot = new Set<unknown>((Object.values(primitives) as unknown[]).filter(isDefinition));
    for (const file of controls) {
      const own = Object.values((await import(file)) as Record<string, unknown>).filter(isDefinition);
      expect(own, path.basename(file)).toHaveLength(1);
      expect(fromRoot.has(own[0]!), `${path.basename(file)} is exported from the root`).toBe(true);
    }
    expect(fromRoot.size).toBe(controls.length);
  });
});
