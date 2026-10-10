import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { costUsd, type TokenCounts } from "@/lib/pricing";
import { db } from "@/lib/server/supabase";
import type { AiFeature } from "@/lib/types";

export const MODEL = "claude-sonnet-5-5";

// If Sonnet 5.5 declines on safety grounds, Anthropic re-runs the request on a
// fallback model (confirmed with Hamza on 2026-10-10). Rare for a life log.
export const FALLBACK: { betas: Anthropic.AnthropicBeta[]; fallbacks: "default" } = {
  betas: ["server-side-fallback-2026-07-01"],
  fallbacks: "default",
};

let client: Anthropic | null = null;

export function claude(): Anthropic {
  if (client) return client;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is missing. Check .env.local (or Vercel env vars).");
  }
  client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

/** Writes one row to ai_usage. Never throws: a logging hiccup shouldn't break a log. */
export async function recordUsage(
  feature: AiFeature,
  response: { model: string; usage: Anthropic.Beta.BetaUsage },
): Promise<void> {
  const counts: TokenCounts = {
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cache_read_tokens: response.usage.cache_read_input_tokens ?? 0,
    cache_write_tokens: response.usage.cache_creation_input_tokens ?? 0,
  };
  const { error } = await db()
    .from("ai_usage")
    .insert({ feature, model: response.model, ...counts, cost_usd: costUsd(response.model, counts) });
  if (error) console.error("[ai_usage]", error.message);
}
