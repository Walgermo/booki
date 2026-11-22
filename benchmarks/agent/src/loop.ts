import Anthropic from "@anthropic-ai/sdk";

import { emptyUsage, type UsageTotals } from "./pricing.js";
import type { Session } from "./session.js";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type ToolCall = {
  name: string;
  input: unknown;
  isError: boolean;
  /** The result's text (images are shown as a placeholder; the transcript has them). */
  output: string;
  ms: number;
};

export type LoopResult = {
  /** Why the loop ended: a stop reason, "step_cap", or "api_error". */
  ended: string;
  error?: string;
  requests: number;
  toolCalls: ToolCall[];
  usage: UsageTotals;
  /** `usage` of every request, as the API reported it. */
  usagePerRequest: Anthropic.Usage[];
  /** The model id the API answered with, per request. */
  servedModels: string[];
  wallMs: number;
  finalText: string;
  /** Every message of the run, exactly as sent and received, thinking included. */
  transcript: Anthropic.MessageParam[];
};

export type LoopOptions = {
  client: Anthropic;
  model: string;
  effort: Effort | null;
  maxSteps: number;
  system: string;
  task: string;
  session: Session;
};

/** Errors that will fail every run the same way: stop the benchmark. */
export class FatalApiError extends Error {}

/**
 * A plain tool-use loop: send, run the tools the model asked for, send the
 * results back, until the model stops or the step cap is reached.
 */
export async function runLoop(options: LoopOptions): Promise<LoopResult> {
  const { client, model, effort, maxSteps, system, task, session } = options;
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: task }];
  const result: LoopResult = {
    ended: "step_cap",
    requests: 0,
    toolCalls: [],
    usage: emptyUsage(),
    usagePerRequest: [],
    servedModels: [],
    wallMs: 0,
    finalText: "",
    transcript: messages,
  };
  const started = performance.now();

  try {
    while (result.requests < maxSteps) {
      const response = await client.messages.create({
        model,
        max_tokens: 16_000,
        system,
        tools: session.tools,
        messages,
        // Caches the growing prefix (tools, system, earlier turns) between
        // requests of one run. Cache writes and reads are reported and priced.
        cache_control: { type: "ephemeral" },
        ...(effort ? { output_config: { effort } } : {}),
      });

      result.requests += 1;
      result.usagePerRequest.push(response.usage);
      result.servedModels.push(response.model);
      result.usage.input_tokens += response.usage.input_tokens;
      result.usage.output_tokens += response.usage.output_tokens;
      result.usage.cache_creation_input_tokens += response.usage.cache_creation_input_tokens ?? 0;
      result.usage.cache_read_input_tokens += response.usage.cache_read_input_tokens ?? 0;

      // The whole content goes back, thinking blocks included and unchanged.
      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason === "pause_turn") continue;
      if (response.stop_reason !== "tool_use") {
        result.ended = response.stop_reason ?? "unknown";
        result.finalText = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("\n");
        break;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        const callStarted = performance.now();
        const outcome = await session.run(block.name, block.input);
        result.toolCalls.push({
          name: block.name,
          input: block.input,
          isError: outcome.isError,
          output: outcome.content,
          ms: Math.round(performance.now() - callStarted),
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: outcome.blocks ?? outcome.content,
          ...(outcome.isError ? { is_error: true } : {}),
        });
      }
      // Every result of one assistant turn goes back in one user message.
      messages.push({ role: "user", content: toolResults });
    }
  } catch (error) {
    if (
      error instanceof Anthropic.AuthenticationError ||
      error instanceof Anthropic.PermissionDeniedError ||
      error instanceof Anthropic.NotFoundError ||
      error instanceof Anthropic.BadRequestError
    ) {
      throw new FatalApiError(`${error.status} from the API: ${error.message}`);
    }
    if (error instanceof Anthropic.APIError) {
      // Rate limits, overload and server errors, after the SDK's own retries.
      result.ended = "api_error";
      result.error = `${error.status ?? "connection"}: ${error.message}`;
    } else {
      throw error;
    }
  }

  result.wallMs = Math.round(performance.now() - started);
  return result;
}
