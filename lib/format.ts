// Display helpers. Safe to use in the browser.

const krFormat = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });

/** 12500 → "12 500 kr" */
export function formatKr(amount: number): string {
  return `${krFormat.format(amount)} kr`;
}

/** 1.5 → "1.5 h", 2 → "2 h" */
export function formatHours(hours: number): string {
  return `${Number(hours.toFixed(2))} h`;
}

/** 450 → "7 h 30 min" */
export function formatMinutes(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = Math.round(totalMin % 60);
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
