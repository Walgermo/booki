import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// One stylesheet out, built from the parts in src/ in this order.
const PARTS = ["booki.css", "agent.css"];

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, "dist"), { recursive: true });
// Then one file per control in src/controls, in name order.
const controls = readdirSync(join(root, "src/controls"))
  .filter((file) => file.endsWith(".css"))
  .sort()
  .map((file) => `controls/${file}`);
let css = [...PARTS, ...controls].map((part) => readFileSync(join(root, "src", part), "utf8")).join("\n");

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
css = css
  .replaceAll(":where([data-slot])", `:where(${scope})`)
  .replaceAll(":where([data-slot] ", `:where(:is(${scope}) `);
if (/:where\(\[data-slot\][ )]/.test(css)) throw new Error("an unscoped :where([data-slot]) is left in the build");

writeFileSync(join(root, "dist/booki.css"), css);
// The same rules inside @layer booki, for apps whose own utilities (Tailwind's
// @layer utilities) should win over Booki's defaults.
// The order comes first: Tailwind 4's reset (base) below Booki, its utilities above.
writeFileSync(
  join(root, "dist/layered.css"),
  `@layer theme, base, booki, components, utilities;\n@layer booki {\n${css}\n}\n`,
);
writeFileSync(join(root, "dist/shadcn.css"), readFileSync(join(root, "src/shadcn.css"), "utf8"));
console.log(
  `Built @booki/styles → dist/booki.css, layered.css, shadcn.css (${PARTS.join(" + ")} + ${controls.length} controls; ${generic} base rules scoped to ${prefixes.length} components)`,
);
