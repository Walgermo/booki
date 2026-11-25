import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CrmApp } from "@/components/crm-app";
import { connectAssistant } from "@/lib/assistant";
import { handleChat } from "@/lib/chat";
import { crm } from "@/lib/store";

type Registered = { name: string; execute: (input: unknown) => unknown } & Record<string, unknown>;

/**
 * WebMCP as Chrome gives it to a page with the testing flag on: the page
 * registers tools, and an MCP client in the same page lists and runs them.
 * `executeTool` answers with the result as JSON text, as the browser does.
 */
function fakeModelContext() {
  const tools = new Map<string, Registered>();
  return {
    registerTool(tool: Registered, { signal }: { signal: AbortSignal }) {
      tools.set(tool.name, tool);
      signal.addEventListener("abort", () => tools.delete(tool.name), { once: true });
    },
    async getTools() {
      return [...tools.values()].map((tool) => ({
        ...Object.fromEntries(Object.entries(tool).filter(([key]) => key !== "execute")),
        origin: "http://localhost",
        window: null,
      })) as never;
    },
    async executeTool(tool: { name: string }, input?: object) {
      return JSON.stringify(await tools.get(tool.name)!.execute(input ?? {}));
    },
  };
}

/** The page, then the assistant's MCP client on its tools, as the chat panel opens it. */
async function openWithAssistant() {
  render(<CrmApp initial={structuredClone(crm())} />);
  const context = fakeModelContext();
  (document as unknown as { modelContext: unknown }).modelContext = context;
  const registration = new AbortController();
  const client = (await connectAssistant(context as never, registration.signal))!;
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = (await client.callTool({ name, arguments: args })) as { content: { text: string }[] };
    return JSON.parse(result.content[0]!.text);
  };
  return { client, call, close: () => registration.abort() };
}

afterEach(() => {
  delete (document as unknown as { modelContext?: unknown }).modelContext;
  vi.unstubAllEnvs();
});

describe("the assistant on the page, through AI SDK's WebMCP client", () => {
  it("says how to turn WebMCP on where the browser has none, and sends nothing", () => {
    render(<CrmApp initial={structuredClone(crm())} />);
    expect(screen.getByText(/enable-webmcp-testing/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Send" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("finds the page's three tools and no others: the app wrote none", async () => {
    const { client, close } = await openWithAssistant();
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(["crm_act", "crm_query", "crm_snapshot"]);
    close();
  });

  it("moves a deal through the bridge, and the server records it as the agent's", async () => {
    const { call, close } = await openWithAssistant();
    const snapshot = (await call("crm_snapshot", {})) as { ref: string; component: string }[];
    const board = snapshot.find((entry) => entry.component === "deal-pipeline")!;
    const result = await call("crm_act", {
      steps: [{ ref: board.ref, action: "moveDeal", args: ["D-101", "negotiation"] }],
    });
    expect(result.ok).toBe(true);
    await waitFor(() => expect(crm().deals.find((deal) => deal.id === "D-101")?.stageId).toBe("negotiation"));
    expect(crm().audit[0]).toMatchObject({ actor: "agent:crm-assistant" });
    close();
  });

  it("is refused marking a deal won: a person's decision, whatever the model is told", async () => {
    const { call, close } = await openWithAssistant();
    const snapshot = (await call("crm_snapshot", {})) as { ref: string; component: string }[];
    const board = snapshot.find((entry) => entry.component === "deal-pipeline")!;
    const result = await call("crm_act", { steps: [{ ref: board.ref, action: "moveDeal", args: ["D-101", "won"] }] });
    expect(result.ok).toBe(false);
    expect(result.error.message).toMatch(/person/i);
    expect(crm().deals.find((deal) => deal.id === "D-101")?.stageId).toBe("quote");
    // The refusal reaches the audit trail, as the agent's.
    await waitFor(() =>
      expect(crm().audit[0]).toMatchObject({ actor: "agent:crm-assistant", action: "agent.refused" }),
    );
    close();
  });
});

describe("the chat's server route", () => {
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    handleChat(
      new Request("http://localhost:3200/api/chat", {
        method: "POST",
        headers: { host: "localhost:3200", "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      }),
    );

  it("runs only on a local development server", async () => {
    vi.stubEnv("NODE_ENV", "production");
    expect((await post({ messages: [], tools: [] })).status).toBe(403);
    vi.stubEnv("NODE_ENV", "development");
    expect((await post({ messages: [], tools: [] }, { origin: "https://elsewhere.example" })).status).toBe(403);
  });

  it("says where the key goes when there is none", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const response = await post({ messages: [], tools: [] });
    expect(response.status).toBe(503);
    expect(await response.text()).toMatch(/ANTHROPIC_API_KEY/);
  });

  it("takes only the page's own tools, not another one the browser lists", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ANTHROPIC_API_KEY", "test");
    const other = { name: "transfer_money", description: "x", inputSchema: { type: "object" } };
    expect((await post({ messages: [], tools: [other] })).status).toBe(400);
  });
});
