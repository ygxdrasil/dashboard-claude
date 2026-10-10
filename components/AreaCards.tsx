import { connection } from "next/server";
import { stockholmToday } from "@/lib/dates";
import { buildCards, loadDashboardRows, type Card } from "@/lib/server/summaries";

// The six area cards. Runs on the server at request time and reads the database directly.

const BAR_COLOR = { on_track: "bg-accent", behind: "bg-warning", none: "bg-muted/40" } as const;

function AreaCard({ card }: { card: Card }) {
  return (
    <section className="flex min-h-36 flex-col rounded-xl border border-border bg-surface p-4">
      <h2 className="text-sm text-muted">{card.area}</h2>
      <p className="mt-2 leading-tight">
        <span className="text-xl font-medium">{card.value}</span>{" "}
        <span className="text-xs text-muted">{card.unit}</span>
      </p>

      {card.progress !== null && (
        <div
          className="mt-3 h-1.5 overflow-hidden rounded-full bg-border"
          role="progressbar"
          aria-valuenow={Math.round(card.progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${card.area} progress`}
        >
          <div className={`h-full rounded-full ${BAR_COLOR[card.status]}`} style={{ width: `${card.progress * 100}%` }} />
        </div>
      )}
      {card.status === "behind" && <p className="mt-1.5 text-xs text-warning">Behind pace</p>}
      {card.detail && <p className="mt-1.5 text-xs text-muted">{card.detail}</p>}

      <p className="mt-auto truncate pt-3 text-xs text-muted" title={card.last ?? undefined}>
        {card.last ?? "Nothing logged yet"}
      </p>
    </section>
  );
}

export default async function AreaCards() {
  await connection(); // fresh numbers on every request
  const today = stockholmToday();
  const cards = await loadDashboardRows(today)
    .then((rows) => buildCards(rows, today))
    .catch((e) => {
      console.error("[cards]", e);
      return null;
    });
  if (!cards) {
    return <p className="rounded-xl border border-border bg-surface p-4 text-sm text-error">Could not load your data. Check the terminal.</p>;
  }
  return (
    <div className="grid grid-cols-6 gap-4">
      {cards.map((card) => (
        <AreaCard key={card.area} card={card} />
      ))}
    </div>
  );
}

export function AreaCardsSkeleton() {
  return (
    <div className="grid grid-cols-6 gap-4">
      {["Gym", "Sleep", "Savings", "Content", "Work", "Projects"].map((area) => (
        <section key={area} className="min-h-36 rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm text-muted">{area}</h2>
        </section>
      ))}
    </div>
  );
}
