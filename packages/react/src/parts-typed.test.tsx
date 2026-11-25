import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every control's parts are typed by name: `const parts: Parts<typeof x,
 * typeof TAGS> = createParts(x, TAGS)`, each part `(typeof parts)["Slot"]`.
 * Left to inference, the declaration files spell the whole definition out
 * once per part: @booki-aui/react's types were 14.7 MB that way, 300 kB now.
 */
// Tests run from the package folder (jsdom gives import.meta.url no file path).
const src = join(process.cwd(), "src");
const files = readdirSync(src).filter((file) => file.endsWith(".tsx") && !file.includes(".test."));

describe("parts are typed by name", () => {
  it.each(files.filter((file) => readFileSync(join(src, file), "utf8").includes("createParts(")))("%s", (file) => {
    const source = readFileSync(join(src, file), "utf8");
    expect(source, "createParts without a Parts<typeof …> annotation").not.toMatch(/const \w+ = createParts\(/);
    expect(source).toMatch(/const parts: Parts<typeof \w+, typeof TAGS> = createParts\(/);
    const untyped = source.match(/^const \w+ = parts\.\w+;$/gm) ?? [];
    expect(untyped, 'a part without its (typeof parts)["Slot"] type').toEqual([]);
  });
});
