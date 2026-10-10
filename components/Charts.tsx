import { connection } from "next/server";
import ChartsView from "@/components/ChartsView";
import { stockholmToday } from "@/lib/dates";
import { buildCharts, loadDashboardRows } from "@/lib/server/summaries";

// Loads chart data on the server, then hands plain numbers to the browser-side charts.
export default async function Charts() {
  await connection();
  const today = stockholmToday();
  const data = await loadDashboardRows(today)
    .then((rows) => buildCharts(rows, today))
    .catch((e) => {
      console.error("[charts]", e);
      return null;
    });
  if (!data) {
    return <p className="rounded-xl border border-border bg-surface p-4 text-sm text-error">Could not load chart data. Check the terminal.</p>;
  }
  return <ChartsView data={data} />;
}

export function ChartsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-6">
      {["Sleep", "Gym", "Savings", "LinkedIn connections"].map((t) => (
        <section key={t} className="h-[290px] rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm">{t}</h2>
        </section>
      ))}
      <section className="col-span-2 h-[290px] rounded-xl border border-border bg-surface p-5">
        <h2 className="text-sm">Work and side projects</h2>
      </section>
    </div>
  );
}
