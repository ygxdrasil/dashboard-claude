import "server-only";
import { cache } from "react";
import { addDays, dayMonth, daysBetween, relativeDay, shortDate, stockholmClock, stockholmToday, weekStart } from "@/lib/dates";
import { formatHours, formatKr, formatMinutes } from "@/lib/format";
import type {
  ContentPost,
  GymSession,
  LinkedinConnections,
  ProjectLog,
  SavingsBalance,
  SavingsDeposit,
  SleepLog,
  TargetMetric,
  WorkLog,
} from "@/lib/types";
import { db } from "@/lib/server/supabase";
import { getTargets, type TargetValues } from "@/lib/server/targets";

// All the numbers on the dashboard are computed here, in code — never by the AI.
// Cards and charts use it now; the morning brief and "Ask" will use it later.
// The pure functions take rows + today's date, so they can be tested without a database.

export const SAVINGS_GOAL_SEK = 200_000;
const CHART_WEEKS = 8;
const SLEEP_NIGHTS = 14;

export type Rows = {
  gym: GymSession[];
  sleep: SleepLog[];
  deposits: SavingsDeposit[];
  balances: SavingsBalance[];
  posts: ContentPost[];
  connections: LinkedinConnections[];
  work: WorkLog[];
  projects: ProjectLog[];
  targets: TargetValues;
};

// ---------- Loading ----------

/**
 * Loads everything the dashboard needs. Savings and LinkedIn are loaded in full
 * (totals need the whole history); the rest from `since` onwards.
 * Wrapped in React's cache() so cards and charts share one load per request.
 */
export const loadRows = cache(async (since: string): Promise<Rows> => {
  const recent = <T extends string>(table: T) =>
    db().from(table as "gym_sessions").select("*").gte("date", since).order("date").order("created_at");
  const all = <T extends string>(table: T) =>
    db().from(table as "savings_deposits").select("*").order("date").order("created_at");

  const [gym, sleep, deposits, balances, posts, connections, work, projects, targets] = await Promise.all([
    recent("gym_sessions"),
    recent("sleep_logs"),
    all("savings_deposits"),
    all("savings_balances"),
    recent("content_posts"),
    all("linkedin_connections"),
    recent("work_logs"),
    recent("project_logs"),
    getTargets(),
  ]);
  for (const r of [gym, sleep, deposits, balances, posts, connections, work, projects]) {
    if (r.error) throw new Error(r.error.message);
  }
  // Postgres "numeric" columns can arrive as strings; make every number a number.
  const num = <R,>(rows: unknown, keys: string[]) =>
    (rows as Record<string, unknown>[]).map((row) => {
      const out = { ...row };
      for (const k of keys) if (out[k] !== null && out[k] !== undefined) out[k] = Number(out[k]);
      return out as R;
    });
  return {
    gym: num<GymSession>(gym.data, ["duration_min"]),
    sleep: num<SleepLog>(sleep.data, ["hours"]),
    deposits: num<SavingsDeposit>(deposits.data, ["amount_sek"]),
    balances: num<SavingsBalance>(balances.data, ["balance_sek"]),
    posts: posts.data as unknown as ContentPost[],
    connections: num<LinkedinConnections>(connections.data, ["count"]),
    work: num<WorkLog>(work.data, ["hours"]),
    projects: num<ProjectLog>(projects.data, ["hours"]),
    targets,
  };
});

/** Rows covering the cards (this week) and charts (8 weeks, 14 nights). */
export function loadDashboardRows(today: string = stockholmToday()) {
  return loadRows(addDays(weekStart(today), -7 * (CHART_WEEKS - 1)));
}

// ---------- Savings ----------

/** Spec 4: latest balance snapshot + deposits dated after it. No snapshot → sum of deposits. */
export function savingsTotalAt(date: string, balances: SavingsBalance[], deposits: SavingsDeposit[]): number {
  const snapshot = balances
    .filter((b) => b.date <= date)
    .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at))
    .at(-1);
  const from = snapshot?.date ?? "";
  const after = deposits.filter((d) => d.date > from && d.date <= date).reduce((s, d) => s + d.amount_sek, 0);
  return (snapshot?.balance_sek ?? 0) + after;
}

export type SavingsProgress = {
  total: number;
  goal: number;
  percent: number; // 0–100
  avgPerMonth: number | null; // over the last 3 months; null if under ~2 weeks of history
  monthsToGoal: number | null; // at that pace; null if not saving
  thisMonth: number; // change since the end of last month
};

export function savingsProgress(rows: Pick<Rows, "balances" | "deposits">, today: string): SavingsProgress {
  const total = savingsTotalAt(today, rows.balances, rows.deposits);
  const firstDate = [...rows.balances, ...rows.deposits].map((r) => r.date).sort()[0];

  let avgPerMonth: number | null = null;
  if (firstDate) {
    const windowStart = addDays(today, -91);
    const base = firstDate > windowStart ? firstDate : windowStart;
    const months = daysBetween(base, today) / 30.44;
    if (months >= 0.5) {
      avgPerMonth = Math.round((total - savingsTotalAt(base, rows.balances, rows.deposits)) / months);
    }
  }
  const monthsToGoal =
    total >= SAVINGS_GOAL_SEK ? 0 : avgPerMonth && avgPerMonth > 0 ? Math.ceil((SAVINGS_GOAL_SEK - total) / avgPerMonth) : null;
  const lastOfPrevMonth = addDays(`${today.slice(0, 7)}-01`, -1);

  return {
    total,
    goal: SAVINGS_GOAL_SEK,
    percent: Math.min(100, Math.max(0, (total / SAVINGS_GOAL_SEK) * 100)),
    avgPerMonth,
    monthsToGoal,
    thisMonth: total - savingsTotalAt(lastOfPrevMonth, rows.balances, rows.deposits),
  };
}

// ---------- Weekly totals ----------

export type WeekSummary = {
  weekStart: string; // Monday
  gymSessions: number;
  sleepAvgHours: number | null;
  sleepNights: number;
  posts: number;
  workHours: number;
  projectHours: number;
  savedSek: number; // change in savings total over the week
  savingsTotal: number; // at the end of the week (or today)
};

/** One row per week, oldest first, ending with the current week. */
export function weeklySummary(rows: Rows, today: string, weeks: number): WeekSummary[] {
  const thisMonday = weekStart(today);
  const out: WeekSummary[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = addDays(thisMonday, -7 * i);
    const end = i === 0 ? today : addDays(start, 6);
    const inWeek = (d: { date: string }) => d.date >= start && d.date <= end;
    const nights = rows.sleep.filter(inWeek).filter((s) => s.hours !== null);
    const total = savingsTotalAt(end, rows.balances, rows.deposits);
    out.push({
      weekStart: start,
      gymSessions: rows.gym.filter(inWeek).length,
      sleepAvgHours: nights.length ? nights.reduce((s, n) => s + (n.hours ?? 0), 0) / nights.length : null,
      sleepNights: nights.length,
      posts: rows.posts.filter(inWeek).length,
      workHours: sum(rows.work.filter(inWeek).map((w) => w.hours)),
      projectHours: sum(rows.projects.filter(inWeek).map((p) => p.hours)),
      savedSek: total - savingsTotalAt(addDays(start, -1), rows.balances, rows.deposits),
      savingsTotal: total,
    });
  }
  return out;
}

const sum = (xs: number[]) => Math.round(xs.reduce((s, x) => s + x, 0) * 100) / 100;

// ---------- Cards ----------

export type CardStatus = "on_track" | "behind" | "none";

export type Card = {
  area: "Gym" | "Sleep" | "Savings" | "Content" | "Work" | "Projects";
  value: string; // the big number, e.g. "3"
  unit: string; // e.g. "/ 4 sessions"
  progress: number | null; // 0–1 for the bar; null = no bar
  status: CardStatus;
  detail: string | null; // small line under the bar
  last: string | null; // last entry
};

/**
 * On track = at least the pace needed by the end of yesterday (today isn't over yet).
 * Monday always counts as on track.
 */
function paceStatus(value: number, target: number | undefined, today: string): CardStatus {
  if (target === undefined || target === 0) return "none";
  const daysDone = daysBetween(weekStart(today), today); // 0 on Monday
  const expected = (target * daysDone) / 7;
  return value + 1e-9 >= Math.floor(expected * 100) / 100 ? "on_track" : "behind";
}

function targetUnit(metric: TargetMetric, targets: TargetValues, noun: string): string {
  const t = targets[metric];
  return t === undefined ? noun : `/ ${t} ${noun}`;
}

export function buildCards(rows: Rows, today: string): Card[] {
  const week = weeklySummary(rows, today, 1)[0];
  const t = rows.targets;
  const progress = (v: number, target?: number) => (target ? Math.min(1, v / target) : null);
  const noTarget = "No target set";

  // Gym
  const lastGym = rows.gym.at(-1);
  const gym: Card = {
    area: "Gym",
    value: String(week.gymSessions),
    unit: targetUnit("gym_sessions_per_week", t, "sessions this week"),
    progress: progress(week.gymSessions, t.gym_sessions_per_week),
    status: paceStatus(week.gymSessions, t.gym_sessions_per_week, today),
    detail: t.gym_sessions_per_week === undefined ? noTarget : null,
    last: lastGym
      ? [relativeDay(lastGym.date, today), lastGym.duration_min ? `${lastGym.duration_min} min` : null, lastGym.focus]
          .filter(Boolean)
          .join(" · ")
      : null,
  };

  // Sleep: average of this week's nights against the average target.
  const sleepTarget = t.sleep_hours_avg;
  const lastSleep = rows.sleep.at(-1);
  const avg = week.sleepAvgHours;
  const sleep: Card = {
    area: "Sleep",
    value: avg === null ? "–" : (Math.round(avg * 10) / 10).toString(),
    unit: sleepTarget === undefined ? "h average this week" : `/ ${sleepTarget} h average`,
    progress: avg !== null && sleepTarget ? Math.min(1, avg / sleepTarget) : null,
    status: avg === null || !sleepTarget ? "none" : avg + 1e-9 >= sleepTarget ? "on_track" : "behind",
    detail: sleepTarget === undefined ? noTarget : `${week.sleepNights} ${week.sleepNights === 1 ? "night" : "nights"} logged`,
    last: lastSleep
      ? `${lastSleep.date === today ? "Last night" : shortDate(lastSleep.date)} · ${formatMinutes((lastSleep.hours ?? 0) * 60)} · ${stockholmClock(lastSleep.bedtime)}–${stockholmClock(lastSleep.wake_time)}`
      : null,
  };

  // Savings: total toward the 200 000 kr goal. Colour follows the monthly target's pace.
  const sp = savingsProgress(rows, today);
  const monthly = t.savings_sek_per_month;
  const dayOfMonth = Number(today.slice(8, 10));
  const daysInMonth = new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).getUTCDate();
  const lastSavings = [...rows.deposits.map((d) => ({ ...d, kind: "d" as const })), ...rows.balances.map((b) => ({ ...b, kind: "b" as const }))]
    .sort((a, b) => a.date.localeCompare(b.date) || a.created_at.localeCompare(b.created_at))
    .at(-1);
  const savings: Card = {
    area: "Savings",
    value: formatKr(sp.total),
    unit: `/ ${formatKr(SAVINGS_GOAL_SEK)}`,
    progress: sp.percent / 100,
    status:
      monthly === undefined || monthly === 0
        ? "on_track"
        : sp.thisMonth + 1e-9 >= (monthly * (dayOfMonth - 1)) / daysInMonth
          ? "on_track"
          : "behind",
    detail: `${sp.thisMonth >= 0 ? "+" : "−"}${formatKr(Math.abs(sp.thisMonth))} this month${monthly !== undefined ? ` / ${formatKr(monthly)}` : ""}`,
    last: lastSavings
      ? lastSavings.kind === "d"
        ? `${lastSavings.amount_sek > 0 ? "Saved" : "Withdrew"} ${formatKr(Math.abs(lastSavings.amount_sek))} · ${relativeDay(lastSavings.date, today)}`
        : `Balance ${formatKr(lastSavings.balance_sek)} · ${relativeDay(lastSavings.date, today)}`
      : null,
  };

  // Content: posts this week; LinkedIn count as the detail line.
  const lastPost = rows.posts.at(-1);
  const lastConn = rows.connections.at(-1);
  const content: Card = {
    area: "Content",
    value: String(week.posts),
    unit: targetUnit("content_posts_per_week", t, "posts this week"),
    progress: progress(week.posts, t.content_posts_per_week),
    status: paceStatus(week.posts, t.content_posts_per_week, today),
    detail: lastConn ? `${lastConn.count} LinkedIn connections` : t.content_posts_per_week === undefined ? noTarget : null,
    last: lastPost ? `${lastPost.platform}${lastPost.title ? `: ${lastPost.title}` : ""} · ${relativeDay(lastPost.date, today)}` : null,
  };

  // Work (RKJH)
  const lastWork = rows.work.at(-1);
  const work: Card = {
    area: "Work",
    value: String(week.workHours),
    unit: targetUnit("work_hours_per_week", t, "h this week"),
    progress: progress(week.workHours, t.work_hours_per_week),
    status: paceStatus(week.workHours, t.work_hours_per_week, today),
    detail: t.work_hours_per_week === undefined ? noTarget : null,
    last: lastWork ? `${formatHours(lastWork.hours)}${lastWork.note ? ` · ${lastWork.note}` : ""} · ${relativeDay(lastWork.date, today)}` : null,
  };

  // Side projects (all projects together)
  const lastProject = rows.projects.at(-1);
  const projects: Card = {
    area: "Projects",
    value: String(week.projectHours),
    unit: targetUnit("project_hours_per_week", t, "h this week"),
    progress: progress(week.projectHours, t.project_hours_per_week),
    status: paceStatus(week.projectHours, t.project_hours_per_week, today),
    detail: t.project_hours_per_week === undefined ? noTarget : null,
    last: lastProject ? `${lastProject.project} · ${formatHours(lastProject.hours)} · ${relativeDay(lastProject.date, today)}` : null,
  };

  return [gym, sleep, savings, content, work, projects];
}

// ---------- Charts ----------

export type ChartData = {
  sleep: { date: string; label: string; hours: number | null }[];
  gymWeeks: { weekStart: string; label: string; sessions: number }[];
  hoursWeeks: { weekStart: string; label: string; work: number; projects: number }[];
  savings: { t: number; date: string; total: number }[];
  connections: { t: number; date: string; count: number }[];
  targets: { sleep?: number; gym?: number };
  goal: number;
};

const ts = (date: string) => Date.parse(`${date}T12:00:00Z`);

export function buildCharts(rows: Rows, today: string): ChartData {
  const sleepByDate = new Map(rows.sleep.map((s) => [s.date, s.hours]));
  const sleep = Array.from({ length: SLEEP_NIGHTS }, (_, i) => {
    const date = addDays(today, i - (SLEEP_NIGHTS - 1));
    const h = sleepByDate.get(date);
    return { date, label: shortDate(date).replace(/ \w+$/, ""), hours: h === undefined || h === null ? null : Math.round(h * 100) / 100 };
  });

  const weeks = weeklySummary(rows, today, CHART_WEEKS);

  // Savings: one point per day something changed, plus today.
  const eventDates = [...new Set([...rows.balances, ...rows.deposits].map((r) => r.date))].sort();
  if (eventDates.length && eventDates.at(-1) !== today) eventDates.push(today);
  const savings = eventDates.map((date) => ({ t: ts(date), date, total: savingsTotalAt(date, rows.balances, rows.deposits) }));

  // LinkedIn: the last count of each day.
  const connByDate = new Map(rows.connections.map((c) => [c.date, c.count]));
  const connections = [...connByDate.entries()].map(([date, count]) => ({ t: ts(date), date, count }));

  return {
    sleep,
    gymWeeks: weeks.map((w) => ({ weekStart: w.weekStart, label: dayMonth(w.weekStart), sessions: w.gymSessions })),
    hoursWeeks: weeks.map((w) => ({ weekStart: w.weekStart, label: dayMonth(w.weekStart), work: w.workHours, projects: w.projectHours })),
    savings,
    connections,
    targets: { sleep: rows.targets.sleep_hours_avg, gym: rows.targets.gym_sessions_per_week },
    goal: SAVINGS_GOAL_SEK,
  };
}

