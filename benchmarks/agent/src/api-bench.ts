/**
 * One bookkeeping task, done by a model through the bookkeeping API's tools
 * (src/api) and nothing else: no page, no browser, no bridge. The same system
 * prompt, task text, loop, step cap, prompt caching and pricing as `bench`,
 * so the result sits beside the screens and Booki as one more side ("api").
 *
 *   pnpm --filter agent-benchmark proof --side api [--task supplier-invoice] [--model …]
 *   ANTHROPIC_API_KEY=… npx tsx src/api-bench.ts --task supplier-invoice [--runs 5] [--model …]
 *
 * Every run gets a fresh BookkeepingApi, so runs start from the same books.
 * Results land in results/api-<task>-<time>.json, in the shape of a bench file.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import Anthropic from "@anthropic-ai/sdk";

import { BookkeepingApi } from "./api/ledger.js";
import { createApiToolSet } from "./api/tools.js";
import { API_TASKS } from "./api-tasks.js";
import { apiCounter, countToolDefinitions } from "./count.js";
import { FatalApiError, runLoop, type Effort } from "./loop.js";
import { costUsd, priceFor } from "./pricing.js";
import type { Session } from "./session.js";
import { parsePrices, report, summarise, type RunRecord } from "./summary.js";
import { SYSTEM_PROMPT, TASKS, type TaskId } from "./tasks.js";
import type { Verification } from "./verify.js";

const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
const here = path.dirname(fileURLToPath(import.meta.url));

/** The API's tools as a session for the loop. There is no page to evaluate. */
function apiSession(api: BookkeepingApi): Session {
  const toolSet = createApiToolSet(api);
  return {
    kind: "api",
    tools: toolSet.tools,
    run: async (name, input) => toolSet.run(name, input),
    evaluate: async () => {
      throw new Error("The API side has no page.");
    },
    close: async () => {},
    screenshot: async () => null,
  };
}

function gitCommit(): { commit: string | null; dirty: boolean | null } {
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: here, encoding: "utf8" });
  const status = spawnSync("git", ["status", "--porcelain"], { cwd: here, encoding: "utf8" });
  return {
    commit: head.status === 0 ? head.stdout.trim() : null,
    dirty: status.status === 0 ? status.stdout.trim().length > 0 : null,
  };
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== "--"),
    options: {
      task: { type: "string", default: "supplier-invoice" },
      model: { type: "string", default: "claude-opus-5-5" },
      runs: { type: "string", default: "5" },
      effort: { type: "string", default: "medium" },
      "max-steps": { type: "string" },
      prices: { type: "string" },
    },
  });

  const taskId = values.task as TaskId;
  const apiTask = API_TASKS[taskId];
  if (!apiTask) {
    throw new Error(`--task is one of ${Object.keys(API_TASKS).join(", ")} on the API side. Got "${values.task}".`);
  }
  const task = TASKS[taskId];
  const model = values.model;
  const runs = Number.parseInt(values.runs, 10);
  const maxSteps = values["max-steps"] ? Number.parseInt(values["max-steps"], 10) : (task.maxSteps ?? 30);
  if (!(runs >= 1) || !(maxSteps >= 1)) throw new Error("--runs and --max-steps take a whole number of 1 or more.");
  if (values.effort !== "none" && !EFFORTS.includes(values.effort as Effort)) {
    throw new Error(`--effort is one of ${EFFORTS.join(", ")} or none. Got "${values.effort}".`);
  }
  const effort = values.effort === "none" ? null : (values.effort as Effort);
  const prices = values.prices ? parsePrices(values.prices) : (priceFor(model) ?? null);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set. Run it through `pnpm --filter agent-benchmark proof --side api`.");
    return 1;
  }

  const client = new Anthropic();
  const definitionTokens = await countToolDefinitions(
    apiCounter(client, model, SYSTEM_PROMPT),
    task.text,
    apiSession(new BookkeepingApi()).tools,
  ).catch(() => null);
  if (!prices) console.log(`No list price known for "${model}": cost is reported as n/a. Pass --prices to set one.`);
  console.log(`Task ${task.id} (API), model ${model}, effort ${effort ?? "(not sent)"}, ${runs} run(s)\n`);

  const records: RunRecord[] = [];
  for (let run = 1; run <= runs; run += 1) {
    const api = new BookkeepingApi();
    const session = apiSession(api);
    const loop = await runLoop({ client, model, effort, maxSteps, system: SYSTEM_PROMPT, task: task.text, session });
    let verification: Verification | null = null;
    let verificationError: string | undefined;
    try {
      verification = await apiTask.verify(api.state(), loop.finalText);
    } catch (error) {
      verificationError = error instanceof Error ? error.message : String(error);
    }
    const posted = verification?.posted ?? false;
    const record: RunRecord = {
      task: task.id,
      page: apiTask.page,
      run,
      success: loop.ended === "end_turn" && verification?.ok === true,
      posted,
      // The API has no step it refuses: a write goes through or is rejected for its input.
      step: posted ? "done" : "not_attempted",
      verification,
      ...(verificationError ? { verificationError } : {}),
      costUsd: costUsd(loop.usage, prices),
      codeToolCalls: 0,
      ...loop,
    };
    records.push(record);
    const wrong = verification
      ? Object.entries(verification.checks)
          .filter(([, ok]) => !ok)
          .map(([name]) => name)
      : [`could not be checked: ${verificationError}`];
    console.log(
      `API, run ${run}: ${record.success ? "ok" : "FAILED"} (ended ${loop.ended}${loop.error ? `: ${loop.error}` : ""}` +
        `${wrong.length ? `; wrong: ${wrong.join(", ")}` : ""}; ${loop.toolCalls.length} tool calls)`,
    );
  }

  const summary = summarise([apiTask.page], records);
  console.log(`\n${report(task.id, records, summary)}\n`);
  console.log(`Tool-definition tokens per request (count_tokens): ${definitionTokens ?? "n/a"}`);

  const directory = path.resolve(here, "../results");
  mkdirSync(directory, { recursive: true });
  const timestamp = new Date().toISOString();
  const file = path.join(directory, `api-${task.id}-${timestamp.replace(/[:.]/g, "-")}.json`);
  const tools = apiSession(new BookkeepingApi()).tools;
  writeFileSync(
    file,
    `${JSON.stringify(
      {
        kind: "bench",
        side: "api",
        timestamp,
        task: task.id,
        model,
        servedModels: [...new Set(records.flatMap((r) => r.servedModels))],
        effort,
        runsPerPage: runs,
        maxSteps,
        promptCaching: "top-level cache_control, ephemeral (5 minutes)",
        pricesUsdPerMillionTokens: prices,
        versions: { git: gitCommit() },
        system: SYSTEM_PROMPT,
        taskText: task.text,
        pages: [
          {
            id: apiTask.page,
            path: null,
            label: "bookkeeping API, its tools only",
            tools: "bookkeeping API (src/api/tools.ts)",
            toolDefinitionTokens: definitionTokens,
            toolDefinitions: tools,
          },
        ],
        summary,
        runs: records,
      },
      null,
      2,
    )}\n`,
  );
  console.log(`Raw numbers and full transcripts: ${path.relative(process.cwd(), file)}`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (error: unknown) => {
    console.error(error instanceof FatalApiError ? `Stopped: ${error.message}` : error);
    process.exit(1);
  },
);
