/**
 * One run's tools on one freshly loaded page.
 *
 * - "mcp": the official Playwright MCP server (default for browser pages).
 * - "legacy": the old in-process imitation of it (`--browser-tools legacy`),
 *   kept only as a fallback for machines where the server cannot run.
 * - "bridge": ui-sdk's three agent tools, run in the page against `window.agent`.
 *
 * `evaluate` is the harness's own window into the page, for readiness and the
 * end-state checks. The model never sees it and it is never counted.
 */
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import type Anthropic from "@anthropic-ai/sdk";
import type { Browser, Page } from "playwright-core";

import { startPlaywrightMcp } from "./mcp.js";
import { bridgeTools, browserTools, type ToolOutcome } from "./tools.js";

export type BrowserTools = "mcp" | "legacy";
export type SessionKind = BrowserTools | "bridge";

export type ResultBlock = Anthropic.TextBlockParam | Anthropic.ImageBlockParam;

export type SessionOutcome = ToolOutcome & {
  /** Content exactly as it goes back to the model; plain `content` when absent. */
  blocks?: ResultBlock[];
};

export type Session = {
  kind: SessionKind;
  tools: Anthropic.Tool[];
  run: (name: string, input: unknown) => Promise<SessionOutcome>;
  /** A JS expression, evaluated in the page; its value comes back through JSON. */
  evaluate: <T>(expression: string) => Promise<T>;
  close: () => Promise<void>;
  /** "mcp" only: the server's name and version from the MCP handshake. */
  server?: string;
};

export type OpenOptions = {
  kind: SessionKind;
  url: string;
  /** A JS expression that is truthy once the page is ready for tools. */
  ready: string;
  /** For "legacy" and "bridge": the harness's own Chrome. */
  browser: Browser;
  headed: boolean;
  /** "mcp" only: extra server capabilities, e.g. ["vision"]. */
  caps?: string[];
};

const READY_TIMEOUT_MS = 20_000;

async function waitUntil(check: () => Promise<boolean>, what: string) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await check().catch(() => false)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`${what} was not ready within ${READY_TIMEOUT_MS / 1000} s`);
}

async function openPage(browser: Browser, url: string, ready: string): Promise<Page> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  context.setDefaultTimeout(15_000);
  const page = await context.newPage();
  await page.goto(url);
  try {
    await page.waitForFunction(ready, undefined, { timeout: READY_TIMEOUT_MS });
  } catch {
    // One reload: a dev server that is re-bundling can miss the first load.
    await page.reload();
    await page.waitForFunction(ready, undefined, { timeout: READY_TIMEOUT_MS });
  }
  return page;
}

const pageEvaluate = async <T>(page: Page, expression: string): Promise<T> =>
  JSON.parse((await page.evaluate(`JSON.stringify(${expression})`)) as string) as T;

export async function openSession(options: OpenOptions): Promise<Session> {
  const { kind, url, ready, browser, headed, caps } = options;

  if (kind === "mcp") {
    // Its own working directory: the server writes snapshot and console files there.
    const workspace = mkdtempSync(path.join(os.tmpdir(), "agent-bench-mcp-"));
    const mcp = await startPlaywrightMcp({ headed, cwd: workspace, caps, origin: url });
    const close = async () => {
      await mcp.close();
      rmSync(workspace, { recursive: true, force: true });
    };
    try {
      // Opened by the harness, as the other modes are; not counted.
      const nav = await mcp.call("browser_navigate", { url });
      if (nav.isError) throw new Error(`browser_navigate ${url}: ${nav.content}`);
      const isReady = async () => Boolean(await mcp.evaluate<unknown>(`!!(${ready})`));
      await waitUntil(isReady, url).catch(async () => {
        // One reload: a dev server that is re-bundling can miss the first load.
        await mcp.call("browser_navigate", { url });
        await waitUntil(isReady, url);
      });
    } catch (error) {
      await close();
      throw error;
    }
    return {
      kind,
      tools: mcp.tools,
      run: (name, input) => mcp.call(name, input),
      evaluate: (expression) => mcp.evaluate(expression),
      close,
      server: mcp.serverInfo ? `${mcp.serverInfo.name} ${mcp.serverInfo.version}` : undefined,
    };
  }

  const page = await openPage(browser, url, ready);
  const toolSet = kind === "legacy" ? browserTools : bridgeTools;
  return {
    kind,
    tools: toolSet.tools,
    run: (name, input) => toolSet.run(page, name, input),
    evaluate: (expression) => pageEvaluate(page, expression),
    close: () => page.context().close(),
  };
}
