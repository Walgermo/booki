/** Every version that can move a number, for the results file and the console. */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { Browser } from "playwright-core";

import { mcpArgs } from "./mcp.js";
import { REPO_ROOT } from "./site.js";

/** Read from this package's own node_modules: not every package exports its package.json. */
const versionOf = (pkg: string) =>
  (
    JSON.parse(readFileSync(path.join(REPO_ROOT, "benchmarks/agent/node_modules", pkg, "package.json"), "utf8")) as {
      version: string;
    }
  ).version;

export type Versions = {
  node: string;
  chrome: string;
  playwrightCore: string;
  playwrightMcp: string;
  /** What the server said in its MCP handshake (the Playwright build it bundles). */
  playwrightMcpServer: string | null;
  playwrightMcpArgs: string[];
  modelContextProtocolSdk: string;
  uiSdkReact: string;
  anthropicSdk: string;
  /** The commit the pages and harness came from, and whether the tree had changes. */
  git: { commit: string | null; dirty: boolean | null };
  platform: string;
};

function git(): Versions["git"] {
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" });
  const status = spawnSync("git", ["status", "--porcelain"], { cwd: REPO_ROOT, encoding: "utf8" });
  return {
    commit: head.status === 0 ? head.stdout.trim() : null,
    dirty: status.status === 0 ? status.stdout.trim() !== "" : null,
  };
}

export function collectVersions(browser: Browser, options: { headed: boolean; mcpServer?: string | null }): Versions {
  return {
    node: process.version,
    chrome: browser.version(),
    playwrightCore: versionOf("playwright-core"),
    playwrightMcp: versionOf("@playwright/mcp"),
    playwrightMcpServer: options.mcpServer ?? null,
    playwrightMcpArgs: mcpArgs({ headed: options.headed }),
    modelContextProtocolSdk: versionOf("@modelcontextprotocol/sdk"),
    uiSdkReact: versionOf("@ui-sdk/react"),
    anthropicSdk: versionOf("@anthropic-ai/sdk"),
    git: git(),
    platform: `${process.platform} ${process.arch}`,
  };
}

export const printVersions = (v: Versions) =>
  `Node ${v.node} · Chrome ${v.chrome} · Playwright MCP ${v.playwrightMcp}` +
  `${v.playwrightMcpServer ? ` (server ${v.playwrightMcpServer})` : ""} · MCP SDK ${v.modelContextProtocolSdk}` +
  ` · playwright-core ${v.playwrightCore} · @ui-sdk/react ${v.uiSdkReact} · @anthropic-ai/sdk ${v.anthropicSdk}` +
  ` · commit ${v.git.commit?.slice(0, 7) ?? "?"}${v.git.dirty ? " (uncommitted changes)" : ""}`;
