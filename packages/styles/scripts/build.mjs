import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { transform } from "lightningcss";
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// One stylesheet out, built from the parts in src/ in this order.
const PARTS = ["booki.css", "agent.css"];

// Size budgets for dist/base.css, the file every page loads. base.css states
// the component scope once per group of rules (CSS nesting), so it grew back
// into 62 copies of the scope list before. The build fails above these, so
// it cannot grow back unnoticed. Set them to the measured size, rounded up to
// the next 250 bytes, when a change makes base.css smaller or larger on purpose.
const BASE_RAW_BUDGET = 58500;
const BASE_GZIP_BUDGET = 7500;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
rmSync(join(root, "dist"), { recursive: true, force: true });
mkdirSync(join(root, "dist/controls"), { recursive: true });
// Then one file per control in src/controls, in name order.
const controls = readdirSync(join(root, "src/controls"))
  .filter((file) => file.endsWith(".css"))
  .sort()
  .map((file) => `controls/${file}`);
const read = (part) => readFileSync(join(root, "src", part), "utf8");
let css = [...PARTS, ...controls].map(read).join("\n");

// The base rules for fields, buttons and labels are written for "inside a
// component" (:where([data-slot])). Other libraries set data-slot too (every
// shadcn/ui part does), so narrow that to Booki's own components: one prefix
// per component, from the public contract plus the React-only ones. Specificity
// stays zero, inside :where().
const contract = JSON.parse(readFileSync(join(root, "../react/contract.json"), "utf8"));
const EXTRA = [
  "voucher-",
  "text-link",
  "money-amount",
  "payment-confirm",
  "approval-gate",
  "sca-prompt",
  "exception-banner",
  "audit-trail",
  "audit-event",
  "country-toggle",
  "attestation-status",
  "agent-cursor",
  "agent-presence",
  "agent-proposal",
  "accounting-period-select",
  "financial-date-field",
  "invoice-number-input",
  "payment-reference-input",
  "bank-account-input",
  "organization-number-input",
];
const prefixes = [...new Set([...Object.keys(contract), ...EXTRA])].sort();
// [data-booki] lets your own control (built with definePrimitive) opt in to the same base look.
const scope = ["[data-booki]", ...prefixes.map((name) => `[data-slot^="${name}"]`)].join(", ");
const generic = (css.match(/:where\(\[data-slot\][ )]/g) ?? []).length;
const scoped = (text) => {
  const out = text
    .replaceAll(":where([data-slot])", `:where(${scope})`)
    .replaceAll(":where([data-slot] ", `:where(:is(${scope}) `);
  if (/:where\(\[data-slot\][ )]/.test(out)) throw new Error("an unscoped :where([data-slot]) is left in the build");
  return out;
};
// Minified: comments and spacing are most of the size. Nothing is dropped or reordered for a browser target.
const minify = (text, filename) => transform({ filename, code: Buffer.from(text), minify: true }).code.toString();
css = minify(scoped(css), "booki.css");

writeFileSync(join(root, "dist/booki.css"), css);
// Only what a page uses: the tokens and base look, then one file per control.
const base = minify(scoped(PARTS.map(read).join("\n")), "base.css");
writeFileSync(join(root, "dist/base.css"), base);
const baseGzip = gzipSync(base).length;
if (base.length > BASE_RAW_BUDGET || baseGzip > BASE_GZIP_BUDGET) {
  throw new Error(
    `dist/base.css is over its size budget: ${base.length} B raw (budget ${BASE_RAW_BUDGET}), ${baseGzip} B gzip (budget ${BASE_GZIP_BUDGET})`,
  );
}
for (const control of controls) {
  writeFileSync(join(root, "dist", control), minify(scoped(read(control)), control));
}
// The same rules inside @layer booki, for apps whose own utilities (Tailwind's
// @layer utilities) should win over Booki's defaults.
// The order comes first: Tailwind 4's reset (base) below Booki, its utilities above.
writeFileSync(
  join(root, "dist/layered.css"),
  `@layer theme, base, booki, components, utilities;\n@layer booki {\n${css}\n}\n`,
);
// TypeScript checks side-effect imports (TS2882): the CSS has no exports.
writeFileSync(join(root, "dist/css.d.ts"), "export {};\n");
writeFileSync(join(root, "dist/shadcn.css"), readFileSync(join(root, "src/shadcn.css"), "utf8"));
console.log(
  `Built @booki/styles → dist/booki.css (${Math.round(css.length / 1024)} KB), layered.css, base.css (${(base.length / 1024).toFixed(1)} KB raw, ${(baseGzip / 1024).toFixed(1)} KB gzip), controls/*.css, shadcn.css (${PARTS.join(" + ")} + ${controls.length} controls; ${generic} base rules scoped to ${prefixes.length} components)`,
);
