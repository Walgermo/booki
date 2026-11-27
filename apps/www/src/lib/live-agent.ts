import type Anthropic from "@anthropic-ai/sdk";

import { agent } from "@/agent";

type Block = Anthropic.Beta.BetaContentBlock;
type Message = Anthropic.Beta.BetaMessageParam;
type ToolUse = Anthropic.Beta.BetaToolUseBlock;

type Turn = {
  content: Block[];
  stop_reason: string | null;
  stop_details: { category?: string | null; explanation?: string | null } | null;
};

export type LiveEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; summary: string; ok: boolean; detail: string }
  | { type: "stopped"; reason: string };

/** Is the server configured with a key? */
export async function liveAgentStatus(): Promise<{ enabled: boolean; model?: string }> {
  const response = await fetch("/api/agent");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/** Run one tool call from the model against the page's agent bridge. */
async function runTool(use: ToolUse): Promise<{ content: string; ok: boolean; summary: string }> {
  const input = (use.input ?? {}) as Record<string, unknown>;
  try {
    if (use.name === "snapshot") {
      const result = agent.snapshot();
      return { content: JSON.stringify(result), ok: true, summary: `read ${result.length} controls` };
    }
    if (use.name === "query") {
      const result = await agent.query(input as never);
      return { content: JSON.stringify(result), ok: !("error" in (result as object)), summary: "looked up a list" };
    }
    if (use.name === "act") {
      // The tool input is model output: check its shape before running it.
      const steps = input.steps;
      if (
        !Array.isArray(steps) ||
        steps.some((step) => !step || typeof step.ref !== "string" || typeof step.action !== "string")
      ) {
        return {
          content: "Invalid input: act needs { steps: [{ ref, action, args? }] }.",
          ok: false,
          summary: "sent a malformed act",
        };
      }
      const result = (await agent.act({ steps } as never)) as { ok: boolean; error?: { message: string } };
      const names = steps.map((step) => step.action).join(", ");
      return {
        content: JSON.stringify(result),
        ok: result.ok,
        summary: result.ok ? `ran ${names}` : `${names}: ${result.error?.message ?? "refused"}`,
      };
    }
    return { content: `Unknown tool "${use.name}".`, ok: false, summary: `asked for unknown tool ${use.name}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: message, ok: false, summary: message };
  }
}

/**
 * Ask the live agent to do something on this page. The model runs on the
 * server; its tool calls run here, against the ui-sdk bridge, so the person
 * watches the real controls change.
 */
export async function askLiveAgent(
  prompt: string,
  onEvent: (event: LiveEvent) => void,
  options: { signal?: AbortSignal; maxTurns?: number } = {},
): Promise<void> {
  const messages: Message[] = [{ role: "user", content: prompt }];
  const maxTurns = options.maxTurns ?? 12;

  for (let turn = 0; turn < maxTurns; turn += 1) {
    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages }),
      signal: options.signal,
    });
    const data = (await response.json()) as Turn & { error?: string };
    if (!response.ok) throw new Error(data.error ?? `The server answered ${response.status}.`);

    // Keep the whole assistant turn, thinking blocks included: the API needs
    // them back unchanged on the next request.
    messages.push({
      role: "assistant",
      content: data.content as Anthropic.Beta.BetaContentBlockParam[],
    });

    for (const block of data.content) {
      if (block.type === "text" && block.text.trim()) onEvent({ type: "text", text: block.text });
    }

    if (data.stop_reason === "refusal") {
      onEvent({ type: "stopped", reason: data.stop_details?.explanation ?? "The model declined this request." });
      return;
    }
    if (data.stop_reason === "max_tokens") {
      onEvent({ type: "stopped", reason: "The answer was cut off at the length limit." });
      return;
    }
    if (data.stop_reason === "pause_turn") continue;

    const uses = data.content.filter((block): block is ToolUse => block.type === "tool_use");
    if (uses.length === 0) return;

    // Every result goes back in one user message.
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const use of uses) {
      const result = await runTool(use);
      onEvent({ type: "tool", name: use.name, summary: result.summary, ok: result.ok, detail: result.content });
      results.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: result.content,
        ...(use.name !== "act" && !result.ok ? { is_error: true } : {}),
      });
    }
    messages.push({ role: "user", content: results });
  }
  onEvent({ type: "stopped", reason: `Stopped after ${maxTurns} turns.` });
}
