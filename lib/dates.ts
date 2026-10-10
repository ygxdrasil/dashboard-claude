// Every "today", "yesterday" and "this week" uses Stockholm time (spec section 1).
// Dates are "YYYY-MM-DD" strings everywhere.

export const TIME_ZONE = "Europe/Stockholm";

const ymd = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's date in Stockholm, e.g. "2026-10-10". */
export function stockholmToday(now: Date = new Date()): string {
  return ymd.format(now);
}

/** Stockholm calendar date of any instant. */
export function stockholmDateOf(instant: Date): string {
  return ymd.format(instant);
}

/** "2026-10-10" plus n days (n can be negative). */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** A real calendar date in "YYYY-MM-DD" form? */
export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) === date;
}

/** "Saturday" for "2026-10-10". */
export function weekdayName(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    timeZone: "UTC",
  });
}

/** "Thu 8 Oct" for "2026-10-08". */
export function shortDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

// Minutes Stockholm is ahead of UTC at a given instant (60 in winter, 120 in summer).
function offsetMinutesAt(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/**
 * Turns a Stockholm wall-clock time ("2026-10-09T23:40", any offset after it is
 * ignored) into an ISO string with the correct Stockholm offset for that date.
 * Returns null if the input isn't a valid date and time.
 */
export function stockholmLocalToIso(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m || !isValidDate(`${m[1]}-${m[2]}-${m[3]}`)) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (h > 23 || mi > 59) return null;

  const wallAsUtc = Date.UTC(y, mo - 1, d, h, mi);
  let offset = offsetMinutesAt(new Date(wallAsUtc));
  offset = offsetMinutesAt(new Date(wallAsUtc - offset * 60000)); // settle DST edges

  const sign = offset >= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00${sign}${hh}:${mm}`;
}

/** "23:40" for an ISO time, shown in Stockholm time. */
export function stockholmClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
}
