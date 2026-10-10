# Life Dashboard — Build Spec

A personal, AI-powered dashboard for Hamza. One user, desktop only, hosted on Vercel.
You log your day in plain English, Claude sorts it into the right places, and you can ask questions about your own data.

**Read this whole file before writing code. Build in the milestone order at the bottom. After each milestone, stop, explain what each new file does in plain words, and wait for Hamza to test it.**

---

## 1. Decisions (already made — don't change without asking)

| Topic | Decision |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Styling | Tailwind CSS, dark minimal theme |
| Charts | Recharts |
| Database | Supabase (Postgres) — **already created, schema already applied** |
| AI | Claude API, model `claude-sonnet-5-5`, via `@anthropic-ai/sdk` |
| Validation | zod |
| Auth | Single password, signed session cookie (`jose`) |
| Hosting | Vercel, deployed from GitHub repo `ygxdrasil/life-dashboard` |
| Devices | Desktop only (min width ~1100px, no mobile layout needed) |
| Language | English UI, Hamza logs in English |
| Timezone | `Europe/Stockholm` for every "today", "yesterday", "this week" (weeks start Monday) |
| Currency | SEK, shown as `12 500 kr` |
| AI tone | Calm butler: polite, measured, brief. Never gushing, never emoji. |

## 2. Areas tracked

| Area | What gets logged |
|---|---|
| Gym | Session only: date, duration (min), focus (e.g. push/pull/legs/full), optional note. No sets, no PRs. |
| Sleep | Bedtime + wake time. Hours are calculated by the database. One row per night, labelled by the wake-up date. |
| Savings | Both: individual deposits ("saved 500 kr") **and** balance snapshots ("savings at 34 000"). Goal: **200 000 kr**. |
| Content | Posts published (date, platform, optional title) + LinkedIn connection count snapshots. |
| Work (RKJH) | Hours + short note in Hamza's own words. **Never client data.** |
| Side projects | Hours + short note per project (project name is free text). |

## 3. Environment variables

Create `.env.local` (never commit it — make sure it's in `.gitignore`). Set the same in Vercel.

```
SUPABASE_URL=https://xubihpfojhugakuydbje.supabase.co
SUPABASE_SERVICE_ROLE_KEY=        # Supabase dashboard → Project Settings → API keys → secret/service_role
ANTHROPIC_API_KEY=                # Claude Console
DASHBOARD_PASSWORD=               # long, 20+ characters
SESSION_SECRET=                   # 32+ random characters (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

**Hard rules:**
- None of these may ever be prefixed `NEXT_PUBLIC_`. None may be imported into a client component.
- Supabase and Anthropic clients live in `lib/server/` and are only used from route handlers / server components.
- Add `import "server-only"` at the top of every file in `lib/server/`.

## 4. Database (already exists — do NOT recreate)

Supabase project `life-dashboard` (id `xubihpfojhugakuydbje`, region Stockholm). RLS is ON with no policies, so only the service role key can read/write. That's intentional: all access goes through our server.

Tables (all in `public`):

- `raw_logs` — id, created_at, text, status (`pending|saved|needs_clarification|discarded`)
- `gym_sessions` — id, date, duration_min, focus, note, raw_log_id, created_at
- `sleep_logs` — id, date (unique, wake-up date), bedtime (timestamptz), wake_time (timestamptz), hours (generated), raw_log_id, created_at
- `savings_deposits` — id, date, amount_sek (int, non-zero; negative = withdrawal), note, raw_log_id, created_at
- `savings_balances` — id, date, balance_sek (int ≥ 0), raw_log_id, created_at
- `content_posts` — id, date, platform, title, raw_log_id, created_at
- `linkedin_connections` — id, date, count, raw_log_id, created_at
- `work_logs` — id, date, hours (0–24), note, raw_log_id, created_at
- `project_logs` — id, date, project, hours (0–24), note, raw_log_id, created_at
- `targets` — metric (PK), value, updated_at. Allowed metrics: `gym_sessions_per_week`, `sleep_hours_avg`, `savings_sek_per_month`, `content_posts_per_week`, `work_hours_per_week`, `project_hours_per_week`
- `briefs` — date (PK), content, created_at
- `ai_usage` — id, created_at, feature (`log|ask|brief|review`), model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd
- `pending_actions` — id, created_at, action (`update|delete`), table_name, row_id, changes (jsonb), reason, status (`pending|confirmed|rejected`)

Write TypeScript types for these by hand in `lib/types.ts` (or generate with the Supabase CLI if Hamza wants to learn that).

**Savings total logic:** current savings = latest balance snapshot + sum of deposits dated *after* that snapshot. If there's no snapshot, it's just the sum of deposits.

## 5. Auth

- `/login` page: one password field.
- `POST /api/login`: compare with `DASHBOARD_PASSWORD` using `crypto.timingSafeEqual`. On success, set an httpOnly, secure, sameSite=strict cookie containing a JWT signed with `SESSION_SECRET` (30-day expiry). On failure, wait 1 second before responding.
- `middleware.ts`: every route except `/login` and `/api/login` requires a valid session. Pages redirect to `/login`; API routes return 401.
- `POST /api/logout` clears the cookie.

## 6. Features (v1)

### 6.1 Log by talking — `POST /api/log`

Input: `{ text: string, clarification?: { question: string, answer: string } }`

Flow:
1. Save `text` to `raw_logs` (status `pending`).
2. Call Claude with the log system prompt (section 7), today's date and weekday in Stockholm time, and these tools:
   - `log_gym_session { date, duration_min?, focus?, note? }`
   - `log_sleep { wake_date, bedtime (ISO with offset), wake_time (ISO with offset) }`
   - `log_savings_deposit { date, amount_sek, note? }`
   - `log_savings_balance { date, balance_sek }`
   - `log_content_post { date, platform, title? }`
   - `log_linkedin_connections { date, count }`
   - `log_work { date, hours, note? }`
   - `log_project { date, project, hours, note? }`
   - `set_target { metric, value }`
   - `ask_clarification { question }`
3. Claude may return several tool calls in one response (one message often covers several areas).
4. Validate every tool input with zod. If any call is `ask_clarification`, **save nothing**, set raw_log status `needs_clarification`, return the question to the UI. The UI shows the question with a reply box; the reply is sent back with `clarification` and the whole thing is re-run.
5. Otherwise insert all rows (with `raw_log_id`), set status `saved`, and return a short confirmation list built by the server (e.g. "Gym — 60 min, legs", "Saved 500 kr"). Don't make a second API call just to write the confirmation.
6. Log usage to `ai_usage`.

Test sentences (all should work):
- "gym 1h legs, slept 23:40 to 7:10, worked 3h on the power automate flow"
- "saved 800 kr. savings at 41 200 now"
- "posted on linkedin about AI agents, connections are at 512"
- "2h on the dashboard project yesterday"
- "did 2h" → should ask what the 2h was

### 6.2 Ask your dashboard — `POST /api/ask`

Input: `{ messages: {role, content}[] }` (chat history kept in client state only; resets on reload).

Run an agentic loop (max 6 iterations) with these **read-only** tools — the code computes all numbers, Claude only explains them:
- `get_entries { table, from, to, limit (≤200) }` — table limited to the 8 data tables
- `get_weekly_summary { weeks_back (1–12) }` — per-week totals/averages per area, computed in code
- `get_targets {}`
- `get_savings_progress {}` — current total, goal 200 000, % done, average per month over the last 3 months, months to goal at that pace
- `propose_edit { table, row_id, changes, reason }` and `propose_delete { table, row_id, reason }` — these only insert into `pending_actions`. They never change data.

Never give Claude a raw SQL tool.

UI: chat panel. When the response includes pending actions, show each one as a card with **Confirm** / **Reject** buttons → `POST /api/actions/[id]` with `{ decision }`. Only then does the server apply the update/delete.

### 6.3 Morning brief — `GET /api/brief`

- If a row exists in `briefs` for today (Stockholm), return it.
- Otherwise: compute in code a compact summary (last 7 days per area vs targets, savings progress, last night's sleep, anything with zero activity this week), send it to Claude with the brief prompt, save the result to `briefs`, return it.
- Format: **bullets per area**, one line each, only for areas with something worth saying. Max ~8 bullets.
- If there's no data at all yet, return a friendly static message and don't call the API.
- "Regenerate" button: `POST /api/brief?force=1`, limited to 3 per day.

### 6.4 Area cards

Six cards: Gym, Sleep, Savings, Content, Work, Projects. Each shows this week's number vs target (progress bar), plus last entry. Savings card shows total / 200 000 kr with a progress bar.

### 6.5 Charts (Recharts)

- Sleep hours per night, last 14 nights, with a target line
- Gym sessions per week, last 8 weeks, with a target line
- Savings total over time toward 200 000 kr
- LinkedIn connections over time
- Work + project hours per week, last 8 weeks

### 6.6 Targets

Small settings modal to set the six weekly targets. Can also be set by logging ("set my gym target to 4 a week").

### 6.7 Cost tracker

- Every Claude call writes to `ai_usage` with tokens and cost.
- Prices for `claude-sonnet-5-5` (USD per million tokens): input 2.00, output 10.00, 5-min cache write 2.50, cache read 0.10. Keep them in one constants file.
- Footer shows: spent today, spent this month. Turns amber over $15/month (Hamza's Console cap is $20).

### 6.8 Export

`GET /api/export` downloads one JSON file containing every table.

## 7. Prompts

Use prompt caching: put `cache_control: { type: "ephemeral" }` on the system prompt and tool definitions.

**Log system prompt (core rules — write the full version):**
- You turn Hamza's plain-English day log into structured entries using the tools.
- Today is {weekday} {date} (Europe/Stockholm). Resolve "today", "yesterday", "last night", weekday names relative to that.
- Sleep: a bedtime after ~18:00 belongs to the day before the wake date.
- Call one tool per distinct fact. One message can produce many calls.
- If anything needed is missing or ambiguous (which area, a number, a date), call `ask_clarification` with one short question and nothing else.
- Work notes: RKJH is an accounting firm. If a work note mentions a client, a client company name, or any client figures, call `ask_clarification` asking Hamza to rephrase it without client details. Never store client information.
- Never invent numbers.

**Ask system prompt:** calm butler tone. Answer from tool results only; if the data doesn't cover the question, say so. Short answers. Use kr and Stockholm dates. Never give financial or trading advice.

**Brief system prompt:** calm butler tone. Bullets per area, one line each, honest — if something is behind target, say so plainly without lecturing.

## 8. Design — dark minimal

- Background `#0b0b0c`, surfaces `#141416`, borders `#232327`
- Text `#e7e7e9`, muted `#8a8a90`
- One accent `#7dd3a8` (on track), warning `#e0a458` (behind), error `#e06c5a`
- Font: Inter or Geist. Numbers in tabular figures.
- Max width ~1200px, generous spacing, no gradients, no glow.

Layout (one page):
```
┌───────────────────────────────────────────────┐
│ Morning brief (bullets)            [Regenerate]│
├──────────────────────┬────────────────────────┤
│ Log box              │ Ask your dashboard     │
│ (+ clarification)    │ (chat + confirm cards) │
├──────┬──────┬──────┬─┴────┬──────┬────────────┤
│ Gym  │Sleep │Saving│Content│ Work │ Projects  │
├──────┴──────┴──────┴──────┴──────┴────────────┤
│ Charts (2-column grid)                         │
├───────────────────────────────────────────────┤
│ Footer: cost today / month · Targets · Export  │
└───────────────────────────────────────────────┘
```

## 9. Milestones (build in this order)

1. **Scaffold + login.** Next.js + Tailwind, theme colors, login page, middleware, logout. Push to GitHub.
2. **Database connection.** Server-side Supabase client, types, a hidden test route that reads `targets`. Targets modal.
3. **Log by talking.** `/api/log`, log box UI, clarification flow, `ai_usage` logging. Run all test sentences.
4. **Cards + charts.** Summary functions in `lib/server/summaries.ts` (shared by cards, brief and ask).
5. **Ask your dashboard.** Tools, agentic loop, pending action confirm/reject.
6. **Morning brief.** Caching in `briefs`, regenerate limit.
7. **Cost tracker + export.**
8. **Deploy.** Import repo in Vercel, add env vars, test login and one log on the live URL.

After each milestone: explain what was built in plain words, list how to test it, and wait.

## 10. Never

- Never put any secret in client code or in git.
- Never let the AI write to the database except through the validated logging tools or confirmed pending actions.
- Never store RKJH client data.
- Never call the Claude API on page load except for the once-per-day brief.
