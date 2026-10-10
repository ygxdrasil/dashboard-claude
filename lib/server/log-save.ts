import "server-only";
import { shortDate, stockholmClock, stockholmToday, addDays } from "@/lib/dates";
import { formatHours, formatKr, formatMinutes } from "@/lib/format";
import { TARGET_INFO } from "@/lib/targets";
import type { DataTable } from "@/lib/types";
import type { LogCall } from "@/lib/server/log-tools";
import { db } from "@/lib/server/supabase";
import { setTargets } from "@/lib/server/targets";

type SaveCall = Exclude<LogCall, { tool: "ask_clarification" }>;

/** " (yesterday)" or " (Thu 8 Oct)" when the entry isn't for today. */
function when(date: string): string {
  const today = stockholmToday();
  if (date === today) return "";
  if (date === addDays(today, -1)) return " (yesterday)";
  return ` (${shortDate(date)})`;
}

/** The short line shown to Hamza after saving, e.g. "Gym — 60 min, legs". */
export function confirmation(call: SaveCall): string {
  switch (call.tool) {
    case "log_gym_session": {
      const { date, duration_min, focus } = call.input;
      const details = [duration_min ? `${duration_min} min` : null, focus].filter(Boolean).join(", ");
      return `Gym${details ? ` — ${details}` : ""}${when(date)}`;
    }
    case "log_sleep": {
      const { date, bedtime, wake_time, minutes } = call.input;
      return `Sleep — ${stockholmClock(bedtime)} to ${stockholmClock(wake_time)}, ${formatMinutes(minutes)}${when(date)}`;
    }
    case "log_savings_deposit": {
      const { date, amount_sek } = call.input;
      return `${amount_sek > 0 ? "Saved" : "Withdrew"} ${formatKr(Math.abs(amount_sek))}${when(date)}`;
    }
    case "log_savings_balance":
      return `Savings balance — ${formatKr(call.input.balance_sek)}${when(call.input.date)}`;
    case "log_content_post": {
      const { date, platform, title } = call.input;
      return `Post — ${platform}${title ? `: ${title}` : ""}${when(date)}`;
    }
    case "log_linkedin_connections":
      return `LinkedIn connections — ${call.input.count}${when(call.input.date)}`;
    case "log_work": {
      const { date, hours, note } = call.input;
      return `Work — ${formatHours(hours)}${note ? `, ${note}` : ""}${when(date)}`;
    }
    case "log_project": {
      const { date, project, hours, note } = call.input;
      return `Project ${project} — ${formatHours(hours)}${note ? `, ${note}` : ""}${when(date)}`;
    }
    case "set_target": {
      const info = TARGET_INFO[call.input.metric];
      return `Target — ${info.label}: ${call.input.value} ${info.unit}`;
    }
  }
}

/**
 * Saves every call. Supabase can't wrap several tables in one transaction from
 * here, so if any insert fails, rows already inserted by this log are deleted
 * again ("all or nothing"). Order: plain inserts, then sleep (which can
 * overwrite an earlier entry for the same night), then targets.
 */
export async function saveCalls(calls: SaveCall[], rawLogId: string): Promise<void> {
  const inserted: { table: DataTable; id: string }[] = [];

  async function insert(table: DataTable, row: Record<string, unknown>) {
    const { data, error } = await db()
      .from(table)
      .insert({ ...row, raw_log_id: rawLogId } as never)
      .select("id")
      .single();
    if (error) throw new Error(`${table}: ${error.message}`);
    inserted.push({ table, id: (data as { id: string }).id });
  }

  try {
    for (const call of calls) {
      switch (call.tool) {
        case "log_gym_session":
          await insert("gym_sessions", { date: call.input.date, duration_min: call.input.duration_min ?? null, focus: call.input.focus ?? null, note: call.input.note ?? null });
          break;
        case "log_savings_deposit":
          await insert("savings_deposits", { date: call.input.date, amount_sek: call.input.amount_sek, note: call.input.note ?? null });
          break;
        case "log_savings_balance":
          await insert("savings_balances", { date: call.input.date, balance_sek: call.input.balance_sek });
          break;
        case "log_content_post":
          await insert("content_posts", { date: call.input.date, platform: call.input.platform, title: call.input.title ?? null });
          break;
        case "log_linkedin_connections":
          await insert("linkedin_connections", { date: call.input.date, count: call.input.count });
          break;
        case "log_work":
          await insert("work_logs", { date: call.input.date, hours: call.input.hours, note: call.input.note ?? null });
          break;
        case "log_project":
          await insert("project_logs", { date: call.input.date, project: call.input.project, hours: call.input.hours, note: call.input.note ?? null });
          break;
      }
    }

    // One row per night: logging the same night again replaces it.
    for (const call of calls) {
      if (call.tool !== "log_sleep") continue;
      const { date, bedtime, wake_time } = call.input;
      const { error } = await db()
        .from("sleep_logs")
        .upsert({ date, bedtime, wake_time, raw_log_id: rawLogId }, { onConflict: "date" });
      if (error) throw new Error(`sleep_logs: ${error.message}`);
    }

    const targets = calls.filter((c) => c.tool === "set_target");
    if (targets.length > 0) {
      await setTargets(Object.fromEntries(targets.map((t) => [t.input.metric, t.input.value])));
    }
  } catch (e) {
    for (const row of inserted.reverse()) {
      const { error } = await db().from(row.table).delete().eq("id", row.id);
      if (error) console.error(`[log rollback] could not delete ${row.table} ${row.id}:`, error.message);
    }
    throw e;
  }
}
