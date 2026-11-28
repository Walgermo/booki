// Published size of each @booki-aui package, and what an app pays for one import.
//
//   node scripts/package-sizes.mjs        (after pnpm build:packages)
//
// Per package: the npm pack tarball, its unpacked size and file count, and the
// main entry bundled and minified with its dependencies left out. Per import:
// the initial JavaScript an app loads (entry and static imports, lazy chunks
// left out), minified and gzipped, with react external.
import { execSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";
const repo = fileURLToPath(new URL("..", import.meta.url));
const rows = [];
for (const dir of readdirSync(join(repo, "packages"))) {
  const pdir = join(repo, "packages", dir);
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(join(pdir, "package.json"), "utf8"));
  } catch {
    continue;
  }
  if (pkg.private) continue;
  const out = JSON.parse(
    execSync("npm pack --dry-run --json --ignore-scripts", {
      cwd: pdir,
      stdio: ["ignore", "pipe", "ignore"],
    }).toString(),
  )[0];
  let main = "-";
  const exp = pkg.exports?.["."];
  const entry =
    typeof exp === "string" ? exp : (exp?.import?.default ?? exp?.import ?? exp?.default ?? pkg.module ?? pkg.main);
  if (entry && typeof entry === "string" && entry.endsWith(".js")) {
    const ext = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})];
    const r = await build({
      entryPoints: [join(pdir, entry)],
      bundle: true,
      minify: true,
      write: false,
      format: "esm",
      platform: pkg.bin ? "node" : "browser",
      external: ext.flatMap((e) => [e, `${e}/*`]),
      logLevel: "silent",
    });
    const code = r.outputFiles[0].contents;
    main = `${code.length} / ${gzipSync(code, { level: 9 }).length}`;
  }
  rows.push([pkg.name, out.size, out.unpackedSize, out.entryCount, main]);
}
console.log("package | tarball B | unpacked B | files | main min / min+gz B");
for (const r of rows) console.log(r.join(" | "));

console.log("");
console.log("import | initial min B | initial min+gz B");
const dir = fileURLToPath(new URL("../packages/react/", import.meta.url));
const cases = {
  AmountField: 'export { AmountField } from "@booki-aui/react/amount-field";',
  DataTable: 'export { DataTable } from "@booki-aui/react/data-table";',
  LedgerTable: 'export { LedgerTable } from "@booki-aui/react/ledger-table";',
  VoucherComposer: 'export { VoucherComposer } from "@booki-aui/react/voucher-composer";',
  "parseToMinor (core/money)": 'export { parseToMinor } from "@booki-aui/core/money";',
  "isValidKid (core)": 'export { isValidKid } from "@booki-aui/core";',
  "every control (react index)": 'export * from "@booki-aui/react";',
};
for (const [name, contents] of Object.entries(cases)) {
  const { metafile, outputFiles } = await build({
    absWorkingDir: dir,
    stdin: { contents, resolveDir: dir, sourcefile: "entry.js" },
    bundle: true,
    splitting: true,
    minify: true,
    write: false,
    metafile: true,
    outdir: "out",
    format: "esm",
    external: ["react", "react-dom", "react/*"],
    logLevel: "silent",
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const files = new Map(outputFiles.map((f) => [resolve(f.path), f.contents]));
  const outputs = new Map(Object.entries(metafile.outputs).map(([p, o]) => [resolve(dir, p), o]));
  const entry = [...outputs].find(([, o]) => o.entryPoint && basename(o.entryPoint) === "entry.js")[0];
  const pending = [entry],
    seen = new Set();
  let min = 0;
  const parts = [];
  while (pending.length) {
    const p = pending.pop();
    if (seen.has(p)) continue;
    seen.add(p);
    min += files.get(p).length;
    parts.push(files.get(p));
    for (const i of outputs.get(p).imports)
      if (!i.external && i.kind === "import-statement") pending.push(resolve(dir, i.path));
  }
  const gz = gzipSync(Buffer.concat(parts.map((x) => Buffer.from(x))), { level: 9 }).length;
  console.log(`${name} | ${min} | ${gz}`);
}
