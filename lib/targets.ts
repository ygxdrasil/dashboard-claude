import { TARGET_METRICS, type TargetMetric } from "@/lib/types";

// Labels and input limits for the six targets. Shared by the settings modal
// (browser) and the API (server), so it must not contain anything secret.
export type TargetInfo = {
  label: string;
  unit: string;
  step: number;
  max: number;
};

export const TARGET_INFO: Record<TargetMetric, TargetInfo> = {
  gym_sessions_per_week: { label: "Gym sessions", unit: "per week", step: 1, max: 14 },
  sleep_hours_avg: { label: "Sleep", unit: "hours per night (average)", step: 0.1, max: 14 },
  savings_sek_per_month: { label: "Savings", unit: "kr per month", step: 1, max: 1_000_000 },
  content_posts_per_week: { label: "Posts", unit: "per week", step: 1, max: 50 },
  work_hours_per_week: { label: "Work (RKJH)", unit: "hours per week", step: 0.5, max: 80 },
  project_hours_per_week: { label: "Side projects", unit: "hours per week", step: 0.5, max: 80 },
};

export { TARGET_METRICS };
