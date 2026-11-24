import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { PERSON_ONLY_PERMISSIONS } from "../src/conformance/permissions.js";

const spec = readFileSync(path.resolve(import.meta.dirname, "../../../spec/agent-contract.md"), "utf8");

// The permission table sits in section 5 ("What stays with a person"), between the
// headings for sections 5 and 6.
function specPermissions(): string[] {
  const lines = spec.split("\n");
  const start = lines.findIndex((line) => line.startsWith("## 5. "));
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## 6. "));
  return lines
    .slice(start, end)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("| `"))
    .map((line) => /^\| `([^`]+)`/.exec(line)?.[1] ?? "")
    .filter((permission) => permission !== "");
}

describe("person-only permissions", () => {
  it("match the table in spec/agent-contract.md section 5", () => {
    const fromSpec = specPermissions();
    expect(fromSpec).toHaveLength(22);
    expect([...PERSON_ONLY_PERMISSIONS].sort()).toEqual([...fromSpec].sort());
  });
});
