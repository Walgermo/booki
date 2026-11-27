import { writeFileSync } from "node:fs";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { chromium } from "playwright-core";
import { readPublicState, type PublicState } from "../../../apps/www/src/lib/public-browser-run.js";
import { recorder } from "./scripted.js";
import { openSession } from "./session.js";

const [, , kind, url, transcript] = process.argv;
if ((kind !== "bridge" && kind !== "mcp") || !url || !transcript) {
  throw new Error("Expected bridge|mcp, fixture URL, transcript destination");
}

const browser = await chromium.launch({ channel: "chrome" });
const session = await openSession({
  kind,
  url,
  ready: 'document.querySelector("main[data-public-fixture]")',
  browser,
  headed: false,
});
const rec = recorder(session);
const expression = `(${readPublicState.toString()})(document)`;
const before = await session.evaluate<PublicState>(expression);
const save = async () => {
  const after = await session.evaluate<PublicState>(expression);
  writeFileSync(
    transcript,
    JSON.stringify({ before, after, calls: rec.calls, browser: browser.version(), browserTool: session.server }),
  );
};
await save();

// Expose the browser adapter's accessible interaction tools and the real bridge
// adapter's controls. URL changes and fixture state checks stay in the harness.
const names =
  kind === "mcp"
    ? [
        "browser_snapshot",
        "browser_click",
        "browser_press_key",
        "browser_type",
        "browser_select_option",
        "browser_check",
        "browser_uncheck",
        "browser_hover",
        "browser_wait_for",
      ]
    : ["snapshot", "act", "query"];
const tools = session.tools.filter((tool) => names.includes(tool.name));
const server = new Server({ name: "booki-fixture", version: "1" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: tools.map((tool) => ({ name: tool.name, description: tool.description, inputSchema: tool.input_schema })),
}));
server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
  if (!names.includes(params.name)) return { content: [{ type: "text", text: "Unknown tool" }], isError: true };
  const text = await rec.call(params.name, params.arguments ?? {}, true);
  const result = rec.calls.at(-1)!;
  await save();
  const content = result.blocks?.map((block) => {
    if (block.type === "text") return { type: "text" as const, text: block.text };
    if (block.source.type !== "base64") throw new Error("Unexpected non-base64 image in the fixture adapter");
    return { type: "image" as const, data: block.source.data, mimeType: block.source.media_type };
  }) ?? [{ type: "text" as const, text }];
  return { content, isError: result.isError };
});
let closing = false;
const close = async () => {
  if (closing) return;
  closing = true;
  await session.close();
  await browser.close();
};
// oxlint-disable-next-line unicorn/prefer-add-event-listener -- the MCP server exposes an onclose callback.
server.onclose = () => {
  void close();
};
process.stdin.once("end", () => {
  void close();
});
await server.connect(new StdioServerTransport());
