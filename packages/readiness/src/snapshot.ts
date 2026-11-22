/**
 * Reading Playwright's AI-mode accessibility snapshot: the same text a
 * browser agent (Playwright MCP, browser tools) gets for the page.
 */

export type SnapshotNode = {
  role: string;
  /** Accessible name; "" when the element has none. */
  name: string;
  ref: string | null;
  /** Index of the line in the snapshot. */
  line: number;
  /** Attributes in brackets, e.g. ["checked", "disabled", "level=2"]. */
  flags: string[];
  /** Text after the colon on the same line (a textbox's value, a cell's text). */
  value: string;
};

const LINE = /^(\s*)- (.*)$/;

function unquoteYaml(text: string): string {
  const t = text.trim();
  if (t.startsWith("'") && t.endsWith("'")) return t.slice(1, -1).replace(/''/g, "'");
  if (t.startsWith('"') && t.endsWith('"')) {
    try {
      return JSON.parse(t) as string;
    } catch {
      return t.slice(1, -1);
    }
  }
  return t;
}

/** Splits `key: value` at the first colon outside quotes. */
function splitKeyValue(text: string): [string, string] {
  let quote: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quote) {
      if (ch === "\\" && quote === '"') i++;
      else if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ":" && (i === text.length - 1 || text[i + 1] === " ")) {
      return [text.slice(0, i), text.slice(i + 1).trim()];
    }
  }
  return [text, ""];
}

export function parseSnapshot(snapshot: string): SnapshotNode[] {
  const nodes: SnapshotNode[] = [];
  snapshot.split("\n").forEach((raw, line) => {
    const match = LINE.exec(raw);
    if (!match) return;
    const [keyRaw, valueRaw] = splitKeyValue(match[2]!);
    const key = unquoteYaml(keyRaw);
    const head = /^([a-z][a-z-]*)(?: "((?:[^"\\]|\\.)*)")?((?: \[[^\]]*\])*)\s*$/.exec(key);
    if (!head) return;
    const role = head[1]!;
    if (role === "text" || role === "/url") return;
    let name = "";
    if (head[2] !== undefined) {
      try {
        name = JSON.parse(`"${head[2]}"`) as string;
      } catch {
        name = head[2];
      }
    }
    const flags = [...(head[3] ?? "").matchAll(/\[([^\]]*)\]/g)].map((m) => m[1]!);
    const refFlag = flags.find((flag) => flag.startsWith("ref="));
    nodes.push({
      role,
      name,
      ref: refFlag ? refFlag.slice(4) : null,
      line,
      flags: flags.filter((flag) => !flag.startsWith("ref=")),
      value: unquoteYaml(valueRaw),
    });
  });
  return nodes;
}

/** The cost indicator: characters ÷ 4, the usual rough token count. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
