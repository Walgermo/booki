import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The benchmark's tasks must not be answered by what a control tells an
 * agent. A format hint once read `addLine({ account: "6800", debitMinor:
 * 1550000, vatCode: "1" })`: the voucher task's answer, word for word. Every
 * hint, example and refusal the controls can show is checked here against the
 * accounts, amounts, quantities and names in every task.
 */
const root = path.resolve(__dirname, "../../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

function taskTexts(): string[] {
  const source = read("benchmarks/agent/src/tasks.ts");
  return [...source.matchAll(/text:\s*((?:"(?:[^"\\]|\\.)*"\s*\+?\s*)+)/g)].map((match) =>
    [...match[1]!.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((part) => part[1]).join(""),
  );
}

/** What a task's answer is made of: accounts, amounts in minor units, quantities and names. */
function answers(text: string): string[] {
  const out = new Set<string>();
  for (const [number] of text.matchAll(/\b\d{4}\b/g)) if (!/^20\d\d$/.test(number)) out.add(number);
  for (const [, major, minor] of text.matchAll(/\b(\d{1,3}(?:[  .,]\d{3})*)[,.](\d{2})\b/g)) {
    out.add(`${major!.replace(/\D/g, "")}${minor}`.replace(/^0+(?=\d)/, ""));
  }
  for (const [, whole, part] of text.matchAll(/\b(\d+),(\d)\b/g)) out.add(`${whole}.${part}`);
  for (const [word] of text.matchAll(/\b\p{Lu}\p{Ll}{6,}\b/gu)) out.add(word);
  return [...out];
}

/** Every string literal a control can show an agent: primitives and the message catalogues. */
function shown(): { file: string; text: string }[] {
  const files = [
    ...readdirSync(path.join(root, "packages/primitives/src"))
      .filter((file) => file.endsWith(".ts") && !file.includes(".test."))
      .map((file) => `packages/primitives/src/${file}`),
    "packages/core/src/messages-en.ts",
    "packages/core/src/messages-nb.ts",
  ];
  return files.flatMap((file) =>
    [...read(file).matchAll(/(["'`])((?:\\.|(?!\1).)*)\1/g)].map((match) => ({ file, text: match[2]! })),
  );
}

// Words in a task that are instructions or plain accounting nouns, not part of its answer.
const ORDINARY = new Set(["Registrer", "Kontroller", "Avstem", "Bokfør", "Gjør", "Accounts", "Avskrivning"]);

describe("the controls give no task's answer away", () => {
  it("reads the tasks", () => {
    expect(taskTexts().length).toBeGreaterThanOrEqual(8);
  });

  it("shows no account, amount, quantity or name from a task in a hint, example or refusal", () => {
    const literals = shown();
    const leaks: string[] = [];
    for (const task of taskTexts()) {
      for (const answer of answers(task).filter((word) => !ORDINARY.has(word))) {
        const pattern = new RegExp(`(^|[^\\p{L}\\p{N}.])${answer.replace(".", "\\.")}($|[^\\p{L}\\p{N}])`, "u");
        for (const { file, text } of literals) {
          if (pattern.test(text)) leaks.push(`${answer} in ${file}: ${text.slice(0, 90)}`);
        }
      }
    }
    expect([...new Set(leaks)]).toEqual([]);
  });
});
