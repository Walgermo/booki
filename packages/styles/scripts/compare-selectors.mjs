#!/usr/bin/env node
// Proof that a change to the built CSS (here: the base rules written with CSS
// nesting) keeps every selector, its specificity and its declarations.
//
//   node packages/styles/scripts/compare-selectors.mjs <before-dir> <after-dir>
//
// Method. Each file (base.css, booki.css, controls/*.css) is lowered with
// lightningcss to Chrome 100, which has no native nesting, so nested rules come
// out as flat rules. Every style rule is then read with its @media context, and
// each comma-separated selector becomes one entry. The selector text is what
// lightningcss prints, with whitespace collapsed, so both sides use one printer.
// Specificity is counted here: :where() is 0 including its argument; :is(),
// :not(), :has() take their most specific argument; #id is a; class, attribute
// and pseudo-class are b; type and pseudo-element are c.
// Nothing is rewritten to compare: a selector that changed text shows up in the
// only-before or only-after list. Exit 1 if any key differs, if the specificity
// histogram differs, if the declarations of a key differ, or if the order of
// the rules differs (rules must not be reordered, the cascade depends on it).

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { transform } from "lightningcss";

const TARGETS = { chrome: 100 << 16 };
const LEGACY_PSEUDO_ELEMENTS = ["before", "after", "first-line", "first-letter"];
const SPEC_ARG_PSEUDOS = ["is", "not", "has", "matches", "-webkit-any", "-moz-any"];

const norm = (s) => s.replace(/\s+/g, " ").trim();
const cmp = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
const add = (x, y) => [x[0] + y[0], x[1] + y[1], x[2] + y[2]];
const maxSpec = (list) => list.reduce((m, s) => (cmp(s, m) > 0 ? s : m), [0, 0, 0]);

// Index just past an identifier (escapes skipped).
function identEnd(s, i) {
  let j = i;
  while (j < s.length) {
    const ch = s[j];
    if (ch === "\\") j += 2;
    else if (/[A-Za-z0-9_\-\u0080-￿]/.test(ch)) j++;
    else break;
  }
  return j;
}

// Index of the bracket that closes the ( or [ at i.
function closeIndex(s, i) {
  let depth = 0;
  let q = null;
  for (let j = i; j < s.length; j++) {
    const ch = s[j];
    if (q) {
      if (ch === "\\") j++;
      else if (ch === q) q = null;
      continue;
    }
    if (ch === "\\") j++;
    else if (ch === '"' || ch === "'") q = ch;
    else if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") {
      depth--;
      if (depth === 0) return j;
    }
  }
  throw new Error(`unbalanced brackets in ${s}`);
}

// Index of the brace that closes the { at i.
function braceClose(s, i) {
  let depth = 0;
  let q = null;
  for (let j = i; j < s.length; j++) {
    const ch = s[j];
    if (q) {
      if (ch === "\\") j++;
      else if (ch === q) q = null;
      continue;
    }
    if (ch === "\\") j++;
    else if (ch === '"' || ch === "'") q = ch;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return j;
    }
  }
  throw new Error("unbalanced braces");
}

// Split on sep at the top level (outside brackets and quotes).
function splitTop(s, sep) {
  const out = [];
  let depth = 0;
  let q = null;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      cur += ch;
      if (ch === "\\") cur += s[++i] ?? "";
      else if (ch === q) q = null;
      continue;
    }
    if (ch === '"' || ch === "'") q = ch;
    else if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (ch === sep && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map(norm).filter((x) => x !== "");
}

// Specificity [id, class, type] of one complex selector.
function specificity(sel) {
  let spec = [0, 0, 0];
  let i = 0;
  while (i < sel.length) {
    const ch = sel[i];
    if (ch === "#") {
      i = identEnd(sel, i + 1);
      spec = add(spec, [1, 0, 0]);
    } else if (ch === ".") {
      i = identEnd(sel, i + 1);
      spec = add(spec, [0, 1, 0]);
    } else if (ch === "[") {
      i = closeIndex(sel, i) + 1;
      spec = add(spec, [0, 1, 0]);
    } else if (ch === ":") {
      const pseudoElement = sel[i + 1] === ":";
      const start = i + (pseudoElement ? 2 : 1);
      const end = identEnd(sel, start);
      const name = sel.slice(start, end).toLowerCase();
      let args = null;
      if (sel[end] === "(") {
        const close = closeIndex(sel, end);
        args = sel.slice(end + 1, close);
        i = close + 1;
      } else i = end;
      // :where() adds nothing, its argument included.
      if (name === "where" && !pseudoElement) continue;
      if (pseudoElement || LEGACY_PSEUDO_ELEMENTS.includes(name)) spec = add(spec, [0, 0, 1]);
      else if (SPEC_ARG_PSEUDOS.includes(name)) spec = add(spec, maxSpec(splitTop(args, ",").map(specificity)));
      else spec = add(spec, [0, 1, 0]);
    } else if (/[A-Za-z_\-\\\u0080-￿]/.test(ch)) {
      i = identEnd(sel, i);
      spec = add(spec, [0, 0, 1]);
    } else i++; // *, combinators, whitespace
  }
  return spec;
}

// Walk the lowered (flat) CSS. Each rule goes into `out` in source order.
function parse(css, context, out) {
  let i = 0;
  while (i < css.length) {
    let j = i;
    let q = null;
    let depth = 0;
    while (j < css.length) {
      const ch = css[j];
      if (q) {
        if (ch === "\\") j++;
        else if (ch === q) q = null;
      } else if (ch === "\\") j++;
      else if (ch === '"' || ch === "'") q = ch;
      else if (ch === "(" || ch === "[") depth++;
      else if (ch === ")" || ch === "]") depth--;
      else if (depth === 0 && (ch === "{" || ch === ";")) break;
      j++;
    }
    if (j >= css.length) break;
    const prelude = norm(css.slice(i, j));
    if (css[j] === ";") {
      i = j + 1;
      continue;
    }
    const close = braceClose(css, j);
    const body = css.slice(j + 1, close);
    if (prelude.startsWith("@")) {
      const name = prelude.match(/^@([\w-]+)/)[1].toLowerCase();
      if (["media", "supports", "layer", "container"].includes(name)) {
        parse(body, context ? `${context} | ${prelude}` : prelude, out);
      }
      // Other at-rules (@font-face, @keyframes, @property) hold no selectors to compare.
    } else {
      for (const sel of splitTop(prelude, ",")) out.push({ media: context, sel, decl: norm(body) });
    }
    i = close + 1;
  }
  return out;
}

function lowerAndParse(path) {
  const code = readFileSync(path, "utf8");
  const { code: flat } = transform({ filename: path, code: Buffer.from(code), minify: false, targets: TARGETS });
  return parse(flat.toString(), "", []);
}

function cssFiles(dir) {
  const files = ["base.css", "booki.css"].filter((f) => existsSync(join(dir, f)));
  const controls = join(dir, "controls");
  if (existsSync(controls)) {
    for (const f of readdirSync(controls)
      .filter((f) => f.endsWith(".css"))
      .sort())
      files.push(`controls/${f}`);
  }
  return files;
}

const [beforeDir, afterDir] = process.argv.slice(2);
if (!beforeDir || !afterDir) {
  console.error("usage: node compare-selectors.mjs <before-dir> <after-dir>");
  process.exit(2);
}

let failed = false;
const fail = (msg) => {
  failed = true;
  console.log(`  FAIL: ${msg}`);
};
const list = (items) => (items.length ? items.map((x) => `      ${x}`).join("\n") : "      (none)");
const specText = (s) => `[${s.join(",")}]`;
const key = (r) => (r.media ? `${r.media} { ${r.sel}` : r.sel);

const names = [...new Set([...cssFiles(beforeDir), ...cssFiles(afterDir)])].sort();
let totalBefore = 0;
let totalAfter = 0;
for (const name of names) {
  console.log(`\n${name}`);
  const pBefore = join(beforeDir, name);
  const pAfter = join(afterDir, name);
  if (!existsSync(pBefore) || !existsSync(pAfter)) {
    fail(`${name} is missing in ${existsSync(pBefore) ? "after" : "before"} dir`);
    continue;
  }
  const before = lowerAndParse(pBefore);
  const after = lowerAndParse(pAfter);
  totalBefore += before.length;
  totalAfter += after.length;
  const specOf = (rows) => rows.map((r) => specificity(r.sel));
  const maxOf = (rows) => specOf(rows).reduce((m, s) => (cmp(s, m) > 0 ? s : m), [0, 0, 0]);
  console.log(`  selectors: before ${before.length}, after ${after.length}`);
  console.log(`  max specificity: before ${specText(maxOf(before))}, after ${specText(maxOf(after))}`);

  // (media, selector) keys with their declarations, in source order.
  const pairs = (rows) => {
    const m = new Map();
    for (const r of rows) {
      const k = key(r);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r.decl);
    }
    return m;
  };
  const pb = pairs(before);
  const pa = pairs(after);
  const onlyBefore = [...pb.keys()].filter((k) => !pa.has(k));
  const onlyAfter = [...pa.keys()].filter((k) => !pb.has(k));
  console.log("  only in before:");
  console.log(list(onlyBefore));
  console.log("  only in after:");
  console.log(list(onlyAfter));
  if (onlyBefore.length || onlyAfter.length) {
    fail(`${onlyBefore.length} pair(s) only before, ${onlyAfter.length} only after`);
  }

  const declDiffs = [...pb.keys()].filter((k) => pa.has(k) && pb.get(k).join("\u0001") !== pa.get(k).join("\u0001"));
  console.log(`  declaration differences: ${declDiffs.length}`);
  if (declDiffs.length) {
    console.log(list(declDiffs));
    fail("declarations differ for some pair");
  }

  const histogram = (rows) => {
    const h = new Map();
    for (const s of specOf(rows)) h.set(specText(s), (h.get(specText(s)) ?? 0) + 1);
    return JSON.stringify([...h.entries()].sort());
  };
  const histEqual = histogram(before) === histogram(after);
  console.log(`  specificity histogram equal: ${histEqual}`);
  if (!histEqual) fail("specificity histogram differs");

  const seq = (rows) => rows.map((r) => `${key(r)} => ${r.decl}`);
  const sb = seq(before);
  const sa = seq(after);
  const firstDiff = sb.findIndex((x, idx) => x !== sa[idx]);
  const sameOrder = sb.length === sa.length && firstDiff === -1;
  console.log(`  rule order identical: ${sameOrder}${sameOrder ? "" : ` (first difference at rule ${firstDiff + 1})`}`);
  if (!sameOrder) fail("rule order differs");
}

console.log(`\nTotal selectors: before ${totalBefore}, after ${totalAfter}`);
console.log(failed ? "RESULT: FAIL" : "RESULT: PASS (selectors, specificity and declarations unchanged)");
process.exit(failed ? 1 : 0);
