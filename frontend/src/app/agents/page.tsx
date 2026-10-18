"use client";

import React, { useState } from "react";
import { mockAgents } from "@/lib/mockData";
import { Agent } from "@/types";
import StatusBadge from "@/components/StatusBadge";
import AssignWorkModal from "@/components/AssignWorkModal";
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
} from "lucide-react";

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>(mockAgents);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [territoryFilter, setTerritoryFilter] = useState("all");
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [assigningAgent, setAssigningAgent] = useState<Agent | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const territories = Array.from(new Set(mockAgents.map((a) => a.territory)));

  const filteredAgents = agents.filter((a) => {
    const matchesSearch =
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.id.toLowerCase().includes(search.toLowerCase()) ||
      a.territory.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || a.status === statusFilter;
    const matchesTerritory = territoryFilter === "all" || a.territory === territoryFilter;
    return matchesSearch && matchesStatus && matchesTerritory;
  });

  const handleOpenAssign = (agent: Agent) => {
    setAssigningAgent(agent);
    setIsAssignModalOpen(true);
  };

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-beige-border/80">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-beige-text tracking-tight">
            Field Agent Directory
          </h2>
          <p className="text-xs text-beige-muted mt-0.5">
            Manage field representatives, operational status, territory coverage, and task workloads.
          </p>
        </div>

        <button
          onClick={() => handleOpenAssign(mockAgents[0])}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-beige-terracotta hover:bg-beige-terracotta-light text-white shadow-sm flex items-center gap-1.5 transition self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Assign Work</span>
        </button>
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

      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-beige-card p-3 rounded-2xl border border-beige-border">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-beige-muted absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder="Search agents by name, ID, territory..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-beige-bg text-xs text-beige-text placeholder-beige-muted border border-beige-border focus:outline-none focus:border-beige-terracotta"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
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
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs rounded-xl bg-beige-bg border border-beige-border px-3 py-1.5 text-beige-text focus:outline-none focus:border-beige-terracotta"
          >
            <option value="all">All Statuses ({agents.length})</option>
            <option value="active">Active</option>
            <option value="busy">Busy</option>
            <option value="break">On Break</option>
            <option value="inactive">Inactive</option>
          </select>

          {/* Territory Filter */}
          <select
            value={territoryFilter}
            onChange={(e) => setTerritoryFilter(e.target.value)}
            className="text-xs rounded-xl bg-beige-bg border border-beige-border px-3 py-1.5 text-beige-text focus:outline-none focus:border-beige-terracotta"
          >
            <option value="all">All Territories</option>
            {territories.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Agents Table */}
      <div className="rounded-2xl bg-beige-card border border-beige-border overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-beige-border bg-beige-sidebar/40 text-beige-muted font-medium">
                <th className="py-3 px-4">Agent Name & ID</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Territory</th>
                <th className="py-3 px-4">Current Task</th>
                <th className="py-3 px-4">Visits (Done/Total)</th>
                <th className="py-3 px-4">Last Update</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-beige-border/60">
              {filteredAgents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-beige-muted">
                    No field agents matching your filter criteria.
                  </td>
                </tr>
              ) : (
                filteredAgents.map((agent) => (
                  <tr key={agent.id} className="hover:bg-beige-bg/70 transition">
                    {/* Agent Name & Avatar */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-beige-olive text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-xs">
                          {agent.initials}
                        </div>
                        <div>
                          <p className="font-semibold text-xs text-beige-text">{agent.name}</p>
                          <p className="text-[10px] text-beige-muted font-mono">{agent.id}</p>
                        </div>
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="py-3.5 px-4">
                      <StatusBadge status={agent.status} size="sm" />
                    </td>

                    {/* Territory */}
                    <td className="py-3.5 px-4 font-medium text-beige-text">
                      {agent.territory}
                    </td>

                    {/* Current Task */}
                    <td className="py-3.5 px-4 text-beige-muted truncate max-w-[220px]">
                      {agent.currentTask || "Idle / Awaiting assignment"}
                    </td>

                    {/* Visits Completed / Total */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-beige-text">
                          {agent.completedVisits} / {agent.assignedTasks}
                        </span>
                        <div className="w-16 h-1.5 rounded-full bg-beige-sand overflow-hidden">
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
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-white bg-beige-terracotta hover:bg-beige-terracotta-light transition"
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
                  <p className="text-xs text-beige-muted">ID: {selectedAgent.id} • {selectedAgent.territory}</p>
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
                  Current Assignment
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
                  <span className="text-[10px] text-beige-muted uppercase tracking-wider block">Geofence Compliance</span>
                  <span className="text-lg font-bold text-beige-terracotta mt-0.5 block">100%</span>
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
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-beige-terracotta hover:bg-beige-terracotta-light text-white"
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
        onSuccess={(msg) => setToastMessage(msg)}
      />
    </div>
  );
}
