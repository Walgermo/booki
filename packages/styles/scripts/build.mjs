import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { transform } from "lightningcss";
import { gzipSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// One stylesheet out, built from the parts in src/ in this order.
const PARTS = ["booki.css", "agent.css"];

// Size budgets for dist/base.css, the file every page loads. base.css states
// the component scope once per group of rules (CSS nesting): three groups,
// each a :where([data-slot]) { … } block in booki.css. Add a rule to one of
// them rather than starting a new group: every group is another copy of the
// 62-name scope list. The build fails above these, so
// it cannot grow back unnoticed. Set them to the measured size, rounded up to
// the next 250 bytes, when a change makes base.css smaller or larger on purpose.
// BOOKI_STYLES_BASE_BUDGET lowers the raw budget, for the test that a build over it writes nothing.
const BASE_RAW_BUDGET = Number(process.env.BOOKI_STYLES_BASE_BUDGET ?? 43750);
const BASE_GZIP_BUDGET = 7250;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// Every output is made and checked first, and dist is replaced only when all of them pass:
// a build that stops on a check leaves the last good dist as it was, so nothing that
// compares timestamps mistakes a half-written dist for a fresh one.
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
// useBookiField's kinds wrap the product's OWN input or select: their markup is
// the product's, so Booki's base rules (buttons, labels, selects, text) must
// never reach inside them. In a pilot they restyled the product's fields and
// made its labels invisible. Every contract name a useBookiField kind uses
// starts with "field-"; the build stops if one is left in the scope.
const PRODUCT_OWNED = /^field-/;
const prefixes = [...new Set([...Object.keys(contract), ...EXTRA])].filter((name) => !PRODUCT_OWNED.test(name)).sort();
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

// Only what a page uses: the tokens and base look, then one file per control.
const base = minify(scoped(PARTS.map(read).join("\n")), "base.css");
const baseGzip = gzipSync(base).length;
// No base rule may reach a useBookiField root, by its own name or by a prefix that matches it.
for (const kind of Object.keys(contract).filter((name) => PRODUCT_OWNED.test(name))) {
  const reaching = prefixes.filter((name) => kind.startsWith(name));
  if (reaching.length > 0 || css.includes(`"${kind}"`) || base.includes(`"${kind}"`)) {
    throw new Error(
      `${kind} wraps the product's own field and must get no Booki base look; reached by: ${reaching.join(", ") || kind}`,
    );
  }
}
if (base.length > BASE_RAW_BUDGET || baseGzip > BASE_GZIP_BUDGET) {
  throw new Error(
    `dist/base.css is over its size budget: ${base.length} B raw (budget ${BASE_RAW_BUDGET}), ${baseGzip} B gzip (budget ${BASE_GZIP_BUDGET})`,
  );
}
const outputs = new Map([
  ["booki.css", css],
  ["base.css", base],
  ...controls.map((control) => [control, minify(scoped(read(control)), control)]),
  // The same rules inside @layer booki, for apps whose own utilities (Tailwind's
  // @layer utilities) should win over Booki's defaults.
  // The order comes first: Tailwind 4's reset (base) below Booki, its utilities above.
  ["layered.css", `@layer theme, base, booki, components, utilities;\n@layer booki {\n${css}\n}\n`],
  // TypeScript checks side-effect imports (TS2882): the CSS has no exports.
  ["css.d.ts", "export {};\n"],
  ["shadcn.css", readFileSync(join(root, "src/shadcn.css"), "utf8")],
]);
rmSync(join(root, "dist"), { recursive: true, force: true });
mkdirSync(join(root, "dist/controls"), { recursive: true });
for (const [file, text] of outputs) writeFileSync(join(root, "dist", file), text);
console.log(
  `Built @booki-aui/styles → dist/booki.css (${Math.round(css.length / 1024)} KB), layered.css, base.css (${(base.length / 1024).toFixed(1)} KB raw, ${(baseGzip / 1024).toFixed(1)} KB gzip), controls/*.css, shadcn.css (${PARTS.join(" + ")} + ${controls.length} controls; ${generic} base rules scoped to ${prefixes.length} components)`,
);
