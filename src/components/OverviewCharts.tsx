"use client";

import type { ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartSlice, OverviewChartsData } from "@/lib/overview-palette";
import { OVERVIEW_COLORS } from "@/lib/overview-palette";

function sum(data: ChartSlice[]) {
  return data.reduce((a, d) => a + d.value, 0);
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel p-4 min-h-[280px] flex flex-col">
      <h3 className="font-semibold mb-2 shrink-0">{title}</h3>
      <div className="flex-1 min-h-[220px] w-full">{children}</div>
    </section>
  );
}

function EmptyHint() {
  return (
    <div className="h-full min-h-[200px] flex items-center justify-center text-sm text-[var(--muted)]">
      No data yet
    </div>
  );
}

function Donut({
  data,
  colorMap,
}: {
  data: ChartSlice[];
  colorMap: Record<string, string>;
}) {
  if (sum(data) === 0) return <EmptyHint />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data.filter((d) => d.value > 0)}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="45%"
          innerRadius="45%"
          outerRadius="70%"
          paddingAngle={2}
        >
          {data
            .filter((d) => d.value > 0)
            .map((d) => (
              <Cell key={d.name} fill={colorMap[d.name] ?? OVERVIEW_COLORS.muted} />
            ))}
        </Pie>
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function HBar({
  data,
  colorMap,
}: {
  data: ChartSlice[];
  colorMap: Record<string, string>;
}) {
  if (sum(data) === 0) return <EmptyHint />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 12, top: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fill: OVERVIEW_COLORS.muted, fontSize: 11 }} />
        <YAxis
          type="category"
          dataKey="name"
          width={96}
          tick={{ fill: OVERVIEW_COLORS.muted, fontSize: 11 }}
        />
        <Tooltip />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((d) => (
            <Cell key={d.name} fill={colorMap[d.name] ?? OVERVIEW_COLORS.accent} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function VBar({
  data,
  colorMap,
}: {
  data: ChartSlice[];
  colorMap: Record<string, string>;
}) {
  if (sum(data) === 0) return <EmptyHint />;
  const labeled = data.map((d) => ({
    ...d,
    label: d.name.replace(/_/g, " "),
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={labeled} margin={{ left: 4, right: 8, top: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: OVERVIEW_COLORS.muted, fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fill: OVERVIEW_COLORS.muted, fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {labeled.map((d) => (
            <Cell key={d.name} fill={colorMap[d.name] ?? OVERVIEW_COLORS.accent} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function OverviewCharts({ data }: { data: OverviewChartsData }) {
  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
      <ChartCard title="Project RAG">
        <Donut data={data.rag} colorMap={OVERVIEW_COLORS.rag} />
      </ChartCard>
      <ChartCard title="Defects by severity">
        <Donut data={data.defectSeverity} colorMap={OVERVIEW_COLORS.severity} />
      </ChartCard>
      <ChartCard title="Projects by phase">
        <HBar data={data.phases} colorMap={OVERVIEW_COLORS.phase} />
      </ChartCard>
      <ChartCard title="Task status">
        <VBar data={data.taskStatus} colorMap={OVERVIEW_COLORS.taskStatus} />
      </ChartCard>
      <ChartCard title="Status today">
        <VBar data={data.statusToday} colorMap={OVERVIEW_COLORS.statusState} />
      </ChartCard>
    </div>
  );
}
