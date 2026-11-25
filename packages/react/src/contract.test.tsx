import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as library from "./index.js";

/**
 * The public contract of every control: its agent actions, its options, its
 * ui-sdk parts and the `data-slot` names people style. Agents, apps and
 * stylesheets depend on these names, so they only ever grow. Removing or
 * renaming one fails here; adding one is fine. After an intended addition,
 * record it with `UPDATE_CONTRACT=1 pnpm --filter @booki-aui/react test`.
 */

type Contract = Record<string, { actions: string[]; options: string[]; parts: string[]; dataSlots: string[] }>;

const SRC = path.dirname(new URL(import.meta.url).pathname);
const BASELINE = path.join(SRC, "..", "contract.json");
const PRIMITIVES = path.join(SRC, "..", "..", "primitives", "src");

function current(): Contract {
  const out: Contract = {};
  type Definition = { name: string; options: Record<string, unknown>; slots: Record<string, unknown> };
  const definitions = (Object.values(library) as unknown[]).filter(
    (value): value is Definition =>
      (typeof value === "object" || typeof value === "function") &&
      value !== null &&
      "slots" in value &&
      "options" in value &&
      typeof (value as { name?: unknown }).name === "string",
  );
  const read = (dir: string) =>
    readdirSync(dir)
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\./.test(file))
      .map((file) => ({ base: file.replace(/\.tsx?$/, ""), text: readFileSync(path.join(dir, file), "utf8") }));
  // A definition lives in @booki-aui/primitives; its composed React control, and
  // the `data-slot` names it renders, in the file of the same name here.
  const definitionSources = read(PRIMITIVES);
  const reactSources = read(SRC);

  for (const definition of definitions) {
    const own =
      definitionSources.find(({ text }) => text.includes(`name: "${definition.name}"`)) ??
      reactSources.find(({ text }) => text.includes(`name: "${definition.name}"`));
    const composed = own ? reactSources.find(({ base }) => base === own.base) : undefined;
    const source = [own?.text ?? "", composed && composed !== own ? composed.text : ""].join("\n");
    const block = source.match(/agent:\s*\{[^}]*?actions:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
    const actions = [...block.matchAll(/"([A-Za-z]+)"/g)].map((match) => match[1]!);
    const dataSlots = [...new Set([...source.matchAll(/data-slot="([a-z0-9-]+)"/g)].map((match) => match[1]!))];
    out[definition.name] = {
      actions: [...new Set(actions)].sort(),
      options: Object.keys(definition.options).sort(),
      parts: Object.keys(definition.slots).sort(),
      dataSlots: dataSlots.sort(),
    };
  }
  return out;
}

describe("public contract", () => {
  const now = current();

  it("finds every control", () => {
    expect(Object.keys(now).length).toBeGreaterThan(20);
    expect(now["data-table"]?.actions).toContain("setSort");
  });

  if (process.env.UPDATE_CONTRACT === "1" || !existsSync(BASELINE)) {
    it("records the contract", () => {
      const sorted = Object.fromEntries(Object.entries(now).sort(([a], [b]) => a.localeCompare(b)));
      writeFileSync(BASELINE, `${JSON.stringify(sorted, null, 2)}\n`);
    });
    return;
  }

  const baseline = JSON.parse(readFileSync(BASELINE, "utf8")) as Contract;
  for (const [name, recorded] of Object.entries(baseline)) {
    it(`keeps everything "${name}" promised`, () => {
      const found = now[name];
      expect(found, `Control "${name}" was removed or renamed.`).toBeDefined();
      for (const kind of ["actions", "options", "parts", "dataSlots"] as const) {
        const missing = recorded[kind].filter((item) => !found![kind].includes(item));
        expect(missing, `"${name}" lost ${kind}: ${missing.join(", ")}. Keep them, or deprecate first.`).toEqual([]);
      }
    });
  }
});
