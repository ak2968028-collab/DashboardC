"use client";

import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useEffect, useState } from "react";
import { fmt } from "@/lib/format";

export const QUALITATIVE = ["#5f4690", "#1d6996", "#38a6a5", "#0f8554", "#73af48", "#edad08", "#e17c05", "#cc503e"];

type Row = Record<string, string | number | null>;

const truncateTo = (max: number) => (label: string) => (label.length > max ? `${label.slice(0, max - 1)}…` : label);
const truncate = truncateTo(22);
const compact = new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 });

/** True on phone-sized screens, where charts drop value labels and use tighter axes. */
function useIsMobile(query = "(max-width: 600px)") {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);
  return mobile;
}

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
  const mobile = useIsMobile();
  const format = (v: unknown) => fmt(Number(v), decimals);
  const tick = { fontSize: mobile ? 10 : 12 };
  // On phones, value labels on crowded charts overlap, and an axis title steals width the bars need.
  const labels = showValues && (!mobile || data.length <= 6);
  const axisTitle = mobile ? undefined : valueLabel;
  const valueTicks = (v: number) => (mobile ? compact.format(v) : fmt(v));
  const categoryAxis = horizontal
    ? <YAxis type="category" dataKey={category} width={mobile ? 96 : 190} tick={tick} tickFormatter={mobile ? truncateTo(14) : undefined} />
    : <XAxis dataKey={category} tick={tick} interval={angledTicks ? 0 : "preserveEnd"} tickFormatter={mobile ? truncateTo(14) : truncate}
        angle={angledTicks ? -45 : 0} textAnchor={angledTicks ? "end" : "middle"} height={angledTicks ? (mobile ? 80 : 110) : 30} />;
  const valueAxis = horizontal
    ? <XAxis type="number" tickFormatter={valueTicks} tick={tick}
        label={axisTitle ? { value: axisTitle, position: "insideBottom", offset: -4, fontSize: 12 } : undefined} />
    : <YAxis tickFormatter={valueTicks} tick={tick} width={mobile ? 40 : 70}
        label={axisTitle ? { value: axisTitle, angle: -90, position: "insideLeft", fontSize: 12, style: { textAnchor: "middle" } } : undefined} />;
  const margin = mobile ? { top: 16, right: horizontal && labels ? 44 : 12, left: 0, bottom: 4 } : { top: 20, right: 30, left: 10, bottom: 10 };

  return (
    <ResponsiveContainer width="100%" height={mobile ? Math.min(height, 300) : height}>
      <BarChart data={data} layout={horizontal ? "vertical" : "horizontal"} margin={margin}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" vertical={horizontal} horizontal={!horizontal} />
        {categoryAxis}
        {valueAxis}
        <Tooltip formatter={format} />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: mobile ? 11 : 12 }} />}
        {series.map((s) => (
          <Bar key={s.key} isAnimationActive={false} dataKey={s.key} name={s.name ?? s.key} fill={s.color ?? "#2e7d32"} radius={horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0]}>
            {rowColors && series.length === 1 && data.map((_, i) => <Cell key={i} fill={rowColors[i % rowColors.length]} />)}
            {labels && <LabelList dataKey={s.key} position={horizontal ? "right" : "top"} formatter={format} fontSize={11} fill="#37474f" />}
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
  const mobile = useIsMobile();
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <ResponsiveContainer width="100%" height={mobile ? Math.min(height, 320) : height}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          innerRadius="45%"
          outerRadius={mobile ? "72%" : "80%"}
          paddingAngle={1}
          isAnimationActive={false}
          fontSize={mobile ? 10 : 12}
          label={({ percent }) => ((percent ?? 0) >= (mobile ? 0.06 : 0.04) ? `${((percent ?? 0) * 100).toFixed(1)}%` : "")}
          labelLine={false}
        >
          {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} />)}
        </Pie>
        <Tooltip formatter={(v) => `${fmt(Number(v), decimals)} (${total ? ((Number(v) / total) * 100).toFixed(1) : 0}%)`} />
        <Legend wrapperStyle={{ fontSize: mobile ? 11 : 12 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
