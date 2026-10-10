// Hand-written types for the Supabase tables (spec section 4).
// Checked against the live schema on 2026-10-10. If you change a table in
// Supabase, update it here too.
//
// Conventions: `date` columns are "YYYY-MM-DD" strings. Timestamps
// (created_at, bedtime, wake_time, ...) are ISO strings with an offset.
// ids are uuid strings, except ai_usage.id which is a number.
// Use `type`, not `interface`: Supabase's typing needs it.

// ---------- Allowed values (mirror the CHECK constraints in the database) ----------

export const DATA_TABLES = [
  "gym_sessions",
  "sleep_logs",
  "savings_deposits",
  "savings_balances",
  "content_posts",
  "linkedin_connections",
  "work_logs",
  "project_logs",
] as const;
export type DataTable = (typeof DATA_TABLES)[number];

export const TARGET_METRICS = [
  "gym_sessions_per_week",
  "sleep_hours_avg",
  "savings_sek_per_month",
  "content_posts_per_week",
  "work_hours_per_week",
  "project_hours_per_week",
] as const;
export type TargetMetric = (typeof TARGET_METRICS)[number];

export type RawLogStatus = "pending" | "saved" | "needs_clarification" | "discarded";
export type AiFeature = "log" | "ask" | "brief" | "review";
export type PendingActionKind = "update" | "delete";
export type PendingActionStatus = "pending" | "confirmed" | "rejected";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

// ---------- Rows (what you get back when you read) ----------

export type RawLog = {
  id: string;
  created_at: string;
  text: string;
  status: RawLogStatus;
};

export type GymSession = {
  id: string;
  date: string;
  duration_min: number | null; // 1–600
  focus: string | null;
  note: string | null;
  raw_log_id: string | null;
  created_at: string;
};

export type SleepLog = {
  id: string;
  date: string; // wake-up date, unique
  bedtime: string;
  wake_time: string; // must be after bedtime
  hours: number | null; // calculated by the database, never written
  raw_log_id: string | null;
  created_at: string;
};

export type SavingsDeposit = {
  id: string;
  date: string;
  amount_sek: number; // non-zero; negative = withdrawal
  note: string | null;
  raw_log_id: string | null;
  created_at: string;
};

export type SavingsBalance = {
  id: string;
  date: string;
  balance_sek: number; // ≥ 0
  raw_log_id: string | null;
  created_at: string;
};

export type ContentPost = {
  id: string;
  date: string;
  platform: string;
  title: string | null;
  raw_log_id: string | null;
  created_at: string;
};

export type LinkedinConnections = {
  id: string;
  date: string;
  count: number; // ≥ 0
  raw_log_id: string | null;
  created_at: string;
};

export type WorkLog = {
  id: string;
  date: string;
  hours: number; // > 0 and ≤ 24
  note: string | null;
  raw_log_id: string | null;
  created_at: string;
};

export type ProjectLog = {
  id: string;
  date: string;
  project: string;
  hours: number; // > 0 and ≤ 24
  note: string | null;
  raw_log_id: string | null;
  created_at: string;
};

export type Target = {
  metric: TargetMetric;
  value: number; // ≥ 0
  updated_at: string;
};

export type Brief = {
  date: string; // one per day
  content: string;
  created_at: string;
};

export type AiUsage = {
  id: number;
  created_at: string;
  feature: AiFeature;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
};

export type PendingAction = {
  id: string;
  created_at: string;
  action: PendingActionKind;
  table_name: DataTable;
  row_id: string;
  changes: Json | null;
  reason: string | null;
  status: PendingActionStatus;
};

// ---------- Database shape for the Supabase client ----------

// For inserts: the listed columns have database defaults, so they're optional.
type Insertable<Row, Optional extends keyof Row> = Omit<Row, Optional> &
  Partial<Pick<Row, Optional>>;

type Table<Row, Insert> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: [];
};

type Defaults = "id" | "created_at";

export type Database = {
  public: {
    Tables: {
      raw_logs: Table<RawLog, Insertable<RawLog, Defaults | "status">>;
      gym_sessions: Table<GymSession, Insertable<GymSession, Defaults | "duration_min" | "focus" | "note" | "raw_log_id">>;
      sleep_logs: Table<SleepLog, Insertable<Omit<SleepLog, "hours">, Defaults | "raw_log_id">>;
      savings_deposits: Table<SavingsDeposit, Insertable<SavingsDeposit, Defaults | "note" | "raw_log_id">>;
      savings_balances: Table<SavingsBalance, Insertable<SavingsBalance, Defaults | "raw_log_id">>;
      content_posts: Table<ContentPost, Insertable<ContentPost, Defaults | "title" | "raw_log_id">>;
      linkedin_connections: Table<LinkedinConnections, Insertable<LinkedinConnections, Defaults | "raw_log_id">>;
      work_logs: Table<WorkLog, Insertable<WorkLog, Defaults | "note" | "raw_log_id">>;
      project_logs: Table<ProjectLog, Insertable<ProjectLog, Defaults | "note" | "raw_log_id">>;
      targets: Table<Target, Insertable<Target, "updated_at">>;
      briefs: Table<Brief, Insertable<Brief, "created_at">>;
      ai_usage: Table<AiUsage, Insertable<Omit<AiUsage, "id">, "created_at" | "input_tokens" | "output_tokens" | "cache_read_tokens" | "cache_write_tokens" | "cost_usd">>;
      pending_actions: Table<PendingAction, Insertable<PendingAction, Defaults | "status" | "changes" | "reason">>;
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
  };
};
