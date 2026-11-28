/**
 * Invariants of the agent bridge rules (AGENTS.md) that the primitives rely on.
 * `docs/invariants.md` has the argument for each.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isPersonOnly, personOnly } from "./person-only.js";

const SRC = path.dirname(new URL(import.meta.url).pathname);

/** Every name in a primitive's `agent: { actions: [...] }`, by file. */
function agentActions(): { file: string; action: string }[] {
  return readdirSync(SRC)
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .flatMap((file) => {
      const text = readFileSync(path.join(SRC, file), "utf8");
      return [...text.matchAll(/agent:\s*\{\s*actions:\s*\[([^\]]*)\]/g)].flatMap((block) =>
        [...block[1]!.matchAll(/"([^"]+)"/g)].map((name) => ({ file, action: name[1]! })),
      );
    });
}

describe("person-only decisions in the page", () => {
  it("I17 a registered sentence is found among the others a step joins with '; ', even when it holds '; ' itself", () => {
    // Counterexample before the fix: splitting on "; " broke this sentence in two, and neither half matched.
    const sentence = personOnly("Signing off locks the paper; a person signs");
    const other = "Post the voucher";
    for (const joined of [
      sentence,
      `${other}; ${sentence}`,
      `${sentence}; ${other}`,
      `${other}; ${sentence}; Pay the batch`,
    ]) {
      expect(isPersonOnly(joined), joined).toBe(true);
    }
    expect(isPersonOnly(other)).toBe(false);
    expect(isPersonOnly("Signing off locks the paper")).toBe(false);
    expect(isPersonOnly(`x${sentence}`)).toBe(false);
  });

  it("I17 a sentence is registered as the bridge will send it: trimmed and cut at 200 characters", () => {
    const long = `  ${"Releasing needs a person. ".repeat(10)}  `;
    personOnly(long);
    expect(isPersonOnly(long.trim().slice(0, 200))).toBe(true);
    expect(isPersonOnly(`Post the voucher; ${long.trim().slice(0, 200)}`)).toBe(true);
  });

  it("I18 no agent action approves, signs, finalizes, releases, submits or decides", () => {
    const actions = agentActions();
    expect(actions.length).toBeGreaterThan(100);
    // assert… and propose… only check or prepare: the decision stays a person's button.
    const deciding =
      /^(approve|reject|escalate|sign|finali[sz]e|release|submit|decide|confirm(?!Field)|conclude|freeze)/i;
    // The one exception, by design: the company's own rule (code the app owns) approves, and the
    // record names `rule:<name>`, not the agent. It is refused without that rule.
    const allowed = new Set(["supplier-invoice-inbox.ts:approveUnderRule"]);
    const found = actions
      .filter(({ action }) => deciding.test(action))
      .map(({ file, action }) => `${file}:${action}`)
      .filter((name) => !allowed.has(name));
    expect(found).toEqual([]);
  });
});
