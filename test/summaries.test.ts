// Offline checks for the dashboard maths (lib/server/summaries.ts). Made-up data, no database.
// Run with: npm test
import { buildCards, buildCharts, savingsProgress, savingsTotalAt, weeklySummary, type Rows } from "@/lib/server/summaries";
import { weekStart } from "@/lib/dates";

let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail !== undefined ? "  → " + JSON.stringify(detail) : ""}`);
  if (!ok) failed++;
};

const TODAY = "2026-10-10"; // a Saturday
const at = "2026-10-01T00:00:00Z";
const dep = (date: string, amount_sek: number, created_at = at) => ({ id: date + amount_sek, date, amount_sek, note: null, raw_log_id: null, created_at });
const bal = (date: string, balance_sek: number, created_at = at) => ({ id: date + balance_sek, date, balance_sek, raw_log_id: null, created_at });

const empty: Rows = { gym: [], sleep: [], deposits: [], balances: [], posts: [], connections: [], work: [], projects: [], targets: {} };

// ---- Savings total rule (spec section 4) ----
check("no data → 0", savingsTotalAt(TODAY, [], []) === 0);
check("only deposits → their sum", savingsTotalAt(TODAY, [], [dep("2026-10-01", 500), dep("2026-10-05", 800)]) === 1300);
check("withdrawal subtracts", savingsTotalAt(TODAY, [], [dep("2026-10-01", 500), dep("2026-10-05", -200)]) === 300);
const b = [bal("2026-10-03", 41200)];
const d = [dep("2026-10-01", 500), dep("2026-10-03", 300), dep("2026-10-06", 800)];
check("snapshot + deposits AFTER it (same-day and earlier ignored)", savingsTotalAt(TODAY, b, d) === 42000, savingsTotalAt(TODAY, b, d));
check("total as of an earlier date", savingsTotalAt("2026-10-02", b, d) === 500);
check("newest snapshot wins", savingsTotalAt(TODAY, [bal("2026-10-03", 41200), bal("2026-10-08", 45000)], d) === 45000);
check("two snapshots same day → the later one", savingsTotalAt(TODAY, [bal("2026-10-08", 1, "2026-10-08T08:00:00Z"), bal("2026-10-08", 2, "2026-10-08T09:00:00Z")], []) === 2);

// ---- Savings progress ----
const sp = savingsProgress({ balances: [bal("2026-07-01", 20000)], deposits: [dep("2026-08-01", 5000), dep("2026-09-01", 5000), dep("2026-10-01", 5000)] }, TODAY);
check("progress total 35 000", sp.total === 35000, sp);
check("progress percent 17.5", Math.abs(sp.percent - 17.5) < 1e-9, sp.percent);
check("avg per month over last 3 months ≈ 5 000", sp.avgPerMonth !== null && Math.abs(sp.avgPerMonth - 5000) < 200, sp.avgPerMonth);
check("months to goal = ceil(165 000 / avg)", sp.monthsToGoal === Math.ceil(165000 / sp.avgPerMonth!), sp.monthsToGoal);
check("this month = +5 000", sp.thisMonth === 5000, sp.thisMonth);
const fresh = savingsProgress({ balances: [bal("2026-10-08", 41200)], deposits: [] }, TODAY);
check("2 days of history → no average yet", fresh.avgPerMonth === null && fresh.monthsToGoal === null, fresh);

// ---- Weeks (Monday start) ----
check("week of Sat 10 Oct starts Mon 5 Oct", weekStart(TODAY) === "2026-10-05");
check("week of a Monday is itself", weekStart("2026-10-05") === "2026-10-05");
check("week of a Sunday goes back 6 days", weekStart("2026-10-11") === "2026-10-05");

const g = (date: string) => ({ id: date + Math.random(), date, duration_min: 60, focus: "legs", note: null, raw_log_id: null, created_at: `${date}T10:00:00Z` });
const rows: Rows = {
  ...empty,
  gym: [g("2026-10-04"), g("2026-10-05"), g("2026-10-07"), g("2026-10-10")],
  sleep: [
    { id: "s1", date: "2026-10-09", bedtime: "2026-10-08T23:00:00+02:00", wake_time: "2026-10-09T07:00:00+02:00", hours: 8, raw_log_id: null, created_at: at },
    { id: "s2", date: "2026-10-10", bedtime: "2026-10-09T23:40:00+02:00", wake_time: "2026-10-10T07:10:00+02:00", hours: 7.5, raw_log_id: null, created_at: at },
  ],
  work: [{ id: "w", date: "2026-10-06", hours: 3, note: "flow", raw_log_id: null, created_at: at }],
  projects: [
    { id: "p1", date: "2026-10-09", project: "dashboard", hours: 2, note: null, raw_log_id: null, created_at: at },
    { id: "p2", date: "2026-10-10", project: "dashboard", hours: 1.5, note: null, raw_log_id: null, created_at: at },
  ],
  balances: b,
  deposits: d,
  targets: { gym_sessions_per_week: 4, sleep_hours_avg: 8, project_hours_per_week: 10 },
};
const weeks = weeklySummary(rows, TODAY, 2);
check("2 weeks returned, oldest first", weeks.length === 2 && weeks[0].weekStart === "2026-09-28" && weeks[1].weekStart === "2026-10-05");
check("this week: 3 gym sessions (Sunday 4 Oct is last week)", weeks[1].gymSessions === 3 && weeks[0].gymSessions === 1, weeks.map((w) => w.gymSessions));
check("this week: sleep average 7.75 over 2 nights", weeks[1].sleepAvgHours === 7.75 && weeks[1].sleepNights === 2);
check("this week: 3 work h, 3.5 project h", weeks[1].workHours === 3 && weeks[1].projectHours === 3.5);

// ---- Cards ----
const cards = buildCards(rows, TODAY);
const card = (a: string) => cards.find((c) => c.area === a)!;
check("6 cards in spec order", cards.map((c) => c.area).join() === "Gym,Sleep,Savings,Content,Work,Projects");
check("gym card 3 / 4, on track by Saturday (needs ≥ 2.85)", card("Gym").value === "3" && card("Gym").unit === "/ 4 sessions this week" && card("Gym").status === "on_track", card("Gym"));
check("sleep card 7.8 vs 8 → behind", card("Sleep").value === "7.8" && card("Sleep").status === "behind", card("Sleep"));
check("projects 3.5 / 10 h by Saturday → behind (needs 7.1)", card("Projects").status === "behind", card("Projects"));
check("work without a target → no bar, no status", card("Work").progress === null && card("Work").status === "none", card("Work"));
check("savings card value uses the savings rule", card("Savings").value.replace(/\s/g, " ") === "42 000 kr", card("Savings").value);
check("empty data → 'Nothing logged' (last = null)", buildCards(empty, TODAY).every((c) => c.last === null));
const monday = buildCards({ ...rows, gym: [] }, "2026-10-05");
check("Monday with 0 sessions is still on track", monday[0].status === "on_track", monday[0]);

// ---- Charts ----
const charts = buildCharts(rows, TODAY);
check("sleep chart: 14 nights ending today", charts.sleep.length === 14 && charts.sleep.at(-1)!.date === TODAY);
check("sleep chart: missing nights are gaps (null)", charts.sleep[0].hours === null && charts.sleep.at(-1)!.hours === 7.5);
check("gym chart: 8 weeks", charts.gymWeeks.length === 8 && charts.gymWeeks.at(-1)!.sessions === 3);
check("savings chart ends today at the current total", charts.savings.at(-1)!.date === TODAY && charts.savings.at(-1)!.total === 42000, charts.savings.at(-1));

console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) failed.`);
process.exit(failed ? 1 : 0);
