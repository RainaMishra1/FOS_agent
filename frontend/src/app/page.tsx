"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Users,
  Activity,
  Calendar,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Plus,
  MapPin,
  ChevronRight,
  TrendingUp,
  Compass,
  Building2,
  Smartphone,
  ShieldAlert,
} from "lucide-react";
import MetricCard from "@/components/MetricCard";
import MapView from "@/components/MapView";
import StatusBadge from "@/components/StatusBadge";
import AssignWorkModal from "@/components/AssignWorkModal";
import {
  mockAgents,
  mockAssignments,
  mockUpcomingVisits,
  mockKpiSummary,
  mockWeeklyActivity,
} from "@/lib/mockData";
import { Agent } from "@/types";

export default function OverviewPage() {
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  return (
    <div className="space-y-6">
      {/* Page Header with Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-beige-text tracking-tight">
            Field Operations Control Center
          </h2>
          <p className="text-xs text-beige-muted mt-0.5">
            Real-time field monitoring, 100m geofence tracking, and assignment dispatching.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Link
            href="/map"
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-beige-sand hover:bg-beige-sidebar text-beige-text border border-beige-border flex items-center gap-1.5 transition"
          >
            <Compass className="w-4 h-4 text-beige-terracotta" />
            <span>Full Map View</span>
          </Link>

          <button
            onClick={() => setIsAssignModalOpen(true)}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-beige-terracotta hover:bg-beige-terracotta-light text-white shadow-sm flex items-center gap-1.5 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Dispatch New Task</span>
          </button>
        </div>
      </div>

      {/* 5 KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard
          title="Total Agents"
          value={mockKpiSummary.totalFieldAgents}
          subtitle="4 registered territories"
          icon={Users}
          accentColor="default"
        />
        <MetricCard
          title="Agents Active"
          value={mockKpiSummary.agentsCurrentlyActive}
          trend={mockKpiSummary.activeChange}
          trendType="positive"
          icon={Activity}
          accentColor="olive"
        />
        <MetricCard
          title="Visits Scheduled"
          value={mockKpiSummary.visitsScheduledToday}
          subtitle="Across 5 shifts"
          icon={Calendar}
          accentColor="amber"
        />
        <MetricCard
          title="Visits Completed"
          value={mockKpiSummary.visitsCompletedToday}
          trend={`${mockKpiSummary.completedPercentage}% completion`}
          trendType="positive"
          icon={CheckCircle2}
          accentColor="olive"
        />
        <MetricCard
          title="Pending Queue"
          value={mockKpiSummary.pendingAssignments}
          trend={mockKpiSummary.pendingChange}
          trendType="neutral"
          icon={Clock}
          accentColor="terracotta"
        />
      </div>

      {/* Main Grid: Map & Operational Pulse */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Field Operations Map Preview (2 Columns) */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-beige-terracotta" />
              <h3 className="font-bold text-sm text-beige-text">Live Operations Map</h3>
              <span className="text-[11px] text-beige-muted">({mockAgents.filter((a) => a.status === "active").length} active agents tracked)</span>
            </div>
            <Link
              href="/map"
              className="text-xs font-semibold text-beige-terracotta hover:underline flex items-center gap-1"
            >
              <span>Expand Map</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <MapView height="h-[430px]" />
        </div>

        {/* Right Column: Today's Completion & Agent Activity Summary */}
        <div className="space-y-6">
          {/* Today's Visit Completion Chart */}
          <div className="p-5 rounded-2xl bg-beige-card border border-beige-border shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-beige-border/60">
              <div>
                <h4 className="font-bold text-sm text-beige-text">Today's Progress</h4>
                <p className="text-[11px] text-beige-muted">Visit completion pace</p>
              </div>
              <span className="text-xs font-mono font-bold text-beige-olive bg-beige-olive-subtle px-2 py-0.5 rounded-md">
                {mockKpiSummary.completedPercentage}% Done
              </span>
            </div>

            {/* Progress Bar & Milestone metrics */}
            <div className="py-4 space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1 font-medium text-beige-text">
                  <span>{mockKpiSummary.visitsCompletedToday} Visits Completed</span>
                  <span className="text-beige-muted">{mockKpiSummary.visitsScheduledToday} Scheduled</span>
                </div>
                <div className="w-full h-3 rounded-full bg-beige-sand overflow-hidden">
                  <div
                    className="h-full bg-beige-olive rounded-full transition-all duration-500"
                    style={{ width: `${mockKpiSummary.completedPercentage}%` }}
                  />
                </div>
              </div>

              {/* Weekly Trend Mini-Chart (SVG) */}
              <div className="pt-2">
                <span className="text-[11px] font-semibold text-beige-muted uppercase tracking-wider block mb-2">
                  Weekly Run Rate
                </span>
                <div className="flex items-end justify-between gap-1.5 h-16 pt-2">
                  {mockWeeklyActivity.map((d, i) => (
                    <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full bg-beige-sand rounded-t-sm relative flex items-end h-12">
                        <div
                          className={`w-full rounded-t-sm transition-all ${
                            d.day === "Today" ? "bg-beige-terracotta" : "bg-beige-olive/75"
                          }`}
                          style={{ height: `${d.rate}%` }}
                          title={`${d.day}: ${d.completed}/${d.scheduled} (${d.rate}%)`}
                        />
                      </div>
                      <span className="text-[9px] font-medium text-beige-muted">{d.day}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-beige-border/60 flex items-center justify-between text-xs text-beige-muted">
              <span>Avg Geofence Accuracy</span>
              <span className="font-semibold text-beige-text font-mono">14.2m (Target &lt;50m)</span>
            </div>
          </div>

          {/* Active Agents Snapshot */}
          <div className="p-5 rounded-2xl bg-beige-card border border-beige-border shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-beige-border/60">
              <h4 className="font-bold text-sm text-beige-text">On-Shift Agents</h4>
              <Link href="/agents" className="text-xs text-beige-terracotta hover:underline font-medium">
                View All ({mockAgents.length})
              </Link>
            </div>

            <div className="py-2 space-y-2.5">
              {mockAgents.slice(0, 4).map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center justify-between p-2 rounded-xl hover:bg-beige-bg transition"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-beige-olive text-white flex items-center justify-center font-bold text-xs shrink-0">
                      {agent.initials}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-xs text-beige-text truncate">{agent.name}</p>
                      <p className="text-[10px] text-beige-muted truncate">{agent.territory}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <StatusBadge status={agent.status} size="sm" />
                    <span className="text-[10px] text-beige-muted block mt-0.5">
                      {agent.completedVisits}/{agent.assignedTasks} visits
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Grid: Recent Assignments & Upcoming Visits */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Assignments Table (2 Cols) */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-beige-card border border-beige-border shadow-xs">
          <div className="flex items-center justify-between pb-4 border-b border-beige-border">
            <div>
              <h3 className="font-bold text-sm text-beige-text">Recent Field Assignments</h3>
              <p className="text-xs text-beige-muted">Scheduled dispatches and customer stops</p>
            </div>
            <Link
              href="/assignments"
              className="text-xs font-semibold text-beige-terracotta hover:underline flex items-center gap-1"
            >
              <span>Manage Assignments</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-beige-border text-beige-muted font-medium">
                  <th className="py-2.5 px-3">Customer / Location</th>
                  <th className="py-2.5 px-3">Assigned Agent</th>
                  <th className="py-2.5 px-3">Time</th>
                  <th className="py-2.5 px-3">Priority</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-beige-border/60">
                {mockAssignments.slice(0, 5).map((asn) => (
                  <tr key={asn.id} className="hover:bg-beige-bg/70 transition">
                    <td className="py-3 px-3">
                      <div className="font-semibold text-beige-text">{asn.customerName}</div>
                      <div className="text-[10px] text-beige-muted truncate max-w-[200px]">
                        {asn.address}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-medium text-beige-text">
                      {asn.agentName}
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-beige-muted">
                      {asn.scheduledTime}
                    </td>
                    <td className="py-3 px-3">
                      <StatusBadge status={asn.priority} size="sm" />
                    </td>
                    <td className="py-3 px-3">
                      <StatusBadge status={asn.status} size="sm" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Upcoming Visits List (1 Col) */}
        <div className="p-5 rounded-2xl bg-beige-card border border-beige-border shadow-xs">
          <div className="flex items-center justify-between pb-4 border-b border-beige-border">
            <div>
              <h3 className="font-bold text-sm text-beige-text">Today's Visits Schedule</h3>
              <p className="text-xs text-beige-muted">Real-time geofence check-ins</p>
            </div>
            <span className="text-xs font-mono font-medium text-beige-muted">
              {mockUpcomingVisits.length} visits
            </span>
          </div>

          <div className="py-2 divide-y divide-beige-border/60">
            {mockUpcomingVisits.map((visit) => (
              <div key={visit.id} className="py-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-xs text-beige-text truncate">
                      {visit.customerName}
                    </span>
                  </div>
                  <p className="text-[11px] text-beige-muted mt-0.5">
                    Agent: <span className="font-medium text-beige-text">{visit.agentName}</span>
                  </p>
                  <p className="text-[10px] text-beige-muted mt-0.5">{visit.address}</p>
                </div>

                <div className="text-right shrink-0 space-y-1">
                  <span className="text-[11px] font-mono font-semibold text-beige-text block">
                    {visit.scheduledTime}
                  </span>
                  <StatusBadge status={visit.status} size="sm" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Task Dispatch Modal */}
      <AssignWorkModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        preselectedAgent={selectedAgent}
      />
    </div>
  );
}
