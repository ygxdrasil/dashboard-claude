"use client";

import { useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { dayMonth, shortDate } from "@/lib/dates";
import { formatKr } from "@/lib/format";
import type { ChartData } from "@/lib/server/summaries";

// Chart colours (approved 2026-10-10). Blue and orange are for chart data only;
// mint/amber stay reserved for on-track/behind. Both pass colour-blind checks on #141416.
const C = {
  series1: "#3987e5", // blue
  series2: "#d95926", // orange
  surface: "#141416",
  grid: "#232327",
  muted: "#8a8a90",
  text: "#e7e7e9",
};

const axis = { tick: { fill: C.muted, fontSize: 11 }, tickLine: false, axisLine: false } as const;
const xAxis = { ...axis, axisLine: { stroke: C.grid } } as const;
const compact = (n: number) => (n >= 1000 ? `${Math.round(n / 100) / 10}K`.replace(".0K", "K") : String(n));

// The dashed line's value is named in the chart subtitle, so no label sits on top of the data.
function TargetLine({ y }: { y: number }) {
  return <ReferenceLine y={y} stroke={C.muted} strokeDasharray="4 4" strokeWidth={1} ifOverflow="extendDomain" />;
}

/** Builds a tooltip from the hovered data row. */
type TipProps = { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> };
function tipFor<R>(render: (row: R) => ReactNode) {
  return function TipContent({ active, payload }: TipProps) {
    const row = payload?.[0]?.payload as R | undefined;
    return active && row ? render(row) : null;
  };
}

type SleepRow = ChartData["sleep"][number];
type GymRow = ChartData["gymWeeks"][number];
type HoursRow = ChartData["hoursWeeks"][number];
type SavingsRow = ChartData["savings"][number];
type ConnRow = ChartData["connections"][number];

/** Dark tooltip box: one heading, then "swatch  name  value" rows. */
function Tip({ title, rows }: { title: string; rows: { color: string; name: string; value: string }[] }) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 text-muted">{title}</p>
      {rows.map((r) => (
        <p key={r.name} className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: r.color }} />
          <span className="text-muted">{r.name}</span>
          <span className="ml-auto pl-3">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  legend,
  table,
  empty,
  className = "",
  children,
}: {
  title: string;
  subtitle?: string;
  legend?: { color: string; name: string }[];
  table: { head: string[]; rows: (string | number)[][] };
  empty: boolean;
  className?: string;
  children: ReactNode;
}) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className={`rounded-xl border border-border bg-surface p-5 ${className}`}>
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm">{title}</h2>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-4">
          {legend?.map((l) => (
            <span key={l.name} className="flex items-center gap-1.5 text-xs text-muted">
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: l.color }} />
              {l.name}
            </span>
          ))}
          {!empty && (
            <button onClick={() => setShowTable(!showTable)} className="text-xs text-muted hover:text-foreground">
              {showTable ? "Chart" : "Table"}
            </button>
          )}
        </div>
      </header>

      <div className="mt-4 h-52">
        {empty ? (
          <p className="flex h-full items-center justify-center text-sm text-muted">Nothing logged yet</p>
        ) : showTable ? (
          <div className="h-full overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-surface text-muted">
                <tr>
                  {table.head.map((h, i) => (
                    <th key={h} className={`py-1 font-normal ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, r) => (
                  <tr key={r} className="border-t border-border">
                    {row.map((cell, i) => (
                      <td key={i} className={`py-1 ${i === 0 ? "text-left" : "text-right"}`}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {children as React.ReactElement}
          </ResponsiveContainer>
        )}
      </div>
    </section>
  );
}

export default function ChartsView({ data }: { data: ChartData }) {
  const { sleep, gymWeeks, hoursWeeks, savings, connections, targets, goal } = data;
  const hasSleep = sleep.some((s) => s.hours !== null);
  const hasGym = gymWeeks.some((w) => w.sessions > 0);
  const hasHours = hoursWeeks.some((w) => w.work > 0 || w.projects > 0);
  const maxSavings = Math.max(goal, ...savings.map((s) => s.total));

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* 1. Sleep per night */}
      <ChartCard
        title="Sleep"
        subtitle={`Hours per night, last 14 nights${targets.sleep !== undefined ? ` · dashed line: target ${targets.sleep} h` : ""}`}
        empty={!hasSleep}
        table={{ head: ["Night (woke up)", "Hours"], rows: sleep.filter((s) => s.hours !== null).map((s) => [shortDate(s.date), s.hours!]) }}
      >
        <LineChart data={sleep} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="label" {...xAxis} interval={1} />
          <YAxis {...axis} domain={[0, 12]} ticks={[0, 4, 8, 12]} />
          {targets.sleep !== undefined && <TargetLine y={targets.sleep} />}
          <Tooltip
            cursor={{ stroke: C.muted, strokeWidth: 1 }}
            content={tipFor<SleepRow>((r) =>
              r.hours === null ? null : <Tip title={shortDate(r.date)} rows={[{ color: C.series1, name: "Sleep", value: `${r.hours} h` }]} />,
            )}
          />
          <Line
            dataKey="hours"
            stroke={C.series1}
            strokeWidth={2}
            connectNulls={false}
            dot={{ r: 4, fill: C.series1, stroke: C.surface, strokeWidth: 2 }}
            activeDot={{ r: 5, fill: C.series1, stroke: C.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartCard>

      {/* 2. Gym sessions per week */}
      <ChartCard
        title="Gym"
        subtitle={`Sessions per week, last 8 weeks${targets.gym !== undefined ? ` · dashed line: target ${targets.gym}` : ""}`}
        empty={!hasGym}
        table={{ head: ["Week of", "Sessions"], rows: gymWeeks.map((w) => [w.label, w.sessions]) }}
      >
        <BarChart data={gymWeeks} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="label" {...xAxis} />
          <YAxis {...axis} allowDecimals={false} />
          {targets.gym !== undefined && <TargetLine y={targets.gym} />}
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            content={tipFor<GymRow>((r) => (
              <Tip title={`Week of ${r.label}`} rows={[{ color: C.series1, name: "Sessions", value: String(r.sessions) }]} />
            ))}
          />
          <Bar dataKey="sessions" fill={C.series1} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ChartCard>

      {/* 3. Savings total toward the goal */}
      <ChartCard
        title="Savings"
        subtitle={`Total over time · dashed line: goal ${formatKr(goal)}`}
        empty={savings.length === 0}
        table={{ head: ["Date", "Total"], rows: savings.map((s) => [shortDate(s.date), formatKr(s.total)]) }}
      >
        <AreaChart data={savings} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            {...xAxis}
            tickFormatter={(t: number) => dayMonth(new Date(t).toISOString().slice(0, 10))}
          />
          <YAxis {...axis} domain={[0, maxSavings]} tickFormatter={compact} />
          <TargetLine y={goal} />
          <Tooltip
            cursor={{ stroke: C.muted, strokeWidth: 1 }}
            content={tipFor<SavingsRow>((r) => (
              <Tip title={shortDate(r.date)} rows={[{ color: C.series1, name: "Total", value: formatKr(r.total) }]} />
            ))}
          />
          <Area
            dataKey="total"
            type="stepAfter"
            stroke={C.series1}
            strokeWidth={2}
            fill={C.series1}
            fillOpacity={0.1}
            dot={savings.length === 1 ? { r: 4, fill: C.series1, stroke: C.surface, strokeWidth: 2 } : false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartCard>

      {/* 4. LinkedIn connections */}
      <ChartCard
        title="LinkedIn connections"
        subtitle="Over time"
        empty={connections.length === 0}
        table={{ head: ["Date", "Connections"], rows: connections.map((c) => [shortDate(c.date), c.count]) }}
      >
        <LineChart data={connections} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            {...xAxis}
            tickFormatter={(t: number) => dayMonth(new Date(t).toISOString().slice(0, 10))}
          />
          <YAxis {...axis} domain={["auto", "auto"]} allowDecimals={false} tickFormatter={compact} />
          <Tooltip
            cursor={{ stroke: C.muted, strokeWidth: 1 }}
            content={tipFor<ConnRow>((r) => (
              <Tip title={shortDate(r.date)} rows={[{ color: C.series1, name: "Connections", value: String(r.count) }]} />
            ))}
          />
          <Line
            dataKey="count"
            stroke={C.series1}
            strokeWidth={2}
            dot={{ r: 4, fill: C.series1, stroke: C.surface, strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ChartCard>

      {/* 5. Work + project hours per week */}
      <ChartCard
        title="Work and side projects"
        subtitle="Hours per week, last 8 weeks"
        className="col-span-2"
        empty={!hasHours}
        legend={[
          { color: C.series1, name: "Work (RKJH)" },
          { color: C.series2, name: "Side projects" },
        ]}
        table={{ head: ["Week of", "Work h", "Projects h"], rows: hoursWeeks.map((w) => [w.label, w.work, w.projects]) }}
      >
        <BarChart data={hoursWeeks} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="label" {...xAxis} />
          <YAxis {...axis} />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.04)" }}
            content={tipFor<HoursRow>((r) => (
              <Tip
                title={`Week of ${r.label}`}
                rows={[
                  { color: C.series1, name: "Work", value: `${r.work} h` },
                  { color: C.series2, name: "Side projects", value: `${r.projects} h` },
                ]}
              />
            ))}
          />
          {/* The surface-coloured stroke is the 2px gap between stacked segments. */}
          <Bar dataKey="work" stackId="h" fill={C.series1} stroke={C.surface} strokeWidth={2} maxBarSize={24} isAnimationActive={false} />
          <Bar dataKey="projects" stackId="h" fill={C.series2} stroke={C.surface} strokeWidth={2} maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ChartCard>
    </div>
  );
}
