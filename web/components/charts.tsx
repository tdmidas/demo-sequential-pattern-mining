"use client";

import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AlgorithmId } from "@/lib/mining/types";

// Màu gắn cố định với từng thuật toán trên mọi biểu đồ (không đổi theo thứ tự hay bộ lọc).
export const ALGO_COLOR: Record<AlgorithmId, string> = { gsp: "#2a78d6", spade: "#eb6834", prefixspan: "#1baf7a" };
export const ALGO_NAME: Record<AlgorithmId, string> = { gsp: "GSP", spade: "SPADE", prefixspan: "PrefixSpan" };
export const ALGO_IDS: AlgorithmId[] = ["gsp", "spade", "prefixspan"];

export interface Series {
  key: string;
  name: string;
  color: string;
  dashed?: boolean;
}

const AXIS = { fontSize: 11.5, fill: "#4a5567" };
const GRID = "#e6e9ef";

type Row = Record<string, number | string | null>;

function TooltipBox({
  active,
  payload,
  label,
  format,
  labelPrefix,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string | number;
  format: (v: number) => string;
  labelPrefix?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line-strong bg-surface px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-semibold text-ink">
        {labelPrefix}
        {label}
      </div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 py-0.5">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-ink-2">{p.name}</span>
          <span className="tabular ml-auto pl-4 font-semibold text-ink">{p.value == null ? "–" : format(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

interface ChartProps {
  data: Row[];
  xKey: string;
  series: Series[];
  format: (v: number) => string;
  xLabel?: string;
  labelPrefix?: string;
  height?: number;
  logScale?: boolean;
}

export function LineChartBox({ data, xKey, series, format, xLabel, labelPrefix, height = 260, logScale }: ChartProps) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: xLabel ? 18 : 0, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={AXIS}
            tickLine={false}
            axisLine={{ stroke: "#cfd5de" }}
            label={xLabel ? { value: xLabel, position: "insideBottom", offset: -12, fontSize: 11.5, fill: "#7a8494" } : undefined}
          />
          <YAxis
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            tickFormatter={format}
            width={58}
            scale={logScale ? "log" : "auto"}
            domain={logScale ? ["auto", "auto"] : [0, "auto"]}
            allowDataOverflow={false}
          />
          <Tooltip content={<TooltipBox format={format} labelPrefix={labelPrefix} />} cursor={{ stroke: "#cfd5de" }} />
          <Legend verticalAlign="top" align="right" iconType="plainline" height={28} wrapperStyle={{ fontSize: 12, color: "#4a5567" }} />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.name}
              stroke={s.color}
              strokeWidth={2}
              strokeDasharray={s.dashed ? "5 4" : undefined}
              dot={{ r: 3.5, fill: s.color, stroke: "#fff", strokeWidth: 1.5 }}
              activeDot={{ r: 5 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarChartBox({ data, xKey, series, format, xLabel, labelPrefix, height = 260, logScale }: ChartProps) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: xLabel ? 18 : 0, left: 4 }} barGap={2} barCategoryGap="22%">
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={AXIS}
            tickLine={false}
            axisLine={{ stroke: "#cfd5de" }}
            label={xLabel ? { value: xLabel, position: "insideBottom", offset: -12, fontSize: 11.5, fill: "#7a8494" } : undefined}
          />
          <YAxis
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            tickFormatter={format}
            width={58}
            scale={logScale ? "log" : "auto"}
            domain={logScale ? [1, "auto"] : [0, "auto"]}
            allowDataOverflow={logScale}
          />
          <Tooltip content={<TooltipBox format={format} labelPrefix={labelPrefix} />} cursor={{ fill: "#f3f5f8" }} />
          {series.length > 1 && (
            <Legend verticalAlign="top" align="right" iconType="square" iconSize={9} height={28} wrapperStyle={{ fontSize: 12, color: "#4a5567" }} />
          )}
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[3, 3, 0, 0]} maxBarSize={26} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Bảng số liệu đi kèm biểu đồ (ẩn mặc định). */
export function DataTable({ data, xKey, xHeader, series, format }: { data: Row[]; xKey: string; xHeader: string; series: Series[]; format: (v: number) => string }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="inline-block select-none text-ink-2 hover:text-brand-700">Xem bảng số liệu</summary>
      <div className="thin-scroll mt-2 overflow-x-auto">
        <table className="tabular w-full border-collapse text-right">
          <thead>
            <tr className="border-b border-line-strong text-ink-2">
              <th className="py-1.5 pr-3 text-left font-medium">{xHeader}</th>
              {series.map((s) => (
                <th key={s.key} className="px-3 py-1.5 font-medium">
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={String(row[xKey])} className="border-b border-line">
                <td className="py-1.5 pr-3 text-left text-ink">{row[xKey]}</td>
                {series.map((s) => (
                  <td key={s.key} className="px-3 py-1.5 text-ink">
                    {row[s.key] == null ? "quá thời gian" : format(row[s.key] as number)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
