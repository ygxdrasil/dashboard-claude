import { Suspense } from "react";
import AreaCards, { AreaCardsSkeleton } from "@/components/AreaCards";
import Charts, { ChartsSkeleton } from "@/components/Charts";
import LogBox from "@/components/LogBox";
import LogoutButton from "@/components/LogoutButton";
import TargetsModal from "@/components/TargetsModal";

// Placeholder boxes for parts that get real content in a later milestone.
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
          <LogBox />
          <Panel title="Ask your dashboard" className="min-h-56" />
        </div>
        {/* Cards and charts read the database on every request; the skeletons show while they load. */}
        <Suspense fallback={<AreaCardsSkeleton />}>
          <AreaCards />
        </Suspense>
        <Suspense fallback={<ChartsSkeleton />}>
          <Charts />
        </Suspense>
      </div>

      <footer className="mt-10 flex items-center gap-6 border-t border-border pt-4 text-sm text-muted">
        <TargetsModal />
      </footer>
    </main>
  );
}
