"use client";

import React, { useState } from "react";
import { mockAssignments, mockAgents, mockCustomers } from "@/lib/mockData";
import { Assignment, TaskStatus } from "@/types";
import StatusBadge from "@/components/StatusBadge";
import AssignWorkModal from "@/components/AssignWorkModal";
import Link from "next/link";
import {
  CalendarCheck,
  Search,
  Filter,
  Plus,
  Clock,
  MapPin,
  CheckCircle2,
  AlertCircle,
  MoreVertical,
  X,
  ChevronDown,
  Route,
} from "lucide-react";

export default function AssignmentsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>(mockAssignments);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [statusNotification, setStatusNotification] = useState<string | null>(null);

  const filteredAssignments = assignments.filter((a) => {
    const matchesSearch =
      a.customerName.toLowerCase().includes(search.toLowerCase()) ||
      a.agentName.toLowerCase().includes(search.toLowerCase()) ||
      a.address.toLowerCase().includes(search.toLowerCase()) ||
      a.id.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || a.status === statusFilter;
    const matchesAgent = agentFilter === "all" || a.agentName === agentFilter;
    const matchesPriority = priorityFilter === "all" || a.priority === priorityFilter;
    return matchesSearch && matchesStatus && matchesAgent && matchesPriority;
  });

  const handleUpdateStatus = (assignmentId: string, newStatus: TaskStatus) => {
    setAssignments((prev) =>
      prev.map((a) => (a.id === assignmentId ? { ...a, status: newStatus } : a))
    );
    setStatusNotification(`Assignment ${assignmentId} updated to ${newStatus.toUpperCase()}`);
    setTimeout(() => setStatusNotification(null), 3000);
  };

  const uniqueAgents = Array.from(new Set(mockAssignments.map((a) => a.agentName)));

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-beige-border/80">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-beige-text tracking-tight">
            Field Assignments & Tasks
          </h2>
          <p className="text-xs text-beige-muted mt-0.5">
            Monitor visit schedules, dispatch nearest-agent tasks, and inspect real-time progress.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Link
            href="/routes"
            className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-beige-sand hover:bg-beige-sidebar text-beige-text border border-beige-border flex items-center gap-1.5 transition"
          >
            <Route className="w-4 h-4 text-beige-terracotta" />
            <span>Plan Routes</span>
          </Link>

          <button
            onClick={() => setIsAssignModalOpen(true)}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-beige-terracotta hover:bg-beige-terracotta-light text-white shadow-sm flex items-center gap-1.5 transition"
          >
            <Plus className="w-4 h-4" />
            <span>New Task Assignment</span>
          </button>
        </div>
      </div>

      {/* Status Update Toast */}
      {statusNotification && (
        <div className="p-3 rounded-xl bg-beige-olive-subtle border border-beige-olive/40 text-xs font-medium text-beige-olive flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusNotification}</span>
          </div>
          <button onClick={() => setStatusNotification(null)} className="text-beige-olive hover:opacity-70">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3 bg-beige-card p-3 rounded-2xl border border-beige-border">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-beige-muted absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by assignment ID, customer, agent, address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-beige-bg text-xs text-beige-text placeholder-beige-muted border border-beige-border focus:outline-none focus:border-beige-terracotta"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs rounded-xl bg-beige-bg border border-beige-border px-3 py-1.5 text-beige-text focus:outline-none focus:border-beige-terracotta"
          >
            <option value="all">All Statuses ({assignments.length})</option>
            <option value="active">Active Visit</option>
            <option value="assigned">Assigned</option>
            <option value="pending">Pending Queue</option>
            <option value="completed">Completed</option>
            <option value="delayed">Delayed</option>
          </select>

          {/* Agent Filter */}
          <select
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
            className="text-xs rounded-xl bg-beige-bg border border-beige-border px-3 py-1.5 text-beige-text focus:outline-none focus:border-beige-terracotta"
          >
            <option value="all">All Agents</option>
            {uniqueAgents.map((ag) => (
              <option key={ag} value={ag}>
                {ag}
              </option>
            ))}
          </select>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="text-xs rounded-xl bg-beige-bg border border-beige-border px-3 py-1.5 text-beige-text focus:outline-none focus:border-beige-terracotta"
          >
            <option value="all">All Priorities</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>
        </div>
      </div>

      {/* Assignments Table */}
      <div className="rounded-2xl bg-beige-card border border-beige-border overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-beige-border bg-beige-sidebar/40 text-beige-muted font-medium">
                <th className="py-3 px-4">Assignment ID</th>
                <th className="py-3 px-4">Customer Destination</th>
                <th className="py-3 px-4">Assigned Agent</th>
                <th className="py-3 px-4">Scheduled Slot</th>
                <th className="py-3 px-4">Priority</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Quick Status Update</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-beige-border/60">
              {filteredAssignments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-beige-muted">
                    No assignments found matching your filter criteria.
                  </td>
                </tr>
              ) : (
                filteredAssignments.map((asn) => (
                  <tr key={asn.id} className="hover:bg-beige-bg/70 transition">
                    <td className="py-3.5 px-4 font-mono font-semibold text-beige-text text-[11px]">
                      {asn.id}
                    </td>

                    <td className="py-3.5 px-4">
                      <p className="font-semibold text-xs text-beige-text">{asn.customerName}</p>
                      <p className="text-[10px] text-beige-muted truncate max-w-[220px]">
                        {asn.address}
                      </p>
                    </td>

                    <td className="py-3.5 px-4">
                      {asn.agentName !== "Unassigned" ? (
                        <div className="flex items-center gap-1.5 font-medium text-beige-text">
                          <span className="w-2 h-2 rounded-full bg-beige-olive" />
                          <span>{asn.agentName}</span>
                        </div>
                      ) : (
                        <span className="text-beige-muted italic">Unassigned</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1 font-mono text-[11px] text-beige-text">
                        <Clock className="w-3 h-3 text-beige-muted" />
                        <span>{asn.scheduledTime}</span>
                      </div>
                      <span className="text-[10px] text-beige-muted">{asn.scheduledDate}</span>
                    </td>

                    <td className="py-3.5 px-4">
                      <StatusBadge status={asn.priority} size="sm" />
                    </td>

                    <td className="py-3.5 px-4">
                      <StatusBadge status={asn.status} size="sm" />
                    </td>

                    {/* Action dropdown to simulate updating assignment status */}
                    <td className="py-3.5 px-4 text-right">
                      <select
                        value={asn.status}
                        onChange={(e) => handleUpdateStatus(asn.id, e.target.value as TaskStatus)}
                        className="text-[11px] font-medium rounded-lg bg-beige-sand border border-beige-border px-2 py-1 text-beige-text focus:outline-none"
                      >
                        <option value="pending">Mark Pending</option>
                        <option value="assigned">Mark Assigned</option>
                        <option value="active">Mark In Progress</option>
                        <option value="completed">Mark Completed</option>
                        <option value="delayed">Mark Delayed</option>
                      </select>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dispatch Modal */}
      <AssignWorkModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        onSuccess={(msg) => {
          setStatusNotification(msg);
        }}
      />
    </div>
  );
}
