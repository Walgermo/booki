import assert from "node:assert/strict";
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";
import {
  expectedPublicState,
  publicChecks,
  publicTasks,
  readPublicState,
  type PublicSide,
  type PublicState,
  type PublicTask,
} from "../../../apps/www/src/lib/public-browser-run.js";
import { openSession, type Session } from "./session.js";
import { readPublicAnswer, verifyPublicAnswer } from "./public-questions.js";
import { recorder, refIn } from "./scripted.js";
import {
  auditBridgeSurface,
  auditSurfaceParity,
  readRenderedSurface,
  normalizeSurface,
  type BridgeEntry,
  type Surface,
} from "./public-coverage.js";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: { url: { type: "string", default: "http://127.0.0.1:5183" } },
});
const origin = new URL(values.url).origin;

const stateExpression = `(${readPublicState.toString()})(document)`;

// tsx keeps local function names by injecting __name. Its DOM mirror runs in Chrome.
const surfaceExpression = `(() => { const __name = (value) => value; return (${readRenderedSurface.toString()})(document); })()`;

function escapePattern(text: string) {
  return text.replace(/[.*+?^$}{()|[\]\\]/g, "\\$&");
}

const actionTools = new Set(["browser_click", "act"]);
const scenes: Record<PublicTask, string[]> = {
  nav: ["homeConsent", "home", "guidance", "guidanceExpanded"],
  posten: ["homeConsent", "home", "guidance"],
  brreg: ["home", "guidance"],
};

async function waitForScene(session: Session, expected: string) {
  const expression = `document.querySelector("[data-public-document]")?.getAttribute("data-public-document")`;
  const until = Date.now() + 12_000;
  while (Date.now() < until) {
    if ((await session.evaluate<string>(expression)) === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`Document fixture did not render scene "${expected}"`);
}

async function auditBooki(session: Session, surface: Surface, snapshot: ReturnType<typeof recorder>["calls"][number]) {
  const audit = recorder(session);
  const current = () => auditBridgeSurface(surface, [snapshot, ...audit.calls]);
  let coverage = current();
  if (coverage.missingText.length) {
    await audit.call("query", { kind: "public-document-section" });
    coverage = current();
  }
  if (coverage.missingText.length) {
    const missing = new Set(coverage.missingText);
    const relevant = surface.textSections.filter(
      (label, index) => label && missing.has(normalizeSurface(surface.text[index]!)),
    );
    for (const label of new Set(relevant)) {
      if (label) await audit.call("query", { kind: "public-document-section", text: label });
    }
    coverage = current();
  }
  if (coverage.missingControls.length) {
    for (const kind of ["button", "input", "checkbox", "select"]) await audit.call("query", { kind });
    coverage = current();
  }
  if (coverage.missingControls.length) {
    for (const label of new Set(coverage.missingControls.map(({ name }) => name))) {
      if (label) await audit.call("query", { text: label });
    }
    coverage = current();
  }
  return { ...coverage, auditQueries: audit.calls.length };
}

async function replay(session: Session, task: PublicTask, side: PublicSide, path: string) {
  const rec = recorder(session);
  const before = await session.evaluate<PublicState>(stateExpression);
  assert.deepEqual(before, expectedPublicState(task, false));

  const surfaces: Surface[] = [];
  const coverage: Awaited<ReturnType<typeof auditBooki>>[] = [];
  const snap = async () => {
    await waitForScene(session, scenes[task][surfaces.length]!);
    const output = await rec.call(side === "browser" ? "browser_snapshot" : "snapshot");
    const surface = await session.evaluate<Surface>(surfaceExpression);
    surfaces.push(surface);
    if (side === "booki") coverage.push(await auditBooki(session, surface, rec.calls.at(-1)!));
    return output;
  };

  for (const label of publicTasks[task].steps) {
    const snapshot = await snap();
    if (side === "browser") {
      const pattern = new RegExp(`(?:button|link|summary) "${escapePattern(label)}"[^\\n]*?\\[ref=`);
      const target = refIn(snapshot, pattern);
      await rec.call("browser_click", { target, element: label });
    } else {
      const entryFrom = (value: string) =>
        (JSON.parse(value) as BridgeEntry[]).find((item) => item.label === label && item.actions?.includes("press"));
      const entry = entryFrom(snapshot) ?? entryFrom(await rec.call("query", { text: label }));
      assert.ok(entry, `Booki did not expose a press action for "${label}"`);
      const result = JSON.parse(await rec.call("act", { steps: [{ ref: entry.ref, action: "press" }] })) as {
        ok: boolean;
      };
      assert.ok(result.ok, `Booki did not press "${label}"`);
    }
  }
  const finalToolOutput = await snap();

  const after = await session.evaluate<PublicState>(stateExpression);
  let answer = readPublicAnswer(task, finalToolOutput, side);
  if (side === "booki" && Object.values(answer).some((value) => value === null)) {
    const reading = await rec.call(
      "query",
      task === "nav" ? { kind: "public-document-section", text: "Dagpenger" } : { kind: "public-document-section" },
    );
    answer = readPublicAnswer(task, reading, side);
  }
  const checks = [
    ...publicChecks(after, expectedPublicState(task, true)),
    ...verifyPublicAnswer(task, JSON.stringify(answer)),
  ];
  const actions = rec.calls.filter(({ tool }) => actionTools.has(tool)).length;
  return {
    side,
    path,
    toolCalls: rec.calls.length,
    actions,
    answer,
    calls: rec.calls,
    verification: { ok: false, checks },
    surfaces,
    coverage,
  };
}

const browser = await chromium.launch({ channel: "chrome" });
try {
  const pairs = [];
  let browserTool: string | undefined;
  for (const task of Object.keys(publicTasks) as PublicTask[]) {
    const arms = [];
    for (const side of ["browser", "booki"] as const) {
      const path = `/bench/public/${task}/${side}`;
      const session = await openSession({
        kind: side === "browser" ? "mcp" : "bridge",
        url: origin + path,
        ready: `document.querySelector('[data-public-fixture="${task}"]')`,
        browser,
        headed: false,
      });
      if (session.server) browserTool = session.server;
      try {
        arms.push(await replay(session, task, side, path));
      } finally {
        await session.close();
      }
    }
    const [browserSide, bookiSide] = arms;
    assert.ok(browserSide && bookiSide);
    const parity = browserSide.surfaces.map((surface, scene) =>
      auditSurfaceParity(surface, bookiSide.surfaces[scene]!),
    );
    const parityChecks = parity.map(({ textMatches, controlsMatch }, scene) => ({
      name: `scene.${scene}.sameRenderedSurface`,
      ok: textMatches && controlsMatch,
      actual: `text ${textMatches ? "same" : "different"}; controls ${controlsMatch ? "same" : "different"}`,
      expected: "text same; controls same",
    }));
    const bookiCoverageChecks = bookiSide.coverage.map(({ missingText, missingControls }, scene) => ({
      name: `scene.${scene}.bridgeCoverage`,
      ok: missingText.length === 0 && missingControls.length === 0,
      actual: missingText.length + missingControls.length,
      expected: 0,
    }));
    pairs.push({
      id: task,
      parity,
      arms: arms.map(({ surfaces, coverage, ...arm }) => {
        const checks = [
          ...arm.verification.checks,
          ...parityChecks,
          ...(arm.side === "booki" ? bookiCoverageChecks : []),
        ];
        return {
          ...arm,
          coverage: coverage.length
            ? coverage
            : surfaces.map(({ text, controls }) => ({ textNodes: text.length, controls: controls.length })),
          verification: { ok: checks.every(({ ok }) => ok), checks },
        };
      }),
    });
  }
  console.log(
    JSON.stringify(
      {
        observedOn: new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo" }).format(new Date()),
        browser: `Google Chrome ${browser.version()}`,
        mode: "scripted",
        protocol: "full-document-v2",
        modelUsage: null,
        browserTool,
        pairs,
      },
      null,
      2,
    ),
  );
  if (pairs.some(({ arms }) => arms.some(({ verification }) => !verification.ok))) process.exitCode = 1;
} finally {
  await browser.close();
}
