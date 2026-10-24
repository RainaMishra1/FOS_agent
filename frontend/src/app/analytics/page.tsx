"use client";

import React, { useState } from "react";
import { mockAgents, mockWeeklyActivity, mockKpiSummary } from "@/lib/mockData";
import MetricCard from "@/components/MetricCard";
import {
  BarChart3,
  TrendingUp,
  Users,
  CheckCircle2,
  Clock,
  Calendar,
  Download,
  Filter,
  ShieldCheck,
  ChevronDown,
} from "lucide-react";

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = useState("This Week");
  const [selectedAgent, setSelectedAgent] = useState("all");
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const handleExport = () => {
    setExportNotice("Exporting operational audit report (CSV)...");
    setTimeout(() => {
      setExportNotice("Report exported successfully.");
      setTimeout(() => setExportNotice(null), 2500);
    }, 1000);
  };

  const statusBreakdown = [
    { label: "Completed", count: 42, color: "#687653", pct: 62 },
    { label: "Active Visits", count: 8, color: "#B76E52", pct: 12 },
    { label: "Assigned & En Route", count: 7, color: "#C48A3F", pct: 10 },
    { label: "Pending in Queue", count: 11, color: "#9E8C78", pct: 16 },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-beige-border/80">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold text-beige-text tracking-tight">
              Reports & Operations Analytics
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-beige-sand text-beige-muted text-xs font-semibold border border-beige-border">
              Audit Data
            </span>
          </div>
          <p className="text-xs text-beige-muted mt-0.5">
            Visit completion rates, agent productivity metrics, and geofence verification compliance.
          </p>
        </div>

        {/* Header Controls */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="text-xs rounded-xl bg-beige-card border border-beige-border px-3 py-2 text-beige-text font-medium focus:outline-none"
          >
            <option value="Today">Today's Shift</option>
            <option value="This Week">Current Week (7 Days)</option>
            <option value="Last 30 Days">Last 30 Days</option>
            <option value="Quarter to Date">Quarter to Date</option>
          </select>

          <button
            onClick={handleExport}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-beige-card hover:bg-beige-sand border border-beige-border text-beige-text flex items-center gap-1.5 transition shadow-xs"
          >
            <Download className="w-4 h-4 text-beige-terracotta" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {exportNotice && (
        <div className="p-3 rounded-xl bg-beige-olive-subtle border border-beige-olive/40 text-xs font-medium text-beige-olive animate-in fade-in">
          {exportNotice}
        </div>
      )}

      {/* Top Level Metric Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Overall Completion Rate"
          value="91.4%"
          trend="+3.2% vs last week"
          trendType="positive"
          icon={CheckCircle2}
          accentColor="olive"
        />
        <MetricCard
          title="Avg Check-in Accuracy"
          value="14.2m"
          subtitle="Target <100m GPS accuracy"
          icon={ShieldCheck}
          accentColor="olive"
        />
        <MetricCard
          title="Route Efficiency Gain"
          value={mockKpiSummary.routeEfficiencyGain}
          trend="Saved 18.2 km today"
          trendType="positive"
          icon={TrendingUp}
          accentColor="terracotta"
        />
        <MetricCard
          title="Active Field Workload"
          value="5.2 stops/agent"
          subtitle="Balanced capacity"
          icon={Users}
          accentColor="amber"
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Weekly Activity Bar Chart (8 Cols) */}
        <div className="lg:col-span-8 p-5 rounded-2xl bg-beige-card border border-beige-border shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-beige-border">
            <div>
              <h3 className="font-bold text-sm text-beige-text">Daily Visit Execution Velocity</h3>
              <p className="text-xs text-beige-muted">Scheduled vs successfully completed customer visits</p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-beige-muted">
                <span className="w-2.5 h-2.5 rounded-sm bg-beige-olive" /> Completed
              </span>
              <span className="flex items-center gap-1.5 text-beige-muted">
                <span className="w-2.5 h-2.5 rounded-sm bg-beige-sand" /> Scheduled
              </span>
            </div>
          </div>

          {/* SVG Visual Bar Chart */}
          <div className="py-2">
            <div className="h-64 w-full flex items-end justify-between gap-2 pt-6 pb-2">
              {mockWeeklyActivity.map((d) => {
                const maxVal = 90;
                const schedHeight = (d.scheduled / maxVal) * 100;
                const compHeight = (d.completed / maxVal) * 100;

                return (
                  <div key={d.day} className="flex-1 flex flex-col items-center h-full justify-end group">
                    <div className="text-[10px] font-mono text-beige-muted mb-1 opacity-0 group-hover:opacity-100 transition">
                      {d.completed}/{d.scheduled}
                    </div>

                    <div className="w-full max-w-[48px] flex items-end gap-1 h-48">
                      {/* Scheduled Column */}
                      <div
                        className="flex-1 bg-beige-sand rounded-t-md transition-all"
                        style={{ height: `${schedHeight}%` }}
                      />
                      {/* Completed Column */}
                      <div
                        className="flex-1 bg-beige-olive rounded-t-md transition-all group-hover:bg-beige-olive-light"
                        style={{ height: `${compHeight}%` }}
                      />
                    </div>

                    <span className="text-[11px] font-medium text-beige-text mt-2">{d.day}</span>
                    <span className="text-[9px] font-mono text-beige-muted">{d.rate}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Task Status Distribution Donut Breakdown (4 Cols) */}
        <div className="lg:col-span-4 p-5 rounded-2xl bg-beige-card border border-beige-border shadow-xs space-y-4 flex flex-col justify-between">
          <div>
            <div className="pb-3 border-b border-beige-border">
              <h3 className="font-bold text-sm text-beige-text">Status Breakdown</h3>
              <p className="text-xs text-beige-muted">Today's 68 scheduled dispatches</p>
            </div>

            {/* Visual Multi-segment Bar */}
            <div className="py-4">
              <div className="h-4 w-full rounded-full bg-beige-sand overflow-hidden flex shadow-inner">
                {statusBreakdown.map((s) => (
                  <div
                    key={s.label}
                    style={{ width: `${s.pct}%`, backgroundColor: s.color }}
                    title={`${s.label}: ${s.count} (${s.pct}%)`}
                  />
                ))}
              </div>
            </div>

            {/* Breakdown List */}
            <div className="space-y-2.5 text-xs">
              {statusBreakdown.map((s) => (
                <div key={s.label} className="flex items-center justify-between p-2 rounded-xl bg-beige-bg">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="font-medium text-beige-text">{s.label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-beige-text font-mono">{s.count}</span>
                    <span className="text-[10px] text-beige-muted w-8 text-right font-mono">{s.pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-beige-border text-[11px] text-beige-muted">
            Audit logging: 100% of geofence check-ins verified by GPS metadata.
          </div>
        </div>
      </div>

      {/* Agent Productivity Table */}
      <div className="p-5 rounded-2xl bg-beige-card border border-beige-border shadow-xs space-y-3">
        <h3 className="font-bold text-sm text-beige-text">Agent Productivity & Compliance Scorecard</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-beige-border bg-beige-sidebar/40 text-beige-muted font-medium">
                <th className="py-2.5 px-3">Field Representative</th>
                <th className="py-2.5 px-3">Territory</th>
                <th className="py-2.5 px-3">Visits Assigned</th>
                <th className="py-2.5 px-3">Visits Completed</th>
                <th className="py-2.5 px-3">Completion Pace</th>
                <th className="py-2.5 px-3">Geofence Compliance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-beige-border/60">
              {mockAgents.map((ag) => (
                <tr key={ag.id} className="hover:bg-beige-bg/70 transition">
                  <td className="py-3 px-3 font-semibold text-beige-text flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-beige-olive text-white flex items-center justify-center font-bold text-[10px]">
                      {ag.initials}
                    </div>
                    <span>{ag.name}</span>
                  </td>
                  <td className="py-3 px-3 text-beige-muted">{ag.territory}</td>
                  <td className="py-3 px-3 font-mono font-medium text-beige-text">{ag.assignedTasks}</td>
                  <td className="py-3 px-3 font-mono font-medium text-beige-olive">{ag.completedVisits}</td>
                  <td className="py-3 px-3">
                    <span className="font-mono font-semibold text-beige-text">
                      {ag.assignedTasks > 0 ? Math.round((ag.completedVisits / ag.assignedTasks) * 100) : 0}%
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <span className="inline-flex items-center gap-1 text-[11px] text-beige-olive font-semibold">
                      <ShieldCheck className="w-3.5 h-3.5" /> 100%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
