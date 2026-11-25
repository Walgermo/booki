import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

// One entry per control (written by scripts/generate.mjs), so a page imports only the tags it uses.
const controls = JSON.parse(readFileSync(new URL("./entries.json", import.meta.url), "utf8")) as string[];

export default defineConfig({
  entry: ["src/index.ts", "src/agent.ts", "src/agent-cursor.ts", ...controls.map((name) => `src/${name}.ts`)],
  format: ["esm"],
  // Types from the built @booki-aui/primitives: the exports carry explicit types, so nothing private is named.
  dts: { compilerOptions: { paths: {} } },
  splitting: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  // Explicit names: the declaration build ignores a regex here.
  external: [
    "@booki-aui/core",
    "@booki-aui/primitives",
    "@booki-aui/primitives/agent-cursor",
    ...controls.map((name) => `@booki-aui/primitives/${name}`),
    "@ui-sdk/core",
    "@ui-sdk/web",
    "@ui-sdk/web/agent",
  ],
});
