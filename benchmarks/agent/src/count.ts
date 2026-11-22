/**
 * Token counts for a transcript the model never ran: the scripted agents' calls.
 *
 * With a key, every number comes from the Messages API's count_tokens endpoint
 * for the chosen model (it is free and runs no model). Without one, every
 * number is characters ÷ 4 and is labelled an estimate.
 */
import type Anthropic from "@anthropic-ai/sdk";

import type { Call } from "./scripted.js";

export type CountMethod = "count_tokens" | "estimate: characters / 4";

export type TranscriptCount = {
  method: CountMethod;
  /** count_tokens only: the model the counts are for. */
  model: string | null;
  /** System prompt and task, without tools. */
  base: number;
  /**
   * What the tool definitions add to every request: their schemas and the
   * tool-use preamble the API adds when tools are present.
   */
  toolDefinitions: number;
  /** Per call: the tool_use block plus its tool_result, as they sit in the history. */
  perCall: number[];
  /** base + toolDefinitions + every call: the whole conversation once. */
  transcript: number;
  /**
   * Input billed over the whole loop without caching: one request per call
   * plus the final one, each resending the history so far.
   */
  cumulativeInput: number;
  requests: number;
  /**
   * What the model itself writes: the tool_use blocks (name and arguments)
   * only, per call. A lower bound: a real model also writes reasoning and text.
   */
  outputPerCall: number[];
  outputTokens: number;
  /** Calls whose output could not be counted by the API and fell back to characters ÷ 4. */
  outputEstimatedCalls: number;
  /** Image input in the tool results, by the pixel rule (included in the totals). */
  imageTokens: number;
  /** Total input of each request, in order (request 0 is system + tools + task). */
  inputPerRequest: number[];
};

type Counter = (params: { tools?: Anthropic.Tool[]; messages: Anthropic.MessageParam[] }) => Promise<number>;

export function apiCounter(client: Anthropic, model: string, system: string): Counter {
  return async ({ tools, messages }) => {
    const result = await client.messages.countTokens({
      model,
      system,
      messages,
      ...(tools && tools.length ? { tools } : {}),
    });
    return result.input_tokens;
  };
}

/** The history as the model would hold it: one assistant tool_use, one user tool_result, per call. */
export function transcriptMessages(task: string, calls: Call[]): Anthropic.MessageParam[][] {
  const prefixes: Anthropic.MessageParam[][] = [];
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: task }];
  prefixes.push([...messages]);
  calls.forEach((call, index) => {
    const id = `toolu_bench_${String(index).padStart(3, "0")}`;
    messages.push({
      role: "assistant",
      content: [{ type: "tool_use", id, name: call.tool, input: (call.input ?? {}) as Record<string, unknown> }],
    });
    messages.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: id,
          content: call.blocks ?? call.output,
          ...(call.isError ? { is_error: true } : {}),
        },
      ],
    });
    prefixes.push([...messages]);
  });
  return prefixes;
}

const estimate = (text: string) => Math.round(text.length / 4);

/**
 * Image input tokens by Anthropic's documented rule: an image is first scaled
 * down (aspect kept) to fit the model's limits, then costs (width × height) /
 * 750 tokens. Limits for the high-resolution tier (Opus 4.7 and later,
 * including Opus 5.5), from the claude-api skill's model guide: 2576 px on the
 * long edge, 3.75 megapixels, at most 4784 tokens per image.
 */
export const IMAGE_LIMITS = { longEdge: 2576, megapixels: 3.75, maxTokens: 4784 } as const;

export function imageTokens(width: number, height: number): number {
  const scale = Math.min(
    1,
    IMAGE_LIMITS.longEdge / Math.max(width, height),
    Math.sqrt((IMAGE_LIMITS.megapixels * 1e6) / (width * height)),
  );
  const w = Math.floor(width * scale);
  const h = Math.floor(height * scale);
  return Math.min(IMAGE_LIMITS.maxTokens, Math.ceil((w * h) / 750));
}

/** Width and height of a base64 PNG (IHDR), JPEG (SOF) or null. */
export function imageSize(base64: string): { width: number; height: number } | null {
  const bytes = Buffer.from(base64.slice(0, 200_000), "base64");
  if (bytes.length > 24 && bytes.readUInt32BE(0) === 0x89504e47) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let at = 2;
    while (at + 9 < bytes.length) {
      if (bytes[at] !== 0xff) return null;
      const marker = bytes[at + 1]!;
      const length = bytes.readUInt16BE(at + 2);
      if (marker >= 0xc0 && marker <= 0xc3)
        return { height: bytes.readUInt16BE(at + 5), width: bytes.readUInt16BE(at + 7) };
      at += 2 + length;
    }
  }
  return null;
}

/** Image tokens in one call's result, by the documented rule. */
export function callImageTokens(call: Call): number {
  let total = 0;
  for (const block of call.blocks ?? []) {
    if (block.type !== "image" || block.source.type !== "base64") continue;
    const size = imageSize(block.source.data);
    if (size) total += imageTokens(size.width, size.height);
  }
  return total;
}

export async function countTranscript(options: {
  counter: Counter | null;
  model: string;
  system: string;
  task: string;
  tools: Anthropic.Tool[];
  calls: Call[];
}): Promise<TranscriptCount> {
  const { counter, model, system, task, tools, calls } = options;

  if (!counter) {
    const base = estimate(system) + estimate(task);
    const toolDefinitions = estimate(JSON.stringify(tools));
    // Text at characters ÷ 4; images by the documented pixel rule.
    const perCall = calls.map(
      (call) => estimate(call.tool + JSON.stringify(call.input ?? {}) + call.output) + callImageTokens(call),
    );
    let running = base + toolDefinitions;
    let cumulativeInput = running;
    const inputPerRequest = [running];
    for (const n of perCall) {
      running += n;
      cumulativeInput += running;
      inputPerRequest.push(running);
    }
    const outputPerCall = calls.map((call) => estimate(call.tool + JSON.stringify(call.input ?? {})));
    return {
      method: "estimate: characters / 4",
      model: null,
      base,
      toolDefinitions,
      perCall,
      transcript: running,
      cumulativeInput,
      requests: calls.length + 1,
      outputPerCall,
      outputTokens: outputPerCall.reduce((a, b) => a + b, 0),
      outputEstimatedCalls: calls.length,
      imageTokens: calls.reduce((sum, call) => sum + callImageTokens(call), 0),
      inputPerRequest,
    };
  }

  const prefixes = transcriptMessages(task, calls);
  const base = await counter({ messages: prefixes[0]! });
  const totals: number[] = [];
  for (const messages of prefixes) totals.push(await counter({ tools, messages }));
  const toolDefinitions = totals[0]! - base;
  const perCall = totals.slice(1).map((total, index) => total - totals[index]!);
  // Output: the history with call k's tool_use appended, minus the history before it.
  const outputPerCall: number[] = [];
  let outputEstimatedCalls = 0;
  for (const [index, call] of calls.entries()) {
    const assistant = transcriptMessages(task, calls.slice(0, index + 1))
      .at(-1)!
      .at(-2)!;
    const withUse = await counter({ tools, messages: [...prefixes[index]!, assistant] }).catch(() => null);
    if (withUse === null) outputEstimatedCalls += 1;
    outputPerCall.push(
      withUse === null ? estimate(call.tool + JSON.stringify(call.input ?? {})) : withUse - totals[index]!,
    );
  }
  return {
    method: "count_tokens",
    model,
    base,
    toolDefinitions,
    perCall,
    transcript: totals[totals.length - 1]!,
    cumulativeInput: totals.reduce((sum, n) => sum + n, 0),
    requests: totals.length,
    outputPerCall,
    outputTokens: outputPerCall.reduce((a, b) => a + b, 0),
    outputEstimatedCalls,
    // count_tokens counts the images itself; this is the pixel rule's figure for comparison.
    imageTokens: calls.reduce((sum, call) => sum + callImageTokens(call), 0),
    inputPerRequest: totals,
  };
}

/** Tool-definition tokens alone, for the results file of a real run. */
export async function countToolDefinitions(counter: Counter, task: string, tools: Anthropic.Tool[]): Promise<number> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: task }];
  return (await counter({ tools, messages })) - (await counter({ messages }));
}

export type Prices = { input: number; output: number; cacheWrite: number; cacheRead: number };

export type CostEstimate = {
  /** Every request's whole input at the input price, plus output. */
  noCache: number;
  /**
   * Per request, the prefix sent before is a cache read and the newly
   * appended part a 5-minute cache write; plus output. Ignores the model's
   * minimum cacheable length, so short transcripts come out cheaper than
   * they would be billed.
   */
  withCache: number;
};

export function transcriptCost(count: TranscriptCount, prices: Prices): CostEstimate {
  const perMillion = (tokens: number, price: number) => (tokens * price) / 1_000_000;
  const output = perMillion(count.outputTokens, prices.output);
  let withCache = output;
  count.inputPerRequest.forEach((total, index) => {
    const before = index === 0 ? 0 : count.inputPerRequest[index - 1]!;
    withCache += perMillion(before, prices.cacheRead) + perMillion(total - before, prices.cacheWrite);
  });
  return { noCache: perMillion(count.cumulativeInput, prices.input) + output, withCache };
}
