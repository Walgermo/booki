/**
 * The official Playwright MCP server, driven as an MCP client over stdio.
 *
 * The model on the browser side gets exactly the tool definitions the server
 * lists and exactly the content it returns. Nothing is renamed, trimmed or
 * rewritten. One server, and so one fresh browser profile, per run.
 */
import { createRequire } from "node:module";
import path from "node:path";

import type Anthropic from "@anthropic-ai/sdk";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import type { ToolOutcome } from "./tools.js";

const require = createRequire(import.meta.url);

/** Resolved from node_modules, so the pinned version is the one that runs. */
const MCP_PACKAGE_JSON = require.resolve("@playwright/mcp/package.json");
const MCP_CLI = path.join(path.dirname(MCP_PACKAGE_JSON), "cli.js");

export type McpOptions = {
  headed: boolean;
  /** The server's working directory and workspace root; it writes snapshot files there. */
  cwd?: string;
  /** Extra capabilities (`--caps`), e.g. ["vision"] for the coordinate tools. Default: none. */
  caps?: string[];
  /** The one origin the browser may request: the benchmark site. Everything else is blocked. */
  origin?: string;
};

/**
 * Tools the model never gets. `browser_run_code_unsafe` runs Node code in the
 * server's process, with the file system and the network of the machine the
 * benchmark runs on: in an early round a model used it to list home folders,
 * read files and scan ports. `browser_file_upload` reads local files too. A
 * real product's agent would not have either; the page tools stay.
 */
export const WITHHELD_TOOLS = new Set(["browser_run_code_unsafe", "browser_file_upload"]);

/**
 * The server's command line. Chrome through `--browser chrome` (the installed
 * Chrome; nothing is downloaded), an in-memory profile, the same viewport as
 * the bridge pages. Everything else is the server's default, so the tool list
 * is the default tool list.
 */
export const mcpArgs = ({ headed, caps, origin }: Pick<McpOptions, "headed" | "caps" | "origin">) => [
  ...(caps && caps.length ? ["--caps", caps.join(",")] : []),
  ...(origin ? ["--allowed-origins", new URL(origin).origin] : []),
  "--browser",
  "chrome",
  "--isolated",
  "--viewport-size",
  "1280x900",
  ...(headed ? [] : ["--headless"]),
];

/** MCP content, as the Messages API takes it in a tool_result. */
type ResultContent = Anthropic.TextBlockParam | Anthropic.ImageBlockParam;

export type McpCallOutcome = ToolOutcome & {
  /** The content blocks exactly as they go back to the model. */
  blocks: ResultContent[];
};

type McpContent = { type: string; text?: string; data?: string; mimeType?: string };

function toBlocks(content: McpContent[]): ResultContent[] {
  const blocks: ResultContent[] = [];
  for (const item of content) {
    if (item.type === "text") blocks.push({ type: "text", text: item.text ?? "" });
    else if (item.type === "image" && item.data && item.mimeType) {
      blocks.push({
        type: "image",
        source: {
          type: "base64",
          media_type: item.mimeType as "image/png" | "image/jpeg" | "image/gif" | "image/webp",
          data: item.data,
        },
      });
    } else {
      // Resources and anything else: passed on as their JSON, never dropped.
      blocks.push({ type: "text", text: JSON.stringify(item) });
    }
  }
  return blocks.length ? blocks : [{ type: "text", text: "" }];
}

export type PlaywrightMcp = {
  /** As the server listed them, in the Messages API's shape. */
  tools: Anthropic.Tool[];
  serverInfo: { name: string; version: string } | undefined;
  call: (name: string, input: unknown) => Promise<McpCallOutcome>;
  /**
   * For the harness only (navigation before a run, end-state checks after):
   * never shown to the model and never counted.
   */
  evaluate: <T>(fn: string) => Promise<T>;
  close: () => Promise<void>;
};

export async function startPlaywrightMcp(options: McpOptions): Promise<PlaywrightMcp> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [MCP_CLI, ...mcpArgs(options)],
    ...(options.cwd ? { cwd: options.cwd } : {}),
    stderr: "pipe",
  });
  let stderr = "";
  transport.stderr?.on("data", (chunk) => (stderr += String(chunk)));
  const client = new Client({ name: "agent-benchmark", version: "0.0.0" });
  try {
    await client.connect(transport);
  } catch (error) {
    throw new Error(`Playwright MCP did not start: ${String(error)}\n${stderr}`, { cause: error });
  }

  const listed = await client.listTools();
  const tools: Anthropic.Tool[] = listed.tools
    .filter((tool) => !WITHHELD_TOOLS.has(tool.name))
    .map((tool) => ({
      name: tool.name,
      description: tool.description ?? "",
      input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
    }));

  const call = async (name: string, input: unknown): Promise<McpCallOutcome> => {
    if (WITHHELD_TOOLS.has(name)) {
      const text = `Tool "${name}" is not available.`;
      return { blocks: [{ type: "text", text }], content: text, isError: true };
    }
    try {
      const result = (await client.callTool({
        name,
        arguments: (input ?? {}) as Record<string, unknown>,
      })) as { content?: McpContent[]; isError?: boolean };
      const blocks = toBlocks(result.content ?? []);
      return {
        blocks,
        content: blocks.map((b) => (b.type === "text" ? b.text : `[image ${b.source.type}]`)).join("\n"),
        isError: result.isError === true,
      };
    } catch (error) {
      // A protocol error (unknown tool, bad arguments) is a tool error to the model.
      const text = error instanceof Error ? error.message : String(error);
      return { blocks: [{ type: "text", text }], content: text, isError: true };
    }
  };

  const evaluate = async <T>(fn: string): Promise<T> => {
    const outcome = await call("browser_evaluate", { function: `() => JSON.stringify(${fn})` });
    if (outcome.isError) throw new Error(`browser_evaluate failed: ${outcome.content}`);
    // The result section is a JSON string literal of our JSON.
    const match = outcome.content.match(/### Result\s*\n([\s\S]*?)(\n###|$)/);
    const raw = (match?.[1] ?? outcome.content)
      .trim()
      .replace(/^```\w*\n?|```$/g, "")
      .trim();
    if (raw === "undefined" || raw === "") return undefined as T;
    const inner = JSON.parse(raw) as unknown;
    return (typeof inner === "string" ? JSON.parse(inner) : inner) as T;
  };

  return {
    tools,
    serverInfo: client.getServerVersion(),
    call,
    evaluate,
    close: async () => {
      await client.callTool({ name: "browser_close", arguments: {} }).catch(() => {});
      await client.close().catch(() => {});
    },
  };
}
