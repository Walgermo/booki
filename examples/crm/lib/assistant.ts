"use client";

import { createMCPClient, Experimental_WebMCPTransport as WebMCPTransport, type MCPClient } from "@ai-sdk/mcp";
import { useChat } from "@ai-sdk/react";
import { registerTools } from "@booki/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from "ai";
import { useEffect, useState, useSyncExternalStore } from "react";
import { asAgentWork, logDecision, pageAgent } from "./agent";
import { TOOL_NAMES } from "./chat-tools";
import { AGENT_ID } from "./people";

type ModelContext = ConstructorParameters<typeof WebMCPTransport>[0]["modelContext"] & {
  registerTool?: unknown;
};

/**
 * Registers the page's tools and opens an MCP client on them. Booki's
 * `registerTools` writes no tools of its own: it offers the bridge's
 * `snapshot`, `act` and `query` as `crm_snapshot`, `crm_act` and `crm_query`,
 * and every step goes through the same bridge as the scripted tasks: the
 * `allow` policy, the person-only rule, the refusals in Norwegian and the audit
 * trail. A change it makes reports `source: "agent"`, so the page sends it to
 * the server with the agent's credential.
 */
export async function connectAssistant(context: ModelContext, signal: AbortSignal): Promise<MCPClient | undefined> {
  const unregister = registerTools(pageAgent(), {
    allow: "bridge",
    prefix: "crm",
    agentId: AGENT_ID,
    audit: logDecision,
  });
  signal.addEventListener("abort", unregister, { once: true });
  // Every tool call the model makes runs as the agent's work, so the person switch waits for it.
  const counted: ModelContext = {
    getTools: (options) => context.getTools(options),
    executeTool: (tool, input, options) => asAgentWork(() => context.executeTool(tool, input, options)),
  };
  const client = await createMCPClient({ transport: new WebMCPTransport({ modelContext: counted }) });
  try {
    // Registration fails silently (a permissions policy, a browser that refuses): find out now, not on the first message.
    const { tools } = await client.listTools();
    const names = ownTools(tools).map((tool) => tool.name);
    if (!TOOL_NAMES.every((name) => names.includes(name)))
      throw new Error("Siden fikk ikke registrert verktøyene sine i nettleseren. Last inn siden på nytt.");
  } catch (error) {
    await client.close();
    throw error;
  }
  if (signal.aborted) {
    await client.close();
    return undefined;
  }
  return client;
}

/**
 * The tools this page registered, out of what the browser lists: another
 * origin's tools, or a frame's that took one of the names first, never reach
 * the model. WebMCP's client gives a repeated name to the first one listed and
 * renames the rest, so the name alone is not enough; the origin is.
 */
export function ownTools<T extends { name: string; _meta?: Record<string, unknown> }>(tools: T[]): T[] {
  const origin = globalThis.location?.origin;
  return tools.filter((tool) => {
    const from = (tool._meta?.["ai-sdk.dev/webmcp"] as { origin?: unknown } | undefined)?.origin;
    return (TOOL_NAMES as readonly string[]).includes(tool.name) && from === origin;
  });
}

/**
 * Tool rounds one message may start before the chat stops and hands back to
 * the person: a model that keeps reading or retrying costs a request each time.
 */
export const MAX_TOOL_ROUNDS = 8;

/** The tool rounds the model has taken since the person last wrote. */
export function roundsSinceLastUser(messages: UIMessage[]): number {
  const lastUser = messages.map((message) => message.role).lastIndexOf("user");
  // AI SDK starts each round of an automatic resend with a `step-start` part in the same assistant message.
  return messages
    .slice(lastUser + 1)
    .flatMap((message) => message.parts)
    .filter((part) => part.type === "step-start").length;
}

/** True when the chat stopped at the limit with the model's tool results unanswered. */
export function stoppedAtLimit(messages: UIMessage[]): boolean {
  return roundsSinceLastUser(messages) >= MAX_TOOL_ROUNDS && lastAssistantMessageIsCompleteWithToolCalls({ messages });
}

/** Sends the tool results back to the model, unless this message has used its rounds. */
export function shouldContinue({ messages }: { messages: UIMessage[] }): boolean {
  return lastAssistantMessageIsCompleteWithToolCalls({ messages }) && roundsSinceLastUser(messages) < MAX_TOOL_ROUNDS;
}

const NO_WEBMCP =
  "Chatten trenger WebMCP: slå på chrome://flags/#enable-webmcp-testing i Chrome, start Chrome på nytt og last inn siden.";

/** What the chat's callbacks read when they run, outside render. */
class Link {
  client: MCPClient | undefined;
  constructor(public me: string) {}
  setMe(me: string) {
    this.me = me;
  }
  open(client: MCPClient) {
    this.client = client;
  }
  close(client: MCPClient | undefined) {
    if (this.client === client) this.client = undefined;
  }
}

/** WebMCP does not come and go while the page is open. */
const noChange = () => () => {};

/** The browser's WebMCP, when it lets a page both register tools and call them. */
export function modelContextOf(): ModelContext | undefined {
  const context = (globalThis as { document?: { modelContext?: Partial<ModelContext> } }).document?.modelContext;
  return context?.getTools && context.executeTool && context.registerTool ? (context as ModelContext) : undefined;
}

/**
 * The chat. The model runs on the server (`/api/chat`); before each request
 * the page lists its tools and sends them along, and each tool call the model
 * makes comes back here and runs in the tab.
 */
export function useAssistant(me: string) {
  // What the chat's callbacks read when they run: the open client, and who the agent works for now.
  const [link] = useState(() => new Link(me));
  const [ready, setReady] = useState(false);
  const [connectError, setConnectError] = useState<string>();
  // The server renders as if WebMCP were there; the browser says whether it is.
  const hasWebMCP = useSyncExternalStore(
    noChange,
    () => modelContextOf() !== undefined,
    () => true,
  );
  const setupError = hasWebMCP ? connectError : NO_WEBMCP;

  useEffect(() => {
    link.setMe(me);
  }, [link, me]);

  const [transport] = useState(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        async prepareSendMessagesRequest({ messages }) {
          const { tools } = await link.client!.listTools();
          return { body: { messages, tools: ownTools(tools), me: link.me } };
        },
      }),
  );

  const chat = useChat({
    transport,
    sendAutomaticallyWhen: shouldContinue,
    async onToolCall({ toolCall }) {
      if (!toolCall.dynamic) return;
      try {
        const output = await link.client!.callTool({
          name: toolCall.toolName,
          arguments: toolCall.input as Record<string, unknown>,
        });
        // Not awaited inside onToolCall.
        chat.addToolOutput({ tool: toolCall.toolName, toolCallId: toolCall.toolCallId, output });
      } catch (error) {
        chat.addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          state: "output-error",
          errorText: error instanceof Error ? error.message : String(error),
        });
      }
    },
  });

  useEffect(() => {
    const context = modelContextOf();
    if (!context) return;
    const registration = new AbortController();
    let opened: MCPClient | undefined;
    connectAssistant(context, registration.signal)
      .then((mcp) => {
        if (!mcp) return;
        opened = mcp;
        link.open(mcp);
        setReady(true);
      })
      .catch((error: unknown) => {
        if (!registration.signal.aborted) setConnectError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      registration.abort();
      link.close(opened);
      void opened?.close();
      setReady(false);
    };
  }, [link]);

  return { ...chat, ready, setupError };
}
