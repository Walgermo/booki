import type Anthropic from "@anthropic-ai/sdk";
import { agentTools } from "@ui-sdk/react/agent";
import type { Page } from "playwright-core";

export type ToolOutcome = { content: string; isError: boolean };
export type ToolSet = {
  tools: Anthropic.Tool[];
  run: (page: Page, name: string, input: unknown) => Promise<ToolOutcome>;
};

const ACTION_TIMEOUT_MS = 5_000;

const errorText = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).split("\n")[0] ?? "Error";

// ---------------------------------------------------------------------------
// Legacy browser tools: a small in-process imitation of Playwright MCP.
// Not the default. The browser pages use the real Playwright MCP server (see
// mcp.ts); these stay only as the `--browser-tools legacy` fallback for a
// machine where the server cannot run. Differences from the real server: four
// tools instead of its full list, `ref` instead of `target` + `element`, and
// every action returns the new snapshot inline (the server writes it to a file
// and returns a link, so a model has to call browser_snapshot to read it).
// ---------------------------------------------------------------------------

const refSchema = {
  type: "string",
  description: "Exact target element reference from the page snapshot, like e12",
} as const;

const browserToolDefinitions: Anthropic.Tool[] = [
  {
    name: "browser_snapshot",
    description:
      "Capture an accessibility snapshot of the current page. Elements you can act on carry a reference like [ref=e12].",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "browser_click",
    description: "Click an element on the page. Returns the updated page snapshot.",
    input_schema: {
      type: "object",
      properties: { ref: refSchema },
      required: ["ref"],
    },
  },
  {
    name: "browser_type",
    description: "Type text into an editable element, replacing what it holds. Returns the updated page snapshot.",
    input_schema: {
      type: "object",
      properties: {
        ref: refSchema,
        text: { type: "string", description: "Text to type into the element" },
      },
      required: ["ref", "text"],
    },
  },
  {
    name: "browser_select_option",
    description: "Select an option in a dropdown. Returns the updated page snapshot.",
    input_schema: {
      type: "object",
      properties: {
        ref: refSchema,
        values: {
          type: "array",
          items: { type: "string" },
          description: "Values or labels of the options to select",
        },
      },
      required: ["ref", "values"],
    },
  },
];

/** The same snapshot Playwright MCP gives a model: an aria tree with refs. */
export const pageSnapshot = (page: Page) => page.ariaSnapshot({ mode: "ai", timeout: ACTION_TIMEOUT_MS });

async function runBrowserTool(page: Page, name: string, input: unknown): Promise<ToolOutcome> {
  const args = (input ?? {}) as { ref?: unknown; text?: unknown; values?: unknown };
  try {
    if (name === "browser_snapshot") {
      return { content: await pageSnapshot(page), isError: false };
    }
    if (typeof args.ref !== "string" || !/^[\w-]+$/.test(args.ref)) {
      return { content: `"ref" must be a reference from the snapshot, like e12.`, isError: true };
    }
    // Refs are valid for the snapshot the model last saw, which is always the
    // last one taken: every action below ends by taking a new one.
    const target = page.locator(`aria-ref=${args.ref}`);
    if (name === "browser_click") {
      await target.click({ timeout: ACTION_TIMEOUT_MS });
    } else if (name === "browser_type") {
      if (typeof args.text !== "string") {
        return { content: `"text" must be a string.`, isError: true };
      }
      await target.fill(args.text, { timeout: ACTION_TIMEOUT_MS });
    } else if (name === "browser_select_option") {
      if (!Array.isArray(args.values) || args.values.some((v) => typeof v !== "string")) {
        return { content: `"values" must be an array of strings.`, isError: true };
      }
      await target.selectOption(args.values as string[], { timeout: ACTION_TIMEOUT_MS });
    } else {
      return { content: `Unknown tool "${name}".`, isError: true };
    }
    return { content: await pageSnapshot(page), isError: false };
  } catch (error) {
    return { content: errorText(error), isError: true };
  }
}

export const browserTools: ToolSet = { tools: browserToolDefinitions, run: runBrowserTool };

// ---------------------------------------------------------------------------
// The ui-sdk bridge. Definitions are ui-sdk's own `agentTools`; each
// call runs in the page against `window.agent`.
// ---------------------------------------------------------------------------

const bridgeToolDefinitions: Anthropic.Tool[] = agentTools.map((tool) => ({
  name: tool.name,
  description: tool.description,
  input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
}));

const bridgeToolNames = new Set(bridgeToolDefinitions.map((tool) => tool.name));

type Bridge = Record<string, (input?: unknown) => unknown>;

/** Calls one bridge method in the page and returns what it returned. */
export async function callBridge(page: Page, name: string, input: unknown): Promise<unknown> {
  return page.evaluate(
    async ([method, payload]) => {
      const bridge = (window as unknown as { agent?: Bridge }).agent;
      if (!bridge) throw new Error("window.agent is not on this page");
      const result = await (method === "snapshot" ? bridge.snapshot!() : bridge[method as string]!(payload));
      // Through JSON, so what the model reads is exactly what crosses the wire.
      return JSON.parse(JSON.stringify(result ?? null)) as unknown;
    },
    [name, input ?? {}] as const,
  );
}

async function runBridgeTool(page: Page, name: string, input: unknown): Promise<ToolOutcome> {
  if (!bridgeToolNames.has(name)) {
    return { content: `Unknown tool "${name}".`, isError: true };
  }
  try {
    return { content: JSON.stringify(await callBridge(page, name, input)), isError: false };
  } catch (error) {
    return { content: errorText(error), isError: true };
  }
}

export const bridgeTools: ToolSet = { tools: bridgeToolDefinitions, run: runBridgeTool };

/** Did this `act` result stop at a step that is marked for a person? */
export function stoppedForPerson(actOutput: string): boolean {
  try {
    const parsed = JSON.parse(actOutput) as { ok?: boolean; error?: { message?: string } };
    return parsed.ok === false && /person/i.test(parsed.error?.message ?? "");
  } catch {
    return false;
  }
}
