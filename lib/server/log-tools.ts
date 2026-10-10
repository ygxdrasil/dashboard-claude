import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { addDays, isValidDate, stockholmDateOf, stockholmLocalToIso, stockholmToday } from "@/lib/dates";
import { TARGET_INFO } from "@/lib/targets";
import { TARGET_METRICS } from "@/lib/types";

// The tools Claude can call when turning a day log into entries (spec 6.1).
// Each tool has two halves:
//   1. a JSON schema Claude sees (what it's allowed to send), and
//   2. a zod schema the server checks it against before anything is saved.
// Number limits live in zod only; the JSON schemas stay plain so strict mode accepts them.

// ---------- Tool definitions sent to Claude ----------

const DATE = { type: "string", description: "YYYY-MM-DD" } as const;

function tool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[],
): Anthropic.Beta.BetaTool {
  return {
    name,
    description,
    strict: true,
    input_schema: { type: "object", properties, required, additionalProperties: false },
  };
}

export const LOG_TOOLS: Anthropic.Beta.BetaTool[] = [
  tool(
    "log_gym_session",
    "A gym session. Session only: no sets, reps or weights.",
    {
      date: DATE,
      duration_min: { type: "integer", description: "Length in minutes, e.g. 1h → 60. Omit if not said." },
      focus: { type: "string", description: "Short lowercase focus, e.g. push, pull, legs, upper, full, cardio. Omit if not said." },
      note: { type: "string", description: "Anything else worth keeping, in Hamza's words. Omit if nothing." },
    },
    ["date"],
  ),
  tool(
    "log_sleep",
    "One night of sleep, labelled by the date Hamza woke up.",
    {
      wake_date: DATE,
      bedtime: { type: "string", description: "Stockholm time with offset, e.g. 2026-10-09T23:40:00+02:00" },
      wake_time: { type: "string", description: "Stockholm time with offset, e.g. 2026-10-10T07:10:00+02:00" },
    },
    ["wake_date", "bedtime", "wake_time"],
  ),
  tool(
    "log_savings_deposit",
    "Money put into savings (positive) or taken out (negative), in whole kronor.",
    {
      date: DATE,
      amount_sek: { type: "integer", description: "Positive for saved, negative for withdrawn. Never 0." },
      note: { type: "string", description: "Optional short note." },
    },
    ["date", "amount_sek"],
  ),
  tool(
    "log_savings_balance",
    "The total in savings right now, e.g. 'savings at 41 200'.",
    { date: DATE, balance_sek: { type: "integer", description: "Total savings in whole kronor." } },
    ["date", "balance_sek"],
  ),
  tool(
    "log_content_post",
    "A post Hamza published.",
    {
      date: DATE,
      platform: { type: "string", description: "e.g. LinkedIn, Instagram, TikTok, YouTube, X, Blog" },
      title: { type: "string", description: "Short topic or title if given. Omit if not." },
    },
    ["date", "platform"],
  ),
  tool(
    "log_linkedin_connections",
    "Hamza's current LinkedIn connection count.",
    { date: DATE, count: { type: "integer" } },
    ["date", "count"],
  ),
  tool(
    "log_work",
    "Hours worked at RKJH (his job at the accounting firm). Never include client details.",
    {
      date: DATE,
      hours: { type: "number", description: "e.g. 3, 1.5, 0.25" },
      note: { type: "string", description: "Short note in Hamza's own words. No client names, companies or figures." },
    },
    ["date", "hours"],
  ),
  tool(
    "log_project",
    "Hours on one of Hamza's own side projects.",
    {
      date: DATE,
      project: { type: "string", description: "Project name as Hamza calls it, e.g. dashboard" },
      hours: { type: "number" },
      note: { type: "string", description: "Optional short note." },
    },
    ["date", "project", "hours"],
  ),
  tool(
    "set_target",
    "Change one of the six targets.",
    {
      metric: { type: "string", enum: [...TARGET_METRICS] },
      value: { type: "number" },
    },
    ["metric", "value"],
  ),
  tool(
    "ask_clarification",
    "Ask Hamza one short question instead of saving anything.",
    {
      question: { type: "string" },
      reason: {
        type: "string",
        enum: ["missing_info", "client_details"],
        description: "client_details if a work note mentions a client, client company or client figures.",
      },
    },
    ["question", "reason"],
  ),
];

// ---------- Server-side checks ----------

const text = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) =>
  z.string().trim().max(max).optional().transform((s) => (s ? s : undefined));

// A real date, not in the future, not absurdly old.
const pastDate = z.string().refine(
  (d) => isValidDate(d) && d <= stockholmToday() && d >= "2020-01-01",
  "date must be a real date, today or earlier",
);

const hours = z.number().gt(0).max(24);

const GymSession = z.object({
  date: pastDate,
  duration_min: z.number().int().min(1).max(600).optional(),
  focus: optionalText(40).transform((s) => s?.toLowerCase()),
  note: optionalText(500),
});

const Sleep = z
  .object({ wake_date: pastDate, bedtime: z.string(), wake_time: z.string() })
  .transform((v, ctx) => {
    // Re-apply the correct Stockholm offset, so a wrong offset from the model can't shift the times.
    const bedtime = stockholmLocalToIso(v.bedtime);
    const wake_time = stockholmLocalToIso(v.wake_time);
    if (!bedtime || !wake_time) {
      ctx.addIssue({ code: "custom", message: "sleep times must be date and time" });
      return z.NEVER;
    }
    const minutes = (Date.parse(wake_time) - Date.parse(bedtime)) / 60000;
    if (minutes <= 0 || minutes > 20 * 60) {
      ctx.addIssue({ code: "custom", message: "sleep must be between 0 and 20 hours long" });
      return z.NEVER;
    }
    // The row is labelled by the wake-up date; the wake time decides it.
    const date = stockholmDateOf(new Date(wake_time));
    if (date > stockholmToday()) {
      ctx.addIssue({ code: "custom", message: "wake-up date is in the future" });
      return z.NEVER;
    }
    return { date, bedtime, wake_time, minutes };
  });

const SavingsDeposit = z.object({
  date: pastDate,
  amount_sek: z.number().int().refine((n) => n !== 0, "amount can't be 0").refine((n) => Math.abs(n) <= 10_000_000),
  note: optionalText(300),
});

const SavingsBalance = z.object({ date: pastDate, balance_sek: z.number().int().min(0).max(100_000_000) });

const ContentPost = z.object({ date: pastDate, platform: text(40), title: optionalText(200) });

const LinkedinConnections = z.object({ date: pastDate, count: z.number().int().min(0).max(1_000_000) });

const Work = z.object({ date: pastDate, hours, note: optionalText(500) });

const Project = z.object({ date: pastDate, project: text(80), hours, note: optionalText(500) });

const SetTarget = z
  .object({ metric: z.enum(TARGET_METRICS), value: z.number().min(0) })
  .refine((t) => t.value <= TARGET_INFO[t.metric].max, "target is above the allowed maximum");

const AskClarification = z.object({
  question: text(300),
  reason: z.enum(["missing_info", "client_details"]),
});

export type LogCall =
  | { tool: "log_gym_session"; input: z.output<typeof GymSession> }
  | { tool: "log_sleep"; input: z.output<typeof Sleep> }
  | { tool: "log_savings_deposit"; input: z.output<typeof SavingsDeposit> }
  | { tool: "log_savings_balance"; input: z.output<typeof SavingsBalance> }
  | { tool: "log_content_post"; input: z.output<typeof ContentPost> }
  | { tool: "log_linkedin_connections"; input: z.output<typeof LinkedinConnections> }
  | { tool: "log_work"; input: z.output<typeof Work> }
  | { tool: "log_project"; input: z.output<typeof Project> }
  | { tool: "set_target"; input: z.output<typeof SetTarget> }
  | { tool: "ask_clarification"; input: z.output<typeof AskClarification> };

const SCHEMAS = {
  log_gym_session: GymSession,
  log_sleep: Sleep,
  log_savings_deposit: SavingsDeposit,
  log_savings_balance: SavingsBalance,
  log_content_post: ContentPost,
  log_linkedin_connections: LinkedinConnections,
  log_work: Work,
  log_project: Project,
  set_target: SetTarget,
  ask_clarification: AskClarification,
} as const;

/** Checks one tool call from Claude. Returns the clean call or a readable problem. */
export function validateCall(name: string, input: unknown): { ok: true; call: LogCall } | { ok: false; problem: string } {
  if (!(name in SCHEMAS)) return { ok: false, problem: `unknown tool ${name}` };
  const result = SCHEMAS[name as keyof typeof SCHEMAS].safeParse(input);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue.path.length ? ` (${issue.path.join(".")})` : "";
    return { ok: false, problem: `${name.replace(/_/g, " ")}: ${issue.message}${where}` };
  }
  return { ok: true, call: { tool: name, input: result.data } as LogCall };
}

/** Used in the prompt so "yesterday" etc. resolve against Stockholm time. */
export function dateContext(): string {
  const today = stockholmToday();
  const weekday = new Date(`${today}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
  return `Today is ${weekday} ${today} (Europe/Stockholm). Yesterday was ${addDays(today, -1)}.`;
}
