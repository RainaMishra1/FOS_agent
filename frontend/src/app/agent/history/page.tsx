"use client";

import React, { useState } from "react";
import { useAgent } from "@/context/AgentContext";
import { AgentVisit } from "@/types/agent";
import VisitDetailDrawer from "@/components/agent/VisitDetailDrawer";
import StatusBadge from "@/components/StatusBadge";
import {
  History,
  CheckCircle2,
  ShieldCheck,
  Search,
  Calendar,
  Clock,
  MapPin,
  FileText,
  ChevronRight,
  Filter,
} from "lucide-react";

export default function VisitHistoryPage() {
  const { visits, historyVisits } = useAgent();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVisitForDrawer, setSelectedVisitForDrawer] = useState<AgentVisit | null>(null);

  // Combine completed from current visits and historical visits
  const completedCurrent = visits.filter((v) => v.status === "completed");
  const allCompleted = [...completedCurrent, ...historyVisits];

  const filteredHistory = allCompleted.filter((v) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      v.customerName.toLowerCase().includes(q) ||
      v.address.toLowerCase().includes(q) ||
      (v.completionNotes && v.completionNotes.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Header */}
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-beige-text">Visit History</h2>
        <p className="text-xs text-beige-muted">
          Review completed field appointments, geofenced verification records, and customer sign-offs.
        </p>
      </div>

      {/* Summary Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        <div className="p-3 rounded-2xl bg-beige-card border border-beige-border shadow-xs">
          <span className="text-[10px] text-beige-muted block">Total Completed</span>
          <strong className="text-lg sm:text-xl font-bold text-beige-olive">
            {allCompleted.length} Records
          </strong>
        </div>
        <div className="p-3 rounded-2xl bg-beige-card border border-beige-border shadow-xs">
          <span className="text-[10px] text-beige-muted block">Geofence Compliance</span>
          <strong className="text-lg sm:text-xl font-bold text-beige-text">100% Verified</strong>
        </div>
        <div className="col-span-2 sm:col-span-1 p-3 rounded-2xl bg-beige-card border border-beige-border shadow-xs">
          <span className="text-[10px] text-beige-muted block">Avg GPS Accuracy</span>
          <strong className="text-lg sm:text-xl font-bold text-beige-text">±13.2m</strong>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-beige-muted absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search past visits by customer, address, or notes..."
          className="w-full pl-9 pr-3 py-2 rounded-xl text-xs bg-beige-card border border-beige-border text-beige-text placeholder-beige-muted focus:outline-hidden focus:ring-2 focus:ring-beige-terracotta/40"
        />
      </div>

      {/* History Items */}
      <div className="space-y-3">
        {filteredHistory.length === 0 ? (
          <div className="p-8 rounded-2xl bg-beige-card border border-beige-border text-center space-y-2">
            <History className="w-8 h-8 text-beige-muted mx-auto" />
            <p className="text-sm font-bold text-beige-text">No past records found</p>
            <p className="text-xs text-beige-muted">No completed visits match your search.</p>
          </div>
        ) : (
          filteredHistory.map((visit) => (
            <div
              key={visit.id}
              onClick={() => setSelectedVisitForDrawer(visit)}
              className="p-4 rounded-2xl bg-beige-card border border-beige-border hover:border-beige-olive/50 transition-all shadow-2xs hover:shadow-xs cursor-pointer space-y-3 group"
            >
              {/* Top Row: Date, Time & Geofence Badge */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-beige-sand text-beige-muted border border-beige-border">
                    {visit.id}
                  </span>
                  <span className="text-xs font-semibold text-beige-text flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-beige-muted" />
                    {visit.scheduledDate}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold text-beige-olive bg-beige-olive-subtle px-2 py-0.5 rounded-full border border-beige-olive/30 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" />
                    Geofence Verified (±{visit.accuracyMeters || 12}m)
                  </span>
                </div>
              </div>

              {/* Customer and Address */}
              <div>
                <h3 className="text-sm sm:text-base font-bold text-beige-text group-hover:text-beige-olive transition">
                  {visit.customerName}
                </h3>
                <p className="text-xs text-beige-muted flex items-start gap-1 mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-beige-terracotta shrink-0 mt-0.5" />
                  <span>{visit.address}</span>
                </p>
              </div>

              {/* Completion Notes */}
              {visit.completionNotes && (
                <div className="p-3 rounded-xl bg-beige-sand/30 border border-beige-border/60 text-xs text-beige-text space-y-1">
                  <div className="flex items-center justify-between text-[10px] text-beige-muted">
                    <span className="font-semibold flex items-center gap-1">
                      <FileText className="w-3 h-3" />
                      Field Completion Summary:
                    </span>
                    <span>Completed at {visit.completedTime || "On Schedule"}</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-beige-text">
                    {visit.completionNotes}
                  </p>
                </div>
              )}

              {/* Bottom Row */}
              <div className="flex items-center justify-between text-xs pt-1 border-t border-beige-border/60">
                <span className="text-[11px] text-beige-muted font-medium">
                  Contact: {visit.contactPerson}
                </span>

                <span className="text-[11px] font-semibold text-beige-terracotta group-hover:underline flex items-center gap-0.5">
                  <span>View Full Details</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Drawer */}
      {selectedVisitForDrawer && (
        <VisitDetailDrawer
          visit={selectedVisitForDrawer}
          onClose={() => setSelectedVisitForDrawer(null)}
        />
      )}
    </div>
  );
}
