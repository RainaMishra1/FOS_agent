"use client";

import React, { useState } from "react";

export interface Slice {
  key: string;
  label: string;
  value: number;
  color: string;
}

/** Donut chart with the total in the middle and a legend with counts and shares. */
export function DonutChart({ slices, centerLabel = "leads", onSliceClick }: { slices: Slice[]; centerLabel?: string; onSliceClick?: (key: string) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const radius = 62;
  const stroke = 22;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const hovered = slices.find((s) => s.key === hover);

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <svg viewBox="0 0 160 160" className="h-40 w-40 shrink-0" role="img" aria-label={`${total} ${centerLabel} by status`}>
        <circle cx="80" cy="80" r={radius} fill="none" stroke="#F1F0F8" strokeWidth={stroke} />
        {total > 0 &&
          slices.map((s) => {
            if (s.value === 0) return null;
            const length = (s.value / total) * circumference;
            const gap = slices.filter((x) => x.value > 0).length > 1 ? 2 : 0;
            const el = (
              <circle
                key={s.key}
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke={s.color}
                strokeWidth={hover === s.key ? stroke + 4 : stroke}
                strokeDasharray={`${Math.max(0, length - gap)} ${circumference}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 80 80)"
                className="cursor-pointer transition-all"
                onMouseEnter={() => setHover(s.key)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onSliceClick?.(s.key)}
              />
            );
            offset += length;
            return el;
          })}
        <text x="80" y="76" textAnchor="middle" className="fill-[#16151F]" style={{ fontSize: 26, fontWeight: 700 }}>
          {hovered ? hovered.value : total}
        </text>
        <text x="80" y="96" textAnchor="middle" className="fill-[#62607A]" style={{ fontSize: 11 }}>
          {hovered ? hovered.label.toLowerCase() : centerLabel}
        </text>
      </svg>
      <ul className="w-full space-y-1.5 text-xs">
        {slices.map((s) => (
          <li
            key={s.key}
            onMouseEnter={() => setHover(s.key)}
            onMouseLeave={() => setHover(null)}
            onClick={() => onSliceClick?.(s.key)}
            className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 ${hover === s.key ? "bg-[#F7F7FB]" : ""}`}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="flex-1 text-[#16151F]">{s.label}</span>
            <span className="font-semibold text-[#16151F]">{s.value}</span>
            <span className="w-10 text-right text-[#9A98AE]">{total ? Math.round((s.value / total) * 100) : 0}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface StackedRow {
  key: string;
  label: string;
  sublabel?: string;
  segments: { key: string; value: number; color: string; label: string }[];
  highlighted?: boolean;
}

/** Horizontal stacked bars with an axis, value labels and an optional average marker. */
export function StackedBarChart({
  rows,
  average,
  averageLabel = "Team average",
  onRowClick,
  emptyText = "No data yet.",
}: {
  rows: StackedRow[];
  average?: number | null;
  averageLabel?: string;
  onRowClick?: (key: string) => void;
  emptyText?: string;
}) {
  const totals = rows.map((r) => r.segments.reduce((s, x) => s + x.value, 0));
  const max = Math.max(1, ...totals, average ?? 0);
  const step = max <= 5 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : max <= 50 ? 10 : Math.ceil(max / 5 / 10) * 10;
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);

  if (rows.length === 0) return <p className="text-xs text-[#62607A]">{emptyText}</p>;

  return (
    <div className="text-xs">
      <div className="space-y-2.5">
        {rows.map((row, i) => (
          <button
            key={row.key}
            type="button"
            onClick={() => onRowClick?.(row.key)}
            className={`grid w-full grid-cols-[110px_minmax(0,1fr)_28px] items-center gap-2 rounded-lg px-1 py-0.5 text-left ${row.highlighted ? "bg-[#F7F7FB]" : "hover:bg-[#F7F7FB]"}`}
          >
            <span className="min-w-0">
              <span className="block truncate font-semibold text-[#16151F]">{row.label}</span>
              {row.sublabel && <span className="block truncate text-[10px] text-[#9A98AE]">{row.sublabel}</span>}
            </span>
            <span className="relative block h-5 rounded bg-[#F1F0F8]">
              <span className="absolute inset-y-0 left-0 flex overflow-hidden rounded" style={{ width: `${(totals[i] / top) * 100}%` }}>
                {row.segments.map((seg) =>
                  seg.value > 0 ? (
                    <span
                      key={seg.key}
                      title={`${seg.label}: ${seg.value}`}
                      className="h-full"
                      style={{ width: `${(seg.value / Math.max(1, totals[i])) * 100}%`, background: seg.color }}
                    />
                  ) : null
                )}
              </span>
              {average != null && average > 0 && (
                <span className="absolute -top-1 -bottom-1 w-0 border-l-2 border-dashed border-[#16151F]" style={{ left: `${(average / top) * 100}%` }} />
              )}
            </span>
            <span className="text-right font-semibold text-[#16151F]">{totals[i]}</span>
          </button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-[110px_minmax(0,1fr)_28px] gap-2 px-1">
        <span />
        <span className="relative h-4 border-t border-[#E3E2EE]">
          {ticks.map((t) => (
            <span key={t} className="absolute -translate-x-1/2 pt-0.5 text-[10px] text-[#9A98AE]" style={{ left: `${(t / top) * 100}%` }}>
              {t}
            </span>
          ))}
        </span>
        <span />
      </div>
      {average != null && average > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[#62607A]">
          <span className="inline-block h-3 w-0 border-l-2 border-dashed border-[#16151F]" /> {averageLabel}: {average.toFixed(1)}
        </p>
      )}
    </div>
  );
}

/** Small horizontal share bar used inside KPI cards. */
export function ShareBar({ value, total, color }: { value: number; total: number; color: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#F1F0F8]">
      <div className="h-full rounded-full transition-all" style={{ width: `${total ? (value / total) * 100 : 0}%`, background: color }} />
    </div>
  );
}
