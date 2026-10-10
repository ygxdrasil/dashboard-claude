import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import { FALLBACK, MODEL, claude, recordUsage } from "@/lib/server/claude";
import { LOG_SYSTEM_PROMPT } from "@/lib/server/log-prompt";
import { confirmation, saveCalls } from "@/lib/server/log-save";
import { LOG_TOOLS, dateContext, validateCall, type LogCall } from "@/lib/server/log-tools";
import { db } from "@/lib/server/supabase";
import type { RawLogStatus } from "@/lib/types";

// POST /api/log — "log by talking" (spec 6.1).
// Response shapes:
//   { kind: "saved", items: string[] }
//   { kind: "clarification", question: string, reason: "missing_info" | "client_details" }
//   { kind: "error", message: string }

const Body = z.object({
  text: z.string().trim().min(1).max(2000),
  clarification: z
    .object({ question: z.string().trim().min(1).max(500), answer: z.string().trim().min(1).max(1000) })
    .optional(),
});

const CLIENT_DETAILS_PLACEHOLDER = "[removed: client details]";

function error(message: string, status: number) {
  return NextResponse.json({ kind: "error", message }, { status });
}

async function setStatus(id: string, status: RawLogStatus, text?: string) {
  const { error: e } = await db()
    .from("raw_logs")
    .update(text === undefined ? { status } : { status, text })
    .eq("id", id);
  if (e) console.error("[log] could not update raw_log", id, e.message);
}

export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return error("Please write something to log (max 2000 characters).", 400);

  const { text, clarification } = parsed.data;
  const message = clarification
    ? `${text}\n\nYou asked: ${clarification.question}\nHamza answered: ${clarification.answer}`
    : text;

  // 1. Keep the raw text.
  const { data: rawLog, error: insertError } = await db()
    .from("raw_logs")
    .insert({ text: message, status: "pending" })
    .select("id")
    .single();
  if (insertError || !rawLog) {
    console.error("[log] raw_logs insert:", insertError?.message);
    return error("Could not reach the database. Nothing was saved.", 500);
  }

  // 2. Ask Claude to turn it into tool calls.
  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await claude().beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      output_config: { effort: "low" }, // extraction is simple; low keeps it fast and cheap
      tools: LOG_TOOLS.map((t, i) =>
        i === LOG_TOOLS.length - 1 ? { ...t, cache_control: { type: "ephemeral" } } : t,
      ),
      tool_choice: { type: "auto" },
      system: [
        { type: "text", text: LOG_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
        { type: "text", text: dateContext() }, // after the cache breakpoint on purpose
      ],
      messages: [{ role: "user", content: message }],
      ...FALLBACK,
    });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) {
      console.error("[log] Anthropic rejected the API key.");
      return error("The Anthropic API key was rejected. Check ANTHROPIC_API_KEY. Nothing was saved.", 500);
    }
    if (e instanceof Anthropic.RateLimitError) {
      return error("Claude is rate-limited right now. Try again in a minute. Nothing was saved.", 503);
    }
    console.error("[log] Claude call failed:", e);
    return error(
      e instanceof Error && e.message.includes("ANTHROPIC_API_KEY")
        ? e.message
        : "Claude didn't respond. Nothing was saved. Try again.",
      502,
    );
  }

  // 3. Record what it cost, whatever happens next.
  await recordUsage("log", response);

  if (response.stop_reason === "refusal") {
    await setStatus(rawLog.id, "discarded");
    return error("Claude declined to process that. Nothing was saved. Try rephrasing.", 422);
  }
  if (response.stop_reason === "max_tokens") {
    await setStatus(rawLog.id, "discarded");
    return error("That was too long to process in one go. Nothing was saved. Try splitting it up.", 422);
  }

  // 4. Check every tool call before saving anything.
  const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
  const calls: LogCall[] = [];
  const problems: string[] = [];
  for (const block of toolUses) {
    const result = validateCall(block.name, block.input);
    if (result.ok) calls.push(result.call);
    else problems.push(result.problem);
  }

  // Any question means nothing is saved.
  const ask = calls.find((c) => c.tool === "ask_clarification");
  if (ask && ask.tool === "ask_clarification") {
    if (ask.input.reason === "client_details") {
      // Client information must never be stored, not even in raw_logs.
      await setStatus(rawLog.id, "discarded", CLIENT_DETAILS_PLACEHOLDER);
    } else {
      await setStatus(rawLog.id, "needs_clarification");
    }
    return NextResponse.json({ kind: "clarification", question: ask.input.question, reason: ask.input.reason });
  }

  if (toolUses.length === 0) {
    await setStatus(rawLog.id, "needs_clarification");
    return NextResponse.json({
      kind: "clarification",
      question: "I couldn't find anything to log there. What would you like me to record?",
      reason: "missing_info",
    });
  }

  if (problems.length > 0) {
    console.error("[log] invalid tool input:", problems, JSON.stringify(toolUses.map((b) => b.input)));
    await setStatus(rawLog.id, "discarded");
    return error(`I couldn't make sense of part of that (${problems.join("; ")}). Nothing was saved.`, 422);
  }

  // 5. Save everything, or nothing.
  const toSave = calls.filter((c): c is Exclude<LogCall, { tool: "ask_clarification" }> => c.tool !== "ask_clarification");
  try {
    await saveCalls(toSave, rawLog.id);
  } catch (e) {
    console.error("[log] save failed:", e);
    await setStatus(rawLog.id, "discarded");
    return error("Saving failed. Nothing was saved. Try again.", 500);
  }

  await setStatus(rawLog.id, "saved");
  return NextResponse.json({ kind: "saved", items: toSave.map(confirmation) });
}
