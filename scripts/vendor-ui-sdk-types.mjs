// The ui-sdk does not export a few types its definitions name (SlotProps and
// the types it rests on), so the .d.ts bundler copies its primitive-types file
// into dist and leaves four imports to files dist lacks. This puts those four
// beside it. Run from a package after tsup: node ../../scripts/vendor-ui-sdk-types.mjs
// Remove once https://github.com/vercel-labs/ui/issues/1017 is fixed (docs/upstream-ui-sdk.md).
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const dist = join(process.cwd(), "dist");
const chunk = readdirSync(dist).find((name) => /^primitive-types\.d-.*\.d\.ts$/.test(name));
if (!chunk) process.exit(0);
const require = createRequire(join(process.cwd(), "package.json"));
const kernel = join(dirname(require.resolve("@ui-sdk/core")), "foundation", "kernel");
const needed = [...readFileSync(join(dist, chunk), "utf8").matchAll(/from '\.\/(live|roles|selects|store)\.js'/g)].map(
  (m) => m[1],
);
for (const name of new Set([...needed, "store"])) {
  const source = readFileSync(join(kernel, `${name}.d.ts`), "utf8")
    // Attrs and Part, the only names these take from primitive-types, are public.
    .replaceAll('"./primitive-types.js"', '"@ui-sdk/core"');
  if (/from "\.\/(?!live|roles|selects|store|primitive-types)/.test(source)) {
    throw new Error(`ui-sdk ${name}.d.ts imports a file this script does not copy; extend the list.`);
  }
  writeFileSync(join(dist, `${name}.d.ts`), source);
}
