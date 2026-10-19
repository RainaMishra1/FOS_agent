"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Agent } from "@/types";
import StatusBadge from "@/components/StatusBadge";
import AssignWorkModal from "@/components/AssignWorkModal";
import { fetchAgents, AgentApiItem, ApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  Search,
  Filter,
  Plus,
  Phone,
  Mail,
  MapPin,
  Clock,
  Battery,
  Shield,
  X,
  ExternalLink,
  CheckCircle2,
  Calendar,
  RefreshCw,
  AlertTriangle,
  Users,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export default function AgentsPage() {
  const { session, isAuthenticated } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [totalAgents, setTotalAgents] = useState(0);
  const [skip, setSkip] = useState(0);
  const limit = 10;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [territoryFilter, setTerritoryFilter] = useState("all");
  const [availableTerritories, setAvailableTerritories] = useState<string[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assigningAgent, setAssigningAgent] = useState<Agent | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const mapApiAgentToModel = (item: AgentApiItem): Agent => {
    const name = item.name || item.agent_code || "Unknown Agent";
    const initials = name
      .split(" ")
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "AG";

    let formattedUpdate = "Never";
    if (item.last_location_update) {
      try {
        formattedUpdate = new Date(item.last_location_update).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
      } catch {
        formattedUpdate = item.last_location_update;
      }
    }

    return {
      id: item.id,
      name,
      initials,
      email: item.email || "No email",
      phone: item.phone || "No phone",
      status: (item.status || "active") as any,
      territory: item.territory || "Unassigned",
      currentTask: item.assigned_tasks > 0 ? `${item.assigned_tasks} active task(s)` : "Available for dispatch",
      assignedTasks: item.assigned_tasks,
      completedVisits: item.completed_visits,
      lastLocationUpdate: formattedUpdate,
      coordinates: {
        lat: item.current_latitude || 12.9716,
        lng: item.current_longitude || 77.5946,
      },
      batteryLevel: item.battery_level ?? 85,
    };
  };

  const loadAgents = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetchAgents(session?.access_token, {
        skip,
        limit,
        status: statusFilter !== "all" ? statusFilter : undefined,
        territory: territoryFilter !== "all" ? territoryFilter : undefined,
        search: search.trim() || undefined,
      });

      const mapped = res.items.map(mapApiAgentToModel);
      setAgents(mapped);
      setTotalAgents(res.total);

      // Collect territories
      const terrSet = new Set<string>();
      res.items.forEach((item) => {
        if (item.territory) terrSet.add(item.territory);
      });
      setAvailableTerritories((prev) => Array.from(new Set([...prev, ...Array.from(terrSet)])));
    } catch (err: any) {
      console.error("Failed to load agents:", err);
      setError(err.message || "Failed to load agent directory from FastAPI backend.");
    } finally {
      setIsLoading(false);
    }
  }, [session?.access_token, skip, limit, statusFilter, territoryFilter, search]);

  useEffect(() => {
    if (isAuthenticated) {
      loadAgents();
    }
  }, [isAuthenticated, loadAgents]);

  const handleOpenAssign = (agent?: Agent | null) => {
    setAssigningAgent(agent || null);
    setIsAssignModalOpen(true);
  };

  const totalPages = Math.ceil(totalAgents / limit) || 1;
  const currentPage = Math.floor(skip / limit) + 1;

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-beige-border/80">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl sm:text-2xl font-bold text-beige-text tracking-tight">
              Field Agent Directory
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-beige-sand text-beige-text border border-beige-border font-semibold">
              Live Backend
            </span>
          </div>
          <p className="text-xs text-beige-muted mt-0.5">
            Manage field representatives, operational status, territory coverage, and task workloads.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadAgents()}
            disabled={isLoading}
            className="p-2 rounded-xl text-beige-muted hover:text-beige-text bg-beige-sand/60 hover:bg-beige-sand border border-beige-border transition disabled:opacity-50"
            title="Refresh Agents List"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-beige-terracotta" : ""}`} />
          </button>

          <button
            onClick={() => handleOpenAssign(agents[0] || null)}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-beige-terracotta hover:bg-beige-terracotta/90 text-white shadow-sm flex items-center gap-1.5 transition self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Assign Work</span>
          </button>
        </div>
      </div>

      {/* Success Notification Toast */}
      {toastMessage && (
        <div className="p-3 rounded-xl bg-beige-olive-subtle border border-beige-olive/40 text-xs font-medium text-beige-olive flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{toastMessage}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-beige-olive hover:opacity-70">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Error Alert with Retry */}
      {error && (
        <div className="p-4 rounded-2xl bg-[#FDF2F0] border border-beige-terracotta/40 text-beige-terracotta text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold block">Agent Directory Fetch Failed</span>
              <span>{error}</span>
            </div>
          </div>
          <button
            onClick={() => loadAgents()}
            className="px-3 py-1.5 rounded-xl bg-beige-terracotta text-white font-semibold text-xs hover:bg-beige-terracotta/90 transition shrink-0 self-start sm:self-auto"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-beige-card p-3 rounded-2xl border border-beige-border">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-beige-muted absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder="Search agents by name, ID, territory, or email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSkip(0);
            }}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-beige-bg text-xs text-beige-text placeholder-beige-muted border border-beige-border focus:outline-none focus:border-beige-terracotta"
          />
          {search && (
            <button
              onClick={() => {
                setSearch("");
                setSkip(0);
              }}
              className="absolute right-3 top-2 text-beige-muted hover:text-beige-text"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setSkip(0);
            }}
            className="text-xs rounded-xl bg-beige-bg border border-beige-border px-3 py-1.5 text-beige-text focus:outline-none focus:border-beige-terracotta"
          >
            <option value="all">All Statuses ({totalAgents})</option>
            <option value="active">Active</option>
            <option value="busy">Busy</option>
            <option value="break">On Break</option>
            <option value="inactive">Inactive</option>
          </select>

          {/* Territory Filter */}
          <select
            value={territoryFilter}
            onChange={(e) => {
              setTerritoryFilter(e.target.value);
              setSkip(0);
            }}
            className="text-xs rounded-xl bg-beige-bg border border-beige-border px-3 py-1.5 text-beige-text focus:outline-none focus:border-beige-terracotta"
          >
            <option value="all">All Territories</option>
            {availableTerritories.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Agents Table List */}
      <div className="bg-beige-card border border-beige-border rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-beige-border bg-beige-sand/30 text-beige-muted font-medium">
                <th className="py-3 px-4">Representative</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Territory</th>
                <th className="py-3 px-4">Battery</th>
                <th className="py-3 px-4">Visits Progress</th>
                <th className="py-3 px-4">Last GPS Update</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-beige-border/60">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-beige-muted">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-beige-terracotta" />
                    <span>Loading agents from FastAPI database...</span>
                  </td>
                </tr>
              ) : agents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-beige-muted">
                    <Users className="w-8 h-8 mx-auto mb-2 text-beige-muted/40" />
                    <span className="font-semibold block text-sm text-beige-text">No Agents Found</span>
                    <span className="text-xs text-beige-muted mt-1 block">
                      {search || statusFilter !== "all"
                        ? "Try clearing your search filters to view all agents."
                        : "No agents currently exist in the database."}
                    </span>
                  </td>
                </tr>
              ) : (
                agents.map((agent) => (
                  <tr key={agent.id} className="hover:bg-beige-bg/60 transition group">
                    {/* Agent Identity */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-beige-olive text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                          {agent.initials}
                        </div>
                        <div>
                          <p className="font-semibold text-beige-text text-xs leading-tight">{agent.name}</p>
                          <p className="text-[10px] text-beige-muted mt-0.5 truncate max-w-[160px]">
                            {agent.email}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Operational Status */}
                    <td className="py-3.5 px-4">
                      <StatusBadge status={agent.status} size="sm" />
                    </td>

                    {/* Territory */}
                    <td className="py-3.5 px-4 text-beige-text font-medium">
                      <span className="px-2 py-0.5 rounded-md bg-beige-sand/60 border border-beige-border text-[11px]">
                        {agent.territory}
                      </span>
                    </td>

                    {/* Battery */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5 font-mono text-[11px] text-beige-muted">
                        <Battery
                          className={`w-3.5 h-3.5 ${
                            (agent.batteryLevel || 0) < 25 ? "text-beige-terracotta" : "text-beige-olive"
                          }`}
                        />
                        <span>{agent.batteryLevel}%</span>
                      </div>
                    </td>

                    {/* Task Progress */}
                    <td className="py-3.5 px-4">
                      <div>
                        <div className="flex items-center justify-between text-[11px] mb-1 font-mono text-beige-muted">
                          <span>
                            {agent.completedVisits} / {agent.assignedTasks}
                          </span>
                          <span className="font-bold text-beige-text">
                            {agent.assignedTasks > 0
                              ? `${Math.round((agent.completedVisits / agent.assignedTasks) * 100)}%`
                              : "0%"}
                          </span>
                        </div>
                        <div className="w-24 h-1.5 rounded-full bg-beige-sand overflow-hidden">
                          <div
                            className="h-full bg-beige-olive rounded-full"
                            style={{
                              width: `${
                                agent.assignedTasks > 0
                                  ? (agent.completedVisits / agent.assignedTasks) * 100
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                    </td>

                    {/* Last Update */}
                    <td className="py-3.5 px-4 font-mono text-[11px] text-beige-muted">
                      {agent.lastLocationUpdate}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          onClick={() => setSelectedAgent(agent)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-beige-text bg-beige-sand hover:bg-beige-sidebar border border-beige-border transition"
                        >
                          View Details
                        </button>
                        <button
                          onClick={() => handleOpenAssign(agent)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-white bg-beige-terracotta hover:bg-beige-terracotta/90 transition"
                        >
                          Assign
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalAgents > limit && (
          <div className="p-3 border-t border-beige-border flex items-center justify-between text-xs text-beige-muted bg-beige-sand/20">
            <span>
              Showing {skip + 1}–{Math.min(skip + limit, totalAgents)} of {totalAgents} agents
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSkip(Math.max(0, skip - limit))}
                disabled={skip === 0 || isLoading}
                className="px-3 py-1 rounded-lg bg-beige-card border border-beige-border disabled:opacity-40 hover:bg-beige-sand transition flex items-center gap-1 font-medium"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>
              <span className="font-mono text-beige-text font-semibold px-2">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setSkip(skip + limit)}
                disabled={skip + limit >= totalAgents || isLoading}
                className="px-3 py-1 rounded-lg bg-beige-card border border-beige-border disabled:opacity-40 hover:bg-beige-sand transition flex items-center gap-1 font-medium"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Agent Detail Modal / Drawer */}
      {selectedAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-2xl bg-beige-card border border-beige-border shadow-2xl p-6 overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-beige-border">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-beige-olive text-white flex items-center justify-center font-bold text-base shadow-sm">
                  {selectedAgent.initials}
                </div>
                <div>
                  <h3 className="font-bold text-base text-beige-text">{selectedAgent.name}</h3>
                  <p className="text-xs text-beige-muted">
                    ID: {selectedAgent.id.slice(0, 8)}... • {selectedAgent.territory}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={selectedAgent.status} size="sm" />
                <button
                  onClick={() => setSelectedAgent(null)}
                  className="p-1 rounded-lg text-beige-muted hover:text-beige-text hover:bg-beige-sand"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Profile Content */}
            <div className="py-4 space-y-4 text-xs">
              {/* Contact info grid */}
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-beige-sand/40 border border-beige-border">
                <div className="flex items-center gap-2 text-beige-text">
                  <Phone className="w-3.5 h-3.5 text-beige-muted" />
                  <span>{selectedAgent.phone}</span>
                </div>
                <div className="flex items-center gap-2 text-beige-text">
                  <Mail className="w-3.5 h-3.5 text-beige-muted" />
                  <span className="truncate">{selectedAgent.email}</span>
                </div>
                <div className="flex items-center gap-2 text-beige-text">
                  <Clock className="w-3.5 h-3.5 text-beige-muted" />
                  <span>Last Seen: {selectedAgent.lastLocationUpdate}</span>
                </div>
                <div className="flex items-center gap-2 text-beige-text">
                  <Battery className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Battery: {selectedAgent.batteryLevel}%</span>
                </div>
              </div>

              {/* Current Active Task */}
              <div className="p-3.5 rounded-xl bg-beige-olive-subtle/80 border border-beige-olive/30">
                <span className="font-bold text-beige-olive uppercase text-[10px] tracking-wider block mb-1">
                  Current Status &amp; Tasks
                </span>
                <p className="text-xs font-semibold text-beige-text">{selectedAgent.currentTask}</p>
              </div>

              {/* Performance Stats */}
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 rounded-xl bg-beige-card border border-beige-border">
                  <span className="text-[10px] text-beige-muted uppercase tracking-wider block">Assigned</span>
                  <span className="text-lg font-bold text-beige-text mt-0.5 block">{selectedAgent.assignedTasks}</span>
                </div>
                <div className="p-3 rounded-xl bg-beige-card border border-beige-border">
                  <span className="text-[10px] text-beige-muted uppercase tracking-wider block">Completed</span>
                  <span className="text-lg font-bold text-beige-olive mt-0.5 block">{selectedAgent.completedVisits}</span>
                </div>
                <div className="p-3 rounded-xl bg-beige-card border border-beige-border">
                  <span className="text-[10px] text-beige-muted uppercase tracking-wider block">Completion Pace</span>
                  <span className="text-lg font-bold text-beige-terracotta mt-0.5 block">
                    {selectedAgent.assignedTasks > 0
                      ? `${Math.round((selectedAgent.completedVisits / selectedAgent.assignedTasks) * 100)}%`
                      : "0%"}
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-beige-border flex items-center justify-end gap-2">
              <button
                onClick={() => setSelectedAgent(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-beige-muted hover:text-beige-text hover:bg-beige-sand"
              >
                Close
              </button>
              <button
                onClick={() => {
                  const a = selectedAgent;
                  setSelectedAgent(null);
                  handleOpenAssign(a);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-beige-terracotta hover:bg-beige-terracotta/90 text-white"
              >
                Dispatch New Task
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task Dispatch Modal */}
      <AssignWorkModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        preselectedAgent={assigningAgent}
        onSuccess={(msg) => {
          setToastMessage(msg);
          loadAgents();
        }}
      />
    </div>
  );
}
