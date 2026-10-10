import LogoutButton from "@/components/LogoutButton";

// Placeholder boxes in the final layout. Each gets real content in a later milestone.
const cards = ["Gym", "Sleep", "Savings", "Content", "Work", "Projects"];

function Panel({ title, className = "" }: { title: string; className?: string }) {
  return (
    <section className={`rounded-xl border border-border bg-surface p-5 ${className}`}>
      <h2 className="text-sm text-muted">{title}</h2>
    </section>
  );
}

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-[1200px] flex-1 px-8 py-8">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-medium">Life Dashboard</h1>
        <LogoutButton />
      </header>

      <div className="flex flex-col gap-6">
        <Panel title="Morning brief" className="h-32" />
        <div className="grid grid-cols-2 gap-6">
          <Panel title="Log" className="h-56" />
          <Panel title="Ask your dashboard" className="h-56" />
        </div>
        <div className="grid grid-cols-6 gap-4">
          {cards.map((name) => (
            <Panel key={name} title={name} className="h-32" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-6">
          <Panel title="Charts" className="h-64" />
          <Panel title="Charts" className="h-64" />
        </div>
      </div>

      <footer className="mt-10 border-t border-border pt-4 text-sm text-muted">
        Milestone 1: login works. Everything else is coming.
      </footer>
    </main>
  );
}
