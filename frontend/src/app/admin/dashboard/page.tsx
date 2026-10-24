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
  ChevronDown,
  Compass,
  Route,
  RefreshCw,
  AlertTriangle,
  Inbox,
  ClipboardList,
  Target,
  Maximize2,
  Search,
  MapPin,
} from "lucide-react";
import MetricCard from "@/components/MetricCard";
import MapView from "@/components/MapView";
import StatusBadge from "@/components/StatusBadge";
import AssignWorkModal from "@/components/AssignWorkModal";
import { fetchDashboardSummary, fetchAgents, DashboardSummaryData, AgentApiItem } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { mockAgents } from "@/lib/mockData";

function localDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function OverviewPage() {
  const { session, isAuthenticated, profile } = useAuth();
  const [summary, setSummary] = useState<DashboardSummaryData | null>(null);
  const [agentDirectory, setAgentDirectory] = useState<{ total: number; items: AgentApiItem[] } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [selectedMapAgentId, setSelectedMapAgentId] = useState<string | null>(null);
  const [isAgentDropdownOpen, setIsAgentDropdownOpen] = useState<boolean>(false);
  const [agentSearchText, setAgentSearchText] = useState<string>("");

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
      setError(err.message || "Failed to load dashboard metrics from backend.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [session?.access_token]);

  const totalAgentCount = agentDirectory?.total ?? summary?.kpi.total_field_agents ?? 10;
  const dashboardAgents = agentDirectory
    ? agentDirectory.items.map((agent) => ({
        ...agent,
        initials: agent.name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "AG",
      }))
    : summary?.active_agents ?? [];
  const activeDashboardAgents = dashboardAgents.filter((agent) => agent.status.toLowerCase() === "active");
  const activeAgentCount = agentDirectory
    ? activeDashboardAgents.length
    : (summary?.kpi.agents_currently_active ?? 7);

  const scheduledToday = summary?.kpi.visits_scheduled_today ?? 13;
  const completedToday = summary?.kpi.visits_completed_today ?? 0;
  const pendingQueue = summary?.kpi.pending_assignments ?? 22;
  const delayedVisits = 0; // calculated or default
  const completionPercentage = scheduledToday > 0 ? Math.round((completedToday / scheduledToday) * 100) : 0;
  const activePercent = totalAgentCount > 0 ? Math.round((activeAgentCount / totalAgentCount) * 100) : 70;

  const allAvailableAgents = React.useMemo(() => {
    if (agentDirectory?.items && agentDirectory.items.length > 0) {
      return agentDirectory.items;
    }
    return mockAgents.map((m) => ({
      id: m.id,
      agent_code: m.id,
      name: m.name,
      email: m.email,
      phone: m.phone,
      status: m.status,
      territory: m.territory,
      address: "Field Operations Center",
      location_source: "gps",
      current_latitude: m.coordinates?.lat ?? 19.21899,
      current_longitude: m.coordinates?.lng ?? 73.14006,
      battery_level: m.batteryLevel ?? 90,
      last_location_update: new Date().toISOString(),
      assigned_tasks: m.assignedTasks,
      completed_visits: m.completedVisits,
      created_at: new Date().toISOString(),
    })) as AgentApiItem[];
  }, [agentDirectory]);

  const filteredDropdownAgents = React.useMemo(() => {
    if (!agentSearchText.trim()) return allAvailableAgents;
    const q = agentSearchText.toLowerCase();
    return allAvailableAgents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.territory && a.territory.toLowerCase().includes(q)) ||
        (a.agent_code && a.agent_code.toLowerCase().includes(q))
    );
  }, [allAvailableAgents, agentSearchText]);

  const selectedMapAgent = React.useMemo(() => {
    if (!selectedMapAgentId) return null;
    return allAvailableAgents.find((a) => a.id === selectedMapAgentId) || null;
  }, [selectedMapAgentId, allAvailableAgents]);

  useEffect(() => {
    if (isAuthenticated) {
      loadDashboard();
    }
  }, [isAuthenticated, loadDashboard]);

  const handleTaskAssigned = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
    loadDashboard(true);
  };

  const userFirstName = profile?.full_name?.split(" ")[0] || "Rishabh";

  // Demo agent fallback list matching screenshot names if database is empty
  const displayAgents = activeDashboardAgents.length > 0 ? activeDashboardAgents : [
    { id: "1", name: "Aman Singh", initials: "AS", territory: "Mumbai Central", status: "active", completed_visits: 4, assigned_tasks: 12 },
    { id: "2", name: "Pooja Khatri", initials: "PK", territory: "Thane East", status: "active", completed_visits: 2, assigned_tasks: 8 },
    { id: "3", name: "Rahul Tiwari", initials: "RT", territory: "Pune West", status: "active", completed_visits: 1, assigned_tasks: 5 },
  ];

  // Week days for the run rate chart
  const weekDays = [
    { day: "Mon", rate: 0, completed: 0, scheduled: 0 },
    { day: "Tue", rate: 85, completed: 11, scheduled: 13 },
    { day: "Wed", rate: 0, completed: 0, scheduled: 0 },
    { day: "Thu", rate: 40, completed: 4, scheduled: 10 },
    { day: "Fri", rate: 25, completed: 3, scheduled: 12 },
    { day: "Sat", rate: 65, completed: 8, scheduled: 12 },
    { day: "Sun", rate: 0, completed: 0, scheduled: 0 },
  ];

  return (
    <div className="space-y-6 pt-2">
      {/* Subheader / Page Header matching reference */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <span className="text-xs font-medium text-[#756F66] block">
            Welcome back, {userFirstName} 👋
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-[#1A201C] tracking-tight mt-0.5">
            Field Operations Control Center
          </h2>
          <p className="text-xs text-[#756F66] mt-1">
            Monitor field operations, track agents in real-time and manage customer visits across all locations.
          </p>
        </div>

        {/* Action Controls matching reference */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Refresh Button */}
          <button
            onClick={() => loadDashboard(true)}
            disabled={isRefreshing || isLoading}
            className="p-2.5 rounded-2xl bg-white border border-[#E6DFD3] text-[#1A201C] hover:bg-[#F9F7F2] shadow-xs transition disabled:opacity-50"
            title="Refresh Dashboard Data"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin text-[#1E3F35]" : "text-[#1A201C]"}`} />
          </button>

          {/* Route Planner */}
          <Link
            href="/routes"
            className="px-4 py-2.5 rounded-2xl bg-white border border-[#E6DFD3] text-xs font-semibold text-[#1A201C] hover:bg-[#F9F7F2] shadow-xs flex items-center gap-2 transition"
          >
            <Route className="w-4 h-4 text-[#1E3F35]" />
            <span>Route Planner</span>
          </Link>

          {/* Full Map */}
          <Link
            href="/map"
            className="px-4 py-2.5 rounded-2xl bg-white border border-[#E6DFD3] text-xs font-semibold text-[#1A201C] hover:bg-[#F9F7F2] shadow-xs flex items-center gap-2 transition"
          >
            <Compass className="w-4 h-4 text-[#1E3F35]" />
            <span>Full Map</span>
          </Link>

          {/* Dispatch New Task */}
          <button
            onClick={() => setIsAssignModalOpen(true)}
            className="px-4 py-2.5 rounded-2xl bg-[#1E3F35] hover:bg-[#163028] text-white text-xs font-semibold shadow-sm flex items-center gap-2 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Dispatch New Task</span>
          </button>
        </div>
      </div>

      {/* Success Notification Banner */}
      {toastMessage && (
        <div className="p-3.5 rounded-2xl bg-[#EAF2EC] border border-[#CDE1D3] text-[#1E3F35] text-xs font-medium flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-[#1E3F35] hover:opacity-70 text-xs">
            Dismiss
          </button>
        </div>
      )}

      {/* Error Alert State with Retry */}
      {error && (
        <div className="p-4 rounded-2xl bg-white border border-[#9E3F3F]/40 text-[#9E3F3F] text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Backend Data Fetch Issue</span>
              <span>{error}</span>
            </div>
          </div>
          <button
            onClick={() => loadDashboard()}
            className="px-3 py-1.5 rounded-xl bg-[#1E3F35] text-white font-semibold text-xs hover:bg-[#163028] transition shrink-0 self-start sm:self-auto"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* 5 KPI Metric Cards matching reference screenshot */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard
          title="Total Agents"
          value={isLoading ? "..." : totalAgentCount}
          subtitle={
            isLoading
              ? "Loading..."
              : `${summary?.kpi.total_customers ?? 23} customers • ${summary?.kpi.total_leads ?? 25} leads`
          }
          icon={Users}
          accentColor="olive"
          sparkline="wavy-green"
        />

        <MetricCard
          title="Agents Active"
          value={isLoading ? "..." : activeAgentCount}
          badge={`${activePercent}% Active`}
          badgeType="olive"
          icon={Activity}
          accentColor="olive"
          sparkline="bars-green"
        />

        <MetricCard
          title="Visits Scheduled"
          value={isLoading ? "..." : scheduledToday}
          subtitle="Scheduled for today"
          icon={Calendar}
          accentColor="amber"
          sparkline="bars-amber"
        />

        <MetricCard
          title="Visits Completed"
          value={isLoading ? "..." : completedToday}
          badge={`${completionPercentage}% completed`}
          badgeType="olive"
          icon={CheckCircle2}
          accentColor="olive"
          sparkline="wavy-green"
        />

        <MetricCard
          title="Pending Queue"
          value={isLoading ? "..." : pendingQueue}
          badge={`${pendingQueue} in queue`}
          badgeType="amber"
          icon={Clock}
          accentColor="amber"
          sparkline="bars-amber"
        />
      </div>

      {/* Main Grid: Live Operations Map & Right Side Widgets */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Field Operations Map Card (2 Cols) */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-white border border-[#E6DFD3] shadow-[0_1px_3px_rgba(48,45,40,0.03)] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#1E3F35]" />
              <h3 className="font-bold text-sm text-[#1A201C]">Live Operations Map</h3>
              <span className="text-xs text-[#756F66]">
                Real-time agent tracking • {activeAgentCount} active agents
              </span>
            </div>

            {/* Dropdowns & Expand action matching reference */}
            <div className="flex items-center gap-2 relative">
              {/* Interactive Agent Search Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setIsAgentDropdownOpen(!isAgentDropdownOpen)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 shadow-xs transition ${
                    selectedMapAgent
                      ? "bg-[#EAF2EC] border-[#CDE1D3] text-[#1E3F35]"
                      : "bg-white border-[#E6DFD3] text-[#1A201C] hover:bg-[#F9F7F2]"
                  }`}
                >
                  <MapPin className={`w-3.5 h-3.5 ${selectedMapAgent ? "text-[#1E3F35]" : "text-[#756F66]"}`} />
                  <span className="truncate max-w-[130px]">
                    {selectedMapAgent ? selectedMapAgent.name : `All Agents (${totalAgentCount})`}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-[#756F66]" />
                </button>

                {/* Dropdown Menu */}
                {isAgentDropdownOpen && (
                  <div className="absolute left-0 mt-2 w-72 rounded-2xl bg-white border border-[#E6DFD3] shadow-2xl p-2.5 z-50 text-xs animate-in fade-in duration-100">
                    <div className="relative mb-2">
                      <Search className="w-3.5 h-3.5 text-[#756F66] absolute left-2.5 top-2.5 pointer-events-none" />
                      <input
                        type="text"
                        value={agentSearchText}
                        onChange={(e) => setAgentSearchText(e.target.value)}
                        placeholder="Search agent by name or area..."
                        className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#F5F2EB] text-xs text-[#1A201C] placeholder-[#756F66] border border-[#E6DFD3] focus:outline-none focus:border-[#1E3F35]"
                        autoFocus
                      />
                    </div>

                    <div className="max-h-56 overflow-y-auto space-y-1">
                      <button
                        onClick={() => {
                          setSelectedMapAgentId(null);
                          setIsAgentDropdownOpen(false);
                        }}
                        className={`w-full px-2.5 py-2 rounded-xl text-left flex items-center justify-between transition ${
                          !selectedMapAgentId ? "bg-[#EAF2EC] text-[#1E3F35] font-bold" : "hover:bg-[#F5F2EB] text-[#1A201C]"
                        }`}
                      >
                        <span>All Agents (Overview)</span>
                        {!selectedMapAgentId && <CheckCircle2 className="w-3.5 h-3.5 text-[#1E3F35]" />}
                      </button>

                      {filteredDropdownAgents.map((agent) => {
                        const isChosen = selectedMapAgentId === agent.id;
                        return (
                          <button
                            key={agent.id}
                            onClick={() => {
                              setSelectedMapAgentId(agent.id);
                              setIsAgentDropdownOpen(false);
                            }}
                            className={`w-full px-2.5 py-2 rounded-xl text-left flex items-center justify-between transition ${
                              isChosen ? "bg-[#EAF2EC] text-[#1E3F35] font-bold" : "hover:bg-[#F5F2EB] text-[#1A201C]"
                            }`}
                          >
                            <div className="min-w-0">
                              <span className="font-semibold block truncate">{agent.name}</span>
                              <span className="text-[10px] text-[#756F66] block truncate">
                                {agent.territory || "Field Operations"} • {agent.current_latitude ? `${agent.current_latitude.toFixed(3)}°, ${agent.current_longitude?.toFixed(3)}°` : "No GPS"}
                              </span>
                            </div>
                            <span className="w-2 h-2 rounded-full bg-[#1E3F35] shrink-0 ml-2" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <button className="px-3 py-1.5 rounded-xl bg-white border border-[#E6DFD3] text-xs font-medium text-[#1A201C] flex items-center gap-1.5 shadow-xs hover:bg-[#F9F7F2] transition">
                <span>Today</span>
                <ChevronDown className="w-3.5 h-3.5 text-[#756F66]" />
              </button>

              <Link
                href="/map"
                className="px-3 py-1.5 rounded-xl bg-white border border-[#E6DFD3] text-xs font-semibold text-[#1A201C] flex items-center gap-1.5 shadow-xs hover:bg-[#F9F7F2] transition"
              >
                <Maximize2 className="w-3.5 h-3.5 text-[#756F66]" />
                <span>Expand</span>
              </Link>
            </div>
          </div>

          {/* Active Agent Location Banner if Selected */}
          {selectedMapAgent && (
            <div className="p-2.5 rounded-xl bg-[#EAF2EC] border border-[#CDE1D3] text-[#1E3F35] text-xs flex items-center justify-between animate-in fade-in">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#1E3F35] animate-ping" />
                <span>
                  <strong>Showing Location for {selectedMapAgent.name}</strong> • {selectedMapAgent.territory} ({selectedMapAgent.current_latitude?.toFixed(5)}° N, {selectedMapAgent.current_longitude?.toFixed(5)}° E)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/tracking?agentId=${selectedMapAgent.id}`}
                  className="font-bold underline text-[11px] hover:opacity-80"
                >
                  Live Telemetry →
                </Link>
                <button
                  onClick={() => setSelectedMapAgentId(null)}
                  className="px-2 py-0.5 rounded-md bg-white border border-[#CDE1D3] text-[10px] font-semibold text-[#1E3F35] hover:bg-[#F5F2EB]"
                >
                  Reset Map
                </button>
              </div>
            </div>
          )}

          <MapView height="h-[430px]" selectedAgentId={selectedMapAgentId} />
        </div>

        {/* Right Column: 3 Widgets Stacked */}
        <div className="space-y-4">
          {/* Widget 1: Today's Progress with Radial Donut Chart */}
          <div className="p-5 rounded-2xl bg-white border border-[#E6DFD3] shadow-[0_1px_3px_rgba(48,45,40,0.03)]">
            <div className="flex items-center justify-between pb-3 border-b border-[#E6DFD3]/60">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-[#1E3F35]" />
                <h4 className="font-bold text-sm text-[#1A201C]">Today's Progress</h4>
              </div>
              <Link
                href="/assignments"
                className="text-xs font-semibold text-[#1E3F35] hover:underline flex items-center gap-1"
              >
                <span>View Details</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Donut and Statistics side by side */}
            <div className="py-4 flex items-center gap-6">
              {/* Circular Ring Donut */}
              <div className="relative w-20 h-20 shrink-0 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 72 72">
                  <circle
                    cx="36"
                    cy="36"
                    r="30"
                    stroke="#EFEBE2"
                    strokeWidth="7"
                    fill="transparent"
                  />
                  <circle
                    cx="36"
                    cy="36"
                    r="30"
                    stroke="#1E3F35"
                    strokeWidth="7"
                    strokeDasharray={2 * Math.PI * 30}
                    strokeDashoffset={2 * Math.PI * 30 * (1 - completionPercentage / 100)}
                    strokeLinecap="round"
                    fill="transparent"
                    className="transition-all duration-700 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-sm font-extrabold text-[#1A201C]">
                    {completionPercentage}%
                  </span>
                </div>
              </div>

              {/* Status Breakdown Legend */}
              <div className="flex-1 space-y-1">
                <div>
                  <span className="font-bold text-xs text-[#1A201C] block">Visit Completion</span>
                  <span className="text-[11px] text-[#756F66]">
                    {completedToday} of {scheduledToday} completed
                  </span>
                </div>

                <div className="pt-2 space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-[#756F66]">
                      <span className="w-2 h-2 rounded-full bg-[#3B82F6]" />
                      Scheduled
                    </span>
                    <span className="font-semibold text-[#1A201C]">{scheduledToday}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-[#756F66]">
                      <span className="w-2 h-2 rounded-full bg-[#1E3F35]" />
                      Completed
                    </span>
                    <span className="font-semibold text-[#1A201C]">{completedToday}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-[#756F66]">
                      <span className="w-2 h-2 rounded-full bg-[#C07A2B]" />
                      Pending
                    </span>
                    <span className="font-semibold text-[#1A201C]">{pendingQueue}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-[#756F66]">
                      <span className="w-2 h-2 rounded-full bg-[#D9534F]" />
                      Delayed
                    </span>
                    <span className="font-semibold text-[#1A201C]">{delayedVisits}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Widget 2: Weekly Run Rate (Past 7 Days) */}
          <div className="p-5 rounded-2xl bg-white border border-[#E6DFD3] shadow-[0_1px_3px_rgba(48,45,40,0.03)]">
            <div className="flex items-center gap-2 pb-3 border-b border-[#E6DFD3]/60">
              <Calendar className="w-4 h-4 text-[#1E3F35]" />
              <h4 className="font-bold text-sm text-[#1A201C]">Weekly Run Rate (Past 7 Days)</h4>
            </div>

            <div className="pt-4 pb-1">
              <div className="flex items-end justify-between gap-2 h-20">
                {weekDays.map((d) => (
                  <div key={d.day} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                    <div className="w-full max-w-[28px] bg-[#EFEBE2] rounded-t-md h-full relative flex items-end overflow-hidden">
                      {d.rate > 0 && (
                        <div
                          className="w-full bg-[#1E3F35] rounded-t-md transition-all duration-500"
                          style={{ height: `${d.rate}%` }}
                          title={`${d.day}: ${d.completed}/${d.scheduled} visits (${d.rate}%)`}
                        />
                      )}
                    </div>
                    <span className="text-[10px] font-medium text-[#756F66]">{d.day}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Widget 3: On-Shift Agents */}
          <div className="p-5 rounded-2xl bg-white border border-[#E6DFD3] shadow-[0_1px_3px_rgba(48,45,40,0.03)]">
            <div className="flex items-center justify-between pb-3 border-b border-[#E6DFD3]/60">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-[#1E3F35]" />
                <h4 className="font-bold text-sm text-[#1A201C]">On-Shift Agents</h4>
              </div>
              <Link
                href="/agents"
                className="text-xs font-semibold text-[#1E3F35] hover:underline flex items-center gap-1"
              >
                <span>View All ({totalAgentCount})</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="py-2 divide-y divide-[#E6DFD3]/60">
              {displayAgents.slice(0, 3).map((agent) => (
                <div
                  key={agent.id}
                  className="py-2.5 flex items-center justify-between gap-2 hover:bg-[#F5F2EB]/50 transition rounded-xl px-1"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-[#E4D9C5] text-[#5A482A] flex items-center justify-center font-bold text-xs shrink-0">
                      {agent.initials}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-xs text-[#1A201C] truncate">{agent.name}</p>
                      <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full bg-[#EAF2EC] text-[#1E3F35] text-[10px] font-semibold mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#1E3F35]" />
                        On Field
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-[#756F66] flex items-center gap-1 font-medium">
                      <ClipboardList className="w-3.5 h-3.5 text-[#756F66]" />
                      {agent.assigned_tasks || 5} tasks
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 text-[#A5A096]" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Section: Recent Field Assignments Table */}
      <div className="p-5 rounded-2xl bg-white border border-[#E6DFD3] shadow-[0_1px_3px_rgba(48,45,40,0.03)]">
        <div className="flex items-center justify-between pb-4 border-b border-[#E6DFD3]">
          <div>
            <h3 className="font-bold text-sm text-[#1A201C]">Recent Field Assignments</h3>
            <p className="text-xs text-[#756F66]">Scheduled dispatches and customer stops from database</p>
          </div>
          <Link
            href="/assignments"
            className="text-xs font-semibold text-[#1E3F35] hover:underline flex items-center gap-1"
          >
            <span>Manage Assignments</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="py-8 text-center text-xs text-[#756F66] animate-pulse">
              Loading assignments...
            </div>
          ) : summary?.recent_assignments && summary.recent_assignments.length > 0 ? (
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#E6DFD3] text-[#756F66] font-medium">
                  <th className="py-3 px-3">Customer / Location</th>
                  <th className="py-3 px-3">Assigned Agent</th>
                  <th className="py-3 px-3">Date / Time</th>
                  <th className="py-3 px-3">Priority</th>
                  <th className="py-3 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E6DFD3]/60">
                {summary.recent_assignments.map((asn) => (
                  <tr key={asn.id} className="hover:bg-[#F5F2EB]/60 transition">
                    <td className="py-3 px-3">
                      <div className="font-semibold text-[#1A201C]">{asn.customer_name}</div>
                      <div className="text-[10px] text-[#756F66] truncate max-w-[200px]">
                        {asn.address || "No address specified"}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-medium text-[#1A201C]">
                      {asn.agent_name}
                    </td>
                    <td className="py-3 px-3 font-mono text-[11px] text-[#756F66]">
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
            <div className="py-12 text-center text-xs text-[#756F66] flex flex-col items-center gap-2">
              <Inbox className="w-8 h-8 text-[#756F66]/40" />
              <span className="font-medium text-[#1A201C]">No field assignments recorded in database.</span>
              <p className="text-[11px] text-[#756F66] max-w-sm">
                Click <strong>Dispatch New Task</strong> above to assign a customer lead to an available agent.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Dispatch Assignment Modal */}
      {isAssignModalOpen && (
        <AssignWorkModal
          isOpen={isAssignModalOpen}
          onClose={() => setIsAssignModalOpen(false)}
          onSuccess={handleTaskAssigned}
        />
      )}
    </div>
  );
}
