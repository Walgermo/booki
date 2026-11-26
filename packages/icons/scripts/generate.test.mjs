import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { iconNames, icons, iconSvg } from "../lib/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sources = readdirSync(join(root, "source"))
  .filter((file) => file.endsWith(".svg"))
  .map((file) => file.slice(0, -4))
  .sort();

test("every drawn source is in the package, and nothing else", () => {
  assert.deepEqual([...iconNames].sort(), sources);
  assert.deepEqual(
    readdirSync(root)
      .filter((file) => file.endsWith(".svg"))
      .map((file) => file.slice(0, -4))
      .sort(),
    sources,
  );
});

test("each icon draws in the text colour, with no colour of its own", () => {
  for (const name of iconNames) {
    assert.doesNotMatch(icons[name], /#[0-9a-f]{3,8}\b|rgb\(|oklch\(/i, name);
    assert.match(readFileSync(join(root, `${name}.svg`), "utf8"), /stroke="currentColor"/, name);
  }
});

test("iconSvg sizes the icon and lists the names when one is unknown", () => {
  assert.match(iconSvg(iconNames[0], 20), /width="20" height="20"/);
  assert.throws(() => iconSvg("nope"), /No icon "nope"\. Icons: /);
});
