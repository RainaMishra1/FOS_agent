"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Users,
  Activity,
  Calendar,
  CheckCircle2,
  Clock,
  Plus,
  ChevronRight,
  Compass,
  Route,
  RefreshCw,
  AlertTriangle,
  Inbox,
  ShieldCheck,
  Building2,
  Sparkles,
} from "lucide-react";
import MetricCard from "@/components/MetricCard";
import MapView from "@/components/MapView";
import StatusBadge from "@/components/StatusBadge";
import AssignWorkModal from "@/components/AssignWorkModal";
import { fetchDashboardSummary, fetchAgents, DashboardSummaryData, AgentApiItem, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

function localDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function OverviewPage() {
  const { session, isAuthenticated } = useAuth();
  const [summary, setSummary] = useState<DashboardSummaryData | null>(null);
  const [agentDirectory, setAgentDirectory] = useState<{ total: number; items: AgentApiItem[] } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const loadDashboard = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const [summaryResult, agentResult] = await Promise.allSettled([
        fetchDashboardSummary(session?.access_token, localDateString()),
        fetchAgents(session?.access_token, { limit: 100, as_of_date: localDateString() }),
      ]);
      if (summaryResult.status === "rejected") throw summaryResult.reason;
      setSummary(summaryResult.value);
      setAgentDirectory(agentResult.status === "fulfilled" ? agentResult.value : null);
    } catch (err: any) {
      console.error("Dashboard fetch error:", err);
      setError(err.message || "Failed to load dashboard metrics from FastAPI backend.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [session?.access_token]);

  const totalAgentCount = agentDirectory?.total ?? summary?.kpi.total_field_agents ?? 0;
  const dashboardAgents = agentDirectory
    ? agentDirectory.items.map((agent) => ({
        ...agent,
        initials: agent.name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "AG",
      }))
    : summary?.active_agents ?? [];
  const activeDashboardAgents = dashboardAgents.filter((agent) => agent.status.toLowerCase() === "active");
  const activeAgentCount = agentDirectory
    ? activeDashboardAgents.length
    : summary?.kpi.agents_currently_active ?? 0;

  useEffect(() => {
    if (isAuthenticated) {
      loadDashboard();
    }
  }, [isAuthenticated, loadDashboard]);

  const handleTaskAssigned = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
    // Refresh backend dashboard counts
    loadDashboard(true);
  };

  return (
    <div className="space-y-6">
      {/* Page Header with Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold text-beige-text tracking-tight">
              Field Operations Control Center
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-beige-sand text-beige-text border border-beige-border font-semibold">
              Live Backend
            </span>
          </div>
          <p className="text-xs text-beige-muted mt-0.5">
            Real-time field monitoring, 750m geofence tracking, and assignment dispatching.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Refresh Button */}
          <button
            onClick={() => loadDashboard(true)}
            disabled={isRefreshing || isLoading}
            className="p-2 rounded-xl text-beige-muted hover:text-beige-text bg-beige-sand/60 hover:bg-beige-sand border border-beige-border transition disabled:opacity-50"
            title="Refresh Dashboard Data from Backend"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-beige-terracotta" : ""}`} />
          </button>

          <Link
            href="/routes"
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-beige-sand hover:bg-beige-sidebar text-beige-text border border-beige-border flex items-center gap-1.5 transition"
          >
            <Route className="w-4 h-4 text-beige-terracotta" />
            <span>Route Planner</span>
          </Link>

          <Link
            href="/map"
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-beige-sand hover:bg-beige-sidebar text-beige-text border border-beige-border flex items-center gap-1.5 transition"
          >
            <Compass className="w-4 h-4 text-beige-terracotta" />
            <span>Full Map</span>
          </Link>

          <button
            onClick={() => setIsAssignModalOpen(true)}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-beige-terracotta hover:bg-beige-terracotta/90 text-white shadow-sm flex items-center gap-1.5 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Dispatch New Task</span>
          </button>
        </div>
      </div>

      {/* Success Notification Banner */}
      {toastMessage && (
        <div className="p-3.5 rounded-2xl bg-beige-olive-subtle border border-beige-olive/30 text-beige-olive text-xs font-medium flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-beige-olive hover:opacity-70 text-xs">
            Dismiss
          </button>
        </div>
      )}

      {/* Error Alert State with Retry */}
      {error && (
        <div className="p-4 rounded-2xl bg-[#FDF2F0] border border-beige-terracotta/40 text-beige-terracotta text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Backend Data Fetch Failed</span>
              <span>{error}</span>
            </div>
          </div>
          <button
            onClick={() => loadDashboard()}
            className="px-3 py-1.5 rounded-xl bg-beige-terracotta text-white font-semibold text-xs hover:bg-beige-terracotta/90 transition shrink-0 self-start sm:self-auto"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* 5 KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard
          title="Total Agents"
          value={isLoading ? "..." : totalAgentCount}
          subtitle={
            isLoading
              ? "Loading..."
              : `${summary?.kpi.total_customers ?? 0} customers, ${summary?.kpi.total_leads ?? 0} leads`
          }
          icon={Users}
          accentColor="default"
        />
        <MetricCard
          title="Agents Active"
          value={isLoading ? "..." : activeAgentCount}
          trend={isLoading ? undefined : (agentDirectory ? `${activeAgentCount} active` : summary?.kpi.active_change ?? "0 active")}
          trendType="positive"
          icon={Activity}
          accentColor="olive"
        />
        <MetricCard
          title="Visits Scheduled"
          value={isLoading ? "..." : (summary?.kpi.visits_scheduled_today ?? 0)}
          subtitle={isLoading ? "Loading..." : "Scheduled for today"}
          icon={Calendar}
          accentColor="amber"
        />
        <MetricCard
          title="Visits Completed"
          value={isLoading ? "..." : (summary?.kpi.visits_completed_today ?? 0)}
          trend={isLoading ? undefined : `${summary?.kpi.completed_percentage ?? 0}% completed`}
          trendType="positive"
          icon={CheckCircle2}
          accentColor="olive"
        />
        <MetricCard
          title="Pending Queue"
          value={isLoading ? "..." : (summary?.kpi.pending_assignments ?? 0)}
          trend={isLoading ? undefined : (summary?.kpi.pending_change ?? "In queue")}
          trendType="neutral"
          icon={Clock}
          accentColor="terracotta"
        />
      </div>

      {/* Main Grid: Map & Operational Pulse */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Field Operations Map (2 Columns) */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-beige-terracotta" />
              <h3 className="font-bold text-sm text-beige-text">Live Operations Map</h3>
              <span className="text-[11px] text-beige-muted">
                ({activeAgentCount} active agents in system)
              </span>
              <span className="text-[10px] bg-beige-sand text-beige-muted px-2 py-0.5 rounded-md font-mono border border-beige-border">
                Demo Map Layer
              </span>
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
                {isLoading ? "..." : `${summary?.kpi.completed_percentage ?? 0}% Done`}
              </span>
            </div>

            {/* Progress Bar & Milestone metrics */}
            <div className="py-4 space-y-3">
              <div>
                <div className="flex justify-between text-xs mb-1 font-medium text-beige-text">
                  <span>
                    {isLoading ? "..." : (summary?.kpi.visits_completed_today ?? 0)} Visits Completed
                  </span>
                  <span className="text-beige-muted">
                    {isLoading ? "..." : (summary?.kpi.visits_scheduled_today ?? 0)} Scheduled
                  </span>
                </div>
                <div className="w-full h-3 rounded-full bg-beige-sand overflow-hidden">
                  <div
                    className="h-full bg-beige-olive rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(summary?.kpi.completed_percentage ?? 0, 100)}%` }}
                  />
                </div>
              </div>

              {/* Weekly Trend Mini-Chart */}
              <div className="pt-2">
                <span className="text-[11px] font-semibold text-beige-muted uppercase tracking-wider block mb-2">
                  Weekly Run Rate (Past 7 Days)
                </span>
                <div className="flex items-end justify-between gap-1.5 h-16 pt-2">
                  {summary?.weekly_activity && summary.weekly_activity.length > 0 ? (
                    summary.weekly_activity.map((d) => (
                      <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full bg-beige-sand rounded-t-sm relative flex items-end h-12">
                          <div
                            className={`w-full rounded-t-sm transition-all ${
                              d.day === "Today" ? "bg-beige-terracotta" : "bg-beige-olive/75"
                            }`}
                            style={{ height: `${Math.max(d.rate, d.scheduled > 0 ? 10 : 0)}%` }}
                            title={`${d.day} (${d.date}): ${d.completed}/${d.scheduled} visits (${d.rate}%)`}
                          />
                        </div>
                        <span className="text-[9px] font-medium text-beige-muted">{d.day}</span>
                      </div>
                    ))
                  ) : (
                    <div className="w-full text-center text-xs text-beige-muted py-4">
                      {isLoading ? "Computing weekly pace..." : "No visits recorded in the last 7 days."}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-beige-border/60 flex items-center justify-between text-xs text-beige-muted">
              <span>Avg Geofence Accuracy</span>
              <span className="font-semibold text-beige-text font-mono">
                {summary?.avg_geofence_accuracy_meters
                  ? `${summary.avg_geofence_accuracy_meters}m (Target <100m)`
                  : "N/A (Awaiting Check-ins)"}
              </span>
            </div>
          </div>

          {/* Active Agents Snapshot */}
          <div className="p-5 rounded-2xl bg-beige-card border border-beige-border shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-beige-border/60">
              <h4 className="font-bold text-sm text-beige-text">On-Shift Agents</h4>
              <Link href="/agents" className="text-xs text-beige-terracotta hover:underline font-medium">
                View All ({totalAgentCount})
              </Link>
            </div>

            <div className="py-2 space-y-2.5">
              {isLoading ? (
                <div className="text-center py-6 text-xs text-beige-muted animate-pulse">
                  Loading agent statuses from backend...
                </div>
              ) : activeDashboardAgents.length > 0 ? (
                activeDashboardAgents.slice(0, 4).map((agent) => (
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
                        <p className="text-[10px] text-beige-muted truncate">
                          {agent.territory || "Unassigned Territory"}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <StatusBadge status={agent.status as any} size="sm" />
                      <span className="text-[10px] text-beige-muted block mt-0.5">
                        {agent.completed_visits}/{agent.assigned_tasks} visits
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-xs text-beige-muted flex flex-col items-center gap-1">
                  <Users className="w-6 h-6 text-beige-muted/40 mb-1" />
                  <span className="font-medium">No agents registered in database.</span>
                  <span className="text-[10px]">Invite field representatives in the Agents Directory.</span>
                </div>
              )}
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
              <p className="text-xs text-beige-muted">Scheduled dispatches and customer stops from database</p>
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
            {isLoading ? (
              <div className="py-8 text-center text-xs text-beige-muted animate-pulse">
                Loading assignments...
              </div>
            ) : summary?.recent_assignments && summary.recent_assignments.length > 0 ? (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-beige-border text-beige-muted font-medium">
                    <th className="py-2.5 px-3">Customer / Location</th>
                    <th className="py-2.5 px-3">Assigned Agent</th>
                    <th className="py-2.5 px-3">Date / Time</th>
                    <th className="py-2.5 px-3">Priority</th>
                    <th className="py-2.5 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-beige-border/60">
                  {summary.recent_assignments.map((asn) => (
                    <tr key={asn.id} className="hover:bg-beige-bg/70 transition">
                      <td className="py-3 px-3">
                        <div className="font-semibold text-beige-text">{asn.customer_name}</div>
                        <div className="text-[10px] text-beige-muted truncate max-w-[200px]">
                          {asn.address || "No address specified"}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-medium text-beige-text">
                        {asn.agent_name}
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-beige-muted">
                        {asn.scheduled_date} {asn.scheduled_time}
                      </td>
                      <td className="py-3 px-3">
                        <StatusBadge status={asn.priority as any} size="sm" />
                      </td>
                      <td className="py-3 px-3">
                        <StatusBadge status={asn.status as any} size="sm" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="py-12 text-center text-xs text-beige-muted flex flex-col items-center gap-2">
                <Inbox className="w-8 h-8 text-beige-muted/40" />
                <span className="font-medium">No field assignments recorded in database.</span>
                <p className="text-[11px] text-beige-muted max-w-sm">
                  Click <strong>Dispatch New Task</strong> above to assign a customer lead to an available agent.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Visits List (1 Col) */}
        <div className="p-5 rounded-2xl bg-beige-card border border-beige-border shadow-xs">
          <div className="flex items-center justify-between pb-4 border-b border-beige-border">
            <div>
              <h3 className="font-bold text-sm text-beige-text">Today's Visits Schedule</h3>
              <p className="text-xs text-beige-muted">Real-time geofenced check-ins</p>
            </div>
            <span className="text-xs font-mono font-medium text-beige-muted">
              {summary?.today_visits ? `${summary.today_visits.length} visits` : "0 visits"}
            </span>
          </div>

          <div className="py-2 divide-y divide-beige-border/60">
            {isLoading ? (
              <div className="py-8 text-center text-xs text-beige-muted animate-pulse">
                Loading today's schedule...
              </div>
            ) : summary?.today_visits && summary.today_visits.length > 0 ? (
              summary.today_visits.map((visit) => (
                <div key={visit.id} className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-xs text-beige-text truncate">
                        {visit.customer_name}
                      </span>
                      {visit.geofence_verified && (
                        <span className="text-[9px] bg-beige-olive-subtle text-beige-olive px-1.5 py-0.2 rounded font-bold">
                          750m Verified
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-beige-muted mt-0.5">
                      Agent: <span className="font-medium text-beige-text">{visit.agent_name}</span>
                    </p>
                    <p className="text-[10px] text-beige-muted mt-0.5 truncate">{visit.address || "On-site"}</p>
                  </div>

                  <div className="text-right shrink-0 space-y-1">
                    <span className="text-[11px] font-mono font-semibold text-beige-text block">
                      {visit.scheduled_time}
                    </span>
                    <StatusBadge status={visit.status as any} size="sm" />
                  </div>
                </div>
              ))
            ) : (
              <div className="py-12 text-center text-xs text-beige-muted flex flex-col items-center gap-2">
                <Calendar className="w-8 h-8 text-beige-muted/40" />
                <span className="font-medium">No visits scheduled for today.</span>
                <span className="text-[10px] text-beige-muted">
                  All scheduled on-site inspections will appear here.
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Task Dispatch Modal */}
      <AssignWorkModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        onSuccess={handleTaskAssigned}
      />
    </div>
  );
}
