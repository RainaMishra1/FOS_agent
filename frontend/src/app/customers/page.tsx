"use client";

import React, { useState } from "react";
import { mockCustomers, mockAgents } from "@/lib/mockData";
import { Customer } from "@/types";
import StatusBadge from "@/components/StatusBadge";
import AssignWorkModal from "@/components/AssignWorkModal";
import {
  Building2,
  Search,
  Filter,
  Plus,
  MapPin,
  Phone,
  Mail,
  User,
  Calendar,
  X,
  ExternalLink,
  Compass,
} from "lucide-react";

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>(mockCustomers);
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

  const filteredCustomers = customers.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.leadId.toLowerCase().includes(search.toLowerCase()) ||
      c.address.toLowerCase().includes(search.toLowerCase()) ||
      c.company?.toLowerCase().includes(search.toLowerCase());
    const matchesPriority = priorityFilter === "all" || c.priority === priorityFilter;
    const matchesStatus = statusFilter === "all" || c.assignmentStatus === statusFilter;
    return matchesSearch && matchesPriority && matchesStatus;
  });

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-beige-border/80">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-beige-text tracking-tight">
            Customers & Leads Directory
          </h2>
          <p className="text-xs text-beige-muted mt-0.5">
            Geocoded customer destinations, high-priority enterprise leads, and dispatch statuses.
          </p>
        </div>

        <button
          onClick={() => setIsAssignModalOpen(true)}
          className="px-4 py-2 rounded-xl text-xs font-semibold bg-beige-terracotta hover:bg-beige-terracotta-light text-white shadow-sm flex items-center gap-1.5 transition self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>New Customer Lead</span>
        </button>
      </div>

      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-beige-card p-3 rounded-2xl border border-beige-border">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-beige-muted absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by customer name, lead ID, company, address..."
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

        {/* Priority Filter */}
        <div className="flex items-center gap-2">
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

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs rounded-xl bg-beige-bg border border-beige-border px-3 py-1.5 text-beige-text focus:outline-none focus:border-beige-terracotta"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Visit</option>
            <option value="assigned">Assigned</option>
            <option value="pending">Pending Queue</option>
            <option value="completed">Completed</option>
            <option value="delayed">Delayed</option>
          </select>
        </div>
      </div>

      {/* Customers Table */}
      <div className="rounded-2xl bg-beige-card border border-beige-border overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-beige-border bg-beige-sidebar/40 text-beige-muted font-medium">
                <th className="py-3 px-4">Customer / Lead Name</th>
                <th className="py-3 px-4">Lead ID</th>
                <th className="py-3 px-4">Address / City</th>
                <th className="py-3 px-4">Priority</th>
                <th className="py-3 px-4">Dispatch Status</th>
                <th className="py-3 px-4">Assigned Agent</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-beige-border/60">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-beige-muted">
                    No customers found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((cust) => (
                  <tr key={cust.id} className="hover:bg-beige-bg/70 transition">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-beige-terracotta-subtle text-beige-terracotta flex items-center justify-center shrink-0">
                          <Building2 className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-semibold text-xs text-beige-text">{cust.name}</p>
                          <p className="text-[10px] text-beige-muted">{cust.company}</p>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 font-mono text-[11px] text-beige-muted">
                      {cust.leadId}
                    </td>

                    <td className="py-3.5 px-4">
                      <p className="text-beige-text truncate max-w-[200px]">{cust.address}</p>
                      <p className="text-[10px] text-beige-muted">{cust.city}</p>
                    </td>

                    <td className="py-3.5 px-4">
                      <StatusBadge status={cust.priority} size="sm" />
                    </td>

                    <td className="py-3.5 px-4">
                      <StatusBadge status={cust.assignmentStatus} size="sm" />
                    </td>

                    <td className="py-3.5 px-4">
                      {cust.assignedAgentName ? (
                        <div className="flex items-center gap-1.5 font-medium text-beige-text">
                          <span className="w-2 h-2 rounded-full bg-beige-olive" />
                          <span>{cust.assignedAgentName}</span>
                        </div>
                      ) : (
                        <span className="text-beige-muted italic">Unassigned</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => setSelectedCustomer(cust)}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-beige-text bg-beige-sand hover:bg-beige-sidebar border border-beige-border transition"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer Detail Drawer / Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-2xl bg-beige-card border border-beige-border shadow-2xl p-6 overflow-hidden">
            <div className="flex items-start justify-between pb-4 border-b border-beige-border">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-beige-terracotta text-white flex items-center justify-center shadow-sm">
                  <Building2 className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-beige-text">{selectedCustomer.name}</h3>
                  <p className="text-xs text-beige-muted">Lead ID: {selectedCustomer.leadId} • {selectedCustomer.company}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={selectedCustomer.assignmentStatus} size="sm" />
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="p-1 rounded-lg text-beige-muted hover:text-beige-text hover:bg-beige-sand"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="py-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-beige-sand/40 border border-beige-border">
                <div className="flex items-center gap-2 text-beige-text">
                  <Phone className="w-3.5 h-3.5 text-beige-muted" />
                  <span>{selectedCustomer.phone}</span>
                </div>
                <div className="flex items-center gap-2 text-beige-text">
                  <Mail className="w-3.5 h-3.5 text-beige-muted" />
                  <span className="truncate">{selectedCustomer.email}</span>
                </div>
                <div className="flex items-center gap-2 text-beige-text col-span-2">
                  <MapPin className="w-3.5 h-3.5 text-beige-terracotta shrink-0" />
                  <span>{selectedCustomer.address}, {selectedCustomer.city}</span>
                </div>
              </div>

              {/* Geographic Coordinates Preview */}
              <div className="p-3.5 rounded-xl bg-beige-sand/60 border border-beige-border space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-beige-text text-[11px] flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-beige-terracotta" /> Geocoded Coordinates
                  </span>
                  <span className="font-mono text-[11px] text-beige-muted">
                    {selectedCustomer.coordinates.lat.toFixed(4)}°N, {selectedCustomer.coordinates.lng.toFixed(4)}°E
                  </span>
                </div>
                <div className="h-20 w-full rounded-lg bg-[#EBE4D5] border border-beige-border flex items-center justify-center relative overflow-hidden">
                  <div className="absolute inset-0 opacity-40 bg-[radial-gradient(#CFC3AF_1px,transparent_1px)] [background-size:12px_12px]" />
                  <div className="z-10 flex items-center gap-2 px-3 py-1 rounded-lg bg-beige-card/90 border border-beige-border shadow-xs">
                    <MapPin className="w-4 h-4 text-beige-terracotta" />
                    <span className="font-semibold text-xs text-beige-text">{selectedCustomer.name}</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {selectedCustomer.notes && (
                <div className="p-3 rounded-xl bg-beige-bg border border-beige-border">
                  <span className="font-semibold text-beige-text block mb-1">Dispatch Notes:</span>
                  <p className="text-beige-muted">{selectedCustomer.notes}</p>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-beige-border flex items-center justify-end gap-2">
              <button
                onClick={() => setSelectedCustomer(null)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-beige-muted hover:text-beige-text hover:bg-beige-sand"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setSelectedCustomer(null);
                  setIsAssignModalOpen(true);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-beige-terracotta hover:bg-beige-terracotta-light text-white"
              >
                Dispatch Agent
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task Dispatch Modal */}
      <AssignWorkModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
      />
    </div>
  );
}
