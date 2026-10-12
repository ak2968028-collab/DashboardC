"use client";

import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { fmt } from "@/lib/format";

export const QUALITATIVE = ["#5f4690", "#1d6996", "#38a6a5", "#0f8554", "#73af48", "#edad08", "#e17c05", "#cc503e"];

type Row = Record<string, string | number | null>;

const truncate = (label: string) => (label.length > 22 ? `${label.slice(0, 21)}…` : label);

interface BarSeries {
  key: string;
  name?: string;
  color?: string;
}

interface BarChartProps {
  data: Row[];
  /** Category field (x axis, or y axis when horizontal). */
  category: string;
  series: BarSeries[];
  /** One colour per row (single-series charts only). */
  rowColors?: string[];
  horizontal?: boolean;
  height?: number;
  decimals?: number;
  showValues?: boolean;
  valueLabel?: string;
  angledTicks?: boolean;
}

export function SimpleBarChart({
  data, category, series, rowColors, horizontal = false, height = 340, decimals = 1,
  showValues = true, valueLabel, angledTicks = false,
}: BarChartProps) {
  const format = (v: unknown) => fmt(Number(v), decimals);
  const categoryAxis = horizontal
    ? <YAxis type="category" dataKey={category} width={190} tick={{ fontSize: 12 }} />
    : <XAxis dataKey={category} tick={{ fontSize: 12 }} interval={angledTicks ? 0 : "preserveEnd"} tickFormatter={truncate}
        angle={angledTicks ? -45 : 0} textAnchor={angledTicks ? "end" : "middle"} height={angledTicks ? 110 : 30} />;
  const valueAxis = horizontal
    ? <XAxis type="number" tickFormatter={(v) => fmt(v)} tick={{ fontSize: 12 }}
        label={valueLabel ? { value: valueLabel, position: "insideBottom", offset: -4, fontSize: 12 } : undefined} />
    : <YAxis tickFormatter={(v) => fmt(v)} tick={{ fontSize: 12 }} width={70}
        label={valueLabel ? { value: valueLabel, angle: -90, position: "insideLeft", fontSize: 12, style: { textAnchor: "middle" } } : undefined} />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={{ top: 20, right: 30, left: 10, bottom: 10 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" vertical={horizontal} horizontal={!horizontal} />
        {categoryAxis}
        {valueAxis}
        <Tooltip formatter={format} />
        {series.length > 1 && <Legend />}
        {series.map((s) => (
          <Bar key={s.key} isAnimationActive={false} dataKey={s.key} name={s.name ?? s.key} fill={s.color ?? "#2e7d32"} radius={horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0]}>
            {rowColors && series.length === 1 && data.map((_, i) => <Cell key={i} fill={rowColors[i % rowColors.length]} />)}
            {showValues && <LabelList dataKey={s.key} position={horizontal ? "right" : "top"} formatter={format} fontSize={11} fill="#37474f" />}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

interface DonutProps {
  data: { name: string; value: number }[];
  colors?: string[];
  height?: number;
  decimals?: number;
}

export function DonutChart({ data, colors = QUALITATIVE, height = 340, decimals = 1 }: DonutProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="45%"
          outerRadius="80%"
          paddingAngle={1}
          isAnimationActive={false}
          label={({ percent }) => ((percent ?? 0) >= 0.04 ? `${((percent ?? 0) * 100).toFixed(1)}%` : "")}
          labelLine={false}
        >
          {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
        </Pie>
        <Tooltip formatter={(v) => `${fmt(Number(v), decimals)} (${total ? ((Number(v) / total) * 100).toFixed(1) : 0}%)`} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
