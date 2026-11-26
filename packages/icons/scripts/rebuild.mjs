// One command after drawing or changing an icon: lint, build the SVGs from source/,
// then write lib/. Uses the draw-icons skill (https://github.com/ronykax/skills):
// install it with `npx skills add ronykax/skills --skill draw-icons`, or point
// DRAW_ICONS at its folder.
//
//   pnpm icons
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(root, "..", "..");
const candidates = [
  process.env.DRAW_ICONS,
  join(homedir(), ".claude", "skills", "draw-icons"),
  join(homedir(), ".agents", "skills", "draw-icons"),
  join(repo, ".claude", "skills", "draw-icons"),
].filter(Boolean);
const skill = candidates.find((dir) => existsSync(join(dir, "scripts", "icons.js")));
if (!skill) {
  console.error(
    "The draw-icons skill is not installed. Run `npx skills add ronykax/skills --skill draw-icons`, or set DRAW_ICONS to its folder.",
  );
  process.exit(1);
}
const cli = join(skill, "scripts", "icons.js");
if (!existsSync(join(skill, "scripts", "node_modules"))) {
  execFileSync("npm", ["install", "--prefix", join(skill, "scripts"), "--ignore-scripts"], { stdio: "inherit" });
}
execFileSync("node", [cli, "build"], { cwd: repo, stdio: "inherit" });
execFileSync("node", [join(root, "scripts", "generate.mjs")], { stdio: "inherit" });
