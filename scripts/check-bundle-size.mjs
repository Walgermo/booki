import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const reactDir = fileURLToPath(new URL("../packages/react/", import.meta.url));
const entry = "amount-field-entry.js";
const budget = 50 * 1024;

const { metafile } = await build({
  absWorkingDir: reactDir,
  stdin: {
    contents: 'export { AmountField } from "@booki-aui/react/amount-field";',
    sourcefile: entry,
    resolveDir: reactDir,
  },
  format: "esm",
  target: "es2022",
  bundle: true,
  splitting: true,
  minify: true,
  write: false,
  metafile: true,
  outdir: "bundle-size-output",
  external: ["react", "react-dom"],
  logOverride: { "ignored-bare-import": "silent" },
});

// The entry and its static imports load immediately. Dynamic chunks, including
// the Norwegian catalogue, load only when an app uses the features that need them.
const outputs = new Map(Object.entries(metafile.outputs).map(([path, output]) => [resolve(reactDir, path), output]));
const entryPath = [...outputs].find(([, output]) => output.entryPoint && basename(output.entryPoint) === entry)?.[0];
if (!entryPath) throw new Error(`Missing bundle entry ${entry}`);

const pending = [entryPath];
const visited = new Set();
let bytes = 0;
while (pending.length > 0) {
  const path = pending.pop();
  if (visited.has(path)) continue;
  visited.add(path);
  const output = outputs.get(path);
  if (!output) throw new Error(`Missing bundle output ${path}`);
  bytes += output.bytes;
  for (const item of output.imports) {
    if (!item.external && item.kind === "import-statement") pending.push(resolve(reactDir, item.path));
  }
}

console.log(`AmountField initial JavaScript ${bytes} bytes minified (budget ${budget} bytes)`);
if (bytes > budget) process.exitCode = 1;
