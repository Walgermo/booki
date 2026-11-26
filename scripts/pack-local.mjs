// Booki from this checkout, to try a change before it is released: packs the
// packages as npm would get them, and prints how another project installs the
// files. Not `link:`, which gives that
// project a second React and paths only this computer has.
//
//   pnpm pack:local                 core, primitives, react, styles → .packed/
//   pnpm pack:local --out ../app/vendor
//   pnpm pack:local web vue         those too
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const KNOWN = ["core", "primitives", "react", "styles", "web", "vue", "svelte", "solid"];
const args = process.argv.slice(2).filter((arg) => arg !== "--");
const at = args.indexOf("--out");
const out = resolve(at < 0 ? join(root, ".packed") : (args[at + 1] ?? ""));
if (at >= 0 && !args[at + 1]) throw new Error("--out needs a folder.");
const extra = at < 0 ? args : args.filter((_, i) => i !== at && i !== at + 1);
const unknown = extra.filter((name) => !KNOWN.includes(name));
if (unknown.length) throw new Error(`No package called ${unknown.join(", ")}. There are: ${KNOWN.join(", ")}.`);
const names = KNOWN.filter((name) => ["core", "primitives", "react", "styles", ...extra].includes(name));

const run = (command, commandArgs, cwd) =>
  execFileSync(command, commandArgs, { cwd, stdio: ["ignore", "ignore", "inherit"] });
run("node", [join(root, "scripts/ensure-built.mjs")], root);
mkdirSync(out, { recursive: true });
// Only the packages packed now: an adapter packed earlier (vue, say) stays, since an app may still install it.
for (const file of readdirSync(out)) {
  const packed = /^booki(?:-aui)?-([a-z]+)-\d.*\.tgz$/.exec(file);
  if (packed && names.includes(packed[1])) rmSync(join(out, file));
}
const files = names.map((name) => {
  const dir = join(root, "packages", name);
  run("pnpm", ["pack", "--pack-destination", out], dir);
  return {
    name,
    file: join(out, `booki-aui-${name}-${JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version}.tgz`),
  };
});
// Paths from the app's own root, so the block works on every computer. pnpm reads overrides at the
// workspace root (pnpm-workspace.yaml), which can sit above the app's own package.json; npm runs in
// the folder of the nearest package.json.
const up = (marker) => {
  for (let dir = dirname(out); dir !== dirname(dir); dir = dirname(dir))
    if (existsSync(join(dir, marker))) return dir === root ? null : dir;
  return null;
};
const npmRoot = up("package.json");
const pnpmRoot = up("pnpm-workspace.yaml") ?? npmRoot;
// Quoted for a POSIX shell when the path has a space or another character the shell would split on.
const quoted = (text) => (/^[\w@%+=:,./-]+$/.test(text) ? text : `'${text.replaceAll("'", `'\\''`)}'`);
const from = (base, file) => (base ? `./${relative(base, file)}` : file);
const wanted = files.filter(({ name }) => name !== "primitives").map(({ name }) => `@booki-aui/${name}`);
// The peers each package names, at the exact version Booki is built and tested with: ui-sdk is a beta.
const peers = new Map();
for (const { name } of files) {
  const manifest = JSON.parse(readFileSync(join(root, "packages", name, "package.json"), "utf8"));
  for (const [peer, range] of Object.entries(manifest.peerDependencies ?? {}))
    if (peer.startsWith("@ui-sdk/")) peers.set(peer, range);
}
const pinned = [...peers].map(([peer, range]) => `${peer}@${range}`);

console.log(`Packed ${files.length} packages into ${out}

pnpm: add to pnpm-workspace.yaml${pnpmRoot ? ` in ${pnpmRoot}` : ""}, then run the command in the app's folder.

overrides:
${files.map(({ name, file }) => `  "@booki-aui/${name}": ${JSON.stringify(`file:${from(pnpmRoot, file)}`)}`).join("\n")}

pnpm add ${[...wanted, ...pinned].join(" ")}

npm: one command${npmRoot ? `, in ${npmRoot}` : ""}.

npm install --save-exact ${[...files.map(({ file }) => quoted(from(npmRoot, file))), ...pinned].join(" ")}

Packing again later: run the same add or install command again. The file names stay the same,
so pnpm install keeps the build it already has.`);
