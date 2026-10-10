// Offline checks for the logging logic. No Claude or database calls.
// Run with: npm test
import { addDays, stockholmLocalToIso, stockholmToday } from "@/lib/dates";
import { confirmation } from "@/lib/server/log-save";
import { validateCall, type LogCall } from "@/lib/server/log-tools";
import { costUsd } from "@/lib/pricing";
import { formatKr } from "@/lib/format";

const today = stockholmToday();
const yesterday = addDays(today, -1);
let failed = 0;
const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${!ok && detail !== undefined ? "  → " + JSON.stringify(detail) : ""}`);
  if (!ok) failed++;
};
const run = (name: string, input: unknown) => validateCall(name, input);
const line = (name: string, input: unknown) => {
  const r = run(name, input);
  return r.ok ? confirmation(r.call as Exclude<LogCall, { tool: "ask_clarification" }>) : `INVALID: ${r.problem}`;
};

console.log(`today = ${today}\n`);
console.log("— Test sentence 1: gym 1h legs, slept 23:40 to 7:10, worked 3h on the power automate flow");
console.log("  ", line("log_gym_session", { date: today, duration_min: 60, focus: "Legs" }));
console.log("  ", line("log_sleep", { wake_date: today, bedtime: `${yesterday}T23:40:00+02:00`, wake_time: `${today}T07:10:00+02:00` }));
console.log("  ", line("log_work", { date: today, hours: 3, note: "power automate flow" }));
console.log("— Test sentence 2: saved 800 kr. savings at 41 200 now");
console.log("  ", line("log_savings_deposit", { date: today, amount_sek: 800 }));
console.log("  ", line("log_savings_balance", { date: today, balance_sek: 41200 }));
console.log("— Test sentence 3: posted on linkedin about AI agents, connections are at 512");
console.log("  ", line("log_content_post", { date: today, platform: "LinkedIn", title: "AI agents" }));
console.log("  ", line("log_linkedin_connections", { date: today, count: 512 }));
console.log("— Test sentence 4: 2h on the dashboard project yesterday");
console.log("  ", line("log_project", { date: yesterday, project: "dashboard", hours: 2 }));
console.log("— Test sentence 5: did 2h");
const q = run("ask_clarification", { question: "What were the 2 hours spent on?", reason: "missing_info" });
console.log("  ", q.ok ? JSON.stringify(q.call.input) : q.problem);
console.log("— Extra: target + withdrawal");
console.log("  ", line("set_target", { metric: "gym_sessions_per_week", value: 4 }));
console.log("  ", line("log_savings_deposit", { date: today, amount_sek: -300 }));
console.log();

// Sleep offsets are corrected no matter what the model sends.
check("summer time gets +02:00", stockholmLocalToIso("2026-10-09T23:40:00+01:00") === "2026-10-09T23:40:00+02:00", stockholmLocalToIso("2026-10-09T23:40:00+01:00"));
check("winter time gets +01:00", stockholmLocalToIso("2026-12-01T23:40:00Z") === "2026-12-01T23:40:00+01:00", stockholmLocalToIso("2026-12-01T23:40:00Z"));
check("clocks go back 25 Oct: 23:30 is +02:00, 07:00 is +01:00",
  stockholmLocalToIso("2026-10-24T23:30") === "2026-10-24T23:30:00+02:00" &&
    stockholmLocalToIso("2026-10-25T07:00") === "2026-10-25T07:00:00+01:00");
check("that night is 8 h 30 min long",
  (Date.parse(stockholmLocalToIso("2026-10-25T07:00")!) - Date.parse(stockholmLocalToIso("2026-10-24T23:30")!)) / 60000 === 510);
const wrongOffset = run("log_sleep", { wake_date: today, bedtime: `${yesterday}T23:40:00+01:00`, wake_time: `${today}T07:10:00+01:00` });
check("wrong offset from model still gives 7 h 30 min", wrongOffset.ok && wrongOffset.call.tool === "log_sleep" && wrongOffset.call.input.minutes === 450, wrongOffset);
const afterMidnight = run("log_sleep", { wake_date: today, bedtime: `${today}T01:15:00+02:00`, wake_time: `${today}T08:00:00+02:00` });
check("bedtime after midnight works", afterMidnight.ok);
const label = run("log_sleep", { wake_date: yesterday, bedtime: `${yesterday}T23:40:00+02:00`, wake_time: `${today}T07:10:00+02:00` });
check("sleep is labelled by the wake time's date", label.ok && label.call.tool === "log_sleep" && label.call.input.date === today, label);

// Things that must be rejected.
const bad: [string, string, unknown][] = [
  ["future date", "log_gym_session", { date: addDays(today, 1) }],
  ["fake date", "log_gym_session", { date: "2026-02-30" }],
  ["0 kr deposit", "log_savings_deposit", { date: today, amount_sek: 0 }],
  ["decimal kronor", "log_savings_deposit", { date: today, amount_sek: 12.5 }],
  ["negative balance", "log_savings_balance", { date: today, balance_sek: -5 }],
  ["25 work hours", "log_work", { date: today, hours: 25 }],
  ["0 project hours", "log_project", { date: today, project: "x", hours: 0 }],
  ["gym 0 minutes", "log_gym_session", { date: today, duration_min: 0 }],
  ["sleep wake before bed", "log_sleep", { wake_date: today, bedtime: `${today}T08:00:00+02:00`, wake_time: `${today}T07:00:00+02:00` }],
  ["sleep 22 hours", "log_sleep", { wake_date: today, bedtime: `${yesterday}T08:00:00+02:00`, wake_time: `${today}T06:00:00+02:00` }],
  ["sleep with no time", "log_sleep", { wake_date: today, bedtime: "yesterday", wake_time: "today" }],
  ["unknown target", "set_target", { metric: "pushups", value: 3 }],
  ["target over max", "set_target", { metric: "gym_sessions_per_week", value: 30 }],
  ["empty platform", "log_content_post", { date: today, platform: "  " }],
  ["unknown tool", "delete_everything", {}],
  ["bad clarification reason", "ask_clarification", { question: "?", reason: "other" }],
];
for (const [label, name, input] of bad) {
  const r = run(name, input);
  check(`rejects ${label}${r.ok ? "" : `  (${r.problem})`}`, !r.ok);
}

check("formatKr 41200 → 41 200 kr", formatKr(41200).replace(/\s/g, " ") === "41 200 kr", formatKr(41200));
check("cost of 2000 in / 300 out / 1500 cache read", costUsd("claude-sonnet-5-5", { input_tokens: 2000, output_tokens: 300, cache_read_tokens: 1500, cache_write_tokens: 0 }) === 0.0073, costUsd("claude-sonnet-5-5", { input_tokens: 2000, output_tokens: 300, cache_read_tokens: 1500, cache_write_tokens: 0 }));

console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) failed.`);
process.exit(failed ? 1 : 0);
