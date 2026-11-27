import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import {
  expectedPublicState,
  publicChecks,
  type PublicSide,
  type PublicState,
  type PublicTask,
} from "../../../apps/www/src/lib/public-browser-run.js";
import { answerSchema, publicQuestions, readPublicAnswer, verifyPublicAnswer } from "./public-questions.js";
import type { Call } from "./scripted.js";

const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== "--"),
  options: {
    url: { type: "string", default: "http://127.0.0.1:5183" },
    out: { type: "string" },
    task: { type: "string" },
  },
});
const site = new URL(values.url);
assert.ok(
  ["127.0.0.1", "localhost", "[::1]"].includes(site.hostname),
  "The model runner only accepts a local fixture server.",
);
const root = site.origin;
const model = "gpt-6.2-sol";
const require = createRequire(import.meta.url);
const tsx = require.resolve("tsx/cli");
const server = fileURLToPath(new URL("./public-model-tools.ts", import.meta.url));

type Transcript = { before: PublicState; after: PublicState; calls: Call[]; browser: string; browserTool?: string };
type Event = {
  type: string;
  usage?: Record<string, number>;
  item?: { type?: string; text?: string; message?: string; server?: string };
};

async function run(task: PublicTask, side: PublicSide) {
  const cwd = await mkdtemp(path.join(tmpdir(), "booki-public-model-"));
  const transcript = path.join(cwd, "calls.json");
  const schema = path.join(cwd, "answer-schema.json");
  await writeFile(schema, JSON.stringify(answerSchema(task)));
  const fixture = `/bench/public/${task}/${side}`;
  const serverArgs = [tsx, server, side === "browser" ? "mcp" : "bridge", root + fixture, transcript];
  const prompt = `Work in the local site fixture with only the fixture MCP tools. Use the currently displayed interface to navigate. Do not use shell, file, network or other tools. Return the requested numbers as JSON. Use null if the interface gives you no evidence for a value.\n\n${publicQuestions[task].prompt}`;
  const cliArgs = [
    "exec",
    "--ephemeral",
    "--ignore-user-config",
    "--skip-git-repo-check",
    "-C",
    cwd,
    "-m",
    model,
    "-s",
    "read-only",
    "--json",
    "--output-schema",
    schema,
    "--disable",
    "plugins",
    "--disable",
    "shell_tool",
    "--disable",
    "unified_exec",
    "--enable",
    "omit_skill_descriptions",
    "-c",
    'model_reasoning_effort="low"',
    "-c",
    "analytics.enabled=false",
    "-c",
    "features.multi_agent=false",
    "-c",
    'web_search="disabled"',
    "-c",
    `mcp_servers.fixture.command=${JSON.stringify(process.execPath)}`,
    "-c",
    `mcp_servers.fixture.args=${JSON.stringify(serverArgs)}`,
    "-c",
    'mcp_servers.fixture.default_tools_approval_mode="approve"',
    "-c",
    "mcp_servers.fixture.required=true",
    "-c",
    "mcp_servers.fixture.startup_timeout_sec=55",
    prompt,
  ];

  try {
    const started = performance.now();
    const result = await new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
      const child = spawn("codex", cliArgs, { cwd, stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
        stdout += chunk;
      });
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
        stderr += chunk;
      });
      const deadline = setTimeout(() => child.kill("SIGTERM"), 240_000);
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(deadline);
        resolve({ stdout, stderr, code });
      });
    });
    const elapsedMs = Math.round(performance.now() - started);
    const events = result.stdout
      .split("\n")
      .filter((line) => line.startsWith("{"))
      .map((line) => JSON.parse(line) as Event);
    const usage = events.filter((event) => event.type === "turn.completed").at(-1)?.usage;
    if (result.code !== 0 || !usage)
      throw new Error(
        `Codex ${task}/${side} did not finish: ${result.stdout.slice(-3000)}\n${result.stderr.slice(-3000)}`,
      );
    const items = events.filter((event) => event.type === "item.completed").map((event) => event.item);
    const itemKinds = items.map((item) =>
      item?.type === "mcp_tool_call" ? `${item.type}:${item.server}` : item?.type,
    );
    const informational = new Set(["agent_message", "reasoning", "error"]);
    const adapterOnly = items.every(
      (item) => informational.has(item?.type ?? "") || (item?.type === "mcp_tool_call" && item.server === "fixture"),
    );
    const cliMessages = items
      .filter((item) => item?.type === "error")
      .map((item) => (item?.message ?? item?.text ?? "").replaceAll(homedir(), "~"));
    if (cliMessages.length) console.error(`${task}/${side} CLI messages: ${JSON.stringify(cliMessages)}`);
    if (!adapterOnly) console.error(`${task}/${side} CLI items: ${JSON.stringify(itemKinds)}`);
    const { before, after, calls, browser, browserTool } = JSON.parse(await readFile(transcript, "utf8")) as Transcript;
    assert.deepEqual(before, expectedPublicState(task, false));
    const stateChecks = publicChecks(after, expectedPublicState(task, true));
    const answer = items.filter((item) => item?.type === "agent_message").at(-1)?.text ?? "";
    const evidenceChecks = Object.entries(publicQuestions[task].expected).map(([field, expected]) => {
      const call = calls.findIndex(
        ({ output, isError }) => !isError && readPublicAnswer(task, output, side)[field] === expected,
      );
      return {
        name: `evidence.${field}`,
        ok: call !== -1,
        actual: call === -1 ? null : call + 1,
        expected: "a tool reply with the field and value",
      };
    });
    const checks = [...stateChecks, ...verifyPublicAnswer(task, answer), ...evidenceChecks];
    if (checks.some(({ ok }) => !ok))
      console.error(`${task}/${side} failed checks: ${JSON.stringify(checks.filter(({ ok }) => !ok))}`);
    console.error(
      `${task}/${side}: ${checks.every(({ ok }) => ok) && adapterOnly ? "PASS" : "FAIL"} (${calls.length} calls, ${elapsedMs}ms)`,
    );
    const actions = calls.reduce((total, call) => {
      if (call.tool === "act") return total + ((call.input as { steps?: unknown[] }).steps?.length ?? 0);
      if (call.tool.startsWith("browser_") && call.tool !== "browser_snapshot" && call.tool !== "browser_wait_for") {
        return total + 1;
      }
      return total;
    }, 0);
    return {
      side,
      fixture,
      toolCalls: calls.length,
      actions,
      usage,
      elapsedMs,
      answer,
      adapterOnly,
      itemKinds,
      cliMessages,
      browser,
      browserTool,
      calls,
      verification: { ok: adapterOnly && checks.every(({ ok }) => ok), checks },
    };
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

const selected = values.task ? [values.task as PublicTask] : (Object.keys(publicQuestions) as PublicTask[]);
const pairs = [];
for (const task of selected) {
  const arms = await Promise.all([run(task, "browser"), run(task, "booki")]);
  pairs.push({ id: task, prompt: publicQuestions[task].prompt, arms });
}
const output = JSON.stringify(
  {
    observedOn: new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Oslo" }).format(new Date()),
    mode: "codex-exec-model",
    protocol: "full-document-v2",
    model,
    reasoningEffort: "low",
    usageSource:
      "Codex CLI turn.completed (aggregate over the full run, including Codex context, tool schemas and repeated context)",
    costUsd: null,
    pairs,
  },
  null,
  2,
);
if (values.out) await writeFile(values.out, output + "\n");
else console.log(output);
if (pairs.some(({ arms }) => arms.some(({ verification }) => !verification.ok))) process.exitCode = 1;
