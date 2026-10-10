// Claude prices in USD per million tokens (spec section 6.7).
// Cache reads are $0.20, not the $0.10 in the spec: Anthropic's current price,
// confirmed with Hamza on 2026-10-10.
//
// claude-sonnet-5 is listed because the refusal fallback can run on it.
// It has the same prices.

export type ModelPrice = {
  input: number;
  output: number;
  cacheWrite5m: number;
  cacheRead: number;
};

const SONNET: ModelPrice = { input: 2.0, output: 10.0, cacheWrite5m: 2.5, cacheRead: 0.2 };

export const PRICES: Record<string, ModelPrice> = {
  "claude-sonnet-5-5": SONNET,
  "claude-sonnet-5": SONNET,
};

export const MONTHLY_WARNING_USD = 15; // footer turns amber above this
export const MONTHLY_CAP_USD = 20; // Hamza's Console limit

export type TokenCounts = {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
};

export function costUsd(model: string, t: TokenCounts): number {
  const p = PRICES[model] ?? SONNET;
  const usd =
    (t.input_tokens * p.input +
      t.output_tokens * p.output +
      t.cache_write_tokens * p.cacheWrite5m +
      t.cache_read_tokens * p.cacheRead) /
    1_000_000;
  return Math.round(usd * 1_000_000) / 1_000_000;
}
