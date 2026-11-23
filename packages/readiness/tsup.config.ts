import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    cli: "src/cli.ts",
    conformance: "src/conformance/index.ts",
    reference: "src/reference/index.ts",
  },
  format: ["esm"],
  dts: {
    entry: {
      index: "src/index.ts",
      conformance: "src/conformance/index.ts",
      reference: "src/reference/index.ts",
    },
  },
  clean: true,
  // keepNames would wrap functions in a module-level __name helper, which the
  // functions sent to page.evaluate cannot reach. src/page.ts guards them too.
  keepNames: false,
  target: "node20",
});
