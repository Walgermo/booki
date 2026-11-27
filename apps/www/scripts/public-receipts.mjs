import { readFile, writeFile } from "node:fs/promises";

const dir = new URL("../src/data/", import.meta.url);
const read = async (name) => JSON.parse(await readFile(new URL(name, dir), "utf8"));
const [scripts, models, documents] = await Promise.all([
  read("public-browser-pairs.json"),
  read("public-browser-models.json"),
  read("public-documents.json"),
]);
const summary = {
  observedOn: scripts.observedOn,
  scripts: scripts.pairs.map(({ id, arms }) => ({
    id,
    pages: Object.entries(documents.routes[id].scenes).map(([state, scene], i) => ({
      state,
      url: scene.url,
      elements: scene.coverage.capturedElements,
      sourceElements: scene.coverage.sourceElements,
      visibleText: arms.find((arm) => arm.side === "booki").coverage[i].textNodes,
      controls: arms.find((arm) => arm.side === "booki").coverage[i].controls,
    })),

    arms: arms.map(({ side, path, toolCalls, actions, calls, verification, coverage }) => ({
      side,
      path,
      toolCalls,
      actions,
      passed: verification.ok,
      replyBytes: calls.reduce((total, call) => total + Buffer.byteLength(call.output, "utf8"), 0),
      scenes: coverage?.length ?? 0,
    })),
  })),
  models: models.pairs.map(({ id, prompt, arms }) => ({
    id,
    prompt,
    arms: arms.map(({ side, toolCalls, usage, answer, verification }) => ({
      side,
      toolCalls,
      usage,
      answer,
      passed: verification.ok,
    })),
  })),
};
const target = new URL("public-browser-summary.json", dir);
const output = JSON.stringify(summary, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (JSON.stringify(await read("public-browser-summary.json")) !== JSON.stringify(summary)) {
    throw new Error("Refresh the public browser summaries with node apps/www/scripts/public-receipts.mjs");
  }
} else await writeFile(target, output);
