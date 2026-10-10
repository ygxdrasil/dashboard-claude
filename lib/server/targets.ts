import "server-only";
import { z } from "zod";
import { db } from "@/lib/server/supabase";
import { TARGET_INFO } from "@/lib/targets";
import { TARGET_METRICS, type TargetMetric } from "@/lib/types";

export type TargetValues = Partial<Record<TargetMetric, number>>;

// A number between 0 and the metric's max. null means "no target".
const valueFor = (metric: TargetMetric) =>
  z.number().finite().min(0).max(TARGET_INFO[metric].max).nullable();

export const TargetUpdates = z
  .object(
    Object.fromEntries(TARGET_METRICS.map((m) => [m, valueFor(m).optional()])) as {
      [M in TargetMetric]: z.ZodOptional<ReturnType<typeof valueFor>>;
    },
  )
  .strict();
export type TargetUpdates = z.infer<typeof TargetUpdates>;

export async function getTargets(): Promise<TargetValues> {
  const { data, error } = await db().from("targets").select("metric, value");
  if (error) throw new Error(error.message);
  const values: TargetValues = {};
  for (const row of data) values[row.metric] = Number(row.value);
  return values;
}

// Saves numbers, removes targets set to null, leaves missing ones untouched.
export async function setTargets(updates: TargetUpdates): Promise<void> {
  const now = new Date().toISOString();
  const toSave = TARGET_METRICS.filter((m) => typeof updates[m] === "number").map((m) => ({
    metric: m,
    value: updates[m] as number,
    updated_at: now,
  }));
  const toRemove = TARGET_METRICS.filter((m) => updates[m] === null);

  if (toSave.length > 0) {
    const { error } = await db().from("targets").upsert(toSave, { onConflict: "metric" });
    if (error) throw new Error(error.message);
  }
  if (toRemove.length > 0) {
    const { error } = await db().from("targets").delete().in("metric", toRemove);
    if (error) throw new Error(error.message);
  }
}
