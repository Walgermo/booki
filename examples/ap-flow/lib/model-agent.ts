"use client";

import type Anthropic from "@anthropic-ai/sdk";
import type { AgentBridge } from "@booki/react";
import { settled, takeRefusals } from "./writes";

type Block = Anthropic.Beta.BetaContentBlock;
type ToolUse = Anthropic.Beta.BetaToolUseBlock;
type Turn = {
  content: Block[];
  stop_reason: string | null;
  stop_details: { explanation?: string | null } | null;
};

export type ModelEvent =
  | { type: "text"; text: string }
  | { type: "tool"; summary: string; ok: boolean }
  | { type: "stopped"; reason: string };

export async function modelAgentStatus(): Promise<{ enabled: boolean; model?: string }> {
  try {
    const response = await fetch("/api/agent");
    return response.ok ? ((await response.json()) as { enabled: boolean; model?: string }) : { enabled: false };
  } catch {
    return { enabled: false };
  }
}

/** One tool call from the model, run against the page's bridge as the agent. */
async function runTool(agent: AgentBridge, use: ToolUse): Promise<{ content: string; ok: boolean; summary: string }> {
  const input = (use.input ?? {}) as Record<string, unknown>;
  try {
    if (use.name === "snapshot") {
      const result = agent.snapshot();
      return { content: JSON.stringify(result), ok: true, summary: `leste ${result.length} kontroller` };
    }
    if (use.name === "query") {
      const result = await agent.query(input as never);
      return { content: JSON.stringify(result), ok: !("error" in (result as object)), summary: "slo opp i en liste" };
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
          summary: "sendte et ugyldig act",
        };
      }
      takeRefusals();
      const result = (await agent.act({ steps } as never)) as {
        ok: boolean;
        error?: { message: string };
      };
      // The controls proposed; the server decides. Its refusals go back to the model too.
      await settled();
      const refused = takeRefusals();
      const names = steps.map((step) => step.action).join(", ");
      const ok = result.ok && refused.length === 0;
      return {
        content: JSON.stringify({ ...result, ...(refused.length ? { serverRefused: refused } : {}) }),
        ok,
        summary: ok ? names : `${names}: ${refused[0] ?? result.error?.message ?? "avvist"}`,
      };
    }
    return { content: `Unknown tool "${use.name}".`, ok: false, summary: `ukjent verktøy ${use.name}` };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { content: message, ok: false, summary: message };
  }
}

/**
 * Ask the model agent to work the page. The model runs on the server; its tool
 * calls run here, so the person sees the real controls change.
 */
export async function askModelAgent(
  agent: AgentBridge,
  prompt: string,
  onEvent: (event: ModelEvent) => void,
  options: { signal?: AbortSignal; maxTurns?: number } = {},
): Promise<void> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: prompt }];
  const maxTurns = options.maxTurns ?? 16;
  for (let turn = 0; turn < maxTurns; turn += 1) {
    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages }),
      signal: options.signal,
    });
    const data = (await response.json()) as Turn & { error?: string };
    if (!response.ok) throw new Error(data.error ?? `Serveren svarte ${response.status}.`);
    // Keep the whole assistant turn: thinking blocks go back unchanged.
    messages.push({ role: "assistant", content: data.content as Anthropic.Beta.BetaContentBlockParam[] });
    for (const block of data.content)
      if (block.type === "text" && block.text.trim()) onEvent({ type: "text", text: block.text });
    if (data.stop_reason === "refusal")
      return onEvent({ type: "stopped", reason: data.stop_details?.explanation ?? "Modellen avslo." });
    if (data.stop_reason === "max_tokens")
      return onEvent({ type: "stopped", reason: "Svaret ble kuttet ved lengdegrensen." });
    if (data.stop_reason === "pause_turn") continue;
    const uses = data.content.filter((block): block is ToolUse => block.type === "tool_use");
    if (uses.length === 0) return;
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const use of uses) {
      const result = await runTool(agent, use);
      onEvent({ type: "tool", summary: result.summary, ok: result.ok });
      results.push({
        type: "tool_result",
        tool_use_id: use.id,
        content: result.content,
        ...(use.name !== "act" && !result.ok ? { is_error: true } : {}),
      });
    }
    messages.push({ role: "user", content: results });
  }
  onEvent({ type: "stopped", reason: `Stoppet etter ${maxTurns} runder.` });
}
