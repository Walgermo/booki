/**
 * Side by side: one task on a live public Norwegian page with browser tools
 * and on the same calculator rebuilt on Booki with the bridge, both at once.
 * Every tool call is recorded with its time and a screenshot of the page
 * after it, so compare/viewer.html can replay the two runs next to each other
 * in real time. Internal only.
 *
 *   ANTHROPIC_API_KEY=… pnpm --filter agent-benchmark compare --task tax
 *   pnpm --filter agent-benchmark compare --task price --scripted   # no model, no key
 *
 * Writes results/compare-<task>-<time>.json and a self-contained
 * results/compare-<task>-<time>.html to open in a browser.
 *
 * Screenshots are the harness's, never the model's: their time is taken out
 * of every clock, so they cost neither side anything.
 */
import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { chromium, type Browser } from "playwright-core";

import { COMPARE_TASKS, type CompareSide, type CompareTask } from "./compare-tasks.js";
import { runLoop, type Effort } from "./loop.js";
import { costUsd, priceFor } from "./pricing.js";
import { recorder } from "./scripted.js";
import { openSession, type Session } from "./session.js";
import { startSite, type Site } from "./site.js";
import { SYSTEM_PROMPT } from "./tasks.js";

const here = path.dirname(fileURLToPath(import.meta.url));

const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: {
    task: { type: "string", default: "tax" },
    model: { type: "string", default: "claude-opus-5-5" },
    effort: { type: "string", default: "medium" },
    "max-steps": { type: "string", default: "30" },
    url: { type: "string" },
    "skip-build": { type: "boolean", default: false },
    scripted: { type: "boolean", default: false },
    headed: { type: "boolean", default: false },
  },
});

const taskIds = values.task === "all" ? (Object.keys(COMPARE_TASKS) as CompareTask["id"][]) : [values.task];
for (const id of taskIds) {
  if (!(id in COMPARE_TASKS)) throw new Error(`No task "${id}". Use ${Object.keys(COMPARE_TASKS).join(", ")} or all.`);
}
if (!values.scripted && !process.env.ANTHROPIC_API_KEY) {
  console.error("Set ANTHROPIC_API_KEY to run a model, or pass --scripted for a run without one.");
  process.exit(2);
}
const model = values.model;
const effort = values.effort === "none" ? null : (values.effort as Effort);
const prices = priceFor(model) ?? null;

/** One moment of a run: a model request or a tool call, with the page after it. */
type Frame = {
  /** Milliseconds from the start of the side's run, screenshots taken out. */
  t: number;
  kind: "start" | "request" | "tool" | "end";
  tool?: string;
  input?: unknown;
  isError?: boolean;
  /** Characters of the tool result the model got. */
  outputChars?: number;
  /** Totals so far. */
  requests: number;
  tools: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  /** JPEG, base64, when the page changed hands. */
  shot?: string | null;
};

type SideResult = {
  label: string;
  tools: CompareSide["tools"];
  url: string;
  answer: string;
  ok: boolean;
  checks: Record<string, boolean>;
  wallMs: number;
  requests: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  ended: string;
  error?: string;
  frames: Frame[];
};

async function runSide(task: CompareTask, side: CompareSide, origin: string, browser: Browser): Promise<SideResult> {
  const url = side.url.startsWith("http") ? side.url : new URL(side.url, origin).href;
  const session = await openSession({
    kind: side.tools === "browser" ? "mcp" : "bridge",
    url,
    ready: side.ready,
    browser,
    headed: values.headed,
    origins: side.origins,
  });

  const frames: Frame[] = [];
  let shotMs = 0;
  const started = performance.now();
  const clock = () => performance.now() - started - shotMs;
  const totals = { requests: 0, tools: 0, inputTokens: 0, outputTokens: 0, cacheRead: 0, cacheWrite: 0 };
  // No model, no cost: a scripted run shows "–", not $0.
  const cost = () =>
    prices && !values.scripted
      ? costUsd(
          {
            input_tokens: totals.inputTokens,
            output_tokens: totals.outputTokens,
            cache_read_input_tokens: totals.cacheRead,
            cache_creation_input_tokens: totals.cacheWrite,
          },
          prices,
        )
      : null;
  const shoot = async () => {
    const before = performance.now();
    const shot = await session.screenshot();
    shotMs += performance.now() - before;
    return shot;
  };
  const push = async (
    frame: Omit<Frame, "t" | keyof typeof totals | "costUsd" | "inputTokens" | "outputTokens"> & { shoot?: boolean },
  ) => {
    const t = clock();
    const { shoot: wantShot, ...rest } = frame;
    frames.push({
      t,
      ...rest,
      requests: totals.requests,
      tools: totals.tools,
      inputTokens: totals.inputTokens + totals.cacheRead + totals.cacheWrite,
      outputTokens: totals.outputTokens,
      costUsd: cost(),
      ...(wantShot ? { shot: await shoot() } : {}),
    });
  };

  // Every tool call goes through here: counted, timed, then the page as it is after it.
  const watched: Session = {
    ...session,
    run: async (name, input) => {
      const outcome = await session.run(name, input);
      totals.tools += 1;
      await push({
        kind: "tool",
        tool: name,
        input,
        isError: outcome.isError,
        outputChars: outcome.content.length,
        shoot: true,
      });
      return outcome;
    },
  };

  await push({ kind: "start", shoot: true });
  let answer = "";
  let ended = "end_turn";
  let error: string | undefined;
  try {
    if (values.scripted) {
      answer = await side.script(recorder(watched));
    } else {
      const real = new Anthropic();
      // The same client, with each request's usage counted as it comes back.
      const client = {
        messages: {
          create: async (body: Anthropic.MessageCreateParamsNonStreaming) => {
            const response = await real.messages.create(body);
            totals.requests += 1;
            totals.inputTokens += response.usage.input_tokens;
            totals.outputTokens += response.usage.output_tokens;
            totals.cacheRead += response.usage.cache_read_input_tokens ?? 0;
            totals.cacheWrite += response.usage.cache_creation_input_tokens ?? 0;
            await push({ kind: "request" });
            return response;
          },
        },
      } as unknown as Anthropic;
      const loop = await runLoop({
        client,
        model,
        effort,
        maxSteps: Number(values["max-steps"]),
        system: SYSTEM_PROMPT,
        task: task.text,
        session: watched,
      });
      answer = loop.finalText;
      ended = loop.ended;
      error = loop.error;
    }
  } catch (caught) {
    ended = "error";
    error = caught instanceof Error ? caught.message : String(caught);
  } finally {
    await push({ kind: "end", shoot: true });
    await session.close();
  }
  const verification = task.verify(answer);
  const last = frames.at(-1)!;
  return {
    label: side.label,
    tools: side.tools,
    url,
    answer,
    ok: ended === "end_turn" && verification.ok,
    checks: verification.checks,
    wallMs: last.t,
    requests: last.requests,
    toolCalls: last.tools,
    inputTokens: last.inputTokens,
    outputTokens: last.outputTokens,
    costUsd: last.costUsd,
    ended,
    ...(error ? { error } : {}),
    frames,
  };
}

let site: Site | null = null;
let browser: Browser | null = null;
try {
  const origin = values.url ?? (site = await startSite({ build: !values["skip-build"] })).url;
  browser = await chromium.launch({ channel: "chrome", headless: !values.headed });
  const outDir = path.resolve(here, "../results");
  mkdirSync(outDir, { recursive: true });
  const viewer = readFileSync(path.resolve(here, "../compare/viewer.html"), "utf8");

  for (const id of taskIds) {
    const task = COMPARE_TASKS[id as CompareTask["id"]];
    console.log(`${task.title}: ${values.scripted ? "scripted agent" : `${model}, effort ${effort ?? "(not sent)"}`}`);
    // Both at once, as the replay shows them.
    const [live, booki] = await Promise.all([
      runSide(task, task.live, origin, browser),
      runSide(task, task.booki, origin, browser),
    ]);
    for (const side of [live, booki]) {
      console.log(
        `  ${side.label}: ${side.ok ? "right" : "WRONG"} · ${side.toolCalls} tool calls · ${side.requests} requests · ` +
          `${side.inputTokens + side.outputTokens} tokens · ${(side.wallMs / 1000).toFixed(1)} s` +
          `${side.costUsd !== null ? ` · $${side.costUsd.toFixed(4)}` : ""}${side.error ? ` · ${side.error}` : ""}`,
      );
      console.log(`    answer: ${side.answer}`);
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const record = {
      task: { id: task.id, title: task.title, text: task.text },
      mode: values.scripted ? "scripted" : "model",
      model: values.scripted ? null : model,
      effort,
      at: new Date().toISOString(),
      live,
      booki,
    };
    const base = path.join(outDir, `compare-${task.id}-${stamp}`);
    writeFileSync(`${base}.json`, JSON.stringify(record));
    // The data goes in as JSON inside a script tag; "</" is escaped so it cannot close the tag.
    writeFileSync(
      `${base}.html`,
      viewer.replace("/*COMPARE_DATA*/null", JSON.stringify(record).replace(/<\//g, "<\\/")),
    );
    console.log(`  → ${path.relative(process.cwd(), base)}.html`);
  }
} finally {
  await browser?.close();
  await site?.stop();
}
