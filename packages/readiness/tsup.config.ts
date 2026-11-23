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
  target: "node20",
});
