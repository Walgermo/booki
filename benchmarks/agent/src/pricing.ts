/**
 * Anthropic first-party list prices in USD per million tokens.
 *
 * Source: the model table in Claude Code's bundled `claude-api` skill (cached
 * 2026-11-03) and its prompt-caching reference: a 5-minute cache write costs
 * 1.25x the input price; a cache read costs 0.1x unless a model lists its own.
 * Check https://platform.claude.com/docs/en/about-claude/pricing before quoting
 * a cost, and pass `--price-in/--price-out/...` if a price has moved.
 */

export type Prices = {
  /** Uncached input. */
  input: number;
  output: number;
  /** 5-minute cache write. */
  cacheWrite: number;
  cacheRead: number;
};

export type UsageTotals = {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
};

const price = (input: number, output: number, cacheRead = input * 0.1): Prices => ({
  input,
  output,
  cacheWrite: input * 1.25,
  cacheRead,
});

export const PRICES: Record<string, Prices> = {
  "claude-fable-5-2": price(8, 40, 0.2),
  "claude-mythos-5-2": price(8, 40, 0.2),
  "claude-fable-5-1": price(10, 50, 0.25),
  "claude-mythos-5-1": price(10, 50, 0.25),
  "claude-fable-5": price(10, 50),
  "claude-opus-5-5": price(4, 20, 0.2),
  "claude-opus-5": price(5, 25),
  "claude-opus-4-8": price(5, 25),
  "claude-opus-4-7": price(5, 25),
  "claude-opus-4-6": price(5, 25),
  "claude-sonnet-5-5": price(2, 10, 0.1),
  "claude-sonnet-5": price(2, 10),
  "claude-sonnet-4-6": price(3, 15),
  // Prompts up to 100K tokens; this task stays far below that.
  "claude-haiku-5-5": price(0.1, 0.5),
  "claude-haiku-4-5": price(1, 5),
};

export const emptyUsage = (): UsageTotals => ({
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
});

/** Cost of a run in USD, or null when the model has no known price. */
export function costUsd(usage: UsageTotals, prices: Prices | null): number | null {
  if (!prices) return null;
  return (
    (usage.input_tokens * prices.input +
      usage.output_tokens * prices.output +
      usage.cache_creation_input_tokens * prices.cacheWrite +
      usage.cache_read_input_tokens * prices.cacheRead) /
    1_000_000
  );
}

/**
 * The list price for a model id, also in AI Gateway's form
 * ("anthropic/claude-opus-5.5" is "claude-opus-5-5").
 */
export function priceFor(model: string): Prices | undefined {
  const plain = model.replace(/^anthropic\//, "").replace(/(\d)\.(\d)/g, "$1-$2");
  return PRICES[model] ?? PRICES[plain];
}
