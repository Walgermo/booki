"use client";

import { createMCPClient, Experimental_WebMCPTransport as WebMCPTransport, type MCPClient } from "@ai-sdk/mcp";
import { useChat } from "@ai-sdk/react";
import { registerTools } from "@booki/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { useEffect, useRef, useState } from "react";
import { logDecision, pageAgent } from "./agent";
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
  // A browser may register asynchronously; let it finish before the client lists the tools.
  await Promise.resolve();
  if (signal.aborted) return undefined;
  const client = await createMCPClient({ transport: new WebMCPTransport({ modelContext: context }) });
  if (signal.aborted) {
    await client.close();
    return undefined;
  }
  return client;
}

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
  const client = useRef<MCPClient | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [setupError, setSetupError] = useState<string>();
  const meRef = useRef(me);
  meRef.current = me;

  const chat = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
      async prepareSendMessagesRequest({ messages }) {
        const { tools } = await client.current!.listTools();
        return { body: { messages, tools, me: meRef.current } };
      },
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    async onToolCall({ toolCall }) {
      if (!toolCall.dynamic) return;
      try {
        const output = await client.current!.callTool({
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
    if (!context) {
      setSetupError(
        "Chatten trenger WebMCP: slå på chrome://flags/#enable-webmcp-testing i Chrome, start Chrome på nytt og last inn siden.",
      );
      return;
    }
    const registration = new AbortController();
    let opened: MCPClient | undefined;
    connectAssistant(context, registration.signal)
      .then((mcp) => {
        if (!mcp) return;
        opened = mcp;
        client.current = mcp;
        setReady(true);
      })
      .catch((error: unknown) => {
        if (!registration.signal.aborted) setSetupError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      registration.abort();
      if (client.current === opened) client.current = undefined;
      void opened?.close();
      setReady(false);
    };
  }, []);

  return { ...chat, ready, setupError };
}
